import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  CEDAR_DOMAIN,
  CEDAR_OWNER_EMAIL,
  cleanupRedisKeys,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from '../helpers';

jest.setTimeout(120_000);

describe('Workflow: Admissions Conversion (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let cedarOwnerToken: string;

  // Artifacts created during the workflow
  let formId: string;
  let publishedFormId: string;
  let applicationId: string;

  // Counter for unique IPs to avoid rate limiting
  let ipCounter = 100;

  // ─── Setup ───────────────────────────────────────────────────────────────

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const cedarLogin = await login(app, CEDAR_OWNER_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN);
    cedarOwnerToken = cedarLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys(['ratelimit:admissions:*']);
    await closeTestApp();
  });

  // ─── Helper: get updated_at for an application ───────────────────────────

  async function getUpdatedAt(appId: string): Promise<string> {
    const res = await authGet(app, `/api/v1/applications/${appId}`, ownerToken, AL_NOOR_DOMAIN);
    const body = res.body.data ?? res.body;
    return body.updated_at;
  }

  // ─── 1. Create and publish an admission form ────────────────────────────

  it('should create an admission form for the conversion workflow', async () => {
    const formRes = await authPost(
      app,
      '/api/v1/admission-forms',
      ownerToken,
      {
        name: `Conversion Workflow Form ${Date.now()}`,
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
    expect(formId).toBeDefined();
  });

  it('should publish the admission form', async () => {
    const publishRes = await authPost(
      app,
      `/api/v1/admission-forms/${formId}/publish`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(201);

    const publishBody = publishRes.body.data ?? publishRes.body;
    publishedFormId = publishBody.id;
    expect(publishedFormId).toBeDefined();
  });

  // ─── 2. Submit an application via public endpoint ───────────────────────

  it('should create a public application with status draft', async () => {
    ipCounter++;
    const pubRes = await request(app.getHttpServer())
      .post('/api/v1/public/admissions/applications')
      .set('Host', AL_NOOR_DOMAIN)
      .set('X-Forwarded-For', `10.1.${Math.floor(ipCounter / 256)}.${ipCounter % 256}`)
      .send({
        form_definition_id: publishedFormId,
        student_first_name: 'Conversion',
        student_last_name: 'Candidate',
        date_of_birth: '2017-09-01',
        payload_json: { student_name: 'Conversion Candidate' },
      })
      .expect(201);

    const pubBody = pubRes.body.data ?? pubRes.body;
    applicationId = pubBody.id;
    expect(applicationId).toBeDefined();
  });

  // ─── 3. Submit the draft via parent endpoint ────────────────────────────

  it('should submit the draft application', async () => {
    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);

    const submitRes = await request(app.getHttpServer())
      .post(`/api/v1/parent/applications/${applicationId}/submit`)
      .set('Host', AL_NOOR_DOMAIN)
      .set('Authorization', `Bearer ${parentLogin.accessToken}`);

    expect([200, 201]).toContain(submitRes.status);
  });

  // ─── 4. Transition: submitted -> under_review ──────────────────────────

  it('should transition application to under_review', async () => {
    const updatedAt = await getUpdatedAt(applicationId);

    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/review`,
      ownerToken,
      {
        status: 'under_review',
        expected_updated_at: updatedAt,
      },
      AL_NOOR_DOMAIN,
    );

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('under_review');
  });

  // ─── 5. Transition: under_review -> accepted ──────────────────────────

  it('should accept the application', async () => {
    const updatedAt = await getUpdatedAt(applicationId);

    const res = await authPost(
      app,
      `/api/v1/applications/${applicationId}/review`,
      ownerToken,
      {
        status: 'pending_acceptance_approval',
        expected_updated_at: updatedAt,
      },
      AL_NOOR_DOMAIN,
    );

    const body = res.body.data ?? res.body;
    // Auto-accept if no approval workflow configured, otherwise pending
    expect(['accepted', 'pending_acceptance_approval']).toContain(body.status);
  });

  // ─── 6. Preview conversion data ──────────────────────────────────────

  it('should return conversion preview for the accepted application', async () => {
    const res = await authGet(
      app,
      `/api/v1/applications/${applicationId}/conversion-preview`,
      ownerToken,
      AL_NOOR_DOMAIN,
    );

    const body = res.body.data ?? res.body;
    expect(body.application).toBeDefined();
    expect(body.application.id).toBe(applicationId);
    expect(body.year_groups).toBeDefined();
    expect(Array.isArray(body.year_groups)).toBe(true);
  });

  // ─── 7. Convert application to student ────────────────────────────────

  it('should convert the accepted application to a student record', async () => {
    const updatedAt = await getUpdatedAt(applicationId);

    // Get year groups for conversion
    const ygRes = await authGet(app, '/api/v1/year-groups', ownerToken, AL_NOOR_DOMAIN);

    const ygBody = ygRes.body.data ?? ygRes.body;
    expect(Array.isArray(ygBody)).toBe(true);
    let yearGroupId = ygBody[0]?.id;
    if (!yearGroupId) {
      const createYgRes = await authPost(
        app,
        '/api/v1/year-groups',
        ownerToken,
        {
          name: `Admissions Workflow Year ${Date.now()}`,
          display_order: 1,
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      const createYgBody = createYgRes.body.data ?? createYgRes.body;
      yearGroupId = createYgBody.id;
    }

    const uniqueEmail = `conversion-parent-${Date.now()}@alnoor.test`;

    const convertRes = await authPost(
      app,
      `/api/v1/applications/${applicationId}/convert`,
      ownerToken,
      {
        student_first_name: 'Conversion',
        student_last_name: 'Student',
        date_of_birth: '2017-09-01',
        year_group_id: yearGroupId,
        national_id: `CONV-NID-${Date.now()}`,
        nationality: 'Irish',
        parent1_first_name: 'Conversion',
        parent1_last_name: 'Parent',
        parent1_email: uniqueEmail,
        expected_updated_at: updatedAt,
      },
      AL_NOOR_DOMAIN,
    );

    expect(convertRes.status).toBe(201);

    const body = convertRes.body.data ?? convertRes.body;

    // Verify student record was created
    expect(body.student).toBeDefined();
    expect(body.student.id).toBeDefined();

    // Verify household was created or linked
    expect(body.household).toBeDefined();
    expect(body.household.id).toBeDefined();

    // Verify parent was created
    expect(body.parent1_id).toBeDefined();

    // Verify the application status is still in a post-acceptance state
    const appRes = await authGet(
      app,
      `/api/v1/applications/${applicationId}`,
      ownerToken,
      AL_NOOR_DOMAIN,
    );

    const appBody = appRes.body.data ?? appRes.body;
    expect(['accepted', 'converted', 'enrolled']).toContain(appBody.status);
  });

  // ─── 8. Cross-tenant isolation ────────────────────────────────────────

  describe('Cross-tenant isolation', () => {
    it('should prevent Cedar admin from seeing Al Noor applications', async () => {
      const res = await authGet(app, '/api/v1/applications', cedarOwnerToken, CEDAR_DOMAIN);

      const body = res.body;
      const applications = body.data ?? [];

      // Cedar should not see Al Noor's application
      const leakedApp = applications.find((a: { id: string }) => a.id === applicationId);
      expect(leakedApp).toBeUndefined();
    });

    it('should return 404 when Cedar tries to access Al Noor application directly', async () => {
      await authGet(
        app,
        `/api/v1/applications/${applicationId}`,
        cedarOwnerToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });
});
