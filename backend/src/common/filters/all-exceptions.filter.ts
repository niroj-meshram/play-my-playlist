import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { toErrorResponse } from '../errors/to-error-response.js';
import { getRequestId } from '../http/request-id.middleware.js';

/** Formats every failed HTTP request as an `ApiErrorResponse`. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      // WebSocket errors are handled by the realtime layer (milestone M2).
      return;
    }

    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = getRequestId(request);
    const { status, body } = toErrorResponse(exception, requestId);

    if (status >= 500) {
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${request.method} ${request.path} failed [${requestId}]`, detail);
    }

    response.status(status).json(body);
  }
}
