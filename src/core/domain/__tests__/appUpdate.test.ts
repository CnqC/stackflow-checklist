import { describe, expect, it } from 'vitest';
import { compareVersions, isNewerRelease, parseAndroidRelease, parseWebRelease } from '../appUpdate';

describe('app updates', () => {
  it('compares all numeric version parts without string ordering mistakes', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('v2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.0')).toBeNull();
  });

  it('detects web builds within the same version and does not downgrade', () => {
    const release = { version: '1.2.0', buildId: 'new', title: 'Update', changes: [] };
    expect(isNewerRelease(release, '1.2.0', 'old')).toBe(true);
    expect(isNewerRelease(release, '1.2.0', 'new')).toBe(false);
    expect(isNewerRelease(release, '1.3.0', 'old')).toBe(false);
  });

  it('rejects invalid manifests and requires a downloadable APK in GitHub Release', () => {
    expect(parseWebRelease({ version: '1.2.0', buildId: 'abc', title: 'Update', changes: ['Fix'] })?.version).toBe('1.2.0');
    expect(parseWebRelease({ version: '1.2.0', buildId: '', title: 'Update', changes: [] })).toBeNull();
    const release = { tag_name: 'v1.3.0', name: 'StackFlow 1.3', body: '- New feature', assets: [
      { name: 'StackFlow-Checklist.apk', browser_download_url: 'https://github.com/CnqC/stackflow-checklist/releases/download/v1.3.0/StackFlow-Checklist.apk' },
    ] };
    expect(parseAndroidRelease(release)?.changes).toEqual(['New feature']);
    expect(parseAndroidRelease({ ...release, assets: [] })).toBeNull();
    expect(parseAndroidRelease({ ...release, assets: [{ name: 'StackFlow-Checklist.apk', browser_download_url: 'https://example.com/fake.apk' }] })).toBeNull();
  });
});
