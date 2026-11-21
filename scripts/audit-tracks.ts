/**
 * Flags albums whose imported tracklist likely came from the wrong store edition
 * (sequel album, cast recording, alternate mixes, bonus tracks appended…).
 *
 * The reference is MusicBrainz: the earliest official release of the album's release group.
 * Albums whose track count differs from that release by 2 or more are reported, with the
 * first and last imported track to make the cause obvious. Read-only: it changes no file.
 *
 *   npm run audit                      # every album
 *   npm run audit -- --tier common     # one rarity tier
 *   npm run audit -- --out report.json # also write the findings as JSON
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALBUMS } from '../src/data/albums';
import { rarityForRank } from '../src/rarity';
import type { AlbumContent } from '../src/types';

const UA = 'disk-discovery/1.0';
const MB_GAP = 1100; // MusicBrainz asks for at most one request per second
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const tier = arg('--tier');
const out = arg('--out');
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let last = 0;
async function mb<T>(path: string, attempt = 1): Promise<T> {
  const wait = last + MB_GAP * attempt - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 503 && attempt < 4) return mb(path, attempt + 1);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  return (await res.json()) as T;
}

interface Release {
  date?: string;
  status?: string;
  media?: { format?: string; 'track-count': number }[];
}

async function releaseGroup(title: string, artist: string): Promise<string | null> {
  const q = (s: string) => `"${s.replace(/["\\]/g, '\\$&')}"`;
  const query = `releasegroup:${q(title)} AND artist:${q(artist)}`;
  const data = await mb<{ 'release-groups'?: { id: string; score: number }[] }>(
    `release-group/?fmt=json&limit=3&query=${encodeURIComponent(query)}`,
  );
  const best = data['release-groups']?.[0];
  return best && best.score >= 90 ? best.id : null;
}

/** Track count of the earliest dated official release (audio media only). */
async function originalTrackCount(rg: string): Promise<number | null> {
  const data = await mb<{ releases?: Release[] }>(`release?fmt=json&limit=100&inc=media&release-group=${rg}`);
  const official = (data.releases ?? []).filter((r) => r.date && r.status === 'Official' && r.media?.length);
  official.sort((a, b) => a.date!.localeCompare(b.date!));
  const first = official[0];
  if (!first) return null;
  return first.media!.filter((m) => !/dvd|blu-ray|video/i.test(m.format ?? '')).reduce((n, m) => n + m['track-count'], 0);
}

const albums = ALBUMS.filter((a) => !tier || rarityForRank(a.rank).id === tier).sort((a, b) => a.rank - b.rank);
const findings: { rank: number; id: string; ours: number; original: number; first?: string; last?: string }[] = [];
let checked = 0;
let unknown = 0;

for (const a of albums) {
  const content = JSON.parse(readFileSync(here(`../src/data/content/${a.id}.json`), 'utf8')) as AlbumContent;
  const ours = content.tracks.length;
  if (!ours) continue; // nothing imported: nothing to compare
  try {
    const rg = a.mbid ?? (await releaseGroup(a.title, a.artist));
    const original = rg ? await originalTrackCount(rg) : null;
    if (original === null) {
      unknown++;
      continue;
    }
    checked++;
    if (Math.abs(ours - original) >= 2) {
      const f = { rank: a.rank, id: a.id, ours, original, first: content.tracks[0]?.title, last: content.tracks.at(-1)?.title };
      findings.push(f);
      console.log(`#${a.rank} ${a.artist} – ${a.title}: ${ours} tracks, original ${original} ("${f.first}" … "${f.last}")`);
    }
  } catch (err) {
    unknown++;
    console.log(`#${a.rank} ${a.artist} – ${a.title}: ${(err as Error).message}`);
  }
}

console.log(`\naudit: ${checked} compared, ${unknown} without a MusicBrainz reference, ${findings.length} mismatch(es)`);
if (out) writeFileSync(out, `${JSON.stringify(findings, null, 2)}\n`);
