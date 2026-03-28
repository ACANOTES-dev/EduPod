import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Permission probe detection ──────────────────────────────────────────────
// Flags any user who triggers 20+ permission-denied events in the scan window.
// Indicates either misconfiguration or deliberate probing of access boundaries.

const SCAN_WINDOW_MINUTES = 15;
const DENIED_THRESHOLD = 20;

interface ProbeRow {
  actor_user_id: string;
  tenant_id: string;
  denied_count: bigint;
}

export class PermissionProbeRule implements DetectionRule {
  readonly name = 'permission_probe';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<ProbeRow[]>`
      SELECT actor_user_id, tenant_id, COUNT(*) as denied_count
      FROM audit_logs
      WHERE action = 'permission_denied'
        AND created_at >= ${since}
      GROUP BY actor_user_id, tenant_id
      HAVING COUNT(*) >= ${DENIED_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'permission_probe',
      severity: 'high',
      description: `User ${row.actor_user_id} triggered ${Number(row.denied_count)} permission denials in ${SCAN_WINDOW_MINUTES} minutes`,
      affected_tenants: [row.tenant_id],
      metadata: {
        actor_user_id: row.actor_user_id,
        denied_count: Number(row.denied_count),
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
