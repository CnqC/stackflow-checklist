import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseRuntimeConfig } from '../types/models';

const STORAGE_KEY = 'stackflow_supabase_runtime_config_v1';

let cachedClient: SupabaseClient | null = null;
let cachedConfigSignature = '';

export function getSupabaseConfig(): SupabaseRuntimeConfig | null {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig>;
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

  if (envUrl && envKey) {
    return { url: envUrl, anonKey: envKey };
  }

  return null;
}

export function saveSupabaseConfig(config: SupabaseRuntimeConfig | null): void {
  cachedClient = null;
  cachedConfigSignature = '';
  if (typeof window === 'undefined') return;
  if (!config || !config.url.trim() || !config.anonKey.trim()) {
    window.localStorage.removeItem(STORAGE_KEY);
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
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
  cachedConfigSignature = sig;
  return cachedClient;
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
