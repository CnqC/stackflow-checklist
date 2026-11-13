import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { getSupabaseClient } from '../../services/supabaseConfig';

export interface AccountIdentity {
  id: string;
  email: string;
  name: string;
}

const NATIVE_REDIRECT = 'com.quang.stackflow://auth/callback';

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Chưa cấu hình Supabase cho tài khoản nhóm.');
  return client;
}

function identityFromUser(user: User | null): AccountIdentity | null {
  if (!user?.email) return null;
  const preferredName = user.user_metadata?.full_name;
  return {
    id: user.id,
    email: user.email,
    name: typeof preferredName === 'string' && preferredName.trim()
      ? preferredName.trim()
      : user.email.split('@')[0],
  };
}

async function completeNativeRedirect(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== 'com.quang.stackflow:' || url.host !== 'auth' || url.pathname !== '/callback') return;
  const oauthError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (oauthError) throw new Error(`Đăng nhập Google thất bại: ${oauthError}`);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Google không trả về mã đăng nhập.');
  const { error } = await requireClient().auth.exchangeCodeForSession(code);
  if (error) throw new Error(`Không hoàn tất được đăng nhập: ${error.message}`);
  await Browser.close().catch(() => undefined);
}

export const accountAuthService = {
  async currentIdentity(): Promise<AccountIdentity | null> {
    const auth = requireClient().auth;
    const { data: sessionData, error: sessionError } = await auth.getSession();
    if (sessionError) throw new Error(`Không đọc được phiên đăng nhập: ${sessionError.message}`);
    if (!sessionData.session) return null;
    const { data, error } = await auth.getUser();
    if (error) throw new Error(`Không xác minh được phiên đăng nhập: ${error.message}`);
    return identityFromUser(data.user);
  },

  subscribe(listener: (identity: AccountIdentity | null) => void): () => void {
    const { data } = requireClient().auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        listener(identityFromUser(session?.user ?? null));
      },
    );
    return () => data.subscription.unsubscribe();
  },

  async signInWithGoogle(): Promise<void> {
    const native = Capacitor.isNativePlatform();
    const redirectTo = native
      ? NATIVE_REDIRECT
      : new URL(import.meta.env.BASE_URL, window.location.href).href;
    const { data, error } = await requireClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: native },
    });
    if (error) throw new Error(`Không mở được Google: ${error.message}`);
    if (native) {
      if (!data.url) throw new Error('Google không trả về đường dẫn đăng nhập.');
      await Browser.open({ url: data.url });
    }
  },

  async listenNativeRedirect(onError: (error: Error) => void): Promise<() => void> {
    if (!Capacitor.isNativePlatform()) return () => undefined;
    const listener = await App.addListener('appUrlOpen', ({ url }) => {
      void completeNativeRedirect(url).catch(onError);
    });
    const launch = await App.getLaunchUrl();
    if (launch?.url) void completeNativeRedirect(launch.url).catch(onError);
    return () => { void listener.remove(); };
  },

  async signOut(): Promise<void> {
    const { error } = await requireClient().auth.signOut({ scope: 'local' });
    if (error) throw new Error(`Không thể đăng xuất: ${error.message}`);
  },
};
