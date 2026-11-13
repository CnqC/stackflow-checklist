import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateService } from '../updateService';

describe('updateService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches an uncached web manifest, detects a newer build, and handles a retryable failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: __APP_VERSION__, buildId: 'new-build', title: 'Update', changes: ['Change'] }), { status: 200 }))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);

    expect((await updateService.check(true)).status).toBe('available');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store' });
    expect((await updateService.check(true)).status).toBe('error');
    expect(updateService.getState().error).toMatch(/kiểm tra mạng/);
  });
});
