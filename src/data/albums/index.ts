import type { Album } from '../../types';
import { LEGENDARY } from './legendary';
import { EPIC } from './epic';
import { RARE } from './rare';
import { UNCOMMON } from './uncommon';
import { COMMON } from './common';

/**
 * Source of ranks: Rolling Stone, "The 500 Greatest Albums of All Time" (2020 edition).
 * One file per rarity tier keeps diffs small as the dataset grows towards 500.
 */
export const ALBUMS: readonly Album[] = [...LEGENDARY, ...EPIC, ...RARE, ...UNCOMMON, ...COMMON].sort(
  (a, b) => a.rank - b.rank,
);

export const ALBUM_BY_ID = new Map(ALBUMS.map((a) => [a.id, a]));
