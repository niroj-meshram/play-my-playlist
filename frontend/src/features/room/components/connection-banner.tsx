import { Button } from '@/components/ui/button';
import type { ConnectionStatus } from '../room-store';

interface ConnectionBannerProps {
  status: ConnectionStatus;
  error: string | null;
  onReclaim: () => void;
}

/** Explains connection problems; renders nothing while connected. */
export function ConnectionBanner({ status, error, onReclaim }: ConnectionBannerProps) {
  if (status === 'connected') return null;

  const message = {
    connecting: 'Connecting to the room…',
    reconnecting: 'Connection lost. Reconnecting…',
    replaced: 'This room is open in another tab or device.',
    error: error ?? 'Something went wrong with the connection.',
  }[status];

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <span>{message}</span>
      {status === 'replaced' && (
        <Button size="sm" variant="outline" onClick={onReclaim}>
          Use here
        </Button>
      )}
    </div>
  );
}
