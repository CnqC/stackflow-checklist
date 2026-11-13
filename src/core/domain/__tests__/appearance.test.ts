import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE, resolveThemeId, sanitizeAppearance, THEMES } from '../appearance';

describe('appearance preferences', () => {
  it('resolves fixed and system modes', () => {
    const now = new Date(2026, 10, 13, 12);
    expect(resolveThemeId({ ...DEFAULT_APPEARANCE, mode: 'light' }, now, true)).toBe('light');
    expect(resolveThemeId({ ...DEFAULT_APPEARANCE, mode: 'dark' }, now, false)).toBe('dark');
    expect(resolveThemeId({ ...DEFAULT_APPEARANCE, mode: 'system' }, now, true)).toBe('dark');
    expect(resolveThemeId({ ...DEFAULT_APPEARANCE, mode: 'system' }, now, false)).toBe('light');
    expect(resolveThemeId({ ...DEFAULT_APPEARANCE, mode: 'custom', customThemeId: 'mint' }, now, true)).toBe('mint');
  });

  it('switches on local schedule boundaries, including a schedule crossing midnight', () => {
    const schedule = { ...DEFAULT_APPEARANCE, mode: 'schedule' as const };
    const at = (hour: number, minute = 0) => new Date(2026, 10, 13, hour, minute);
    expect(resolveThemeId(schedule, at(6, 59), false)).toBe('dark');
    expect(resolveThemeId(schedule, at(7), false)).toBe('light');
    expect(resolveThemeId(schedule, at(18, 59), false)).toBe('light');
    expect(resolveThemeId(schedule, at(19), false)).toBe('dark');
    const overnight = { ...schedule, dayStart: '19:00', nightStart: '07:00' };
    expect(resolveThemeId(overnight, at(23), false)).toBe('light');
    expect(resolveThemeId(overnight, at(12), false)).toBe('dark');
  });

  it('rejects damaged storage values and keeps every preset unique', () => {
    expect(sanitizeAppearance({ mode: 'unknown', customThemeId: 'missing', dayStart: '25:30' }))
      .toEqual({ ...DEFAULT_APPEARANCE });
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
    expect(THEMES.filter((theme) => theme.id !== 'light' && theme.id !== 'dark')).toHaveLength(7);
  });
});
