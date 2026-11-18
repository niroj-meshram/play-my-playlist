import { describe, expect, it } from '@jest/globals';
import type { RoomPlayerDto } from '@pmp/shared';
import { render, screen, within } from '@testing-library/react';
import { PlayerList } from './player-list';

const players: RoomPlayerDto[] = [
  {
    id: 'p1',
    displayName: 'Alice',
    avatarId: 'avatar-01',
    isHost: true,
    joinedAt: '2026-01-01T00:00:00Z',
    presence: 'ONLINE',
    playlistReady: true,
  },
  {
    id: 'p2',
    displayName: 'Bob',
    avatarId: 'avatar-02',
    isHost: false,
    joinedAt: '2026-01-01T00:01:00Z',
    presence: 'RECONNECTING',
    playlistReady: false,
  },
  {
    id: 'p3',
    displayName: 'Cara',
    avatarId: 'avatar-03',
    isHost: false,
    joinedAt: '2026-01-01T00:02:00Z',
    presence: 'AWAY',
    playlistReady: false,
  },
];

describe('PlayerList', () => {
  it('shows each player with host badge, "you" marker and presence as text', () => {
    render(<PlayerList players={players} viewerPlayerId="p2" maxPlayers={5} />);

    expect(screen.getByRole('heading', { name: 'Players (3/5)' })).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);

    expect(within(items[0]!).getByText('Alice')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Host')).toBeInTheDocument();
    expect(within(items[0]!).getByText('Online')).toBeInTheDocument();
    expect(within(items[0]!).getByText('✓ Playlist ready')).toBeInTheDocument();
    expect(within(items[1]!).getByText('No playlist yet')).toBeInTheDocument();

    expect(within(items[1]!).getByText('(you)')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Reconnecting…')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('Host')).not.toBeInTheDocument();

    expect(within(items[2]!).getByText('Away')).toBeInTheDocument();
  });
});
