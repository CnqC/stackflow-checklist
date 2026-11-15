import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccountSupabaseClient, getAccountSupabaseConfig, getBundledSupabaseConfig, getSupabaseConfig, saveSupabaseConfig } from '../supabaseConfig';

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

  it('keeps the Google account client on its bundled database despite a saved PIN override', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xwzwsysekkizxmmjjjvn.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'account-public-key');
    saveSupabaseConfig({ url: 'https://zkuczhuhxjnetamxweyv.supabase.co', anonKey: 'pin-public-key' });

    expect(getSupabaseConfig()?.url).toContain('zkuczhuhxjnetamxweyv');
    expect(getAccountSupabaseConfig()?.url).toContain('xwzwsysekkizxmmjjjvn');
    expect(getAccountSupabaseClient()).not.toBeNull();
  });

  it('rejects the PIN database as an account backend', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://zkuczhuhxjnetamxweyv.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'pin-public-key');
    expect(getAccountSupabaseConfig()).toBeNull();
    expect(getAccountSupabaseClient()).toBeNull();
  });
});
