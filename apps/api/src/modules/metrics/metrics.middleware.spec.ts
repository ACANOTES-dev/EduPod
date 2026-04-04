import type { Request, Response } from 'express';

import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockMetricsService(): {
  incrementInFlight: jest.Mock;
  decrementInFlight: jest.Mock;
  recordRequest: jest.Mock;
} {
  return {
    incrementInFlight: jest.fn(),
    decrementInFlight: jest.fn(),
    recordRequest: jest.fn(),
  };
}

function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/v1/students',
    url: '/api/v1/students',
    ...overrides,
  } as Request;
}

function createMockResponse(): Response & { _finishCallbacks: (() => void)[] } {
  const callbacks: (() => void)[] = [];
  const res = {
    statusCode: 200,
    _finishCallbacks: callbacks,
    once: jest.fn((event: string, cb: () => void) => {
      if (event === 'finish') {
        callbacks.push(cb);
      }
    }),
  } as unknown as Response & { _finishCallbacks: (() => void)[] };
  return res;
}

// ─── Describe ────────────────────────────────────────────────────────────────

describe('MetricsMiddleware', () => {
  let middleware: MetricsMiddleware;
  let mockService: ReturnType<typeof createMockMetricsService>;

  beforeEach(() => {
    mockService = createMockMetricsService();
    middleware = new MetricsMiddleware(mockService as unknown as MetricsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Normal request flow ───────────────────────────────────────────────

  describe('normal request flow', () => {
    it('should record request metrics on response finish', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockService.incrementInFlight).toHaveBeenCalledWith('GET');

      // Simulate response finish
      res._finishCallbacks.forEach((cb) => cb());

      expect(mockService.decrementInFlight).toHaveBeenCalledWith('GET');
      expect(mockService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/students',
        200,
        expect.any(Number),
      );
    });

    it('should calculate duration in seconds', () => {
      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);

      // Simulate response finish
      res._finishCallbacks.forEach((cb) => cb());

      const durationSeconds = mockService.recordRequest.mock.calls[0][3] as number;
      // Duration should be a non-negative number in seconds
      expect(durationSeconds).toBeGreaterThanOrEqual(0);
      expect(durationSeconds).toBeLessThan(1); // Should be near-instant in tests
    });

    it('should increment and decrement in-flight gauge', () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(mockService.incrementInFlight).toHaveBeenCalledWith('POST');
      expect(mockService.decrementInFlight).not.toHaveBeenCalled();

      // Simulate response finish
      res._finishCallbacks.forEach((cb) => cb());

      expect(mockService.decrementInFlight).toHaveBeenCalledWith('POST');
    });
  });

  // ─── UUID stripping ────────────────────────────────────────────────────

  describe('UUID stripping', () => {
    it('should strip UUIDs from path before recording', () => {
      const req = createMockRequest({
        originalUrl: '/api/v1/students/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);
      res._finishCallbacks.forEach((cb) => cb());

      expect(mockService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/students/:id',
        200,
        expect.any(Number),
      );
    });

    it('should strip multiple UUIDs from path', () => {
      const req = createMockRequest({
        originalUrl:
          '/api/v1/tenants/a1b2c3d4-e5f6-7890-abcd-ef1234567890/students/b2c3d4e5-f6a7-8901-bcde-f12345678901',
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);
      res._finishCallbacks.forEach((cb) => cb());

      expect(mockService.recordRequest).toHaveBeenCalledWith(
        'GET',
        '/api/v1/tenants/:id/students/:id',
        200,
        expect.any(Number),
      );
    });
  });

  // ─── Excluded paths ────────────────────────────────────────────────────

  describe('excluded paths', () => {
    const excludedPaths = [
      '/api/health',
      '/api/health/ready',
      '/api/health/live',
      '/api/docs',
      '/api/docs/swagger',
      '/api/metrics',
    ];

    it.each(excludedPaths)('should skip path %s', (path) => {
      const req = createMockRequest({ originalUrl: path });
      const res = createMockResponse();
      const next = jest.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockService.incrementInFlight).not.toHaveBeenCalled();
      expect(res.once).not.toHaveBeenCalled();
    });
  });
});
