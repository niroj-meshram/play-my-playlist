import type { ActiveGamePhase } from '@pmp/shared';

/**
 * What moved the game. There are no phase timers (§4): only the leader, the leader's
 * player and the end-game conditions advance a game.
 * - ADVANCE: the leader's button (stop song, open/close voting, next song, results, finish).
 * - PLAYBACK_ENDED: the song ended on the leader's device.
 * - END_EARLY: the game cannot continue (too few players, or no songs left).
 */
export type GameTrigger = 'ADVANCE' | 'PLAYBACK_ENDED' | 'END_EARLY';

export interface RoundProgress {
  roundNumber: number;
  totalRounds: number;
}

const IN_ROUND: readonly ActiveGamePhase[] = ['PLAYING', 'DISCUSSION', 'VOTING', 'REVEAL'];

/** The §4 transition table. Returns `null` when the trigger is not valid in this phase. */
export function nextPhase(
  phase: ActiveGamePhase,
  trigger: GameTrigger,
  progress: RoundProgress,
): ActiveGamePhase | null {
  if (trigger === 'END_EARLY') return IN_ROUND.includes(phase) ? 'SCOREBOARD' : null;
  if (trigger === 'PLAYBACK_ENDED') return phase === 'PLAYING' ? 'DISCUSSION' : null;

  switch (phase) {
    case 'PLAYING':
      return 'DISCUSSION';
    case 'DISCUSSION':
      return 'VOTING';
    case 'VOTING':
      return 'REVEAL';
    case 'REVEAL':
      return progress.roundNumber < progress.totalRounds ? 'PLAYING' : 'SCOREBOARD';
    case 'SCOREBOARD':
      return 'FINISHED';
    case 'FINISHED':
      return null;
  }
}
