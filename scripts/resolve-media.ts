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
import { pickArtwork, pickPreview, type ItunesItem } from '../src/net/match';

const OUT = fileURLToPath(new URL('../src/data/media.generated.json', import.meta.url));
const FORCE = process.argv.includes('--force');
const UA = 'disk-discovery/1.0';
// iTunes Search allows ~20 requests/minute; MusicBrainz asks for ≤1/s.
const ITUNES_GAP = 3200;
const MB_GAP = 1100;

/** Bump to re-try entries that came back empty under an older resolver. */
const MEDIA_VERSION = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastItunes = 0;

async function itunes(params: Record<string, string>): Promise<ItunesItem[]> {
  const wait = lastItunes + ITUNES_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastItunes = Date.now();
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ media: 'music', limit: '15', ...params })}`;
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

      // One song search serves two purposes: the preview, and an artwork fallback
      // (song results carry their album's cover, and the album search misses some catalogue titles).
      let songs: ItunesItem[] | null = null;
      const songSearch = async () => (songs ??= await itunes({ entity: 'song', term: `${album.artist} ${pt}` }));

      if (entry.previews[pt] === undefined || (entry.previews[pt] === null && stale)) {
        entry.previews[pt] = pickPreview(await songSearch(), album, pt);
        log.push(`preview:${entry.previews[pt] ? 'ok' : 'none'}`);
      }
      if (entry.art === undefined || (entry.art === null && stale)) {
        let art = pickArtwork(await itunes({ entity: 'album', term: `${album.artist} ${album.title}` }), album);
        let via = 'album';
        if (!art) {
          art = pickArtwork(await songSearch(), album);
          via = 'song';
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
