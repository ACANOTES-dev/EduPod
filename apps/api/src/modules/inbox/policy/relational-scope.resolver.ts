import { Injectable } from '@nestjs/common';

import type { MessagingRole } from '@school/shared/inbox';

import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { ParentReadFacade } from '../../parents/parent-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';

/**
 * RelationalScopeResolver — the hard-coded relational constraints from
 * `PLAN.md` §4 Layer 2. These are invariants of the school model and CANNOT
 * be weakened by any tenant-level configuration. A teacher messaging another
 * teacher's parents is a privacy breach regardless of how the messaging
 * grid is configured; the policy engine rejects it here.
 *
 * The rules (sender → recipient):
 *
 *   admin tier → *        : always reachable
 *   office   → *          : always reachable
 *   finance  → *          : always reachable
 *   nurse    → *          : always reachable
 *   teacher  → teacher    : always reachable
 *   teacher  → parent     : recipient must be a parent of a student
 *                           currently enrolled in a class taught by sender
 *   teacher  → student    : recipient must be a student currently enrolled
 *                           in a class taught by sender
 *   parent   → admin tier : always reachable
 *   parent   → office/finance/nurse : always reachable
 *   parent   → teacher    : recipient must teach a class containing a child
 *                           of sender
 *   student  → admin tier : always reachable
 *   student  → teacher    : recipient must teach a class the sender is in
 *   any      → unmapped   : deny
 *
 * Implementation notes:
 *
 *   - Delegation to read facades only. This file MUST NOT reach into another
 *     module's Prisma directly.
 *   - Per-request cache is optional; callers pass a `Map` to dedupe lookups
 *     when the same (sender, recipient) pair appears multiple times in the
 *     same policy evaluation (e.g. an audience with duplicates).
 *   - The cache key includes both roles because the rule depends on them.
 *     A single tuple of `(senderId, recipientId)` is NOT sufficient —
 *     e.g. parent→teacher is subject to a scope but teacher→parent is too.
 *   - `canReachBatch` is the hot path: a teacher composing to "all parents
 *     in my classes" should be one DB round trip, not N.
 */

const ADMIN_TIER: readonly MessagingRole[] = ['owner', 'principal', 'vice_principal'];
const ALWAYS_REACHABLE_STAFF: readonly MessagingRole[] = ['office', 'finance', 'nurse'];

function isAdminTier(role: MessagingRole): boolean {
  return ADMIN_TIER.includes(role);
}

function isAlwaysReachableStaffSender(role: MessagingRole): boolean {
  return ALWAYS_REACHABLE_STAFF.includes(role);
}

export type RelationalScopeCache = Map<string, boolean>;

function cacheKey(
  senderUserId: string,
  recipientUserId: string,
  senderRole: MessagingRole,
  recipientRole: MessagingRole,
): string {
  return `${senderUserId}:${recipientUserId}:${senderRole}:${recipientRole}`;
}

export interface BatchScopeResult {
  reachable: Set<string>;
  unreachable: Set<string>;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

@Injectable()
export class RelationalScopeResolver {
  constructor(
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  /**
   * Single-pair reachability check. For batches (more than one recipient),
   * prefer `canReachBatch` — it's one DB round trip.
   */
  async canReach(
    senderUserId: string,
    recipientUserId: string,
    senderRole: MessagingRole,
    recipientRole: MessagingRole,
    tenantId: string,
    cache?: RelationalScopeCache,
  ): Promise<boolean> {
    const key = cacheKey(senderUserId, recipientUserId, senderRole, recipientRole);
    if (cache?.has(key)) {
      return cache.get(key) ?? false;
    }

    const result = await this.resolveSingle(
      senderUserId,
      recipientUserId,
      senderRole,
      recipientRole,
      tenantId,
    );
    cache?.set(key, result);
    return result;
  }

  /**
   * Batch reachability check. Partitions the recipient IDs into
   * `reachable` / `unreachable`. Must resolve all recipients in O(1) DB
   * round trips relative to the recipient count.
   *
   * We special-case the branches that can short-circuit without any DB
   * access (admin tier, always-reachable staff senders) before touching
   * Prisma at all.
   */
  async canReachBatch(
    senderUserId: string,
    recipientUserIds: string[],
    senderRole: MessagingRole,
    recipientRole: MessagingRole,
    tenantId: string,
    cache?: RelationalScopeCache,
  ): Promise<BatchScopeResult> {
    const reachable = new Set<string>();
    const unreachable = new Set<string>();
    if (recipientUserIds.length === 0) {
      return { reachable, unreachable };
    }

    // Pre-populate from cache, collect the remainder.
    const toResolve: string[] = [];
    for (const recipientUserId of recipientUserIds) {
      const key = cacheKey(senderUserId, recipientUserId, senderRole, recipientRole);
      if (cache?.has(key)) {
        if (cache.get(key)) reachable.add(recipientUserId);
        else unreachable.add(recipientUserId);
      } else {
        toResolve.push(recipientUserId);
      }
    }
    if (toResolve.length === 0) {
      return { reachable, unreachable };
    }

    // Unconditional senders — no DB access needed.
    if (
      isAdminTier(senderRole) ||
      isAlwaysReachableStaffSender(senderRole) ||
      (senderRole === 'teacher' && recipientRole === 'teacher')
    ) {
      for (const id of toResolve) {
        reachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), true);
      }
      return { reachable, unreachable };
    }

    // Parent/student → admin-tier or always-reachable staff — no DB access needed.
    if (
      (senderRole === 'parent' || senderRole === 'student') &&
      (isAdminTier(recipientRole) || isAlwaysReachableStaffSender(recipientRole))
    ) {
      for (const id of toResolve) {
        reachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), true);
      }
      return { reachable, unreachable };
    }

    // ─── Data-dependent branches ────────────────────────────────────────────

    // Teacher → parent: resolve sender's taught-class roster → students → parents once.
    if (senderRole === 'teacher' && recipientRole === 'parent') {
      const reachableIds = await this.resolveTeacherReachableParentUserIds(senderUserId, tenantId);
      for (const id of toResolve) {
        const ok = reachableIds.has(id);
        if (ok) reachable.add(id);
        else unreachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), ok);
      }
      return { reachable, unreachable };
    }

    // Teacher → student: platform students have no `user_id` in v1 of the
    // schema, so there is currently no reachable student user to talk to.
    // The branch is present for parity with the plan; it will become data-
    // driven when students are provisioned as platform users in a later
    // wave. Return all as unreachable and let the matrix + default-deny
    // kill switches carry the policy decision.
    if (senderRole === 'teacher' && recipientRole === 'student') {
      for (const id of toResolve) {
        unreachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), false);
      }
      return { reachable, unreachable };
    }

    // Parent → teacher: resolve sender's children → classes → teachers once.
    if (senderRole === 'parent' && recipientRole === 'teacher') {
      const reachableIds = await this.resolveParentReachableTeacherUserIds(senderUserId, tenantId);
      for (const id of toResolve) {
        const ok = reachableIds.has(id);
        if (ok) reachable.add(id);
        else unreachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), ok);
      }
      return { reachable, unreachable };
    }

    // Student → teacher: same caveat as teacher → student. Students aren't
    // provisioned as platform users yet, so we have no senderUserId →
    // student row mapping. Return unreachable; the default matrix (student
    // row is entirely OFF) already denies this path at the layer above.
    if (senderRole === 'student' && recipientRole === 'teacher') {
      for (const id of toResolve) {
        unreachable.add(id);
        cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), false);
      }
      return { reachable, unreachable };
    }

    // Parent → parent / student, student → parent / student, unmapped pairs:
    // the relational rules don't sanction these flows in any configuration
    // that Wave 2 ships. Return unreachable and let the matrix / kill
    // switches be the authoritative deny layer in the policy service.
    for (const id of toResolve) {
      unreachable.add(id);
      cache?.set(cacheKey(senderUserId, id, senderRole, recipientRole), false);
    }
    return { reachable, unreachable };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async resolveSingle(
    senderUserId: string,
    recipientUserId: string,
    senderRole: MessagingRole,
    recipientRole: MessagingRole,
    tenantId: string,
  ): Promise<boolean> {
    const { reachable } = await this.canReachBatch(
      senderUserId,
      [recipientUserId],
      senderRole,
      recipientRole,
      tenantId,
    );
    return reachable.has(recipientUserId);
  }

  /**
   * For `teacher → parent`: resolve the set of parent user IDs the teacher
   * may reach via their taught class rosters. One pass per policy
   * evaluation; the set is indexed against each recipient candidate.
   */
  private async resolveTeacherReachableParentUserIds(
    teacherUserId: string,
    tenantId: string,
  ): Promise<Set<string>> {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, teacherUserId);
    if (!staff) return new Set();

    const classIds = await this.classesReadFacade.findClassIdsByStaff(tenantId, staff.id);
    if (classIds.length === 0) return new Set();

    // Collapse all active enrolments in those classes to a distinct student set.
    const studentIdSet = new Set<string>();
    for (const classId of classIds) {
      const studentIds = await this.classesReadFacade.findEnrolledStudentIds(tenantId, classId);
      for (const id of studentIds) studentIdSet.add(id);
    }
    if (studentIdSet.size === 0) return new Set();
    const studentIds = Array.from(studentIdSet);

    const parentIds = await this.studentReadFacade.findParentIdsByStudentIds(tenantId, studentIds);
    if (parentIds.length === 0) return new Set();
    const parents = await this.parentReadFacade.findByIds(tenantId, parentIds);
    const userIds = new Set<string>();
    for (const parent of parents) {
      if (parent.user_id) userIds.add(parent.user_id);
    }
    return userIds;
  }

  /**
   * For `parent → teacher`: resolve the set of staff user IDs the parent
   * may reach via their children's class staff.
   */
  private async resolveParentReachableTeacherUserIds(
    parentUserId: string,
    tenantId: string,
  ): Promise<Set<string>> {
    const parent = await this.parentReadFacade.findByUserId(tenantId, parentUserId);
    if (!parent) return new Set();

    const studentIds = await this.parentReadFacade.findLinkedStudentIds(tenantId, parent.id);
    if (studentIds.length === 0) return new Set();

    const classIds = await this.classesReadFacade.findClassIdsByStudentIds(tenantId, studentIds);
    if (classIds.length === 0) return new Set();

    const staffProfileIds = await this.classesReadFacade.findStaffProfileIdsByClassIds(
      tenantId,
      classIds,
    );
    if (staffProfileIds.length === 0) return new Set();

    const staff = await this.staffProfileReadFacade.findByIds(tenantId, staffProfileIds);
    return new Set(staff.map((s) => s.user_id));
  }
}
