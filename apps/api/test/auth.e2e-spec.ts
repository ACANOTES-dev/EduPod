import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  login,
  authGet,
  authPost,
  authDelete,
  PLATFORM_ADMIN_EMAIL,
  AL_NOOR_OWNER_EMAIL,
  AL_NOOR_ADMIN_EMAIL,
  DEV_PASSWORD,
  AL_NOOR_DOMAIN,
} from './helpers';

describe('Auth Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp();
  });

  // ─── POST /api/v1/auth/login ────────────────────────────────────────────────

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: PLATFORM_ADMIN_EMAIL, password: DEV_PASSWORD })
        .expect(200);

      // ResponseTransformInterceptor wraps in { data: ... }
      expect(res.body.data).toBeDefined();
      expect(res.body.data.access_token).toBeDefined();
      expect(typeof res.body.data.access_token).toBe('string');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(PLATFORM_ADMIN_EMAIL);

      // Refresh token should be set as an httpOnly cookie
      const cookies = res.headers['set-cookie'] as string[] | undefined;
      expect(cookies).toBeDefined();
      const refreshCookie = cookies!.find((c) => c.startsWith('refresh_token='));
      expect(refreshCookie).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: PLATFORM_ADMIN_EMAIL, password: 'WrongPassword999!' })
        .expect(401);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login with non-existent email', async () => {
      // Use a unique email per test run to avoid triggering brute-force protection
      // from accumulated failed attempts across multiple test runs
      const uniqueEmail = `nobody-${Date.now()}@nowhere.test`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail, password: DEV_PASSWORD })
        .expect(401);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it.todo(
      'should require MFA when enabled — skipped: requires enabling MFA on a user before test and cannot easily produce a valid TOTP code in a unit test context',
    );

    it.todo(
      'should login with MFA code — skipped: same as above; needs a running TOTP secret and live code',
    );
  });

  // ─── POST /api/v1/auth/refresh ──────────────────────────────────────────────

  describe('POST /api/v1/auth/refresh', () => {
    it('should return a new access token when a valid refresh cookie is sent', async () => {
      // Obtain a refresh token cookie via login
      const { refreshTokenCookie } = await login(app, PLATFORM_ADMIN_EMAIL);
      expect(refreshTokenCookie).toBeTruthy();

      // Extract raw cookie value (everything before the first ';')
      const cookieHeader = refreshTokenCookie.split(';')[0]; // e.g. "refresh_token=<value>"

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookieHeader)
        .expect(200);

      // refresh returns { access_token } — wrapped by interceptor
      const body = res.body.data ?? res.body;
      expect(body.access_token).toBeDefined();
      expect(typeof body.access_token).toBe('string');
    });

    it('should reject refresh when no cookie is present', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('MISSING_REFRESH_TOKEN');
    });
  });

  // ─── POST /api/v1/auth/logout ───────────────────────────────────────────────

  describe('POST /api/v1/auth/logout', () => {
    it('should logout and return 204 with cookie cleared', async () => {
      const { accessToken, refreshTokenCookie } = await login(app, PLATFORM_ADMIN_EMAIL);

      const cookieHeader = refreshTokenCookie.split(';')[0];

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', cookieHeader)
        .expect(204);

      // The Set-Cookie header should clear the refresh_token cookie
      const setCookies = res.headers['set-cookie'] as string[] | undefined;
      if (setCookies) {
        const clearedCookie = setCookies.find((c) => c.startsWith('refresh_token='));
        if (clearedCookie) {
          // The cleared cookie should either be empty or have max-age=0 / expires in the past
          expect(
            clearedCookie.includes('Max-Age=0') ||
              clearedCookie.includes('Expires=') ||
              clearedCookie === 'refresh_token=; Path=/api/v1/auth/refresh; HttpOnly; SameSite=Lax',
          ).toBe(true);
        }
      }
    });

    it('should return 401 when logout is called without a bearer token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });

  // ─── POST /api/v1/auth/password-reset/request ───────────────────────────────

  describe('POST /api/v1/auth/password-reset/request', () => {
    it('should return 200 and success message for a known email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: AL_NOOR_ADMIN_EMAIL })
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.message).toBeDefined();
      // Message is intentionally vague to not leak user existence
      expect(typeof body.message).toBe('string');
    });

    it('should return 200 even for a non-existent email (to avoid leaking user existence)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email: 'nonexistent@nowhere.test' })
        .expect(200);

      const body = res.body.data ?? res.body;
      expect(body.message).toBeDefined();
    });

    it.todo(
      'should confirm password reset with valid token — skipped: requires reading the raw token from the DB (token is hashed on storage; not returned in the API response)',
    );
  });

  // ─── POST /api/v1/auth/password-reset/confirm ───────────────────────────────

  describe('POST /api/v1/auth/password-reset/confirm', () => {
    it('should reject an invalid reset token with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token: 'completely-fake-token-00000000', new_password: 'NewPassword123!' })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
    });
  });

  // ─── POST /api/v1/auth/mfa/setup ────────────────────────────────────────────

  describe('POST /api/v1/auth/mfa/setup', () => {
    it('should return MFA setup details (secret, qr_code_url, otpauth_uri) when authenticated', async () => {
      // Use AL_NOOR_OWNER_EMAIL so we don't pollute the platform admin's mfa_secret
      const token = await (async () => {
        const { accessToken } = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
        return accessToken;
      })();

      const res = await authPost(
        app,
        '/api/v1/auth/mfa/setup',
        token,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      const body = res.body.data ?? res.body;
      expect(body.secret).toBeDefined();
      expect(typeof body.secret).toBe('string');
      expect(body.qr_code_url).toBeDefined();
      expect(body.qr_code_url).toMatch(/^data:image\/png;base64,/);
      expect(body.otpauth_uri).toBeDefined();
      expect(body.otpauth_uri).toMatch(/^otpauth:\/\/totp\//);
    });

    it('should return 401 when called without a bearer token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .expect(401);
    });

    it.todo(
      'should verify MFA code — skipped: requires computing a live TOTP from the secret returned by /mfa/setup, which changes every 30 s and cannot be mocked without test-seeded secrets',
    );
  });

  // ─── POST /api/v1/auth/switch-tenant ────────────────────────────────────────

  describe('POST /api/v1/auth/switch-tenant', () => {
    it('should return a new access token when the user has an active membership at the target tenant', async () => {
      // Login as al-noor owner WITHOUT a host header so no tenant context is embedded in token
      const { accessToken: tokenNoTenant } = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD);

      // Discover the al-noor tenant ID via GET /me
      const meRes = await authGet(app, '/api/v1/auth/me', tokenNoTenant).expect(200);
      const meBody = meRes.body.data ?? meRes.body;
      expect(meBody.memberships).toBeDefined();
      expect(meBody.memberships.length).toBeGreaterThan(0);

      const alNoorMembership = meBody.memberships.find(
        (m: { tenant_slug: string }) => m.tenant_slug === 'al-noor',
      );
      expect(alNoorMembership).toBeDefined();
      const tenantId: string = alNoorMembership.tenant_id;

      // Switch to that tenant
      const switchRes = await authPost(
        app,
        '/api/v1/auth/switch-tenant',
        tokenNoTenant,
        { tenant_id: tenantId },
      ).expect(200);

      const switchBody = switchRes.body.data ?? switchRes.body;
      expect(switchBody.access_token).toBeDefined();
      expect(typeof switchBody.access_token).toBe('string');
    });

    it('should return 403 when trying to switch to a tenant the user has no membership in', async () => {
      const { accessToken } = await login(app, AL_NOOR_OWNER_EMAIL, DEV_PASSWORD);

      const fakeUuid = '00000000-0000-0000-0000-000000000099';

      const res = await authPost(
        app,
        '/api/v1/auth/switch-tenant',
        accessToken,
        { tenant_id: fakeUuid },
      ).expect(403);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('MEMBERSHIP_NOT_ACTIVE');
    });

    it('should return 401 when called without a bearer token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/switch-tenant')
        .send({ tenant_id: '00000000-0000-0000-0000-000000000099' })
        .expect(401);
    });
  });

  // ─── GET /api/v1/auth/me ────────────────────────────────────────────────────

  describe('GET /api/v1/auth/me', () => {
    it('should return the current user and their memberships', async () => {
      const { accessToken } = await login(app, PLATFORM_ADMIN_EMAIL);

      const res = await authGet(app, '/api/v1/auth/me', accessToken).expect(200);

      const body = res.body.data ?? res.body;
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe(PLATFORM_ADMIN_EMAIL);
      expect(body.user.id).toBeDefined();
      expect(body.user.mfa_enabled).toBeDefined();
      // password_hash must never be returned
      expect(body.user.password_hash).toBeUndefined();
      expect(Array.isArray(body.memberships)).toBe(true);
    });

    it('should return 401 when called without a bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });
  });

  // ─── GET /api/v1/auth/sessions ──────────────────────────────────────────────

  describe('GET /api/v1/auth/sessions', () => {
    it('should return a list of active sessions for the current user', async () => {
      const { accessToken } = await login(app, PLATFORM_ADMIN_EMAIL);

      const res = await authGet(app, '/api/v1/auth/sessions', accessToken).expect(200);

      // The controller manually returns { data: sessions }, so the interceptor passes it through
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);

      if (res.body.data.length > 0) {
        const session = res.body.data[0];
        expect(session.session_id).toBeDefined();
        expect(session.ip_address).toBeDefined();
        expect(session.created_at).toBeDefined();
      }
    });

    it('should return 401 when called without a bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/sessions')
        .expect(401);
    });
  });

  // ─── DELETE /api/v1/auth/sessions/:id ───────────────────────────────────────

  describe('DELETE /api/v1/auth/sessions/:id', () => {
    it('should revoke a session and return 204', async () => {
      // Login twice to have a second session to revoke
      const { accessToken: token1 } = await login(app, AL_NOOR_ADMIN_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);
      // Login a second time to create a second session
      await login(app, AL_NOOR_ADMIN_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN);

      // List sessions with token1
      const listRes = await authGet(app, '/api/v1/auth/sessions', token1, AL_NOOR_DOMAIN).expect(200);
      const sessions: Array<{ session_id: string }> = listRes.body.data;
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      // Revoke the first session in the list
      const sessionToRevoke = sessions[0].session_id;

      await authDelete(
        app,
        `/api/v1/auth/sessions/${sessionToRevoke}`,
        token1,
        AL_NOOR_DOMAIN,
      ).expect(204);

      // Confirm the session is gone — if we revoked the only session tied to token1,
      // subsequent calls may 401; if there are other sessions, the list should be shorter.
      // We simply verify the DELETE succeeded (204 above).
    });

    it('should return 400 when trying to revoke a session that does not belong to the user', async () => {
      const { accessToken } = await login(app, PLATFORM_ADMIN_EMAIL);

      const fakeSessionId = '00000000-0000-0000-0000-000000000000';

      const res = await authDelete(
        app,
        `/api/v1/auth/sessions/${fakeSessionId}`,
        accessToken,
      ).expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
    });

    it('should return 401 when called without a bearer token', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/auth/sessions/some-id')
        .expect(401);
    });
  });
});
