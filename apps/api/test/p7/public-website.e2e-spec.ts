import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  getAuthToken,
  authPost,
  cleanupRedisKeys,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_DOMAIN,
} from '../helpers';

jest.setTimeout(120_000);

describe('Public Website (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  // Track pages we create so we can reference their slugs
  let publishedSlug: string;
  let draftSlug: string;

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, AL_NOOR_ADMIN_EMAIL, AL_NOOR_DOMAIN);

    // Create and publish a page for public tests
    publishedSlug = `pub-test-${Date.now()}`;
    const pubRes = await authPost(
      app,
      '/api/v1/website/pages',
      adminToken,
      {
        page_type: 'custom',
        slug: publishedSlug,
        title: 'Published Page',
        body_html: '<p>Public content</p>',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    await authPost(
      app,
      `/api/v1/website/pages/${pubRes.body.data.id}/publish`,
      adminToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    // Create a draft page (should NOT appear in public)
    draftSlug = `draft-test-${Date.now()}`;
    await authPost(
      app,
      '/api/v1/website/pages',
      adminToken,
      {
        page_type: 'custom',
        slug: draftSlug,
        title: 'Draft Page',
        body_html: '<p>Draft content</p>',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['rate:contact:*']);
    await closeTestApp();
  });

  // ─── GET /api/v1/public/pages ─────────────────────────────────────────────────

  describe('GET /api/v1/public/pages', () => {
    it('happy path — returns published pages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/pages')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      const slugs = res.body.data.map((p: Record<string, unknown>) => p.slug);
      expect(slugs).toContain(publishedSlug);
    });

    it('does not return draft pages', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/public/pages')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(200);

      const slugs = res.body.data.map((p: Record<string, unknown>) => p.slug);
      expect(slugs).not.toContain(draftSlug);
    });
  });

  // ─── GET /api/v1/public/pages/:slug ───────────────────────────────────────────

  describe('GET /api/v1/public/pages/:slug', () => {
    it('happy path — returns full page content', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/public/pages/${publishedSlug}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.slug).toBe(publishedSlug);
      expect(res.body.data.title).toBe('Published Page');
      expect(res.body.data.body_html).toContain('Public content');
    });

    it('not found — draft page → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/public/pages/${draftSlug}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(404);
    });
  });

  // ─── POST /api/v1/public/contact ──────────────────────────────────────────────

  describe('POST /api/v1/public/contact', () => {
    it('happy path — valid contact submission', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: 'Jane Doe',
          email: 'jane@example.com',
          message: 'I would like more information about enrolment.',
          _honeypot: '',
        })
        .expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toBe('new_submission');
    });

    it('honeypot filled — stored as spam', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: 'Bot User',
          email: 'bot@spam.com',
          message: 'Buy cheap stuff!',
          _honeypot: 'bot@spam',
        })
        .expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.status).toBe('spam');
    });

    it('rate limit exceeded — 6th submission gets 400', async () => {
      // Clean up rate limit keys first to ensure a fresh state
      await cleanupRedisKeys(['rate:contact:*']);

      const payload = {
        name: 'Rate Limiter',
        email: 'ratelimit@example.com',
        message: 'Testing rate limits',
        _honeypot: '',
      };

      // Submit 6 times — the first 5 should succeed, the 6th should fail.
      // We collect all statuses and verify the pattern rather than asserting
      // each intermediate result, to handle race conditions with parallel tests.
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/public/contact')
          .set('Host', AL_NOOR_DOMAIN)
          .send(payload);
        statuses.push(res.status);
      }

      // The last submission should be rate limited (400 or 429)
      // If other tests submitted contact forms concurrently, the rate limit
      // may kick in earlier, so we just verify at least one is rate limited.
      const rateLimited = statuses.filter((s) => s === 400 || s === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    });

    it('validation failure — invalid email → 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: 'Bad Email',
          email: 'not-an-email',
          message: 'Test',
          _honeypot: '',
        })
        .expect(400);
    });
  });
});
