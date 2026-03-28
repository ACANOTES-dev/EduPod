import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Off-hours bulk access detection ─────────────────────────────────────────
// Flags 50+ record reads between 00:00–05:00 UTC by a single user.
// This is a heuristic — could be enhanced with per-tenant timezone settings.

const SCAN_WINDOW_MINUTES = 15;
const ACCESS_THRESHOLD = 50;
const OFF_HOURS_START = 0;
const OFF_HOURS_END = 5;

interface OffHoursRow {
  actor_user_id: string;
  tenant_id: string;
  access_count: bigint;
}

export class OffHoursBulkAccessRule implements DetectionRule {
  readonly name = 'off_hours_bulk_access';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<OffHoursRow[]>`
      SELECT actor_user_id, tenant_id, COUNT(*) as access_count
      FROM audit_logs
      WHERE metadata_json->>'category' = 'read_access'
        AND created_at >= ${since}
        AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') >= ${OFF_HOURS_START}
        AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') < ${OFF_HOURS_END}
      GROUP BY actor_user_id, tenant_id
      HAVING COUNT(*) >= ${ACCESS_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'off_hours_bulk_access',
      severity: 'medium',
      description: `User ${row.actor_user_id} accessed ${Number(row.access_count)} records between ${OFF_HOURS_START}:00–${OFF_HOURS_END}:00 UTC`,
      affected_tenants: [row.tenant_id],
      metadata: {
        actor_user_id: row.actor_user_id,
        access_count: Number(row.access_count),
        off_hours_range_utc: `${OFF_HOURS_START}:00–${OFF_HOURS_END}:00`,
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
