/**
 * Pure matching helpers shared by the browser (runtime fallback) and the
 * build-time resolver script. No DOM, no fetch.
 */
export const norm = (s = ''): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface ItunesItem {
  wrapperType?: string;
  kind?: string;
  artistId?: number;
  collectionId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface AlbumLike {
  title: string;
  artist: string;
}

const NOISE = /\b(live|remix|demo|edit|karaoke|instrumental|acoustic|tribute|cover)\b/;

/** Artist names on stores vary ("Prince and the Revolution" vs "Prince"); accept either containing the other. */
function sameArtist(candidate: string | undefined, artist: string): boolean {
  const a = norm(candidate);
  const b = norm(artist);
  return !!a && (a.includes(b) || b.includes(a));
}

/** Best preview for a track: same artist required, exact title and same album preferred. */
export function pickPreview(results: ItunesItem[], album: AlbumLike, track: string): string | null {
  const title = norm(track);
  const record = norm(album.title);
  let best: { url: string; score: number } | null = null;
  for (const r of results) {
    if (!r.previewUrl || !sameArtist(r.artistName, album.artist)) continue;
    const name = norm(r.trackName);
    let score = 0;
    if (name === title) score += 4;
    else if (name.startsWith(title) || title.startsWith(name)) score += 2;
    else continue;
    if (norm(r.collectionName).includes(record)) score += 2;
    if (!NOISE.test((r.trackName ?? '').toLowerCase())) score += 1;
    if (!best || score > best.score) best = { url: r.previewUrl, score };
  }
  return best?.url ?? null;
}

/** Best matching album (collection) for a record: same artist, closest title, standard edition preferred. */
export function pickCollection(results: ItunesItem[], album: AlbumLike): ItunesItem | null {
  const record = norm(album.title);
  let best: { item: ItunesItem; score: number } | null = null;
  for (const r of results) {
    if (!r.artworkUrl100 || !r.collectionName || !sameArtist(r.artistName, album.artist)) continue;
    const name = norm(r.collectionName);
    let score = 0;
    if (name === record) score += 4;
    else if (name.startsWith(record) || record.startsWith(name)) score += 2;
    else continue;
    // Check the raw name: edition markers usually live in the parentheses norm() strips.
    const raw = r.collectionName.toLowerCase();
    if (!NOISE.test(raw)) score += 1;
    if (!/deluxe|anniversary|expanded|edition|remaster/.test(raw)) score += 1;
    if (!best || score > best.score) best = { item: r, score };
  }
  return best?.item ?? null;
}

/** Artwork template with `{size}`, so callers pick the resolution (the CDN serves any NxN). */
export function artworkTemplate(item: ItunesItem | null): string | null {
  return item?.artworkUrl100 ? item.artworkUrl100.replace(/\/\d+x\d+(bb)?(\.\w+)$/, '/{size}x{size}bb$2') : null;
}

export function pickArtwork(results: ItunesItem[], album: AlbumLike): string | null {
  return artworkTemplate(pickCollection(results, album));
}

/** Exact artist id from a musicArtist search (avoids tribute/cover acts with similar names). */
export function pickArtistId(results: ItunesItem[], artist: string): number | null {
  const target = norm(artist);
  const exact = results.find((r) => r.artistId && norm(r.artistName) === target);
  return exact?.artistId ?? results.find((r) => r.artistId && sameArtist(r.artistName, artist))?.artistId ?? null;
}

export const artworkAt = (template: string, size: number): string =>
  template.replaceAll('{size}', String(size));
