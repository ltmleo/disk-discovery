import { describe, expect, it } from 'vitest';
import { ALBUMS } from '../data/albums';
import { searchAlbums } from './gallery';

const ids = (q: string) => searchAlbums(ALBUMS, q).map((a) => a.id);

describe('gallery search', () => {
  it('matches title and artist, ignoring case and accents', () => {
    expect(ids('nevermind')).toContain('nirvana-nevermind');
    expect(ids('MOTORHEAD')).toContain('motorhead-ace-of-spades');
    expect(ids('bjork')[0]).toMatch(/^bjork-/);
  });

  it('requires every term', () => {
    const r = searchAlbums(ALBUMS, 'beatles revolver');
    expect(r.map((a) => a.id)).toEqual(['beatles-revolver']);
  });

  it('matches exact rank with or without #, and years', () => {
    expect(ids('#1')).toEqual(['marvin-gaye-whats-going-on']);
    expect(ids('42')).toContain('radiohead-ok-computer');
    expect(searchAlbums(ALBUMS, '1971').every((a) => a.year === 1971 || a.rank === 1971)).toBe(true);
  });

  it('empty query returns everything', () => {
    expect(searchAlbums(ALBUMS, '  ').length).toBe(ALBUMS.length);
  });
});
