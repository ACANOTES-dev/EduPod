import { INestApplication } from '@nestjs/common';

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

describe('Workflow: Household Merge (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let cedarOwnerToken: string;

  // Households for the merge workflow
  let householdAId: string;
  let householdBId: string;
  let householdAName: string;
  let householdBName: string;

  // Students and parents created in the households
  let studentInBId: string;
  let parentInBId: string;

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarOwnerToken = cedarLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── 1. Create Household A (the target / survivor) ──────────────────────

  it('should create household A (merge target)', async () => {
    householdAName = `Merge Target HH ${Date.now()}`;
    const res = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: householdAName,
        emergency_contacts: [
          {
            contact_name: 'Target Emergency Contact',
            phone: '+971501111111',
            relationship_label: 'Mother',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    householdAId = data.id;
  });

  // ─── 2. Create Household B (the source / to be archived) ──────────────

  it('should create household B (merge source)', async () => {
    householdBName = `Merge Source HH ${Date.now()}`;
    const res = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: householdBName,
        emergency_contacts: [
          {
            contact_name: 'Source Emergency Contact',
            phone: '+971502222222',
            relationship_label: 'Father',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    householdBId = data.id;
  });

  // ─── 3. Add a student to Household B ────────────────────────────────────

  it('should create a student in household B', async () => {
    const ts = Date.now();
    const res = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdBId,
        first_name: 'Merge',
        last_name: `Student ${ts}`,
        date_of_birth: '2016-03-15',
        status: 'active',
        national_id: `NID-MERGE-${ts}`,
        nationality: 'Irish',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    studentInBId = data.id;
  });

  // ─── 4. Add a parent to Household B ─────────────────────────────────────

  it('should create and link a parent to household B', async () => {
    const parentRes = await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Merge',
        last_name: `Parent ${Date.now()}`,
        email: `merge-parent-${Date.now()}@alnoor.test`,
        phone: '+971503333333',
        preferred_contact_channels: ['email'],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    parentInBId = parentRes.body.data.id;

    await authPost(
      app,
      `/api/v1/households/${householdBId}/parents`,
      ownerToken,
      { parent_id: parentInBId },
      AL_NOOR_DOMAIN,
    ).expect(201);
  });

  // ─── 5. Verify both households exist before merge ──────────────────────

  it('should verify both households are active before merge', async () => {
    const resA = await authGet(
      app,
      `/api/v1/households/${householdAId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(resA.body.data.status).toBe('active');

    const resB = await authGet(
      app,
      `/api/v1/households/${householdBId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(resB.body.data.status).toBe('active');
  });

  // ─── 6. Merge Household B into Household A ────────────────────────────

  it('should merge household B into household A', async () => {
    const mergeRes = await authPost(
      app,
      '/api/v1/households/merge',
      ownerToken,
      {
        source_household_id: householdBId,
        target_household_id: householdAId,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = mergeRes.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBe(householdAId);
  });

  // ─── 7. Verify source household is archived ──────────────────────────

  it('should verify household B is archived after merge', async () => {
    const res = await authGet(
      app,
      `/api/v1/households/${householdBId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data.status).toBe('archived');
  });

  // ─── 8. Verify students moved to target household ────────────────────

  it('should verify student from B now belongs to household A', async () => {
    const res = await authGet(
      app,
      `/api/v1/households/${householdAId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();

    // Check if students from B are now in A
    if (data.students && Array.isArray(data.students)) {
      const movedStudent = data.students.find((s: { id: string }) => s.id === studentInBId);
      expect(movedStudent).toBeDefined();
    } else {
      // The detail view may not include students inline;
      // verify via the student's own detail endpoint
      const studentRes = await authGet(
        app,
        `/api/v1/students/${studentInBId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const studentData = studentRes.body.data;
      expect(studentData.household_id).toBe(householdAId);
    }
  });

  // ─── 9. Verify target household is still active ──────────────────────

  it('should verify household A is still active after merge', async () => {
    const res = await authGet(
      app,
      `/api/v1/households/${householdAId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data.status).toBe('active');
  });

  // ─── 10. Prevent merging into an archived household ──────────────────

  it('should reject merging into an already-archived household', async () => {
    // Create a fresh source household
    const freshRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Fresh Source ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Fresh Contact',
            phone: '+971504444444',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const freshId = freshRes.body.data.id;

    // Try to merge fresh into archived householdB (source is now archived)
    const res = await authPost(
      app,
      '/api/v1/households/merge',
      ownerToken,
      {
        source_household_id: freshId,
        target_household_id: householdBId,
      },
      AL_NOOR_DOMAIN,
    );

    // Should fail because target is archived
    expect([400, 409, 422]).toContain(res.status);
  });

  // ─── 11. Self-merge prevention ──────────────────────────────────────

  it('should reject merging a household into itself', async () => {
    const res = await authPost(
      app,
      '/api/v1/households/merge',
      ownerToken,
      {
        source_household_id: householdAId,
        target_household_id: householdAId,
      },
      AL_NOOR_DOMAIN,
    );

    expect([400, 409, 422]).toContain(res.status);
  });

  // ─── 12. Cross-tenant isolation ──────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should prevent Cedar from seeing Al Noor merged households', async () => {
      const res = await authGet(app, '/api/v1/households', cedarOwnerToken, CEDAR_DOMAIN).expect(
        200,
      );

      const households = res.body.data ?? [];

      // Cedar should not see Al Noor's households
      const leakedA = households.find((h: { id: string }) => h.id === householdAId);
      const leakedB = households.find((h: { id: string }) => h.id === householdBId);

      expect(leakedA).toBeUndefined();
      expect(leakedB).toBeUndefined();
    });

    it('should return 404 when Cedar accesses Al Noor household by ID', async () => {
      await authGet(
        app,
        `/api/v1/households/${householdAId}`,
        cedarOwnerToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });
});
