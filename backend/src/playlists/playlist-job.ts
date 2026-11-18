/** A background ingestion job. Stale when the playlist's submissionId has changed since. */
export interface PlaylistJob {
  playlistId: string;
  submissionId: string;
}
