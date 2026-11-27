'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { RoomConnection } from '../hooks/use-room-connection';
import { roomApi } from '../room-api';

export function LeaveRoomButton({
  roomCode,
  connection,
}: {
  roomCode: string;
  connection: RoomConnection;
}) {
  const router = useRouter();
  const leave = useMutation({
    mutationFn: () => roomApi.leave(roomCode),
    onSuccess: () => {
      connection.close();
      router.push('/');
    },
  });

  return (
    <div className="flex flex-col gap-2">
      {leave.isError && (
        <p role="alert" className="text-sm text-destructive">
          {leave.error.message}
        </p>
      )}
      <Button
        variant="destructive"
        className="self-start"
        disabled={leave.isPending}
        onClick={() => leave.mutate()}
      >
        {leave.isPending ? 'Leaving…' : 'Leave room'}
      </Button>
    </div>
  );
}
