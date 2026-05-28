import type { NextFunction, Request, Response } from 'express';

import { normaliseEduPodHost, ReadOnlyCutoverMiddleware } from './read-only-cutover.middleware';

function buildResponse(): Response & {
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
} {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn(() => response),
    json: jest.fn(() => response),
  };

  return response as Response & {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };
}

function buildNext(): { next: NextFunction; nextSpy: jest.Mock } {
  const nextSpy = jest.fn();
  const next: NextFunction = (deferToNext?: 'router' | 'route') => {
    nextSpy(deferToNext);
  };

  return { next, nextSpy };
}

function buildRequest(method: string, host: string): Request {
  return { method, headers: { host } } as Request;
}

describe('ReadOnlyCutoverMiddleware', () => {
  const originalEnv = process.env.EDUPOD_READ_ONLY_CUTOVER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EDUPOD_READ_ONLY_CUTOVER;
    } else {
      process.env.EDUPOD_READ_ONLY_CUTOVER = originalEnv;
    }
    jest.clearAllMocks();
  });

  it('passes safe methods through when env is set', () => {
    process.env.EDUPOD_READ_ONLY_CUTOVER = '1';
    const { next, nextSpy } = buildNext();
    const response = buildResponse();

    new ReadOnlyCutoverMiddleware().use(buildRequest('GET', 'nhqs.edupod.app'), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns 503 + cutover status link for POST when env is set', () => {
    process.env.EDUPOD_READ_ONLY_CUTOVER = '1';
    const { next, nextSpy } = buildNext();
    const response = buildResponse();

    new ReadOnlyCutoverMiddleware().use(buildRequest('POST', 'nhqs.edupod.app'), response, next);

    expect(nextSpy).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    expect(response.json).toHaveBeenCalledWith({
      error: expect.objectContaining({
        code: 'PLATFORM_IN_READ_ONLY_CUTOVER',
        status_url: 'https://cutover.edupod.app',
        target_url: 'https://nhqs.edupod.app',
      }),
    });
  });

  it('does not echo untrusted Host values', () => {
    process.env.EDUPOD_READ_ONLY_CUTOVER = '1';
    const { next } = buildNext();
    const response = buildResponse();

    new ReadOnlyCutoverMiddleware().use(buildRequest('POST', 'evil.example'), response, next);

    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain('evil.example');
    expect(response.json.mock.calls[0][0].error.target_url).toBeUndefined();
  });

  it('passes through entirely when env is not set', () => {
    delete process.env.EDUPOD_READ_ONLY_CUTOVER;
    const { next, nextSpy } = buildNext();
    const response = buildResponse();

    new ReadOnlyCutoverMiddleware().use(buildRequest('POST', 'nhqs.edupod.app'), response, next);

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(response.status).not.toHaveBeenCalled();
  });

  it('normalises only the root EduPod host or one tenant label', () => {
    expect(normaliseEduPodHost('edupod.app')).toBe('edupod.app');
    expect(normaliseEduPodHost('NHQS.edupod.app:443')).toBe('nhqs.edupod.app');
    expect(normaliseEduPodHost('deep.nhqs.edupod.app')).toBeNull();
    expect(normaliseEduPodHost('nhqs.evil.example')).toBeNull();
  });
});
