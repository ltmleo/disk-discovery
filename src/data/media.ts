/**
 * Build-time resolved media (artwork template, MusicBrainz id, preview URL),
 * produced by `npm run media` into media.generated.json. The file is optional:
 * the glob yields nothing when it doesn't exist and the app resolves at runtime.
 */
export interface MediaEntry {
  art?: string | null;
  mbid?: string | null;
  previews?: Record<string, string | null>;
}

const files = import.meta.glob<{ default: Record<string, MediaEntry> }>('./media.generated.json', { eager: true });

export const MEDIA: Record<string, MediaEntry> = Object.values(files)[0]?.default ?? {};
