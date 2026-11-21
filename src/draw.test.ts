import { describe, expect, it } from 'vitest';
import { drawAlbum } from './draw';
import { ALBUMS } from './data/albums';
import { RARITIES, rarityForRank } from './rarity';
import type { Album } from './types';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('drawAlbum', () => {
  it('picks the tier by cumulative weight (rarest first)', () => {
    expect(rarityForRank(drawAlbum(ALBUMS, seq(0, 0)).rank).id).toBe('legendary');
    expect(rarityForRank(drawAlbum(ALBUMS, seq(0.999, 0)).rank).id).toBe('common');
  });

  it('renormalises when tiers are missing', () => {
    const onlyCommon = ALBUMS.filter((a) => rarityForRank(a.rank).id === 'common');
    for (const r of [0, 0.3, 0.999]) expect(drawAlbum(onlyCommon, seq(r, 0)).id).toBe(onlyCommon[0]!.id);
  });

  it('roughly matches configured odds', () => {
    let s = 42;
    const rng = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const n = 200_000;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = rarityForRank(drawAlbum(ALBUMS, rng).rank).id;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    const total = RARITIES.reduce((t, r) => t + r.weight, 0);
    for (const r of RARITIES) expect((counts[r.id] ?? 0) / n).toBeCloseTo(r.weight / total, 2);
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

  it('MVP: exactly one album per rarity', () => {
    const tiers = ALBUMS.map((a) => rarityForRank(a.rank).id).sort();
    expect(tiers).toEqual(RARITIES.map((r) => r.id).sort());
  });
});
