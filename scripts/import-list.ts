/**
 * Imports every album of the Rolling Stone 2020 list that is not in the dataset yet.
 *
 *   Facts (rank, artist, title, label, year) come from scripts/data/rs2020.json.
 *   Store data (genre, tracklist, artwork, preview) comes from the artist's iTunes discography.
 *   Editorial fields (tagline, history, trivia) are left empty, to be written by hand later.
 *
 * Idempotent and resumable: albums already present (by rank) are skipped, and every album is
 * written as soon as it is resolved, so an interrupted run just continues where it stopped.
 *
 *   npm run import              # add albums missing from the dataset
 *   npm run import -- --repair  # re-resolve imported albums that have no tracks yet
 *
 * Store names sometimes differ from the list ("White Album" is "The Beatles" in the store);
 * scripts/data/store-aliases.json maps a rank to the store's { artist?, title? }.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALBUMS } from '../src/data/albums';
import type { MediaEntry } from '../src/data/media';
import { rarityForRank } from '../src/rarity';
import type { Album, AlbumContent, RarityId } from '../src/types';
import { artworkTemplate, norm, rankCollections, type ItunesItem } from '../src/net/match';
import { discography, itunes, topSongs, tracklist } from './lib/itunes';
import { loadMedia, saveMedia } from './lib/media-store';

interface Row {
  rank: number;
  artist: string;
  title: string;
  label: string;
  year: number;
}

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const LIST: Row[] = JSON.parse(readFileSync(here('./data/rs2020.json'), 'utf8'));
const TIER_FILE: Record<RarityId, string> = {
  legendary: here('../src/data/albums/legendary.ts'),
  epic: here('../src/data/albums/epic.ts'),
  rare: here('../src/data/albums/rare.ts'),
  uncommon: here('../src/data/albums/uncommon.ts'),
  common: here('../src/data/albums/common.ts'),
};
const CONTENT_DIR = here('../src/data/content/');
const MEDIA_VERSION = 3;
const REPAIR = process.argv.includes('--repair');
const NORMALIZE = process.argv.includes('--normalize');
const ALIASES: Record<string, { artist?: string; title?: string }> = JSON.parse(
  readFileSync(here('./data/store-aliases.json'), 'utf8'),
);

/** Store genres → the labels used on the cards. Unknown genres pass through unchanged. */
const GENRES: Record<string, string> = {
  Alternative: 'Alternativo',
  'Hip-Hop/Rap': 'Hip-hop',
  'R&B/Soul': 'R&B / Soul',
  Electronic: 'Eletrônica',
  'Singer/Songwriter': 'Cantor-compositor',
  Soundtrack: 'Trilha sonora',
  Latin: 'Latina',
  'Urbano latino': 'Urbano latino',
  Worldwide: 'World music',
  African: 'Música africana',
  Reggae: 'Reggae',
  'Hard Rock': 'Hard rock',
  'Indie Rock': 'Indie rock',
  Psychedelic: 'Rock psicodélico',
  Christian: 'Gospel',
  'Christian & Gospel': 'Gospel',
  Vocal: 'Vocal',
  Comedy: 'Comédia',
};

const slug = (s: string) =>
  norm(s)
    .replace(/\s+/g, '-')
    .replace(/^the-/, '')
    .slice(0, 40)
    .replace(/-+$/, '');

/**
 * Store titles carry reissue/packaging noise: "- Remastered 2009", "(2019 Digital Master)",
 * "(Single Version)", "(1997 Mix)", and live albums repeat "(Live at <venue>, <date>)" on every
 * track. Strip those; keep meaningful markers like "(Live)", "feat." or "(Taylor's Version)".
 */
const REISSUE =
  /remaster|\bmono\b|\bstereo\b|deluxe|bonus|expanded|anniversary|digital master|single version|\b\d{4} mix\b|from the vault|\blive (at|in|from)\b/i;
export function cleanTitle(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, (m) => (REISSUE.test(m) ? '' : m))
    .replace(/\s+-\s+.*$/, (m) => (REISSUE.test(m) ? '' : m))
    .trim();
}

/** Deluxe editions append demos/live takes after the original album; keep the original running order. */
// "live" only as a recording marker: "(Live)", "Live at/in/from" (not "I Don't Live Today").
const EXTRA =
  /\b(demo|bonus|alternate|outtake|rehearsal|instrumental|session|take \d|early version|rough mix)\b|\(live\b|\blive (at|in|from)\b|- live\b/i;

function tsEntry(a: Album): string {
  const keys = ['id', 'rank', 'title', 'artist', 'year', 'label', 'genre', 'tagline', 'previewTrack'] as const;
  return `  {\n${keys
    .filter((k) => a[k] !== undefined)
    .map((k) => `    ${k}: ${JSON.stringify(a[k])},`)
    .join('\n')}\n  },\n`;
}

function appendToTier(a: Album): void {
  const file = TIER_FILE[rarityForRank(a.rank).id];
  const src = readFileSync(file, 'utf8');
  const i = src.lastIndexOf('];');
  writeFileSync(file, src.slice(0, i) + tsEntry(a) + src.slice(i));
}

async function resolve(row: Row) {
  const alias = ALIASES[String(row.rank)] ?? {};
  const like = { title: alias.title ?? row.title, artist: alias.artist ?? row.artist };
  let candidates = rankCollections(await discography(like.artist), like);
  // Fallback for artists whose store page is split (e.g. "X and the Y" vs "X").
  if (!candidates.length) candidates = rankCollections(await itunes({ entity: 'album', term: `${like.artist} ${like.title}` }), like);

  // Some store editions list no purchasable tracks: fall through to the next-best edition.
  let coll: ItunesItem | null = null;
  let tracks: ItunesItem[] = [];
  for (const c of candidates.slice(0, 4)) {
    if (!c.collectionId) continue;
    tracks = await tracklist(c.collectionId);
    if (tracks.length) {
      coll = c;
      break;
    }
  }
  if (!coll) return null;

  const deluxe = /deluxe|expanded|anniversary|edition|super/i.test(coll.collectionName ?? '');
  if (deluxe) {
    // Bonus discs (demos, live sets, remixes) come after disc 1: keep the original album.
    if (tracks.some((t) => (t.discNumber ?? 1) > 1)) tracks = tracks.filter((t) => (t.discNumber ?? 1) === 1);
    // Single-disc deluxe editions often restart with alternate takes of track 1.
    const opener = norm(cleanTitle(tracks[0]?.trackName ?? ''));
    const repeat = tracks.findIndex((t, i) => i > 4 && norm(cleanTitle(t.trackName ?? '')) === opener);
    if (repeat > 0) tracks = tracks.slice(0, repeat);
    const firstExtra = tracks.findIndex((t) => EXTRA.test(t.trackName ?? ''));
    if (firstExtra > 4) tracks = tracks.slice(0, firstExtra);
  }

  // Preview: the album track that ranks highest among the artist's songs in the store
  // (a decent proxy for "the song people know"), else the opening track.
  const top = await topSongs(like.artist);
  const inAlbum = new Set(tracks.map((t) => norm(cleanTitle(t.trackName ?? ''))));
  const hit = top.find((s) => s.previewUrl && inAlbum.has(norm(cleanTitle(s.trackName ?? ''))));
  const featured = hit
    ? tracks.find((t) => norm(cleanTitle(t.trackName ?? '')) === norm(cleanTitle(hit.trackName ?? '')))
    : tracks.find((t) => t.previewUrl);

  return {
    genre: coll.primaryGenreName ? (GENRES[coll.primaryGenreName] ?? coll.primaryGenreName) : undefined,
    art: artworkTemplate(coll),
    tracks: tracks.map((t) => cleanTitle(t.trackName ?? '')).filter(Boolean),
    previewTrack: featured ? cleanTitle(featured.trackName ?? '') : undefined,
    previewUrl: (featured?.previewUrl ?? hit?.previewUrl) || null,
  };
}

/** --repair: fill tracks/genre/preview/art for imported albums that came back empty. */
async function repair(media: Record<string, MediaEntry>) {
  const empty = ALBUMS.filter((a) => {
    const file = `${CONTENT_DIR}${a.id}.json`;
    return existsSync(file) && (JSON.parse(readFileSync(file, 'utf8')) as AlbumContent).tracks.length === 0;
  });
  console.log(`repair: ${empty.length} album(s) without tracks`);
  for (const a of empty) {
    const row = LIST.find((r) => r.rank === a.rank)!;
    const info = await resolve(row).catch(() => null);
    if (!info) {
      console.log(`#${a.rank} ${a.artist} – ${a.title}: still NOT FOUND`);
      continue;
    }
    const content: AlbumContent = { tracks: info.tracks.map((title) => ({ title })) };
    writeFileSync(`${CONTENT_DIR}${a.id}.json`, `${JSON.stringify(content, null, 2)}\n`);
    // Patch the card in place: add genre/previewTrack right after its label line.
    const file = TIER_FILE[rarityForRank(a.rank).id];
    const src = readFileSync(file, 'utf8');
    const marker = `    id: ${JSON.stringify(a.id)},`;
    const start = src.indexOf(marker);
    const labelLine = src.indexOf('    label: ', start);
    const eol = src.indexOf('\n', labelLine) + 1;
    const extra = [
      info.genre && !a.genre ? `    genre: ${JSON.stringify(info.genre)},\n` : '',
      info.previewTrack && !a.previewTrack ? `    previewTrack: ${JSON.stringify(info.previewTrack)},\n` : '',
    ].join('');
    if (start >= 0 && labelLine > start) writeFileSync(file, src.slice(0, eol) + extra + src.slice(eol));
    media[a.id] = {
      art: info.art ?? undefined,
      previews: info.previewTrack ? { [info.previewTrack]: info.previewUrl } : {},
      v: MEDIA_VERSION,
    };
    saveMedia(media);
    console.log(`#${a.rank} ${a.artist} – ${a.title}: repaired, ${info.tracks.length} tracks, preview "${info.previewTrack ?? '-'}"`);
  }
}

/** --normalize: re-apply cleanTitle to every album's tracks, previewTrack and media keys (offline). */
function normalize(media: Record<string, MediaEntry>) {
  let changed = 0;
  for (const a of ALBUMS) {
    const file = `${CONTENT_DIR}${a.id}.json`;
    const content = JSON.parse(readFileSync(file, 'utf8')) as AlbumContent;
    const tracks = content.tracks.map((t) => ({ ...t, title: cleanTitle(t.title) }));
    if (JSON.stringify(tracks) !== JSON.stringify(content.tracks)) {
      writeFileSync(file, `${JSON.stringify({ ...content, tracks }, null, 2)}\n`);
      changed++;
    }
    if (a.previewTrack && cleanTitle(a.previewTrack) !== a.previewTrack) {
      const clean = cleanTitle(a.previewTrack);
      const tier = TIER_FILE[rarityForRank(a.rank).id];
      const src = readFileSync(tier, 'utf8');
      const start = src.indexOf(`    id: ${JSON.stringify(a.id)},`);
      const line = `    previewTrack: ${JSON.stringify(a.previewTrack)},`;
      const at = src.indexOf(line, start);
      if (start >= 0 && at > start) writeFileSync(tier, src.slice(0, at) + `    previewTrack: ${JSON.stringify(clean)},` + src.slice(at + line.length));
      const previews = media[a.id]?.previews;
      if (previews && a.previewTrack in previews) {
        previews[clean] = previews[a.previewTrack] ?? null;
        delete previews[a.previewTrack];
      }
    }
  }
  saveMedia(media);
  console.log(`normalize: ${changed} tracklist(s) cleaned`);
}

async function main() {
  const have = new Set(ALBUMS.map((a) => a.rank));
  const ids = new Set(ALBUMS.map((a) => a.id));
  const media: Record<string, MediaEntry> = loadMedia();
  if (NORMALIZE) return normalize(media);
  if (REPAIR) return repair(media);
  const todo = LIST.filter((r) => !have.has(r.rank));
  console.log(`import: ${todo.length} album(s) to add`);

  let done = 0;
  let unmatched = 0;
  for (const row of todo) {
    let id = `${slug(row.artist)}-${slug(row.title)}`;
    if (ids.has(id)) id = `${id}-${row.rank}`;
    ids.add(id);

    let info: Awaited<ReturnType<typeof resolve>> = null;
    try {
      info = await resolve(row);
    } catch (err) {
      console.warn(`#${row.rank} ${row.artist} – ${row.title}: lookup failed (${(err as Error).message})`);
    }
    if (!info) unmatched++;

    const album: Album = {
      id,
      rank: row.rank,
      title: row.title,
      artist: row.artist,
      year: row.year,
      label: row.label,
      ...(info?.genre ? { genre: info.genre } : {}),
      ...(info?.previewTrack ? { previewTrack: info.previewTrack } : {}),
    };
    const content: AlbumContent = { tracks: (info?.tracks ?? []).map((title) => ({ title })) };

    appendToTier(album);
    writeFileSync(`${CONTENT_DIR}${id}.json`, `${JSON.stringify(content, null, 2)}\n`);
    media[id] = {
      art: info?.art ?? undefined,
      previews: album.previewTrack ? { [album.previewTrack]: info?.previewUrl ?? null } : {},
      v: MEDIA_VERSION,
    };
    saveMedia(media);

    done++;
    console.log(
      `#${row.rank} ${row.artist} – ${row.title}: ${info ? `${info.tracks.length} tracks, preview "${album.previewTrack ?? '-'}"` : 'NOT FOUND'} [${done}/${todo.length}]`,
    );
  }
  console.log(`import: added ${done}, without store match ${unmatched}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
