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
        expect(res.body.status).toBe('ok');
        expect(res.body.checks).toEqual({
          postgres: 'up',
          redis: 'up',
        });
      });
  });
});
