import { describe, expect, it } from '@jest/globals';
import type {
  GameResultsDto,
  GameSnapshotDto,
  GameViewerContextDto,
  PublicRoundDto,
  RoomSnapshotDto,
  ScoreboardEntryDto,
} from '@pmp/shared';
import {
  applyGameFinished,
  applyGameResults,
  applyMyVote,
  applyPhaseChanged,
  applyRoundRevealed,
  applyRoundStarted,
  applyViewerContext,
  applyVoteProgress,
  isGameRunning,
} from './game-events';

const round = (n: number, videoId = `vid${n}`): PublicRoundDto => ({
  roundNumber: n,
  playlistLabel: 'Playlist B',
  track: { videoId, title: `Song ${n}`, artist: null, thumbnailUrl: null, durationSec: 200 },
  startedAt: '2026-01-01T00:00:00Z',
});

const viewer = (isYourPlaylist: boolean, myVote: string | null = null): GameViewerContextDto => ({
  isYourPlaylist,
  candidates: [{ playerId: 'c', displayName: 'Cara', avatarId: 'avatar-01' }],
  myVote,
});

const entry = (playerId: string, totalScore: number, rank: number): ScoreboardEntryDto => ({
  playerId,
  displayName: playerId.toUpperCase(),
  avatarId: 'avatar-01',
  rank,
  totalScore,
  correctGuesses: 0,
  ownerPoints: 0,
  hasLeft: false,
});

const results: GameResultsDto = {
  ranking: [entry('c', 20, 1), entry('b', 5, 2)],
  awards: { topGuesser: null, bestBluffer: { playerIds: ['c'], value: 20 } },
};

const game: GameSnapshotDto = {
  stateVersion: 5,
  serverTime: 0,
  gameNumber: 1,
  playbackMode: 'LEADER_ONLY',
  phase: 'REVEAL',
  roundNumber: 2,
  totalRounds: 10,
  phaseStartedAt: '2026-01-01T00:00:00Z',
  playlistLabels: ['Playlist A', 'Playlist B', 'Playlist C'],
  currentRound: round(2),
  viewer: viewer(true),
  voteProgress: null,
  lastReveal: null,
  scoreboard: [entry('b', 0, 1), entry('c', 0, 1)],
  results: null,
  endReason: null,
};

const room: RoomSnapshotDto = {
  code: 'ABC234',
  status: 'IN_GAME',
  visibility: 'INVITE_ONLY',
  settings: { maxPlayers: 5, roundCount: 10, playbackMode: 'LEADER_ONLY' },
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
    expect(gameOf(next).viewer).toEqual({ isYourPlaylist: false, candidates: [], myVote: null });

    next = applyRoundStarted(next as RoomSnapshotDto, { ...v(6), round: round(3) });
    next = applyViewerContext(next as RoomSnapshotDto, {
      ...v(6),
      roundNumber: 3,
      viewer: viewer(true),
    });
    expect(gameOf(next)).toMatchObject({
      stateVersion: 6,
      currentRound: round(3),
      viewer: viewer(true),
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
    expect(applyRoundRevealed(room, { ...v(4), reveal: {} as never, scoreboard: [] })).toBe(room);
  });

  it('asks for a resync when events were missed', () => {
    expect(applyRoundStarted(room, { ...v(7), round: round(3) })).toBe('resync');
  });

  it('records the reveal and the updated scoreboard', () => {
    const reveal = {
      roundNumber: 2,
      playlistLabel: 'Playlist B',
      ownerPlayerId: 'c',
      ownerDisplayName: 'Cara',
      votes: [{ voterPlayerId: 'b', suspectPlayerId: 'c', isCorrect: true }],
      points: [{ playerId: 'b', points: 10, reason: 'SOLE_CORRECT' as const }],
    };
    const scoreboard = [entry('b', 10, 1), entry('c', 0, 2)];
    const next = gameOf(applyRoundRevealed(room, { ...v(5), reveal, scoreboard }));
    expect(next.lastReveal).toEqual(reveal);
    expect(next.scoreboard).toEqual(scoreboard);
  });

  it('tracks vote counts only while the round is voting', () => {
    const voting = { ...room, game: { ...game, phase: 'VOTING' as const } };
    const progress = { ...v(5), roundNumber: 2, votesIn: 2, expected: 4 };
    expect(gameOf(applyVoteProgress(voting, progress)).voteProgress).toEqual({
      votesIn: 2,
      expected: 4,
    });
    expect(gameOf(applyVoteProgress(room, progress)).voteProgress).toBeNull();
    expect(gameOf(applyVoteProgress(voting, { ...progress, roundNumber: 1 })).voteProgress).toBe(
      null,
    );
  });

  it("records the viewer's accepted vote for the current round only", () => {
    expect(applyMyVote(room, { roundNumber: 2, suspectPlayerId: 'c' }).game?.viewer.myVote).toBe(
      'c',
    );
    expect(applyMyVote(room, { roundNumber: 1, suspectPlayerId: 'c' })).toBe(room);
  });

  it('clears vote counts when voting ends', () => {
    const voting = {
      ...room,
      game: { ...game, phase: 'VOTING' as const, voteProgress: { votesIn: 3, expected: 3 } },
    };
    const next = applyPhaseChanged(voting, {
      ...v(6),
      phase: 'REVEAL',
      roundNumber: 2,
      totalRounds: 10,
      phaseStartedAt: '2026-01-01T00:01:00Z',
      endReason: null,
    });
    expect(gameOf(next).voteProgress).toBeNull();
    expect(gameOf(next).viewer).toEqual(game.viewer);
  });

  it('shows the final results on the scoreboard', () => {
    const scoreboard = { ...room, game: { ...game, phase: 'SCOREBOARD' as const } };
    const next = gameOf(applyGameResults(scoreboard, { ...v(5), results }));
    expect(next.results).toEqual(results);
    expect(next.scoreboard).toEqual(results.ranking);
  });

  it('returns the room to the lobby when the game finishes', () => {
    const next = applyGameFinished(
      { ...room, game: { ...game, phase: 'SCOREBOARD' } },
      { ...v(6), endReason: 'COMPLETED', results },
    );
    if (next === 'resync') throw new Error('unexpected resync');
    expect(next.status).toBe('LOBBY');
    expect(isGameRunning(next)).toBe(false);
    expect(isGameRunning(room)).toBe(true);
  });
});
