import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  member: '00000000-0000-4000-8000-000000000002',
  outsider: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
  linkJoiner: '00000000-0000-4000-8000-000000000005',
  decliner: '00000000-0000-4000-8000-000000000006',
};

async function asUser(userId, action) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: userId, role: 'authenticated' })],
    );
    const result = await action();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

async function expectDenied(action) {
  await assert.rejects(action);
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (
      id uuid primary key, email text not null,
      email_confirmed_at timestamptz,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
        nullif(current_setting('request.jwt.claim.sub', true), '')
      )::uuid;
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create publication supabase_realtime;
  `);

  const schema = readFileSync(new URL('../supabase/migrations/202611130001_fresh_account_schema.sql', import.meta.url), 'utf8');
  await db.exec(schema.replace('create extension if not exists pgcrypto;', ''));
  const assignmentGuard = readFileSync(new URL('../supabase/migrations/202611130002_lock_assignee_writes.sql', import.meta.url), 'utf8');
  await db.exec(assignmentGuard);
  const memberManagement = readFileSync(new URL('../supabase/migrations/202611130003_manage_project_members.sql', import.meta.url), 'utf8');
  await db.exec(memberManagement);
  const taskLinks = readFileSync(new URL('../supabase/migrations/202611130004_task_links.sql', import.meta.url), 'utf8');
  await db.exec(taskLinks);
  const sequentialCompletion = readFileSync(new URL('../supabase/migrations/202611130005_sequential_completion.sql', import.meta.url), 'utf8');
  await db.exec(sequentialCompletion);
  const activityLogs = readFileSync(new URL('../supabase/migrations/202611130006_activity_logs.sql', import.meta.url), 'utf8');
  await db.exec(activityLogs);
  const assignmentNotices = readFileSync(new URL('../supabase/migrations/202611130007_assignment_notices.sql', import.meta.url), 'utf8');
  await db.exec(assignmentNotices);
  const stackOrder = readFileSync(new URL('../supabase/migrations/202611130008_stack_order.sql', import.meta.url), 'utf8');
  await db.exec(stackOrder);
  const taskOrder = readFileSync(new URL('../supabase/migrations/202611130009_task_order.sql', import.meta.url), 'utf8');
  await db.exec(taskOrder);
  const stackCreationPriority = readFileSync(new URL('../supabase/migrations/202611130010_stack_creation_priority.sql', import.meta.url), 'utf8');
  await db.exec(stackCreationPriority);
  const v2MemberCollaboration = readFileSync(new URL('../supabase/migrations/202611130011_v2_member_collaboration.sql', import.meta.url), 'utf8');
  await db.exec(v2MemberCollaboration);
  const v2TeamInvitesAndProfiles = readFileSync(new URL('../supabase/migrations/202611160001_v2_team_invites_and_profiles.sql', import.meta.url), 'utf8');
  await db.exec(v2TeamInvitesAndProfiles);
  const v3JwtClaimsAndRealtimeSync = readFileSync(new URL('../supabase/migrations/202611160002_fix_jwt_claims_and_realtime_sync.sql', import.meta.url), 'utf8');
  await db.exec(v3JwtClaimsAndRealtimeSync);

  for (const [name, id] of Object.entries(ids)) {
    await db.query(
      'insert into auth.users(id, email, email_confirmed_at, raw_user_meta_data) values ($1, $2, now(), $3)',
      [id, `${name}@example.com`, JSON.stringify({ full_name: name })],
    );
  }
  await db.query('insert into private.global_admins(user_id) values ($1)', [ids.admin]);

  const created = await asUser(ids.owner, () => db.query(
    "select public.create_project('TEAM', 'Team project') as id",
  ));
  const projectId = created.rows[0].id;
  assert.equal((await asUser(ids.outsider, () => db.query(
    'select count(*)::int as n from public.projects',
  ))).rows[0].n, 0);
  assert.equal((await asUser(ids.admin, () => db.query(
    'select count(*)::int as n from public.projects',
  ))).rows[0].n, 1);
  await expectDenied(() => asUser(ids.admin, () => db.query(
    'insert into public.stacks(project_id,title) values ($1,$2)', [projectId, 'Denied'],
  )));

  const invite = await asUser(ids.owner, () => db.query(
    'select public.invite_project_member($1,$2) as id', [projectId, 'member@example.com'],
  ));
  await expectDenied(() => asUser(ids.outsider, () => db.query(
    'select public.accept_project_invitation($1)', [invite.rows[0].id],
  )));
  await asUser(ids.member, () => db.query(
    'select public.accept_project_invitation($1)', [invite.rows[0].id],
  ));
  const memberBeforeTransfer = await asUser(ids.owner, () => db.query(
    'select id from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.member],
  ));
  const ownerBeforeTransfer = await asUser(ids.owner, () => db.query(
    'select public.my_member_id($1) as id', [projectId],
  ));
  await expectDenied(() => asUser(ids.member, () => db.query(
    'select public.set_project_member_active($1,$2,false)',
    [projectId, memberBeforeTransfer.rows[0].id],
  )));
  await expectDenied(() => asUser(ids.owner, () => db.query(
    'select public.set_project_member_active($1,$2,false)',
    [projectId, ownerBeforeTransfer.rows[0].id],
  )));

  const stack = await asUser(ids.owner, () => db.query(
    'insert into public.stacks(project_id,title) values ($1,$2) returning id',
    [projectId, 'Work'],
  ));
  const member = await asUser(ids.owner, () => db.query(
    'select id from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.member],
  ));
  const task = await asUser(ids.owner, () => db.query(
    "select public.create_task_with_assignees($1,$2,'Task','', 'medium', null, $3::uuid[]) as id",
    [projectId, stack.rows[0].id, [member.rows[0].id]],
  ));
  const taskId = task.rows[0].id;
  await asUser(ids.member, () => db.query(
    "update public.tasks set notes='Team edit' where id=$1", [taskId],
  ));
  assert.equal((await asUser(ids.owner, () => db.query(
    'select notes from public.tasks where id=$1', [taskId],
  ))).rows[0].notes, 'Team edit');
  const memberNotice = await asUser(ids.member, () => db.query(
    'select id, kind from public.assignment_notices where project_id=$1', [projectId],
  ));
  assert.equal(memberNotice.rows.length, 1, 'assignee must receive a notice');
  assert.equal(memberNotice.rows[0].kind, 'task_assigned');
  assert.equal((await asUser(ids.outsider, () => db.query(
    'select count(*)::int as n from public.assignment_notices where project_id=$1', [projectId],
  ))).rows[0].n, 0, 'outsider must not see notices');
  await expectDenied(() => asUser(ids.owner, () => db.query(
    'select public.mark_assignment_notice_read($1)', [memberNotice.rows[0].id],
  )));
  await asUser(ids.member, () => db.query(
    'select public.mark_assignment_notice_read($1)', [memberNotice.rows[0].id],
  ));
  assert.ok((await asUser(ids.owner, () => db.query(
    "select count(*)::int as n from public.activity_logs where project_id=$1 and action_type='create_task'",
    [projectId],
  ))).rows[0].n >= 1, 'task creation must be recorded');
  assert.equal((await asUser(ids.outsider, () => db.query(
    'select count(*)::int as n from public.activity_logs where project_id=$1', [projectId],
  ))).rows[0].n, 0, 'outsider must not read activity');
  await expectDenied(() => asUser(ids.member, () => db.query(
    "insert into public.activity_logs(project_id,actor_name,action_type,target_title) values ($1,'fake','check','Task')",
    [projectId],
  )));
  const ownerMember = await asUser(ids.owner, () => db.query(
    'select id from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.owner],
  ));

  const link = await asUser(ids.owner, () => db.query(
    "insert into public.task_links(project_id,task_id,label,url) values ($1,$2,'Design','https://example.com/design') returning id",
    [projectId, taskId],
  ));
  await asUser(ids.member, () => db.query(
    "update public.task_links set label='Team link' where id=$1", [link.rows[0].id],
  ));
  assert.equal((await asUser(ids.outsider, () => db.query(
    'select count(*)::int as n from public.task_links where project_id=$1', [projectId],
  ))).rows[0].n, 0);
  assert.equal((await asUser(ids.admin, () => db.query(
    'select count(*)::int as n from public.task_links where project_id=$1', [projectId],
  ))).rows[0].n, 1);
  assert.equal((await asUser(ids.admin, () => db.query(
    'delete from public.task_links where id=$1 returning id', [link.rows[0].id],
  ))).rows.length, 0, 'admin must not delete a task link');

  await expectDenied(() => asUser(ids.member, () => db.query(
    'insert into public.task_assignees(task_id,member_id,project_id) values ($1,$2,$3)',
    [taskId, ownerMember.rows[0].id, projectId],
  )));
  await expectDenied(() => asUser(ids.owner, () => db.query(
    'insert into public.task_assignees(task_id,member_id,project_id) values ($1,$2,$3)',
    [taskId, ownerMember.rows[0].id, projectId],
  )));
  const subtask = await asUser(ids.owner, () => db.query(
    "insert into public.subtasks(task_id,project_id,title,assignee_member_id) values ($1,$2,'Member part',$3) returning id",
    [taskId, projectId, member.rows[0].id],
  ));
  await expectDenied(() => asUser(ids.owner, () => db.query(
    'update public.subtasks set completed=true where id=$1', [subtask.rows[0].id],
  )));
  await asUser(ids.member, () => db.query(
    'update public.subtasks set completed=true where id=$1', [subtask.rows[0].id],
  ));

  await expectDenied(() => asUser(ids.owner, () => db.query(
    'update public.tasks set completed=true where id=$1', [taskId],
  )));
  const laterTask = await asUser(ids.owner, () => db.query(
    "select public.create_task_with_assignees($1,$2,'Later','', 'medium', null, $3::uuid[]) as id",
    [projectId, stack.rows[0].id, [member.rows[0].id]],
  ));
  await asUser(ids.owner, () => db.query(
    'update public.tasks set position=1 where id=$1', [laterTask.rows[0].id],
  ));
  await asUser(ids.owner, () => db.query(
    'update public.stacks set sequential_lock=true where id=$1', [stack.rows[0].id],
  ));
  await expectDenied(() => asUser(ids.member, () => db.query(
    'update public.tasks set completed=true where id=$1', [laterTask.rows[0].id],
  )));
  const taskVersionBeforeCompletion = (await asUser(ids.member, () => db.query(
    'select version from public.tasks where id=$1', [taskId],
  ))).rows[0].version;
  await asUser(ids.member, () => db.query(
    'update public.tasks set completed=true where id=$1 and version=$2 returning version', [taskId, taskVersionBeforeCompletion],
  ));
  await asUser(ids.member, () => db.query(
    'update public.tasks set completed=true where id=$1', [laterTask.rows[0].id],
  ));
  const second = await asUser(ids.member, () => db.query(
    'update public.tasks set completed=false where id=$1 and version=1 returning version', [taskId],
  ));
  assert.equal(second.rows.length, 0, 'stale version must not overwrite a task');

  const adminWrite = await asUser(ids.admin, () => db.query(
    'update public.tasks set completed=false where id=$1 returning id', [taskId],
  ));
  assert.equal(adminWrite.rows.length, 0, 'admin must not write tasks');
  const adminInfo = await asUser(ids.admin, () => db.query(
    "select public.update_project_info($1, 'Reviewed project', '', 1) as version", [projectId],
  ));
  assert.equal(adminInfo.rows[0].version, 2);
  const adminSubtaskWrite = await asUser(ids.admin, () => db.query(
    'update public.subtasks set completed=false where id=$1 returning id', [subtask.rows[0].id],
  ));
  assert.equal(adminSubtaskWrite.rows.length, 0, 'admin must not write subtasks');
  assert.equal((await asUser(ids.admin, () => db.query(
    'select count(*)::int as n from public.project_members where user_id=$1', [ids.admin],
  ))).rows[0].n, 0);

  await asUser(ids.owner, () => db.query(
    'select public.set_project_member_active($1,$2,false)',
    [projectId, member.rows[0].id],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select count(*)::int as n from public.projects where id=$1', [projectId],
  ))).rows[0].n, 0, 'inactive member must lose project access');
  await asUser(ids.admin, () => db.query(
    'select public.set_project_member_active($1,$2,true)',
    [projectId, member.rows[0].id],
  ));
  await asUser(ids.owner, () => db.query(
    'select public.transfer_project_owner($1,$2)',
    [projectId, member.rows[0].id],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select access_role from public.project_members where id=$1', [member.rows[0].id],
  ))).rows[0].access_role, 'owner');
  const laterVersion = (await asUser(ids.member, () => db.query(
    'select version from public.tasks where id=$1', [laterTask.rows[0].id],
  ))).rows[0].version;
  await asUser(ids.member, () => db.query(
    "select public.move_task($1,'up',$2)", [laterTask.rows[0].id, laterVersion],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select id from public.tasks where stack_id=$1 order by position limit 1', [stack.rows[0].id],
  ))).rows[0].id, laterTask.rows[0].id);
  const laterStack = await asUser(ids.member, () => db.query(
    "select public.create_stack($1,'Later Stack') as id", [projectId],
  ));
  await expectDenied(() => asUser(ids.outsider, () => db.query(
    "select public.create_stack($1,'Intrusion')", [projectId],
  )));
  await asUser(ids.member, () => db.query(
    "select public.move_stack($1,'up',1)", [laterStack.rows[0].id],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select id from public.stacks where project_id=$1 order by position limit 1', [projectId],
  ))).rows[0].id, laterStack.rows[0].id);

  const configuredStack = await asUser(ids.member, () => db.query(
    "select public.create_stack($1,'Release','Launch plan','#ec4899',true,'high') as id", [projectId],
  ));
  assert.deepEqual((await asUser(ids.member, () => db.query(
    'select description,color,sequential_lock,priority from public.stacks where id=$1',
    [configuredStack.rows[0].id],
  ))).rows[0], {
    description: 'Launch plan', color: '#ec4899', sequential_lock: true, priority: 'high',
  });
  await asUser(ids.member, () => db.query(
    "update public.stacks set priority='low' where id=$1", [configuredStack.rows[0].id],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select priority from public.stacks where id=$1', [configuredStack.rows[0].id],
  ))).rows[0].priority, 'low');
  await expectDenied(() => asUser(ids.outsider, () => db.query(
    "select public.create_stack($1,'Intrusion','','#6366f1',false,'high')", [projectId],
  )));
  await expectDenied(() => asUser(ids.member, () => db.query(
    "select public.create_stack($1,'Invalid','','red',false,'high')", [projectId],
  )));

  // V2 Multi-Channel Invites, Quick Join Link & Member Profile tests (member is current owner after transfer)
  const linkInfo = (await asUser(ids.member, () => db.query(
    'select * from public.get_project_join_link($1)', [projectId],
  ))).rows[0];
  assert.match(linkInfo.join_code, /^SF-[A-Z0-9]{6}$/);
  assert.equal(linkInfo.enabled, true);

  await expectDenied(() => asUser(ids.outsider, () => db.query(
    'select * from public.get_project_join_link($1)', [projectId],
  )));
  await expectDenied(() => asUser(ids.admin, () => db.query(
    'select public.join_project_by_code($1)', [linkInfo.join_code],
  )));

  const preview = (await asUser(ids.linkJoiner, () => db.query(
    'select * from public.preview_project_by_join_code($1)', [linkInfo.join_code.toLowerCase()],
  ))).rows[0];
  assert.equal(preview.project_id, projectId);
  assert.equal(preview.already_member, false);

  const joinedProjectId = (await asUser(ids.linkJoiner, () => db.query(
    "select public.join_project_by_code($1, 'UI/UX Designer') as id", [linkInfo.join_code],
  ))).rows[0].id;
  assert.equal(joinedProjectId, projectId);

  const joinedMember = (await asUser(ids.linkJoiner, () => db.query(
    'select job_title, avatar_color from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.linkJoiner],
  ))).rows[0];
  assert.equal(joinedMember.job_title, 'UI/UX Designer');
  assert.match(joinedMember.avatar_color, /^#[0-9a-fA-F]{6}$/);

  await asUser(ids.linkJoiner, () => db.query(
    "select public.update_my_project_profile($1, 'Linh Design', 'Lead Designer', '#ec4899')",
    [projectId],
  ));
  const updatedProfile = (await asUser(ids.linkJoiner, () => db.query(
    'select display_name, job_title, avatar_color from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.linkJoiner],
  ))).rows[0];
  assert.deepEqual(updatedProfile, {
    display_name: 'Linh Design',
    job_title: 'Lead Designer',
    avatar_color: '#ec4899',
  });

  // Disable join link -> outsider cannot join; regenerate -> new code works when enabled
  await asUser(ids.member, () => db.query(
    "select * from public.configure_project_join_link($1, false, false, 'QA Tester', 7)",
    [projectId],
  ));
  await expectDenied(() => asUser(ids.outsider, () => db.query(
    'select public.join_project_by_code($1)', [linkInfo.join_code],
  )));
  const rotatedLink = (await asUser(ids.member, () => db.query(
    'select * from public.configure_project_join_link($1, true, true, null, 0)',
    [projectId],
  ))).rows[0];
  assert.notEqual(rotatedLink.join_code, linkInfo.join_code);
  assert.equal(rotatedLink.default_job_title, 'QA Tester');
  assert.equal(rotatedLink.expires_at, null);

  // Paused member must NOT bypass deactivation via join_code
  const linkJoinerMemberId = (await asUser(ids.member, () => db.query(
    'select id from public.project_members where project_id=$1 and user_id=$2',
    [projectId, ids.linkJoiner],
  ))).rows[0].id;
  await asUser(ids.member, () => db.query(
    'select public.set_project_member_active($1, $2, false)',
    [projectId, linkJoinerMemberId],
  ));
  await expectDenied(() => asUser(ids.linkJoiner, () => db.query(
    'select public.join_project_by_code($1)', [rotatedLink.join_code],
  )));

  // Pending email invite list, revoke & decline
  const outsiderInviteId = (await asUser(ids.member, () => db.query(
    "select public.invite_project_member($1, 'outsider@example.com', 'Backend') as id",
    [projectId],
  ))).rows[0].id;
  const declinerInviteId = (await asUser(ids.member, () => db.query(
    "select public.invite_project_member($1, 'decliner@example.com', 'Frontend') as id",
    [projectId],
  ))).rows[0].id;
  const pendingList = (await asUser(ids.member, () => db.query(
    'select * from public.list_project_pending_invitations($1)', [projectId],
  ))).rows;
  assert.equal(pendingList.length, 2);
  await asUser(ids.member, () => db.query(
    'select public.revoke_project_invitation($1)', [outsiderInviteId],
  ));
  await expectDenied(() => asUser(ids.outsider, () => db.query(
    'select public.accept_project_invitation($1)', [outsiderInviteId],
  )));
  await asUser(ids.decliner, () => db.query(
    'select public.decline_project_invitation($1)', [declinerInviteId],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select count(*)::int as n from public.list_project_pending_invitations($1)', [projectId],
  ))).rows[0].n, 0);

  // Owner updates another member's role & join_member activity was logged
  await asUser(ids.member, () => db.query(
    "select public.update_project_member_role($1, $2, 'Senior Architect')",
    [projectId, ownerMember.rows[0].id],
  ));
  assert.ok((await asUser(ids.member, () => db.query(
    "select count(*)::int as n from public.activity_logs where project_id=$1 and action_type='join_member'",
    [projectId],
  ))).rows[0].n >= 2, 'join_member activity must be recorded');

  // Verify rich create_task activity detail, diff-based set_task_assignees, and status <-> completed sync
  const createdActivity = (await asUser(ids.member, () => db.query(
    "select actor_name, detail from public.activity_logs where project_id=$1 and action_type='create_task' and target_title='Task' limit 1",
    [projectId],
  ))).rows[0];
  assert.equal(createdActivity.actor_name, 'owner');
  assert.match(createdActivity.detail, /Giao cho: member/);

  const statusSyncStack = (await asUser(ids.member, () => db.query(
    "select public.create_stack($1,'SyncCheck') as id", [projectId],
  ))).rows[0].id;
  const syncTaskId = (await asUser(ids.owner, () => db.query(
    "select public.create_task_with_assignees($1,$2,'SyncTask','', 'medium', null, $3::uuid[]) as id",
    [projectId, statusSyncStack, [ownerMember.rows[0].id]],
  ))).rows[0].id;
  const noticesBeforeReassign = (await asUser(ids.member, () => db.query(
    'select count(*)::int as n from public.assignment_notices where project_id=$1', [projectId],
  ))).rows[0].n;
  await asUser(ids.owner, () => db.query(
    'select public.set_task_assignees($1, 1, $2::uuid[])',
    [syncTaskId, [ownerMember.rows[0].id, member.rows[0].id]],
  ));
  const noticesAfterReassign = (await asUser(ids.member, () => db.query(
    'select count(*)::int as n from public.assignment_notices where project_id=$1', [projectId],
  ))).rows[0].n;
  assert.equal(noticesAfterReassign, noticesBeforeReassign + 1, 'newly added assignee via set_task_assignees must receive notice');
  await asUser(ids.owner, () => db.query(
    'select public.set_task_assignees($1, 2, $2::uuid[])',
    [syncTaskId, [ownerMember.rows[0].id, member.rows[0].id]],
  ));
  assert.equal((await asUser(ids.member, () => db.query(
    'select count(*)::int as n from public.assignment_notices where project_id=$1', [projectId],
  ))).rows[0].n, noticesAfterReassign, 'unchanged assignee must not receive duplicate notice');

  await asUser(ids.member, () => db.query(
    "update public.tasks set status='done' where id=$1", [syncTaskId],
  ));
  const doneRow = (await asUser(ids.member, () => db.query(
    'select completed, status, completed_by_member_id from public.tasks where id=$1', [syncTaskId],
  ))).rows[0];
  assert.equal(doneRow.completed, true);
  assert.equal(doneRow.status, 'done');
  assert.equal(doneRow.completed_by_member_id, member.rows[0].id);

  console.log('v3 schema: RLS, multi-channel invitations, join codes, profiles, completion, membership, admin access and version conflict passed');
} finally {
  await db.close();
}
