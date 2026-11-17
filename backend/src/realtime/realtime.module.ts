import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { GameGateway } from './game.gateway.js';
import { RealtimeCoreModule } from './realtime-core.module.js';
import { RoomSessionService } from './room-session.service.js';

@Module({
  imports: [AuthModule, RoomsModule, RealtimeCoreModule],
  providers: [GameGateway, RoomSessionService],
})
export class RealtimeModule {}
