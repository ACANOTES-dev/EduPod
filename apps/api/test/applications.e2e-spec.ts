import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  buildPublicApplicationSeed,
  createPublicApplication,
  ensureAdmissionsTargets,
} from './admissions-test-helpers';
import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from './helpers';

describe('Applications (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;
  let applicationId: string;
  let applicationStatus: 'ready_to_admit' | 'waiting_list';
  let applicationUpdatedAt: string;
  let noteId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;

    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const created = await createPublicApplication(
      app,
      AL_NOOR_DOMAIN,
      buildPublicApplicationSeed(targets),
    );

    applicationId = created.body.id as string;
    applicationStatus = created.body.status as 'ready_to_admit' | 'waiting_list';

    const detailRes = await authGet(
      app,
      `/api/v1/applications/${applicationId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const detailBody = detailRes.body.data ?? detailRes.body;
    applicationUpdatedAt = detailBody.updated_at;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  it('lists applications with pagination metadata', async () => {
    const res = await authGet(app, '/api/v1/applications', ownerToken, AL_NOOR_DOMAIN).expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('filters applications by the current queue status', async () => {
    const res = await authGet(
      app,
      `/api/v1/applications?status=${applicationStatus}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data ?? [];
    expect(data.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('returns application detail with form and notes metadata', async () => {
    const res = await authGet(
      app,
      `/api/v1/applications/${applicationId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(applicationId);
    expect(body.form_definition).toBeDefined();
    expect(Array.isArray(body.notes)).toBe(true);
    expect(body.status).toBe(applicationStatus);
  });

  it('returns the application preview card payload', async () => {
    const res = await authGet(
      app,
      `/api/v1/applications/${applicationId}/preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.entity_type).toBe('application');
    expect(body.status).toBe(applicationStatus);
    expect(Array.isArray(body.facts)).toBe(true);
  });

  it('creates an internal application note', async () => {
    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/notes`,
      ownerToken,
      { note: 'Current admissions flow note', is_internal: true },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    noteId = body.id;
    expect(body.note).toBe('Current admissions flow note');
  });

  it('lists application notes', async () => {
    const res = await authGet(
      app,
      `/api/v1/applications/${applicationId}/notes`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((item: { id: string }) => item.id === noteId)).toBe(true);
  });

  it('returns the application from the matching queue endpoint', async () => {
    const queuePath =
      applicationStatus === 'ready_to_admit'
        ? '/api/v1/applications/queues/ready-to-admit'
        : '/api/v1/applications/queues/waiting-list';

    const res = await authGet(app, queuePath, ownerToken, AL_NOOR_DOMAIN).expect(200);
    const body = res.body.data ?? res.body;
    const queueData = body.data ?? body;
    if (applicationStatus === 'ready_to_admit') {
      const queueMeta = body.meta ?? {};
      expect(Array.isArray(queueData)).toBe(true);
      expect(queueMeta.total).toBeGreaterThanOrEqual(1);
      return;
    }

    expect(Array.isArray(queueData.waiting ?? [])).toBe(true);
    expect(Array.isArray(queueData.awaiting_year_setup ?? [])).toBe(true);
  });

  it('rejects the application through the current review endpoint', async () => {
    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/review`,
      ownerToken,
      {
        status: 'rejected',
        expected_updated_at: applicationUpdatedAt,
        rejection_reason: 'Admissions e2e rejection',
      },
      AL_NOOR_DOMAIN,
    );

    expect([200, 201]).toContain(res.status);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('rejected');
  });

  it('returns rejected applications from the archive endpoint', async () => {
    const res = await authGet(
      app,
      '/api/v1/applications/queues/rejected?page=1&pageSize=20',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data ?? [];
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('returns admissions analytics for the tenant', async () => {
    const res = await authGet(
      app,
      '/api/v1/applications/analytics',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.funnel.ready_to_admit).toBeDefined();
    expect(body.funnel.waiting_list).toBeDefined();
    expect(body.funnel.rejected).toBeDefined();
  });

  it('returns 401 when listing applications without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });

  it('returns 403 when a parent tries to list staff applications', async () => {
    await authGet(app, '/api/v1/applications', parentToken, AL_NOOR_DOMAIN).expect(403);
  });
});
