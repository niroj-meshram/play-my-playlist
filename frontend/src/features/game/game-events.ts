import type {
  ActiveGamePhase,
  GameFinishedEvent,
  GamePhaseChangedEvent,
  GameRoundRevealedEvent,
  GameRoundStartedEvent,
  GameSnapshotDto,
  GameVersioned,
  RoomSnapshotDto,
  RoundViewerContextEvent,
} from '@pmp/shared';

/** A reducer either returns the next room state or asks for a full resync. */
export type GameUpdate = RoomSnapshotDto | 'resync';

const IN_ROUND: readonly ActiveGamePhase[] = ['PLAYING', 'DISCUSSION', 'VOTING', 'REVEAL'];

/*
 * Pure reducers for game events (docs/architecture.md §9). Each event carries the game's
 * stateVersion. One server change can emit several events with the same version, so
 * equal versions apply; older ones are dropped; a jump means events were missed and the
 * client must resync.
 */
function withGame(
  room: RoomSnapshotDto,
  event: GameVersioned,
  update: (game: GameSnapshotDto) => GameSnapshotDto,
): GameUpdate {
  const game = room.game;
  if (!game || game.phase === 'FINISHED') return 'resync';
  if (event.stateVersion < game.stateVersion) return room;
  if (event.stateVersion > game.stateVersion + 1) return 'resync';
  return { ...room, game: { ...update(game), stateVersion: event.stateVersion } };
}

/** A new game: the event does not carry the viewer's private context, so fetch it all. */
export function applyGameStarted(): GameUpdate {
  return 'resync';
}

export function applyPhaseChanged(room: RoomSnapshotDto, e: GamePhaseChangedEvent): GameUpdate {
  return withGame(room, e, (game) => {
    const sameRound = game.currentRound?.roundNumber === e.roundNumber;
    return {
      ...game,
      phase: e.phase,
      roundNumber: e.roundNumber,
      totalRounds: e.totalRounds,
      phaseStartedAt: e.phaseStartedAt,
      endReason: e.endReason,
      // A new round's song arrives with `game:round-started` (same version).
      currentRound: IN_ROUND.includes(e.phase) && sameRound ? game.currentRound : null,
      viewer: sameRound ? game.viewer : { isYourPlaylist: false },
    };
  });
}

export function applyRoundStarted(room: RoomSnapshotDto, e: GameRoundStartedEvent): GameUpdate {
  return withGame(room, e, (game) => ({
    ...game,
    roundNumber: e.round.roundNumber,
    currentRound: e.round,
  }));
}

export function applyViewerContext(room: RoomSnapshotDto, e: RoundViewerContextEvent): GameUpdate {
  return withGame(room, e, (game) =>
    game.roundNumber === e.roundNumber ? { ...game, viewer: e.viewer } : game,
  );
}

export function applyRoundRevealed(room: RoomSnapshotDto, e: GameRoundRevealedEvent): GameUpdate {
  return withGame(room, e, (game) => ({ ...game, lastReveal: e.reveal }));
}

export function applyGameFinished(room: RoomSnapshotDto, e: GameFinishedEvent): GameUpdate {
  const next = withGame(room, e, (game) => ({
    ...game,
    phase: 'FINISHED',
    currentRound: null,
    endReason: e.endReason,
  }));
  // The room is back in the lobby once the game finishes.
  return next === 'resync' ? next : { ...next, status: 'LOBBY' };
}

/** Whether the room should show the game screen instead of the lobby. */
export function isGameRunning(room: RoomSnapshotDto): boolean {
  return room.game !== null && room.game.phase !== 'FINISHED';
}
