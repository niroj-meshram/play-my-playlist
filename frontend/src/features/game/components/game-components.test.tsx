import { describe, expect, it } from '@jest/globals';
import type { GameSnapshotDto, RoomPlayerDto, RoomSnapshotDto } from '@pmp/shared';
import { render, screen } from '@testing-library/react';
import { leaderActionLabel } from './leader-controls';
import { SongCard } from './song-card';
import { startBlocker } from './start-game-button';

const round = {
  roundNumber: 1,
  playlistLabel: 'Playlist C',
  track: {
    videoId: 'abc123xyz00',
    title: 'Song title',
    artist: 'Some artist',
    thumbnailUrl: null,
    durationSec: 200,
  },
};

describe('SongCard', () => {
  it('shows the song and its anonymous label', () => {
    render(<SongCard round={round} isYours={false} />);
    expect(screen.getByText('Song title')).toBeInTheDocument();
    expect(screen.getByText('Some artist')).toBeInTheDocument();
    expect(screen.getByText('Playlist C')).toBeInTheDocument();
    expect(screen.queryByText(/This one is yours/)).not.toBeInTheDocument();
  });

  it('tells only the owner that the song is theirs', () => {
    render(<SongCard round={round} isYours />);
    expect(screen.getByText('This one is yours. Act natural!')).toBeInTheDocument();
  });
});

describe('leaderActionLabel', () => {
  const game = (phase: GameSnapshotDto['phase'], roundNumber = 3) =>
    ({ phase, roundNumber, totalRounds: 10 }) as GameSnapshotDto;

  it.each([
    ['PLAYING', 3, 'Stop song'],
    ['DISCUSSION', 3, 'Open voting'],
    ['VOTING', 3, 'Close voting'],
    ['REVEAL', 3, 'Next song'],
    ['REVEAL', 10, 'Final results'],
    ['SCOREBOARD', 10, 'Finish game'],
  ] as const)('%s in round %i → %s', (phase, roundNumber, label) => {
    expect(leaderActionLabel(game(phase, roundNumber))).toBe(label);
  });
});

describe('startBlocker', () => {
  const player = (id: string, playlistReady: boolean) => ({ id, playlistReady }) as RoomPlayerDto;
  const room = (players: RoomPlayerDto[]) => ({ players }) as RoomSnapshotDto;

  it('needs three players with ready playlists', () => {
    expect(startBlocker(room([player('a', true), player('b', true)]))).toMatch(/At least 3/);
    expect(startBlocker(room([player('a', true), player('b', false), player('c', false)]))).toBe(
      'Waiting for 2 players to add a playlist.',
    );
    expect(startBlocker(room([player('a', true), player('b', true), player('c', true)]))).toBe(
      null,
    );
  });
});
