export interface SongVersion {
  id: number;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  url: string;
}

const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ITEMS = 40;
const ALLOWED_HOSTS = new Set(['music.apple.com', 'itunes.apple.com']);
const cache = new Map<string, { expires: number; songs: SongVersion[] }>();

class SongSearchError extends Error {}

function abortError(): DOMException {
  return new DOMException('已取消歌曲查询。', 'AbortError');
}

function textField(value: unknown, length: number): string {
  return typeof value === 'string' ? value.trim().slice(0, length) : '';
}

function validSong(value: unknown): SongVersion | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const id = item.trackId;
  const title = textField(item.trackName, 200);
  const artist = textField(item.artistName, 200);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || !title || !artist) return null;
  if (typeof item.trackViewUrl !== 'string') return null;
  let url: URL;
  try { url = new URL(item.trackViewUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)
    || url.username || url.password || url.port) return null;
  const duration = item.trackTimeMillis;
  return {
    id, title, artist,
    album: textField(item.collectionName, 240) || '专辑信息待补充',
    durationMs: typeof duration === 'number' && Number.isFinite(duration)
      && duration >= 0 && duration <= 24 * 60 * 60_000 ? Math.round(duration) : 0,
    url: url.href,
  };
}

function copySongs(songs: SongVersion[]): SongVersion[] {
  return songs.map((song) => ({ ...song }));
}

/** Called only when the user submits a query. No background lookups or audio requests. */
export async function searchSongVersions(query: string, signal?: AbortSignal): Promise<SongVersion[]> {
  const term = query.trim().slice(0, 100);
  if (!term) return [];
  if (signal?.aborted) throw abortError();
  const key = term.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return copySongs(cached.songs);
  if (cached) cache.delete(key);

  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const endpoint = new URL('https://itunes.apple.com/search');
    endpoint.search = new URLSearchParams({
      term, entity: 'song', media: 'music', country: 'tw', limit: '6',
    }).toString();
    const response = await fetch(endpoint, {
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new SongSearchError(response.status === 429
      ? '歌曲查询较频繁，请稍后重试或直接搜索谱站。'
      : '歌曲版本查询暂不可用，请稍后重试或直接搜索谱站。');
    const data: unknown = await response.json();
    if (controller.signal.aborted) throw abortError();
    if (!data || typeof data !== 'object' || !Array.isArray((data as Record<string, unknown>).results)) {
      throw new SongSearchError('歌曲版本查询返回了无法读取的数据，请直接搜索谱站。');
    }
    const seen = new Set<number>();
    const songs = ((data as { results: unknown[] }).results)
      .slice(0, 100)
      .map(validSong)
      .filter((song): song is SongVersion => {
        if (!song || seen.has(song.id)) return false;
        seen.add(song.id);
        return true;
      }).slice(0, 6);
    if (cache.size >= MAX_CACHE_ITEMS) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, songs: copySongs(songs) });
    return songs;
  } catch (error) {
    if (timedOut) throw new Error('歌曲查询超过 8 秒，请重试或直接搜索谱站。');
    if (signal?.aborted || controller.signal.aborted) throw abortError();
    if (error instanceof SongSearchError) throw error;
    throw new Error('歌曲版本查询失败，请检查网络或直接搜索谱站。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
