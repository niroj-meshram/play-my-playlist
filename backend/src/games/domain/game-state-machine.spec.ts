import { describe, expect, it } from '@jest/globals';
import type { ActiveGamePhase } from '@pmp/shared';
import { nextPhase, type GameTrigger } from './game-state-machine.js';

const mid = { roundNumber: 3, totalRounds: 10 };
const last = { roundNumber: 10, totalRounds: 10 };

describe('nextPhase', () => {
  it.each<[ActiveGamePhase, GameTrigger, typeof mid, ActiveGamePhase]>([
    ['PLAYING', 'ADVANCE', mid, 'DISCUSSION'],
    ['PLAYING', 'PLAYBACK_ENDED', mid, 'DISCUSSION'],
    ['DISCUSSION', 'ADVANCE', mid, 'VOTING'],
    ['VOTING', 'ADVANCE', mid, 'REVEAL'],
    ['VOTING', 'VOTING_COMPLETE', mid, 'REVEAL'],
    ['VOTING', 'VOTING_COMPLETE', last, 'REVEAL'],
    ['REVEAL', 'ADVANCE', mid, 'PLAYING'],
    ['REVEAL', 'ADVANCE', last, 'SCOREBOARD'],
    ['SCOREBOARD', 'ADVANCE', last, 'FINISHED'],
    ['PLAYING', 'END_EARLY', mid, 'SCOREBOARD'],
    ['DISCUSSION', 'END_EARLY', mid, 'SCOREBOARD'],
    ['VOTING', 'END_EARLY', mid, 'SCOREBOARD'],
    ['REVEAL', 'END_EARLY', mid, 'SCOREBOARD'],
  ])('%s + %s → %s', (phase, trigger, progress, expected) => {
    expect(nextPhase(phase, trigger, progress)).toBe(expected);
  });

  it.each<[ActiveGamePhase, GameTrigger]>([
    ['FINISHED', 'ADVANCE'],
    ['FINISHED', 'END_EARLY'],
    ['SCOREBOARD', 'END_EARLY'],
    ['DISCUSSION', 'PLAYBACK_ENDED'],
    ['VOTING', 'PLAYBACK_ENDED'],
    ['REVEAL', 'PLAYBACK_ENDED'],
    ['SCOREBOARD', 'PLAYBACK_ENDED'],
    ['PLAYING', 'VOTING_COMPLETE'],
    ['DISCUSSION', 'VOTING_COMPLETE'],
    ['REVEAL', 'VOTING_COMPLETE'],
    ['SCOREBOARD', 'VOTING_COMPLETE'],
  ])('rejects %s + %s', (phase, trigger) => {
    expect(nextPhase(phase, trigger, mid)).toBeNull();
  });
});
