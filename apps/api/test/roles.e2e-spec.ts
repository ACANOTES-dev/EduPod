import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  authPatch,
  authPut,
  authDelete,
  login,
} from './helpers';

describe('Roles (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let teacherToken: string;

  // IDs and keys populated during tests
  let createdRoleId: string;
  let createdRoleKey: string;
  let systemRoleId: string;
  let staffTierPermissionId: string;
  let adminTierPermissionId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('should list roles', async () => {
    const res = await authGet(app, '/api/v1/roles', ownerToken, AL_NOOR_DOMAIN).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    // Expect system roles to be present
    const roleKeys = res.body.data.map((r: { role_key: string }) => r.role_key);
    expect(roleKeys).toContain('school_principal');
    expect(roleKeys).toContain('teacher');

    // Capture the school_owner role ID for later tests
    const schoolOwnerRole = res.body.data.find(
      (r: { role_key: string }) => r.role_key === 'school_principal',
    );
    expect(schoolOwnerRole).toBeDefined();
    systemRoleId = schoolOwnerRole.id;
  });

  it('should create custom role', async () => {
    // Use a unique role_key per test run to avoid conflicts from prior runs
    const uniqueRoleKey = `custom_test_${Date.now()}`;

    const res = await authPost(
      app,
      '/api/v1/roles',
      ownerToken,
      {
        role_key: uniqueRoleKey,
        display_name: 'Custom Test',
        role_tier: 'staff',
        permission_ids: [],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    expect(res.body.data ?? res.body).toMatchObject({
      role_key: uniqueRoleKey,
      display_name: 'Custom Test',
      role_tier: 'staff',
      is_system_role: false,
    });

    const created = res.body.data ?? res.body;
    createdRoleId = created.id;
    createdRoleKey = uniqueRoleKey;
    expect(createdRoleId).toBeDefined();
  });

  it.todo('should reject creating role above caller tier — complex setup required');

  it('should get role detail', async () => {
    expect(createdRoleId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/roles/${createdRoleId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(createdRoleId);
    expect(body.role_key).toBe(createdRoleKey);
    expect(body.role_permissions).toBeDefined();
    expect(Array.isArray(body.role_permissions)).toBe(true);
  });

  it('should update role display_name', async () => {
    expect(createdRoleId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/roles/${createdRoleId}`,
      ownerToken,
      { display_name: 'Custom Test Updated' },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.display_name).toBe('Custom Test Updated');
  });

  it('should reject updating system role', async () => {
    expect(systemRoleId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/roles/${systemRoleId}`,
      ownerToken,
      { display_name: 'Hacked Name' },
      AL_NOOR_DOMAIN,
    ).expect(400);

    const error = res.body.error ?? res.body;
    expect(error.code ?? error.message).toMatch(/SYSTEM_ROLE_IMMUTABLE|system role/i);
  });

  it('should reject deleting system role', async () => {
    expect(systemRoleId).toBeDefined();

    const res = await authDelete(
      app,
      `/api/v1/roles/${systemRoleId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(400);

    const error = res.body.error ?? res.body;
    expect(error.code ?? error.message).toMatch(/SYSTEM_ROLE_IMMUTABLE|system role/i);
  });

  it('should assign permissions with tier enforcement', async () => {
    expect(createdRoleId).toBeDefined();

    // Get the teacher role detail to find staff-tier permission IDs
    const rolesRes = await authGet(app, '/api/v1/roles', ownerToken, AL_NOOR_DOMAIN).expect(200);
    const teacherRole = rolesRes.body.data.find(
      (r: { role_key: string }) => r.role_key === 'teacher',
    );
    expect(teacherRole).toBeDefined();

    const teacherDetailRes = await authGet(
      app,
      `/api/v1/roles/${teacherRole.id}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const teacherDetail = teacherDetailRes.body.data ?? teacherDetailRes.body;
    const staffPermissions: Array<{ permission: { id: string; permission_tier: string } }> =
      teacherDetail.role_permissions.filter(
        (rp: { permission: { permission_tier: string } }) =>
          rp.permission.permission_tier === 'staff',
      );

    // Keep at most one for the assignment test
    const staffPermIds = staffPermissions.slice(0, 1).map(
      (rp: { permission: { id: string } }) => rp.permission.id,
    );
    staffTierPermissionId = staffPermIds[0];

    const res = await authPut(
      app,
      `/api/v1/roles/${createdRoleId}/permissions`,
      ownerToken,
      { permission_ids: staffPermIds },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.role_permissions).toBeDefined();
    expect(body.role_permissions.length).toBe(staffPermIds.length);
  });

  it('should reject above-tier permission assignment', async () => {
    expect(createdRoleId).toBeDefined();

    // Find an admin-tier permission ID by inspecting the school_owner role
    const ownerDetailRes = await authGet(
      app,
      `/api/v1/roles/${systemRoleId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const ownerDetail = ownerDetailRes.body.data ?? ownerDetailRes.body;
    const adminPermissions: Array<{ permission: { id: string; permission_tier: string } }> =
      ownerDetail.role_permissions.filter(
        (rp: { permission: { permission_tier: string } }) =>
          rp.permission.permission_tier === 'admin',
      );

    expect(adminPermissions.length).toBeGreaterThan(0);
    adminTierPermissionId = adminPermissions[0].permission.id;

    // Attempt to assign an admin-tier permission to a staff-tier role — must fail
    const res = await authPut(
      app,
      `/api/v1/roles/${createdRoleId}/permissions`,
      ownerToken,
      { permission_ids: [adminTierPermissionId] },
      AL_NOOR_DOMAIN,
    ).expect(400);

    const error = res.body.error ?? res.body;
    expect(error.code ?? error.message).toMatch(/TIER_VIOLATION|tier/i);
  });

  it('should delete custom role', async () => {
    expect(createdRoleId).toBeDefined();

    // Clear permissions first so the role has no memberships depending on it
    await authPut(
      app,
      `/api/v1/roles/${createdRoleId}/permissions`,
      ownerToken,
      { permission_ids: [] },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const res = await authDelete(
      app,
      `/api/v1/roles/${createdRoleId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.deleted).toBe(true);
  });

  it('should reject without roles.manage permission', async () => {
    await authPost(
      app,
      '/api/v1/roles',
      teacherToken,
      {
        role_key: 'should_fail',
        display_name: 'Should Fail',
        role_tier: 'staff',
        permission_ids: [],
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });
});
