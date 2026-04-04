import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';

import { StructuredLoggerService } from '../services/logger.service';

import * as correlationModule from './correlation.middleware';
import { RequestLoggingMiddleware } from './request-logging.middleware';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMockRequest(path: string, method = 'GET'): Request {
  return {
    method,
    originalUrl: path,
    url: path,
  } as unknown as Request;
}

function buildMockResponse(statusCode = 200): Response & EventEmitter {
  const response = new EventEmitter() as Response & EventEmitter;
  response.statusCode = statusCode;
  return response;
}

function buildNextSpy(): { next: NextFunction; nextSpy: jest.Mock } {
  const nextSpy = jest.fn();
  const next: NextFunction = (deferToNext?: 'router' | 'route') => {
    nextSpy(deferToNext);
  };

  return { next, nextSpy };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RequestLoggingMiddleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let middleware: RequestLoggingMiddleware;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    middleware = new RequestLoggingMiddleware();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('logs method, path, status, and duration in development', () => {
    const request = buildMockRequest('/api/v1/students');
    const response = buildMockResponse(201);
    const { next, nextSpy } = buildNextSpy();
    const logSpy = jest
      .spyOn(StructuredLoggerService.prototype, 'log')
      .mockImplementation(() => undefined);

    middleware.use(request, response, next);
    response.emit('finish');

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^GET \/api\/v1\/students 201 \d+ms$/),
      RequestLoggingMiddleware.name,
    );
  });

  it('skips health and docs endpoints', () => {
    const { next, nextSpy } = buildNextSpy();
    const logSpy = jest
      .spyOn(StructuredLoggerService.prototype, 'log')
      .mockImplementation(() => undefined);

    middleware.use(buildMockRequest('/api/health'), buildMockResponse(), next);
    middleware.use(buildMockRequest('/api/docs'), buildMockResponse(), next);

    expect(nextSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('skips /api/metrics endpoint', () => {
    const { next, nextSpy } = buildNextSpy();
    const logSpy = jest
      .spyOn(StructuredLoggerService.prototype, 'log')
      .mockImplementation(() => undefined);

    middleware.use(buildMockRequest('/api/metrics'), buildMockResponse(), next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('writes structured JSON to stdout in production', () => {
    process.env.NODE_ENV = 'production';
    middleware = new RequestLoggingMiddleware();

    const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(correlationModule, 'getRequestContext').mockReturnValue({
      requestId: 'req-123',
    });

    const request = buildMockRequest('/api/v1/students', 'POST');
    const response = buildMockResponse(201);
    const { next } = buildNextSpy();

    middleware.use(request, response, next);
    response.emit('finish');

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[0] as string | undefined;
    expect(written).toBeDefined();
    const parsed = JSON.parse(written!.trim());

    expect(parsed).toMatchObject({
      level: 'access',
      method: 'POST',
      path: '/api/v1/students',
      status: 201,
      request_id: 'req-123',
    });
    expect(typeof parsed.timestamp).toBe('string');
    expect(typeof parsed.duration_ms).toBe('number');
  });

  it('includes tenant_id and user_id from request context', () => {
    process.env.NODE_ENV = 'production';
    middleware = new RequestLoggingMiddleware();

    const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(correlationModule, 'getRequestContext').mockReturnValue({
      requestId: 'req-456',
      tenantId: 'tenant-abc',
      userId: 'user-xyz',
    });

    const request = buildMockRequest('/api/v1/classes');
    const response = buildMockResponse(200);
    const { next } = buildNextSpy();

    middleware.use(request, response, next);
    response.emit('finish');

    const raw = writeSpy.mock.calls[0]?.[0] as string | undefined;
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!.trim());
    expect(parsed.tenant_id).toBe('tenant-abc');
    expect(parsed.user_id).toBe('user-xyz');
  });

  it('replaces UUIDs with :id in path', () => {
    process.env.NODE_ENV = 'production';
    middleware = new RequestLoggingMiddleware();

    const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(correlationModule, 'getRequestContext').mockReturnValue({ requestId: 'r' });

    const request = buildMockRequest('/api/v1/students/550e8400-e29b-41d4-a716-446655440000');
    const response = buildMockResponse(200);
    const { next } = buildNextSpy();

    middleware.use(request, response, next);
    response.emit('finish');

    const raw = writeSpy.mock.calls[0]?.[0] as string | undefined;
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!.trim());
    expect(parsed.path).toBe('/api/v1/students/:id');
  });

  it('does not use StructuredLoggerService in production', () => {
    process.env.NODE_ENV = 'production';
    middleware = new RequestLoggingMiddleware();

    jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    jest.spyOn(correlationModule, 'getRequestContext').mockReturnValue({ requestId: 'r' });
    const logSpy = jest
      .spyOn(StructuredLoggerService.prototype, 'log')
      .mockImplementation(() => undefined);

    const request = buildMockRequest('/api/v1/parents');
    const response = buildMockResponse(200);
    const { next } = buildNextSpy();

    middleware.use(request, response, next);
    response.emit('finish');

    expect(logSpy).not.toHaveBeenCalled();
  });
});
