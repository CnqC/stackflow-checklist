import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractJoinCode } from '../accountSchemas';
import {
  buildAndroidChromeIntentUrl,
  buildApkDownloadUrl,
  buildProjectShareBundle,
  CANONICAL_PUBLIC_WEB_URL,
  isEmbeddedChatWebView,
  resolveOAuthRedirectUrl,
  resolvePublicWebBaseUrl,
  translateAccountError,
} from '../projectShareLinks';

describe('projectShareLinks — Canonical URLs, Gmail/Zalo/Telegram Builders & Error Translation', () => {
  it('preserves GitHub Pages subpath and falls back from Android/localhost to canonical public URL', () => {
    expect(
      resolvePublicWebBaseUrl({
        protocol: 'https:',
        hostname: 'cnqc.github.io',
        origin: 'https://cnqc.github.io',
        pathname: '/stackflow-checklist/',
      }),
    ).toBe('https://cnqc.github.io/stackflow-checklist/');

    expect(
      resolvePublicWebBaseUrl({
        protocol: 'https:',
        hostname: 'cnqc.github.io',
        origin: 'https://cnqc.github.io',
        pathname: '/stackflow-checklist/index.html',
      }),
    ).toBe('https://cnqc.github.io/stackflow-checklist/');

    // Missing trailing slash on subpath still resolves to directory
    expect(
      resolvePublicWebBaseUrl({
        protocol: 'https:',
        hostname: 'cnqc.github.io',
        origin: 'https://cnqc.github.io',
        pathname: '/stackflow-checklist',
      }),
    ).toBe('https://cnqc.github.io/stackflow-checklist/');

    // Android Capacitor WebView (https://localhost) must never leak localhost into partner links
    expect(
      resolvePublicWebBaseUrl({
        protocol: 'https:',
        hostname: 'localhost',
        origin: 'https://localhost',
        pathname: '/',
        isNativePlatform: true,
      }),
    ).toBe(CANONICAL_PUBLIC_WEB_URL);

    // Local Vite dev also produces partner-ready canonical share links
    expect(
      resolvePublicWebBaseUrl({
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:5173',
        pathname: '/',
      }),
    ).toBe(CANONICAL_PUBLIC_WEB_URL);
  });

  it('builds valid APK download URL without malformed dot after hostname', () => {
    const base = resolvePublicWebBaseUrl({
      protocol: 'https:',
      hostname: 'cnqc.github.io',
      origin: 'https://cnqc.github.io',
      pathname: '/stackflow-checklist/',
    });
    const apk = buildApkDownloadUrl(base);
    expect(apk).toBe('https://cnqc.github.io/stackflow-checklist/StackFlow-Checklist.apk');
    expect(apk).not.toContain('github.io.');
  });

  it('resolves OAuth redirect URL keeping subpath on production and localhost on local dev', () => {
    expect(
      resolveOAuthRedirectUrl({
        protocol: 'https:',
        hostname: 'cnqc.github.io',
        origin: 'https://cnqc.github.io',
        pathname: '/stackflow-checklist',
      }),
    ).toBe('https://cnqc.github.io/stackflow-checklist/');

    expect(
      resolveOAuthRedirectUrl({
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:5173',
        pathname: '/',
      }),
    ).toBe('http://localhost:5173/');
  });

  it('generates Gmail, Telegram, and Zalo share bundle with working ?join= URL', () => {
    const bundle = buildProjectShareBundle({
      projectName: 'Hợp Tác Đối Tác Q4',
      projectCode: 'PARTNER-Q4',
      publicBaseUrl: 'https://cnqc.github.io/stackflow-checklist/',
      joinCode: 'sf-ab12cd',
      invitedJobTitle: 'Đối tác chiến lược',
      recipientEmail: 'partner@company.vn',
    });

    expect(bundle.joinCode).toBe('SF-AB12CD');
    expect(bundle.joinUrl).toBe('https://cnqc.github.io/stackflow-checklist/?join=SF-AB12CD');
    expect(bundle.fullMessage).toContain('https://cnqc.github.io/stackflow-checklist/?join=SF-AB12CD');
    expect(bundle.fullMessage).toContain('Đối tác chiến lược');

    const gmailUrl = new URL(bundle.gmailComposeUrl);
    expect(gmailUrl.origin).toBe('https://mail.google.com');
    expect(gmailUrl.searchParams.get('to')).toBe('partner@company.vn');
    expect(gmailUrl.searchParams.get('su')).toContain('Hợp Tác Đối Tác Q4');
    expect(gmailUrl.searchParams.get('body')).toContain('?join=SF-AB12CD');

    expect(bundle.mailtoUrl).toContain('mailto:partner%40company.vn?');

    const tgUrl = new URL(bundle.telegramShareUrl);
    expect(tgUrl.origin).toBe('https://t.me');
    expect(tgUrl.pathname).toBe('/share/url');
    expect(tgUrl.searchParams.get('url')).toBe(
      'https://cnqc.github.io/stackflow-checklist/?join=SF-AB12CD',
    );
    expect(tgUrl.searchParams.get('text')).toContain('PARTNER-Q4');
  });

  it('extracts join codes from multi-line chat messages, hash fragments, and encoded URLs', () => {
    expect(extractJoinCode('Mã tham gia nhanh: SF-8899AA (bấm vào nhóm)')).toBe('SF-8899AA');
    expect(extractJoinCode('#join=sf-7766bb')).toBe('SF-7766BB');
    expect(
      extractJoinCode('https%3A%2F%2Fcnqc.github.io%2Fstackflow-checklist%2F%3Fjoin%3DSF-ENCODE1'),
    ).toBe('SF-ENCODE1');
  });

  it('detects embedded Zalo/Messenger WebViews and builds Android Chrome intent fallback', () => {
    expect(
      isEmbeddedChatWebView('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Zalo/24.09.01'),
    ).toBe(true);
    expect(
      isEmbeddedChatWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148 [FBAN/FBIOS]'),
    ).toBe(true);
    expect(
      isEmbeddedChatWebView(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
      ),
    ).toBe(false);

    const intent = buildAndroidChromeIntentUrl(
      'https://cnqc.github.io/stackflow-checklist/?join=SF-AB12CD',
    );
    expect(intent).toContain('intent://cnqc.github.io/stackflow-checklist/?join=SF-AB12CD#Intent;');
    expect(intent).toContain('package=com.android.chrome');
  });

  it('translates ZodError and raw PostgreSQL invite errors into friendly Vietnamese', () => {
    const schema = z.string().min(5, 'Cần ít nhất 5 ký tự.');
    const parsed = schema.safeParse('ab');
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(translateAccountError(parsed.error)).toBe('Cần ít nhất 5 ký tự.');
    }

    expect(translateAccountError(new Error('Account is already a member'))).toContain(
      'đã là thành viên',
    );
    expect(translateAccountError(new Error('Join code unavailable or expired'))).toContain(
      'hết hạn',
    );
  });
});
