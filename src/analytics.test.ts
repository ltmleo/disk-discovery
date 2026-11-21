import { afterEach, describe, expect, it, vi } from 'vitest';
import { achievementsFor, collectionTier, setPlayerProfile, track } from './analytics';

describe('analytics', () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
  });

  it('is a no-op without gtag (ad blockers)', () => {
    expect(() => track('toggle_sound', { enabled: 'no' })).not.toThrow();
  });

  it('forwards typed events to gtag', () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    track('open_pack', { rarity: 'epic', new_card: 'yes' });
    setPlayerProfile(12);
    expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'open_pack', { rarity: 'epic', new_card: 'yes' });
    expect(gtag).toHaveBeenNthCalledWith(2, 'set', 'user_properties', { collection_tier: '10-49' });
  });

  it('buckets collection size', () => {
    expect([0, 1, 9, 10, 49, 50, 199, 200, 500].map(collectionTier)).toEqual([
      '0', '1-9', '1-9', '10-49', '10-49', '50-199', '50-199', '200+', '200+',
    ]);
  });

  it('unlocks milestones once, on the pull that crosses them', () => {
    const base = { isNew: true, rarity: 'common' as const, sameRarityBefore: 3 };
    expect(achievementsFor({ ...base, uniqueBefore: 9, uniqueAfter: 10 })).toEqual(['collect_10']);
    expect(achievementsFor({ ...base, uniqueBefore: 10, uniqueAfter: 11 })).toEqual([]);
    expect(achievementsFor({ ...base, isNew: false, uniqueBefore: 9, uniqueAfter: 9 })).toEqual([]);
  });

  it('unlocks the first card of each rarity', () => {
    expect(
      achievementsFor({ isNew: true, rarity: 'legendary', uniqueBefore: 24, uniqueAfter: 25, sameRarityBefore: 0 }),
    ).toEqual(['collect_25', 'first_legendary']);
  });
});
