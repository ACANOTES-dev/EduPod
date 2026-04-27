import { VerifyRateLimitService } from './verify-rate-limit.service';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function build() {
  const client = {
    incr: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
  };
  const redis = { getClient: jest.fn().mockReturnValue(client) };
  const svc = new VerifyRateLimitService(redis as never);
  return { svc, client };
}

describe('VerifyRateLimitService', () => {
  it('first 3 calls allowed, 4th disallowed with retry_after computed', async () => {
    const { svc, client } = build();
    client.incr
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);

    const r1 = await svc.checkAndIncrement(TENANT_A, 'email');
    const r2 = await svc.checkAndIncrement(TENANT_A, 'email');
    const r3 = await svc.checkAndIncrement(TENANT_A, 'email');
    const r4 = await svc.checkAndIncrement(TENANT_A, 'email');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.retry_after_seconds).toBeGreaterThan(0);
    expect(r4.retry_after_seconds).toBeLessThanOrEqual(3600);
    expect(r4.limit).toBe(3);

    // EXPIRE only fires on the first INCR
    expect(client.expire).toHaveBeenCalledTimes(1);
  });

  it('per-tenant counters are independent', async () => {
    const { svc, client } = build();
    client.incr.mockResolvedValue(1);

    await svc.checkAndIncrement(TENANT_A, 'email');
    await svc.checkAndIncrement(TENANT_A, 'email');
    await svc.checkAndIncrement(TENANT_A, 'email');
    await svc.checkAndIncrement(TENANT_B, 'email');

    const keys = client.incr.mock.calls.map((call) => call[0] as string);
    expect(keys.filter((k) => k.includes(TENANT_A)).length).toBe(3);
    expect(keys.filter((k) => k.includes(TENANT_B)).length).toBe(1);
  });

  it('per-channel counters are independent', async () => {
    const { svc, client } = build();
    client.incr.mockResolvedValue(1);

    await svc.checkAndIncrement(TENANT_A, 'email');
    await svc.checkAndIncrement(TENANT_A, 'sms');
    await svc.checkAndIncrement(TENANT_A, 'whatsapp');

    const keys = client.incr.mock.calls.map((call) => call[0] as string);
    expect(keys.filter((k) => k.includes(':email:')).length).toBe(1);
    expect(keys.filter((k) => k.includes(':sms:')).length).toBe(1);
    expect(keys.filter((k) => k.includes(':whatsapp:')).length).toBe(1);
  });

  it('bucket key contains UTC YYYYMMDDHH', async () => {
    const { svc, client } = build();
    client.incr.mockResolvedValue(1);
    await svc.checkAndIncrement(TENANT_A, 'email');
    const key = client.incr.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/verify:[a-f0-9-]+:email:\d{10}$/);
  });
});
