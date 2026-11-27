'use client';

import type { RoomSnapshotDto } from '@pmp/shared';
import { Card } from '@/components/ui/card';
import { StartGameButton } from '../../game/components/start-game-button';
import { PlaylistCard } from '../../playlist/components/playlist-card';
import type { RoomConnection } from '../hooks/use-room-connection';
import { InviteLink } from './invite-link';
import { LeaveRoomButton } from './leave-room-button';
import { PlayerList } from './player-list';
import { RoomSettings } from './room-settings';

export function Lobby({ room, connection }: { room: RoomSnapshotDto; connection: RoomConnection }) {
  const isHost = room.hostPlayerId === room.viewerPlayerId;
  return (
    <Card>
      <h1 className="text-2xl font-bold tracking-tight">Lobby</h1>
      <InviteLink roomCode={room.code} />
      <p className="text-sm text-muted-foreground">
        Everyone submits a YouTube playlist, then the host starts the game.
      </p>
      <PlaylistCard roomCode={room.code} />
      <PlayerList
        players={room.players}
        viewerPlayerId={room.viewerPlayerId}
        maxPlayers={room.settings.maxPlayers}
      />
      <StartGameButton room={room} connection={connection} />
      <RoomSettings
        roomCode={room.code}
        settings={room.settings}
        playerCount={room.players.length}
        isHost={isHost}
      />
      <LeaveRoomButton roomCode={room.code} connection={connection} />
    </Card>
  );
}
