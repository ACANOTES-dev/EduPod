import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result shape ─────────────────────────────────────────────────────────────

export interface AvailableSeatsResult {
  total_capacity: number;
  enrolled_student_count: number;
  conditional_approval_count: number;
  available_seats: number;
  configured: boolean;
}

export interface YearGroupPair {
  academicYearId: string;
  yearGroupId: string;
}

// ─── Raw SQL tx shim ──────────────────────────────────────────────────────────
//
// The rest of the admissions module uses this cast when it needs $queryRaw on
// the transaction client that callers hand us (see applications.service.ts).
// Capacity math is the only place this service reaches for raw SQL, and every
// query below runs inside a caller-owned RLS transaction.

type RawTx = {
  $queryRaw: <T>(sql: Prisma.Sql) => Promise<T>;
};

interface CapacityRow {
  academic_year_id: string;
  year_group_id: string;
  total_capacity: bigint | number;
  enrolled_student_count: bigint | number;
  conditional_approval_count: bigint | number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Single source of truth for admissions capacity arithmetic.
 *
 * Every gating decision in the admissions pipeline routes through this
 * service. No other code is allowed to compute year-group availability —
 * getting the math wrong means the school oversubscribes a class under
 * concurrent approvals.
 *
 * All methods take the caller's transaction client as `db`. The caller is
 * responsible for opening an RLS-scoped interactive transaction before
 * invoking these methods — we assume `app.current_tenant_id` is already set.
 */
@Injectable()
export class AdmissionsCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Compute available seats for one (academic_year, year_group) pair.
   *
   * Returns the three component counts plus a clamped `available_seats`
   * (never negative — historical over-consumption is not surfaced as debt)
   * and a `configured` flag indicating whether any active class exists for
   * the pair. `configured: false` drives the state machine's
   * `awaiting_year_setup` sub-status branch.
   */
  async getAvailableSeats(
    db: PrismaService,
    params: { tenantId: string; academicYearId: string; yearGroupId: string },
  ): Promise<AvailableSeatsResult> {
    const { tenantId, academicYearId, yearGroupId } = params;

    const result = await this.fetchCapacityRows(db, tenantId, [{ academicYearId, yearGroupId }]);

    const key = keyFor(academicYearId, yearGroupId);
    return (
      result.get(key) ?? {
        total_capacity: 0,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: false,
      }
    );
  }

  /**
   * Batched variant used by the dashboard and queue pages. Returns a Map
   * keyed by `${academicYearId}:${yearGroupId}`. Pairs with no active
   * classes are still present in the map with `configured: false`.
   */
  async getAvailableSeatsBatch(
    db: PrismaService,
    params: { tenantId: string; pairs: YearGroupPair[] },
  ): Promise<Map<string, AvailableSeatsResult>> {
    const { tenantId, pairs } = params;

    if (pairs.length === 0) {
      return new Map();
    }

    // Dedupe pairs — callers may legitimately pass duplicates (e.g. two
    // applications targeting the same year group); we only need to query
    // each unique pair once.
    const unique = new Map<string, YearGroupPair>();
    for (const pair of pairs) {
      unique.set(keyFor(pair.academicYearId, pair.yearGroupId), pair);
    }

    const fetched = await this.fetchCapacityRows(db, tenantId, [...unique.values()]);

    // Ensure every requested pair is present in the result, filling in
    // zero/unconfigured rows where the SQL returned nothing.
    const out = new Map<string, AvailableSeatsResult>();
    for (const pair of unique.values()) {
      const key = keyFor(pair.academicYearId, pair.yearGroupId);
      out.set(
        key,
        fetched.get(key) ?? {
          total_capacity: 0,
          enrolled_student_count: 0,
          conditional_approval_count: 0,
          available_seats: 0,
          configured: false,
        },
      );
    }
    return out;
  }

  /**
   * Helper used by the auto-promotion hooks: given a student, find the
   * (year_group, academic_year) tuple they currently occupy and return the
   * availability for that tuple. Returns `null` when the student has no
   * year group or no active class enrolment.
   */
  async getStudentYearGroupCapacity(
    db: PrismaService,
    params: { tenantId: string; studentId: string },
  ): Promise<AvailableSeatsResult | null> {
    const { tenantId, studentId } = params;

    const student = await db.student.findFirst({
      where: { tenant_id: tenantId, id: studentId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) {
      return null;
    }

    const enrolment = await db.classEnrolment.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, status: 'active' },
      select: { class_entity: { select: { academic_year_id: true } } },
      orderBy: { start_date: 'desc' },
    });

    const academicYearId = enrolment?.class_entity.academic_year_id;
    if (!academicYearId) {
      return null;
    }

    return this.getAvailableSeats(db, {
      tenantId,
      academicYearId,
      yearGroupId: student.year_group_id,
    });
  }

  // ─── Private ────────────────────────────────────────────────────────────

  /**
   * Single-query capacity aggregation over an arbitrary list of pairs.
   * A CTE builds the pair universe from two parallel arrays, and three
   * LEFT JOINs attach the sum-of-capacity, distinct-enrolled-student-count,
   * and conditional-approval-count. The `GREATEST(0, ...)` clamps any
   * historical over-consumption so the state machine never sees a negative
   * availability.
   */
  private async fetchCapacityRows(
    db: PrismaService,
    tenantId: string,
    pairs: YearGroupPair[],
  ): Promise<Map<string, AvailableSeatsResult>> {
    const rawTx = db as unknown as RawTx;

    const academicYearIds = pairs.map((p) => p.academicYearId);
    const yearGroupIds = pairs.map((p) => p.yearGroupId);

    // eslint-disable-next-line school/no-raw-sql-outside-rls -- capacity aggregate runs inside caller's RLS transaction; see AdmissionsCapacityService docstring
    const rows = await rawTx.$queryRaw<CapacityRow[]>(Prisma.sql`
      WITH pair_input AS (
        SELECT
          ay.id AS academic_year_id,
          yg.id AS year_group_id
        FROM unnest(${academicYearIds}::uuid[]) WITH ORDINALITY AS ay(id, ord)
        JOIN unnest(${yearGroupIds}::uuid[]) WITH ORDINALITY AS yg(id, ord)
          ON ay.ord = yg.ord
      ),
      class_list AS (
        SELECT c.id, c.academic_year_id, c.year_group_id, c.max_capacity
        FROM classes c
        JOIN pair_input p
          ON p.academic_year_id = c.academic_year_id
         AND p.year_group_id = c.year_group_id
        WHERE c.tenant_id = ${tenantId}::uuid
          AND c.status = 'active'
      ),
      capacity AS (
        SELECT
          academic_year_id,
          year_group_id,
          COALESCE(SUM(max_capacity), 0)::int AS total
        FROM class_list
        GROUP BY academic_year_id, year_group_id
      ),
      enrolled AS (
        SELECT
          cl.academic_year_id,
          cl.year_group_id,
          COUNT(DISTINCT ce.student_id)::int AS enrolled
        FROM class_enrolments ce
        JOIN class_list cl ON cl.id = ce.class_id
        WHERE ce.tenant_id = ${tenantId}::uuid
          AND ce.status = 'active'
        GROUP BY cl.academic_year_id, cl.year_group_id
      ),
      conditional AS (
        SELECT
          a.target_academic_year_id AS academic_year_id,
          a.target_year_group_id AS year_group_id,
          COUNT(*)::int AS conditional
        FROM applications a
        JOIN pair_input p
          ON p.academic_year_id = a.target_academic_year_id
         AND p.year_group_id = a.target_year_group_id
        WHERE a.tenant_id = ${tenantId}::uuid
          AND a.status = 'conditional_approval'
        GROUP BY a.target_academic_year_id, a.target_year_group_id
      )
      SELECT
        p.academic_year_id,
        p.year_group_id,
        COALESCE(capacity.total, 0)::int AS total_capacity,
        COALESCE(enrolled.enrolled, 0)::int AS enrolled_student_count,
        COALESCE(conditional.conditional, 0)::int AS conditional_approval_count
      FROM pair_input p
      LEFT JOIN capacity
        ON capacity.academic_year_id = p.academic_year_id
       AND capacity.year_group_id = p.year_group_id
      LEFT JOIN enrolled
        ON enrolled.academic_year_id = p.academic_year_id
       AND enrolled.year_group_id = p.year_group_id
      LEFT JOIN conditional
        ON conditional.academic_year_id = p.academic_year_id
       AND conditional.year_group_id = p.year_group_id
    `);

    const out = new Map<string, AvailableSeatsResult>();
    for (const row of rows) {
      const total = Number(row.total_capacity);
      const enrolled = Number(row.enrolled_student_count);
      const conditional = Number(row.conditional_approval_count);
      out.set(keyFor(row.academic_year_id, row.year_group_id), {
        total_capacity: total,
        enrolled_student_count: enrolled,
        conditional_approval_count: conditional,
        available_seats: Math.max(0, total - enrolled - conditional),
        configured: total > 0,
      });
    }
    return out;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function keyFor(academicYearId: string, yearGroupId: string): string {
  return `${academicYearId}:${yearGroupId}`;
}
