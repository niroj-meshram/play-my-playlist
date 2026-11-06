export interface HostCandidate {
  id: string;
  joinedAt: Date;
}

/** The longest-present remaining player becomes host; ties broken by ID for determinism. */
export function pickNextHost(
  activePlayers: readonly HostCandidate[],
  departingPlayerId: string,
): HostCandidate | null {
  const remaining = activePlayers.filter((p) => p.id !== departingPlayerId);
  remaining.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime() || a.id.localeCompare(b.id));
  return remaining[0] ?? null;
}
