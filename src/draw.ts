import type { Album } from './types';

export type Rng = () => number;

/**
 * Uniform draw: every album is equally likely. Rarity emerges from tier sizes
 * (5 legendary vs 300 common), so no per-tier weights are needed.
 */
export function drawAlbum(albums: readonly Album[], rng: Rng = Math.random): Album {
  if (albums.length === 0) throw new Error('No albums to draw from');
  const idx = Math.min(albums.length - 1, Math.floor(rng() * albums.length));
  return albums[idx]!;
}

/** Chance of pulling a given tier from a dataset, for display. */
export function tierOdds(albums: readonly Album[], predicate: (a: Album) => boolean): number {
  return albums.length ? albums.filter(predicate).length / albums.length : 0;
}
