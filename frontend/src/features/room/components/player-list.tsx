import { PlayerPresence, type RoomPlayerDto } from '@pmp/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlayerAvatar } from '../../session/components/player-avatar';

const PRESENCE_LABEL: Record<PlayerPresence, string> = {
  ONLINE: 'Online',
  RECONNECTING: 'Reconnecting…',
  AWAY: 'Away',
};

const PRESENCE_DOT: Record<PlayerPresence, string> = {
  ONLINE: 'bg-emerald-500',
  RECONNECTING: 'bg-amber-500 animate-pulse',
  AWAY: 'bg-muted-foreground',
};

interface PlayerListProps {
  players: RoomPlayerDto[];
  viewerPlayerId: string;
  maxPlayers: number;
}

export function PlayerList({ players, viewerPlayerId, maxPlayers }: PlayerListProps) {
  return (
    <section aria-labelledby="players-heading" className="flex flex-col gap-3">
      <h2 id="players-heading" className="text-sm font-medium text-muted-foreground">
        Players ({players.length}/{maxPlayers})
      </h2>
      <ul className="flex flex-col gap-2">
        {players.map((player) => (
          <li
            key={player.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-card p-3',
              player.presence === PlayerPresence.AWAY && 'opacity-60',
            )}
          >
            <PlayerAvatar avatarId={player.avatarId} name={player.displayName} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 truncate font-medium">
                <span className="truncate">{player.displayName}</span>
                {player.id === viewerPlayerId && (
                  <span className="text-xs text-muted-foreground">(you)</span>
                )}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', PRESENCE_DOT[player.presence])}
                />
                {PRESENCE_LABEL[player.presence]}
                <span aria-hidden="true">·</span>
                {player.playlistReady ? (
                  <span className="text-emerald-500">✓ Playlist ready</span>
                ) : (
                  <span>No playlist yet</span>
                )}
              </span>
            </div>
            {player.isHost && <Badge variant="secondary">Host</Badge>}
          </li>
        ))}
      </ul>
    </section>
  );
}
