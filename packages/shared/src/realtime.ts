import type { ErrorCode } from './errors.js';
import type {
  GameAdvanceRequest,
  GameAdvanceResponse,
  GameFinishedEvent,
  GamePhaseChangedEvent,
  GameRematchRequest,
  GameResultsEvent,
  GameRoundRevealedEvent,
  GameRoundStartedEvent,
  GameStartedEvent,
  GameStartRequest,
  PlaybackReportRequest,
  PlaybackReportResponse,
  RoundViewerContextEvent,
  VoteProgressEvent,
  VoteSubmitRequest,
  VoteSubmitResponse,
} from './games.js';
import type { MyPlaylistStatusEvent, PlaylistSubmissionUpdatedEvent } from './playlists.js';
import type { RoomPlayerDto, RoomSettingsDto, RoomSnapshotDto } from './rooms.js';

/** Socket.IO namespace for all room and game traffic. */
export const GAME_NAMESPACE = '/game';

/**
 * Public connection state of a room player (docs/architecture.md §9–10).
 * - ONLINE: connected, or disconnected for less than the presence debounce (~5 s).
 * - RECONNECTING: disconnected, still inside the 30 s grace period.
 * - AWAY: disconnected past the grace period (or never connected).
 * ONLINE and RECONNECTING players count as online for voting (D5).
 */
export const PlayerPresence = {
  ONLINE: 'ONLINE',
  RECONNECTING: 'RECONNECTING',
  AWAY: 'AWAY',
} as const;
export type PlayerPresence = (typeof PlayerPresence)[keyof typeof PlayerPresence];

/** Error payload carried in a failed acknowledgement. */
export interface WsError {
  code: ErrorCode;
  message: string;
}

/** Every client→server command is acknowledged with this envelope. */
export type WsAck<T> = { ok: true; data: T } | { ok: false; error: WsError };
export type AckCallback<T> = (response: WsAck<T>) => void;

/** Sent in the handshake: `io(url, { auth: { token } })`. */
export interface SocketAuthPayload {
  token: string;
}

export interface RoomSubscribeRequest {
  roomCode: string;
}

export interface TimePingRequest {
  clientSentAt: number;
}

export interface TimePingResponse {
  /** Server clock in epoch milliseconds. */
  serverTime: number;
}

export interface PlayerJoinedEvent {
  player: RoomPlayerDto;
}

export interface PlayerLeftEvent {
  playerId: string;
}

export interface PresenceChangedEvent {
  playerId: string;
  presence: PlayerPresence;
}

export interface HostChangedEvent {
  hostPlayerId: string;
}

export interface SettingsUpdatedEvent {
  settings: RoomSettingsDto;
}

export interface ClientToServerEvents {
  'room:subscribe': (payload: RoomSubscribeRequest, ack: AckCallback<RoomSnapshotDto>) => void;
  'sync:request': (payload: Record<string, never>, ack: AckCallback<RoomSnapshotDto>) => void;
  'time:ping': (payload: TimePingRequest, ack: AckCallback<TimePingResponse>) => void;
  /** Leader only, in LOBBY. Ack returns the viewer's room snapshot with the new game. */
  'game:start': (payload: GameStartRequest, ack: AckCallback<RoomSnapshotDto>) => void;
  /** Leader only. Moves the game one phase forward; stale clicks are acknowledged as not applied. */
  'game:advance': (payload: GameAdvanceRequest, ack: AckCallback<GameAdvanceResponse>) => void;
  /** Leader only. Reports what the leader's YouTube player is doing. */
  'playback:report': (
    payload: PlaybackReportRequest,
    ack: AckCallback<PlaybackReportResponse>,
  ) => void;
  /** Participant, in VOTING. Final once accepted. */
  'vote:submit': (payload: VoteSubmitRequest, ack: AckCallback<VoteSubmitResponse>) => void;
  /** Leader only, in SCOREBOARD or after a game. Finishes the game and starts the next one. */
  'game:rematch': (payload: GameRematchRequest, ack: AckCallback<RoomSnapshotDto>) => void;
}

export interface ServerToClientEvents {
  'room:player-joined': (event: PlayerJoinedEvent) => void;
  'room:player-left': (event: PlayerLeftEvent) => void;
  'room:presence': (event: PresenceChangedEvent) => void;
  'room:host-changed': (event: HostChangedEvent) => void;
  'room:settings-updated': (event: SettingsUpdatedEvent) => void;
  'playlist:submission-updated': (event: PlaylistSubmissionUpdatedEvent) => void;
  /** Sent to the owner's private channel only. */
  'playlist:my-status': (event: MyPlaylistStatusEvent) => void;
  /** This connection was replaced by a newer tab or device of the same player. */
  'session:replaced': () => void;
  'game:started': (event: GameStartedEvent) => void;
  'game:phase-changed': (event: GamePhaseChangedEvent) => void;
  'game:round-started': (event: GameRoundStartedEvent) => void;
  /** The current round's song could not play and was swapped for another from the same playlist. */
  'game:track-replaced': (event: GameRoundStartedEvent) => void;
  /** Sent to each participant's private channel only. */
  'round:viewer-context': (event: RoundViewerContextEvent) => void;
  /** Counts only; individual votes stay private until the reveal. */
  'vote:progress': (event: VoteProgressEvent) => void;
  'game:round-revealed': (event: GameRoundRevealedEvent) => void;
  'game:results': (event: GameResultsEvent) => void;
  'game:finished': (event: GameFinishedEvent) => void;
}
