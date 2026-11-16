import { z } from 'zod';

export const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Mã màu Avatar không hợp lệ.');

export const ProjectCodeSchema = z
  .string()
  .trim()
  .transform((val) =>
    val
      .toUpperCase()
      .replace(/\s+/g, '-')
      .replace(/[^A-Z0-9-]/g, ''),
  )
  .refine((val) => /^[A-Z0-9][A-Z0-9-]{1,31}$/.test(val), {
    message: 'Mã dự án gồm 2–32 ký tự chữ/số hoặc dấu gạch ngang (VD: STACK-V2).',
  });

export const CreateProjectInputSchema = z.object({
  code: ProjectCodeSchema,
  name: z
    .string()
    .trim()
    .min(2, 'Tên dự án cần ít nhất 2 ký tự.')
    .max(120, 'Tên dự án tối đa 120 ký tự.'),
  description: z.string().trim().max(4000, 'Mô tả dự án tối đa 4.000 ký tự.').default(''),
  ownerEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email('Email chủ dự án không hợp lệ.')
    .optional(),
  jobTitle: z.string().trim().max(80, 'Vai trò tối đa 80 ký tự.').optional(),
  avatarColor: HexColorSchema.optional(),
});

export const InviteMemberEmailSchema = z.object({
  projectId: z.string().uuid('Mã định danh dự án không hợp lệ.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Vui lòng nhập đúng địa chỉ Gmail / Google của đồng đội.')
    .max(320),
  jobTitle: z.string().trim().max(80, 'Vai trò gợi ý tối đa 80 ký tự.').optional(),
});

export function extractJoinCode(rawInputOrUrl: string): string | null {
  const trimmed = rawInputOrUrl.trim();
  if (!trimmed) return null;

  let decoded = trimmed;
  if (trimmed.includes('%')) {
    try {
      decoded = decodeURIComponent(trimmed);
    } catch {
      decoded = trimmed;
    }
  }

  for (const source of [decoded, trimmed]) {
    const queryOrHashMatch = source.match(/[?&#]join=([a-zA-Z0-9-]{4,20})/i);
    if (queryOrHashMatch?.[1]) {
      const fromParam = queryOrHashMatch[1].trim().toUpperCase();
      if (/^SF-[A-Z0-9]{6,12}$/.test(fromParam)) return fromParam;
      if (/^[A-Z0-9]{6,12}$/.test(fromParam)) return `SF-${fromParam}`;
    }

    const inlineTokenMatch = source.match(/\bSF-([A-Z0-9]{6,12})\b/i);
    if (inlineTokenMatch?.[1]) {
      return `SF-${inlineTokenMatch[1].toUpperCase()}`;
    }
  }

  const candidate = trimmed.toUpperCase();
  if (/^SF-[A-Z0-9]{6,12}$/.test(candidate)) {
    return candidate;
  }
  if (/^[A-Z0-9]{6,12}$/.test(candidate)) {
    return `SF-${candidate}`;
  }
  return null;
}

export const JoinCodeInputSchema = z
  .string()
  .transform((raw) => extractJoinCode(raw) ?? '')
  .refine((val) => /^SF-[A-Z0-9]{6,12}$/.test(val), {
    message: 'Mã mời hoặc Link nhóm không hợp lệ (VD: SF-8A9B2C).',
  });

export const ConfigureJoinLinkInputSchema = z.object({
  projectId: z.string().uuid('Mã định danh dự án không hợp lệ.'),
  enabled: z.boolean(),
  regenerate: z.boolean().optional(),
  defaultJobTitle: z.string().trim().max(80, 'Vai trò mặc định tối đa 80 ký tự.').optional(),
  expiresInDays: z.number().int().min(0).max(365).optional(),
});

export const UpdateMyProfileInputSchema = z.object({
  projectId: z.string().uuid('Mã định danh dự án không hợp lệ.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Tên hiển thị không được để trống.')
    .max(80, 'Tên hiển thị tối đa 80 ký tự.'),
  jobTitle: z.string().trim().max(80, 'Vai trò tối đa 80 ký tự.').default(''),
  avatarColor: HexColorSchema.default('#6366f1'),
});

export const UpdateMemberRoleInputSchema = z.object({
  projectId: z.string().uuid('Mã định danh dự án không hợp lệ.'),
  memberId: z.string().uuid('Mã thành viên không hợp lệ.'),
  jobTitle: z.string().trim().max(80, 'Vai trò tối đa 80 ký tự.').default(''),
});

export function buildZaloInviteMessage(params: {
  projectName: string;
  projectCode: string;
  joinCode: string;
  webOrigin: string;
  apkDownloadUrl: string;
}): { joinUrl: string; message: string } {
  const cleanOrigin = params.webOrigin.replace(/\/+$/, '');
  const joinUrl = `${cleanOrigin}/?join=${encodeURIComponent(params.joinCode)}`;
  const lines = [
    `🚀 Mời bạn vào dự án "${params.projectName}" (${params.projectCode}) trên StackFlow!`,
    ``,
    `👉 Cách 1 (Nhanh nhất trên Máy tính & Điện thoại):`,
    `Bấm vào link dưới đây rồi đăng nhập bằng Google là vào thẳng nhóm:`,
    `${joinUrl}`,
    ``,
    `🔑 Mã tham gia nhanh (nếu mở bằng App Android/Desktop): ${params.joinCode}`,
    `📱 Tải App Android (.apk): ${params.apkDownloadUrl}`,
  ];
  return { joinUrl, message: lines.join('\n') };
}
