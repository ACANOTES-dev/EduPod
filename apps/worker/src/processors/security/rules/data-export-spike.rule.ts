import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Data export spike detection ─────────────────────────────────────────────
// Flags any user who performed 3+ export operations within 1 hour.
// Indicates potential data exfiltration or excessive bulk downloads.

const SCAN_WINDOW_MINUTES = 60;
const EXPORT_THRESHOLD = 3;

interface ExportRow {
  actor_user_id: string;
  tenant_id: string;
  export_count: bigint;
}

export class DataExportSpikeRule implements DetectionRule {
  readonly name = 'data_export_spike';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<ExportRow[]>`
      SELECT actor_user_id, tenant_id, COUNT(*) as export_count
      FROM audit_logs
      WHERE action LIKE '%export%'
        AND created_at >= ${since}
      GROUP BY actor_user_id, tenant_id
      HAVING COUNT(*) >= ${EXPORT_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'data_export_spike',
      severity: 'medium',
      description: `User ${row.actor_user_id} performed ${Number(row.export_count)} export operations in ${SCAN_WINDOW_MINUTES} minutes`,
      affected_tenants: [row.tenant_id],
      metadata: {
        actor_user_id: row.actor_user_id,
        export_count: Number(row.export_count),
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
