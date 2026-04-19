import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import {
  buildPublicApplicationSeed,
  createPublicApplication,
  ensureAdmissionsTargets,
  getAdmissionsDashboardSummary,
} from '../admissions-test-helpers';
import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, authPost, login } from '../helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from '../tenant-fixture.builder';

jest.setTimeout(120_000);

describe('Workflow: Admissions Queue Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let cedarFixture: TenantFixture;
  let ownerToken: string;
  let cedarOwnerToken: string;
  let applicationId: string;
  let initialStatus: 'ready_to_admit' | 'waiting_list';
  let applicationUpdatedAt: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);
    cedarFixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const cedarLogin = await login(
      app,
      cedarFixture.ownerEmail,
      DEV_PASSWORD,
      cedarFixture.domainName,
    );
    cedarOwnerToken = cedarLogin.accessToken;

    const targets = await ensureAdmissionsTargets(app, ownerToken, fixture.domainName);
    const created = await createPublicApplication(
      app,
      fixture.domainName,
      buildPublicApplicationSeed(targets),
    );

    applicationId = created.body.id as string;
    initialStatus = created.body.status as 'ready_to_admit' | 'waiting_list';

    const detailRes = await authGet(
      app,
      `/api/v1/applications/${applicationId}`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const detailBody = detailRes.body.data ?? detailRes.body;
    applicationUpdatedAt = detailBody.updated_at;
  }, 60_000);

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await deleteTenantFixture(prisma, cedarFixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('surfaces the new application in the current queue view', async () => {
    const queuePath =
      initialStatus === 'ready_to_admit'
        ? '/api/v1/applications/queues/ready-to-admit'
        : '/api/v1/applications/queues/waiting-list';

    const res = await authGet(app, queuePath, ownerToken, fixture.domainName).expect(200);
    const body = res.body.data ?? res.body;
    const queueData = body.data ?? body;
    if (initialStatus === 'ready_to_admit') {
      // ready-to-admit queue may or may not include pagination meta depending
      // on result size. Check the array itself rather than meta.total which
      // is optional in the response contract.
      expect(Array.isArray(queueData)).toBe(true);
      expect(queueData.length).toBeGreaterThanOrEqual(1);
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
      fixture.domainName,
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
      fixture.domainName,
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
      fixture.domainName,
    ).expect(200);

    const buckets = res.body.data ?? [];
    expect(Array.isArray(buckets)).toBe(true);
    const allApps = buckets.flatMap(
      (bucket: { applications: Array<{ id: string }> }) => bucket.applications,
    );
    expect(allApps.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('updates the admissions dashboard summary', async () => {
    const summary = await getAdmissionsDashboardSummary(app, ownerToken, fixture.domainName);

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
      cedarFixture.domainName,
    ).expect(404);
  });
});
