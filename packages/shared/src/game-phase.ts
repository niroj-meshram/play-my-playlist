/**
 * Authoritative game phases. LOBBY is a room-level state (no game exists yet);
 * the remaining values are phases of a running game. See docs/architecture.md §4.
 */
export const GamePhase = {
  LOBBY: 'LOBBY',
  PLAYING: 'PLAYING',
  DISCUSSION: 'DISCUSSION',
  VOTING: 'VOTING',
  REVEAL: 'REVEAL',
  SCOREBOARD: 'SCOREBOARD',
  FINISHED: 'FINISHED',
} as const;

export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];
