'use client';

import type { ActiveGamePhase, GameSnapshotDto, RoomSnapshotDto } from '@pmp/shared';
import { Card } from '@/components/ui/card';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { LeaveRoomButton } from '../../room/components/leave-room-button';
import { PlayerList } from '../../room/components/player-list';
import { FinalResults } from './final-results';
import { LeaderControls } from './leader-controls';
import { RevealDetails } from './reveal-details';
import { Scoreboard } from './scoreboard';
import { SongCard } from './song-card';
import { VotePanel } from './vote-panel';

const PHASE_TITLE: Record<ActiveGamePhase, string> = {
  PLAYING: 'Listen',
  DISCUSSION: 'Discuss',
  VOTING: 'Vote',
  REVEAL: 'Reveal',
  SCOREBOARD: 'Game over',
  FINISHED: 'Game over',
};

function phaseHint(game: GameSnapshotDto, leaderName: string): string {
  switch (game.phase) {
    case 'PLAYING':
      return `The song is playing on ${leaderName}'s device.`;
    case 'DISCUSSION':
      return 'Whose playlist is this song from? Talk it over.';
    case 'VOTING':
      return game.viewer.isYourPlaylist
        ? "Vote too, so nobody can tell it's yours."
        : 'Voting closes when everyone has voted, or when the leader closes it.';
    case 'REVEAL':
      return '';
    case 'SCOREBOARD':
    case 'FINISHED':
      return game.endReason === 'NOT_ENOUGH_PLAYERS'
        ? 'The game ended early: too few players were left.'
        : game.endReason === 'OUT_OF_SONGS'
          ? 'The game ended early: no playable songs were left.'
          : '';
  }
}

/** Minimal game screen (M4–M5): song, voting, reveal, scores and the leader's controls. */
export function GameScreen({
  room,
  connection,
}: {
  room: RoomSnapshotDto;
  connection: RoomConnection;
}) {
  const game = room.game as GameSnapshotDto;
  const isLeader = room.hostPlayerId === room.viewerPlayerId;
  const leaderName =
    room.players.find((p) => p.id === room.hostPlayerId)?.displayName ?? 'the host';
  const hint = phaseHint(game, leaderName);
  const reveal = game.phase === 'REVEAL' ? game.lastReveal : null;
  const results = game.phase === 'SCOREBOARD' ? game.results : null;

  return (
    <Card>
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{PHASE_TITLE[game.phase]}</h1>
        <span className="text-sm text-muted-foreground" aria-label="Round">
          Round {game.roundNumber} / {game.totalRounds}
        </span>
      </header>

      {game.currentRound && (
        <SongCard round={game.currentRound} isYours={game.viewer.isYourPlaylist} />
      )}
      {game.phase === 'VOTING' && <VotePanel room={room} game={game} connection={connection} />}
      {reveal && (
        <RevealDetails
          reveal={reveal}
          scoreboard={game.scoreboard}
          viewerPlayerId={room.viewerPlayerId}
        />
      )}
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {results && (
        <FinalResults
          results={results}
          viewerPlayerId={room.viewerPlayerId}
          isLeader={isLeader}
          connection={connection}
        />
      )}

      {isLeader ? (
        <LeaderControls game={game} connection={connection} />
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for {leaderName}…</p>
      )}

      {!results && <Scoreboard entries={game.scoreboard} viewerPlayerId={room.viewerPlayerId} />}
      <PlayerList
        players={room.players}
        viewerPlayerId={room.viewerPlayerId}
        maxPlayers={room.settings.maxPlayers}
      />
      <LeaveRoomButton roomCode={room.code} connection={connection} />
    </Card>
  );
}
