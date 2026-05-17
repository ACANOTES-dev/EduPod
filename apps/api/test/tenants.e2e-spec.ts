import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { MODULE_KEYS_ARRAY, MODULE_REGISTRY } from '@school/shared';

import {
  PLATFORM_ADMIN_EMAIL,
  authGet,
  authPatch,
  authPost,
  closeTestApp,
  createTestApp,
  getAuthToken,
} from './helpers';
import { createTenantFixture, deleteTenantFixture, TenantFixture } from './tenant-fixture.builder';

describe('Tenants Admin Endpoints (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: TenantFixture;
  let platformToken: string;
  // A non-platform tenant owner used to prove platform-admin routes reject
  // non-platform callers — we need any valid tenant-owner token, not the
  // shared al-noor one.
  let nonPlatformOwnerToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    fixture = await createTenantFixture(prisma, { users: ['owner'] });
    platformToken = await getAuthToken(app, PLATFORM_ADMIN_EMAIL);
    nonPlatformOwnerToken = await getAuthToken(app, fixture.ownerEmail, fixture.domainName);
  });

  afterAll(async () => {
    await deleteTenantFixture(prisma, fixture);
    await prisma.$disconnect();
    await closeTestApp();
  });

  // ─── Test 1: Create tenant ───────────────────────────────────────────────────

  it('should create tenant', async () => {
    const slug = `test-${Date.now()}`;
    const res = await authPost(app, '/api/v1/admin/tenants', platformToken, {
      name: 'Test School',
      slug,
      default_locale: 'en',
      timezone: 'Asia/Dubai',
      date_format: 'DD-MM-YYYY',
      currency_code: 'AED',
      academic_year_start_month: 9,
    }).expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.slug).toBe(slug);
    expect(res.body.data.name).toBe('Test School');
    expect(res.body.data.status).toBe('active');
  });

  // ─── Test 2: Default-deny non-platform caller ───────────────────────────────

  it('should default-deny non-platform caller', async () => {
    const slug = `test-reject-${Date.now()}`;
    await authPost(app, '/api/v1/admin/tenants', nonPlatformOwnerToken, {
      name: 'Unauthorised School',
      slug,
      default_locale: 'en',
      timezone: 'Asia/Dubai',
      date_format: 'DD-MM-YYYY',
      currency_code: 'AED',
      academic_year_start_month: 9,
    }).expect(404);
  });

  // ─── Test 3: Reject unauthenticated ─────────────────────────────────────────

  it('should reject unauthenticated request', async () => {
    const slug = `test-unauth-${Date.now()}`;
    await authPost(app, '/api/v1/admin/tenants', '', {
      name: 'Unauthenticated School',
      slug,
      default_locale: 'en',
      timezone: 'Asia/Dubai',
      date_format: 'DD-MM-YYYY',
      currency_code: 'AED',
      academic_year_start_month: 9,
    }).expect(401);
  });

  // ─── Test 4: List tenants ────────────────────────────────────────────────────

  it('should list tenants with at least 2 tenants (al-noor, cedar)', async () => {
    // Use pageSize=100 and order=asc so seed tenants (oldest) are in the result set
    const res = await authGet(
      app,
      '/api/v1/admin/tenants?pageSize=100&order=asc',
      platformToken,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);

    const slugs = res.body.data.map((t: { slug: string }) => t.slug);
    expect(slugs).toEqual(expect.arrayContaining(['al-noor', 'cedar']));
  });

  // ─── Test 5: Get tenant detail ───────────────────────────────────────────────

  it('should get tenant detail', async () => {
    // First get list to find al-noor's ID (use pageSize=100 and asc order so seed tenants are included)
    const listRes = await authGet(
      app,
      '/api/v1/admin/tenants?pageSize=100&order=asc',
      platformToken,
    ).expect(200);
    const alNoor = listRes.body.data.find((t: { slug: string }) => t.slug === 'al-noor');
    expect(alNoor).toBeDefined();

    const res = await authGet(app, `/api/v1/admin/tenants/${alNoor.id}`, platformToken).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(alNoor.id);
    expect(res.body.data.slug).toBe('al-noor');
    expect(res.body.data.modules).toBeDefined();
    expect(res.body.data.domains).toBeDefined();
    expect(res.body.data.branding).toBeDefined();
    expect(res.body.data.settings).toBeDefined();
  });

  // ─── Test 6: Update tenant ───────────────────────────────────────────────────

  it('should update tenant name', async () => {
    const listRes = await authGet(
      app,
      '/api/v1/admin/tenants?pageSize=100&order=asc',
      platformToken,
    ).expect(200);
    const alNoor = listRes.body.data.find((t: { slug: string }) => t.slug === 'al-noor');
    expect(alNoor).toBeDefined();

    const updatedName = 'Al Noor Updated';
    const res = await authPatch(app, `/api/v1/admin/tenants/${alNoor.id}`, platformToken, {
      name: updatedName,
    }).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.name).toBe(updatedName);

    // Restore original name
    await authPatch(app, `/api/v1/admin/tenants/${alNoor.id}`, platformToken, {
      name: alNoor.name,
    });
  });

  // ─── Test 7: Suspend tenant ──────────────────────────────────────────────────

  it('should suspend tenant', async () => {
    // Create a fresh tenant to suspend
    const slug = `test-suspend-${Date.now()}`;
    const createRes = await authPost(app, '/api/v1/admin/tenants', platformToken, {
      name: 'Suspend Me School',
      slug,
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'DD-MM-YYYY',
      currency_code: 'USD',
      academic_year_start_month: 9,
    }).expect(201);

    const tenantId = createRes.body.data.id;

    const res = await authPost(
      app,
      `/api/v1/admin/tenants/${tenantId}/suspend`,
      platformToken,
      {},
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('suspended');
  });

  // ─── Test 8: Reactivate tenant ───────────────────────────────────────────────

  it('should reactivate a suspended tenant', async () => {
    // Create and suspend a fresh tenant
    const slug = `test-reactivate-${Date.now()}`;
    const createRes = await authPost(app, '/api/v1/admin/tenants', platformToken, {
      name: 'Reactivate Me School',
      slug,
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'DD-MM-YYYY',
      currency_code: 'USD',
      academic_year_start_month: 9,
    }).expect(201);

    const tenantId = createRes.body.data.id;

    await authPost(app, `/api/v1/admin/tenants/${tenantId}/suspend`, platformToken, {}).expect(200);

    const res = await authPost(
      app,
      `/api/v1/admin/tenants/${tenantId}/reactivate`,
      platformToken,
      {},
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('active');
  });

  // ─── Test 9: Archive tenant ──────────────────────────────────────────────────

  it('should archive tenant', async () => {
    // Create a fresh tenant to archive
    const slug = `test-archive-${Date.now()}`;
    const createRes = await authPost(app, '/api/v1/admin/tenants', platformToken, {
      name: 'Archive Me School',
      slug,
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'DD-MM-YYYY',
      currency_code: 'USD',
      academic_year_start_month: 9,
    }).expect(201);

    const tenantId = createRes.body.data.id;

    const res = await authPost(
      app,
      `/api/v1/admin/tenants/${tenantId}/archive`,
      platformToken,
      {},
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('archived');
  });

  // ─── Test 10: Dashboard stats ────────────────────────────────────────────────

  it('should get dashboard stats with at least 1 active tenant', async () => {
    const res = await authGet(app, '/api/v1/admin/dashboard', platformToken).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.tenants).toBeDefined();
    expect(res.body.data.tenants.active).toBeGreaterThan(0);
    expect(res.body.data.tenants.total).toBeGreaterThanOrEqual(res.body.data.tenants.active);
    expect(res.body.data.users).toBeDefined();
    expect(res.body.data.users.total).toBeGreaterThan(0);
  });

  // ─── Test 11: List tenant modules ───────────────────────────────────────────

  it('should list tenant modules and return all canonical modules', async () => {
    const listRes = await authGet(
      app,
      '/api/v1/admin/tenants?pageSize=100&order=asc',
      platformToken,
    ).expect(200);
    const alNoor = listRes.body.data.find((t: { slug: string }) => t.slug === 'al-noor');
    expect(alNoor).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/admin/tenants/${alNoor.id}/modules`,
      platformToken,
    ).expect(200);

    const modulesView = res.body.data;
    expect(modulesView.tenant_id).toBe(alNoor.id);
    expect(modulesView.completeness).toEqual({ complete: true, missing: [] });
    expect(Array.isArray(modulesView.modules)).toBe(true);
    expect(modulesView.modules).toHaveLength(MODULE_KEYS_ARRAY.length);

    const moduleKeys = modulesView.modules.map((m: { key: string }) => m.key).sort();
    expect(moduleKeys).toEqual([...MODULE_KEYS_ARRAY].sort());

    const websiteModule = modulesView.modules.find((m: { key: string }) => m.key === 'website');
    const websiteDefinition = MODULE_REGISTRY.find((m) => m.key === 'website');
    expect(websiteModule).toMatchObject({
      key: 'website',
      display_name: websiteDefinition?.display_name,
      default_enabled: websiteDefinition?.default_enabled,
      is_enabled: expect.any(Boolean),
    });
    expect(websiteModule).toHaveProperty('last_toggled_at');
    expect(websiteModule).toHaveProperty('last_toggled_by');
  });

  // ─── Test 12: Toggle module ──────────────────────────────────────────────────

  it('should toggle a module off then back on', async () => {
    const listRes = await authGet(
      app,
      '/api/v1/admin/tenants?pageSize=100&order=asc',
      platformToken,
    ).expect(200);
    const alNoor = listRes.body.data.find((t: { slug: string }) => t.slug === 'al-noor');
    expect(alNoor).toBeDefined();

    const moduleKey = 'website';

    // Disable the module
    const disableRes = await authPatch(
      app,
      `/api/v1/admin/tenants/${alNoor.id}/modules/${moduleKey}`,
      platformToken,
      { is_enabled: false },
    ).expect(200);

    expect(disableRes.body.data).toBeDefined();
    expect(disableRes.body.data.is_enabled).toBe(false);
    expect(disableRes.body.data.module_key).toBe(moduleKey);

    // Re-enable the module
    const enableRes = await authPatch(
      app,
      `/api/v1/admin/tenants/${alNoor.id}/modules/${moduleKey}`,
      platformToken,
      { is_enabled: true },
    ).expect(200);

    expect(enableRes.body.data).toBeDefined();
    expect(enableRes.body.data.is_enabled).toBe(true);
    expect(enableRes.body.data.module_key).toBe(moduleKey);
  });
});
