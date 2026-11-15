import React, { useState } from 'react';
import { ExternalLink, Link2, X } from 'lucide-react';
import { generateId } from '../../domain/stackDomain';
import type { TaskLink } from '../../types/models';

export interface DrawerLinksSectionProps {
  links: TaskLink[];
  onAddLink: (next: TaskLink[]) => void;
  onRemoveLink: (linkId: string) => void;
}

export const DrawerLinksSection: React.FC<DrawerLinksSectionProps> = ({
  links,
  onAddLink,
  onRemoveLink,
}) => {
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    const rawUrl = newLinkUrl.trim();
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const next: TaskLink[] = [
      ...links,
      {
        id: generateId(),
        label: newLinkLabel.trim() || normalizedUrl,
        url: normalizedUrl,
      },
    ];
    setNewLinkLabel('');
    setNewLinkUrl('');
    onAddLink(next);
  };

  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-2.5">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
        <Link2 className="w-4 h-4 text-sky-400" />
        Link tài liệu đính kèm (GitHub / Figma / Drive)
      </span>

      {links.length > 0 && (
        <ul className="space-y-1.5">
          {links.map((lnk) => (
            <li
              key={lnk.id}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
            >
              <a
                href={lnk.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline truncate"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{lnk.label}</span>
              </a>
              <button
                type="button"
                onClick={() => onRemoveLink(lnk.id)}
                className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
        <input
          type="text"
          value={newLinkLabel}
          onChange={(e) => setNewLinkLabel(e.target.value)}
          placeholder="Tên link (VD: Thiết kế)"
          className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-foreground focus:outline-none focus:border-indigo-500"
        />
        <div className="sm:col-span-3 flex gap-1.5">
          <input
            type="text"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            placeholder="https://..."
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-foreground focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer shrink-0"
          >
            Đính kèm
          </button>
        </div>
      </form>
    </div>
  );
};
