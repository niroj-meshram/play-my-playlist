import { ErrorCode, type ApiErrorResponse } from '@pmp/shared';
import { publicEnv } from './env';

/** Error raised for any failed API call, carrying the server's stable error code. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}

/**
 * Typed JSON fetch against the backend API. Sends cookies (refresh-token cookie, M1)
 * and normalises every failure into an `ApiError`.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${publicEnv.apiUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, 'Unable to reach the server.', 0);
  }

  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    if (isApiErrorResponse(body)) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        response.status,
        body.requestId,
        body.error.details,
      );
    }
    throw new ApiError(ErrorCode.INTERNAL_ERROR, 'Unexpected server response.', response.status);
  }

  return body as T;
}
