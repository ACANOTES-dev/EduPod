import { CommsLoggerService } from './comms-logger.service';

describe('CommsLoggerService', () => {
  let service: CommsLoggerService;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new CommsLoggerService(undefined);
    service.setContext('TestService');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (service as any).logger;
    logSpy = jest.spyOn(internal, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(internal, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(internal, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes JSON in production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      service.log('hello', { tenant_id: 'T1', channel: 'email', template_key: 'k' });
      expect(logSpy).toHaveBeenCalled();
      const arg = logSpy.mock.calls[0]![0] as string;
      const parsed = JSON.parse(arg);
      expect(parsed.tenant_id).toBe('T1');
      expect(parsed.channel).toBe('email');
      expect(parsed.template_key).toBe('k');
      expect(parsed.level).toBe('log');
      expect(parsed.msg).toBe('hello');
      expect(parsed.context).toBe('TestService');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('writes human-readable in dev', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      service.log('hello', { tenant_id: 'T1', channel: 'email' });
      expect(logSpy).toHaveBeenCalled();
      const arg = logSpy.mock.calls[0]![0] as string;
      expect(arg).toContain('[email]');
      expect(arg).toContain('tenant=T1');
      expect(arg).toContain('hello');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('forwards trace on error', () => {
    service.error('boom', { tenant_id: 'T1' }, 'STACK');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('writes warn lines', () => {
    service.warn('warn-msg', { tenant_id: 'T1' });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('pulls tenant + correlation from request context when present', () => {
    const fakeRequest = {
      tenantContext: { tenant_id: 'TfromReq' },
      headers: { 'x-correlation-id': 'corr-9' },
    } as unknown as Parameters<(typeof CommsLoggerService)['prototype']['log']>[0];
    const requestService = new CommsLoggerService(fakeRequest as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (requestService as any).logger;
    const innerLog = jest.spyOn(internal, 'log').mockImplementation(() => undefined);

    process.env.NODE_ENV = 'production';
    requestService.log('msg', { tenant_id: '', channel: 'email' });
    const firstCall = innerLog.mock.calls[0];
    expect(firstCall).toBeDefined();
    const arg = firstCall![0] as string;
    const parsed = JSON.parse(arg);
    expect(parsed.tenant_id).toBe('TfromReq');
    expect(parsed.correlation_id).toBe('corr-9');
  });
});
