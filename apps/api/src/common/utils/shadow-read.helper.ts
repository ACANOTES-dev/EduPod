import { Logger } from '@nestjs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShadowReadOptions<T> {
  /** Human-readable label for logging (e.g., 'students.listActive') */
  label: string;
  /** The trusted implementation — its result is always returned */
  primary: () => Promise<T>;
  /** The new implementation being validated — runs in background */
  shadow: () => Promise<T>;
  /** Custom comparison function. Defaults to JSON.stringify equality */
  compare?: (primary: T, shadow: T) => boolean;
  /** Tenant context for log attribution */
  tenantId: string;
}

export interface ShadowReadResult<T> {
  result: T;
  diverged: boolean;
}

// ─── Default comparator ───────────────────────────────────────────────────────

function defaultCompare<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ─── Shadow Read ──────────────────────────────────────────────────────────────

const logger = new Logger('ShadowRead');

/**
 * Runs both old and new implementations of a query, compares results,
 * and logs divergence. Always returns the primary (trusted) result.
 *
 * The shadow implementation runs asynchronously after the primary completes.
 * If the shadow throws or produces different results, this is logged but
 * NEVER affects the returned value.
 *
 * Usage during refactoring:
 * 1. Wire up shadow reads with the new query as shadow
 * 2. Monitor logs for divergence over a period
 * 3. Once confident, swap primary/shadow
 * 4. After full validation, remove the shadow read wrapper
 *
 * @returns The primary result (shadow never affects the response)
 */
export async function shadowRead<T>(options: ShadowReadOptions<T>): Promise<T> {
  const { label, primary, shadow, compare, tenantId } = options;
  const compareFn = compare ?? defaultCompare;

  // Always execute primary first — this is the user-facing result
  const primaryResult = await primary();

  // Run shadow in background — fire and forget
  // We do NOT await this in the main path to avoid blocking the response
  runShadow(label, shadow, primaryResult, compareFn, tenantId);

  return primaryResult;
}

/**
 * Variant that awaits the shadow (for testing or when you want to know
 * if results diverged). Still returns primary result regardless.
 */
export async function shadowReadSync<T>(
  options: ShadowReadOptions<T>,
): Promise<ShadowReadResult<T>> {
  const { label, primary, shadow, compare, tenantId } = options;
  const compareFn = compare ?? defaultCompare;

  const primaryResult = await primary();
  const diverged = await runShadowSync(label, shadow, primaryResult, compareFn, tenantId);

  return { result: primaryResult, diverged };
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function runShadow<T>(
  label: string,
  shadow: () => Promise<T>,
  primaryResult: T,
  compareFn: (a: T, b: T) => boolean,
  tenantId: string,
): void {
  // Intentionally not awaited — fire-and-forget pattern
  void runShadowSync(label, shadow, primaryResult, compareFn, tenantId);
}

async function runShadowSync<T>(
  label: string,
  shadow: () => Promise<T>,
  primaryResult: T,
  compareFn: (a: T, b: T) => boolean,
  tenantId: string,
): Promise<boolean> {
  try {
    const shadowResult = await shadow();
    const match = compareFn(primaryResult, shadowResult);

    if (!match) {
      logger.warn(
        `[${label}] Shadow read DIVERGED for tenant ${tenantId}. ` +
          'Primary and shadow implementations returned different results.',
      );
      return true;
    }

    return false;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[${label}] Shadow read FAILED for tenant ${tenantId}: ${message}`);
    return true;
  }
}
