import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  AL_NOOR_DOMAIN,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_TEACHER_EMAIL,
  closeTestApp,
  createTestApp,
  DEV_PASSWORD,
  authGet,
  authPost,
  login,
} from './helpers';

describe('Invitations (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let teacherToken: string;

  // Populated during tests
  let createdInvitationId: string;
  let staffRoleId: string;

  beforeAll(async () => {
    app = await createTestApp();

    const ownerLogin = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    ownerToken = ownerLogin.accessToken;

    const teacherLogin = await login(app, AL_NOOR_TEACHER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
    teacherToken = teacherLogin.accessToken;

    // Resolve a valid role_id to use in invitation tests — use the teacher system role
    const rolesRes = await authGet(app, '/api/v1/roles', ownerToken, AL_NOOR_DOMAIN).expect(200);
    const teacherRole = rolesRes.body.data.find(
      (r: { role_key: string }) => r.role_key === 'teacher',
    );
    expect(teacherRole).toBeDefined();
    staffRoleId = teacherRole.id;
  });

  afterAll(async () => {
    await closeTestApp();
  });

  it('should create invitation', async () => {
    const uniqueEmail = `test-invite-${Date.now()}@test.com`;

    const res = await authPost(
      app,
      '/api/v1/invitations',
      ownerToken,
      {
        email: uniqueEmail,
        role_ids: [staffRoleId],
      },
      AL_NOOR_DOMAIN,
    ).expect(201);

    const body = res.body.data ?? res.body;
    expect(body.id).toBeDefined();
    expect(body.email).toBe(uniqueEmail);
    expect(body.status).toBe('pending');

    createdInvitationId = body.id;
  });

  it('should list invitations', async () => {
    const res = await authGet(app, '/api/v1/invitations', ownerToken, AL_NOOR_DOMAIN).expect(200);

    const body = res.body.data ?? res.body;
    expect(Array.isArray(body)).toBe(true);
    // The invitation we just created should be in the list
    if (createdInvitationId) {
      const found = body.find((inv: { id: string }) => inv.id === createdInvitationId);
      expect(found).toBeDefined();
    }
  });

  it('should revoke invitation', async () => {
    expect(createdInvitationId).toBeDefined();

    const res = await authPost(
      app,
      `/api/v1/invitations/${createdInvitationId}/revoke`,
      ownerToken,
      {},
      AL_NOOR_DOMAIN,
    ).expect(200);

    const body = res.body.data ?? res.body;
    expect(body.status).toBe('revoked');
  });

  it.todo('should accept invitation for existing user — requires token extraction from creation flow');

  it.todo('should accept invitation for new user — requires actual invitation token from creation response');

  it.todo('should reject expired invitation — requires time manipulation or dedicated expired seed');

  it('should reject without users.invite permission', async () => {
    const uniqueEmail = `test-invite-noperm-${Date.now()}@test.com`;

    await authPost(
      app,
      '/api/v1/invitations',
      teacherToken,
      {
        email: uniqueEmail,
        role_ids: [staffRoleId],
      },
      AL_NOOR_DOMAIN,
    ).expect(403);
  });

  it('should allow public accept endpoint without auth token', async () => {
    // The accept endpoint is public. Passing a bogus token should return 400 (bad token),
    // not 401 (unauthenticated). This verifies the endpoint is reachable without a Bearer token.
    const res = await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .set('Host', AL_NOOR_DOMAIN)
      .send({ token: 'not-a-real-token' })
      .expect((r) => {
        // 400 means the request reached the handler (bad token), not 401 (auth guard rejected it)
        expect(r.status).not.toBe(401);
      });

    // Status should be 4xx (bad token) but NOT 401
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
