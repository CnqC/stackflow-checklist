import { useState, type FormEvent } from 'react';
import { Palette } from 'lucide-react';
import { getInitials, MEMBER_PALETTE } from '../../core/domain/stackDomain';

interface Props {
  busy: boolean;
  isAdmin: boolean;
  identityName: string;
  onCreate: (input: {
    code: string;
    name: string;
    description: string;
    jobTitle: string;
    avatarColor: string;
    ownerEmail?: string;
  }) => Promise<void>;
  onCancel: () => void;
}

export function DashboardCreateProjectForm({
  busy,
  isAdmin,
  identityName,
  onCreate,
  onCancel,
}: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [jobTitle, setJobTitle] = useState('Chủ dự án');
  const [avatarColor, setAvatarColor] = useState<string>(MEMBER_PALETTE[0]!);
  const [ownerEmail, setOwnerEmail] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onCreate({
      code,
      name,
      description,
      jobTitle,
      avatarColor,
      ...(isAdmin ? { ownerEmail } : {}),
    });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="mb-6 grid gap-4 rounded-2xl border border-indigo-500/35 bg-slate-900 p-5 shadow-xl sm:grid-cols-2"
    >
      <label className="text-xs font-semibold text-slate-300">
        Tên dự án *
        <input
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => {
            const nextName = e.target.value;
            setName(nextName);
            if (!code) {
              setCode(
                nextName
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toUpperCase()
                  .replace(/[^A-Z0-9]+/g, '-')
                  .replace(/^-|-$/g, '')
                  .slice(0, 16),
              );
            }
          }}
          placeholder="VD: Ra mắt App Mobile Q4"
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label className="text-xs font-semibold text-slate-300">
        Mã dự án ngắn *
        <input
          required
          minLength={2}
          maxLength={32}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="MOBILE-Q4"
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <label className="text-xs font-semibold text-slate-300">
        Vai trò của bạn trong dự án
        <input
          maxLength={80}
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="VD: Tech Lead, PM, Design..."
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </label>

      <div className="text-xs font-semibold text-slate-300">
        <span className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5 text-indigo-400" />
          Màu Avatar của bạn ({getInitials(identityName)})
        </span>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {MEMBER_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setAvatarColor(hex)}
              aria-label={`Chọn màu ${hex}`}
              style={{ backgroundColor: hex }}
              className={`h-7 w-7 rounded-lg transition cursor-pointer ${
                avatarColor === hex ? 'scale-110 ring-2 ring-white' : 'opacity-75 hover:opacity-100'
              }`}
            />
          ))}
        </div>
      </div>

      <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
        Mô tả mục tiêu ngắn (Tuỳ chọn)
        <input
          maxLength={400}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tóm tắt mục tiêu để cả nhóm nắm nhanh khi vào bảng..."
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </label>

      {isAdmin && (
        <label className="text-xs font-semibold text-slate-300 sm:col-span-2">
          Email Google của Chủ dự án *
          <input
            type="email"
            required
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="owner@gmail.com"
            className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-foreground"
          />
        </label>
      )}

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
        >
          {busy ? 'Đang khởi tạo...' : 'Tạo & Mở dự án'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}
