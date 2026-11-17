import type { RoomSnapshotDto } from '@pmp/shared';
import { create } from 'zustand';

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  /** Another tab or device of this player took over. */
  | 'replaced'
  | 'error';

interface RoomState {
  snapshot: RoomSnapshotDto | null;
  connection: ConnectionStatus;
  error: string | null;
  setSnapshot: (snapshot: RoomSnapshotDto) => void;
  /** Applies a pure patch; ignored until the first snapshot arrives. */
  patch: (fn: (room: RoomSnapshotDto) => RoomSnapshotDto) => void;
  setConnection: (connection: ConnectionStatus, error?: string | null) => void;
  reset: () => void;
}

const initial = { snapshot: null, connection: 'connecting' as const, error: null };

/** Live lobby state. The server is authoritative; this only mirrors its snapshot and events. */
export const useRoomStore = create<RoomState>()((set) => ({
  ...initial,
  setSnapshot: (snapshot) => set({ snapshot }),
  patch: (fn) => set((s) => (s.snapshot ? { snapshot: fn(s.snapshot) } : s)),
  setConnection: (connection, error = null) => set({ connection, error }),
  reset: () => set(initial),
}));
