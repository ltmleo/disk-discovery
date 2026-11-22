import type { Album, RarityId } from './types';
import { RARITIES, rarityById } from './rarity';

/**
 * Which slice of the list a pack draws from. "all" is the normal game; the others are an
 * opt-in shortcut (top N, or a single rarity). Pulls count for the collection either way.
 */
export type PoolId = 'all' | 'top10' | 'top50' | 'top100' | RarityId;

export interface Pool {
  id: PoolId;
  label: string;
  /** Inclusive rank range. */
  min: number;
  max: number;
}

export const POOLS: readonly Pool[] = [
  { id: 'all', label: 'Todos', min: 1, max: 500 },
  { id: 'top10', label: 'Top 10', min: 1, max: 10 },
  { id: 'top50', label: 'Top 50', min: 1, max: 50 },
  { id: 'top100', label: 'Top 100', min: 1, max: 100 },
  ...RARITIES.map((r) => ({ id: r.id, label: r.label, min: r.min, max: r.max })),
];

const BY_ID = new Map(POOLS.map((p) => [p.id, p]));

export const poolById = (id: PoolId): Pool => BY_ID.get(id) ?? POOLS[0]!;

export function poolAlbums(albums: readonly Album[], id: PoolId): Album[] {
  const p = poolById(id);
  return albums.filter((a) => a.rank >= p.min && a.rank <= p.max);
}

/** Short description for the picker: "#1–#10 · 10 discos", "★★★★★ · 5 discos". */
export function poolHint(id: PoolId): string {
  const p = poolById(id);
  const n = p.max - p.min + 1;
  const rarity = BY_ID.has(id) && RARITIES.some((r) => r.id === id) ? rarityById(id as RarityId) : null;
  return `${rarity ? '★'.repeat(rarity.stars) : `#${p.min}–#${p.max}`} · ${n} discos`;
}

const KEY = 'disk-discovery:pool';

export function loadPool(): PoolId {
  try {
    const v = localStorage.getItem(KEY) as PoolId | null;
    return v && BY_ID.has(v) ? v : 'all';
  } catch {
    return 'all';
  }
}

export function savePool(id: PoolId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore: the choice just won't be remembered */
  }
}
