import './setup-env';

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authPost,
  login,
} from './helpers';

jest.setTimeout(60_000);

describe('Engagement Tracking (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── POST /api/v1/engagement/track ────────────────────────────────────────────

  describe('POST /api/v1/engagement/track', () => {
    it('should return 200 with {ok: true} for valid tracking event', async () => {
      const res = await authPost(
        app,
        '/api/v1/engagement/track',
        ownerToken,
        { event_type: 'page_view' },
        AL_NOOR_DOMAIN,
      ).expect(201);

      // Service returns {ok: true} (no 'data' property) → interceptor wraps to {data: {ok: true}}
      expect(res.body.data.ok).toBe(true);
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/engagement/track')
        .set('Host', AL_NOOR_DOMAIN)
        .send({ event_type: 'page_view' })
        .expect(401);
    });

    it('should return 400 with invalid body (missing event_type)', async () => {
      await authPost(
        app,
        '/api/v1/engagement/track',
        ownerToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(400);
    });

    it('should accept optional entity_type and entity_id', async () => {
      const res = await authPost(
        app,
        '/api/v1/engagement/track',
        ownerToken,
        {
          event_type: 'entity_view',
          entity_type: 'student',
          entity_id: '00000000-0000-0000-0000-000000000001',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      // Service returns {ok: true} (no 'data' property) → interceptor wraps to {data: {ok: true}}
      expect(res.body.data.ok).toBe(true);
    });
  });
});
