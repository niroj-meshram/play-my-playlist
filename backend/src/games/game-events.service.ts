import { Injectable } from '@nestjs/common';
import type {
  GameFinishedEvent,
  GamePhaseChangedEvent,
  GameRoundRevealedEvent,
  GameRoundStartedEvent,
  GameStartedEvent,
  RoundViewerContextEvent,
} from '@pmp/shared';
import { RoomBroadcaster } from '../realtime/room-broadcaster.service.js';

/** What a committed game change must tell clients. Collected inside the transaction. */
export type GameNotice =
  | { kind: 'started'; event: GameStartedEvent }
  | { kind: 'phase'; event: GamePhaseChangedEvent }
  | { kind: 'round'; replaced: boolean; event: GameRoundStartedEvent }
  /** Private: goes only to this player's channel. */
  | { kind: 'viewer'; playerId: string; event: RoundViewerContextEvent }
  | { kind: 'revealed'; event: GameRoundRevealedEvent }
  | { kind: 'finished'; event: GameFinishedEvent };

/**
 * The only place game events are emitted, always after the transaction committed.
 * Public events never carry owner data; viewer context goes to each player privately.
 */
@Injectable()
export class GameEventsService {
  constructor(private readonly broadcaster: RoomBroadcaster) {}

  publish(roomId: string, notices: readonly GameNotice[]): void {
    for (const notice of notices) {
      switch (notice.kind) {
        case 'started':
          this.broadcaster.toRoom(roomId, 'game:started', notice.event);
          break;
        case 'phase':
          this.broadcaster.toRoom(roomId, 'game:phase-changed', notice.event);
          break;
        case 'round':
          this.broadcaster.toRoom(
            roomId,
            notice.replaced ? 'game:track-replaced' : 'game:round-started',
            notice.event,
          );
          break;
        case 'viewer':
          this.broadcaster.toPlayer(notice.playerId, 'round:viewer-context', notice.event);
          break;
        case 'revealed':
          this.broadcaster.toRoom(roomId, 'game:round-revealed', notice.event);
          break;
        case 'finished':
          this.broadcaster.toRoom(roomId, 'game:finished', notice.event);
          break;
      }
    }
  }
}
