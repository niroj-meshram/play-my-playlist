'use client';

import type { GetMyPlaylistResponse } from '@pmp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { myPlaylistKey, playlistApi } from '../playlist-api';
import { PlaylistStatus } from './playlist-status';

/** Submit, replace or remove the viewer's own playlist. Results arrive over the socket. */
export function PlaylistCard({ roomCode }: { roomCode: string }) {
  const queryClient = useQueryClient();
  const key = myPlaylistKey(roomCode);
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: key, queryFn: () => playlistApi.getMine(roomCode) });

  const submit = useMutation({
    mutationFn: (value: string) => playlistApi.submit(roomCode, { url: value }),
    onSuccess: () => {
      setEditing(false);
      setUrl('');
      // Show PROCESSING at once; the socket delivers the final status.
      queryClient.setQueryData<GetMyPlaylistResponse>(key, (old) =>
        old?.playlist ? { playlist: { ...old.playlist, status: 'PROCESSING' } } : old,
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const remove = useMutation({
    mutationFn: () => playlistApi.remove(roomCode),
    onSuccess: () => queryClient.setQueryData<GetMyPlaylistResponse>(key, { playlist: null }),
  });

  const playlist = query.data?.playlist ?? null;
  const showForm = !playlist || editing;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (url.trim()) submit.mutate(url.trim());
  };

  return (
    <section aria-labelledby="playlist-heading" className="flex flex-col gap-3">
      <h2 id="playlist-heading" className="text-sm font-medium text-muted-foreground">
        Your playlist
      </h2>
      {query.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {playlist && !editing && (
        <PlaylistStatus
          playlist={playlist}
          busy={submit.isPending || remove.isPending}
          onReplace={() => setEditing(true)}
          onRemove={() => remove.mutate()}
        />
      )}
      {!query.isPending && showForm && (
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <Label htmlFor="playlist-url">YouTube playlist link</Label>
          <div className="flex gap-2">
            <Input
              id="playlist-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/playlist?list=…"
              inputMode="url"
              autoComplete="off"
              aria-describedby="playlist-help"
            />
            <Button type="submit" disabled={!url.trim() || submit.isPending}>
              {submit.isPending ? 'Sending…' : 'Submit'}
            </Button>
          </div>
          <p id="playlist-help" className="text-xs text-muted-foreground">
            Public or Unlisted playlists with at least 5 songs. Nobody else will see which one is
            yours.
          </p>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          )}
        </form>
      )}
      {(submit.isError || remove.isError) && (
        <p role="alert" className="text-sm text-destructive">
          {(submit.error ?? remove.error)?.message}
        </p>
      )}
    </section>
  );
}
