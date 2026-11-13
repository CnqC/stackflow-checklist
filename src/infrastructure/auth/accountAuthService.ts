import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../services/supabaseConfig';

export interface AccountIdentity {
  id: string;
  email: string;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Chưa cấu hình Supabase cho tài khoản nhóm.');
  return client;
}

function identityFromUser(user: User | null): AccountIdentity | null {
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
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

  async sendEmailCode(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      throw new Error('Vui lòng nhập email hợp lệ.');
    }
    const { error } = await requireClient().auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true },
    });
    if (error) throw new Error(`Không gửi được mã đăng nhập: ${error.message}`);
  },

  async verifyEmailCode(email: string, token: string): Promise<AccountIdentity> {
    const { data, error } = await requireClient().auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw new Error(`Mã đăng nhập không hợp lệ: ${error.message}`);
    const identity = identityFromUser(data.user);
    if (!identity) throw new Error('Supabase không trả về tài khoản có email.');
    return identity;
  },

  async signOut(): Promise<void> {
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(`Không thể đăng xuất: ${error.message}`);
  },
};
