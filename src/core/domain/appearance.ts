export type AppearanceMode = 'light' | 'dark' | 'system' | 'schedule' | 'custom';
export type ThemeTone = 'light' | 'dark';

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  tone: ThemeTone;
  background: string;
  surface: string;
  raised: string;
  border: string;
  accent: string;
  secondary: string;
}

export const THEMES = [
  { id: 'dark', name: 'Đêm StackFlow', description: 'Xanh than và tím quen thuộc', tone: 'dark', background: '#090d16', surface: '#0f172a', raised: '#1e293b', border: '#334155', accent: '#4f46e5', secondary: '#0284c7' },
  { id: 'light', name: 'Sáng tinh gọn', description: 'Nền sáng, nét chữ rõ', tone: 'light', background: '#ffffff', surface: '#f8fafc', raised: '#e2e8f0', border: '#cbd5e1', accent: '#4338ca', secondary: '#0369a1' },
  { id: 'ocean', name: 'Đại dương', description: 'Xanh biển sâu và cyan', tone: 'dark', background: '#061724', surface: '#0b2536', raised: '#14364a', border: '#285166', accent: '#0369a1', secondary: '#0891b2' },
  { id: 'forest', name: 'Rừng sâu', description: 'Xanh lá dịu mắt', tone: 'dark', background: '#091b18', surface: '#102923', raised: '#1a3930', border: '#315549', accent: '#15803d', secondary: '#0f766e' },
  { id: 'amethyst', name: 'Thạch anh', description: 'Tím và hồng tím', tone: 'dark', background: '#171022', surface: '#241831', raised: '#342344', border: '#563966', accent: '#7c3aed', secondary: '#a21caf' },
  { id: 'rose', name: 'Hoa hồng', description: 'Đỏ berry trên nền mận', tone: 'dark', background: '#1d1019', surface: '#2b1723', raised: '#3c2331', border: '#60404d', accent: '#be123c', secondary: '#9d174d' },
  { id: 'sunset', name: 'Hoàng hôn', description: 'Cam đất và vàng ấm', tone: 'dark', background: '#20150f', surface: '#302017', raised: '#422d20', border: '#684833', accent: '#b45309', secondary: '#a16207' },
  { id: 'mint', name: 'Bạc hà', description: 'Nền sáng xanh dịu', tone: 'light', background: '#f7fffc', surface: '#effaf5', raised: '#dcefe5', border: '#b9d8c8', accent: '#0f766e', secondary: '#15803d' },
  { id: 'peach', name: 'Đào nhạt', description: 'Nền kem và cam đào', tone: 'light', background: '#fffaf5', surface: '#fff4e9', raised: '#f5e4d4', border: '#decbb8', accent: '#c2410c', secondary: '#b45309' },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = typeof THEMES[number]['id'];

export interface AppearancePreferences {
  mode: AppearanceMode;
  customThemeId: ThemeId;
  dayStart: string;
  nightStart: string;
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  mode: 'dark',
  customThemeId: 'ocean',
  dayStart: '07:00',
  nightStart: '19:00',
};

export function parseTime(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function sanitizeAppearance(raw: unknown): AppearancePreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_APPEARANCE };
  const value = raw as Partial<AppearancePreferences>;
  return {
    mode: ['light', 'dark', 'system', 'schedule', 'custom'].includes(value.mode ?? '')
      ? value.mode as AppearanceMode : DEFAULT_APPEARANCE.mode,
    customThemeId: THEMES.some((theme) => theme.id === value.customThemeId)
      ? value.customThemeId as ThemeId : DEFAULT_APPEARANCE.customThemeId,
    dayStart: typeof value.dayStart === 'string' && parseTime(value.dayStart) !== null
      ? value.dayStart : DEFAULT_APPEARANCE.dayStart,
    nightStart: typeof value.nightStart === 'string' && parseTime(value.nightStart) !== null
      ? value.nightStart : DEFAULT_APPEARANCE.nightStart,
  };
}

export function resolveThemeId(preferences: AppearancePreferences, now: Date, systemDark: boolean): ThemeId {
  switch (preferences.mode) {
    case 'light': return 'light';
    case 'dark': return 'dark';
    case 'system': return systemDark ? 'dark' : 'light';
    case 'custom': return preferences.customThemeId;
    case 'schedule': {
      const day = parseTime(preferences.dayStart) ?? 420;
      const night = parseTime(preferences.nightStart) ?? 1140;
      const current = now.getHours() * 60 + now.getMinutes();
      if (day === night) return 'light';
      const daytime = day < night
        ? current >= day && current < night
        : current >= day || current < night;
      return daytime ? 'light' : 'dark';
    }
  }
}

export function getTheme(id: ThemeId): ThemeDefinition {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}
