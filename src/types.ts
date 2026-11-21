export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Track {
  title: string;
  /** Short story / trivia about the track. Optional: not every track needs one. */
  note?: string;
}

export interface Album {
  /** Stable slug, used as storage key and in URLs. Never change once published. */
  id: string;
  /** Position on Rolling Stone's 500 Greatest Albums of All Time (2020). */
  rank: number;
  title: string;
  artist: string;
  year: number;
  label: string;
  genre: string;
  /** MusicBrainz release-group MBID. When absent, resolved at runtime and cached. */
  mbid?: string;
  /** Spotify album ID. When absent, the link falls back to a Spotify search. */
  spotifyId?: string;
  /** Track whose preview plays on reveal. Must match a title in `tracks`. */
  previewTrack: string;
  /** One-line hook shown on the card. */
  tagline: string;
  /** Paragraphs. */
  history: string[];
  trivia: string[];
  tracks: Track[];
}
