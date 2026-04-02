import { BrokenCircuitError } from 'cockatiel';

import { CircuitBreakerRegistry } from './circuit-breaker-registry';

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  it('should return the same breaker for the same name', () => {
    const a = registry.getBreaker('test');
    const b = registry.getBreaker('test');
    expect(a).toBe(b);
  });

  it('should return different breakers for different names', () => {
    const a = registry.getBreaker('resend');
    const b = registry.getBreaker('twilio');
    expect(a).not.toBe(b);
  });

  it('should pass through successful calls', async () => {
    const result = await registry.exec('test-success', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should propagate errors while circuit is closed', async () => {
    const failing = async () => {
      throw new Error('upstream down');
    };

    await expect(registry.exec('propagate-test', failing)).rejects.toThrow('upstream down');
  });

  it('should open after consecutive failures and throw BrokenCircuitError', async () => {
    const threshold = 3;
    const failing = async () => {
      throw new Error('fail');
    };

    // Trip the breaker with `threshold` consecutive failures
    for (let i = 0; i < threshold; i++) {
      await expect(
        registry.exec('trip-test', failing, {
          threshold,
          halfOpenAfter: 60_000,
        }),
      ).rejects.toThrow('fail');
    }

    // Next call should get BrokenCircuitError (circuit is open)
    await expect(
      registry.exec('trip-test', async () => 'ok', {
        threshold,
        halfOpenAfter: 60_000,
      }),
    ).rejects.toThrow(BrokenCircuitError);
  });
});
