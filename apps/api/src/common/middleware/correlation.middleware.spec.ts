import type { NextFunction, Request, Response } from 'express';

import {
  CorrelationMiddleware,
  enrichRequestContext,
  getCorrelationId,
  getRequestContext,
  REQUEST_ID_HEADER,
} from './correlation.middleware';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildMockRequest(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function buildMockResponse(): Response & { headers: Record<string, string> } {
  const responseHeaders: Record<string, string> = {};
  return {
    headers: responseHeaders,
    setHeader(name: string, value: string) {
      responseHeaders[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CorrelationMiddleware', () => {
  let middleware: CorrelationMiddleware;

  beforeEach(() => {
    middleware = new CorrelationMiddleware();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate a UUID request ID when none is provided', (done) => {
    const req = buildMockRequest();
    const res = buildMockResponse();

    const next: NextFunction = () => {
      const id = getCorrelationId();
      expect(id).toBeDefined();
      expect(UUID_RE.test(id!)).toBe(true);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(id);
      done();
    };

    middleware.use(req, res, next);
  });

  it('should reuse existing X-Request-Id header from the request', (done) => {
    const existingId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const req = buildMockRequest({ [REQUEST_ID_HEADER]: existingId });
    const res = buildMockResponse();

    const next: NextFunction = () => {
      const id = getCorrelationId();
      expect(id).toBe(existingId);
      expect(res.headers[REQUEST_ID_HEADER]).toBe(existingId);
      done();
    };

    middleware.use(req, res, next);
  });

  it('should generate a new ID when the header is empty string', (done) => {
    const req = buildMockRequest({ [REQUEST_ID_HEADER]: '' });
    const res = buildMockResponse();

    const next: NextFunction = () => {
      const id = getCorrelationId();
      expect(id).toBeDefined();
      expect(id).not.toBe('');
      expect(UUID_RE.test(id!)).toBe(true);
      done();
    };

    middleware.use(req, res, next);
  });

  it('should store the context in AsyncLocalStorage', (done) => {
    const req = buildMockRequest();
    const res = buildMockResponse();

    const next: NextFunction = () => {
      const ctx = getRequestContext();
      expect(ctx).toBeDefined();
      expect(ctx!.requestId).toBeDefined();
      expect(ctx!.tenantId).toBeUndefined();
      expect(ctx!.userId).toBeUndefined();
      done();
    };

    middleware.use(req, res, next);
  });

  it('should allow enriching the context with tenantId and userId', (done) => {
    const req = buildMockRequest();
    const res = buildMockResponse();
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const userId = '22222222-2222-2222-2222-222222222222';

    const next: NextFunction = () => {
      enrichRequestContext({ tenantId, userId });

      const ctx = getRequestContext();
      expect(ctx!.tenantId).toBe(tenantId);
      expect(ctx!.userId).toBe(userId);
      done();
    };

    middleware.use(req, res, next);
  });

  it('should return undefined when called outside request lifecycle', () => {
    // Called outside of middleware.use() -> no AsyncLocalStorage context
    expect(getCorrelationId()).toBeUndefined();
    expect(getRequestContext()).toBeUndefined();
  });

  it('should not fail when enrichRequestContext is called outside a request', () => {
    // Should silently no-op
    expect(() => enrichRequestContext({ tenantId: 'abc' })).not.toThrow();
  });

  it('should set unique IDs for concurrent requests', (done) => {
    const ids: string[] = [];
    let pending = 2;

    const checkDone = () => {
      pending--;
      if (pending === 0) {
        expect(ids[0]).not.toBe(ids[1]);
        done();
      }
    };

    const req1 = buildMockRequest();
    const res1 = buildMockResponse();
    const req2 = buildMockRequest();
    const res2 = buildMockResponse();

    middleware.use(req1, res1, () => {
      ids.push(getCorrelationId()!);
      checkDone();
    });

    middleware.use(req2, res2, () => {
      ids.push(getCorrelationId()!);
      checkDone();
    });
  });
});
