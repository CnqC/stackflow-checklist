import { extractJoinCode } from './accountSchemas';

export const CANONICAL_PUBLIC_WEB_URL = 'https://cnqc.github.io/stackflow-checklist/';

export interface PublicUrlLocationInput {
  configuredBaseUrl?: string;
  protocol?: string;
  hostname?: string;
  origin?: string;
  pathname?: string;
  isNativePlatform?: boolean;
}

export interface ShareBundleParams {
  projectName: string;
  projectCode: string;
  publicBaseUrl: string;
  apkDownloadUrl?: string;
  joinCode?: string | null;
  invitedJobTitle?: string;
  recipientEmail?: string;
}

export interface ProjectShareBundle {
  joinUrl: string;
  joinCode: string | null;
  emailSubject: string;
  emailBody: string;
  fullMessage: string;
  telegramText: string;
  gmailComposeUrl: string;
  mailtoUrl: string;
  telegramShareUrl: string;
  zaloWebUrl: string;
}

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return (
    !lower ||
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '[::1]' ||
    lower === '::1' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local')
  );
}

function normalizeDirectoryPath(pathname: string | undefined): string {
  const raw = (pathname ?? '/').trim() || '/';
  const withoutIndex = raw.replace(/\/index\.html?$/i, '/');
  const withLeading = withoutIndex.startsWith('/') ? withoutIndex : `/${withoutIndex}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

export function normalizePublicBaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return CANONICAL_PUBLIC_WEB_URL;
    }
    return `${parsed.origin}${normalizeDirectoryPath(parsed.pathname)}`;
  } catch {
    return CANONICAL_PUBLIC_WEB_URL;
  }
}

export function resolvePublicWebBaseUrl(input: PublicUrlLocationInput): string {
  if (input.configuredBaseUrl?.trim()) {
    const candidate = normalizePublicBaseUrl(input.configuredBaseUrl);
    try {
      if (!isLocalHostname(new URL(candidate).hostname)) return candidate;
    } catch {
      /* Fall through */
    }
  }
  if (
    input.isNativePlatform ||
    !input.origin ||
    !input.hostname ||
    (input.protocol !== 'https:' && input.protocol !== 'http:') ||
    isLocalHostname(input.hostname)
  ) {
    return CANONICAL_PUBLIC_WEB_URL;
  }
  const cleanOrigin = input.origin.replace(/\/+$/, '');
  return `${cleanOrigin}${normalizeDirectoryPath(input.pathname)}`;
}

export function resolveOAuthRedirectUrl(input: PublicUrlLocationInput): string {
  if (
    !input.origin ||
    (input.protocol !== 'https:' && input.protocol !== 'http:')
  ) {
    return CANONICAL_PUBLIC_WEB_URL;
  }
  const cleanOrigin = input.origin.replace(/\/+$/, '');
  return `${cleanOrigin}${normalizeDirectoryPath(input.pathname)}`;
}

export function buildApkDownloadUrl(publicBaseUrl: string): string {
  const normalized = normalizePublicBaseUrl(publicBaseUrl);
  return `${normalized}StackFlow-Checklist.apk`;
}

export function buildProjectShareBundle(params: ShareBundleParams): ProjectShareBundle {
  const baseUrl = normalizePublicBaseUrl(params.publicBaseUrl);
  const joinCode = params.joinCode ? extractJoinCode(params.joinCode) : null;
  const joinUrl = joinCode ? `${baseUrl}?join=${encodeURIComponent(joinCode)}` : baseUrl;
  const apkUrl = params.apkDownloadUrl?.trim() || buildApkDownloadUrl(baseUrl);
  const cleanRole = params.invitedJobTitle?.trim() ?? '';
  const cleanEmail = params.recipientEmail?.trim().toLowerCase() ?? '';

  const roleBullet = cleanRole ? `\n• Vai trò dự kiến: ${cleanRole}` : '';
  const codeLine = joinCode ? `\n🔑 Mã tham gia dự phòng: ${joinCode}` : '';

  const fullMessage = [
    `🚀 Mời bạn tham gia dự án "${params.projectName}" (${params.projectCode}) trên StackFlow!${roleBullet}`,
    '',
    `👉 Bấm vào đường dẫn dưới đây rồi chọn "Tiếp tục với Google" là vào thẳng dự án:`,
    joinUrl,
    ...(joinCode ? ['', `🔑 Mã tham gia dự phòng: ${joinCode}`] : []),
    `📱 Tải App Android (.apk): ${apkUrl}`,
  ].join('\n');

  const telegramText = `🚀 Mời bạn tham gia dự án "${params.projectName}" (${params.projectCode}) trên StackFlow!${roleBullet}\n👉 Bấm vào link trên rồi chọn "Tiếp tục với Google" để vào thẳng dự án.${codeLine}`;

  const emailSubject = `[StackFlow] Mời tham gia dự án "${params.projectName}" (${params.projectCode})`;
  const emailBody = [
    'Xin chào,',
    '',
    `Mời bạn cùng tham gia theo dõi và phối hợp công việc trong dự án "${params.projectName}" (Mã dự án: ${params.projectCode}) trên StackFlow.`,
    ...(cleanRole ? [`• Vai trò trong dự án: ${cleanRole}`] : []),
    ...(cleanEmail ? [`• Tài khoản Google được mời: ${cleanEmail}`] : []),
    '',
    '1. Bấm vào đường dẫn tham gia dự án (trên Máy tính hoặc Điện thoại):',
    joinUrl,
    '',
    '2. Chọn "Tiếp tục với Google" để xác thực và vào thẳng bảng công việc.',
    ...(joinCode ? [`(Mã tham gia dự phòng nếu nhập thủ công: ${joinCode})`] : []),
    '',
    `Tải ứng dụng Android (.apk): ${apkUrl}`,
    '',
    'Trân trọng!',
  ].join('\n');

  const toQuery = cleanEmail ? `&to=${encodeURIComponent(cleanEmail)}` : '';
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1${toQuery}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  const mailtoRecipient = cleanEmail ? encodeURIComponent(cleanEmail) : '';
  const mailtoUrl = `mailto:${mailtoRecipient}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(joinUrl)}&text=${encodeURIComponent(telegramText)}`;

  return {
    joinUrl,
    joinCode,
    emailSubject,
    emailBody,
    fullMessage,
    telegramText,
    gmailComposeUrl,
    mailtoUrl,
    telegramShareUrl,
    zaloWebUrl: 'https://chat.zalo.me/',
  };
}

export function isEmbeddedChatWebView(userAgent: string): boolean {
  if (!userAgent) return false;
  return /\b(Zalo|ZaloTheme|ZaloPC|FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|BytedanceWebview|TikTok)\b/i.test(
    userAgent,
  );
}

export function buildAndroidChromeIntentUrl(targetHttpsUrl: string): string | null {
  try {
    const parsed = new URL(targetHttpsUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const withoutScheme = targetHttpsUrl.replace(/^https?:\/\//i, '');
    return `intent://${withoutScheme}#Intent;scheme=${parsed.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(targetHttpsUrl)};end`;
  } catch {
    return null;
  }
}

export function translateAccountError(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'issues' in cause) {
    const issues = (cause as { issues?: Array<{ message?: string }> }).issues;
    const first = issues?.[0]?.message;
    if (first) return first;
  }
  const raw = cause instanceof Error ? cause.message : String(cause ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('already a member') || lower.includes('already a project member')) {
    return 'Tài khoản Google này đã là thành viên đang hoạt động trong dự án.';
  }
  if (lower.includes('join code unavailable or expired')) {
    return 'Mã mời hoặc đường dẫn này không tồn tại, đang tạm tắt hoặc đã hết hạn.';
  }
  if (lower.includes('currently paused by project owner')) {
    return 'Quyền truy cập của bạn trong dự án này đang được Chủ dự án tạm dừng.';
  }
  if (lower.includes('reached its member limit')) {
    return 'Dự án đã đạt giới hạn tối đa 20 thành viên đang hoạt động.';
  }
  if (lower.includes('invitation unavailable') || lower.includes('invitation not found')) {
    return 'Lời mời này không còn hiệu lực hoặc đã được xử lý trước đó.';
  }
  if (lower.includes('only an owner or admin') || lower.includes('only owner or admin')) {
    return 'Chỉ Chủ dự án mới có quyền thực hiện thao tác này.';
  }
  if (lower.includes('global admin cannot join project roster')) {
    return 'Tài khoản Quản trị giám sát không tham gia trực tiếp vào danh sách thành viên.';
  }
  if (lower.includes('verified google account required')) {
    return 'Vui lòng đăng nhập bằng tài khoản Google đã xác minh.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Không thể kết nối mạng. Vui lòng kiểm tra Internet rồi thử lại.';
  }
  return raw || 'Đã xảy ra lỗi không xác định. Vui lòng thử lại.';
}
