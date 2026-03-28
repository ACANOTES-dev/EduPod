import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Cross-tenant attempt detection ──────────────────────────────────────────
// Any RLS policy violation is critical. These should never occur in normal
// operation — if this rule fires, there is a serious security defect.

const SCAN_WINDOW_MINUTES = 15;

interface RlsViolationRow {
  id: string;
  actor_user_id: string | null;
  tenant_id: string;
  ip_address: string | null;
  created_at: Date;
}

export class CrossTenantAttemptRule implements DetectionRule {
  readonly name = 'cross_tenant_attempt';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<RlsViolationRow[]>`
      SELECT id, actor_user_id, tenant_id, ip_address, created_at
      FROM audit_logs
      WHERE entity_type = 'rls'
        AND action = 'violation'
        AND created_at >= ${since}
    `;

    return rows.map((row) => ({
      incident_type: 'cross_tenant_attempt',
      severity: 'critical',
      description: `RLS violation detected — user ${row.actor_user_id ?? 'unknown'} attempted cross-tenant access`,
      affected_tenants: [row.tenant_id],
      metadata: {
        audit_log_id: row.id,
        actor_user_id: row.actor_user_id,
        ip_address: row.ip_address,
        detected_at: row.created_at.toISOString(),
      },
    }));
  }
}
