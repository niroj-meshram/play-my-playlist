import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { GetMyPlaylistResponse, SubmitPlaylistResponse } from '@pmp/shared';
import type { AuthContext } from '../common/auth/auth-context.js';
import { CurrentAuth } from '../common/auth/current-auth.decorator.js';
import { PlayerRateLimit } from '../common/throttling/player-rate-limit.guard.js';
import { RATE_LIMITS } from '../common/throttling/rate-limits.js';
import { ParseRoomCodePipe } from '../rooms/room-code.pipe.js';
import { SubmitPlaylistDto } from './dto/submit-playlist.dto.js';
import { PlaylistsService } from './playlists.service.js';

/** The caller's own playlist in a room. Nobody can read another player's submission. */
@Controller('rooms/:code/playlist')
export class PlaylistsController {
  constructor(private readonly playlists: PlaylistsService) {}

  @Put()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: RATE_LIMITS.submitPlaylist })
  @PlayerRateLimit('submitPlaylist')
  submit(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SubmitPlaylistDto,
  ): Promise<SubmitPlaylistResponse> {
    return this.playlists.submit(code, auth.userId, dto.url);
  }

  @Get()
  getMine(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<GetMyPlaylistResponse> {
    return this.playlists.getMine(code, auth.userId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('code', ParseRoomCodePipe) code: string,
    @CurrentAuth() auth: AuthContext,
  ): Promise<void> {
    return this.playlists.remove(code, auth.userId);
  }
}
