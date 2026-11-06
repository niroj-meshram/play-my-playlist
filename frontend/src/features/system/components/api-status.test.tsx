import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { ApiStatus } from './api-status';

const fetchMock = jest.fn<typeof fetch>();

function renderWithQueryClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ApiStatus />
    </QueryClientProvider>,
  );
}

describe('ApiStatus', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('shows the server as online when the health check succeeds', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok', uptimeSeconds: 1, timestamp: '' }),
    } as Response);

    renderWithQueryClient();

    expect(screen.getByRole('status')).toHaveTextContent('Connecting to server…');
    expect(await screen.findByText('Server online')).toBeInTheDocument();
  });

  it('shows the server as unreachable when the request fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    renderWithQueryClient();

    expect(await screen.findByText('Server unreachable')).toBeInTheDocument();
  });
});
