import type { AlbumContent } from '../types';

/**
 * Lazy loaders, one per album. Vite turns each JSON into its own small chunk, so the
 * main bundle only carries card data no matter how many albums the list grows to.
 */
const loaders = import.meta.glob<AlbumContent>('./content/*.json', { import: 'default' });

const cache = new Map<string, Promise<AlbumContent>>();

export const hasContent = (id: string): boolean => `./content/${id}.json` in loaders;

export function loadContent(id: string): Promise<AlbumContent> {
  let p = cache.get(id);
  if (!p) {
    const load = loaders[`./content/${id}.json`];
    p = load ? load() : Promise.reject(new Error(`No content for ${id}`));
    // A failed fetch (offline, deploy swapped chunk names) must not poison the cache.
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Warm the cache for a page the user is likely to open next (revealed card, hover, inspect). */
export function prefetchContent(id: string): void {
  loadContent(id).catch(() => undefined);
}
