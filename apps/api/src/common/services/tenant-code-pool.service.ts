import { randomInt } from 'node:crypto';

import { Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS,
  HOUSEHOLD_NUMBER_PATTERN,
} from '@school/shared/households/household-number';

import { PrismaService } from '../../modules/prisma/prisma.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const LETTER_COUNT = 26;
const DIGIT_COUNT = 10;
const LETTER_A_CODE = 65; // 'A'.charCodeAt(0)

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * TenantCodePoolService — owns the shared 6-char alphanumeric pool used by
 * both `households.household_number` AND `staff_profiles.staff_number`.
 *
 * The invariant: within a tenant, no 6-char code of the form `LLLDDD` may be
 * used by both a household and a staff member. Login emails are derived from
 * these codes (`{code}@{tenant-domain}`) — if the pool weren't shared, two
 * different users could end up with the same email.
 *
 * Student numbers inherit the household's 6-char prefix with a `-NN` suffix
 * (e.g., `ABC123-01`), so they occupy a disjoint space and don't participate
 * in this pool directly.
 *
 * Callers MUST pass the tenant-scoped transaction client so the collision
 * check runs inside the same RLS context as the INSERT.
 */
@Injectable()
export class TenantCodePoolService {
  /**
   * Returns true if the given 6-char code is already occupied by either a
   * household or a staff profile in the tenant.
   */
  async isTaken(tx: PrismaService, tenantId: string, code: string): Promise<boolean> {
    const [household, staff] = await Promise.all([
      tx.household.findFirst({
        where: { tenant_id: tenantId, household_number: code },
        select: { id: true },
      }),
      tx.staffProfile.findFirst({
        where: { tenant_id: tenantId, staff_number: code },
        select: { id: true },
      }),
    ]);
    return household !== null || staff !== null;
  }

  /**
   * Generates a fresh 6-char code (`LLLDDD`) that is unique across both
   * `households.household_number` and `staff_profiles.staff_number` for
   * the tenant. Retries up to HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS times.
   *
   * The address space is 26^3 × 10^3 = 17,576,000 codes per tenant, so the
   * collision rate is negligible even at 10k active codes (birthday-paradox
   * odds ≈ 0.3%). The retry budget is a safety net.
   */
  async generateUnique(tx: PrismaService, tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS; attempt++) {
      const candidate = this.randomCode();
      // eslint-disable-next-line no-await-in-loop -- attempts are inherently sequential
      if (!(await this.isTaken(tx, tenantId, candidate))) return candidate;
    }
    throw new InternalServerErrorException({
      code: 'TENANT_CODE_POOL_EXHAUSTED',
      message: `Could not generate a unique tenant code after ${HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS} attempts`,
    });
  }

  /** 3 uppercase letters + 3 digits. Matches HOUSEHOLD_NUMBER_PATTERN. */
  private randomCode(): string {
    const l1 = String.fromCharCode(LETTER_A_CODE + randomInt(LETTER_COUNT));
    const l2 = String.fromCharCode(LETTER_A_CODE + randomInt(LETTER_COUNT));
    const l3 = String.fromCharCode(LETTER_A_CODE + randomInt(LETTER_COUNT));
    const d1 = randomInt(DIGIT_COUNT);
    const d2 = randomInt(DIGIT_COUNT);
    const d3 = randomInt(DIGIT_COUNT);
    const code = `${l1}${l2}${l3}${d1}${d2}${d3}`;
    // Sanity check — the runtime guarantee should match the compile-time pattern.
    if (!HOUSEHOLD_NUMBER_PATTERN.test(code)) {
      throw new Error(`Internal: generated code "${code}" does not match HOUSEHOLD_NUMBER_PATTERN`);
    }
    return code;
  }
}
