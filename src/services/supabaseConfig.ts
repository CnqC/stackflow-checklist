import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseRuntimeConfig } from '../types/models';

const STORAGE_KEY = 'stackflow_supabase_runtime_config_v1';
export const ACCOUNT_SUPABASE_HOST = 'xwzwsysekkizxmmjjjvn.supabase.co';

let cachedClient: SupabaseClient | null = null;
let cachedConfigSignature = '';
let cachedAccountClient: SupabaseClient | null = null;
let cachedAccountConfigSignature = '';

export function getBundledSupabaseConfig(): SupabaseRuntimeConfig | null {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

  return envUrl && envKey ? { url: envUrl, anonKey: envKey } : null;
}

export function getAccountSupabaseConfig(): SupabaseRuntimeConfig | null {
  const config = getBundledSupabaseConfig();
  if (!config) return null;
  try {
    const url = new URL(config.url);
    return url.protocol === 'https:' && url.hostname === ACCOUNT_SUPABASE_HOST
      ? config : null;
  } catch {
    return null;
  }
}

export function getSupabaseConfig(): SupabaseRuntimeConfig | null {

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig> & { disabled?: boolean };
        if (parsed.disabled === true) return null;
        if (parsed.url?.trim() && parsed.anonKey?.trim()) {
          return {
            url: parsed.url.trim(),
            anonKey: parsed.anonKey.trim(),
          };
        }
      }
    } catch {
      // Ignore malformed storage
    }
  }

  return getBundledSupabaseConfig();
}

export function saveSupabaseConfig(config: SupabaseRuntimeConfig | null): void {
  cachedClient = null;
  cachedConfigSignature = '';
  if (typeof window === 'undefined') return;
  if (!config || !config.url.trim() || !config.anonKey.trim()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ disabled: true }));
    return;
  }
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      url: config.url.trim(),
      anonKey: config.anonKey.trim(),
    }),
  );
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  const sig = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedConfigSignature === sig) {
    return cachedClient;
  }

  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
  cachedConfigSignature = sig;
  return cachedClient;
}

/** The Google account app never reads the PIN client's saved browser override. */
export function getAccountSupabaseClient(): SupabaseClient | null {
  const config = getAccountSupabaseConfig();
  if (!config) return null;
  const signature = `${config.url}::${config.anonKey}`;
  if (cachedAccountClient && cachedAccountConfigSignature === signature) return cachedAccountClient;
  cachedAccountClient = createClient(config.url, config.anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  cachedAccountConfigSignature = signature;
  return cachedAccountClient;
}

export async function verifySupabaseConnection(
  url: string,
  anonKey: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    const tempClient = createClient(url.trim(), anonKey.trim());
    const { error } = await tempClient.from('workspaces').select('id').limit(1);
    if (error) {
      return {
        ok: false,
        errorMessage: `Kết nối được Supabase nhưng chưa thấy bảng dữ liệu (${error.message}). Hãy chạy file supabase/schema.sql trong SQL Editor trước!`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errorMessage: `Không thể kết nối tới URL Supabase: ${msg}` };
  }
}
