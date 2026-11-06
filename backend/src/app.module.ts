import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Redis } from 'ioredis';
import { AuthModule } from './auth/auth.module.js';
import { AccessTokenGuard } from './common/auth/access-token.guard.js';
import { RATE_LIMITS } from './common/throttling/rate-limits.js';
import { RedisThrottlerStorage } from './common/throttling/redis-throttler.storage.js';
import { validateEnv, type EnvironmentVariables } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { REDIS_CLIENT } from './redis/redis.constants.js';
import { RedisModule } from './redis/redis.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService<EnvironmentVariables, true>, redis: Redis) => ({
        throttlers: [{ name: 'default', ...RATE_LIMITS.global }],
        storage: new RedisThrottlerStorage(redis),
        skipIf: () => !config.get('THROTTLE_ENABLED', { infer: true }),
        errorMessage: 'Too many requests. Please slow down and try again shortly.',
      }),
    }),
    AuthModule,
    UsersModule,
    RoomsModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate limiting runs before authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
})
export class AppModule {}
