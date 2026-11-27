import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GamesModule } from '../games/games.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { CommandDedupeService } from './command-dedupe.service.js';
import { GameGateway } from './game.gateway.js';
import { RealtimeCoreModule } from './realtime-core.module.js';
import { RoomSessionService } from './room-session.service.js';

@Module({
  imports: [AuthModule, RoomsModule, GamesModule, RealtimeCoreModule],
  providers: [GameGateway, RoomSessionService, CommandDedupeService],
})
export class RealtimeModule {}
