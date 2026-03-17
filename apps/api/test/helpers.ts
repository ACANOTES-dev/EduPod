/**
 * E2E test helpers for the School Operating System API.
 *
 * Provides login helpers, auth headers, and tenant context for integration tests.
 */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import request from 'supertest';

import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';
import { AppModule } from '../src/app.module';

// ─── Known seed data ───────────────────────────────────────────────────────────

export const PLATFORM_ADMIN_EMAIL = 'admin@edupod.app';
export const AL_NOOR_OWNER_EMAIL = 'owner@alnoor.test';
export const AL_NOOR_ADMIN_EMAIL = 'admin@alnoor.test';
export const AL_NOOR_TEACHER_EMAIL = 'teacher@alnoor.test';
export const AL_NOOR_PARENT_EMAIL = 'parent@alnoor.test';
export const CEDAR_OWNER_EMAIL = 'owner@cedar.test';
export const CEDAR_ADMIN_EMAIL = 'admin@cedar.test';
export const CEDAR_TEACHER_EMAIL = 'teacher@cedar.test';
export const CEDAR_PARENT_EMAIL = 'parent@cedar.test';
export const DEV_PASSWORD = 'Password123!';

export const AL_NOOR_DOMAIN = 'al-noor.edupod.app';
export const CEDAR_DOMAIN = 'cedar.edupod.app';

// ─── App bootstrap ─────────────────────────────────────────────────────────────

let _app: INestApplication | null = null;

export async function createTestApp(): Promise<INestApplication> {
  if (_app) return _app;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.use(cookieParser());
  await app.init();

  // Ensure Redis platform_owner_user_ids set is populated
  await populatePlatformOwnerRedis();

  _app = app;
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (_app) {
    await _app.close();
    _app = null;
  }
}

// ─── Redis helper ──────────────────────────────────────────────────────────────

async function populatePlatformOwnerRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:5554';
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      return Math.min(times * 50, 2000);
    },
  });

  try {
    // Get platform admin user ID from DB via the app
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      const platformUser = await prisma.user.findUnique({
        where: { email: PLATFORM_ADMIN_EMAIL },
      });
      if (platformUser) {
        await client.sadd('platform_owner_user_ids', platformUser.id);
      }
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await client.quit();
  }
}

// ─── Auth helpers ──────────────────────────────────────────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshTokenCookie: string;
  user: Record<string, unknown>;
}

/**
 * Login and return the access token and refresh cookie.
 * For platform admin routes, no tenant_id is needed.
 * For tenant-scoped routes, pass the host header to resolve tenant.
 */
export async function login(
  app: INestApplication,
  email: string,
  password: string = DEV_PASSWORD,
  host?: string,
): Promise<LoginResult> {
  const req = request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });

  if (host) {
    req.set('Host', host);
  }

  const res = await req.expect(200);

  const body = res.body.data ?? res.body;
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  const refreshCookie = cookies?.find((c: string) => c.startsWith('refresh_token=')) ?? '';

  return {
    accessToken: body.access_token,
    refreshTokenCookie: refreshCookie,
    user: body.user,
  };
}

/**
 * Get an authorization header for a user.
 */
export async function getAuthToken(
  app: INestApplication,
  email: string,
  host?: string,
): Promise<string> {
  const result = await login(app, email, DEV_PASSWORD, host);
  return result.accessToken;
}

/**
 * Make an authenticated request helper.
 */
export function authGet(
  app: INestApplication,
  url: string,
  token: string,
  host?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .get(url)
    .set('Authorization', `Bearer ${token}`);

  if (host) req.set('Host', host);
  return req;
}

export function authPost(
  app: INestApplication,
  url: string,
  token: string,
  body: Record<string, unknown>,
  host?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .post(url)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  if (host) req.set('Host', host);
  return req;
}

export function authPatch(
  app: INestApplication,
  url: string,
  token: string,
  body: Record<string, unknown>,
  host?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .patch(url)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  if (host) req.set('Host', host);
  return req;
}

export function authPut(
  app: INestApplication,
  url: string,
  token: string,
  body: Record<string, unknown>,
  host?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .put(url)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

  if (host) req.set('Host', host);
  return req;
}

export function authDelete(
  app: INestApplication,
  url: string,
  token: string,
  host?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .delete(url)
    .set('Authorization', `Bearer ${token}`);

  if (host) req.set('Host', host);
  return req;
}

/**
 * Clean up Redis keys created during tests.
 */
export async function cleanupRedisKeys(patterns: string[]): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:5554';
  const client = new Redis(redisUrl);
  try {
    for (const pattern of patterns) {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  } finally {
    await client.quit();
  }
}
