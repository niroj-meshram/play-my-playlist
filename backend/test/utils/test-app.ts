import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { Redis } from 'ioredis';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/common/http/configure-app.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { REDIS_CLIENT } from '../../src/redis/redis.constants.js';

export interface TestApp {
  app: NestExpressApplication;
  prisma: PrismaService;
  redis: Redis;
  /** Empties every table and the test Redis DB. */
  reset(): Promise<void>;
}

export async function createTestApp(
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<TestApp> {
  const moduleRef = await customize(Test.createTestingModule({ imports: [AppModule] })).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);

  return {
    app,
    prisma,
    redis,
    async reset() {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "RoomPlayer", "Room", "AuthSession", "User" RESTART IDENTITY CASCADE',
      );
      await redis.flushdb();
    },
  };
}
