/** Stable, client-facing error codes. Extend per feature; never reuse a code for a new meaning. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  // Sessions
  SESSION_INVALID: 'SESSION_INVALID',
  // Rooms
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  GAME_IN_PROGRESS: 'GAME_IN_PROGRESS',
  NOT_ROOM_HOST: 'NOT_ROOM_HOST',
  DISPLAY_NAME_TAKEN: 'DISPLAY_NAME_TAKEN',
  ROOM_SETTINGS_CONFLICT: 'ROOM_SETTINGS_CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Envelope returned by every failed REST request. */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
  requestId: string;
}
