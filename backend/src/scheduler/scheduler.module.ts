import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { RealtimeCoreModule } from '../realtime/realtime-core.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { GraceSweeperService } from './grace-sweeper.service.js';

@Module({
  imports: [RealtimeCoreModule, RoomsModule, GamesModule],
  providers: [GraceSweeperService],
})
export class SchedulerModule {}
