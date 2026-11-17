'use client';

import { ROOM_LIMITS, type RoomSettingsDto, type UpdateRoomSettingsRequest } from '@pmp/shared';
import { useMutation } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { roomApi } from '../room-api';
import { useRoomStore } from '../room-store';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
const PLAYER_OPTIONS = range(ROOM_LIMITS.minPlayers, ROOM_LIMITS.maxPlayers);
const ROUND_OPTIONS = range(ROOM_LIMITS.minRoundCount, ROOM_LIMITS.maxRoundCount);

const selectClass =
  'h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30';

interface RoomSettingsProps {
  roomCode: string;
  settings: RoomSettingsDto;
  playerCount: number;
  isHost: boolean;
}

/** The host edits settings; everyone else sees them read-only. */
export function RoomSettings({ roomCode, settings, playerCount, isHost }: RoomSettingsProps) {
  const mutation = useMutation({
    mutationFn: (request: UpdateRoomSettingsRequest) => roomApi.updateSettings(roomCode, request),
    onSuccess: (snapshot) => useRoomStore.getState().setSnapshot(snapshot),
  });
  const disabled = !isHost || mutation.isPending;

  return (
    <section aria-labelledby="settings-heading" className="flex flex-col gap-3">
      <h2 id="settings-heading" className="text-sm font-medium text-muted-foreground">
        Settings {!isHost && <span className="font-normal">(set by the host)</span>}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="max-players">Max players</Label>
          <select
            id="max-players"
            className={selectClass}
            value={settings.maxPlayers}
            disabled={disabled}
            onChange={(e) => mutation.mutate({ maxPlayers: Number(e.target.value) })}
          >
            {PLAYER_OPTIONS.map((n) => (
              <option key={n} value={n} disabled={n < playerCount}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="round-count">Songs per game</Label>
          <select
            id="round-count"
            className={selectClass}
            value={settings.roundCount}
            disabled={disabled}
            onChange={(e) => mutation.mutate({ roundCount: Number(e.target.value) })}
          >
            {ROUND_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
