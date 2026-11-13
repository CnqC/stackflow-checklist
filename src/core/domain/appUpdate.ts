export interface ReleaseInfo {
  version: string;
  buildId?: string;
  title: string;
  changes: string[];
  downloadUrl?: string;
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

export function compareVersions(left: string, right: string): number | null {
  const a = VERSION.exec(left.replace(/^v/, ''));
  const b = VERSION.exec(right.replace(/^v/, ''));
  if (!a || !b) return null;
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function isNewerRelease(latest: ReleaseInfo, currentVersion: string, currentBuildId?: string): boolean {
  const comparison = compareVersions(latest.version, currentVersion);
  if (comparison === null) return false;
  if (comparison > 0) return true;
  return comparison === 0 && Boolean(latest.buildId && currentBuildId && latest.buildId !== currentBuildId);
}

export function parseWebRelease(raw: unknown): ReleaseInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.version !== 'string' || !VERSION.test(value.version) ||
    typeof value.buildId !== 'string' || !value.buildId ||
    typeof value.title !== 'string' || !Array.isArray(value.changes) ||
    !value.changes.every((change) => typeof change === 'string')) return null;
  return { version: value.version, buildId: value.buildId, title: value.title, changes: value.changes };
}

export function parseAndroidRelease(raw: unknown): ReleaseInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const version = typeof value.tag_name === 'string' ? value.tag_name.replace(/^v/, '') : '';
  if (!VERSION.test(version) || !Array.isArray(value.assets)) return null;
  const asset = value.assets.find((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Record<string, unknown>;
    return candidate.name === 'StackFlow-Checklist.apk' &&
      typeof candidate.browser_download_url === 'string' &&
      candidate.browser_download_url.startsWith('https://github.com/CnqC/stackflow-checklist/releases/download/');
  }) as Record<string, unknown> | undefined;
  if (!asset) return null;
  const body = typeof value.body === 'string' ? value.body : '';
  const changes = body.split(/\r?\n/).map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line && !line.startsWith('#')).slice(0, 10);
  return { version, title: typeof value.name === 'string' && value.name ? value.name : `StackFlow ${version}`,
    changes, downloadUrl: asset.browser_download_url as string };
}
