import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';

import { createTestApp, closeTestApp, getAuthToken, authPost, authDelete } from '../helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from '../tenant-fixture.builder';

jest.setTimeout(120_000);

describe('Website Pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    [adminToken, teacherToken] = await Promise.all([
      getAuthToken(app, fixture.adminEmail!, fixture.domainName),
      getAuthToken(app, fixture.teacherEmail!, fixture.domainName),
    ]);
  }, 60_000);

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  // ─── Helper ───────────────────────────────────────────────────────────────────

  function createPage(overrides: Record<string, unknown> = {}) {
    const slug = `test-page-${Date.now()}`;
    const body = {
      page_type: 'custom',
      slug,
      title: 'Test Page',
      body_html: '<p>Hello world</p>',
      ...overrides,
    };
    return authPost(app, '/api/v1/website/pages', adminToken, body, fixture.domainName);
  }

  // ─── POST /api/v1/website/pages ───────────────────────────────────────────────

  describe('POST /api/v1/website/pages', () => {
    it('happy path — custom page created as draft', async () => {
      const res = await createPage().expect(201);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.page_type).toBe('custom');
      expect(res.body.data.status).toBe('draft');
      expect(res.body.data.title).toBe('Test Page');
    });

    it('auth failure → 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/website/pages')
        .set('Host', fixture.domainName)
        .send({
          page_type: 'custom',
          slug: 'no-auth',
          title: 'No Auth',
          body_html: '<p>Test</p>',
        })
        .expect(401);
    });

    it('permission failure — teacher token → 403', async () => {
      await authPost(
        app,
        '/api/v1/website/pages',
        teacherToken,
        {
          page_type: 'custom',
          slug: `teacher-page-${Date.now()}`,
          title: 'Teacher Page',
          body_html: '<p>Nope</p>',
        },
        fixture.domainName,
      ).expect(403);
    });

    it('malicious HTML sanitised — script tag stripped', async () => {
      const res = await createPage({
        slug: `xss-test-${Date.now()}`,
        title: 'XSS Test',
        body_html: '<p>Hello</p><script>alert("xss")</script><b>Bold</b>',
      }).expect(201);

      const html = res.body.data.body_html;
      expect(html).not.toContain('<script>');
      expect(html).toContain('<b>Bold</b>');
    });
  });

  // ─── POST /api/v1/website/pages/:id/publish ──────────────────────────────────

  describe('POST /api/v1/website/pages/:id/publish', () => {
    it('happy path — publish draft page', async () => {
      const createRes = await createPage({
        slug: `publish-test-${Date.now()}`,
        title: 'About Us',
      }).expect(201);
      const id = createRes.body.data.id;

      const res = await authPost(
        app,
        `/api/v1/website/pages/${id}/publish`,
        adminToken,
        {},
        fixture.domainName,
      ).expect(200);

      expect(res.body.data.status).toBe('published');
    });

    it('auth failure → 401', async () => {
      const createRes = await createPage().expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/website/pages/${id}/publish`)
        .set('Host', fixture.domainName)
        .expect(401);
    });

    it('not found → 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authPost(
        app,
        `/api/v1/website/pages/${fakeId}/publish`,
        adminToken,
        {},
        fixture.domainName,
      ).expect(404);
    });
  });

  // ─── DELETE /api/v1/website/pages/:id ─────────────────────────────────────────

  describe('DELETE /api/v1/website/pages/:id', () => {
    it('happy path — delete draft page', async () => {
      const createRes = await createPage({
        slug: `delete-test-${Date.now()}`,
      }).expect(201);
      const id = createRes.body.data.id;

      const res = await authDelete(
        app,
        `/api/v1/website/pages/${id}`,
        adminToken,
        fixture.domainName,
      );

      expect([200, 204]).toContain(res.status);
    });

    it('cannot delete published page → 400', async () => {
      const createRes = await createPage({
        slug: `del-pub-${Date.now()}`,
      }).expect(201);
      const id = createRes.body.data.id;

      // Publish it first
      await authPost(
        app,
        `/api/v1/website/pages/${id}/publish`,
        adminToken,
        {},
        fixture.domainName,
      ).expect(200);

      // Try to delete
      await authDelete(app, `/api/v1/website/pages/${id}`, adminToken, fixture.domainName).expect(
        400,
      );
    });

    it('auth failure → 401', async () => {
      const createRes = await createPage().expect(201);
      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/website/pages/${id}`)
        .set('Host', fixture.domainName)
        .expect(401);
    });

    it('not found → 404', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await authDelete(
        app,
        `/api/v1/website/pages/${fakeId}`,
        adminToken,
        fixture.domainName,
      ).expect(404);
    });
  });
});
