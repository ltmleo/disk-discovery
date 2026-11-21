import type { Album } from '../types';
import { isMuted, onMuteChange } from './settings';
import { loadPreviews } from '../data/media';
import { jsonp } from '../net/jsonp';
import { pickPreview, type ItunesItem } from '../net/match';
import { track as trackEvent } from '../analytics';
import { rarityForRank } from '../rarity';

/**
 * 30-second previews from the iTunes Search API. Spotify stopped exposing preview_url
 * to new apps, and Deezer has no CORS; iTunes supports JSONP, which works from a static site.
 *
 * Trade-off: JSONP executes a script from itunes.apple.com. That host is trusted here,
 * and nothing else is ever loaded this way.
 */
const cache = new Map<string, Promise<string | null>>();
/** Synchronously known URLs (so play() can run inside the user's click): filled from the lazy
 * build-time preview chunk and from runtime lookups. */
const resolvedUrls = new Map<string, string | null>();

export { pickPreview };

export function resolvePreview(album: Album, track: string): Promise<string | null> {
  const key = `${album.id}::${track}`;
  let p = cache.get(key);
  if (!p && resolvedUrls.has(key)) p = Promise.resolve(resolvedUrls.get(key) ?? null);
  if (!p) {
    p = loadPreviews()
      .catch(() => ({}) as Awaited<ReturnType<typeof loadPreviews>>)
      .then((all) => {
        const known = all[album.id]?.[track];
        if (known) {
          resolvedUrls.set(key, known);
          return known;
        }
        return searchPreview(album, track, key);
      });
    cache.set(key, p);
  }
  return p;
}

/** Runtime fallback when the build did not resolve this track. */
function searchPreview(album: Album, track: string, key: string): Promise<string | null> {
  const term = encodeURIComponent(`${album.artist} ${track}`);
  return jsonp<{ results?: ItunesItem[] }>(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=15`)
    .then((d) => {
      const url = pickPreview(d.results ?? [], album, track);
      resolvedUrls.set(key, url);
      return url;
    })
    .catch(() => {
      cache.delete(key); // allow retry later
      return null;
    });
}

/* ---------------- Player (single shared element) ---------------- */

export interface NowPlaying {
  album: Album;
  track: string;
  state: 'loading' | 'playing' | 'stopped' | 'unavailable';
}

type Listener = (np: NowPlaying | null) => void;
const listeners = new Set<Listener>();
let current: NowPlaying | null = null;
let audio: HTMLAudioElement | null = null;
let fadeTimer = 0;
let stopTimer = 0;
let token = 0;
const retried = new Set<string>();

const TARGET_VOL = 0.8;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => current && set({ ...current, state: 'stopped' }));
    audio.addEventListener('error', () => {
      if (!current || current.state === 'stopped') return;
      const { album, track } = current;
      const key = `${album.id}::${track}`;
      // A build-time URL can go stale; forget it and retry once through a live search.
      if (resolvedUrls.has(key) && !retried.has(key)) {
        retried.add(key);
        resolvedUrls.delete(key);
        cache.delete(key);
        playPreview(album, track);
      } else set({ ...current, state: 'unavailable' });
    });
  }
  return audio;
}

function set(np: NowPlaying | null) {
  current = np;
  for (const l of listeners) l(np);
}

export function onPlayer(l: Listener): () => void {
  listeners.add(l);
  l(current);
  return () => listeners.delete(l);
}

export const nowPlaying = () => current;

function fadeTo(target: number, ms: number, then?: () => void) {
  const a = el();
  clearInterval(fadeTimer);
  const steps = Math.max(1, Math.round(ms / 40));
  const start = a.volume;
  let i = 0;
  fadeTimer = window.setInterval(() => {
    i++;
    a.volume = Math.max(0, Math.min(1, start + ((target - start) * i) / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      then?.();
    }
  }, 40);
}

export interface PlayOptions {
  /** Stop (with fade) after this long; omit to play the full 30s preview. */
  maxMs?: number;
  /** Start silently and fade in after this delay (lets a sound effect finish first). */
  delayMs?: number;
  /** Where the play came from, for analytics. */
  source?: 'reveal' | 'tracklist';
}

/**
 * Plays a preview. Call it from inside a user gesture when possible: if the URL is
 * already resolved, `play()` runs synchronously and satisfies iOS autoplay rules.
 */
export function playPreview(album: Album, track: string, opts: PlayOptions = {}): void {
  const my = ++token;
  clearTimeout(stopTimer);
  if (isMuted()) return;
  const a = el();
  set({ album, track, state: 'loading' });

  const start = (url: string | null) => {
    if (my !== token) return;
    if (!url) {
      set({ album, track, state: 'unavailable' });
      return;
    }
    if (a.src !== url) a.src = url;
    a.currentTime = 0;
    a.volume = 0;
    a.play().then(
      () => {
        if (my !== token) return;
        set({ album, track, state: 'playing' });
        if (opts.source) {
          trackEvent('play_preview', { content_id: album.id, rarity: rarityForRank(album.rank).id, source: opts.source });
        }
        const delay = opts.delayMs ?? 0;
        window.setTimeout(() => my === token && fadeTo(TARGET_VOL, 900), delay);
        if (opts.maxMs) stopTimer = window.setTimeout(() => stopPreview(1500), delay + opts.maxMs);
      },
      () => my === token && set({ album, track, state: 'stopped' }),
    );
  };

  // Already resolved: start synchronously so play() stays inside the user gesture (iOS).
  const key = `${album.id}::${track}`;
  if (resolvedUrls.has(key)) start(resolvedUrls.get(key) ?? null);
  else void resolvePreview(album, track).then(start);
}

export function stopPreview(fadeMs = 400): void {
  token++;
  clearTimeout(stopTimer);
  if (!audio || audio.paused) {
    if (current) set({ ...current, state: 'stopped' });
    return;
  }
  const a = audio;
  fadeTo(0, fadeMs, () => {
    a.pause();
    if (current) set({ ...current, state: 'stopped' });
  });
}

/** Warms the cache (e.g. when the pack is torn, before the reveal click). */
export function prefetchPreview(album: Album, track: string): void {
  void resolvePreview(album, track).then((url) => {
    if (!url || warmed.has(url) || isMuted()) return;
    // Throwaway element: buffers the start of the clip into the HTTP cache without
    // touching the shared player (which may be playing something else).
    warmed.add(url);
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
  });
}

const warmed = new Set<string>();

onMuteChange((m) => {
  if (m) stopPreview(200);
});
