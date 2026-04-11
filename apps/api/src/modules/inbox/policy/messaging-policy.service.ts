import { Injectable } from '@nestjs/common';

import type { ConversationKind, MessagingRole } from '@school/shared/inbox';

import { PrismaService } from '../../prisma/prisma.service';

import { RelationalScopeResolver, type RelationalScopeCache } from './relational-scope.resolver';
import { RoleMappingService } from './role-mapping.service';
import {
  TenantMessagingPolicyRepository,
  buildMatrixKey,
} from './tenant-messaging-policy.repository';

/**
 * MessagingPolicyService — the single chokepoint that decides whether a
 * given user may start a conversation with a given set of recipients, or
 * reply on an existing conversation.
 *
 * Every inbox send path routes through this service. The service has
 * exactly two public methods: `canStartConversation` and
 * `canReplyToConversation`. No other entry points.
 *
 * Algorithm layers (in order, cheapest-first):
 *
 *   1. Global kill switches — tenant inbox disabled, students/parents
 *      disallowed from initiating.
 *   2. Role-pair matrix — the tenant-configurable 9x9 grid. Missing cells
 *      default to deny.
 *   3. Symmetric kill switches — parent↔parent, student↔student,
 *      student→parent master toggles.
 *   4. Relational scope — teacher↔parent/student, parent↔teacher,
 *      student↔teacher must pass the hard-coded relational constraint
 *      (enforced by `RelationalScopeResolver`).
 *
 * Reply path is different: a reply on a `direct` or `group` thread is
 * always allowed to participants. Replies on a `broadcast` follow the
 * `allow_replies` flag on the conversation. Frozen conversations are
 * always blocked first.
 *
 * See `PLAN.md` §4 for the authoritative spec.
 */

export type PolicyDenialCode =
  | 'MESSAGING_DISABLED_FOR_TENANT'
  | 'STUDENT_INITIATION_DISABLED'
  | 'PARENT_INITIATION_DISABLED'
  | 'ROLE_PAIR_NOT_ALLOWED'
  | 'RELATIONAL_SCOPE_VIOLATED'
  | 'PARENT_TO_PARENT_DISABLED'
  | 'STUDENT_TO_STUDENT_DISABLED'
  | 'STUDENT_TO_PARENT_DISABLED'
  | 'CONVERSATION_FROZEN'
  | 'NOT_PARTICIPANT'
  | 'REPLIES_NOT_ALLOWED_ON_BROADCAST'
  | 'UNKNOWN_SENDER_ROLE'
  | 'UNKNOWN_RECIPIENT_ROLE';

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: PolicyDenialCode; deniedRecipientIds?: string[] };

export interface CanStartConversationInput {
  tenantId: string;
  senderUserId: string;
  recipientUserIds: string[];
  conversationKind: ConversationKind;
  /**
   * Used by the broadcast send path — the audience engine has already
   * produced a set of recipients that are, by construction, relationally
   * reachable (e.g. `class_parents` for a teacher). Skip the per-recipient
   * relational-scope check in that case to avoid double-spending the DB.
   */
  skipRelationalCheck?: boolean;
}

export interface CanReplyInput {
  tenantId: string;
  senderUserId: string;
  conversationId: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class MessagingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyRepository: TenantMessagingPolicyRepository,
    private readonly roleMapping: RoleMappingService,
    private readonly relationalScope: RelationalScopeResolver,
  ) {}

  /**
   * Decide whether a sender may start a conversation to the given set of
   * recipients. See the module-level doc for the ordered layer checks.
   */
  async canStartConversation(input: CanStartConversationInput): Promise<PolicyDecision> {
    const { tenantId, senderUserId, recipientUserIds, conversationKind, skipRelationalCheck } =
      input;

    // Layer 1a — Master switch.
    const settings = await this.prisma.tenantSettingsInbox.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!settings || !settings.messaging_enabled) {
      return { allowed: false, reason: 'MESSAGING_DISABLED_FOR_TENANT' };
    }

    // Per-request caches so large audiences don't refetch.
    const roleCache = new Map<string, MessagingRole | null>();
    const scopeCache: RelationalScopeCache = new Map();

    // Layer 1b — Resolve sender role and apply initiation kill switches.
    const senderRole = await this.roleMapping.resolveMessagingRole(
      tenantId,
      senderUserId,
      roleCache,
    );
    if (!senderRole) {
      return { allowed: false, reason: 'UNKNOWN_SENDER_ROLE' };
    }
    if (senderRole === 'student' && !settings.students_can_initiate) {
      return { allowed: false, reason: 'STUDENT_INITIATION_DISABLED' };
    }
    if (senderRole === 'parent' && !settings.parents_can_initiate) {
      return { allowed: false, reason: 'PARENT_INITIATION_DISABLED' };
    }

    if (recipientUserIds.length === 0) {
      // Degenerate audience — caller bug. Don't let it slip through.
      return { allowed: false, reason: 'ROLE_PAIR_NOT_ALLOWED', deniedRecipientIds: [] };
    }

    // Layer 2 — Pre-load the tenant policy matrix once.
    const matrix = await this.policyRepository.getMatrix(tenantId);

    // Layer 3/4 — Resolve all recipients' roles in one batch.
    const recipientRoles = await this.roleMapping.resolveMessagingRolesBatch(
      tenantId,
      recipientUserIds,
      roleCache,
    );

    // Partition recipients by resolved role so we can run one batch
    // relational-scope check per (senderRole, recipientRole) bucket.
    const byRecipientRole = new Map<MessagingRole, string[]>();
    const unknownRoleRecipients: string[] = [];
    for (const id of recipientUserIds) {
      const role = recipientRoles.get(id);
      if (!role) {
        unknownRoleRecipients.push(id);
        continue;
      }
      const bucket = byRecipientRole.get(role);
      if (bucket) bucket.push(id);
      else byRecipientRole.set(role, [id]);
    }
    if (unknownRoleRecipients.length > 0) {
      return {
        allowed: false,
        reason: 'UNKNOWN_RECIPIENT_ROLE',
        deniedRecipientIds: unknownRoleRecipients,
      };
    }

    // Broadcasts skip the relational check when the audience engine has
    // already pre-filtered recipients; see CanStartConversationInput.skipRelationalCheck.
    const isBroadcast = conversationKind === 'broadcast';
    const effectiveSkipRelationalCheck = skipRelationalCheck ?? false;
    // Admin tier senders always skip relational checks — admin can reach anyone.
    const senderIsAdminTier =
      senderRole === 'owner' || senderRole === 'principal' || senderRole === 'vice_principal';

    const denied: string[] = [];
    let firstReason: PolicyDenialCode | null = null;

    const recordDenial = (reason: PolicyDenialCode, ids: string[]): void => {
      if (ids.length === 0) return;
      if (!firstReason) firstReason = reason;
      for (const id of ids) denied.push(id);
    };

    for (const [recipientRole, ids] of byRecipientRole) {
      // Matrix cell check.
      const cellAllowed = matrix.get(buildMatrixKey(senderRole, recipientRole)) === true;
      if (!cellAllowed) {
        recordDenial('ROLE_PAIR_NOT_ALLOWED', ids);
        continue;
      }

      // Symmetric kill switches.
      if (
        senderRole === 'parent' &&
        recipientRole === 'parent' &&
        !settings.parent_to_parent_messaging
      ) {
        recordDenial('PARENT_TO_PARENT_DISABLED', ids);
        continue;
      }
      if (
        senderRole === 'student' &&
        recipientRole === 'student' &&
        !settings.student_to_student_messaging
      ) {
        recordDenial('STUDENT_TO_STUDENT_DISABLED', ids);
        continue;
      }
      if (
        senderRole === 'student' &&
        recipientRole === 'parent' &&
        !settings.student_to_parent_messaging
      ) {
        recordDenial('STUDENT_TO_PARENT_DISABLED', ids);
        continue;
      }

      // Relational scope — expensive, runs once per bucket, skipped for
      // admin tier senders or when the broadcast audience engine already
      // pre-filtered. Skip for broadcasts as well, per the plan (admin-tier
      // broadcasts are always allowed; teacher broadcasts rely on the
      // audience engine's pre-filter).
      if (senderIsAdminTier || effectiveSkipRelationalCheck || isBroadcast) {
        continue;
      }

      const { unreachable } = await this.relationalScope.canReachBatch(
        senderUserId,
        ids,
        senderRole,
        recipientRole,
        tenantId,
        scopeCache,
      );
      if (unreachable.size > 0) {
        recordDenial('RELATIONAL_SCOPE_VIOLATED', Array.from(unreachable));
      }
    }

    if (denied.length === 0) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: firstReason ?? 'ROLE_PAIR_NOT_ALLOWED',
      deniedRecipientIds: denied,
    };
  }

  /**
   * Decide whether a sender may reply on an existing conversation. The
   * matrix does not apply — once a participant can see a thread, the
   * reply rule is governed by conversation kind and `allow_replies`.
   */
  async canReplyToConversation(input: CanReplyInput): Promise<PolicyDecision> {
    const { tenantId, senderUserId, conversationId } = input;

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenant_id: tenantId },
      select: {
        id: true,
        kind: true,
        allow_replies: true,
        frozen_at: true,
        created_by_user_id: true,
      },
    });
    if (!conversation) {
      return { allowed: false, reason: 'NOT_PARTICIPANT' };
    }

    if (conversation.frozen_at) {
      return { allowed: false, reason: 'CONVERSATION_FROZEN' };
    }

    // Participation gate: must be an active participant on the thread.
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { conversation_id: conversationId, user_id: senderUserId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!participant) {
      return { allowed: false, reason: 'NOT_PARTICIPANT' };
    }

    if (conversation.kind === 'direct' || conversation.kind === 'group') {
      return { allowed: true };
    }

    // broadcast — the sender may always reply to their own broadcast
    // (that's how they fan replies out into per-recipient threads).
    if (conversation.created_by_user_id === senderUserId) {
      return { allowed: true };
    }

    if (!conversation.allow_replies) {
      return { allowed: false, reason: 'REPLIES_NOT_ALLOWED_ON_BROADCAST' };
    }
    return { allowed: true };
  }
}
