import type { Album } from './types';
import { MEDIA } from './data/media';
import { jsonp, Scheduler, type Priority } from './net/jsonp';
import { artworkAt, pickArtwork, type ItunesItem } from './net/match';

/**
 * Cover art pipeline, fastest source first:
 *   1. URLs resolved at build time (media.generated.json) → no lookup at all.
 *   2. URLs resolved earlier in this browser (localStorage).
 *   3. Runtime lookup: iTunes Search (Apple CDN, fast) → MusicBrainz + Cover Art Archive.
 * Nothing is hosted in the repo; images are hotlinked.
 */

interface ArtCache {
  art?: string | null;
  mbid?: string | null;
}

const CACHE_KEY = 'disk-discovery:art:v2';

function readCache(): Record<string, ArtCache> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, ArtCache>;
  } catch {
    return {};
  }
}

let cache = readCache();

function remember(id: string, patch: ArtCache): void {
  cache = { ...cache, [id]: { ...cache[id], ...patch } };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

const caaSize = (px: number) => (px <= 250 ? 250 : px <= 500 ? 500 : 1200);
const caaUrl = (mbid: string, px: number) => `https://coverartarchive.org/release-group/${mbid}/front-${caaSize(px)}`;

/** All URLs known synchronously, best first. Empty when a lookup is still needed. */
export function artCandidates(album: Album, px: number): string[] {
  const media = MEDIA[album.id];
  const local = cache[album.id];
  const out: string[] = [];
  const art = media?.art ?? local?.art;
  if (art) out.push(artworkAt(art, px));
  const mbid = album.mbid ?? media?.mbid ?? local?.mbid;
  if (mbid) out.push(caaUrl(mbid, px));
  return out;
}

/** True when every source has been tried and none exists (avoids repeated lookups). */
function knownMissing(album: Album): boolean {
  const c = cache[album.id];
  return !!c && c.art === null && c.mbid === null;
}

// iTunes allows roughly 20 searches/minute per client; MusicBrainz asks for ≤1 req/s.
const itunesQueue = new Scheduler(2, 350);
const mbQueue = new Scheduler(1, 1100);
const lookups = new Map<string, Promise<void>>();

async function lookupItunes(album: Album): Promise<string | null> {
  const term = encodeURIComponent(`${album.artist} ${album.title}`);
  const data = await jsonp<{ results?: ItunesItem[] }>(
    `https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=10`,
  );
  return pickArtwork(data.results ?? [], album);
}

async function lookupMusicBrainz(album: Album): Promise<string | null> {
  const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
  const query = `releasegroup:${q(album.title)} AND artist:${q(album.artist)} AND primarytype:album`;
  const res = await fetch(
    `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=3&query=${encodeURIComponent(query)}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const data = (await res.json()) as { 'release-groups'?: { id: string; score: number }[] };
  const best = data['release-groups']?.[0];
  return best && best.score >= 90 ? best.id : null;
}

/** Runtime lookup, deduplicated per album. Network errors are not cached, so a later visit retries. */
function lookup(album: Album, priority: Priority): Promise<void> {
  let p = lookups.get(album.id);
  if (!p) {
    p = itunesQueue
      .run(() => lookupItunes(album), priority)
      .then(async (art) => {
        if (art) return remember(album.id, { art });
        const mbid = await mbQueue.run(() => lookupMusicBrainz(album), priority);
        remember(album.id, { art: null, mbid });
      })
      .catch(() => undefined)
      .finally(() => lookups.delete(album.id));
    lookups.set(album.id, p);
  }
  return p;
}

export async function resolveArt(album: Album, px: number, priority: Priority = 'low'): Promise<string[]> {
  const known = artCandidates(album, px);
  if (known.length || knownMissing(album)) return known;
  await lookup(album, priority);
  return artCandidates(album, px);
}

/* ---------------- Preloading ---------------- */

const decoded = new Set<string>();
const loading = new Map<string, Promise<boolean>>();

export const isDecoded = (url: string): boolean => decoded.has(url);

function loadImage(url: string, priority: Priority): Promise<boolean> {
  let p = loading.get(url);
  if (!p) {
    const img = new Image();
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = priority;
    img.src = url;
    p = img
      .decode()
      .then(() => {
        decoded.add(url);
        return true;
      })
      .catch(() => false);
    loading.set(url, p);
  }
  return p;
}

/**
 * Resolves and fully downloads + decodes the art, so when the card is mounted the
 * image paints in the same frame. Returns the first URL that loaded, if any.
 */
export async function preloadArt(album: Album, px: number, priority: Priority = 'high'): Promise<string | null> {
  for (const url of await resolveArt(album, px, priority)) {
    if (await loadImage(url, priority)) return url;
  }
  return null;
}

export function spotifyUrl(album: Album): string {
  return album.spotifyId
    ? `https://open.spotify.com/album/${album.spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(`${album.title} ${album.artist}`)}`;
}
