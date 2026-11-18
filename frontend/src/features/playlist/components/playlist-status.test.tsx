import { describe, expect, it, jest } from '@jest/globals';
import type { MyPlaylistDto } from '@pmp/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlaylistStatus } from './playlist-status';

const base: MyPlaylistDto = {
  status: 'READY',
  sourceUrl: 'https://www.youtube.com/playlist?list=PL1',
  title: 'Road trip',
  playableCount: 42,
  duplicateCount: 0,
  rejectionCode: null,
  submittedAt: '2026-01-01T00:00:00Z',
};

function renderStatus(playlist: MyPlaylistDto) {
  const handlers = { onReplace: jest.fn(), onRemove: jest.fn() };
  render(<PlaylistStatus playlist={playlist} busy={false} {...handlers} />);
  return handlers;
}

describe('PlaylistStatus', () => {
  it('shows progress while the playlist is being checked', () => {
    renderStatus({ ...base, status: 'PROCESSING', title: null });

    expect(screen.getByRole('status')).toHaveTextContent('Checking your playlist');
  });

  it('shows the owner their title, song count and duplicates, with replace and remove', () => {
    const { onReplace, onRemove } = renderStatus({ ...base, duplicateCount: 3 });

    expect(screen.getByText('Road trip')).toBeInTheDocument();
    expect(
      screen.getByText('42 playable songs · 3 dropped because another player already added them'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onReplace).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalled();
  });

  it('explains a rejection and offers another try', () => {
    const { onReplace } = renderStatus({
      ...base,
      status: 'REJECTED',
      rejectionCode: 'NOT_ENOUGH_UNIQUE_SONGS',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('already added by other players');
    fireEvent.click(screen.getByRole('button', { name: 'Try another playlist' }));
    expect(onReplace).toHaveBeenCalled();
  });
});
