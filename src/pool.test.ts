import { describe, expect, it } from 'vitest';
import { ALBUMS } from './data/albums';
import { POOLS, poolAlbums, poolHint } from './pool';

describe('draw pools', () => {
  it('every pool has albums, and "all" is the whole list', () => {
    for (const p of POOLS) expect(poolAlbums(ALBUMS, p.id).length, p.id).toBeGreaterThan(0);
    expect(poolAlbums(ALBUMS, 'all')).toHaveLength(ALBUMS.length);
  });

  it('top N and rarity pools hold exactly their ranks', () => {
    expect(poolAlbums(ALBUMS, 'top10').map((a) => a.rank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(poolAlbums(ALBUMS, 'legendary')).toHaveLength(5);
    expect(poolAlbums(ALBUMS, 'common').every((a) => a.rank > 200)).toBe(true);
  });

  it('describes each pool', () => {
    expect(poolHint('top50')).toBe('#1–#50 · 50 discos');
    expect(poolHint('epic')).toBe('★★★★ · 20 discos');
  });
});
