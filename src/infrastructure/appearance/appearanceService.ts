import {
  DEFAULT_APPEARANCE,
  getTheme,
  resolveThemeId,
  sanitizeAppearance,
  type AppearancePreferences,
  type ThemeDefinition,
} from '../../core/domain/appearance';

const STORAGE_KEY = 'stackflow_appearance_v1';

function readPreferences(): AppearancePreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE };
  try {
    return sanitizeAppearance(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

function mix(first: string, second: string, amount: number): string {
  const channel = (offset: number) => {
    const a = Number.parseInt(first.slice(offset, offset + 2), 16);
    const b = Number.parseInt(second.slice(offset, offset + 2), 16);
    return Math.round(a * (1 - amount) + b * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

function colorTokens(theme: ThemeDefinition): Record<string, string> {
  const light = theme.tone === 'light';
  const accentStep = (base: string, amount: number) => mix(base, light ? '#000000' : '#ffffff', amount);
  const accentSoft = (base: string) => mix(base, theme.background, light ? 0.88 : 0.82);
  return {
    '--app-background': theme.background,
    '--app-foreground': light ? '#0f172a' : '#ffffff',
    '--color-slate-950': theme.background,
    '--color-slate-900': theme.surface,
    '--color-slate-800': theme.raised,
    '--color-slate-700': theme.border,
    '--color-slate-600': mix(theme.border, light ? '#000000' : '#ffffff', 0.2),
    '--color-slate-500': light ? '#526078' : '#94a3b8',
    '--color-slate-400': light ? '#475569' : '#94a3b8',
    '--color-slate-300': light ? '#334155' : '#cbd5e1',
    '--color-slate-200': light ? '#1e293b' : '#e2e8f0',
    '--color-slate-100': light ? '#0f172a' : '#f1f5f9',
    '--color-indigo-950': accentSoft(theme.accent),
    '--color-indigo-600': theme.accent,
    '--color-indigo-500': accentStep(theme.accent, light ? 0.04 : 0.16),
    '--color-indigo-400': accentStep(theme.accent, light ? 0.13 : 0.35),
    '--color-indigo-300': accentStep(theme.accent, light ? 0.2 : 0.55),
    '--color-indigo-200': accentStep(theme.accent, light ? 0.3 : 0.7),
    '--color-sky-600': theme.secondary,
    '--color-sky-500': accentStep(theme.secondary, light ? 0.04 : 0.16),
    '--color-sky-400': accentStep(theme.secondary, light ? 0.13 : 0.35),
    '--color-sky-300': accentStep(theme.secondary, light ? 0.2 : 0.55),
    '--color-emerald-300': light ? '#047857' : '#6ee7b7',
    '--color-emerald-400': light ? '#047857' : '#34d399',
    '--color-rose-300': light ? '#be123c' : '#fda4af',
    '--color-rose-400': light ? '#be123c' : '#fb7185',
    '--color-amber-300': light ? '#92400e' : '#fcd34d',
    '--color-amber-400': light ? '#92400e' : '#fbbf24',
  };
}

class AppearanceService {
  private preferences = readPreferences();
  private listeners = new Set<() => void>();
  private started = false;

  get(): AppearancePreferences {
    return this.preferences;
  }

  getResolvedTheme(): ThemeDefinition {
    const systemDark = typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return getTheme(resolveThemeId(this.preferences, new Date(), systemDark));
  }

  update(patch: Partial<AppearancePreferences>): void {
    this.preferences = sanitizeAppearance({ ...this.preferences, ...patch });
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
      } catch {
        // Keep the choice for this session when storage is unavailable.
      }
    }
    this.apply();
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    this.apply();
    window.addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return;
      this.preferences = readPreferences();
      this.apply();
      this.emit();
    });
    window.addEventListener('focus', () => this.refresh());
    document.addEventListener('visibilitychange', () => this.refresh());
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => this.refresh());
    window.setInterval(() => {
      if (this.preferences.mode === 'schedule') this.refresh();
    }, 60_000);
  }

  private refresh(): void {
    this.apply();
    this.emit();
  }

  private apply(): void {
    if (typeof document === 'undefined') return;
    const theme = this.getResolvedTheme();
    const root = document.documentElement;
    root.dataset.theme = theme.id;
    root.dataset.themeTone = theme.tone;
    root.style.colorScheme = theme.tone;
    for (const [name, value] of Object.entries(colorTokens(theme))) {
      root.style.setProperty(name, value);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const appearanceService = new AppearanceService();
