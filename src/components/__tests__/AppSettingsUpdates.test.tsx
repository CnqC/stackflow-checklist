import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsModal } from '../AppSettingsModal';

describe('update entry in app settings', () => {
  afterEach(cleanup);

  it('is available before joining a workspace', () => {
    render(<AppSettingsModal open onClose={vi.fn()} snapshot={null} memberId={null} syncMode="local"
      onOpenCloud={vi.fn()} onOpenInstall={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Ứng dụng/ }));
    expect(screen.getByText(/Đang dùng: StackFlow/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kiểm tra/ })).toBeTruthy();
  });
});
