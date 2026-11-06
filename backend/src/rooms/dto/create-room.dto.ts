import type { CreateRoomRequest } from '@pmp/shared';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { RoomSettingsInputDto } from './room-settings.dto.js';

export class CreateRoomDto implements CreateRoomRequest {
  @IsOptional()
  @ValidateNested()
  @Type(() => RoomSettingsInputDto)
  settings?: RoomSettingsInputDto;
}
