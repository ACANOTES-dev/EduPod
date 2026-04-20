import { BehaviourAiRateLimiterService } from './behaviour-ai-rate-limiter.service';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildLimiter(limit: number, windowMs: number) {
  const limiter = new BehaviourAiRateLimiterService();
  limiter.configure(limit, windowMs);
  return limiter;
}

describe('BehaviourAiRateLimiterService', () => {
  it('allows the first call in a new window', () => {
    const limiter = buildLimiter(3, 60_000);
    const result = limiter.check(TENANT, USER, 1_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('counts up to the limit then blocks further calls', () => {
    const limiter = buildLimiter(3, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_500).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 2_000).allowed).toBe(true);
    const blocked = limiter.check(TENANT, USER, 2_100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window closes', () => {
    const limiter = buildLimiter(1, 1_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_500).allowed).toBe(false);
    // Jump past the window.
    expect(limiter.check(TENANT, USER, 3_000).allowed).toBe(true);
  });

  it('scopes independently per (tenant, user)', () => {
    const limiter = buildLimiter(1, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_100).allowed).toBe(false);
    expect(limiter.check(TENANT, 'other-user', 1_200).allowed).toBe(true);
    expect(limiter.check('other-tenant', USER, 1_300).allowed).toBe(true);
  });

  it('reset clears the bucket', () => {
    const limiter = buildLimiter(1, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_100).allowed).toBe(false);
    limiter.reset(TENANT, USER);
    expect(limiter.check(TENANT, USER, 1_200).allowed).toBe(true);
  });

  it('defaults to 30 per hour when not configured', () => {
    const limiter = new BehaviourAiRateLimiterService();
    for (let i = 0; i < 30; i++) {
      expect(limiter.check(TENANT, USER, 1_000 + i).allowed).toBe(true);
    }
    expect(limiter.check(TENANT, USER, 1_031).allowed).toBe(false);
  });
});
