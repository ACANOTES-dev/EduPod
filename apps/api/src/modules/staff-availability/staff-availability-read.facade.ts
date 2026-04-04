/**
 * StaffAvailabilityReadFacade — Centralized read service for staff availability data.
 *
 * PURPOSE:
 * The staff-availability module owns the `staffAvailability` table. This is queried
 * cross-module by scheduling (cover-teacher, scheduler-orchestration) and
 * scheduling-runs (prerequisites, dashboard) to check teacher availability windows,
 * build solver input, and validate pinned entries.
 *
 * This facade provides a single, well-typed entry point for those cross-module reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface StaffAvailabilityRow {
  id: string;
  staff_profile_id: string;
  academic_year_id: string;
  weekday: number;
  available_from: Date;
  available_to: Date;
}

export interface StaffAvailabilityBasicRow {
  staff_profile_id: string;
  weekday: number;
  available_from: Date;
  available_to: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class StaffAvailabilityReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all availability records for an academic year. Used by scheduler
   * orchestration to build solver input.
   */
  async findByAcademicYear(
    tenantId: string,
    academicYearId: string,
  ): Promise<StaffAvailabilityRow[]> {
    return this.prisma.staffAvailability.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    }) as unknown as Promise<StaffAvailabilityRow[]>;
  }

  /**
   * Find availability for specific staff members in an academic year.
   * Used by scheduling dashboard to count available days per teacher.
   */
  async findByStaffIds(
    tenantId: string,
    academicYearId: string,
    staffProfileIds: string[],
  ): Promise<StaffAvailabilityBasicRow[]> {
    if (staffProfileIds.length === 0) return [];

    return this.prisma.staffAvailability.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: { in: staffProfileIds },
      },
      select: {
        staff_profile_id: true,
        weekday: true,
        available_from: true,
        available_to: true,
      },
    });
  }

  /**
   * Find availability for a specific weekday in an academic year.
   * Used by cover-teacher to check who is available on a given day.
   */
  async findByWeekday(
    tenantId: string,
    academicYearId: string,
    weekday: number,
  ): Promise<StaffAvailabilityBasicRow[]> {
    return this.prisma.staffAvailability.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        weekday,
      },
      select: {
        staff_profile_id: true,
        weekday: true,
        available_from: true,
        available_to: true,
      },
    });
  }
}
