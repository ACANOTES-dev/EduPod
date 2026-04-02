import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerPolicy, ConsecutiveBreaker, circuitBreaker, handleAll } from 'cockatiel';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BreakerOptions {
  /** Number of consecutive failures before opening. Default: 5 */
  threshold?: number;
  /** How long the circuit stays open (ms). Default: 30_000 */
  halfOpenAfter?: number;
}

// ─── Registry ───────────────────────────────────────────────────────────────

/**
 * Singleton registry for named circuit breakers.
 *
 * Each external provider (Resend, Stripe, Twilio, etc.) gets its own breaker
 * instance, keyed by name. The same name always returns the same instance so
 * failure counts accumulate across callers.
 */
@Injectable()
export class CircuitBreakerRegistry {
  private readonly logger = new Logger(CircuitBreakerRegistry.name);
  private readonly breakers = new Map<string, CircuitBreakerPolicy>();

  /**
   * Get or create a circuit breaker for a named provider.
   * Same name always returns the same instance.
   */
  getBreaker(name: string, options: BreakerOptions = {}): CircuitBreakerPolicy {
    const existing = this.breakers.get(name);
    if (existing) return existing;

    const threshold = options.threshold ?? 5;
    const halfOpenAfter = options.halfOpenAfter ?? 30_000;

    const breaker = circuitBreaker(handleAll, {
      halfOpenAfter,
      breaker: new ConsecutiveBreaker(threshold),
    });

    breaker.onBreak(() => {
      this.logger.warn(`Circuit breaker OPEN for "${name}" — ${threshold} consecutive failures`);
    });
    breaker.onHalfOpen(() => {
      this.logger.log(`Circuit breaker HALF-OPEN for "${name}" — probing`);
    });
    breaker.onReset(() => {
      this.logger.log(`Circuit breaker CLOSED for "${name}" — recovered`);
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Wrap an async function call through a named circuit breaker.
   * Throws BrokenCircuitError if the circuit is open.
   */
  async exec<T>(name: string, fn: () => Promise<T>, options?: BreakerOptions): Promise<T> {
    const breaker = this.getBreaker(name, options);
    return breaker.execute(fn);
  }
}
