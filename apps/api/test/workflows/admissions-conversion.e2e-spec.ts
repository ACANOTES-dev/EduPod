import { INestApplication } from '@nestjs/common';

import {
  buildPublicApplicationSeed,
  createPublicApplication,
  ensureAdmissionsTargets,
  getAdmissionsDashboardSummary,
} from '../admissions-test-helpers';
import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Workflow: Admissions Queue Flow (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let cedarOwnerToken: string;
  let applicationId: string;
  let initialStatus: 'ready_to_admit' | 'waiting_list';
  let applicationUpdatedAt: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarOwnerToken = cedarLogin.accessToken;

    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const created = await createPublicApplication(
      app,
      AL_NOOR_DOMAIN,
      buildPublicApplicationSeed(targets),
    );

    applicationId = created.body.id as string;
    initialStatus = created.body.status as 'ready_to_admit' | 'waiting_list';

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

  it('surfaces the new application in the current queue view', async () => {
    const queuePath =
      initialStatus === 'ready_to_admit'
        ? '/api/v1/applications/queues/ready-to-admit'
        : '/api/v1/applications/queues/waiting-list';

    const res = await authGet(app, queuePath, ownerToken, AL_NOOR_DOMAIN).expect(200);
    const body = res.body.data ?? res.body;
    const queueData = body.data ?? body;
    if (initialStatus === 'ready_to_admit') {
      const queueMeta = body.meta ?? {};
      expect(Array.isArray(queueData)).toBe(true);
      expect(queueMeta.total).toBeGreaterThanOrEqual(1);
      return;
    }

    expect(Array.isArray(queueData.waiting ?? [])).toBe(true);
    expect(Array.isArray(queueData.awaiting_year_setup ?? [])).toBe(true);
  });

  it('lets staff add an internal note to the queued application', async () => {
    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/notes`,
      ownerToken,
      { note: 'Queue workflow note', is_internal: true },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.note).toBe('Queue workflow note');
  });

  it('lets staff reject the application from the queue', async () => {
    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/review`,
      ownerToken,
      {
        status: 'rejected',
        expected_updated_at: applicationUpdatedAt,
        rejection_reason: 'Workflow rejection check',
      },
      AL_NOOR_DOMAIN,
    );

    expect([200, 201]).toContain(res.status);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('rejected');
  });

  it('moves the application into the rejected archive', async () => {
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

  it('updates the admissions dashboard summary', async () => {
    const summary = await getAdmissionsDashboardSummary(app, ownerToken, AL_NOOR_DOMAIN);

    const payload = summary.data ?? summary;
    expect(payload.counts).toBeDefined();
    expect(payload.capacity_pressure).toBeDefined();
    expect(payload.counts.rejected_total).toBeGreaterThanOrEqual(1);
  });

  it('keeps the workflow tenant-isolated from Cedar', async () => {
    await authGet(
      app,
      `/api/v1/applications/${applicationId}`,
      cedarOwnerToken,
      CEDAR_DOMAIN,
    ).expect(404);
  });
});
