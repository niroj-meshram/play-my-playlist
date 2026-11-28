import type { GamePhase } from './game-phase.js';
import type { PlaybackMode } from './rooms.js';

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
  /** When this song started on the server (ISO); every device syncs to it in EVERY_DEVICE mode. */
  startedAt: string;
}

/** Why a player received points in a round (docs/architecture.md §5). */
export const RoundScoreReason = {
  /** Nobody guessed the owner. */
  OWNER_UNGUESSED: 'OWNER_UNGUESSED',
  /** The only correct guess. */
  SOLE_CORRECT: 'SOLE_CORRECT',
  /** One of two or more correct guesses. */
  SHARED_CORRECT: 'SHARED_CORRECT',
  /** Nobody guessed the owner, but the owner was offline when voting closed: 0 points (D12). */
  OWNER_OFFLINE: 'OWNER_OFFLINE',
} as const;
export type RoundScoreReason = (typeof RoundScoreReason)[keyof typeof RoundScoreReason];

/** A vote as shown after the reveal. Individual votes are never public before it. */
export interface RevealedVoteDto {
  voterPlayerId: string;
  suspectPlayerId: string;
  isCorrect: boolean;
}

export interface RoundPointsDto {
  playerId: string;
  points: number;
  reason: RoundScoreReason;
}

/** Published only once a round reaches REVEAL. */
export interface RoundRevealDto {
  roundNumber: number;
  playlistLabel: string;
  ownerPlayerId: string;
  /** Included because the owner may have left the room and be missing from the player list. */
  ownerDisplayName: string;
  votes: RevealedVoteDto[];
  points: RoundPointsDto[];
}

/** A player the viewer may vote for. Whether they are online comes from room presence. */
export interface VoteCandidateDto {
  playerId: string;
  displayName: string;
  avatarId: string;
}

/** Facts only the viewer may know about the current round. */
export interface GameViewerContextDto {
  isYourPlaylist: boolean;
  /** Every other participant still in the room, in the same order for everyone. */
  candidates: VoteCandidateDto[];
  /** The player the viewer voted for this round, or `null`. */
  myVote: string | null;
}

/** Only counts are public while voting is open: since everyone votes, they reveal nothing. */
export interface VoteProgressDto {
  votesIn: number;
  /** Players expected to vote: online participants plus anyone who already voted. */
  expected: number;
}

/** One line of the live scoreboard (D1). Participants who left stay listed. */
export interface ScoreboardEntryDto {
  playerId: string;
  displayName: string;
  avatarId: string;
  /** Ties share a rank (1, 1, 3). */
  rank: number;
  totalScore: number;
  correctGuesses: number;
  /** Points earned because nobody guessed the player's playlist. */
  ownerPoints: number;
  hasLeft: boolean;
}

/** An award; ties are shared, so several players can hold it. */
export interface AwardDto {
  playerIds: string[];
  value: number;
}

export interface GameAwardsDto {
  /** Most correct guesses (null when nobody guessed right). */
  topGuesser: AwardDto | null;
  /** Most points from playlists nobody guessed (null when nobody earned any). */
  bestBluffer: AwardDto | null;
}

export interface GameResultsDto {
  ranking: ScoreboardEntryDto[];
  awards: GameAwardsDto;
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
  /** Fixed when the game starts. */
  playbackMode: PlaybackMode;
  phase: ActiveGamePhase;
  roundNumber: number;
  totalRounds: number;
  phaseStartedAt: string;
  /** Labels of the playlists in this game, in label order. */
  playlistLabels: string[];
  /** The current round's song; `null` in SCOREBOARD and FINISHED. */
  currentRound: PublicRoundDto | null;
  viewer: GameViewerContextDto;
  /** Vote counts, in VOTING only. */
  voteProgress: VoteProgressDto | null;
  /** The latest revealed round, while the game is in REVEAL or later. */
  lastReveal: RoundRevealDto | null;
  /** Live scoreboard; it only changes when a round is revealed. */
  scoreboard: ScoreboardEntryDto[];
  /** Final ranking and awards, in SCOREBOARD and FINISHED. */
  results: GameResultsDto | null;
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

export interface VoteSubmitRequest {
  roundNumber: number;
  suspectPlayerId: string;
  /** A retry with the same ID returns the original result instead of ALREADY_VOTED. */
  clientRequestId: string;
}

export interface VoteSubmitResponse {
  roundNumber: number;
  suspectPlayerId: string;
}

export interface GameRematchRequest {
  clientRequestId: string;
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

export interface VoteProgressEvent extends GameVersioned, VoteProgressDto {
  roundNumber: number;
}

export interface GameRoundRevealedEvent extends GameVersioned {
  reveal: RoundRevealDto;
  scoreboard: ScoreboardEntryDto[];
}

/** Sent when the game reaches SCOREBOARD. */
export interface GameResultsEvent extends GameVersioned {
  results: GameResultsDto;
}

export interface GameFinishedEvent extends GameVersioned {
  endReason: GameEndReason;
  results: GameResultsDto;
}
