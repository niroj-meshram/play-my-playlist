import type { PlaylistRejectionCode } from '@pmp/shared';

/** Friendly explanations for a rejected submission. */
export const REJECTION_MESSAGES: Record<PlaylistRejectionCode, string> = {
  PLAYLIST_NOT_FOUND:
    'We could not open that playlist. Make sure it is Public or Unlisted (not Private) and try again.',
  NOT_ENOUGH_PLAYABLE_SONGS:
    'Too few songs in this playlist can be played here (some may be private, age-restricted or not embeddable). Add more songs or pick another playlist.',
  NOT_ENOUGH_UNIQUE_SONGS:
    'Most of these songs were already added by other players. Pick a playlist with more of your own songs.',
  QUOTA_EXHAUSTED:
    "Today's YouTube limit for this game server has been reached. Please try again tomorrow.",
  YOUTUBE_UNAVAILABLE: 'YouTube could not be reached. Please try again in a moment.',
};
