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
  trackNumber?: number;
  discNumber?: number;
  primaryGenreName?: string;
  trackCount?: number;
  collectionExplicitness?: string;
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

/**
 * Matching albums (collections) for a record, best first: same artist, closest title,
 * standard edition preferred, singles/EPs excluded. Callers can fall through the list when
 * the best match turns out to be unavailable (some store editions list no tracks).
 */
export function rankCollections(results: ItunesItem[], album: AlbumLike): ItunesItem[] {
  const record = norm(album.title);
  const scored: { item: ItunesItem; score: number }[] = [];
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
    if (/ - (single|ep)$/.test(raw) && !/ - (single|ep)$/i.test(album.title)) continue;
    // Censored editions and 1–3 track releases lose to a full edition when one exists.
    if (r.collectionExplicitness === 'cleaned') score -= 2;
    if ((r.trackCount ?? 99) <= 3) score -= 2;
    scored.push({ item: r, score });
  }
  // Stable sort: equal scores keep the store's order.
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}

export function pickCollection(results: ItunesItem[], album: AlbumLike): ItunesItem | null {
  return rankCollections(results, album)[0] ?? null;
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
  expandArt(template).replaceAll('{size}', String(size));

/*
 * Every store artwork URL shares the same host prefix and size suffix; the committed media file
 * stores just the middle ("~<path>") to keep the main bundle small.
 */
const ART_PREFIX = 'https://is1-ssl.mzstatic.com/image/thumb/';
const ART_SUFFIX = '/{size}x{size}bb.jpg';

export function compactArt(url: string): string {
  return url.startsWith(ART_PREFIX) && url.endsWith(ART_SUFFIX)
    ? `~${url.slice(ART_PREFIX.length, -ART_SUFFIX.length)}`
    : url;
}

export function expandArt(stored: string): string {
  return stored.startsWith('~') ? `${ART_PREFIX}${stored.slice(1)}${ART_SUFFIX}` : stored;
}
