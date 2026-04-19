import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { closeTestApp, createTestApp, DEV_PASSWORD, authGet, authPost, login } from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Memberships (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let ownerToken: string;
  let parentToken: string;

  // Populated during tests
  let teacherUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma);

    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, fixture.parentEmail!, DEV_PASSWORD, fixture.domainName);
    parentToken = parentLogin.accessToken;
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();

    await closeTestApp();
  });

  it('should list users', async () => {
    const res = await authGet(app, '/api/v1/users', ownerToken, fixture.domainName).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Pagination meta
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.total).toBe('number');
    expect(typeof res.body.meta.page).toBe('number');
    expect(typeof res.body.meta.pageSize).toBe('number');
  });

  it('should get user detail', async () => {
    // Seed has grown beyond one page of users — search by email to locate the teacher deterministically.
    const listRes = await authGet(
      app,
      `/api/v1/users?search=${encodeURIComponent(fixture.teacherEmail!)}`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const teacherMembership = listRes.body.data.find(
      (m: { user: { email: string } }) => m.user.email === fixture.teacherEmail!,
    );
    expect(teacherMembership).toBeDefined();
    teacherUserId = teacherMembership.user.id;

    const res = await authGet(
      app,
      `/api/v1/users/${teacherUserId}`,
      ownerToken,
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.user.id).toBe(teacherUserId);
    expect(body.user.email).toBe(fixture.teacherEmail!);
    expect(body.membership_roles).toBeDefined();
    expect(Array.isArray(body.membership_roles)).toBe(true);
  });

  it.todo('should update membership roles — needs role IDs not assigned to active users');

  it('should suspend membership', async () => {
    expect(teacherUserId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/users/${teacherUserId}/suspend`,
      ownerToken,
      {},
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.membership_status).toBe('suspended');
  });

  it('should reject suspending last principal', async () => {
    // Get the owner's own user ID (seed data assigns school_principal role)
    const ownerLogin = await login(app, fixture.ownerEmail, DEV_PASSWORD, fixture.domainName);
    const ownerUserId = ownerLogin.user.id as string;
    expect(ownerUserId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/users/${ownerUserId}/suspend`,
      ownerToken,
      {},
      fixture.domainName,
    ).expect(400);

    const error = res.body.error ?? res.body;
    expect(error.code ?? error.message).toMatch(
      /SCHOOL_OWNER_PROTECTED|LAST_SCHOOL_PRINCIPAL|last.*principal|last.*owner|cannot.*suspend/i,
    );
  });

  it('should reactivate membership', async () => {
    expect(teacherUserId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/users/${teacherUserId}/reactivate`,
      ownerToken,
      {},
      fixture.domainName,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.membership_status).toBe('active');
  });

  it('should reject without users.view permission', async () => {
    await authGet(app, '/api/v1/users', parentToken, fixture.domainName).expect(403);
  });
});
