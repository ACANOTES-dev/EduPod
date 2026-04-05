import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import type { TenantContext } from '@school/shared';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

import { runWithRlsContext } from './rls.middleware';
import { TenantResolutionMiddleware } from './tenant-resolution.middleware';

jest.mock('./rls.middleware', () => ({
  runWithRlsContext: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

const TENANT_CONTEXT: TenantContext = {
  tenant_id: 'tenant-1',
  slug: 'st-brigid',
  name: 'St Brigid',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const ACTIVE_DOMAIN_RECORD = {
  tenant: {
    id: TENANT_CONTEXT.tenant_id,
    slug: TENANT_CONTEXT.slug,
    name: TENANT_CONTEXT.name,
    status: TENANT_CONTEXT.status,
    default_locale: TENANT_CONTEXT.default_locale,
    timezone: TENANT_CONTEXT.timezone,
  },
};

function buildRequest(
  overrides: Partial<Request> & {
    headers?: Record<string, string | undefined>;
  } = {},
): Request & { tenantContext?: TenantContext | null } {
  return {
    originalUrl: '/api/v1/students',
    hostname: 'school.example.com',
    headers: {},
    ...overrides,
  } as Request & { tenantContext?: TenantContext | null };
}

function buildResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
  };
}

describe('TenantResolutionMiddleware', () => {
  let middleware: TenantResolutionMiddleware;
  let mockPrisma: {
    tenant: { findUnique: jest.Mock };
  };
  let mockRedisClient: {
    get: jest.Mock;
    set: jest.Mock;
    setex: jest.Mock;
  };
  let mockRedisService: { getClient: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockPrisma = {
      tenant: { findUnique: jest.fn() },
    };

    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, fallback?: string) => {
        if (key === 'PLATFORM_DOMAIN') return 'edupod.app';
        if (key === 'JWT_SECRET') return 'test-secret';
        return fallback;
      }),
    };

    middleware = new TenantResolutionMiddleware(
      mockPrisma as unknown as PrismaService,
      mockRedisService as unknown as RedisService,
      mockConfigService as unknown as ConfigService,
    );

    next = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips tenant resolution for admin routes', async () => {
    const req = buildRequest({ originalUrl: '/api/v1/admin/tenants' });
    const res = buildResponse();

    await middleware.use(req, res, next);

    expect(req.tenantContext).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockRedisService.getClient).not.toHaveBeenCalled();
  });

  it('skips invitation acceptance routes', async () => {
    const req = buildRequest({ originalUrl: '/api/v1/invitations/accept/token' });
    const res = buildResponse();

    await middleware.use(req, res, next);

    expect(req.tenantContext).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  describe('auth routes', () => {
    it('uses cached tenant context when available', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT))
        .mockResolvedValueOnce(null);

      await middleware.use(req, res, next);

      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks auth routes for suspended cached tenants', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT))
        .mockResolvedValueOnce('true');

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: {
          code: 'TENANT_SUSPENDED',
          message: 'This school account has been suspended',
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('resolves auth routes from domain lookup and caches active tenants', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: { findFirst: jest.fn().mockResolvedValue(ACTIVE_DOMAIN_RECORD) },
        }),
      );

      await middleware.use(req, res, next);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'tenant_domain:school.example.com',
        60,
        JSON.stringify(TENANT_CONTEXT),
      );
      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('sets null tenant context when auth domain lookup misses', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      );

      await middleware.use(req, res, next);

      expect(req.tenantContext).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('swallows auth route resolution errors and continues', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get.mockRejectedValueOnce(new Error('redis down'));

      await middleware.use(req, res, next);

      expect(req.tenantContext).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('resolves proxy-host auth routes from the access token without domain lookup', async () => {
      const req = buildRequest({
        originalUrl: '/api/v1/auth/me',
        hostname: 'localhost',
        headers: { authorization: 'Bearer token-123' },
      });
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT));
      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });

      await middleware.use(req, res, next);

      expect(runWithRlsContext).not.toHaveBeenCalled();
      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('normalises non-Error auth route failures', async () => {
      const req = buildRequest({ originalUrl: '/api/v1/auth/login' });
      const res = buildResponse();

      mockRedisClient.get.mockRejectedValueOnce('redis down');

      await middleware.use(req, res, next);

      expect(req.tenantContext).toBeNull();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('tenant routes', () => {
    it('uses cached tenant context on normal routes', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT))
        .mockResolvedValueOnce(null);

      await middleware.use(req, res, next);

      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks normal routes for suspended cached tenants', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT))
        .mockResolvedValueOnce('true');

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 404 when no domain record exists and token fallback is unavailable', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      );

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'NOT_FOUND', message: 'Not found' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('resolves platform-domain requests from the access token', async () => {
      const req = buildRequest({
        hostname: 'localhost',
        headers: { authorization: 'Bearer token-123' },
      });
      const res = buildResponse();

      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT));
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: { findFirst: jest.fn().mockResolvedValue(null) },
        }),
      );
      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });

      await middleware.use(req, res, next);

      expect(runWithRlsContext).not.toHaveBeenCalled();
      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 404 for archived tenants from domain lookup', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: {
            findFirst: jest.fn().mockResolvedValue({
              tenant: { ...ACTIVE_DOMAIN_RECORD.tenant, status: 'archived' },
            }),
          },
        }),
      );

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 403 and caches suspended tenants from domain lookup', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: {
            findFirst: jest.fn().mockResolvedValue({
              tenant: { ...ACTIVE_DOMAIN_RECORD.tenant, status: 'suspended' },
            }),
          },
        }),
      );

      await middleware.use(req, res, next);

      expect(mockRedisClient.set).toHaveBeenCalledWith('tenant:tenant-1:suspended', 'true');
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('sets tenant context and caches active tenants from domain lookup', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockResolvedValueOnce(null);
      (runWithRlsContext as jest.Mock).mockImplementation(async (_prisma, _ctx, cb) =>
        cb({
          tenantDomain: { findFirst: jest.fn().mockResolvedValue(ACTIVE_DOMAIN_RECORD) },
        }),
      );

      await middleware.use(req, res, next);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'tenant_domain:school.example.com',
        60,
        JSON.stringify(TENANT_CONTEXT),
      );
      expect(req.tenantContext).toEqual(TENANT_CONTEXT);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns 500 when tenant resolution throws', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockRejectedValueOnce(new Error('boom'));

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 500 when tenant resolution throws a non-Error value', async () => {
      const req = buildRequest();
      const res = buildResponse();

      mockRedisClient.get.mockRejectedValueOnce('boom');

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('resolveTenantFromToken', () => {
    it('returns null when the auth header is missing or malformed', async () => {
      const req = buildRequest({ headers: {} });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();

      req.headers.authorization = 'Token abc';

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();
    });

    it('returns null when JWT secret is missing', async () => {
      mockConfigService.get.mockImplementation((key: string, fallback?: string) => {
        if (key === 'JWT_SECRET') return undefined;
        if (key === 'PLATFORM_DOMAIN') return 'edupod.app';
        return fallback;
      });
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();
    });

    it('returns null for non-access tokens or missing tenant ids', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      (jwt.verify as jest.Mock).mockReturnValueOnce({ type: 'refresh', tenant_id: 'tenant-1' });
      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();

      (jwt.verify as jest.Mock).mockReturnValueOnce({ type: 'access' });
      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();
    });

    it('returns cached tenant context when present', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(TENANT_CONTEXT));

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toEqual(TENANT_CONTEXT);
    });

    it('returns null for archived tenants looked up from prisma', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        ...TENANT_CONTEXT,
        status: 'archived',
      });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();
    });

    it('returns null and caches suspended tenants looked up from prisma', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        ...TENANT_CONTEXT,
        id: TENANT_CONTEXT.tenant_id,
        status: 'suspended',
      });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();

      expect(mockRedisClient.set).toHaveBeenCalledWith('tenant:tenant-1:suspended', 'true');
    });

    it('loads, caches, and returns active tenants looked up from prisma', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer token' } });

      (jwt.verify as jest.Mock).mockReturnValue({
        tenant_id: TENANT_CONTEXT.tenant_id,
        type: 'access',
      });
      mockRedisClient.get.mockResolvedValueOnce(null);
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        ...TENANT_CONTEXT,
        id: TENANT_CONTEXT.tenant_id,
      });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toEqual(TENANT_CONTEXT);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'tenant:tenant-1',
        60,
        JSON.stringify(TENANT_CONTEXT),
      );
    });

    it('returns null when token verification throws', async () => {
      const req = buildRequest({ headers: { authorization: 'Bearer bad-token' } });

      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        (
          middleware as unknown as {
            resolveTenantFromToken: (request: Request) => Promise<TenantContext | null>;
          }
        ).resolveTenantFromToken(req),
      ).resolves.toBeNull();
    });
  });
});
