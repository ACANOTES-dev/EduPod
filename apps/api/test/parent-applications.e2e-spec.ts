import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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

describe('Parent Applications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let ownerToken: string;
  let parentToken: string;
  let applicationId: string;
  let parentUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
    parentUserId = (parentLogin.user as { id: string }).id;

    const targets = await ensureAdmissionsTargets(app, ownerToken, AL_NOOR_DOMAIN);
    const created = await createPublicApplication(
      app,
      AL_NOOR_DOMAIN,
      buildPublicApplicationSeed(targets),
    );
    applicationId = created.body.id as string;

    await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Test',
        last_name: 'Parent',
        email: AL_NOOR_PARENT_EMAIL,
        phone: '+353871111111',
        preferred_contact_channels: ['email'],
        user_id: parentUserId,
      },
      AL_NOOR_DOMAIN,
    );

    const parent = await prisma.parent.findFirstOrThrow({
      where: {
        tenant: { slug: 'al-noor' },
        user_id: parentUserId,
      },
      select: { id: true },
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: { submitted_by_parent_id: parent.id },
    });

    await authPost(
      app,
      `/api/v1/applications/${applicationId}/notes`,
      ownerToken,
      { note: 'Internal-only admissions note', is_internal: true },
      AL_NOOR_DOMAIN,
    ).expect(201);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await closeTestApp();
  });

  it('lists only the logged-in parent applications', async () => {
    const res = await authGet(
      app,
      '/api/v1/parent/applications',
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data ?? res.body;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((item: { id: string }) => item.id === applicationId)).toBe(true);
  });

  it('returns the parent view without internal notes', async () => {
    const res = await authGet(
      app,
      `/api/v1/parent/applications/${applicationId}`,
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(applicationId);
    expect(Array.isArray(body.notes)).toBe(true);
    expect(
      body.notes.some((note: { is_internal?: boolean; internal?: boolean }) => {
        return note.is_internal === true || note.internal === true;
      }),
    ).toBe(false);
  });

  it('allows the parent to withdraw their own application', async () => {
    const res = await authPost(
      app,
      `/api/v1/parent/applications/${applicationId}/withdraw`,
      parentToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('withdrawn');
  });

  it('returns 401 when listing applications without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/parent/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });
});
