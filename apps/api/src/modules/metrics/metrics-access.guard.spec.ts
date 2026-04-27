import type { ExecutionContext } from '@nestjs/common';

import { MetricsAccessGuard } from './metrics-access.guard';

function ctxFor(req: {
  ip?: string;
  socket?: { remoteAddress?: string };
  header?: (k: string) => string | undefined;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip: req.ip,
        socket: { remoteAddress: req.socket?.remoteAddress },
        header: req.header ?? (() => undefined),
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsAccessGuard', () => {
  let originalToken: string | undefined;

  beforeEach(() => {
    originalToken = process.env.METRICS_INTERNAL_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.METRICS_INTERNAL_TOKEN;
    else process.env.METRICS_INTERNAL_TOKEN = originalToken;
  });

  it('allows loopback 127.0.0.1', () => {
    const guard = new MetricsAccessGuard();
    expect(guard.canActivate(ctxFor({ ip: '127.0.0.1' }))).toBe(true);
  });

  it('allows loopback ::1', () => {
    const guard = new MetricsAccessGuard();
    expect(guard.canActivate(ctxFor({ ip: '::1' }))).toBe(true);
  });

  it('denies non-loopback without a token configured', () => {
    delete process.env.METRICS_INTERNAL_TOKEN;
    const guard = new MetricsAccessGuard();
    expect(guard.canActivate(ctxFor({ ip: '10.0.0.5' }))).toBe(false);
  });

  it('allows non-loopback when correct token is presented', () => {
    process.env.METRICS_INTERNAL_TOKEN = 'secret';
    const guard = new MetricsAccessGuard();
    expect(
      guard.canActivate(
        ctxFor({
          ip: '10.0.0.5',
          header: (k: string) => (k === 'x-metrics-auth' ? 'secret' : undefined),
        }),
      ),
    ).toBe(true);
  });

  it('denies non-loopback when token is wrong', () => {
    process.env.METRICS_INTERNAL_TOKEN = 'secret';
    const guard = new MetricsAccessGuard();
    expect(
      guard.canActivate(
        ctxFor({
          ip: '10.0.0.5',
          header: (k: string) => (k === 'x-metrics-auth' ? 'wrong' : undefined),
        }),
      ),
    ).toBe(false);
  });
});
