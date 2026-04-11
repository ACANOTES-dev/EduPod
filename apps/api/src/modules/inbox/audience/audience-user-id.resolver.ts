import { Injectable } from '@nestjs/common';

import { ParentReadFacade } from '../../parents/parent-read.facade';
import { RbacReadFacade } from '../../rbac/rbac-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';

/**
 * Shared helpers for converting domain IDs (parent_id, staff_profile_id)
 * into `user_id`s. Providers call through these helpers so the
 * parent→user and staff→user mapping logic lives in one place and every
 * provider returns a consistent, deduped `user_ids` array.
 *
 * Also exposes `buildTenantUniverse` — the union of every active
 * addressable user in a tenant — which the audience composer needs to
 * evaluate `NOT` nodes.
 *
 * Students are intentionally excluded until the Student ↔ User mapping
 * lands in a later wave; the `RelationalScopeResolver` makes the same
 * assumption (see impl 02 completion record). When student users are
 * provisioned, this resolver is the single place the universe needs to
 * be extended.
 */
@Injectable()
export class AudienceUserIdResolver {
  constructor(
    private readonly parentReadFacade: ParentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

  /**
   * Resolve every active parent's `user_id` for the tenant. Parents
   * without a linked user account are excluded — they cannot be
   * messaged in-app.
   */
  async allActiveParentUserIds(tenantId: string): Promise<string[]> {
    const parentIds = await this.parentReadFacade.findAllActiveIds(tenantId);
    return this.parentIdsToUserIds(tenantId, parentIds);
  }

  /**
   * Resolve `user_id`s from a set of parent IDs. Missing/unlinked parents
   * are silently dropped. Safe with empty input.
   */
  async parentIdsToUserIds(tenantId: string, parentIds: string[]): Promise<string[]> {
    if (parentIds.length === 0) return [];
    const contacts = await this.parentReadFacade.findActiveContactsByIds(tenantId, parentIds);
    return dedupe(contacts.map((c) => c.user_id));
  }

  /**
   * Resolve every active staff member's `user_id` for the tenant.
   */
  async allActiveStaffUserIds(tenantId: string): Promise<string[]> {
    const staff = await this.staffProfileReadFacade.findActiveStaff(tenantId);
    return dedupe(staff.map((s) => s.user_id));
  }

  /**
   * Build the tenant-wide universe for `NOT` evaluation.
   * Returns the union of every active parent user and every active
   * staff user in the tenant. Cached by the caller for the duration of
   * a single `resolve` walk.
   */
  async buildTenantUniverse(tenantId: string): Promise<string[]> {
    const [parents, staff] = await Promise.all([
      this.allActiveParentUserIds(tenantId),
      this.allActiveStaffUserIds(tenantId),
    ]);
    return dedupe([...parents, ...staff]);
  }

  /**
   * Filter a candidate user_id list down to those with an active
   * membership at the tenant. Used by `handpicked` to reject user_ids
   * that don't belong to the caller's tenant.
   */
  async filterToTenantMembers(tenantId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await this.rbacReadFacade.findActiveMembershipRolesByUserIds(tenantId, userIds);
    const allowed = new Set(rows.map((r) => r.user_id));
    return userIds.filter((id) => allowed.has(id));
  }
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
