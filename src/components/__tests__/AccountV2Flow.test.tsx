import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountLogin } from '../account/AccountLogin';
import { ProjectTeamModal } from '../account/team/ProjectTeamModal';

vi.mock('../../infrastructure/projects/accountProjectRepository', () => ({
  accountProjectRepository: {
    invite: vi.fn().mockResolvedValue(undefined),
    setMemberActive: vi.fn().mockResolvedValue(undefined),
    transferOwner: vi.fn().mockResolvedValue(undefined),
    updateProject: vi.fn().mockResolvedValue(2),
  },
}));

vi.mock('../../infrastructure/projects/accountTeamInviteRepository', async () => {
  const actual = await vi.importActual<
    typeof import('../../infrastructure/projects/accountTeamInviteRepository')
  >('../../infrastructure/projects/accountTeamInviteRepository');
  return {
    ...actual,
    accountTeamInviteRepository: {
      ...actual.accountTeamInviteRepository,
      getJoinLink: vi.fn().mockResolvedValue({
        projectId: '00000000-0000-4000-8000-000000000099',
        joinCode: 'SF-ZALO88',
        enabled: true,
        defaultJobTitle: 'Developer',
        expiresAt: null,
        useCount: 3,
      }),
      listPendingInvitations: vi.fn().mockResolvedValue([
        {
          id: 'inv-1',
          invitedEmail: 'linh.ui@gmail.com',
          invitedJobTitle: 'UI/UX',
          accessRole: 'member',
          expiresAt: '2026-12-01T00:00:00Z',
          createdAt: '2026-11-16T00:00:00Z',
        },
      ]),
    },
  };
});

describe('V2 Google Login & Multi-Channel Team Modal Flow', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/?join=sf-demo26');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('captures ?join= code on decorated Google Login screen and exposes theme settings', () => {
    const onSettings = vi.fn();
    render(<AccountLogin error={null} onSettings={onSettings} />);

    expect(screen.getByText('SF-DEMO26')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tiếp tục với Google/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Giao diện & Cài đặt/i }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('renders V2 3-tab ProjectTeamModal with online roster, Zalo join code, and APK install tab', async () => {
    render(
      <ProjectTeamModal
        open
        project={{
          id: '00000000-0000-4000-8000-000000000099',
          code: 'STACK-V2',
          name: 'Dự Án App Hợp Nhất',
          description: 'Chuẩn UI V2 + Google Cloud',
          version: 1,
          accessRole: 'owner',
        }}
        members={[
          {
            id: 'm1',
            project_id: '00000000-0000-4000-8000-000000000099',
            user_id: 'u1',
            display_name: 'Cao Nhật Quang',
            job_title: 'Tech Lead',
            avatar_color: '#6366f1',
            access_role: 'owner',
            active: true,
          },
        ]}
        currentUserId="u1"
        canManageProject
        peers={[
          {
            memberId: 'm1',
            name: 'Cao Nhật Quang',
            color: '#6366f1',
            role: 'Tech Lead',
            platform: 'Web',
            lastSeenAt: '2026-11-16T00:00:00Z',
          },
        ]}
        onClose={vi.fn()}
        onRefreshProject={vi.fn().mockResolvedValue(undefined)}
        onFilterByMember={vi.fn()}
      />,
    );

    expect(screen.getByText('Cao Nhật Quang')).toBeTruthy();
    expect(screen.getByText(/Online \(Web\)/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Mời thành viên/i }));
    await waitFor(() => {
      expect(screen.getByText('SF-ZALO88')).toBeTruthy();
      expect(screen.getByText('linh.ui@gmail.com')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: /Cài đặt App/i }));
    expect(screen.getByText(/Tải xuống StackFlow-Checklist\.apk/i)).toBeTruthy();
  });
});
