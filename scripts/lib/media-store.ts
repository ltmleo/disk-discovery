/**
 * Build-time media store. Scripts work with one combined entry per album; on disk it is split
 * in two committed files so the site can load them differently:
 *   src/data/media.art.json       artwork + MusicBrainz id + resolver version (eager, main bundle)
 *   src/data/media.previews.json  preview URLs (lazy chunk, fetched when a pack is shown)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MediaEntry } from '../../src/data/media';
import { compactArt, expandArt } from '../../src/net/match';

const ART = fileURLToPath(new URL('../../src/data/media.art.json', import.meta.url));
const PREVIEWS = fileURLToPath(new URL('../../src/data/media.previews.json', import.meta.url));
const LEGACY = fileURLToPath(new URL('../../src/data/media.generated.json', import.meta.url));

const read = <T>(file: string): T => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : ({} as T));

export function loadMedia(): Record<string, MediaEntry> {
  if (!existsSync(ART) && existsSync(LEGACY)) return read(LEGACY);
  const art = read<Record<string, Omit<MediaEntry, 'previews'>>>(ART);
  const previews = read<Record<string, Record<string, string | null>>>(PREVIEWS);
  const ids = new Set([...Object.keys(art), ...Object.keys(previews)]);
  return Object.fromEntries(
    [...ids].map((id) => {
      const a = art[id] ?? {};
      return [id, { ...a, ...(a.art ? { art: expandArt(a.art) } : {}), previews: previews[id] ?? {} }];
    }),
  );
}

export function saveMedia(media: Record<string, MediaEntry>): void {
  const ids = Object.keys(media).sort();
  const art = Object.fromEntries(
    ids.map((id) => {
      const { previews: _p, ...rest } = media[id]!;
      return [id, rest.art ? { ...rest, art: compactArt(rest.art) } : rest];
    }),
  );
  const previews = Object.fromEntries(
    ids.filter((id) => Object.keys(media[id]!.previews ?? {}).length).map((id) => [id, media[id]!.previews]),
  );
  writeFileSync(ART, `${JSON.stringify(art, null, 1)}\n`);
  writeFileSync(PREVIEWS, `${JSON.stringify(previews, null, 1)}\n`);
}
