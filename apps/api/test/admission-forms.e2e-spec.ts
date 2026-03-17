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
  authPut,
  getAuthToken,
  login,
} from './helpers';

describe('Admission Forms (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let parentToken: string;

  // Populated during tests
  let formId: string;
  let formUpdatedAt: string;
  let newFormId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    parentToken = await getAuthToken(app, AL_NOOR_PARENT_EMAIL, AL_NOOR_DOMAIN);
  }, 60_000);

  afterAll(async () => {
    await closeTestApp();
  });

  // ── 1. Create form — happy path ──────────────────────────────────────────────

  it('should create an admission form with fields', async () => {
    const res = await authPost(
      app,
      '/api/v1/admission-forms',
      ownerToken,
      {
        name: 'E2E Test Form',
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
          {
            field_key: 'grade_preference',
            label: 'Grade Preference',
            field_type: 'single_select',
            required: false,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: false,
            reportable: false,
            options_json: [
              { value: 'g1', label: 'Grade 1' },
              { value: 'g2', label: 'Grade 2' },
            ],
            display_order: 1,
            active: true,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.name).toBe('E2E Test Form');
    expect(body.fields).toBeDefined();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBe(2);

    formId = body.id;
    formUpdatedAt = body.updated_at;
  });

  // ── 2. Create form — no auth ─────────────────────────────────────────────────

  it('should return 401 when creating a form without auth', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admission-forms')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        name: 'Unauthorized Form',
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
      })
      .expect(401);
  });

  // ── 3. Create form — no permission ───────────────────────────────────────────

  it('should return 403 when parent tries to create a form', async () => {
    await authPost(
      app,
      '/api/v1/admission-forms',
      parentToken,
      {
        name: 'Parent Form',
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
    ).expect(403);
  });

  // ── 4. List forms ────────────────────────────────────────────────────────────

  it('should list admission forms with pagination meta', async () => {
    const res = await authGet(
      app,
      '/api/v1/admission-forms',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  // ── 5. Get form detail ───────────────────────────────────────────────────────

  it('should get form detail with fields array', async () => {
    expect(formId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/admission-forms/${formId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe(formId);
    expect(body.name).toBe('E2E Test Form');
    expect(body.fields).toBeDefined();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBe(2);
  });

  // ── 6. Update draft form ─────────────────────────────────────────────────────

  it('should update a draft form name and fields', async () => {
    expect(formId).toBeDefined();
    expect(formUpdatedAt).toBeDefined();

    const res = await authPut(
      app,
      `/api/v1/admission-forms/${formId}`,
      ownerToken,
      {
        name: 'E2E Test Form Updated',
        expected_updated_at: formUpdatedAt,
        fields: [
          {
            field_key: 'student_name',
            label: 'Student Full Name',
            field_type: 'short_text',
            required: true,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: false,
            reportable: false,
            display_order: 0,
            active: true,
          },
          {
            field_key: 'grade_preference',
            label: 'Grade Preference',
            field_type: 'single_select',
            required: false,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: false,
            reportable: false,
            options_json: [
              { value: 'g1', label: 'Grade 1' },
              { value: 'g2', label: 'Grade 2' },
            ],
            display_order: 1,
            active: true,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.name).toBe('E2E Test Form Updated');

    // Update the stored updated_at for subsequent requests
    formUpdatedAt = body.updated_at;
  });

  // ── 7. Publish form ──────────────────────────────────────────────────────────

  it('should publish a draft form', async () => {
    expect(formId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/admission-forms/${formId}/publish`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    );

    // Publish may return 200 or 201 depending on NestJS default
    expect([200, 201]).toContain(res.status);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('published');

    // Capture updated_at after publish
    formUpdatedAt = body.updated_at;
  });

  // ── 8. Update published form (creates new version) ───────────────────────────

  it('should create a new version when updating a published form', async () => {
    expect(formId).toBeDefined();
    expect(formUpdatedAt).toBeDefined();

    const res = await authPut(
      app,
      `/api/v1/admission-forms/${formId}`,
      ownerToken,
      {
        name: 'E2E Test Form V2',
        expected_updated_at: formUpdatedAt,
        fields: [
          {
            field_key: 'student_name',
            label: 'Student Full Name',
            field_type: 'short_text',
            required: true,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: true,
            reportable: false,
            display_order: 0,
            active: true,
          },
          {
            field_key: 'grade_preference',
            label: 'Grade Preference',
            field_type: 'single_select',
            required: false,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: false,
            reportable: false,
            options_json: [
              { value: 'g1', label: 'Grade 1' },
              { value: 'g2', label: 'Grade 2' },
              { value: 'g3', label: 'Grade 3' },
            ],
            display_order: 1,
            active: true,
          },
        ],
      },
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.id).not.toBe(formId);
    expect(body.version_number).toBeGreaterThan(1);

    newFormId = body.id;
  });

  // ── 9. Archive form ──────────────────────────────────────────────────────────

  it('should archive the new draft version', async () => {
    expect(newFormId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/admission-forms/${newFormId}/archive`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    );

    expect([200, 201]).toContain(res.status);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('archived');
  });

  // ── 10. Get versions ─────────────────────────────────────────────────────────

  it('should list versions for the form', async () => {
    expect(formId).toBeDefined();

    const res = await authGet(
      app,
      `/api/v1/admission-forms/${formId}/versions`,
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  // ── 11. Not found ────────────────────────────────────────────────────────────

  it('should return 404 for a non-existent form', async () => {
    await authGet(
      app,
      '/api/v1/admission-forms/00000000-0000-0000-0000-000000000000',
      ownerToken,
      AL_NOOR_DOMAIN,
    ).expect(404);
  });
});
