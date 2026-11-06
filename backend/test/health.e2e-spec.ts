import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ErrorCode } from '@pmp/shared';
import request from 'supertest';
import { createTestApp } from './utils/test-app.js';

describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health reports liveness with a request ID and security headers', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok' });
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('GET /api/v1/health/ready reports PostgreSQL and Redis as up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);

    expect(response.body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('returns the error envelope for unknown routes and echoes a valid request ID', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/does-not-exist')
      .set('x-request-id', 'test-request-0001')
      .expect(404);

    expect(response.body).toEqual({
      error: { code: ErrorCode.NOT_FOUND, message: expect.any(String) },
      requestId: 'test-request-0001',
    });
  });

  it('allows CORS only for the configured frontend origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');
    const denied = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');

    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
