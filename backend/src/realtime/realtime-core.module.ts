import { Module } from '@nestjs/common';
import { PresenceService } from './presence/presence.service.js';
import { RoomBroadcaster } from './room-broadcaster.service.js';

/** Presence and broadcasting, shared by the rooms domain, the gateway and the sweeper. */
@Module({
  providers: [PresenceService, RoomBroadcaster],
  exports: [PresenceService, RoomBroadcaster],
})
export class RealtimeCoreModule {}
