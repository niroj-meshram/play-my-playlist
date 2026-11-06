import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ApiErrorResponse } from '@pmp/shared';
import { AppException } from './app.exception.js';

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

const INTERNAL_MESSAGE = 'An unexpected error occurred.';

export interface ErrorResponse {
  status: number;
  body: ApiErrorResponse;
}

/** Maps any thrown value to the public error envelope without leaking internals. */
export function toErrorResponse(exception: unknown, requestId: string): ErrorResponse {
  if (exception instanceof AppException) {
    const status = exception.getStatus();
    return {
      status,
      body: {
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details === undefined ? {} : { details: exception.details }),
        },
        requestId,
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const isServerError = status >= 500;
    const code =
      STATUS_TO_CODE[status] ?? (isServerError ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
    return {
      status,
      body: {
        error: { code, message: isServerError ? INTERNAL_MESSAGE : exception.message },
        requestId,
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { error: { code: ErrorCode.INTERNAL_ERROR, message: INTERNAL_MESSAGE }, requestId },
  };
}
