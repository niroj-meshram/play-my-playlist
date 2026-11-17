import { HomeActions } from '@/features/room/components/home-actions';
import { SessionGate } from '@/features/session/components/session-gate';
import { ApiStatus } from '@/features/system/components/api-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Play My Playlist</h1>
        <p className="text-lg text-muted-foreground">
          Share your playlist. Hear a song. Guess which friend it belongs to.
        </p>
      </header>
      <div className="w-full text-left">
        <SessionGate>
          <HomeActions />
        </SessionGate>
      </div>
      <ApiStatus />
    </main>
  );
}
