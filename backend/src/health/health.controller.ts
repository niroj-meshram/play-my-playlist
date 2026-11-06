import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ErrorCode, type LivenessResponse, type ReadinessResponse } from '@pmp/shared';
import { AppException } from '../common/errors/app.exception.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get()
  getLiveness(): LivenessResponse {
    return this.health.getLiveness();
  }

  /** Readiness: PostgreSQL and Redis are reachable. Responds 503 otherwise. */
  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const readiness = await this.health.getReadiness();

    if (readiness.status !== 'ok') {
      throw new AppException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'A required dependency is unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
        readiness.checks,
      );
    }

    return readiness;
  }
}
