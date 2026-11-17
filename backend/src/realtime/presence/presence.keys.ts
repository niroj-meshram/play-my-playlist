/** Redis keys owned by the presence subsystem (docs/architecture.md §10). */
export const PRESENCE_TIMERS_KEY = 'pmp:presence:timers';

export const socketsKey = (roomId: string): string => `pmp:room:${roomId}:sockets`;
export const presenceKey = (roomId: string): string => `pmp:room:${roomId}:presence`;

/**
 * Grace timers. `reconnecting` fires after the presence debounce, `away` after the
 * grace period. Both are cancelled when the player reconnects.
 */
export const TimerKind = { RECONNECTING: 'reconnecting', AWAY: 'away' } as const;
export type TimerKind = (typeof TimerKind)[keyof typeof TimerKind];

export interface DueTimer {
  kind: TimerKind;
  roomId: string;
  playerId: string;
}

export const timerMember = (kind: TimerKind, roomId: string, playerId: string): string =>
  `${kind}:${roomId}:${playerId}`;

export function parseTimerMember(member: string): DueTimer | null {
  const [kind, roomId, playerId, ...rest] = member.split(':');
  if (rest.length > 0 || !roomId || !playerId) return null;
  if (kind !== TimerKind.RECONNECTING && kind !== TimerKind.AWAY) return null;
  return { kind, roomId, playerId };
}
