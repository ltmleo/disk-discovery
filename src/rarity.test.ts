import { describe, expect, it } from 'vitest';
import { RARITIES, rarityForRank } from './rarity';

describe('rarity', () => {
  it('covers ranks 1..500 contiguously with no overlap', () => {
    const sorted = [...RARITIES].sort((a, b) => a.min - b.min);
    expect(sorted[0]!.min).toBe(1);
    expect(sorted.at(-1)!.max).toBe(500);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.min).toBe(sorted[i - 1]!.max + 1);
  });

  it('maps boundaries', () => {
    expect(rarityForRank(1).id).toBe('legendary');
    expect(rarityForRank(5).id).toBe('legendary');
    expect(rarityForRank(6).id).toBe('epic');
    expect(rarityForRank(100).id).toBe('rare');
    expect(rarityForRank(101).id).toBe('uncommon');
    expect(rarityForRank(500).id).toBe('common');
  });

  it('rejects out-of-range ranks', () => {
    expect(() => rarityForRank(0)).toThrow(RangeError);
    expect(() => rarityForRank(501)).toThrow(RangeError);
  });
});
