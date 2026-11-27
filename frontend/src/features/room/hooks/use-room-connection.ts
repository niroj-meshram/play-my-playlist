'use client';

import { ErrorCode, type RoomSnapshotDto } from '@pmp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { createGameSocket, emitWithAck, type GameSocket } from '@/lib/socket-client';
import {
  applyGameFinished,
  applyGameResults,
  applyGameStarted,
  applyPhaseChanged,
  applyRoundRevealed,
  applyRoundStarted,
  applyViewerContext,
  applyVoteProgress,
  type GameUpdate,
} from '../../game/game-events';
import { myPlaylistKey } from '../../playlist/playlist-api';
import { getFreshToken } from '../../session/session-api';
import {
  applyHostChanged,
  applyPlayerJoined,
  applyPlayerLeft,
  applyPlaylistReady,
  applyPresence,
  applySettings,
} from '../room-events';
import { useRoomStore } from '../room-store';

const RETRY_DELAY_MS = 2_000;

export interface RoomConnection {
  /** Reconnects after this tab was replaced by another one. */
  reclaim: () => void;
  /** Closes the connection (used before leaving the room). */
  close: () => void;
  /** The live socket, for sending game commands. */
  getSocket: () => GameSocket | null;
}

/**
 * Owns the Socket.IO connection for one room. On every (re)connect it subscribes and
 * replaces local state with the server snapshot; live events are applied as patches.
 */
export function useRoomConnection(roomCode: string, onNotMember: () => void): RoomConnection {
  const queryClient = useQueryClient();
  const socketRef = useRef<GameSocket | null>(null);
  const onNotMemberRef = useRef(onNotMember);
  useEffect(() => {
    onNotMemberRef.current = onNotMember;
  }, [onNotMember]);

  useEffect(() => {
    const store = useRoomStore.getState();
    store.reset();
    const socket = createGameSocket(getFreshToken);
    socketRef.current = socket;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let replaced = false;

    const subscribe = async () => {
      const ack = await emitWithAck(socket, 'room:subscribe', { roomCode });
      if (ack.ok) {
        useRoomStore.getState().setSnapshot(ack.data);
        useRoomStore.getState().setConnection('connected');
        // Events may have been missed while disconnected.
        void queryClient.invalidateQueries({ queryKey: myPlaylistKey(roomCode) });
      } else if (ack.error.code === ErrorCode.ROOM_NOT_FOUND) {
        socket.disconnect();
        onNotMemberRef.current();
      } else {
        useRoomStore.getState().setConnection('error', ack.error.message);
      }
    };

    const sync = async () => {
      if (!socket.connected) return;
      const ack = await emitWithAck(socket, 'sync:request', {});
      if (ack.ok) useRoomStore.getState().setSnapshot(ack.data);
      void queryClient.invalidateQueries({ queryKey: myPlaylistKey(roomCode) });
    };
    const resync = async () => {
      if (document.visibilityState === 'visible') await sync();
    };
    /** Applies a versioned game event, or resyncs when events were missed. */
    const game = (update: (room: RoomSnapshotDto) => GameUpdate) => {
      const room = useRoomStore.getState().snapshot;
      if (!room) return;
      const next = update(room);
      if (next === 'resync') void sync();
      else if (next !== room) useRoomStore.getState().setSnapshot(next);
    };

    socket.on('connect', () => {
      replaced = false;
      void subscribe();
    });
    socket.on('disconnect', (reason) => {
      if (replaced || reason === 'io client disconnect') return;
      useRoomStore.getState().setConnection('reconnecting');
      // A server-side disconnect is not retried automatically by Socket.IO.
      if (reason === 'io server disconnect')
        retryTimer = setTimeout(() => socket.connect(), RETRY_DELAY_MS);
    });
    socket.on('connect_error', () => {
      useRoomStore.getState().setConnection('reconnecting');
      // Handshake rejections (e.g. an expired token) are not retried automatically either.
      if (!socket.active) retryTimer = setTimeout(() => socket.connect(), RETRY_DELAY_MS);
    });
    socket.on('session:replaced', () => {
      replaced = true;
      useRoomStore.getState().setConnection('replaced');
    });

    const { patch } = useRoomStore.getState();
    socket.on('room:player-joined', (e) => patch((r) => applyPlayerJoined(r, e)));
    socket.on('room:player-left', (e) => patch((r) => applyPlayerLeft(r, e)));
    socket.on('room:presence', (e) => patch((r) => applyPresence(r, e)));
    socket.on('room:host-changed', (e) => patch((r) => applyHostChanged(r, e)));
    socket.on('room:settings-updated', (e) => patch((r) => applySettings(r, e)));
    socket.on('playlist:submission-updated', (e) => patch((r) => applyPlaylistReady(r, e)));
    // The viewer's own submission is server state owned by TanStack Query.
    socket.on('playlist:my-status', (e) =>
      queryClient.setQueryData(myPlaylistKey(roomCode), { playlist: e.playlist }),
    );
    socket.on('game:started', () => game(applyGameStarted));
    socket.on('game:phase-changed', (e) => game((r) => applyPhaseChanged(r, e)));
    socket.on('game:round-started', (e) => game((r) => applyRoundStarted(r, e)));
    socket.on('game:track-replaced', (e) => game((r) => applyRoundStarted(r, e)));
    socket.on('round:viewer-context', (e) => game((r) => applyViewerContext(r, e)));
    socket.on('vote:progress', (e) => game((r) => applyVoteProgress(r, e)));
    socket.on('game:round-revealed', (e) => game((r) => applyRoundRevealed(r, e)));
    socket.on('game:results', (e) => game((r) => applyGameResults(r, e)));
    socket.on('game:finished', (e) => game((r) => applyGameFinished(r, e)));

    document.addEventListener('visibilitychange', resync);
    socket.connect();

    return () => {
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', resync);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, queryClient]);

  const getSocket = useCallback(() => socketRef.current, []);

  return {
    reclaim: () => {
      const socket = socketRef.current;
      if (!socket) return;
      useRoomStore.getState().setConnection('connecting');
      socket.connect();
    },
    close: () => socketRef.current?.disconnect(),
    getSocket,
  };
}
