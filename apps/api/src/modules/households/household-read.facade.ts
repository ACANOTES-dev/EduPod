/**
 * HouseholdReadFacade — Centralized read-only access to household data.
 *
 * PURPOSE:
 * Other modules (compliance, finance, communications, engagement, reports,
 * early-warning, imports, students) frequently need to look up household records,
 * household parents, and emergency contacts. This facade provides a single,
 * well-typed entry point for all cross-module household reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Household summary fields — display, finance lookups, cross-module refs. */
const HOUSEHOLD_SUMMARY_SELECT = {
  id: true,
  tenant_id: true,
  household_name: true,
  household_number: true,
  primary_billing_parent_id: true,
  address_line_1: true,
  address_line_2: true,
  city: true,
  country: true,
  postal_code: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

/** Household with billing parent details — finance statements. */
const HOUSEHOLD_WITH_BILLING_PARENT_SELECT = {
  ...HOUSEHOLD_SUMMARY_SELECT,
  billing_parent: {
    select: { id: true, first_name: true, last_name: true },
  },
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface HouseholdSummaryRow {
  id: string;
  tenant_id: string;
  household_name: string;
  household_number: string | null;
  primary_billing_parent_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface HouseholdWithBillingParentRow extends HouseholdSummaryRow {
  billing_parent: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface HouseholdParentLinkRow {
  household_id: string;
  parent_id: string;
  role_label: string | null;
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
  };
}

export interface HouseholdEmergencyContactRow {
  id: string;
  household_id: string;
  contact_name: string;
  phone: string;
  relationship_label: string;
  display_order: number;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class HouseholdReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a single household by ID with summary fields.
   * Returns `null` if not found.
   */
  async findById(tenantId: string, householdId: string): Promise<HouseholdSummaryRow | null> {
    return this.prisma.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: HOUSEHOLD_SUMMARY_SELECT,
    });
  }

  /**
   * Find a household with billing parent details — used by finance statements.
   */
  async findByIdWithBillingParent(
    tenantId: string,
    householdId: string,
  ): Promise<HouseholdWithBillingParentRow | null> {
    return this.prisma.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: HOUSEHOLD_WITH_BILLING_PARENT_SELECT,
    });
  }

  /**
   * Assert that a household exists for the given tenant. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string, householdId: string): Promise<void> {
    const found = await this.prisma.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${householdId}" not found`,
      });
    }
  }

  // ─── Household Parents ──────────────────────────────────────────────────────

  /**
   * Get all parent links for a household with parent display fields.
   * Used by DSAR traversal, audience resolution, and compliance.
   */
  async findParentsForHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<HouseholdParentLinkRow[]> {
    return this.prisma.householdParent.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      select: {
        household_id: true,
        parent_id: true,
        role_label: true,
        parent: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  /**
   * Get all household links for a parent — used by DSAR parent data traversal.
   * Returns household memberships with household display fields.
   */
  async findHouseholdsForParent(
    tenantId: string,
    parentId: string,
  ): Promise<
    Array<{
      household_id: string;
      parent_id: string;
      household: { id: string; household_name: string };
    }>
  > {
    return this.prisma.householdParent.findMany({
      where: { parent_id: parentId, tenant_id: tenantId },
      select: {
        household_id: true,
        parent_id: true,
        household: {
          select: { id: true, household_name: true },
        },
      },
    });
  }

  /**
   * Get parent IDs linked to the given households.
   * Used by audience resolution for household-scoped broadcasts.
   */
  async findParentIdsByHouseholdIds(tenantId: string, householdIds: string[]): Promise<string[]> {
    if (householdIds.length === 0) return [];

    const links = await this.prisma.householdParent.findMany({
      where: { tenant_id: tenantId, household_id: { in: householdIds } },
      select: { parent_id: true },
    });

    return [...new Set(links.map((hp) => hp.parent_id))];
  }

  // ─── Emergency Contacts ─────────────────────────────────────────────────────

  /**
   * Get all emergency contacts for a household, ordered by display_order.
   * Used by DSAR household data traversal.
   */
  async findEmergencyContacts(
    tenantId: string,
    householdId: string,
  ): Promise<HouseholdEmergencyContactRow[]> {
    return this.prisma.householdEmergencyContact.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        household_id: true,
        contact_name: true,
        phone: true,
        relationship_label: true,
        display_order: true,
      },
      orderBy: { display_order: 'asc' },
    });
  }
}
