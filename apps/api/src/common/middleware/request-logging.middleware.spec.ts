import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';

import { StructuredLoggerService } from '../services/logger.service';

import { RequestLoggingMiddleware } from './request-logging.middleware';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildMockRequest(path: string): Request {
  return {
    method: 'GET',
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

  it('does not log outside development', () => {
    process.env.NODE_ENV = 'test';

    const { next, nextSpy } = buildNextSpy();
    const logSpy = jest
      .spyOn(StructuredLoggerService.prototype, 'log')
      .mockImplementation(() => undefined);

    middleware.use(buildMockRequest('/api/v1/parents'), buildMockResponse(), next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
