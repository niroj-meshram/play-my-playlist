import type { RoomSubscribeRequest } from '@pmp/shared';
import { IsString, MaxLength } from 'class-validator';

export class RoomSubscribeDto implements RoomSubscribeRequest {
  /** Normalised and checked by `normalizeRoomCode`, so malformed codes get the uniform 404. */
  @IsString()
  @MaxLength(16)
  roomCode: string;
}
