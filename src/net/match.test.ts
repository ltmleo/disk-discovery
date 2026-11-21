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
