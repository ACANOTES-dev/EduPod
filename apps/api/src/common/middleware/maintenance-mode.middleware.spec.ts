import type { NextFunction, Request, Response } from 'express';

import type { TenantContext } from '@school/shared';

import type { RedisService } from '../../modules/redis/redis.service';

import { MaintenanceModeMiddleware } from './maintenance-mode.middleware';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_CONTEXT: TenantContext = {
  default_locale: 'en',
  name: 'Cedar School',
  slug: 'cedar',
  status: 'active',
  tenant_id: TENANT_ID,
  timezone: 'Europe/Dublin',
};

interface TenantRequest extends Request {
  tenantContext?: TenantContext | null;
}

function buildRequest(
  method: string,
  originalUrl: string,
  tenantContext: TenantContext | null = TENANT_CONTEXT,
): TenantRequest {
  return {
    method,
    originalUrl,
    tenantContext,
  } as TenantRequest;
}

function buildResponse(): Response & {
  body?: unknown;
  statusCode?: number;
  status: jest.Mock;
  json: jest.Mock;
} {
  const response = {
    status: jest.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: jest.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };

  return response as Response & {
    body?: unknown;
    statusCode?: number;
    status: jest.Mock;
    json: jest.Mock;
  };
}

function buildRedisService(value: string | null, rejectWith?: Error): RedisService {
  return {
    getClient: jest.fn(() => ({
      get: rejectWith
        ? jest.fn().mockRejectedValue(rejectWith)
        : jest.fn().mockResolvedValue(value),
    })),
  } as Pick<RedisService, 'getClient'> as RedisService;
}

function buildNext(): { next: NextFunction; nextSpy: jest.Mock } {
  const nextSpy = jest.fn();
  const next: NextFunction = (deferToNext?: 'router' | 'route') => {
    nextSpy(deferToNext);
  };

  return { next, nextSpy };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MaintenanceModeMiddleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows GET requests during maintenance', async () => {
    const middleware = new MaintenanceModeMiddleware(
      buildRedisService(JSON.stringify({ message: 'Short pause' })),
    );
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(buildRequest('GET', '/api/v1/students'), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns 503 for tenant mutations during maintenance', async () => {
    const middleware = new MaintenanceModeMiddleware(
      buildRedisService(JSON.stringify({ message: 'Short pause' })),
    );
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(buildRequest('POST', '/api/v1/students'), response, next);

    expect(nextSpy).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'MAINTENANCE_MODE',
        message: 'Short pause',
      },
    });
  });

  it('allows platform admin mutations during maintenance', async () => {
    const middleware = new MaintenanceModeMiddleware(
      buildRedisService(JSON.stringify({ message: 'Short pause' })),
    );
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(
      buildRequest('PATCH', '/api/v1/admin/tenants/id/maintenance'),
      response,
      next,
    );

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('allows non-tenant requests', async () => {
    const middleware = new MaintenanceModeMiddleware(
      buildRedisService(JSON.stringify({ message: 'Short pause' })),
    );
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(buildRequest('POST', '/api/v1/auth/login', null), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('allows tenants that are not in maintenance mode', async () => {
    const middleware = new MaintenanceModeMiddleware(buildRedisService(null));
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(buildRequest('DELETE', '/api/v1/classes/class-id'), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('allows requests to continue when Redis is unavailable', async () => {
    const middleware = new MaintenanceModeMiddleware(
      buildRedisService(null, new Error('redis down')),
    );
    const response = buildResponse();
    const { next, nextSpy } = buildNext();

    await middleware.use(buildRequest('POST', '/api/v1/students'), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });
});
