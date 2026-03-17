import { INestApplication } from '@nestjs/common';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  authDelete,
} from './helpers';

describe('Parents (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  // Populated during tests
  let createdParentId: string;
  let householdId: string;
  let studentId: string;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await getAuthToken(app, AL_NOOR_OWNER_EMAIL, AL_NOOR_DOMAIN);
    parentToken = await getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN);
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('POST /parents — should create parent', async () => {
    const res = await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Test',
        last_name: 'Parent',
        preferred_contact_channels: ['email'],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.first_name).toBe('Test');
    expect(res.body.data.last_name).toBe('Parent');

    createdParentId = res.body.data.id;
  });

  it('POST /parents — should reject without students.manage permission', async () => {
    await authPost(
      app,
      '/api/v1/parents',
      parentToken,
      {
        first_name: 'Forbidden',
        last_name: 'Parent',
        preferred_contact_channels: ['email'],
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('GET /parents — should list parents', async () => {
    const res = await authGet(
      app,
      '/api/v1/parents',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('GET /parents/:id — should return parent detail', async () => {
    expect(createdParentId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/parents/${createdParentId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(createdParentId);
    expect(body.first_name).toBe('Test');
    expect(body.last_name).toBe('Parent');
  });

  it('PATCH /parents/:id — should update parent', async () => {
    expect(createdParentId).toBeDefined();

    const res = await authPatch(
      app,
      `/api/v1/parents/${createdParentId}`,
      ownerToken,
      {
        first_name: 'Updated',
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.first_name).toBe('Updated');
  });

  it('POST /parents/:id/students — should link student to parent', async () => {
    expect(createdParentId).toBeDefined();

    // Create a household first
    const householdRes = await authPost(
      app,
      '/api/v1/households',
      ownerToken,
      {
        household_name: 'Test Household for Parent Link',
        emergency_contacts: [
          {
            contact_name: 'Emergency Person',
            phone: '+1234567890',
            display_order: 1,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    householdId = householdRes.body.data.id;
    expect(householdId).toBeDefined();

    // Create a student in that household
    const studentRes = await authPost(
      app,
      '/api/v1/students',
      ownerToken,
      {
        household_id: householdId,
        first_name: 'Link',
        last_name: 'Student',
        date_of_birth: '2015-06-15',
        status: 'active',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    studentId = studentRes.body.data.id;
    expect(studentId).toBeDefined();

    // Link the student to the parent
    const res = await authPost(
      app,
      `/api/v1/parents/${createdParentId}/students`,
      ownerToken,
      {
        student_id: studentId,
        relationship_label: 'Father',
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    expect(res.body.data).toBeDefined();
  });

  it('DELETE /parents/:parentId/students/:studentId — should unlink student from parent', async () => {
    expect(createdParentId).toBeDefined();
    expect(studentId).toBeDefined();

    await authDelete(
      app,
      `/api/v1/parents/${createdParentId}/students/${studentId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(204);
  });
});
