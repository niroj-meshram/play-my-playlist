import { HttpStatus, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';
import { ErrorCode } from '@pmp/shared';
import { AppException } from './app.exception.js';
import { toErrorResponse } from './to-error-response.js';

describe('toErrorResponse', () => {
  it('uses the code, message and details of an AppException', () => {
    const exception = new AppException(ErrorCode.CONFLICT, 'Room is full.', HttpStatus.CONFLICT, {
      capacity: 10,
    });

    expect(toErrorResponse(exception, 'req-1')).toEqual({
      status: 409,
      body: {
        error: { code: 'CONFLICT', message: 'Room is full.', details: { capacity: 10 } },
        requestId: 'req-1',
      },
    });
  });

  it('maps framework HTTP exceptions to stable codes', () => {
    const { status, body } = toErrorResponse(new NotFoundException('Cannot GET /x'), 'req-2');

    expect(status).toBe(404);
    expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('hides the message of 5xx HTTP exceptions', () => {
    const { status, body } = toErrorResponse(
      new ServiceUnavailableException('db host 10.0.0.5 refused connection'),
      'req-3',
    );

    expect(status).toBe(503);
    expect(body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
    expect(body.error.message).not.toContain('10.0.0.5');
  });

  it('never leaks the message of unknown errors', () => {
    const { status, body } = toErrorResponse(new Error('owner of playlist is player-42'), 'req-4');

    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred.' },
      requestId: 'req-4',
    });
  });
});
