import { Injectable } from '@nestjs/common';

import { DEFAULT_MESSAGING_POLICY_MATRIX, MESSAGING_ROLES } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * `(sender_role, recipient_role)` keys. Kept as a string so the map is cheap
 * to JSON-stringify for debugging and to snapshot for tests.
 */
export type PolicyMatrixKey = `${MessagingRole}:${MessagingRole}`;
export type PolicyMatrix = Map<PolicyMatrixKey, boolean>;

/**
 * Internal cache entry — `matrix` plus its eviction deadline. We use a plain
 * `Map` rather than an LRU library because the dataset is bounded by the
 * number of tenants (small, tens to hundreds) and we already churn it on
 * explicit invalidation from `setCell` / `resetToDefaults`.
 */
interface CacheEntry {
  matrix: PolicyMatrix;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

export function buildMatrixKey(sender: MessagingRole, recipient: MessagingRole): PolicyMatrixKey {
  return `${sender}:${recipient}` as const;
}

/**
 * TenantMessagingPolicyRepository — typed, cached wrapper over the
 * `tenant_messaging_policy` table.
 *
 * The table is seeded for every tenant at creation time (impl 01 — 81 rows
 * per tenant corresponding to the 9x9 role grid). This repository is the
 * only place the policy service reads/writes those rows.
 *
 * Caching strategy:
 *   - Per-tenant matrix is cached in-memory for 5 minutes.
 *   - `setCell` and `resetToDefaults` invalidate only the affected tenant.
 *   - Cache is bounded by the number of tenants. We don't evict on size.
 *   - Cache is process-local — we rely on the fact that each API pod can
 *     tolerate a 5-minute stale window on a rare manual policy edit.
 *
 * All writes flow through the RLS middleware via
 * `createRlsClient(this.prisma, { tenant_id }).$transaction(...)`.
 */
@Injectable()
export class TenantMessagingPolicyRepository {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fetch the full 81-cell matrix for a tenant. Returns a dense map — any
   * pair missing from the DB defaults to `false` (deny). Callers should
   * treat the result as read-only.
   */
  async getMatrix(tenantId: string): Promise<PolicyMatrix> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > now) {
      return cached.matrix;
    }

    const rows = await this.prisma.tenantMessagingPolicy.findMany({
      where: { tenant_id: tenantId },
      select: { sender_role: true, recipient_role: true, allowed: true },
    });

    // Seed every pair with `false` so a missing row is always deny.
    const matrix: PolicyMatrix = new Map();
    for (const sender of MESSAGING_ROLES) {
      for (const recipient of MESSAGING_ROLES) {
        matrix.set(buildMatrixKey(sender, recipient), false);
      }
    }
    for (const row of rows) {
      matrix.set(buildMatrixKey(row.sender_role, row.recipient_role), row.allowed);
    }

    this.cache.set(tenantId, { matrix, expiresAt: now + TTL_MS });
    return matrix;
  }

  /**
   * Upsert a single cell. Invalidates the tenant cache.
   */
  async setCell(
    tenantId: string,
    sender: MessagingRole,
    recipient: MessagingRole,
    allowed: boolean,
  ): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.tenantMessagingPolicy.upsert({
        where: {
          uniq_messaging_policy_pair: {
            tenant_id: tenantId,
            sender_role: sender,
            recipient_role: recipient,
          },
        },
        update: { allowed },
        create: {
          tenant_id: tenantId,
          sender_role: sender,
          recipient_role: recipient,
          allowed,
        },
      });
    });

    this.invalidate(tenantId);
  }

  /**
   * Reset the entire matrix for a tenant back to the shipped defaults
   * (`DEFAULT_MESSAGING_POLICY_MATRIX`). Executes as one interactive
   * transaction so the grid is never torn.
   */
  async resetToDefaults(tenantId: string): Promise<void> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      for (const sender of MESSAGING_ROLES) {
        for (const recipient of MESSAGING_ROLES) {
          const allowed = DEFAULT_MESSAGING_POLICY_MATRIX[sender][recipient];
          await db.tenantMessagingPolicy.upsert({
            where: {
              uniq_messaging_policy_pair: {
                tenant_id: tenantId,
                sender_role: sender,
                recipient_role: recipient,
              },
            },
            update: { allowed },
            create: {
              tenant_id: tenantId,
              sender_role: sender,
              recipient_role: recipient,
              allowed,
            },
          });
        }
      }
    });

    this.invalidate(tenantId);
  }

  /** Drop a tenant's cached matrix — next `getMatrix` reloads from DB. */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /** Test helper — clear all cached matrices. Not for production code paths. */
  clearAllForTest(): void {
    this.cache.clear();
  }
}
