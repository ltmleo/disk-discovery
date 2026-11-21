/**
 * Resolves artwork, MusicBrainz ids and preview URLs for every album at build time
 * and writes src/data/media.art.json + media.previews.json (see lib/media-store.ts), so the
 * site needs no lookups at runtime.
 *
 * Incremental: entries already in the file are kept; only missing ones are fetched.
 * Never fails the build: anything unresolved is left for the runtime fallback.
 *
 *   npm run media            # resolve missing
 *   npm run media -- --force           # re-resolve everything
 *   npm run media -- --check-previews  # HEAD every preview URL, re-resolve the dead ones
 */
import { ALBUMS } from '../src/data/albums';
import type { MediaEntry } from '../src/data/media';
import { artworkTemplate, pickArtwork, pickCollection, pickPreview, type ItunesItem } from '../src/net/match';
import { discography, itunes, tracklist } from './lib/itunes';
import { loadMedia, saveMedia } from './lib/media-store';

const FORCE = process.argv.includes('--force');
const CHECK_PREVIEWS = process.argv.includes('--check-previews');
const UA = 'disk-discovery/1.0';
// MusicBrainz asks for ≤1 request/s. (iTunes pacing lives in lib/itunes.ts.)
const MB_GAP = 1100;

/** Bump to re-try entries that came back empty under an older resolver. */
const MEDIA_VERSION = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
 * Store preview URLs are not permanent (Apple re-encodes and moves files). HEAD each one and
 * forget the dead ones, so the normal pass below resolves them again.
 */
async function dropDeadPreviews(media: Record<string, MediaEntry>): Promise<number> {
  const checks = Object.entries(media).flatMap(([id, m]) =>
    Object.entries(m.previews ?? {})
      .filter(([, url]) => url)
      .map(([track, url]) => ({ id, track, url: url! })),
  );
  let dead = 0;
  const queue = [...checks];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const ok = await fetch(c.url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
          .then((r) => r.ok)
          .catch(() => true); // network hiccup is not a dead URL: keep it
        if (!ok) {
          delete media[c.id]!.previews![c.track];
          dead++;
          console.log(`dead preview: ${c.id} · ${c.track}`);
        }
      }
    }),
  );
  console.log(`previews checked: ${checks.length}, dead: ${dead}`);
  return dead;
}

async function main() {
  const media: Record<string, MediaEntry> = FORCE ? {} : loadMedia();
  if (CHECK_PREVIEWS) await dropDeadPreviews(media);
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
      // Albums without a known track (not in the store) only get artwork.
      const pt = album.previewTrack ?? '';
      const previews = (entry.previews ??= {});

      // Primary: find the exact album in the artist's discography, then read its tracklist
      // for the preview. Fallbacks: plain album search, then song search.
      const needPreview = !!pt && (previews[pt] === undefined || (previews[pt] === null && stale));
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
          const tracks = await tracklist(coll.collectionId);
          const url = pickPreview(tracks, album, pt);
          if (url) {
            previews[pt] = url;
            log.push('preview:ok (tracklist)');
          }
        }
      }
      if (needPreview && !previews[pt]) {
        previews[pt] = pickPreview(await songSearch(), album, pt);
        log.push(`preview:${previews[pt] ? 'ok (search)' : 'none'}`);
      }
      if (needArt && !entry.art) {
        let art = pickArtwork(await itunes({ entity: 'album', term: `${album.artist} ${album.title}` }), album);
        let via = 'album search';
        if (!art) {
          art = pt ? pickArtwork(await songSearch(), album) : null;
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

  saveMedia(media);
  console.log(`media: ${changed} album(s) updated, ${ALBUMS.length} total`);
}

main().catch((err) => {
  console.error('media resolution failed (runtime fallback will be used):', err);
  process.exitCode = 0;
});
