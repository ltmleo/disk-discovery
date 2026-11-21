/**
 * Polite iTunes Search/Lookup client for build-time scripts.
 * Adaptive rate limit: starts at ITUNES_GAP ms between calls (default 1500) and backs
 * off when Apple answers 403/429/5xx, which is how it signals throttling.
 */
import { pickArtistId, type ItunesItem } from '../../src/net/match';

const UA = 'disk-discovery/1.0';
let gap = Number(process.env.ITUNES_GAP ?? 1500);
let last = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function itunes(
  params: Record<string, string>,
  endpoint: 'search' | 'lookup' = 'search',
  attempt = 1,
): Promise<ItunesItem[]> {
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const query = endpoint === 'search' ? { media: 'music', limit: '15', ...params } : params;
  const res = await fetch(`https://itunes.apple.com/${endpoint}?${new URLSearchParams(query)}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15_000),
  });
  if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < 5) {
    gap = Math.min(6000, Math.round(gap * 1.5));
    console.warn(`iTunes ${res.status}: backing off (gap now ${gap}ms)`);
    await sleep(30_000 * attempt);
    return itunes(params, endpoint, attempt + 1);
  }
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  return ((await res.json()) as { results?: ItunesItem[] }).results ?? [];
}

const memo = <T>(fn: (key: string) => Promise<T>) => {
  const cache = new Map<string, Promise<T>>();
  return (key: string) => {
    let p = cache.get(key);
    if (!p) {
      p = fn(key);
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return p;
  };
};

export const artistId = memo(async (artist) =>
  pickArtistId(await itunes({ entity: 'musicArtist', term: artist, limit: '10' }), artist),
);

/**
 * Full discography of an artist. Plain search is relevance-noisy: tributes and singles
 * can push the original album out of the results entirely.
 */
export const discography = memo(async (artist) => {
  const id = await artistId(artist);
  if (!id) return [];
  return (await itunes({ id: String(id), entity: 'album', limit: '200' }, 'lookup')).filter(
    (r) => r.wrapperType === 'collection',
  );
});

/** The artist's songs in store relevance order (roughly: most popular first). */
export const topSongs = memo(async (artist) =>
  itunes({ term: artist, entity: 'song', attribute: 'artistTerm', limit: '200' }),
);

/** Tracklist of one album, in disc/track order. */
export async function tracklist(collectionId: number): Promise<ItunesItem[]> {
  const items = await itunes({ id: String(collectionId), entity: 'song', limit: '200' }, 'lookup');
  return items
    .filter((r) => r.wrapperType === 'track' && r.kind === 'song')
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
}
