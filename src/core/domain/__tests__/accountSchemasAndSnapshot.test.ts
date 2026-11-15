import { describe, expect, it } from 'vitest';
import type { ProjectData } from '../accountProject';
import {
  buildZaloInviteMessage,
  CreateProjectInputSchema,
  extractJoinCode,
  InviteMemberEmailSchema,
  JoinCodeInputSchema,
  UpdateMyProfileInputSchema,
} from '../accountSchemas';
import { toV2WorkspaceSnapshot } from '../accountV2Snapshot';

describe('Account Zod Schemas & V2 Snapshot Parity', () => {
  it('extracts and normalizes join codes from plain codes or full Zalo/Web URLs', () => {
    expect(extractJoinCode('sf-9a8b7c')).toBe('SF-9A8B7C');
    expect(extractJoinCode('9a8b7c')).toBe('SF-9A8B7C');
    expect(extractJoinCode('https://stackflow.app/?join=sf-hello1&utm=zalo')).toBe('SF-HELLO1');
    expect(extractJoinCode('?join=SF-TEAM26')).toBe('SF-TEAM26');
    expect(extractJoinCode('   ')).toBeNull();
    expect(JoinCodeInputSchema.parse('https://example.com/?join=sf-12ab34')).toBe('SF-12AB34');
  });

  it('validates project creation, email invitation, and member profile schemas strictly', () => {
    const created = CreateProjectInputSchema.parse({
      code: ' stack v2 ',
      name: '  StackFlow Release  ',
      description: 'Bản hội tụ Google Cloud',
      jobTitle: 'Tech Lead',
      avatarColor: '#10b981',
    });
    expect(created.code).toBe('STACK-V2');
    expect(created.name).toBe('StackFlow Release');

    const invite = InviteMemberEmailSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      email: '  Minh.Dev@Example.com ',
      jobTitle: 'Backend Engineer',
    });
    expect(invite.email).toBe('minh.dev@example.com');

    const profile = UpdateMyProfileInputSchema.parse({
      projectId: '00000000-0000-4000-8000-000000000001',
      displayName: '  Cao Nhật Quang ',
      jobTitle: 'Founder',
      avatarColor: '#ec4899',
    });
    expect(profile.displayName).toBe('Cao Nhật Quang');
  });

  it('formats friendly Vietnamese Zalo/Discord invite copy with Web join URL and APK link', () => {
    const built = buildZaloInviteMessage({
      projectName: 'Ra mắt App Mobile',
      projectCode: 'MOBILE-Q4',
      joinCode: 'SF-8899AA',
      webOrigin: 'https://stackflow.example.com/',
      apkDownloadUrl: 'https://stackflow.example.com/StackFlow-Checklist.apk',
    });
    expect(built.joinUrl).toBe('https://stackflow.example.com/?join=SF-8899AA');
    expect(built.message).toContain('Ra mắt App Mobile');
    expect(built.message).toContain('SF-8899AA');
    expect(built.message).toContain('StackFlow-Checklist.apk');
  });

  it('maps member avatar_color, initials, and activity actor colors onto V2 WorkspaceSnapshot', () => {
    const projectId = '00000000-0000-4000-8000-000000000010';
    const data: ProjectData = {
      project: {
        id: projectId,
        code: 'V2-CLOUD',
        name: 'Dự án Chuẩn V2',
        description: '',
        version: 1,
        accessRole: 'owner',
      },
      members: [
        {
          id: 'm1',
          project_id: projectId,
          user_id: 'u1',
          display_name: 'Cao Nhật Quang',
          job_title: 'Product Lead',
          avatar_color: '#10b981',
          access_role: 'owner',
          active: true,
        },
        {
          id: 'm2',
          project_id: projectId,
          user_id: 'u2',
          display_name: 'Linh Nguyễn',
          job_title: 'UI Designer',
          avatar_color: '#ec4899',
          access_role: 'member',
          active: true,
        },
      ],
      stacks: [],
      tasks: [],
      assignees: [],
      subtasks: [],
      links: [],
      activities: [
        {
          id: 'act-1',
          project_id: projectId,
          actor_user_id: 'u2',
          actor_name: 'Linh Nguyễn',
          action_type: 'join_member',
          target_title: 'Dự án Chuẩn V2',
          detail: 'Tham gia qua mã mời SF-123456',
          created_at: '2026-11-16T00:00:00Z',
        },
        {
          id: 'act-2',
          project_id: projectId,
          actor_user_id: 'u1',
          actor_name: 'Cao Nhật Quang',
          action_type: 'update_task',
          target_title: 'Thiết kế Login',
          detail: 'todo → doing',
          created_at: '2026-11-16T00:05:00Z',
        },
      ],
      notices: [],
    };

    const snapshot = toV2WorkspaceSnapshot(data);
    expect(snapshot.members[0]).toMatchObject({
      name: 'Cao Nhật Quang',
      avatar: 'CQ',
      color: '#10b981',
      role: 'Product Lead',
    });
    expect(snapshot.members[1]).toMatchObject({
      name: 'Linh Nguyễn',
      avatar: 'LN',
      color: '#ec4899',
      role: 'UI Designer',
    });
    expect(snapshot.activities[0]).toMatchObject({
      actionType: 'join_member',
      actorColor: '#ec4899',
    });
    expect(snapshot.activities[1]).toMatchObject({
      actionType: 'status_change',
      actorColor: '#10b981',
    });
  });
});
