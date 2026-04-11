import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import type { OversightAction } from '@school/shared/inbox';

/**
 * OversightAuditService — the only writer to `oversight_access_log`.
 *
 * Every oversight method on `InboxOversightService` calls `log()` as part
 * of the same interactive RLS transaction that performs the read or
 * mutation. This coupling is intentional: a successful oversight action
 * with a missing audit row is worse than a rejected oversight action. If
 * the insert fails, the outer transaction rolls back and nothing happens.
 *
 * The audit table is append-only — there is no `update` / `delete`
 * surface here, and the Prisma schema does not expose one.
 */
export interface LogOversightInput {
  tenantId: string;
  actorUserId: string;
  action: OversightAction;
  conversationId?: string | null;
  messageFlagId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

@Injectable()
export class OversightAuditService {
  /**
   * Append an audit entry. Must be called inside an RLS-scoped
   * interactive transaction; the caller owns the transaction handle so a
   * rollback on a subsequent failure also rolls back the audit row.
   */
  async log(tx: PrismaClient, input: LogOversightInput): Promise<void> {
    await tx.oversightAccessLog.create({
      data: {
        tenant_id: input.tenantId,
        actor_user_id: input.actorUserId,
        action: input.action,
        conversation_id: input.conversationId ?? null,
        message_flag_id: input.messageFlagId ?? null,
        metadata_json: input.metadata ?? Prisma.JsonNull,
      },
    });
  }
}
