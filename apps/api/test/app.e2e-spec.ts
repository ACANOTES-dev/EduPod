import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { closeTestApp, createTestApp } from './helpers';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('GET /api/health should return health status', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect((res) => {
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('checks');
      });
  });
});
