import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Unusual access detection ─────────────────────────────────────────────────
// Flags any single user who accessed 100+ student records within the scan
// interval (15 minutes). Grouped by actor + tenant to pinpoint the source.

const SCAN_WINDOW_MINUTES = 15;
const ACCESS_THRESHOLD = 100;

interface AccessRow {
  actor_user_id: string;
  tenant_id: string;
  access_count: bigint;
}

export class UnusualAccessRule implements DetectionRule {
  readonly name = 'unusual_access';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<AccessRow[]>`
      SELECT actor_user_id, tenant_id, COUNT(*) as access_count
      FROM audit_logs
      WHERE metadata_json->>'category' = 'read_access'
        AND entity_type = 'student'
        AND created_at >= ${since}
      GROUP BY actor_user_id, tenant_id
      HAVING COUNT(*) >= ${ACCESS_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'unusual_access',
      severity: 'high',
      description: `User ${row.actor_user_id} accessed ${Number(row.access_count)} student records in ${SCAN_WINDOW_MINUTES} minutes`,
      affected_tenants: [row.tenant_id],
      metadata: {
        actor_user_id: row.actor_user_id,
        access_count: Number(row.access_count),
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
