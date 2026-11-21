import type { RarityId } from './types';

export interface Rarity {
  id: RarityId;
  label: string;
  /** Inclusive rank range on the list. */
  min: number;
  max: number;
  /** Probability weight of pulling *this tier* from a pack. */
  weight: number;
  stars: number;
}

/**
 * Ordered rarest → most common. Ranges must cover 1..500 with no gaps (enforced in tests).
 *
 * Weights are per *tier*, not per album. With the full 500-album dataset the per-album
 * odds end up as: legendary 0.1%, epic ~0.18%, rare 0.12%, uncommon 0.22%, common ~0.22%.
 */
export const RARITIES: readonly Rarity[] = [
  { id: 'legendary', label: 'Lendário', min: 1, max: 5, weight: 0.5, stars: 5 },
  { id: 'epic', label: 'Épico', min: 6, max: 25, weight: 3.5, stars: 4 },
  { id: 'rare', label: 'Raro', min: 26, max: 100, weight: 9, stars: 3 },
  { id: 'uncommon', label: 'Incomum', min: 101, max: 200, weight: 22, stars: 2 },
  { id: 'common', label: 'Comum', min: 201, max: 500, weight: 65, stars: 1 },
];

const BY_ID = new Map(RARITIES.map((r) => [r.id, r]));

export function rarityForRank(rank: number): Rarity {
  const r = RARITIES.find((t) => rank >= t.min && rank <= t.max);
  if (!r) throw new RangeError(`Rank ${rank} is outside 1..500`);
  return r;
}

export function rarityById(id: RarityId): Rarity {
  return BY_ID.get(id)!;
}
