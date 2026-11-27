import type { GamePhase } from './game-phase.js';

/** Phases of a running game (LOBBY is a room state, not a game phase). */
export type ActiveGamePhase = Exclude<GamePhase, 'LOBBY'>;

export const GameEndReason = {
  COMPLETED: 'COMPLETED',
  /** Fewer than ROOM_LIMITS.minPlayers participants were left after players left mid-game. */
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  /** No playable songs were left for the remaining rounds. */
  OUT_OF_SONGS: 'OUT_OF_SONGS',
} as const;
export type GameEndReason = (typeof GameEndReason)[keyof typeof GameEndReason];

/** YouTube IFrame player errors that mean the video itself can never play here. */
export const UNPLAYABLE_YT_ERROR_CODES = [100, 101, 150] as const;

/** The song of a round as everyone sees it. Never includes who submitted it. */
export interface PublicTrackDto {
  videoId: string;
  title: string;
  artist: string | null;
  thumbnailUrl: string | null;
  durationSec: number;
}

export interface PublicRoundDto {
  roundNumber: number;
  /** Anonymous, CSPRNG-shuffled label such as "Playlist C". */
  playlistLabel: string;
  track: PublicTrackDto;
}

/** Published only once a round reaches REVEAL. */
export interface RoundRevealDto {
  roundNumber: number;
  playlistLabel: string;
  ownerPlayerId: string;
  /** Included because the owner may have left the room and be missing from the player list. */
  ownerDisplayName: string;
}

/** Facts only the viewer may know about the current round. */
export interface GameViewerContextDto {
  isYourPlaylist: boolean;
}

/** Every game event and snapshot carries these, so clients can drop stale events. */
export interface GameVersioned {
  stateVersion: number;
  /** Server clock in epoch milliseconds when the event was produced. */
  serverTime: number;
}

/** Authoritative game state for one viewer (docs/architecture.md §4, §11). */
export interface GameSnapshotDto extends GameVersioned {
  gameNumber: number;
  phase: ActiveGamePhase;
  roundNumber: number;
  totalRounds: number;
  phaseStartedAt: string;
  /** Labels of the playlists in this game, in label order. */
  playlistLabels: string[];
  /** The current round's song; `null` in SCOREBOARD and FINISHED. */
  currentRound: PublicRoundDto | null;
  viewer: GameViewerContextDto;
  /** The latest revealed round, while the game is in REVEAL or later. */
  lastReveal: RoundRevealDto | null;
  endReason: GameEndReason | null;
}

// Commands (client → server)

export interface GameStartRequest {
  clientRequestId: string;
}

export interface GameAdvanceRequest {
  /** The phase the leader's screen showed; a mismatch means the click is stale and ignored. */
  expectedPhase: ActiveGamePhase;
  roundNumber: number;
}

export interface GameAdvanceResponse {
  /** `false` when the command was stale or already applied by someone else. */
  applied: boolean;
}

export const PlaybackState = {
  PLAYING: 'PLAYING',
  ENDED: 'ENDED',
  ERROR: 'ERROR',
} as const;
export type PlaybackState = (typeof PlaybackState)[keyof typeof PlaybackState];

export interface PlaybackReportRequest {
  roundNumber: number;
  /** The video the leader's player was playing; reports about a replaced video are ignored. */
  videoId: string;
  state: PlaybackState;
  ytErrorCode?: number;
}

export interface PlaybackReportResponse {
  applied: boolean;
}

// Events (server → client)

export interface GameStartedEvent extends GameVersioned {
  gameNumber: number;
  totalRounds: number;
  playlistLabels: string[];
}

export interface GamePhaseChangedEvent extends GameVersioned {
  phase: ActiveGamePhase;
  roundNumber: number;
  totalRounds: number;
  phaseStartedAt: string;
  /** Why the game ended; set from SCOREBOARD on, `null` before. */
  endReason: GameEndReason | null;
}

export interface GameRoundStartedEvent extends GameVersioned {
  round: PublicRoundDto;
}

/** Sent privately to each participant when a round starts or its song is replaced. */
export interface RoundViewerContextEvent extends GameVersioned {
  roundNumber: number;
  viewer: GameViewerContextDto;
}

export interface GameRoundRevealedEvent extends GameVersioned {
  reveal: RoundRevealDto;
}

export interface GameFinishedEvent extends GameVersioned {
  endReason: GameEndReason;
}
