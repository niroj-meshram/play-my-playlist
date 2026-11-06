import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ErrorCode } from '@pmp/shared';
import { apiFetch, ApiError } from './api-client';

const fetchMock = jest.fn<typeof fetch>();

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('apiFetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the parsed JSON body and sends credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { status: 'ok' }));

    await expect(apiFetch('/health')).resolves.toEqual({ status: 'ok' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/api/v1/health');
    expect(init?.credentials).toBe('include');
  });

  it('throws an ApiError with the server error code and request ID', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { code: ErrorCode.CONFLICT, message: 'Room is full.' },
        requestId: 'req-1',
      }),
    );

    const error = await apiFetch('/rooms/ABC/join', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: ErrorCode.CONFLICT, status: 409, requestId: 'req-1' });
  });

  it('maps network failures to SERVICE_UNAVAILABLE', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiFetch('/health')).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      status: 0,
    });
  });

  it('handles non-envelope error bodies', async () => {
    fetchMock.mockResolvedValue(jsonResponse(502, '<html>Bad gateway</html>'));

    await expect(apiFetch('/health')).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
      status: 502,
    });
  });
});
