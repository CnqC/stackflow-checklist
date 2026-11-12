import { adminClient, corsHeaders, json } from '../_shared/common.ts';

type DeviceRequest = {
  roomCode?: string;
  pinCode?: string;
  memberId?: string;
  platform?: 'android' | 'web';
  token?: string;
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST' && request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405);
  try {
    const body = await request.json() as DeviceRequest;
    const roomCode = body.roomCode?.trim().toUpperCase();
    const pinCode = body.pinCode?.trim();
    const memberId = body.memberId?.trim();
    const platform = body.platform;
    const token = body.token?.trim();
    if (!roomCode || !pinCode || !memberId || !token || token.length > 4096 ||
        (platform !== 'android' && platform !== 'web')) {
      return json({ error: 'Invalid device registration' }, 400);
    }
    if (platform === 'web' && (body.subscription?.endpoint !== token ||
        !body.subscription.keys?.p256dh || !body.subscription.keys.auth)) {
      return json({ error: 'Invalid web push subscription' }, 400);
    }

    const admin = adminClient();
    const { data: workspace, error: workspaceError } = await admin.from('workspaces')
      .select('id').eq('code', roomCode).eq('pin_code', pinCode).maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace) return json({ error: 'Room credentials are invalid' }, 403);
    const { data: member, error: memberError } = await admin.from('members')
      .select('id').eq('id', memberId).eq('workspace_id', workspace.id).maybeSingle();
    if (memberError) throw memberError;
    if (!member) return json({ error: 'Member is not in this room' }, 403);

    if (request.method === 'DELETE') {
      const { error } = await admin.from('push_devices').delete()
        .eq('workspace_id', workspace.id).eq('member_id', memberId)
        .eq('platform', platform).eq('token', token);
      if (error) throw error;
      return json({ ok: true });
    }

    const { error } = await admin.from('push_devices').upsert({
      workspace_id: workspace.id,
      member_id: memberId,
      platform,
      token,
      subscription: platform === 'web' ? body.subscription : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform,token' });
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    console.error('push-device:', error);
    return json({ error: 'Device registration failed' }, 500);
  }
});
