import { Suspense } from 'react';
import { JoinRoom } from '@/features/room/components/join-room';
import { SessionGate } from '@/features/session/components/session-gate';

async function JoinRoute({ params }: { params: PageProps<'/join/[code]'>['params'] }) {
  const { code } = await params;
  return (
    <SessionGate>
      <JoinRoom roomCode={code.toUpperCase()} />
    </SessionGate>
  );
}

export default function JoinPage({ params }: PageProps<'/join/[code]'>) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <JoinRoute params={params} />
      </Suspense>
    </main>
  );
}
