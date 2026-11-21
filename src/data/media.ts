/**
 * Build-time resolved media, produced by `npm run media` / `npm run import`
 * (see scripts/lib/media-store.ts). Split by when the site needs it:
 *   - artwork (+ MusicBrainz id) ships in the main bundle: every card shows it immediately;
 *   - preview URLs live in their own lazy chunk, fetched when a pack is shown, long before
 *     the reveal needs one.
 * Both files are optional (glob yields nothing): the app then resolves at runtime.
 */
export interface MediaEntry {
  art?: string | null;
  mbid?: string | null;
  previews?: Record<string, string | null>;
  /** Resolver version that produced this entry. */
  v?: number;
}

type ArtEntry = Omit<MediaEntry, 'previews'>;
type PreviewMap = Record<string, Record<string, string | null>>;

const artFiles = import.meta.glob<{ default: Record<string, ArtEntry> }>('./media.art.json', { eager: true });
export const ART: Record<string, ArtEntry> = Object.values(artFiles)[0]?.default ?? {};

const previewFiles = import.meta.glob<{ default: PreviewMap }>('./media.previews.json');
let previews: Promise<PreviewMap> | null = null;

export function loadPreviews(): Promise<PreviewMap> {
  if (!previews) {
    const load = Object.values(previewFiles)[0];
    previews = load ? load().then((m) => m.default) : Promise.resolve({});
    previews.catch(() => (previews = null));
  }
  return previews;
}
