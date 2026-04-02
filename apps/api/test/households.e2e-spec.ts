import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authDelete,
  authGet,
  authPatch,
  authPost,
  authPut,
  login,
} from './helpers';

describe('Households (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;
  let _cedarOwnerToken: string;

  // IDs populated during tests
  let householdId: string;
  let emergencyContactIds: string[] = [];
  let parentId: string;

  // For merge/split tests
  let _householdId2: string;
  let _studentId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    _cedarOwnerToken = cedarLogin.accessToken;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── 1. POST /households — create with emergency contacts ────────────────

  it('should create household with emergency contacts (201)', async () => {
    const uniqueName = `Test Household ${Date.now()}`;
    const res = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: uniqueName,
        emergency_contacts: [
          {
            contact_name: 'Emergency Person 1',
            phone: '+971501234567',
            relationship_label: 'Uncle',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.household_name).toBe(uniqueName);
    expect(data.emergency_contacts).toBeDefined();
    expect(data.emergency_contacts.length).toBe(1);
    expect(data.emergency_contacts[0].contact_name).toBe('Emergency Person 1');

    householdId = data.id;
    emergencyContactIds = data.emergency_contacts.map((c: { id: string }) => c.id);
  });

  // ─── 2. POST /households — reject without students.manage ────────────────

  it('should reject without students.manage permission (403)', async () => {
    await authPost(
      app,
      '/api/v1/households',
      parentToken,
      {
        household_name: 'Forbidden Household',
        emergency_contacts: [
          {
            contact_name: 'Contact',
            phone: '+971500000000',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  // ─── 3. POST /households — reject invalid body (no name) ─────────────────

  it('should reject invalid body with no name (400)', async () => {
    await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        emergency_contacts: [
          {
            contact_name: 'Contact',
            phone: '+971500000000',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  // ─── 4. GET /households — list households ────────────────────────────────

  it('should list households (200)', async () => {
    const res = await authGet(app, '/api/v1/households', ownerToken, AL_NOOR_DOMAIN).expect(200);

    const body = res.body;
    expect(body).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.total).toBe('number');
    expect(typeof body.meta.page).toBe('number');
    expect(typeof body.meta.pageSize).toBe('number');
  });

  // ─── 5. GET /households/:id — return detail ──────────────────────────────

  it('should return household detail (200)', async () => {
    expect(householdId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/households/${householdId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBe(householdId);
    expect(data.household_name).toBeDefined();
    expect(data.emergency_contacts).toBeDefined();
  });

  // ─── 6. GET /households/:id — 404 for non-existent ───────────────────────

  it('should return 404 for non-existent household', async () => {
    const fakeId = '00000000-0000-4000-a000-000000000000';
    await authGet(app, `/api/v1/households/${fakeId}`, ownerToken, AL_NOOR_DOMAIN).expect(404);
  });

  // ─── 7. PATCH /households/:id — update name ──────────────────────────────

  it('should update household name (200)', async () => {
    expect(householdId).toBeDefined();

    const newName = `Updated Household ${Date.now()}`;
    const res = await authPatch(
      app,
      `/api/v1/households/${householdId}`,
      ownerToken,
      { household_name: newName },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.household_name).toBe(newName);
  });

  // ─── Create a parent for link/billing tests ──────────────────────────────

  it('should create a parent for subsequent tests', async () => {
    const res = await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Test',
        last_name: `Parent ${Date.now()}`,
        email: `test-parent-${Date.now()}@alnoor.test`,
        phone: '+971501111111',
        preferred_contact_channels: ['email'],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    parentId = data.id;
  });

  // ─── 14. POST /households/:id/parents — link parent ──────────────────────

  it('should link parent to household (201)', async () => {
    expect(householdId).toBeDefined();
    expect(parentId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/households/${householdId}/parents`,
      ownerToken,
      { parent_id: parentId },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.parent_id).toBe(parentId);
    expect(data.household_id).toBe(householdId);
  });

  // ─── 8. PUT /households/:id/billing-parent — set billing parent ──────────

  it('should set billing parent (200)', async () => {
    expect(householdId).toBeDefined();
    expect(parentId).toBeDefined();

    const res = await authPut(
      app,
      `/api/v1/households/${householdId}/billing-parent`,
      ownerToken,
      { parent_id: parentId },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.primary_billing_parent_id).toBe(parentId);
  });

  // ─── 9. PUT /households/:id/billing-parent — reject unlinked parent ──────

  it('should reject setting unlinked parent as billing parent (400)', async () => {
    expect(householdId).toBeDefined();

    const fakeParentId = '00000000-0000-4000-a000-000000000001';
    await authPut(
      app,
      `/api/v1/households/${householdId}/billing-parent`,
      ownerToken,
      { parent_id: fakeParentId },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  // ─── 10. POST /households/:id/emergency-contacts — add contact ───────────

  it('should add emergency contact (201)', async () => {
    expect(householdId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/households/${householdId}/emergency-contacts`,
      ownerToken,
      {
        contact_name: 'Emergency Person 2',
        phone: '+971502222222',
        relationship_label: 'Aunt',
        display_order: 2,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.contact_name).toBe('Emergency Person 2');
    emergencyContactIds.push(data.id);
  });

  // ─── 11. POST /households/:id/emergency-contacts — reject when 3 exist ──

  it('should reject adding emergency contact when 3 already exist (400)', async () => {
    expect(householdId).toBeDefined();

    // Add a third contact first
    const res3 = await authPost(
      app,
      `/api/v1/households/${householdId}/emergency-contacts`,
      ownerToken,
      {
        contact_name: 'Emergency Person 3',
        phone: '+971503333333',
        relationship_label: 'Grandmother',
        display_order: 3,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    emergencyContactIds.push(res3.body.data.id);

    // Now attempt a fourth — should fail
    await authPost(
      app,
      `/api/v1/households/${householdId}/emergency-contacts`,
      ownerToken,
      {
        contact_name: 'Emergency Person 4',
        phone: '+971504444444',
        display_order: 1,
      },
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  // ─── 12. DELETE /households/:id/emergency-contacts/:cid — remove ─────────

  it('should remove emergency contact (204)', async () => {
    expect(householdId).toBeDefined();
    expect(emergencyContactIds.length).toBeGreaterThanOrEqual(2);

    // Remove the last one added (the third)
    const contactToRemove = emergencyContactIds[emergencyContactIds.length - 1];

    await authDelete(
      app,
      `/api/v1/households/${householdId}/emergency-contacts/${contactToRemove}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);

    emergencyContactIds.pop();
  });

  // ─── 13. DELETE /households/:id/emergency-contacts/:cid — block last ─────

  it('should block removing the last emergency contact (400)', async () => {
    // Create a household with exactly one contact
    const res = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Single Contact HH ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Sole Contact',
            phone: '+971509999999',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const singleHouseholdId = res.body.data.id;
    const soleContactId = res.body.data.emergency_contacts[0].id;

    await authDelete(
      app,
      `/api/v1/households/${singleHouseholdId}/emergency-contacts/${soleContactId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(400);
  });

  // ─── 15. DELETE /households/:id/parents/:pid — unlink parent ─────────────

  it('should unlink parent from household (204)', async () => {
    // Create a new parent to link then unlink (cannot unlink billing parent)
    const parentRes = await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Unlink',
        last_name: `Parent ${Date.now()}`,
        phone: '+971505555555',
        preferred_contact_channels: ['email'],
        email: `unlink-parent-${Date.now()}@alnoor.test`,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const unlinkParentId = parentRes.body.data.id;

    // Link the parent
    await authPost(
      app,
      `/api/v1/households/${householdId}/parents`,
      ownerToken,
      { parent_id: unlinkParentId },
      AL_NOOR_DOMAIN,
    ).expect(201);

    // Unlink the parent
    await authDelete(
      app,
      `/api/v1/households/${householdId}/parents/${unlinkParentId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);
  });

  // ─── 16. POST /households/merge — merge two households ───────────────────

  it('should merge two households (200)', async () => {
    // Create two households for merge
    const res1 = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Merge Source ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Source Contact',
            phone: '+971506666666',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const sourceId = res1.body.data.id;

    const res2 = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Merge Target ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Target Contact',
            phone: '+971507777777',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const targetId = res2.body.data.id;

    const mergeRes = await authPost(
      app,
      '/api/v1/households/merge',
      ownerToken,
      {
        source_household_id: sourceId,
        target_household_id: targetId,
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = mergeRes.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBe(targetId);

    // Verify source is archived
    const sourceRes = await authGet(
      app,
      `/api/v1/households/${sourceId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(sourceRes.body.data.status).toBe('archived');
  });

  // ─── 17. POST /households/split — split household ────────────────────────

  it('should split household (200)', async () => {
    // Create a household with a student for split
    const hhRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: `Split Source ${Date.now()}`,
        emergency_contacts: [
          {
            contact_name: 'Split Contact',
            phone: '+971508888888',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const splitSourceId = hhRes.body.data.id;

    // Create a student in that household
    const splitTs = Date.now();
    const studentRes = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: splitSourceId,
        first_name: 'Split',
        last_name: `Student ${splitTs}`,
        date_of_birth: '2015-06-15',
        national_id: `NID-SPLIT-${splitTs}`,
        nationality: 'Irish',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const splitStudentId = studentRes.body.data.id;

    // Split: move the student to a new household
    const splitRes = await authPost(
      app,
      '/api/v1/households/split',
      ownerToken,
      {
        source_household_id: splitSourceId,
        new_household_name: `Split Target ${Date.now()}`,
        student_ids: [splitStudentId],
        parent_ids: [],
        emergency_contacts: [
          {
            contact_name: 'New HH Contact',
            phone: '+971509999999',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const data = splitRes.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBeDefined();
    expect(data.id).not.toBe(splitSourceId);
    expect(data.emergency_contacts.length).toBeGreaterThanOrEqual(1);
    // Verify the student was moved
    expect(data.students).toBeDefined();
    expect(data.students.some((s: { id: string }) => s.id === splitStudentId)).toBe(true);
  });

  // ─── 18. GET /households/:id/preview — return preview data ───────────────

  it('should return preview data (200)', async () => {
    expect(householdId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/households/${householdId}/preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.id).toBe(householdId);
    expect(data.entity_type).toBe('household');
    expect(data.primary_label).toBeDefined();
    expect(data.secondary_label).toBeDefined();
    expect(data.status).toBeDefined();
    expect(data.facts).toBeDefined();
    expect(Array.isArray(data.facts)).toBe(true);
  });
});
