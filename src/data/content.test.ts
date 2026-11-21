import { describe, expect, it } from 'vitest';
import { ALBUMS } from './albums';
import { hasContent, loadContent } from './content';
import type { AlbumContent } from '../types';

const files = import.meta.glob<AlbumContent>('./content/*.json', { eager: true, import: 'default' });
const byId = new Map(Object.entries(files).map(([path, c]) => [path.replace(/^.*\/|\.json$/g, ''), c]));

describe('album content', () => {
  it('every album has a content file, and every content file has an album', () => {
    for (const a of ALBUMS) expect(hasContent(a.id), a.id).toBe(true);
    const ids = new Set(ALBUMS.map((a) => a.id));
    for (const id of byId.keys()) expect(ids.has(id), `orphan content ${id}`).toBe(true);
  });

  it('content is complete and previewTrack is in the tracklist', () => {
    for (const a of ALBUMS) {
      const c = byId.get(a.id)!;
      expect(c.history.length, a.id).toBeGreaterThan(0);
      expect(c.trivia.length, a.id).toBeGreaterThan(0);
      expect(c.tracks.map((t) => t.title), a.id).toContain(a.previewTrack);
    }
  });

  it('loads lazily and caches the promise', async () => {
    const id = ALBUMS[0]!.id;
    const p1 = loadContent(id);
    expect(loadContent(id)).toBe(p1);
    expect((await p1).tracks.length).toBeGreaterThan(0);
    await expect(loadContent('does-not-exist')).rejects.toThrow();
  });
});
