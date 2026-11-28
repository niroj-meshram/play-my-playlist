import type { MyPlaylistDto } from '@pmp/shared';
import { Button } from '@/components/ui/button';
import { rejectionMessage } from '../rejection-messages';

interface PlaylistStatusProps {
  playlist: MyPlaylistDto;
  busy: boolean;
  onReplace: () => void;
  onRemove: () => void;
}

/** The viewer's own submission. The title is shown only here, to its owner. */
export function PlaylistStatus({ playlist, busy, onReplace, onRemove }: PlaylistStatusProps) {
  if (playlist.status === 'PROCESSING') {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-amber-500" />
        Checking your playlist with YouTube…
      </p>
    );
  }

  if (playlist.status === 'REJECTED') {
    const message = rejectionMessage(playlist);
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={onReplace}
        >
          Try another playlist
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden="true" className="text-emerald-500">
            ✓
          </span>
          <span className="truncate">{playlist.title ?? 'Your playlist'}</span>
        </p>
        <p className="text-sm text-muted-foreground">
          {playlist.playableCount} playable songs
          {playlist.duplicateCount > 0 &&
            ` · ${playlist.duplicateCount} dropped because another player already added them`}
        </p>
        <p className="text-xs text-muted-foreground">
          Only you can see which playlist you submitted.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={onReplace}>
          Replace
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}
