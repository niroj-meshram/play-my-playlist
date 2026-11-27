import { Module } from '@nestjs/common';
import { RealtimeCoreModule } from '../realtime/realtime-core.module.js';
import { GameEventsService } from './game-events.service.js';
import { GameOrchestrator } from './game-orchestrator.service.js';
import { GameQueryService } from './game-query.service.js';
import { RoundScorer } from './round-scorer.service.js';
import { VoteCounter } from './vote-counter.service.js';
import { VotingService } from './voting.service.js';

/** Game engine. Depends on realtime broadcasting only; rooms depend on it, never the reverse. */
@Module({
  imports: [RealtimeCoreModule],
  providers: [
    GameOrchestrator,
    GameQueryService,
    GameEventsService,
    VoteCounter,
    RoundScorer,
    VotingService,
  ],
  exports: [GameOrchestrator, GameQueryService, GameEventsService, VotingService],
})
export class GamesModule {}
