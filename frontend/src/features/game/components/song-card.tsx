import type { PublicRoundDto } from '@pmp/shared';

/** The current song as everyone sees it: never who submitted it. */
export function SongCard({ round, isYours }: { round: PublicRoundDto; isYours: boolean }) {
  const { track } = round;
  return (
    <section aria-label="Current song" className="flex gap-4 rounded-lg border bg-card p-4">
      {track.thumbnailUrl ? (
        // Plain <img>: thumbnails come from YouTube's CDN and need no optimisation here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={track.thumbnailUrl}
          alt=""
          width={120}
          height={90}
          className="h-[90px] w-[120px] shrink-0 rounded-md object-cover"
        />
      ) : (
        <div aria-hidden="true" className="h-[90px] w-[120px] shrink-0 rounded-md bg-muted" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{round.playlistLabel}</span>
        <span className="truncate font-semibold">{track.title}</span>
        {track.artist && (
          <span className="truncate text-sm text-muted-foreground">{track.artist}</span>
        )}
        {isYours && (
          <span className="mt-1 text-sm font-medium text-amber-500">
            This one is yours. Act natural!
          </span>
        )}
      </div>
    </section>
  );
}
