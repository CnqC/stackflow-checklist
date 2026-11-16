import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountLogin } from '../account/AccountLogin';
import { ProjectDashboard } from '../account/ProjectDashboard';
import { ProjectTeamModal } from '../account/team/ProjectTeamModal';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';
import { accountTeamInviteRepository } from '../../infrastructure/projects/accountTeamInviteRepository';

vi.mock('../../infrastructure/auth/accountAuthService', () => ({
  accountAuthService: {
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../infrastructure/projects/accountProjectRepository', () => ({
  accountProjectRepository: {
    invite: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue([]),
    listInvitations: vi.fn().mockResolvedValue([]),
    isGlobalAdmin: vi.fn().mockResolvedValue(false),
    accept: vi.fn().mockResolvedValue('proj-accepted'),
    createProject: vi.fn().mockResolvedValue('proj-new'),
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
        defaultJobTitle: 'Đối tác',
        expiresAt: null,
        useCount: 2,
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
      joinByCode: vi.fn().mockResolvedValue('proj-joined-99'),
      previewByJoinCode: vi.fn().mockResolvedValue(null),
      configureJoinLink: vi.fn(),
      revokeInvitation: vi.fn().mockResolvedValue(undefined),
      declineInvitation: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('End-to-End Multi-Channel Project Sharing (Gmail, Zalo, Telegram & Link Join)', () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({}) as Window);

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.localStorage.clear();
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('dispatches canonical share links through Gmail, Telegram, Zalo, and direct Email compose', async () => {
    render(
      <ProjectTeamModal
        open
        initialTab="invites"
        project={{
          id: '00000000-0000-4000-8000-000000000099',
          code: 'PARTNER-26',
          name: 'Dự Án Đối Tác',
          description: '',
          version: 1,
          accessRole: 'owner',
        }}
        members={[]}
        currentUserId="u1"
        canManageProject
        peers={[]}
        onClose={vi.fn()}
        onRefreshProject={vi.fn().mockResolvedValue(undefined)}
        onFilterByMember={vi.fn()}
      />,
    );

    const urlInput = (await screen.findByLabelText(
      'Đường dẫn tham gia dự án',
    )) as HTMLInputElement;
    expect(urlInput.value).toBe('https://cnqc.github.io/stackflow-checklist/?join=SF-ZALO88');

    // 1. Send via Gmail button
    fireEvent.click(screen.getByRole('button', { name: /^Gmail$/i }));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://mail.google.com/mail/?view=cm&fs=1'),
        '_blank',
        'noopener,noreferrer',
      );
    });
    const gmailOpenedUrl = String(openSpy.mock.calls[0]?.[0]);
    expect(decodeURIComponent(gmailOpenedUrl)).toContain(
      'https://cnqc.github.io/stackflow-checklist/?join=SF-ZALO88',
    );

    // 2. Send via Telegram button
    openSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Telegram$/i }));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://t.me/share/url?url='),
        '_blank',
        'noopener,noreferrer',
      );
    });
    expect(decodeURIComponent(String(openSpy.mock.calls[0]?.[0]))).toContain('?join=SF-ZALO88');

    // 3. Send via Zalo button (copies message + opens Zalo chat)
    openSpy.mockClear();
    writeTextMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Zalo$/i }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('https://cnqc.github.io/stackflow-checklist/?join=SF-ZALO88'),
      );
      expect(openSpy).toHaveBeenCalledWith('https://chat.zalo.me/', '_blank', 'noopener,noreferrer');
    });

    // 4. Direct Email Invite saves DB invitation AND opens Gmail addressed to partner
    openSpy.mockClear();
    fireEvent.change(screen.getByPlaceholderText('doitac@gmail.com'), {
      target: { value: 'partner@company.vn' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Vai trò \(VD: Đối tác/i), {
      target: { value: 'Đối tác chiến lược' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Mời & Mở Gmail/i }));

    await waitFor(() => {
      expect(accountProjectRepository.invite).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000099',
        'partner@company.vn',
        'Đối tác chiến lược',
      );
      expect(openSpy).toHaveBeenCalledWith(
        expect.stringContaining('to=partner%40company.vn'),
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('auto-joins and opens the shared project immediately after Google OAuth sign-in', async () => {
    window.history.replaceState({}, '', '/?join=sf-partnr');
    const loginView = render(<AccountLogin error={null} />);

    fireEvent.click(screen.getByRole('button', { name: /Tiếp tục với Google & Vào dự án/i }));
    loginView.unmount();

    // Simulate OAuth callback returning to clean root URL with sessionStorage cleared across mobile reload
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');

    const onOpen = vi.fn();
    render(
      <ProjectDashboard
        identity={{ id: 'u2', email: 'partner@company.vn', name: 'Đối Tác' }}
        onOpen={onOpen}
        onSignOut={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(accountTeamInviteRepository.joinByCode).toHaveBeenCalledWith('SF-PARTNR');
      expect(onOpen).toHaveBeenCalledWith('proj-joined-99');
    });
  });

  it('warns clearly when a shared link is opened inside Zalo embedded WebView or when code expired', async () => {
    const origUa = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Zalo/24.09.01',
      configurable: true,
    });
    window.history.replaceState({}, '', '/?join=SF-ZALO99');

    const loginView = render(<AccountLogin error={null} />);
    expect(screen.getByText(/trình duyệt thu nhỏ của Zalo/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mở ngay bằng Chrome/i })).toBeTruthy();
    loginView.unmount();

    Object.defineProperty(navigator, 'userAgent', { value: origUa, configurable: true });

    // Logged-in user opens an expired/disabled code without prior login click -> sees clear warning
    render(
      <ProjectDashboard
        identity={{ id: 'u2', email: 'partner@company.vn', name: 'Đối Tác' }}
        onOpen={vi.fn()}
        onSignOut={vi.fn()}
        onSettings={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/hiện không tồn tại, đang tạm tắt hoặc đã hết hạn/i)).toBeTruthy();
    });
  });
});
