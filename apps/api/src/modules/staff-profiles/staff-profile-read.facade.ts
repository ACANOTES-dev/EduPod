/**
 * StaffProfileReadFacade — Centralised read-only access to staff profile data.
 *
 * Purpose: Other modules (scheduling, payroll, attendance, dashboard, etc.) currently
 * query the `staff_profiles` table directly via their own Prisma calls. This facade
 * provides a single, consistent interface for all cross-module reads so that:
 *
 *   1. Query shapes are standardised — consumers get predictable return types.
 *   2. Future optimisations (caching, batching, preloading) can be applied in one place.
 *   3. Migration away from scattered direct DB access is incremental — new consumers
 *      use this facade; existing consumers can be migrated over time.
 *
 * Convention: read-only queries do NOT use an RLS transaction. Tenant isolation is
 * enforced by always including `tenant_id` in the `where` clause.
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Return types ─────────────────────────────────────────────────────────────

export interface StaffProfileSummary {
  id: string;
  tenant_id: string;
  user_id: string;
  staff_number: string | null;
  job_title: string | null;
  employment_status: string;
  department: string | null;
  employment_type: string;
  created_at: Date;
  updated_at: Date;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface StaffProfileWithScheduling extends StaffProfileSummary {
  staff_availability: {
    id: string;
    weekday: number;
    available_from: Date;
    available_to: Date;
    academic_year_id: string;
  }[];
  staff_scheduling_preferences: {
    id: string;
    preference_type: string;
    preference_payload: unknown;
    priority: string;
    academic_year_id: string;
  }[];
  teacher_scheduling_configs: {
    id: string;
    max_periods_per_week: number | null;
    max_periods_per_day: number | null;
    max_supervision_duties_per_week: number | null;
    academic_year_id: string;
  }[];
}

// ─── Shared select/include fragments ──────────────────────────────────────────

const USER_SUMMARY_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
} as const;

const BASE_SELECT = {
  id: true,
  tenant_id: true,
  user_id: true,
  staff_number: true,
  job_title: true,
  employment_status: true,
  department: true,
  employment_type: true,
  created_at: true,
  updated_at: true,
  user: { select: USER_SUMMARY_SELECT },
} as const;

const SCHEDULING_SELECT = {
  ...BASE_SELECT,
  staff_availability: {
    select: {
      id: true,
      weekday: true,
      available_from: true,
      available_to: true,
      academic_year_id: true,
    },
  },
  staff_scheduling_preferences: {
    select: {
      id: true,
      preference_type: true,
      preference_payload: true,
      priority: true,
      academic_year_id: true,
    },
  },
  teacher_scheduling_configs: {
    select: {
      id: true,
      max_periods_per_week: true,
      max_periods_per_day: true,
      max_supervision_duties_per_week: true,
      academic_year_id: true,
    },
  },
} as const;

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class StaffProfileReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Look up a single staff profile by its primary key.
   * Returns `null` when no matching record exists.
   */
  async findById(tenantId: string, staffProfileId: string): Promise<StaffProfileSummary | null> {
    return this.prisma.staffProfile.findFirst({
      where: { id: staffProfileId, tenant_id: tenantId },
      select: BASE_SELECT,
    }) as Promise<StaffProfileSummary | null>;
  }

  /**
   * Batch-lookup multiple staff profiles by their primary keys.
   * Missing IDs are silently excluded from the result — callers should
   * check the returned array length if they need exact match guarantees.
   */
  async findByIds(tenantId: string, staffProfileIds: string[]): Promise<StaffProfileSummary[]> {
    if (staffProfileIds.length === 0) return [];

    return this.prisma.staffProfile.findMany({
      where: { id: { in: staffProfileIds }, tenant_id: tenantId },
      select: BASE_SELECT,
    }) as Promise<StaffProfileSummary[]>;
  }

  /**
   * Look up a staff profile by the linked user ID.
   * A user may have at most one staff profile per tenant.
   * Returns `null` when no matching record exists.
   */
  async findByUserId(tenantId: string, userId: string): Promise<StaffProfileSummary | null> {
    return this.prisma.staffProfile.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: BASE_SELECT,
    }) as Promise<StaffProfileSummary | null>;
  }

  /**
   * Return all staff profiles with `employment_status = 'active'` for a tenant.
   * Useful for dropdowns, assignment pickers, and dashboard counts.
   */
  async findActiveStaff(tenantId: string): Promise<StaffProfileSummary[]> {
    return this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId, employment_status: 'active' },
      select: BASE_SELECT,
      orderBy: { user: { first_name: 'asc' } },
    }) as Promise<StaffProfileSummary[]>;
  }

  /**
   * Return staff profiles enriched with scheduling-related data:
   * availability windows, scheduling preferences, and teacher scheduling configs.
   *
   * Intended for the scheduling engine and substitution workflows that need
   * staff availability/preference data alongside identity information.
   */
  async findStaffWithSchedulingInfo(
    tenantId: string,
    staffProfileIds: string[],
  ): Promise<StaffProfileWithScheduling[]> {
    if (staffProfileIds.length === 0) return [];

    return this.prisma.staffProfile.findMany({
      where: { id: { in: staffProfileIds }, tenant_id: tenantId },
      select: SCHEDULING_SELECT,
    }) as Promise<StaffProfileWithScheduling[]>;
  }

  /**
   * Resolve a staff profile ID from a user ID. Returns the profile's primary key.
   * Throws NotFoundException if no staff profile exists for the user at this tenant.
   */
  async resolveProfileId(tenantId: string, userId: string): Promise<string> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `No staff profile found for user "${userId}" at this tenant`,
      });
    }

    return profile.id;
  }

  /**
   * Assert that a staff profile exists for the given tenant. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: { id: profileId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'STAFF_PROFILE_NOT_FOUND',
        message: `Staff profile with id "${profileId}" not found`,
      });
    }
  }
}
