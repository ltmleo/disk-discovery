import type { Album } from './types';

/**
 * Cover art via Cover Art Archive (hotlinked, nothing hosted in the repo).
 * If an album has no MBID in the dataset, it is resolved once through the
 * MusicBrainz search API (CORS-enabled) and cached in localStorage.
 *
 * MusicBrainz asks for ≤1 req/s per client, so lookups are serialised.
 */
const CACHE_KEY = 'disk-discovery:mbid';
const MB_GAP_MS = 1100;

type Cache = Record<string, string | null>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(cache: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

let queue: Promise<unknown> = Promise.resolve();
const inflight = new Map<string, Promise<string | null>>();

function lucene(s: string): string {
  return `"${s.replace(/["\\]/g, '\\$&')}"`;
}

async function lookupMbid(album: Album): Promise<string | null> {
  const q = `releasegroup:${lucene(album.title)} AND artist:${lucene(album.artist)} AND primarytype:album`;
  const url = `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=5&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const data = (await res.json()) as { 'release-groups'?: { id: string; score: number }[] };
  const best = data['release-groups']?.[0];
  return best && best.score >= 90 ? best.id : null;
}

export function resolveMbid(album: Album): Promise<string | null> {
  if (album.mbid) return Promise.resolve(album.mbid);
  const cache = readCache();
  if (album.id in cache) return Promise.resolve(cache[album.id] ?? null);

  const existing = inflight.get(album.id);
  if (existing) return existing;

  const job = queue
    .then(() => lookupMbid(album))
    .then(
      (mbid) => {
        writeCache({ ...readCache(), [album.id]: mbid });
        return mbid;
      },
      // Network errors are not cached, so a later visit can retry.
      () => null,
    )
    .finally(() => inflight.delete(album.id));

  queue = job.then(() => new Promise((r) => setTimeout(r, MB_GAP_MS)));
  inflight.set(album.id, job);
  return job;
}

export function coverUrl(mbid: string, size: 250 | 500 | 1200 = 500): string {
  return `https://coverartarchive.org/release-group/${mbid}/front-${size}`;
}

export function spotifyUrl(album: Album): string {
  return album.spotifyId
    ? `https://open.spotify.com/album/${album.spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${album.title} ${album.artist}`)}`;
}
