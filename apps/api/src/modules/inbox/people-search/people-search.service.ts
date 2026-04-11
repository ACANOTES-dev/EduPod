import { Injectable } from '@nestjs/common';

import type { InboxPeopleSearchResult, MessagingRole } from '@school/shared/inbox';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';
import { MessagingPolicyService } from '../policy/messaging-policy.service';
import { RoleMappingService } from '../policy/role-mapping.service';

/**
 * People search for the compose dialog's recipient picker.
 *
 * Hard constraint: the result list is policy-filtered. A teacher
 * searching for "parent" only sees parents they are currently allowed
 * to start a conversation with under
 * `MessagingPolicyService.canStartConversation`. The same policy path
 * the real send uses — so the picker can never surface a user the
 * sender cannot actually message.
 *
 * Algorithm:
 *   1. Over-fetch candidates from `tenant_membership` joined to `user`
 *      (status=active, search term applied to name/email, sender
 *      excluded).
 *   2. Pass every candidate through `canStartConversation(kind='direct')`
 *      in a single batched call. The policy engine already does one
 *      batch role lookup + one bucketed relational scope check, so N
 *      candidates cost O(1) round trips even for the admin tier.
 *   3. Return only the allowed ones, capped at `limit`.
 *
 * Over-fetch factor is 4× the requested limit so that after policy
 * filtering we still have enough results to show, without making the
 * round trip unbounded. Admin-tier senders skip filtering entirely
 * because they can reach anyone at the tenant.
 */

const DEFAULT_OVERFETCH_MULTIPLIER = 4;
const MAX_CANDIDATES = 200;

const MESSAGING_ROLE_LABELS: Record<MessagingRole, string> = {
  owner: 'Owner',
  principal: 'Principal',
  vice_principal: 'Vice Principal',
  office: 'Office',
  finance: 'Finance',
  nurse: 'Nurse',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
};

interface SearchInput {
  tenantId: string;
  senderUserId: string;
  query: string;
  limit: number;
}

@Injectable()
export class InboxPeopleSearchService {
  constructor(
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly roleMapping: RoleMappingService,
    private readonly policyService: MessagingPolicyService,
  ) {}

  async search(input: SearchInput): Promise<InboxPeopleSearchResult[]> {
    const { tenantId, senderUserId, query, limit } = input;

    const candidates = await this.loadCandidates(tenantId, senderUserId, query, limit);
    if (candidates.length === 0) return [];

    const roleCache = new Map<string, MessagingRole | null>();
    const senderRole = await this.roleMapping.resolveMessagingRole(
      tenantId,
      senderUserId,
      roleCache,
    );
    if (!senderRole) return [];

    const recipientRoles = await this.roleMapping.resolveMessagingRolesBatch(
      tenantId,
      candidates.map((c) => c.user_id),
      roleCache,
    );

    const filtered = await this.filterByPolicy({
      tenantId,
      senderUserId,
      senderRole,
      candidates,
      recipientRoles,
    });

    return filtered.slice(0, limit).map((c) => {
      const role = recipientRoles.get(c.user_id) ?? null;
      return {
        user_id: c.user_id,
        display_name: c.display_name,
        email: c.email,
        role_label: role ? MESSAGING_ROLE_LABELS[role] : 'Staff',
        messaging_role: role ?? 'unknown',
      };
    });
  }

  private async loadCandidates(
    tenantId: string,
    senderUserId: string,
    query: string,
    limit: number,
  ): Promise<Array<{ user_id: string; display_name: string; email: string | null }>> {
    const take = Math.min(MAX_CANDIDATES, limit * DEFAULT_OVERFETCH_MULTIPLIER);
    const rows = await this.rbacReadFacade.searchActiveMembersByName(tenantId, {
      senderUserId,
      query,
      limit: take,
    });
    return rows.map((row) => ({
      user_id: row.user_id,
      display_name: `${row.first_name} ${row.last_name}`.trim(),
      email: row.email,
    }));
  }

  private async filterByPolicy(args: {
    tenantId: string;
    senderUserId: string;
    senderRole: MessagingRole;
    candidates: Array<{ user_id: string; display_name: string; email: string | null }>;
    recipientRoles: Map<string, MessagingRole | null>;
  }): Promise<Array<{ user_id: string; display_name: string; email: string | null }>> {
    const { tenantId, senderUserId, senderRole, candidates, recipientRoles } = args;

    const adminTier = new Set<MessagingRole>(['owner', 'principal', 'vice_principal']);
    if (adminTier.has(senderRole)) {
      return candidates.filter((c) => recipientRoles.get(c.user_id));
    }

    const withRole = candidates.filter((c) => recipientRoles.get(c.user_id));
    if (withRole.length === 0) return [];

    const decision = await this.policyService.canStartConversation({
      tenantId,
      senderUserId,
      recipientUserIds: withRole.map((c) => c.user_id),
      conversationKind: 'direct',
    });

    if (decision.allowed) return withRole;

    const deniedSet = new Set(decision.deniedRecipientIds ?? []);
    return withRole.filter((c) => !deniedSet.has(c.user_id));
  }
}
