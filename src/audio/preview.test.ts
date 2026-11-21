import { describe, expect, it } from 'vitest';
import { pickPreview } from './preview';
import { ALBUMS } from '../data/albums';

const nirvana = ALBUMS.find((a) => a.id === 'nirvana-nevermind')!;

describe('pickPreview', () => {
  it('prefers exact title on the right album over live/other versions', () => {
    const url = pickPreview(
      [
        { trackName: 'Smells Like Teen Spirit (Live)', artistName: 'Nirvana', collectionName: 'Live at Reading', previewUrl: 'live' },
        { trackName: 'Smells Like Teen Spirit', artistName: 'Nirvana', collectionName: 'Nirvana (Greatest Hits)', previewUrl: 'hits' },
        { trackName: 'Smells Like Teen Spirit', artistName: 'Nirvana', collectionName: 'Nevermind (Remastered)', previewUrl: 'album' },
      ],
      nirvana,
      'Smells Like Teen Spirit',
    );
    expect(url).toBe('album');
  });

  it('rejects covers by other artists and unrelated tracks', () => {
    const url = pickPreview(
      [
        { trackName: 'Smells Like Teen Spirit', artistName: 'Tori Amos', previewUrl: 'cover' },
        { trackName: 'Lithium', artistName: 'Nirvana', previewUrl: 'other' },
      ],
      nirvana,
      'Smells Like Teen Spirit',
    );
    expect(url).toBeNull();
  });

  it('ignores accents, punctuation and parentheticals', () => {
    const marvin = ALBUMS.find((a) => a.id === 'marvin-gaye-whats-going-on')!;
    const url = pickPreview(
      [{ trackName: 'What’s Going On (2021 Mix)', artistName: 'Marvin Gaye', collectionName: "What's Going On", previewUrl: 'ok' }],
      marvin,
      "What's Going On",
    );
    expect(url).toBe('ok');
  });
});
