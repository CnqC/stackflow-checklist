import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appearanceService } from '../../infrastructure/appearance/appearanceService';
import { AppearanceSettings } from '../AppearanceSettings';

describe('AppearanceSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    appearanceService.start();
    appearanceService.update({ mode: 'dark', customThemeId: 'ocean' });
  });
  afterEach(cleanup);

  it('applies a fixed theme immediately and persists it', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: /SángLuôn dùng giao diện sáng/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(JSON.parse(window.localStorage.getItem('stackflow_appearance_v1')!).mode).toBe('light');
  });

  it('shows custom presets and applies the selected colors', () => {
    render(<AppearanceSettings />);
    fireEvent.click(screen.getByRole('button', { name: /Theme màuChọn một bộ màu/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bạc hà/ }));
    expect(document.documentElement.dataset.theme).toBe('mint');
    expect(document.documentElement.style.getPropertyValue('--app-background')).toBe('#f7fffc');
  });
});
