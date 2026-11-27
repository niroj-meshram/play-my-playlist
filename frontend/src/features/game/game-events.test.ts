import { describe, expect, it } from '@jest/globals';
import type { GameSnapshotDto, PublicRoundDto, RoomSnapshotDto } from '@pmp/shared';
import {
  applyGameFinished,
  applyPhaseChanged,
  applyRoundRevealed,
  applyRoundStarted,
  applyViewerContext,
  isGameRunning,
} from './game-events';

const round = (n: number, videoId = `vid${n}`): PublicRoundDto => ({
  roundNumber: n,
  playlistLabel: 'Playlist B',
  track: { videoId, title: `Song ${n}`, artist: null, thumbnailUrl: null, durationSec: 200 },
});

const game: GameSnapshotDto = {
  stateVersion: 5,
  serverTime: 0,
  gameNumber: 1,
  phase: 'REVEAL',
  roundNumber: 2,
  totalRounds: 10,
  phaseStartedAt: '2026-01-01T00:00:00Z',
  playlistLabels: ['Playlist A', 'Playlist B', 'Playlist C'],
  currentRound: round(2),
  viewer: { isYourPlaylist: true },
  lastReveal: null,
  endReason: null,
};

const room: RoomSnapshotDto = {
  code: 'ABC234',
  status: 'IN_GAME',
  visibility: 'INVITE_ONLY',
  settings: { maxPlayers: 5, roundCount: 10 },
  hostPlayerId: 'a',
  players: [],
  viewerPlayerId: 'b',
  game,
};

const v = (stateVersion: number) => ({ stateVersion, serverTime: 1 });

function gameOf(update: ReturnType<typeof applyPhaseChanged>): GameSnapshotDto {
  if (update === 'resync' || !update.game) throw new Error('expected a game');
  return update.game;
}

describe('game event reducers', () => {
  it('moves to the next round: phase, song and private context arrive with one version', () => {
    let next = applyPhaseChanged(room, {
      ...v(6),
      phase: 'PLAYING',
      roundNumber: 3,
      totalRounds: 10,
      phaseStartedAt: '2026-01-01T00:01:00Z',
      endReason: null,
    });
    expect(gameOf(next)).toMatchObject({ phase: 'PLAYING', roundNumber: 3, currentRound: null });
    expect(gameOf(next).viewer.isYourPlaylist).toBe(false);

    next = applyRoundStarted(next as RoomSnapshotDto, { ...v(6), round: round(3) });
    next = applyViewerContext(next as RoomSnapshotDto, {
      ...v(6),
      roundNumber: 3,
      viewer: { isYourPlaylist: true },
    });
    expect(gameOf(next)).toMatchObject({
      stateVersion: 6,
      currentRound: round(3),
      viewer: { isYourPlaylist: true },
    });
  });

  it('shows why a game ended early', () => {
    const next = applyPhaseChanged(room, {
      ...v(6),
      phase: 'SCOREBOARD',
      roundNumber: 2,
      totalRounds: 10,
      phaseStartedAt: '2026-01-01T00:01:00Z',
      endReason: 'NOT_ENOUGH_PLAYERS',
    });
    expect(gameOf(next)).toMatchObject({ phase: 'SCOREBOARD', endReason: 'NOT_ENOUGH_PLAYERS' });
  });

  it('drops events older than the current state', () => {
    expect(applyRoundRevealed(room, { ...v(4), reveal: {} as never })).toBe(room);
  });

  it('asks for a resync when events were missed', () => {
    expect(applyRoundStarted(room, { ...v(7), round: round(3) })).toBe('resync');
  });

  it('records the reveal', () => {
    const reveal = {
      roundNumber: 2,
      playlistLabel: 'Playlist B',
      ownerPlayerId: 'c',
      ownerDisplayName: 'Cara',
    };
    expect(gameOf(applyRoundRevealed(room, { ...v(5), reveal })).lastReveal).toEqual(reveal);
  });

  it('returns the room to the lobby when the game finishes', () => {
    const next = applyGameFinished(
      { ...room, game: { ...game, phase: 'SCOREBOARD' } },
      { ...v(6), endReason: 'COMPLETED' },
    );
    if (next === 'resync') throw new Error('unexpected resync');
    expect(next.status).toBe('LOBBY');
    expect(isGameRunning(next)).toBe(false);
    expect(isGameRunning(room)).toBe(true);
  });
});
