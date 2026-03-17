import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  cleanupRedisKeys,
  getAuthToken,
  login,
} from './helpers';

describe('Parent Applications (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  let formId: string;
  let applicationId: string;
  let parentUserId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
    parentUserId = (parentLogin.user as { id: string }).id;

    // 0. Create a parent record for the parent user if one doesn't exist
    // This is needed because findByParent looks for a parent record with user_id
    await authPost(
      app,
      '/api/v1/parents',
      ownerToken,
      {
        first_name: 'Test',
        last_name: 'Parent',
        email: AL_NOOR_PARENT_EMAIL,
        phone: '+971501234567',
        preferred_contact_channels: ['email'],
        user_id: parentUserId,
      },
      AL_NOOR_DOMAIN,
    );
    // Ignore errors if parent already exists

    // 1. Create a form definition with at least one field
    const formRes = await authPost(
      app,
      '/api/v1/admission-forms',
      ownerToken,
      {
        name: 'Parent App E2E Form',
        fields: [
          {
            field_key: 'student_name',
            label: 'Student Name',
            field_type: 'short_text',
            required: true,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: false,
            reportable: false,
            display_order: 0,
            active: true,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const formBody = formRes.body.data ?? formRes.body;
    formId = formBody.id;

    // 2. Publish the form
    await authPost(
      app,
      `/api/v1/admission-forms/${formId}/publish`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(201);

    // 3. Create a draft application via public endpoint (no auth)
    const pubRes = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: formId,
        student_first_name: 'Test',
        student_last_name: 'Student',
        payload_json: { student_name: 'Test Student' },
      })
      .expect(201);

    applicationId = pubRes.body.data.id;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);
    await closeTestApp();
  });

  // ── 2.4.1 Submit draft ────────────────────────────────────────────────────────

  it('should submit a draft application', async () => {
    const res = await authPost(
      app,
      `/api/v1/parent/applications/${applicationId}/submit`,
      parentToken,
      {},
      AL_NOOR_DOMAIN,
    );

    expect([200, 201]).toContain(res.status);
    const body = res.body.data ?? res.body;
    expect(body.status).toBe('submitted');
  });

  // ── 2.4.2 List own applications ───────────────────────────────────────────────

  it('should list own applications', async () => {
    const res = await authGet(
      app,
      '/api/v1/parent/applications',
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const data = res.body.data;
    expect(Array.isArray(data)).toBe(true);

    const found = data.find(
      (a: Record<string, unknown>) => a.id === applicationId,
    );
    expect(found).toBeDefined();
  });

  // ── 2.4.3 View own application (internal notes excluded) ──────────────────────

  it('should view own application without internal notes', async () => {
    const res = await authGet(
      app,
      `/api/v1/parent/applications/${applicationId}`,
      parentToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(applicationId);

    // Internal notes must NOT be included in parent view
    if (body.notes && Array.isArray(body.notes)) {
      const internalNotes = body.notes.filter(
        (n: Record<string, unknown>) => n.internal === true,
      );
      expect(internalNotes.length).toBe(0);
    }
  });

  // ── 2.4.4 Withdraw own application ────────────────────────────────────────────

  it('should withdraw own submitted application', async () => {
    // Create a second draft application via public endpoint
    const pub2 = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: formId,
        student_first_name: 'Second',
        student_last_name: 'Child',
        payload_json: { student_name: 'Second Child' },
      })
      .expect(201);

    const app2Id = pub2.body.data.id;

    // Submit the second application
    await authPost(
      app,
      `/api/v1/parent/applications/${app2Id}/submit`,
      parentToken,
      {},
      AL_NOOR_DOMAIN,
    );

    // Withdraw the second application
    const res = await authPost(
      app,
      `/api/v1/parent/applications/${app2Id}/withdraw`,
      parentToken,
      {},
      AL_NOOR_DOMAIN,
    );

    expect([200, 201]).toContain(res.status);
    const body = res.body.data ?? res.body;
    expect(body.status).toBe('withdrawn');
  });

  // ── 2.4.5 No auth ────────────────────────────────────────────────────────────

  it('should return 401 when listing applications without auth', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/parent/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(401);
  });
});
