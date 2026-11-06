import { ApiStatus } from '@/features/system/components/api-status';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Play My Playlist</h1>
      <p className="text-lg text-muted-foreground">
        Share your playlist. Hear a song. Guess which friend it belongs to.
      </p>
      <ApiStatus />
    </main>
  );
}
