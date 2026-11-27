import {
  GamePhase,
  PlaybackState,
  type ActiveGamePhase,
  type GameAdvanceRequest,
  type GameRematchRequest,
  type GameStartRequest,
  type PlaybackReportRequest,
  type VoteSubmitRequest,
} from '@pmp/shared';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const ACTIVE_PHASES = Object.values(GamePhase).filter((p) => p !== 'LOBBY');
const MAX_ROUND = 100;

export class GameStartDto implements GameStartRequest {
  @IsUUID('4')
  clientRequestId: string;
}

export class GameRematchDto implements GameRematchRequest {
  @IsUUID('4')
  clientRequestId: string;
}

export class VoteSubmitDto implements VoteSubmitRequest {
  @IsInt()
  @Min(1)
  @Max(MAX_ROUND)
  roundNumber: number;

  /** Room player IDs are UUIDv4; anything else cannot be a candidate. */
  @IsUUID('4')
  suspectPlayerId: string;

  @IsUUID('4')
  clientRequestId: string;
}

export class GameAdvanceDto implements GameAdvanceRequest {
  @IsIn(ACTIVE_PHASES)
  expectedPhase: ActiveGamePhase;

  @IsInt()
  @Min(1)
  @Max(MAX_ROUND)
  roundNumber: number;
}

export class PlaybackReportDto implements PlaybackReportRequest {
  @IsInt()
  @Min(1)
  @Max(MAX_ROUND)
  roundNumber: number;

  /** YouTube video IDs are 11 URL-safe characters; allow a little slack. */
  @Matches(/^[A-Za-z0-9_-]{6,16}$/)
  videoId: string;

  @IsIn(Object.values(PlaybackState))
  state: PlaybackState;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  ytErrorCode?: number;
}
