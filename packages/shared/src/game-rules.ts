/** Approved defaults (docs/architecture.md §1, §5). Snapshotted per game when a game starts. */
export const ROOM_LIMITS = {
  minPlayers: 3,
  maxPlayers: 10,
  defaultMaxPlayers: 5,
  defaultRoundCount: 10,
  minPlayableTracks: 5,
  disconnectGraceSeconds: 30,
} as const;

export const SCORING_DEFAULTS = {
  /** Nobody guessed the owner: the owner receives these points. */
  ownerUnguessedPoints: 10,
  /** Exactly one player guessed correctly. */
  soleCorrectPoints: 10,
  /** Two or more players guessed correctly: each receives these points. */
  sharedCorrectPoints: 5,
} as const;
