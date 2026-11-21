/**
 * Resolves artwork, MusicBrainz ids and preview URLs for every album at build time
 * and writes src/data/media.generated.json, so the site needs no lookups at runtime.
 *
 * Incremental: entries already in the file are kept; only missing ones are fetched.
 * Never fails the build: anything unresolved is left for the runtime fallback.
 *
 *   npm run media            # resolve missing
 *   npm run media -- --force # re-resolve everything
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALBUMS } from '../src/data/albums';
import type { MediaEntry } from '../src/data/media';
import { artworkTemplate, pickArtistId, pickArtwork, pickCollection, pickPreview, type ItunesItem } from '../src/net/match';

const OUT = fileURLToPath(new URL('../src/data/media.generated.json', import.meta.url));
const FORCE = process.argv.includes('--force');
const UA = 'disk-discovery/1.0';
// iTunes Search allows ~20 requests/minute; MusicBrainz asks for ≤1/s.
const ITUNES_GAP = 3200;
const MB_GAP = 1100;

/** Bump to re-try entries that came back empty under an older resolver. */
const MEDIA_VERSION = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastItunes = 0;

async function itunes(params: Record<string, string>, endpoint: 'search' | 'lookup' = 'search'): Promise<ItunesItem[]> {
  const wait = lastItunes + ITUNES_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastItunes = Date.now();
  const query = endpoint === 'search' ? { media: 'music', limit: '15', ...params } : params;
  const url = `https://itunes.apple.com/${endpoint}?${new URLSearchParams(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  return ((await res.json()) as { results?: ItunesItem[] }).results ?? [];
}

/** MusicBrainz answers 503 when busy (shared CI IPs hit this): back off and retry. */
async function musicbrainz(title: string, artist: string, attempt = 1): Promise<string | null> {
  await sleep(MB_GAP * attempt * attempt);
  const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
  const query = `releasegroup:${q(title)} AND artist:${q(artist)} AND primarytype:album`;
  const res = await fetch(
    `https://musicbrainz.org/ws/2/release-group/?fmt=json&limit=3&query=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
  );
  if (res.status === 503 && attempt < 4) return musicbrainz(title, artist, attempt + 1);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const best = ((await res.json()) as { 'release-groups'?: { id: string; score: number }[] })['release-groups']?.[0];
  return best && best.score >= 90 ? best.id : null;
}

/**
 * Full discography of an artist (cached per artist). Plain search is relevance-noisy:
 * tributes and singles can push the original album out of the results entirely.
 */
const discographies = new Map<string, Promise<ItunesItem[]>>();
function discography(artist: string): Promise<ItunesItem[]> {
  let p = discographies.get(artist);
  if (!p) {
    p = (async () => {
      const id = pickArtistId(await itunes({ entity: 'musicArtist', term: artist, limit: '10' }), artist);
      if (!id) return [];
      return (await itunes({ id: String(id), entity: 'album', limit: '200' }, 'lookup')).filter((r) => r.wrapperType === 'collection');
    })();
    discographies.set(artist, p);
  }
  return p;
}

async function main() {
  const media: Record<string, MediaEntry> =
    !FORCE && existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as Record<string, MediaEntry>) : {};
  let changed = 0;
  // Circuit breaker: if the APIs are unreachable (offline, blocked), stop early
  // instead of waiting out every rate-limit gap.
  let consecutiveErrors = 0;

  for (const album of ALBUMS) {
    if (consecutiveErrors >= 3) {
      console.warn('media: APIs unreachable, leaving the rest to the runtime fallback');
      break;
    }
    const entry: MediaEntry = { ...media[album.id] };
    const log: string[] = [];
    try {
      // Entries written by an older resolver get their misses (null) retried once.
      const stale = (entry.v ?? 1) < MEDIA_VERSION;
      const pt = album.previewTrack;
      entry.previews ??= {};

      // Primary: find the exact album in the artist's discography, then read its tracklist
      // for the preview. Fallbacks: plain album search, then song search.
      const needPreview = entry.previews[pt] === undefined || (entry.previews[pt] === null && stale);
      const needArt = entry.art === undefined || (entry.art === null && stale);
      let songs: ItunesItem[] | null = null;
      const songSearch = async () => (songs ??= await itunes({ entity: 'song', term: `${album.artist} ${pt}` }));

      if (needArt || needPreview) {
        const coll = pickCollection(await discography(album.artist), album);
        if (needArt && coll) {
          entry.art = artworkTemplate(coll);
          log.push('art:ok (discography)');
        }
        if (needPreview && coll?.collectionId) {
          const tracks = await itunes({ id: String(coll.collectionId), entity: 'song' }, 'lookup');
          const url = pickPreview(tracks, album, pt);
          if (url) {
            entry.previews[pt] = url;
            log.push('preview:ok (tracklist)');
          }
        }
      }
      if (needPreview && !entry.previews[pt]) {
        entry.previews[pt] = pickPreview(await songSearch(), album, pt);
        log.push(`preview:${entry.previews[pt] ? 'ok (search)' : 'none'}`);
      }
      if (needArt && !entry.art) {
        let art = pickArtwork(await itunes({ entity: 'album', term: `${album.artist} ${album.title}` }), album);
        let via = 'album search';
        if (!art) {
          art = pickArtwork(await songSearch(), album);
          via = 'song search';
        }
        entry.art = art;
        log.push(`art:${art ? `ok (${via})` : 'none'}`);
      }
      if (!entry.art && !album.mbid && (entry.mbid === undefined || (entry.mbid === null && stale))) {
        entry.mbid = await musicbrainz(album.title, album.artist);
        log.push(`mbid:${entry.mbid ? 'ok' : 'none'}`);
      }
      entry.v = MEDIA_VERSION;
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      // Keep partial progress; unresolved fields stay undefined and are retried next run.
      log.push(`error: ${(err as Error).message}`);
    }
    if (log.length) {
      changed++;
      console.log(`#${album.rank} ${album.artist} – ${album.title}: ${log.join(', ')}`);
    }
    media[album.id] = entry;
  }

  // Drop albums that no longer exist in the dataset.
  for (const id of Object.keys(media)) if (!ALBUMS.some((a) => a.id === id)) delete media[id];

  writeFileSync(OUT, `${JSON.stringify(media, null, 2)}\n`);
  console.log(`media: ${changed} album(s) updated, ${ALBUMS.length} total → ${OUT}`);
}

main().catch((err) => {
  console.error('media resolution failed (runtime fallback will be used):', err);
  process.exitCode = 0;
});
