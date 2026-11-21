import { describe, expect, it } from 'vitest';
import { drawAlbum, tierOdds } from './draw';
import { ALBUMS } from './data/albums';
import { RARITIES, rarityForRank } from './rarity';
import type { Album } from './types';

describe('drawAlbum', () => {
  it('maps the roll uniformly over albums', () => {
    expect(drawAlbum(ALBUMS, () => 0).id).toBe(ALBUMS[0]!.id);
    expect(drawAlbum(ALBUMS, () => 0.999999).id).toBe(ALBUMS.at(-1)!.id);
  });

  it('gives every album the same chance', () => {
    let s = 42;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const n = 100_000;
    const counts = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      const id = drawAlbum(ALBUMS, rng).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const a of ALBUMS) expect((counts.get(a.id) ?? 0) / n).toBeCloseTo(1 / ALBUMS.length, 2);
  });

  it('derives tier odds from tier size', () => {
    const legendary = ALBUMS.filter((a) => rarityForRank(a.rank).id === 'legendary').length;
    expect(tierOdds(ALBUMS, (a) => rarityForRank(a.rank).id === 'legendary')).toBeCloseTo(legendary / ALBUMS.length);
    expect(tierOdds([], () => true)).toBe(0);
  });

  it('throws on empty input', () => {
    expect(() => drawAlbum([] as Album[])).toThrow();
  });
});

describe('dataset', () => {
  it('has unique ids and ranks, valid ranges, and content', () => {
    expect(new Set(ALBUMS.map((a) => a.id)).size).toBe(ALBUMS.length);
    expect(new Set(ALBUMS.map((a) => a.rank)).size).toBe(ALBUMS.length);
    for (const a of ALBUMS) {
      expect(() => rarityForRank(a.rank)).not.toThrow();
      expect(a.history.length).toBeGreaterThan(0);
      expect(a.tracks.length).toBeGreaterThan(0);
    }
  });

  it('every rarity tier has albums', () => {
    const tiers = new Set(ALBUMS.map((a) => rarityForRank(a.rank).id));
    for (const r of RARITIES) expect(tiers.has(r.id)).toBe(true);
  });

  it('albums are sorted by rank', () => {
    expect(ALBUMS.map((a) => a.rank)).toEqual([...ALBUMS.map((a) => a.rank)].sort((x, y) => x - y));
  });
});
