/**
 * StaffPreferencesReadFacade — Centralized read service for staff scheduling preference data.
 *
 * PURPOSE:
 * The staff-preferences module owns the `staffSchedulingPreference` table. This is
 * queried cross-module by scheduling/scheduler-orchestration.service.ts to build
 * solver input with teacher preferences (time-of-day, day-off, etc.).
 *
 * This facade provides a single, well-typed entry point for that cross-module read.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface StaffPreferenceRow {
  id: string;
  staff_profile_id: string;
  academic_year_id: string;
  preference_type: string;
  preference_payload: unknown;
  priority: string;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class StaffPreferencesReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all scheduling preferences for an academic year. Used by scheduler
   * orchestration to include teacher preferences in the solver input.
   */
  async findByAcademicYear(
    tenantId: string,
    academicYearId: string,
  ): Promise<StaffPreferenceRow[]> {
    return this.prisma.staffSchedulingPreference.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
    }) as unknown as Promise<StaffPreferenceRow[]>;
  }

  /**
   * Find preferences for a specific staff member. Used when generating
   * per-teacher solver constraints.
   */
  async findByStaffProfile(
    tenantId: string,
    academicYearId: string,
    staffProfileId: string,
  ): Promise<StaffPreferenceRow[]> {
    return this.prisma.staffSchedulingPreference.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        staff_profile_id: staffProfileId,
      },
    }) as unknown as Promise<StaffPreferenceRow[]>;
  }
}
