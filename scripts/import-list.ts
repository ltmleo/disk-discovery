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
import { artworkTemplate, norm, pickCollection, type ItunesItem } from '../src/net/match';
import { discography, itunes, topSongs, tracklist } from './lib/itunes';

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
const MEDIA_FILE = here('../src/data/media.generated.json');
const MEDIA_VERSION = 3;
const REPAIR = process.argv.includes('--repair');
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

/** Store titles carry reissue noise ("- Remastered 2009", "(2011 Mono Mix)"); strip it for display. */
const REISSUE = /remaster|mono|stereo|deluxe|bonus|expanded|anniversary/i;
function cleanTitle(name: string): string {
  return name
    .replace(/\s*[([][^)\]]*[)\]]/g, (m) => (REISSUE.test(m) ? '' : m))
    .replace(/\s+-\s+.*$/, (m) => (REISSUE.test(m) ? '' : m))
    .trim();
}

/** Deluxe editions append demos/live takes after the original album; keep the original running order. */
const EXTRA = /\b(demo|live|bonus|alternate|outtake|rehearsal|instrumental|session|take \d|early version|rough mix)\b/i;

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
  let coll: ItunesItem | null = pickCollection(await discography(like.artist), like);
  // Fallback for artists whose store page is split (e.g. "X and the Y" vs "X").
  if (!coll) coll = pickCollection(await itunes({ entity: 'album', term: `${like.artist} ${like.title}` }), like);
  if (!coll?.collectionId) return null;

  let tracks = await tracklist(coll.collectionId);
  const deluxe = /deluxe|expanded|anniversary|edition|super/i.test(coll.collectionName ?? '');
  if (deluxe) {
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
    writeFileSync(MEDIA_FILE, `${JSON.stringify(media, null, 2)}\n`);
    console.log(`#${a.rank} ${a.artist} – ${a.title}: repaired, ${info.tracks.length} tracks, preview "${info.previewTrack ?? '-'}"`);
  }
}

async function main() {
  const have = new Set(ALBUMS.map((a) => a.rank));
  const ids = new Set(ALBUMS.map((a) => a.id));
  const media: Record<string, MediaEntry> = existsSync(MEDIA_FILE) ? JSON.parse(readFileSync(MEDIA_FILE, 'utf8')) : {};
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
    writeFileSync(MEDIA_FILE, `${JSON.stringify(media, null, 2)}\n`);

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
