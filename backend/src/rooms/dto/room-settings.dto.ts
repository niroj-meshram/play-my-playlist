import { ROOM_LIMITS, type UpdateRoomSettingsRequest } from '@pmp/shared';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RoomSettingsInputDto implements UpdateRoomSettingsRequest {
  @IsOptional()
  @IsInt()
  @Min(ROOM_LIMITS.minPlayers)
  @Max(ROOM_LIMITS.maxPlayers)
  maxPlayers?: number;

  @IsOptional()
  @IsInt()
  @Min(ROOM_LIMITS.minRoundCount)
  @Max(ROOM_LIMITS.maxRoundCount)
  roundCount?: number;
}
