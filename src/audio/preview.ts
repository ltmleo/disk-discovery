import type { Album } from '../types';
import { isMuted, onMuteChange } from './settings';

/**
 * 30-second previews from the iTunes Search API. Spotify stopped exposing preview_url
 * to new apps, and Deezer has no CORS; iTunes supports JSONP, which works from a static site.
 *
 * Trade-off: JSONP executes a script from itunes.apple.com. That host is trusted here,
 * and nothing else is ever loaded this way.
 */
interface ItunesTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
}

const cache = new Map<string, Promise<string | null>>();
const resolvedUrls = new Map<string, string | null>();
let jsonpSeq = 0;

function jsonp<T>(url: string, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__ddItunes${++jsonpSeq}`;
    const script = document.createElement('script');
    const g = globalThis as unknown as Record<string, unknown>;
    const done = () => {
      clearTimeout(timer);
      delete g[cb];
      script.remove();
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error('timeout'));
    }, timeoutMs);
    g[cb] = (data: T) => {
      done();
      resolve(data);
    };
    script.onerror = () => {
      done();
      reject(new Error('network'));
    };
    script.src = `${url}&callback=${cb}`;
    document.head.append(script);
  });
}

const norm = (s = '') =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Ranks results: same artist is required; same track title and album are preferred. */
export function pickPreview(results: ItunesTrack[], album: Album, track: string): string | null {
  const artist = norm(album.artist);
  const title = norm(track);
  const record = norm(album.title);
  let best: { url: string; score: number } | null = null;
  for (const r of results) {
    if (!r.previewUrl || !norm(r.artistName).includes(artist)) continue;
    const name = norm(r.trackName);
    let score = 0;
    if (name === title) score += 4;
    else if (name.startsWith(title) || title.startsWith(name)) score += 2;
    else continue;
    if (norm(r.collectionName).includes(record)) score += 2;
    if (!/live|remix|demo|edit/.test(name)) score += 1;
    if (!best || score > best.score) best = { url: r.previewUrl, score };
  }
  return best?.url ?? null;
}

export function resolvePreview(album: Album, track: string): Promise<string | null> {
  const key = `${album.id}::${track}`;
  let p = cache.get(key);
  if (!p) {
    const term = encodeURIComponent(`${album.artist} ${track}`);
    p = jsonp<{ results?: ItunesTrack[] }>(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=15`,
    )
      .then((d) => {
        const url = pickPreview(d.results ?? [], album, track);
        resolvedUrls.set(key, url);
        return url;
      })
      .catch(() => {
        cache.delete(key); // allow retry later
        return null;
      });
    cache.set(key, p);
  }
  return p;
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

const TARGET_VOL = 0.8;

function el(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => current && set({ ...current, state: 'stopped' }));
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
  void resolvePreview(album, track);
}

onMuteChange((m) => {
  if (m) stopPreview(200);
});
