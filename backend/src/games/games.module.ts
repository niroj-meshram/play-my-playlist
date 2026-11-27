import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module.js';
import { GameEventsService } from './game-events.service.js';
import { GameOrchestrator } from './game-orchestrator.service.js';
import { GameQueryService } from './game-query.service.js';

/** Game engine. Depends on realtime broadcasting only; rooms depend on it, never the reverse. */
@Module({
  imports: [RealtimeCoreModule],
  providers: [GameOrchestrator, GameQueryService, GameEventsService],
  exports: [GameOrchestrator, GameQueryService, GameEventsService],
})
export class GamesModule {}
