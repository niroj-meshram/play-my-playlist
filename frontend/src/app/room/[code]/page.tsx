import { Suspense } from 'react';
import { Lobby } from '@/features/room/components/lobby';
import { SessionGate } from '@/features/session/components/session-gate';

async function RoomRoute({ params }: { params: PageProps<'/room/[code]'>['params'] }) {
  const { code } = await params;
  return (
    <SessionGate>
      <Lobby roomCode={code.toUpperCase()} />
    </SessionGate>
  );
}

export default function RoomPage({ params }: PageProps<'/room/[code]'>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Lobby</h1>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <RoomRoute params={params} />
      </Suspense>
    </main>
  );
}
