/** Lifecycle of a player's playlist submission (docs/architecture.md §7). */
export const PlaylistStatus = {
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  REJECTED: 'REJECTED',
} as const;
export type PlaylistStatus = (typeof PlaylistStatus)[keyof typeof PlaylistStatus];

/** Why a submission was rejected after background processing. */
export const PlaylistRejectionCode = {
  /** Private, deleted or non-existent playlist. */
  PLAYLIST_NOT_FOUND: 'PLAYLIST_NOT_FOUND',
  /** Fewer than `ROOM_LIMITS.minPlayableTracks` songs can be embedded and played. */
  NOT_ENOUGH_PLAYABLE_SONGS: 'NOT_ENOUGH_PLAYABLE_SONGS',
  /** Enough playable songs, but too many were already submitted by other players (D6). */
  NOT_ENOUGH_UNIQUE_SONGS: 'NOT_ENOUGH_UNIQUE_SONGS',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  YOUTUBE_UNAVAILABLE: 'YOUTUBE_UNAVAILABLE',
} as const;
export type PlaylistRejectionCode =
  (typeof PlaylistRejectionCode)[keyof typeof PlaylistRejectionCode];

/** At most this many playlist items are read (4 API pages). */
export const PLAYLIST_ITEM_CAP = 200;

export interface SubmitPlaylistRequest {
  /** A YouTube playlist URL (youtube.com, music.youtube.com, youtu.be) or a bare playlist ID. */
  url: string;
}

export interface SubmitPlaylistResponse {
  status: typeof PlaylistStatus.PROCESSING;
}

/**
 * The caller's OWN submission. Never sent to anyone else: the title often reveals the
 * owner, and the URL would let others inspect the playlist.
 */
export interface MyPlaylistDto {
  status: PlaylistStatus;
  sourceUrl: string;
  title: string | null;
  playableCount: number;
  /** How many songs were dropped because other players already submitted them. Never which ones. */
  duplicateCount: number;
  rejectionCode: PlaylistRejectionCode | null;
  submittedAt: string;
}

export interface GetMyPlaylistResponse {
  playlist: MyPlaylistDto | null;
}

/** Public: only whether a player has a READY playlist. */
export interface PlaylistSubmissionUpdatedEvent {
  playerId: string;
  ready: boolean;
}

/** Private, sent to the owner's channel only. `null` when the submission was removed. */
export interface MyPlaylistStatusEvent {
  playlist: MyPlaylistDto | null;
}
