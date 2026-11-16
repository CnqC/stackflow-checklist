import { Capacitor } from '@capacitor/core';
import { extractJoinCode } from '../../core/domain/accountSchemas';
import {
  buildApkDownloadUrl,
  buildProjectShareBundle,
  CANONICAL_PUBLIC_WEB_URL,
  resolvePublicWebBaseUrl,
  type ProjectShareBundle,
  type ShareBundleParams,
} from '../../core/domain/projectShareLinks';

const PENDING_JOIN_SESSION_KEY = 'stackflow_v3_pending_join_code';
const PENDING_JOIN_OAUTH_LOCAL_KEY = 'stackflow_v3_pending_join_oauth';
const OAUTH_JOIN_TTL_MS = 30 * 60 * 1000;

interface StoredOAuthJoin {
  code: string;
  expiresAt: number;
  autoConfirm: boolean;
}

export function capturePendingJoinCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl =
      extractJoinCode(window.location.search) ?? extractJoinCode(window.location.hash);
    if (fromUrl) {
      window.sessionStorage.setItem(PENDING_JOIN_SESSION_KEY, fromUrl);
      return fromUrl;
    }
    const fromSession = window.sessionStorage.getItem(PENDING_JOIN_SESSION_KEY);
    if (fromSession) {
      const parsed = extractJoinCode(fromSession);
      if (parsed) return parsed;
    }
    const rawOAuth = window.localStorage.getItem(PENDING_JOIN_OAUTH_LOCAL_KEY);
    if (rawOAuth) {
      const parsed = JSON.parse(rawOAuth) as Partial<StoredOAuthJoin>;
      if (parsed.code && typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
        return extractJoinCode(parsed.code);
      }
      window.localStorage.removeItem(PENDING_JOIN_OAUTH_LOCAL_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

export function markPendingJoinAutoConfirm(rawCode: string | null): void {
  if (typeof window === 'undefined' || !rawCode) return;
  const code = extractJoinCode(rawCode);
  if (!code) return;
  try {
    window.sessionStorage.setItem(PENDING_JOIN_SESSION_KEY, code);
    const payload: StoredOAuthJoin = {
      code,
      expiresAt: Date.now() + OAUTH_JOIN_TTL_MS,
      autoConfirm: true,
    };
    window.localStorage.setItem(PENDING_JOIN_OAUTH_LOCAL_KEY, JSON.stringify(payload));
  } catch {
    /* Ignore restricted WebView storage */
  }
}

export function consumePendingJoinAutoConfirm(expectedCode: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(PENDING_JOIN_OAUTH_LOCAL_KEY);
    if (!raw) return false;
    window.localStorage.removeItem(PENDING_JOIN_OAUTH_LOCAL_KEY);
    const parsed = JSON.parse(raw) as Partial<StoredOAuthJoin>;
    return (
      parsed.autoConfirm === true &&
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > Date.now() &&
      extractJoinCode(parsed.code ?? '') === extractJoinCode(expectedCode)
    );
  } catch {
    return false;
  }
}

export function clearPendingJoinCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_JOIN_SESSION_KEY);
    window.localStorage.removeItem(PENDING_JOIN_OAUTH_LOCAL_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    /* Ignore history restrictions */
  }
}

export type ShareChannelKind = 'gmail' | 'zalo' | 'telegram' | 'system';

function isMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? '');
}

export function getRuntimePublicAppUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (typeof window === 'undefined') {
    return resolvePublicWebBaseUrl({ configuredBaseUrl: configured });
  }
  return resolvePublicWebBaseUrl({
    configuredBaseUrl: configured,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    origin: window.location.origin,
    pathname: window.location.pathname,
    isNativePlatform: Capacitor.isNativePlatform(),
  });
}

export function getRuntimeApkDownloadUrl(): string {
  if (typeof window === 'undefined') return `${CANONICAL_PUBLIC_WEB_URL}StackFlow-Checklist.apk`;
  return buildApkDownloadUrl(getRuntimePublicAppUrl());
}

export function createRuntimeShareBundle(
  params: Omit<ShareBundleParams, 'publicBaseUrl' | 'apkDownloadUrl'>,
): ProjectShareBundle {
  const publicBaseUrl = getRuntimePublicAppUrl();
  return buildProjectShareBundle({
    ...params,
    publicBaseUrl,
    apkDownloadUrl: buildApkDownloadUrl(publicBaseUrl),
  });
}

export async function copyTextResilient(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* Fallback to textarea copy below */
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return;
  if (url.startsWith('mailto:') || url.startsWith('intent://')) {
    const a = document.createElement('a');
    a.href = url;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened && typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export function canUseMobileSystemShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (isMobileUserAgent() || Capacitor.isNativePlatform());
}

export async function launchShareChannel(channel: ShareChannelKind, bundle: ProjectShareBundle): Promise<{ ok: boolean; notice: string }> {
  if (channel === 'gmail') {
    await copyTextResilient(bundle.fullMessage);
    const useMailto = Capacitor.isNativePlatform() || isMobileUserAgent();
    openExternalUrl(useMailto ? bundle.mailtoUrl : bundle.gmailComposeUrl);
    return { ok: true, notice: useMailto ? 'Đã mở ứng dụng Email trên máy kèm sẵn Link dự án (đã chép dự phòng vào bộ nhớ tạm).' : 'Đã mở cửa sổ soạn thư Gmail kèm sẵn tiêu đề & đường dẫn dự án!' };
  }
  if (channel === 'telegram') {
    await copyTextResilient(bundle.fullMessage);
    openExternalUrl(bundle.telegramShareUrl);
    return { ok: true, notice: 'Đã mở Telegram kèm đường dẫn & lời mời — hãy chọn đối tác hoặc nhóm chat để gửi!' };
  }
  if (channel === 'zalo') {
    await copyTextResilient(bundle.fullMessage);
    if (canUseMobileSystemShare()) {
      try {
        await navigator.share({ title: bundle.emailSubject, text: bundle.fullMessage });
        return { ok: true, notice: 'Đã mở bảng chia sẻ thiết bị — hãy chọn Zalo để gửi ngay cho đối tác!' };
      } catch { /* Dismissed share sheet; clipboard already has invite */ }
    } else {
      openExternalUrl(bundle.zaloWebUrl);
    }
    return { ok: true, notice: 'Đã chép sẵn lời mời + Link dự án! Trong cửa sổ Zalo, hãy bấm Dán (Ctrl+V) để gửi cho đối tác.' };
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: bundle.emailSubject, text: bundle.fullMessage });
      return { ok: true, notice: 'Đã mở bảng chia sẻ hệ thống!' };
    } catch { /* Fallback to clipboard */ }
  }
  const copied = await copyTextResilient(bundle.fullMessage);
  return { ok: copied, notice: copied ? 'Đã sao chép trọn bộ lời mời & đường dẫn dự án!' : 'Không thể truy cập bộ nhớ tạm.' };
}
