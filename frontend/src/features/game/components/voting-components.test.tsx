import { describe, expect, it } from '@jest/globals';
import type {
  GameResultsDto,
  GameSnapshotDto,
  RoomPlayerDto,
  RoomSnapshotDto,
  RoundRevealDto,
  ScoreboardEntryDto,
} from '@pmp/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RoomConnection } from '../../room/hooks/use-room-connection';
import { FinalResults } from './final-results';
import { RevealDetails } from './reveal-details';
import { Scoreboard } from './scoreboard';
import { VotePanel } from './vote-panel';

const entry = (
  playerId: string,
  displayName: string,
  totalScore: number,
  rank: number,
  hasLeft = false,
): ScoreboardEntryDto => ({
  playerId,
  displayName,
  avatarId: 'avatar-01',
  rank,
  totalScore,
  correctGuesses: 0,
  ownerPoints: 0,
  hasLeft,
});

const player = (id: string, displayName: string, presence: RoomPlayerDto['presence']) =>
  ({ id, displayName, presence }) as RoomPlayerDto;

const offline: RoomConnection = { reclaim: () => {}, close: () => {}, getSocket: () => null };

const votingGame = (myVote: string | null = null) =>
  ({
    phase: 'VOTING',
    roundNumber: 2,
    viewer: {
      isYourPlaylist: false,
      candidates: [
        { playerId: 'b', displayName: 'Bea', avatarId: 'avatar-01' },
        { playerId: 'c', displayName: 'Cal', avatarId: 'avatar-01' },
      ],
      myVote,
    },
    voteProgress: { votesIn: 1, expected: 3 },
  }) as GameSnapshotDto;

const room = {
  viewerPlayerId: 'a',
  players: [player('a', 'Ann', 'ONLINE'), player('b', 'Bea', 'ONLINE'), player('c', 'Cal', 'AWAY')],
} as RoomSnapshotDto;

describe('VotePanel', () => {
  it('offers online candidates only and shows the vote count', () => {
    render(<VotePanel room={room} game={votingGame()} connection={offline} />);
    expect(screen.getByRole('button', { name: 'Bea' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cal (offline)' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 3 voted');
  });

  it('reports a vote that could not be sent', async () => {
    render(<VotePanel room={room} game={votingGame()} connection={offline} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bea' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not connected');
  });

  it('shows the final vote instead of the choices', () => {
    render(<VotePanel room={room} game={votingGame('b')} connection={offline} />);
    expect(screen.getByRole('heading')).toHaveTextContent('You voted for Bea');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('RevealDetails', () => {
  const reveal: RoundRevealDto = {
    roundNumber: 2,
    playlistLabel: 'Playlist B',
    ownerPlayerId: 'c',
    ownerDisplayName: 'Cal',
    votes: [
      { voterPlayerId: 'a', suspectPlayerId: 'c', isCorrect: true },
      { voterPlayerId: 'b', suspectPlayerId: 'a', isCorrect: false },
    ],
    points: [{ playerId: 'a', points: 10, reason: 'SOLE_CORRECT' }],
  };
  const scoreboard = [entry('a', 'Ann', 10, 1), entry('b', 'Bea', 0, 2), entry('c', 'Cal', 0, 2)];

  it('names the owner, every vote and the points', () => {
    render(<RevealDetails reveal={reveal} scoreboard={scoreboard} viewerPlayerId="b" />);
    expect(screen.getByRole('status')).toHaveTextContent("Playlist B was Cal's playlist!");
    expect(screen.getByText('Ann voted for Cal')).toBeInTheDocument();
    expect(screen.getByText('You voted for Ann')).toBeInTheDocument();
    expect(screen.getByText('Ann: +10 (the only correct guess)')).toBeInTheDocument();
  });
});

describe('Scoreboard', () => {
  it('lists players in rank order and marks the viewer and leavers', () => {
    render(
      <Scoreboard
        entries={[entry('a', 'Ann', 15, 1), entry('b', 'Bea', 5, 2, true)]}
        viewerPlayerId="a"
      />,
    );
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('#1Ann (you)15');
    expect(rows[1]).toHaveTextContent('#2Bea (left)5');
  });
});

describe('FinalResults', () => {
  const results: GameResultsDto = {
    ranking: [entry('a', 'Ann', 20, 1), entry('b', 'Bea', 20, 1)],
    awards: {
      topGuesser: { playerIds: ['a', 'b'], value: 2 },
      bestBluffer: null,
    },
  };

  it('shows the awards, sharing ties', () => {
    render(
      <FinalResults results={results} viewerPlayerId="a" isLeader={false} connection={offline} />,
    );
    expect(screen.getByText('Ann & Bea (2 correct guesses)')).toBeInTheDocument();
    expect(screen.getByText('Nobody')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument();
  });

  it('lets only the leader start another game', () => {
    render(<FinalResults results={results} viewerPlayerId="a" isLeader connection={offline} />);
    expect(screen.getByRole('button', { name: 'Play again' })).toBeEnabled();
  });
});
