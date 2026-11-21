import type { Album } from './types';
import { RARITIES, rarityForRank } from './rarity';

export type Rng = () => number;

/**
 * Two-stage draw: pick a tier by weight, then an album uniformly inside it.
 * Tiers with no albums in the dataset are dropped and the rest renormalised,
 * so a partial dataset (e.g. the MVP) never yields an empty pull.
 */
export function drawAlbum(albums: readonly Album[], rng: Rng = Math.random): Album {
  if (albums.length === 0) throw new Error('No albums to draw from');

  const pools = RARITIES.map((tier) => ({
    tier,
    albums: albums.filter((a) => rarityForRank(a.rank).id === tier.id),
  })).filter((p) => p.albums.length > 0);

  const total = pools.reduce((s, p) => s + p.tier.weight, 0);
  let roll = rng() * total;
  let pool = pools[pools.length - 1]!;
  for (const p of pools) {
    if (roll < p.tier.weight) {
      pool = p;
      break;
    }
    roll -= p.tier.weight;
  }
  const idx = Math.min(pool.albums.length - 1, Math.floor(rng() * pool.albums.length));
  return pool.albums[idx]!;
}
