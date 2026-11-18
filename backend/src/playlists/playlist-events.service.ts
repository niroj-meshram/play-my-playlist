import { Injectable } from '@nestjs/common';
import type { MyPlaylistDto } from '@pmp/shared';
import { RoomBroadcaster } from '../realtime/room-broadcaster.service.js';

/**
 * The only place playlist events are emitted. The owner gets their full status on
 * their private channel; the room only learns whether the player is ready, and only
 * when that changes.
 */
@Injectable()
export class PlaylistEventsService {
  constructor(private readonly broadcaster: RoomBroadcaster) {}

  publish(
    roomId: string,
    playerId: string,
    playlist: MyPlaylistDto | null,
    readyChanged: boolean,
  ): void {
    this.broadcaster.toPlayer(playerId, 'playlist:my-status', { playlist });
    if (readyChanged) {
      this.broadcaster.toRoom(roomId, 'playlist:submission-updated', {
        playerId,
        ready: playlist?.status === 'READY',
      });
    }
  }
}
