'use client';

import type { LivenessResponse } from '@pmp/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/** Small connectivity indicator for the backend API. */
export function ApiStatus() {
  const { isPending, isError } = useQuery({
    queryKey: ['system', 'health'],
    queryFn: () => apiFetch<LivenessResponse>('/health'),
  });

  const label = isPending
    ? 'Connecting to server…'
    : isError
      ? 'Server unreachable'
      : 'Server online';

  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          isPending && 'bg-muted-foreground animate-pulse',
          isError && 'bg-destructive',
          !isPending && !isError && 'bg-emerald-500',
        )}
      />
      {label}
    </p>
  );
}
