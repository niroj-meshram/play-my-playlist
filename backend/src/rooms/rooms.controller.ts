import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { RoomPreviewDto, RoomSnapshotDto } from '@pmp/shared';
import type { AuthContext } from '../common/auth/auth-context.js';
import { CurrentAuth } from '../common/auth/current-auth.decorator.js';
import { RATE_LIMITS } from '../common/throttling/rate-limits.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { RoomSettingsInputDto } from './dto/room-settings.dto.js';
import { ParseRoomCodePipe } from './room-code.pipe.js';
import { RoomsService } from './rooms.service.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @Throttle({ default: RATE_LIMITS.createRoom })
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateRoomDto): Promise<RoomSnapshotDto> {
    return this.rooms.createRoom(auth.userId, dto);
  }

  @Get(':code/preview')
  @Throttle({ default: RATE_LIMITS.previewRoom })
  preview(@Param('code', ParseRoomCodePipe) code: string): Promise<RoomPreviewDto> {
    return this.rooms.getPreview(code);
  }

  @Get(':code')
  get(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<RoomSnapshotDto> {
    return this.rooms.getSnapshot(code, auth.userId);
  }

  @Post(':code/join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RATE_LIMITS.joinRoom })
  join(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
    @Body() dto: JoinRoomDto,
  ): Promise<RoomSnapshotDto> {
    return this.rooms.join(code, auth.userId, dto);
  }

  @Post(':code/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    return this.rooms.leave(code, auth.userId);
  }

  @Patch(':code/settings')
  updateSettings(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
    @Body() dto: RoomSettingsInputDto,
  ): Promise<RoomSnapshotDto> {
    return this.rooms.updateSettings(code, auth.userId, dto);
  }
}
