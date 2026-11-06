import 'reflect-metadata';
import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './common/http/configure-app.js';
import type { EnvironmentVariables, LogLevelName } from './config/env.validation.js';

const LEVEL_ORDER: LogLevelName[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

function createLogger(): ConsoleLogger {
  const requested = (process.env['LOG_LEVEL'] ?? 'log') as LogLevelName;
  const index = Math.max(LEVEL_ORDER.indexOf(requested), LEVEL_ORDER.indexOf('log'));
  return new ConsoleLogger({
    json: process.env['NODE_ENV'] === 'production',
    logLevels: LEVEL_ORDER.slice(0, index + 1),
  });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: createLogger(),
    bufferLogs: true,
  });
  configureApp(app);

  const port = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService).get('PORT', {
    infer: true,
  });
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

await bootstrap();
