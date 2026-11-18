'use client';

import { ErrorCode } from '@pmp/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { createGameSocket, emitWithAck, type GameSocket } from '@/lib/socket-client';
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

interface RoomConnection {
  /** Reconnects after this tab was replaced by another one. */
  reclaim: () => void;
  /** Closes the connection (used before leaving the room). */
  close: () => void;
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

    const resync = async () => {
      if (!socket.connected || document.visibilityState !== 'visible') return;
      const ack = await emitWithAck(socket, 'sync:request', {});
      if (ack.ok) useRoomStore.getState().setSnapshot(ack.data);
      void queryClient.invalidateQueries({ queryKey: myPlaylistKey(roomCode) });
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

  return {
    reclaim: () => {
      const socket = socketRef.current;
      if (!socket) return;
      useRoomStore.getState().setConnection('connecting');
      socket.connect();
    },
    close: () => socketRef.current?.disconnect(),
  };
}
