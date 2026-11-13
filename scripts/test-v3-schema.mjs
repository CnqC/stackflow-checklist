import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = {
  owner: '00000000-0000-4000-8000-000000000001',
  member: '00000000-0000-4000-8000-000000000002',
  outsider: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
};

async function asUser(userId, action) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await db.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
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
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
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
  await expectDenied(() => asUser(ids.member, () => db.query(
    "insert into public.task_links(project_id,task_id,label,url) values ($1,$2,'Wrong','https://example.com')",
    [projectId, taskId],
  )));
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
  await asUser(ids.member, () => db.query(
    'update public.tasks set completed=true where id=$1 and version=1 returning version', [taskId],
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

  console.log('v3 schema: RLS, invitations, completion, membership, admin access and version conflict passed');
} finally {
  await db.close();
}
