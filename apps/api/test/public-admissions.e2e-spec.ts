import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  CEDAR_DOMAIN,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  authPost,
  getAuthToken,
} from './helpers';

describe('Public Admissions (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let formId: string;
  let requiredFieldKey: string;

  beforeAll(async () => {
    app = await createTestApp();

    ownerToken = await getAuthToken(app, AL_NOOR_OWNER_EMAIL, AL_NOOR_DOMAIN);

    // 1. Create a form definition with a required field + a select field
    const createRes = await authPost(
      app,
      '/api/v1/admission-forms',
      ownerToken,
      {
        name: 'Public E2E Test Form',
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

    const formBody = createRes.body.data ?? createRes.body;
    formId = formBody.id;

    // 2. Publish the form so it's accessible publicly
    await authPost(
      app,
      `/api/v1/admission-forms/${formId}/publish`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(201);
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);
    await closeTestApp();
  });

  // ── 1. Get published form ──────────────────────────────────────────────────

  it('should return the published form with parent-visible fields only', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', AL_NOOR_DOMAIN)
      .expect(200);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.status).toBe('published');
    // Update formId to the actually returned published form
    // (may differ if other tests created published forms)
    formId = body.id;
    // Find the required field key for later tests
    const reqField = body.fields?.find((f: { required: boolean }) => f.required);
    requiredFieldKey = reqField?.field_key ?? 'student_name';
    expect(body.fields).toBeDefined();
    expect(Array.isArray(body.fields)).toBe(true);
    expect(body.fields.length).toBeGreaterThanOrEqual(1);

    // All returned fields should be visible_to_parent
    for (const field of body.fields) {
      expect(field.visible_to_parent).toBe(true);
    }
  });

  // ── 2. Get form — no published form (Cedar tenant) ─────────────────────────

  it('should return 404 when no published form exists for the tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/public/admissions/form')
      .set('Host', CEDAR_DOMAIN)
      .expect(404);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('NO_PUBLISHED_FORM');
  });

  // ── 3. Create draft application ────────────────────────────────────────────

  it('should create a draft application via public endpoint', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: formId,
        student_first_name: 'Public',
        student_last_name: 'Applicant',
        date_of_birth: '2017-09-01',
        payload_json: { [requiredFieldKey]: 'Public Applicant' },
      })
      .expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.application_number).toBeDefined();
    expect(body.status).toBe('draft');
  });

  // ── 4. Create — rate limit exceeded ────────────────────────────────────────

  it('should reject the 4th submission from the same IP within the rate limit window', async () => {
    const payload = {
      form_definition_id: formId,
      student_first_name: 'Rate',
      student_last_name: 'Limited',
      date_of_birth: '2018-01-15',
      payload_json: { [requiredFieldKey]: 'Rate Limited' },
    };

    // Submit 3 times with a controlled IP — all should succeed (limit is 3)
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/public/admissions/applications')
        .set('Host', AL_NOOR_DOMAIN)
        .set('X-Forwarded-For', '10.99.99.99')
        .send(payload)
        .expect(201);
    }

    // 4th submission from same IP should be rate limited
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .set('X-Forwarded-For', '10.99.99.99')
      .send(payload)
      .expect(400);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  // ── 5. Create — honeypot filled ────────────────────────────────────────────

  it('should silently reject when honeypot field is filled', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: formId,
        student_first_name: 'Bot',
        student_last_name: 'Spammer',
        date_of_birth: '2016-05-10',
        payload_json: { student_name: 'Bot Spammer' },
        website_url: 'http://spam.com',
      })
      .expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBe('ignored');
  });

  // ── 6. Create — invalid form ID ───────────────────────────────────────────

  it('should return 404 when form_definition_id does not exist', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: '00000000-0000-0000-0000-000000000000',
        student_first_name: 'No',
        student_last_name: 'Form',
        date_of_birth: '2017-03-20',
        payload_json: { student_name: 'No Form' },
      })
      .expect(404);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('FORM_NOT_FOUND');
  });

  // ── 7. Create — missing required fields in payload ─────────────────────────

  it('should return 400 when required payload fields are missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .send({
        form_definition_id: formId,
        student_first_name: 'Missing',
        student_last_name: 'Fields',
        date_of_birth: '2017-06-15',
        payload_json: {},
      })
      .expect(400);

    const body = res.body;
    expect(body.error?.code ?? body.code).toBe('VALIDATION_ERROR');
  });
});
