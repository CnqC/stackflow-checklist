import webpush from 'npm:web-push@3.6.7';
import { adminClient, json } from '../_shared/common.ts';

type AssignmentEvent = {
  id: string;
  workspace_id: string;
  member_id: string;
  task_id: string;
  kind: 'task_assigned' | 'subtask_assigned';
  actor_name: string;
  task_title: string;
  subtask_title: string | null;
  stack_id: string;
};

type Device = { id: string; platform: 'android' | 'web'; token: string; subscription: unknown };

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function firebaseAccessToken(): Promise<{ token: string; projectId: string }> {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('Firebase service account is not configured');
  const account = JSON.parse(raw) as { client_email: string; private_key: string; project_id: string };
  const pem = account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(pem);
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(new TextEncoder().encode(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const unsigned = `${header}.${claims}`;
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(unsigned))));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new Error(`Firebase token request failed: ${response.status}`);
  const result = await response.json() as { access_token: string };
  return { token: result.access_token, projectId: account.project_id };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || request.headers.get('x-stackflow-webhook-secret') !== secret) {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const payload = await request.json() as { type?: string; record?: { id?: string } };
    if (payload.type !== 'INSERT' || !payload.record?.id) return json({ error: 'Invalid event' }, 400);
    const admin = adminClient();
    const { data: event, error: eventError } = await admin.from('assignment_push_events')
      .select('*').eq('id', payload.record.id).is('sent_at', null).maybeSingle();
    if (eventError) throw eventError;
    if (!event) return json({ ok: true, skipped: true });
    const assignment = event as AssignmentEvent;
    const [{ data: devices, error: devicesError }, { data: stack }] = await Promise.all([
      admin.from('push_devices').select('id,platform,token,subscription')
        .eq('workspace_id', assignment.workspace_id).eq('member_id', assignment.member_id),
      admin.from('stacks').select('title').eq('id', assignment.stack_id).maybeSingle(),
    ]);
    if (devicesError) throw devicesError;
    const title = `${assignment.actor_name} giao việc cho bạn`;
    const detail = assignment.kind === 'subtask_assigned'
      ? `${assignment.subtask_title} · ${assignment.task_title}` : assignment.task_title;
    const body = stack?.title ? `${detail} · ${stack.title}` : detail;
    const data = {
      noticeId: assignment.id,
      workspaceId: assignment.workspace_id,
      targetMemberId: assignment.member_id,
      taskId: assignment.task_id,
      kind: assignment.kind,
      actorName: assignment.actor_name,
      taskTitle: assignment.task_title,
      subtaskTitle: assignment.subtask_title ?? '',
      createdAt: new Date((event as AssignmentEvent & { created_at: string }).created_at).toISOString(),
    };
    let firebase: Awaited<ReturnType<typeof firebaseAccessToken>> | null = null;
    let webReady = false;
    const failures: string[] = [];
    for (const device of (devices ?? []) as Device[]) {
      try {
        if (device.platform === 'android') {
          firebase ??= await firebaseAccessToken();
          const response = await fetch(`https://fcm.googleapis.com/v1/projects/${firebase.projectId}/messages:send`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${firebase.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: {
              token: device.token,
              notification: { title, body },
              data,
              android: { priority: 'high', notification: {
                channel_id: 'stackflow_assignments_push_v1', sound: 'default', tag: assignment.id,
              } },
            } }),
          });
          if (!response.ok) throw new Error(`FCM ${response.status}: ${(await response.text()).slice(0, 300)}`);
        } else {
          if (!webReady) {
            const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY');
            const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY');
            if (!publicKey || !privateKey) throw new Error('Web Push keys are not configured');
            const contact = Deno.env.get('WEB_PUSH_CONTACT');
            if (!contact) throw new Error('Web Push contact is not configured');
            webpush.setVapidDetails(contact, publicKey, privateKey);
            webReady = true;
          }
          await webpush.sendNotification(device.subscription as Parameters<typeof webpush.sendNotification>[0],
            JSON.stringify({ title, body, data }), { TTL: 86400 });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${device.platform}:${message}`);
        if (/FCM 404|FCM 400|statusCode.*(404|410)/.test(message)) {
          await admin.from('push_devices').delete().eq('id', device.id);
        }
      }
    }
    const { error: updateError } = await admin.from('assignment_push_events').update({
      sent_at: failures.length === 0 ? new Date().toISOString() : null,
      last_error: failures.length ? failures.join('; ').slice(0, 1000) : null,
    }).eq('id', assignment.id);
    if (updateError) throw updateError;
    return json({ ok: failures.length === 0, devices: devices?.length ?? 0, failures: failures.length },
      failures.length ? 502 : 200);
  } catch (error) {
    console.error('push-send:', error);
    return json({ error: 'Push delivery failed' }, 500);
  }
});
