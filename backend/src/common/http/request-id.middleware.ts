import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const requestIds = new WeakMap<Request, string>();

/** Assigns every request a correlation ID (reusing a well-formed incoming one) and echoes it. */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(REQUEST_ID_HEADER);
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();

  requestIds.set(request, requestId);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(request: Request): string {
  return requestIds.get(request) ?? 'unknown';
}
