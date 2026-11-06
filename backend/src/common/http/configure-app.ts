import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter.js';
import { createValidationPipe } from './create-validation-pipe.js';
import { requestIdMiddleware } from './request-id.middleware.js';

export const API_PREFIX = 'api/v1';

/** HTTP pipeline shared by `main.ts` and the e2e tests, so tests exercise production wiring. */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  // Client IPs (used for rate limiting) are only taken from X-Forwarded-For for trusted proxy hops.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.setGlobalPrefix(API_PREFIX);
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  // An allow-list (not a bare string) so disallowed origins receive no CORS headers at all.
  app.enableCors({
    origin: [config.get('FRONTEND_ORIGIN', { infer: true })],
    credentials: true,
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
