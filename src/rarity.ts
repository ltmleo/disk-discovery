import type { RarityId } from './types';

export interface Rarity {
  id: RarityId;
  label: string;
  /** Inclusive rank range on the list. */
  min: number;
  max: number;
  stars: number;
}

/**
 * Ordered rarest → most common. Ranges must cover 1..500 with no gaps (enforced in tests).
 *
 * Rarity is purely a consequence of tier size: every album has the same pull chance,
 * so with the full list a pack is legendary 1% of the time (5/500) and common 60% (300/500).
 */
export const RARITIES: readonly Rarity[] = [
  { id: 'legendary', label: 'Lendário', min: 1, max: 5, stars: 5 },
  { id: 'epic', label: 'Épico', min: 6, max: 25, stars: 4 },
  { id: 'rare', label: 'Raro', min: 26, max: 100, stars: 3 },
  { id: 'uncommon', label: 'Incomum', min: 101, max: 200, stars: 2 },
  { id: 'common', label: 'Comum', min: 201, max: 500, stars: 1 },
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
