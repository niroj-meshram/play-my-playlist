import { Injectable, Logger } from '@nestjs/common';
import type { ServerToClientEvents } from '@pmp/shared';
import { playerChannel, roomChannel, type GameNamespace } from './socket.types.js';

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>;

/**
 * Sends server events to Socket.IO channels. Services call it only after their
 * transaction commits, so clients never see state that was rolled back. With the
 * Redis adapter, emits reach sockets on every API instance.
 */
@Injectable()
export class RoomBroadcaster {
  private readonly logger = new Logger(RoomBroadcaster.name);
  private namespace: GameNamespace | null = null;

  /** Called by the gateway once the Socket.IO namespace exists. */
  attach(namespace: GameNamespace): void {
    this.namespace = namespace;
  }

  toRoom<E extends keyof ServerToClientEvents>(
    roomId: string,
    event: E,
    ...args: EventArgs<E>
  ): void {
    this.withNamespace((ns) => ns.to(roomChannel(roomId)).emit(event, ...args));
  }

  /** Tells an older connection of a player that a newer tab took over, then closes it. */
  replaceSession(socketId: string): void {
    this.withNamespace((ns) => {
      ns.to(socketId).emit('session:replaced');
      ns.in(socketId).disconnectSockets(true);
    });
  }

  /** Stops a player who left from receiving any further room traffic. */
  removePlayer(roomId: string, playerId: string): void {
    this.withNamespace((ns) =>
      ns.in(playerChannel(playerId)).socketsLeave([roomChannel(roomId), playerChannel(playerId)]),
    );
  }

  private withNamespace(fn: (ns: GameNamespace) => void): void {
    if (!this.namespace) {
      this.logger.warn('Socket.IO namespace not attached yet; event dropped');
      return;
    }
    fn(this.namespace);
  }
}
