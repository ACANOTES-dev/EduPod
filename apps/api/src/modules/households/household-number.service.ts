import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  formatStudentNumberFromHousehold,
  HOUSEHOLD_MAX_STUDENTS,
} from '@school/shared/households/household-number';

import { TenantCodePoolService } from '../../common/services/tenant-code-pool.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdNumberService {
  constructor(
    private readonly sequenceService: SequenceService,
    private readonly tenantCodePool: TenantCodePoolService,
  ) {}

  // ─── Household number generation ──────────────────────────────────────────

  /**
   * Generates a fresh 6-char household number unique within the given tenant
   * AND unique against every existing `staff_profiles.staff_number` in the
   * same tenant (shared 6-char pool). Retries on collision via the pool
   * service.
   *
   * Must be called inside an active interactive transaction that has already
   * set the tenant RLS context — the caller's transaction client is passed in.
   */
  async generateUniqueForTenant(tx: PrismaService, tenantId: string): Promise<string> {
    return this.tenantCodePool.generateUnique(tx, tenantId);
  }

  /**
   * Non-persisting preview — generates a candidate number that appears unused
   * at this instant. Used by the walk-in wizard's "refresh" button. Not a
   * guarantee — a concurrent transaction could claim the same number between
   * preview and commit. The real guarantee is at commit time via
   * generateUniqueForTenant().
   */
  async previewForTenant(tx: PrismaService, tenantId: string): Promise<string> {
    return this.generateUniqueForTenant(tx, tenantId);
  }

  // ─── Student counter ──────────────────────────────────────────────────────

  /**
   * Increments a household's student_counter and returns the new counter value.
   * Uses SELECT ... FOR UPDATE so concurrent sibling inserts under the same
   * household serialise and each gets a distinct counter value.
   * Throws HOUSEHOLD_STUDENT_CAP_REACHED if the next value would exceed 99.
   */
  async incrementStudentCounter(tx: PrismaService, householdId: string): Promise<number> {
    const rawTx = tx as unknown as {
      $queryRaw: <T>(sql: Prisma.Sql) => Promise<T>;
    };

    // eslint-disable-next-line school/no-raw-sql-outside-rls -- SELECT FOR UPDATE row lock inside caller's RLS transaction
    const rows = await rawTx.$queryRaw<{ student_counter: number }[]>(
      Prisma.sql`
        SELECT student_counter
        FROM households
        WHERE id = ${householdId}::uuid
        FOR UPDATE
      `,
    );

    const current = rows[0]?.student_counter ?? 0;
    const next = current + 1;

    if (next > HOUSEHOLD_MAX_STUDENTS) {
      throw new BadRequestException({
        code: 'HOUSEHOLD_STUDENT_CAP_REACHED',
        message: `Household has reached the ${HOUSEHOLD_MAX_STUDENTS}-student cap`,
      });
    }

    await tx.household.update({
      where: { id: householdId },
      data: { student_counter: next },
    });

    return next;
  }

  // ─── Student number generation (branched) ─────────────────────────────────

  /**
   * Generates a student number. If the household has a household_number,
   * uses the new {household_number}-{nn} format. Otherwise falls back to
   * the legacy STU-NNNNNN sequence.
   *
   * Must be called inside the same transaction that creates the Student row.
   */
  async generateStudentNumber(
    tx: PrismaService,
    tenantId: string,
    householdId: string,
  ): Promise<string> {
    const household = await tx.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: { id: true, household_number: true },
    });

    if (!household) {
      throw new BadRequestException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household "${householdId}" not found when generating student number`,
      });
    }

    if (household.household_number) {
      const counter = await this.incrementStudentCounter(tx, household.id);
      return formatStudentNumberFromHousehold(household.household_number, counter);
    }

    // Legacy path — global tenant sequence
    return this.sequenceService.nextNumber(tenantId, 'student', tx, 'STU');
  }
}
