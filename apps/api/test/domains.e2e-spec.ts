import { INestApplication } from '@nestjs/common';

import {
  PLATFORM_ADMIN_EMAIL,
  authDelete,
  authGet,
  authPatch,
  authPost,
  closeTestApp,
  createTestApp,
  getAuthToken,
} from './helpers';

describe('Domains Admin Endpoints (e2e)', () => {
  let app: INestApplication;
  let platformToken: string;
  let alNoorTenantId: string;

  beforeAll(async () => {
    app = await createTestApp();
    platformToken = await getAuthToken(app, PLATFORM_ADMIN_EMAIL);

    // Resolve al-noor tenant ID for use across all domain tests
    // Use pageSize=100 and order=asc so seed tenants (oldest) are in the result set
    const listRes = await authGet(app, '/api/v1/admin/tenants?pageSize=100&order=asc', platformToken).expect(200);
    const alNoor = listRes.body.data.find((t: { slug: string }) => t.slug === 'al-noor');
    expect(alNoor).toBeDefined();
    alNoorTenantId = alNoor.id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── Test 1: List domains ────────────────────────────────────────────────────

  it('should list domains for al-noor and return at least 1 domain', async () => {
    const res = await authGet(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const primaryDomain = res.body.data.find((d: { is_primary: boolean }) => d.is_primary);
    expect(primaryDomain).toBeDefined();
    expect(primaryDomain.tenant_id).toBe(alNoorTenantId);
  });

  // ─── Test 2: Add domain ──────────────────────────────────────────────────────

  it('should add a new domain to al-noor', async () => {
    const newDomain = `test-e2e-${Date.now()}.example.com`;

    const res = await authPost(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
      {
        domain: newDomain,
        domain_type: 'app',
        is_primary: false,
      },
    ).expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.domain).toBe(newDomain);
    expect(res.body.data.domain_type).toBe('app');
    expect(res.body.data.is_primary).toBe(false);
    expect(res.body.data.tenant_id).toBe(alNoorTenantId);
    expect(res.body.data.verification_status).toBe('pending');
    expect(res.body.data.ssl_status).toBe('pending');
  });

  // ─── Test 3: Reject duplicate domain ────────────────────────────────────────

  it('should reject adding a duplicate domain with 409', async () => {
    const duplicateDomain = `test-dup-${Date.now()}.example.com`;

    // First addition should succeed
    await authPost(app, `/api/v1/admin/tenants/${alNoorTenantId}/domains`, platformToken, {
      domain: duplicateDomain,
      domain_type: 'app',
      is_primary: false,
    }).expect(201);

    // Second addition of the same domain should conflict
    const res = await authPost(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
      {
        domain: duplicateDomain,
        domain_type: 'public_site',
        is_primary: false,
      },
    ).expect(409);

    expect(res.body.error).toBeDefined();
  });

  // ─── Test 4: Update domain ───────────────────────────────────────────────────

  it('should update a domain record', async () => {
    // Create a domain to update
    const domainName = `test-update-${Date.now()}.example.com`;
    const createRes = await authPost(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
      {
        domain: domainName,
        domain_type: 'app',
        is_primary: false,
      },
    ).expect(201);

    const domainId = createRes.body.data.id;

    // Update the domain type
    const res = await authPatch(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains/${domainId}`,
      platformToken,
      { domain_type: 'public_site' },
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBe(domainId);
    expect(res.body.data.domain_type).toBe('public_site');
  });

  // ─── Test 5: Remove domain ───────────────────────────────────────────────────

  it('should remove a non-primary domain', async () => {
    // Create a domain to delete
    const domainName = `test-delete-${Date.now()}.example.com`;
    const createRes = await authPost(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
      {
        domain: domainName,
        domain_type: 'app',
        is_primary: false,
      },
    ).expect(201);

    const domainId = createRes.body.data.id;

    const res = await authDelete(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains/${domainId}`,
      platformToken,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.deleted).toBe(true);

    // Confirm it no longer appears in the domain list
    const listRes = await authGet(
      app,
      `/api/v1/admin/tenants/${alNoorTenantId}/domains`,
      platformToken,
    ).expect(200);

    const deleted = listRes.body.data.find((d: { id: string }) => d.id === domainId);
    expect(deleted).toBeUndefined();
  });
});
