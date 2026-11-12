import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBundledSupabaseConfig, getSupabaseConfig, saveSupabaseConfig } from '../supabaseConfig';

describe('Supabase build defaults and local migration', () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('can temporarily leave the default Cloud project to open a local workspace', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://default.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'default-public-key');

    expect(getSupabaseConfig()?.url).toBe('https://default.supabase.co');
    saveSupabaseConfig(null);
    expect(getSupabaseConfig()).toBeNull();
    expect(getBundledSupabaseConfig()?.url).toBe('https://default.supabase.co');

    saveSupabaseConfig({ url: 'https://default.supabase.co', anonKey: 'default-public-key' });
    expect(getSupabaseConfig()?.url).toBe('https://default.supabase.co');
  });
});
