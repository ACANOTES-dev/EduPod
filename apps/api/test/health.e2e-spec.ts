import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { closeTestApp, createTestApp } from './helpers';

describe('Health Check (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /api/health should return 200 when all services healthy', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(['healthy', 'degraded']).toContain(res.body.status);
        expect(res.body.checks).toBeDefined();
        expect(res.body.checks.postgresql).toBeDefined();
        expect(res.body.checks.postgresql.status).toBe('up');
        expect(res.body.checks.redis).toBeDefined();
        expect(res.body.checks.redis.status).toBe('up');
        expect(res.body.timestamp).toBeDefined();
        expect(typeof res.body.uptime).toBe('number');
      });
  });
});
