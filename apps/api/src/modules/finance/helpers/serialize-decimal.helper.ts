import { Decimal } from '@prisma/client/runtime/library';

// ─── Decimal serialisation ───────────────────────────────────────────────────

/**
 * Convert a Prisma Decimal value to a JavaScript number for API responses.
 * Prisma represents NUMERIC(12,2) columns as `Decimal` objects; calling
 * `Number()` on them returns the correct floating-point representation.
 */
export function serializeDecimal(value: Decimal): number {
  return Number(value);
}
