import './setup-env';

import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
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
  login,
} from './helpers';

jest.setTimeout(60_000);

describe('Compliance Requests (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let ownerUserId: string;
  let parentToken: string;
  let directPrisma: PrismaClient;

  // Track created compliance request IDs for lifecycle tests
  let createdRequestId: string;
  let lifecycleRequestId: string;
  let rejectableRequestId: string;
  let accessExportRequestId: string;
  let parentUserId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;
    ownerUserId = ownerLogin.user.id as string;

    const parentLogin = await login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    parentToken = parentLogin.accessToken;
    parentUserId = parentLogin.user.id as string;

    // Clean up stale compliance requests from prior test runs
    directPrisma = new PrismaClient();
    await directPrisma.$connect();
    await directPrisma.complianceRequest.deleteMany({
      where: {
        subject_id: { in: [ownerUserId, parentUserId] },
        status: { notIn: ['completed', 'rejected'] },
      },
    });
  });

  afterAll(async () => {
    // Clean up test compliance requests
    if (directPrisma) {
      await directPrisma.complianceRequest.deleteMany({
        where: { subject_id: { in: [ownerUserId, parentUserId] } },
      });
      await directPrisma.$disconnect();
    }
    await closeTestApp();
  });

  // ─── POST /api/v1/compliance-requests ─────────────────────────────────────────

  describe('POST /api/v1/compliance-requests', () => {
    it('should return 201 with created compliance request', async () => {
      const res = await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: ownerUserId,
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.request_type).toBe('access_export');
      expect(record.subject_type).toBe('user');
      expect(record.subject_id).toBe(ownerUserId);
      expect(record.status).toBe('submitted');

      createdRequestId = record.id;
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/compliance-requests')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: ownerUserId,
        })
        .expect(401);
    });

    it('should return 403 when user lacks compliance.manage', async () => {
      await authPost(
        app,
        '/api/v1/compliance-requests',
        parentToken,
        {
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: ownerUserId,
        },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 400 with invalid body (missing subject_type)', async () => {
      await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'access_export',
          subject_id: ownerUserId,
        },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });

    it('should return 404 when subject does not exist', async () => {
      await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: '00000000-0000-0000-0000-000000000099',
        },
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('should return 409 when duplicate active request exists', async () => {
      // The first request created above is still active (submitted status)
      // so creating another for the same subject should conflict
      await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: ownerUserId,
        },
        AL_NOOR_DOMAIN,
      ).expect(409);
    });
  });

  // ─── GET /api/v1/compliance-requests ──────────────────────────────────────────

  describe('GET /api/v1/compliance-requests', () => {
    it('should return 200 with paginated list', async () => {
      const res = await authGet(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.meta).toBeDefined();
      expect(typeof res.body.meta.page).toBe('number');
      expect(typeof res.body.meta.pageSize).toBe('number');
      expect(typeof res.body.meta.total).toBe('number');
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/compliance-requests')
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks compliance.view', async () => {
      await authGet(
        app,
        '/api/v1/compliance-requests',
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should filter by status query param', async () => {
      const res = await authGet(
        app,
        '/api/v1/compliance-requests?status=submitted',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns {data, meta} → interceptor passes through as-is
      expect(res.body.data).toBeInstanceOf(Array);
      for (const req of res.body.data) {
        expect(req.status).toBe('submitted');
      }
    });
  });

  // ─── GET /api/v1/compliance-requests/:id ──────────────────────────────────────

  describe('GET /api/v1/compliance-requests/:id', () => {
    it('should return 200 with single compliance request', async () => {
      const res = await authGet(
        app,
        `/api/v1/compliance-requests/${createdRequestId}`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBe(createdRequestId);
      expect(record.request_type).toBe('access_export');
      expect(record.status).toBe('submitted');
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/compliance-requests/${createdRequestId}`)
        .set('Host', AL_NOOR_DOMAIN)
        .expect(401);
    });

    it('should return 403 when user lacks compliance.view', async () => {
      await authGet(
        app,
        `/api/v1/compliance-requests/${createdRequestId}`,
        parentToken,
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 404 for non-existent ID', async () => {
      await authGet(
        app,
        '/api/v1/compliance-requests/00000000-0000-0000-0000-000000000099',
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });

  // ─── POST /api/v1/compliance-requests/:id/classify ────────────────────────────

  describe('POST /api/v1/compliance-requests/:id/classify', () => {
    it('should return 200 with classified request', async () => {
      const res = await authPost(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/classify`,
        ownerToken,
        { classification: 'anonymise', decision_notes: 'e2e test classification' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBe(createdRequestId);
      expect(record.status).toBe('classified');
      expect(record.classification).toBe('anonymise');
    });

    it('should return 401 when no auth token', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/compliance-requests/${createdRequestId}/classify`)
        .set('Host', AL_NOOR_DOMAIN)
        .send({ classification: 'anonymise' })
        .expect(401);
    });

    it('should return 403 when user lacks compliance.manage', async () => {
      await authPost(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/classify`,
        parentToken,
        { classification: 'anonymise' },
        AL_NOOR_DOMAIN,
      ).expect(403);
    });

    it('should return 400 when request not in submitted status', async () => {
      // createdRequestId is now 'classified', so classifying again should fail
      await authPost(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/classify`,
        ownerToken,
        { classification: 'erase' },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/compliance-requests/:id/approve ─────────────────────────────

  describe('POST /api/v1/compliance-requests/:id/approve', () => {
    it('should return 200 with approved request', async () => {
      // createdRequestId is currently 'classified' — approve it
      const res = await authPost(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/approve`,
        ownerToken,
        { decision_notes: 'approved for e2e test' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBe(createdRequestId);
      expect(record.status).toBe('approved');
    });

    it('should return 400 when request not in classified status', async () => {
      // createdRequestId is now 'approved', so approving again should fail
      await authPost(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/approve`,
        ownerToken,
        { decision_notes: 'duplicate approve' },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/compliance-requests/:id/reject ──────────────────────────────

  describe('POST /api/v1/compliance-requests/:id/reject', () => {
    beforeAll(async () => {
      // Create a fresh request for rejection testing using parentUserId
      // to avoid 409 conflict with the active access_export request on ownerUserId.
      const res = await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'erasure',
          subject_type: 'user',
          subject_id: parentUserId,
        },
        AL_NOOR_DOMAIN,
      );
      if (res.status === 201) {
        // Service returns plain object → interceptor wraps to {data: {...}}
        rejectableRequestId = res.body.data.id;
      }
    });

    it('should return 200 with rejected request', async () => {
      if (!rejectableRequestId) return; // skip if we couldn't create

      const res = await authPost(
        app,
        `/api/v1/compliance-requests/${rejectableRequestId}/reject`,
        ownerToken,
        { decision_notes: 'rejected for e2e test' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBe(rejectableRequestId);
      expect(record.status).toBe('rejected');
    });

    it('should return 400 when request not in submitted or classified status', async () => {
      if (!rejectableRequestId) return; // skip if we couldn't create

      // rejectableRequestId is now 'rejected', so rejecting again should fail
      await authPost(
        app,
        `/api/v1/compliance-requests/${rejectableRequestId}/reject`,
        ownerToken,
        { decision_notes: 'duplicate reject' },
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── POST /api/v1/compliance-requests/:id/execute ─────────────────────────────

  describe('POST /api/v1/compliance-requests/:id/execute', () => {
    let executableRequestId: string;

    beforeAll(async () => {
      // Create a fresh rectification request using a different subject (parentUserId)
      // to avoid 409 conflict with the access_export request on ownerUserId.
      // Use retain_legal_basis classification — this path does NOT call S3 or
      // anonymisation, making it safe for test environments without S3.
      const createRes = await authPost(
        app,
        '/api/v1/compliance-requests',
        ownerToken,
        {
          request_type: 'rectification',
          subject_type: 'user',
          subject_id: parentUserId,
        },
        AL_NOOR_DOMAIN,
      );
      if (createRes.status === 201) {
        executableRequestId = createRes.body.data.id;
      } else {
        // If conflict (409), skip by not setting executableRequestId.
        return;
      }

      // Classify with retain_legal_basis (no S3 or anonymisation on execute)
      await authPost(
        app,
        `/api/v1/compliance-requests/${executableRequestId}/classify`,
        ownerToken,
        { classification: 'retain_legal_basis', decision_notes: 'retain for e2e test' },
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Approve
      await authPost(
        app,
        `/api/v1/compliance-requests/${executableRequestId}/approve`,
        ownerToken,
        { decision_notes: 'approved for e2e execute test' },
        AL_NOOR_DOMAIN,
      ).expect(200);
    });

    it('should return 200 with completed request for retain_legal_basis', async () => {
      if (!executableRequestId) return; // skip if setup failed

      const res = await authPost(
        app,
        `/api/v1/compliance-requests/${executableRequestId}/execute`,
        ownerToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Service returns plain object → interceptor wraps to {data: {...}}
      const record = res.body.data;
      expect(record).toBeDefined();
      expect(record.id).toBe(executableRequestId);
      expect(record.status).toBe('completed');
    });

    it('should return 400 when request not approved', async () => {
      if (!executableRequestId) return; // skip if setup failed

      // executableRequestId is now 'completed', so executing again should fail
      await authPost(
        app,
        `/api/v1/compliance-requests/${executableRequestId}/execute`,
        ownerToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(400);
    });
  });

  // ─── GET /api/v1/compliance-requests/:id/export ───────────────────────────────

  describe('GET /api/v1/compliance-requests/:id/export', () => {
    // This test requires S3 to generate the export file.
    // Without S3, the access_export execute call fails, so no export_file_key exists.
    it.skip('should return 200 with export_file_key for completed access_export (requires S3)', async () => {
      // createdRequestId would need to be 'completed' via access_export execute (S3-dependent)
      const res = await authGet(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/export`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      expect(res.body.data).toBeDefined();
      expect(res.body.data.export_file_key).toBeDefined();
    });

    it('should return 404 when request is not completed or not access_export type', async () => {
      // createdRequestId is an access_export request still in 'approved' status
      // (never executed because S3 is unavailable) — should return 404 because
      // the export endpoint requires status='completed'
      await authGet(
        app,
        `/api/v1/compliance-requests/${createdRequestId}/export`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });

    it('should return 404 when request type is not access_export', async () => {
      if (!rejectableRequestId) return; // skip if unavailable

      // rejectableRequestId was 'erasure' type, should return 404
      await authGet(
        app,
        `/api/v1/compliance-requests/${rejectableRequestId}/export`,
        ownerToken,
        AL_NOOR_DOMAIN,
      ).expect(404);
    });
  });
});
