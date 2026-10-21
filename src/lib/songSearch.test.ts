import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const song = (overrides: Record<string, unknown> = {}) => ({
  trackId: 1, trackName: '晴天', artistName: '周杰伦', collectionName: '叶惠美',
  trackTimeMillis: 269000, trackViewUrl: 'https://music.apple.com/tw/album/song/123?i=456',
  ...overrides,
});
const ok = (results: unknown[]) => ({ ok: true, status: 200, json: async () => ({ results }) });

describe('song version search', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('does not query without a submitted nonempty term, and limits the request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal('fetch', fetchMock);
    const { searchSongVersions } = await import('./songSearch');
    expect(await searchSongVersions('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    await searchSongVersions(`  ${'歌'.repeat(120)}  `);
    const endpoint = fetchMock.mock.calls[0][0] as URL;
    expect(endpoint.searchParams.get('term')).toHaveLength(100);
    expect(endpoint.searchParams.get('country')).toBe('tw');
    expect(endpoint.searchParams.get('limit')).toBe('6');
    expect(fetchMock.mock.calls[0][1].credentials).toBe('omit');
  });

  it('discards invalid records and unsafe URLs while preserving valid results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok([
      song(),
      song({ trackId: 2, trackViewUrl: 'javascript:alert(1)' }),
      song({ trackId: 3, trackViewUrl: 'https://music.apple.com.evil.test/song' }),
      song({ trackId: 4, trackViewUrl: 'https://evil.test@music.apple.com/song' }),
      song({ trackId: 5, trackName: '' }),
      song({ trackId: 6, trackViewUrl: 'https://itunes.apple.com/tw/album/123', collectionName: null, trackTimeMillis: NaN }),
      song(),
    ])));
    const { searchSongVersions } = await import('./songSearch');
    const results = await searchSongVersions('晴天 周杰伦');
    expect(results.map((result) => result.id)).toEqual([1, 6]);
    expect(results[1].album).toBe('专辑信息待补充');
    expect(results[1].durationMs).toBe(0);
  });

  it('returns independent cached copies and avoids another network request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([song()]));
    vi.stubGlobal('fetch', fetchMock);
    const { searchSongVersions } = await import('./songSearch');
    const first = await searchSongVersions('  晴天  ');
    first[0].title = 'changed';
    const second = await searchSongVersions('晴天');
    expect(second[0].title).toBe('晴天');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('isolates cancellation between queries and does not cache aborted results', async () => {
    const fetchMock = vi.fn((_url: URL, options: RequestInit) => new Promise((resolve, reject) => {
      if (_url.searchParams.get('term') === '另一首') { resolve(ok([song({ trackId: 2 })])); return; }
      options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { searchSongVersions } = await import('./songSearch');
    const controller = new AbortController();
    const cancelled = searchSongVersions('晴天', controller.signal);
    const other = searchSongVersions('另一首');
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    expect((await other)[0].id).toBe(2);
    fetchMock.mockResolvedValueOnce(ok([song()]));
    expect((await searchSongVersions('晴天'))[0].id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('times out at eight seconds and removes the caller abort listener', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', vi.fn((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    })));
    const { searchSongVersions } = await import('./songSearch');
    const pending = expect(searchSongVersions('晴天', controller.signal)).rejects.toThrow('8 秒');
    await vi.advanceTimersByTimeAsync(8000);
    await pending;
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
