import { describe, expect, it } from 'vitest';
import { artworkAt, pickArtwork } from './match';

const album = { title: 'Purple Rain', artist: 'Prince and the Revolution' };
const art = (name: string, artist = 'Prince & The Revolution') => ({
  collectionName: name,
  artistName: artist,
  artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/x/${encodeURIComponent(name)}/100x100bb.jpg`,
});

describe('pickArtwork', () => {
  it('matches artist variants and prefers the standard edition', () => {
    const t = pickArtwork([art('Purple Rain (Deluxe Expanded Edition)'), art('Purple Rain')], album);
    expect(t).toContain('/Purple%20Rain/');
    expect(artworkAt(t!, 600)).toMatch(/\/600x600bb\.jpg$/);
  });

  it('rejects other artists and other albums', () => {
    expect(pickArtwork([art('Purple Rain', 'Some Tribute Band'), art('1999')], album)).toBeNull();
  });

  it('picks artwork from song results (album search fallback)', () => {
    const songs = [
      { trackName: 'Thinkin Bout You', artistName: 'Frank Ocean', collectionName: 'channel ORANGE', artworkUrl100: 'https://x/a/100x100bb.jpg' },
    ];
    expect(pickArtwork(songs, { title: 'Channel Orange', artist: 'Frank Ocean' })).toBe('https://x/a/{size}x{size}bb.jpg');
  });
});

describe('compact artwork', () => {
  it('round-trips store URLs and leaves others alone', async () => {
    const { compactArt, expandArt } = await import('./match');
    const url = 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/ab/cd/x.jpg/{size}x{size}bb.jpg';
    expect(compactArt(url)).toBe('~Music/v4/ab/cd/x.jpg');
    expect(expandArt(compactArt(url))).toBe(url);
    expect(compactArt('https://example.com/a.png')).toBe('https://example.com/a.png');
  });
});

describe('rankCollections', () => {
  it('prefers the explicit full album over clean and 1-track editions', async () => {
    const { rankCollections } = await import('./match');
    const base = { artistName: 'Wu-Tang Clan', collectionName: 'Enter the Wu-Tang (36 Chambers)', artworkUrl100: 'x/100x100bb.jpg' };
    const ranked = rankCollections(
      [
        { ...base, collectionId: 1, collectionExplicitness: 'cleaned', trackCount: 9 },
        { ...base, collectionId: 2, trackCount: 1 },
        { ...base, collectionId: 3, collectionExplicitness: 'explicit', trackCount: 13 },
      ],
      { title: 'Enter the Wu-Tang (36 Chambers)', artist: 'Wu-Tang Clan' },
    );
    expect(ranked[0]!.collectionId).toBe(3);
  });

  it('skips alternate-mix and cast-recording editions and prefers the original year', async () => {
    const { rankCollections } = await import('./match');
    const art = { artworkUrl100: 'x/100x100bb.jpg' };
    const love = rankCollections(
      [
        { ...art, artistName: 'Love', collectionId: 1, collectionName: 'Forever Changes (Alternate Mix & Outtakes)', trackCount: 21 },
        { ...art, artistName: 'Love', collectionId: 2, collectionName: 'Forever Changes (Remastered)', trackCount: 11 },
      ],
      { title: 'Forever Changes', artist: 'Love', year: 1967 },
    );
    expect(love[0]!.collectionId).toBe(2);
    const va = { ...art, artistName: 'Various Artists' };
    const snf = rankCollections(
      [
        { ...va, collectionId: 1, collectionName: 'Saturday Night Fever (1998 Original Cast Recording)', releaseDate: '1998-01-01T08:00:00Z' },
        { ...va, collectionId: 2, collectionName: 'Saturday Night Fever', releaseDate: '2012-05-01T07:00:00Z' },
        { ...va, collectionId: 3, collectionName: 'Saturday Night Fever (The Original Movie Soundtrack)', releaseDate: '1977-11-15T08:00:00Z' },
      ],
      { title: 'Saturday Night Fever', artist: 'Various Artists', year: 1977 },
    );
    expect(snf[0]!.collectionId).toBe(3);
  });
});
