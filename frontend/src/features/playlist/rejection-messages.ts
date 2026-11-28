import { ROOM_LIMITS, type MyPlaylistDto, type PlaylistRejectionCode } from '@pmp/shared';

/** Friendly explanations for a rejected submission. */
export const REJECTION_MESSAGES: Record<PlaylistRejectionCode, string> = {
  PLAYLIST_NOT_FOUND:
    'We could not open that playlist. Make sure it is Public or Unlisted (not Private) and try again.',
  NOT_ENOUGH_PLAYABLE_SONGS:
    'Too few songs in this playlist can be played here (some may be private, age-restricted or not embeddable). Add more songs or pick another playlist.',
  NOT_ENOUGH_UNIQUE_SONGS:
    'Too many of these songs were already added by other players. Pick a playlist with more of your own songs.',
  QUOTA_EXHAUSTED:
    "Today's YouTube limit for this game server has been reached. Please try again tomorrow.",
  YOUTUBE_UNAVAILABLE: 'YouTube could not be reached. Please try again in a moment.',
};

const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;

/**
 * The explanation for a rejected submission, with the real numbers where they help.
 * Only counts are shown, never which songs clashed or whose they were (§11).
 */
export function rejectionMessage(playlist: MyPlaylistDto): string {
  const min = ROOM_LIMITS.minPlayableTracks;
  switch (playlist.rejectionCode) {
    case null:
      return 'This playlist could not be used.';
    case 'NOT_ENOUGH_UNIQUE_SONGS': {
      const { playableCount: left, duplicateCount: taken } = playlist;
      return (
        `${songs(taken)} of ${songs(taken + left)} in this playlist ` +
        `${taken === 1 ? 'was' : 'were'} already added by another player, leaving ${left}. ` +
        `A playlist needs at least ${songs(min)} nobody else added: add more songs or pick a bigger playlist.`
      );
    }
    case 'NOT_ENOUGH_PLAYABLE_SONGS':
      return (
        `Only ${songs(playlist.playableCount)} in this playlist can be played here; at least ${min} are needed. ` +
        'Some may be private, age-restricted or not embeddable. Add more songs or pick another playlist.'
      );
    default:
      return REJECTION_MESSAGES[playlist.rejectionCode];
  }
}
