/**
 * Single entry point for Google Analytics events (GA4 G-714QFE3V9G, loaded in index.html).
 *
 * Conventions (see the ltm-novo-site skill, references/analytics.md):
 * - page_view is automatic: real paths + enhanced measurement (history changes). Never sent here.
 * - snake_case names; GA recommended events where one fits (select_content, unlock_achievement).
 * - Parameter values are short enums/ids; never personal data or free text.
 * - window.gtag is optional: ad blockers remove it and the game must not break.
 * - Event parameters only show up in reports after a matching custom dimension exists in GA
 *   (rarity, new_card, source, enabled; user-scoped collection_tier).
 */
import type { RarityId } from './types';
import { RARITIES } from './rarity';

type YesNo = 'yes' | 'no';

export interface Events {
  /** Pack torn open (the pull is already decided). */
  open_pack: { rarity: RarityId; new_card: YesNo };
  /** Face-down card flipped. */
  reveal_card: { rarity: RarityId; new_card: YesNo };
  /** Album detail page opened. GA recommended event. */
  select_content: { content_type: 'album'; content_id: string; rarity: RarityId; source: string };
  /** Card picked up in the gallery (zoom view). */
  inspect_card: { content_id: string; rarity: RarityId };
  /** A preview actually started playing (blocked/unavailable previews are not counted). */
  play_preview: { content_id: string; rarity: RarityId; source: 'reveal' | 'tracklist' };
  toggle_spy: { enabled: YesNo };
  toggle_sound: { enabled: YesNo };
  /** Collection milestones and first card of each rarity. GA recommended event. */
  unlock_achievement: { achievement_id: string };
}

export function track<K extends keyof Events>(name: K, params: Events[K]): void {
  window.gtag?.('event', name, params);
}

export const yesNo = (b: boolean): YesNo => (b ? 'yes' : 'no');

/* ---------------- Player profile (user property) ---------------- */

/** Coarse buckets keep the dimension readable and avoid one value per collection size. */
export function collectionTier(unique: number): string {
  if (unique === 0) return '0';
  if (unique < 10) return '1-9';
  if (unique < 50) return '10-49';
  if (unique < 200) return '50-199';
  return '200+';
}

export function setPlayerProfile(unique: number): void {
  window.gtag?.('set', 'user_properties', { collection_tier: collectionTier(unique) });
}

/* ---------------- Achievements ---------------- */

export const MILESTONES = [10, 25, 50, 100, 250, 500] as const;

export interface PullOutcome {
  isNew: boolean;
  rarity: RarityId;
  /** Unique albums before / after this pull. */
  uniqueBefore: number;
  uniqueAfter: number;
  /** Unique albums of this pull's rarity owned before it. */
  sameRarityBefore: number;
}

/** Pure: which achievements a pull unlocks. Each can only fire once per collection. */
export function achievementsFor(o: PullOutcome): string[] {
  if (!o.isNew) return [];
  const out = MILESTONES.filter((m) => o.uniqueBefore < m && o.uniqueAfter >= m).map((m) => `collect_${m}`);
  if (o.sameRarityBefore === 0) out.push(`first_${o.rarity}`);
  return out;
}

/** Ids every achievement can take (for documentation / GA dimension values). */
export const ACHIEVEMENT_IDS = [...MILESTONES.map((m) => `collect_${m}`), ...RARITIES.map((r) => `first_${r.id}`)];
