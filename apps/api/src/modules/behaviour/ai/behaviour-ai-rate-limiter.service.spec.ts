import { BehaviourAiRateLimiterService } from './behaviour-ai-rate-limiter.service';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('BehaviourAiRateLimiterService', () => {
  it('allows the first call in a new window', () => {
    const limiter = new BehaviourAiRateLimiterService(3, 60_000);
    const result = limiter.check(TENANT, USER, 1_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('counts up to the limit then blocks further calls', () => {
    const limiter = new BehaviourAiRateLimiterService(3, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_500).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 2_000).allowed).toBe(true);
    const blocked = limiter.check(TENANT, USER, 2_100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets after the window closes', () => {
    const limiter = new BehaviourAiRateLimiterService(1, 1_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_500).allowed).toBe(false);
    // Jump past the window.
    expect(limiter.check(TENANT, USER, 3_000).allowed).toBe(true);
  });

  it('scopes independently per (tenant, user)', () => {
    const limiter = new BehaviourAiRateLimiterService(1, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_100).allowed).toBe(false);
    expect(limiter.check(TENANT, 'other-user', 1_200).allowed).toBe(true);
    expect(limiter.check('other-tenant', USER, 1_300).allowed).toBe(true);
  });

  it('reset clears the bucket', () => {
    const limiter = new BehaviourAiRateLimiterService(1, 60_000);
    expect(limiter.check(TENANT, USER, 1_000).allowed).toBe(true);
    expect(limiter.check(TENANT, USER, 1_100).allowed).toBe(false);
    limiter.reset(TENANT, USER);
    expect(limiter.check(TENANT, USER, 1_200).allowed).toBe(true);
  });
});
