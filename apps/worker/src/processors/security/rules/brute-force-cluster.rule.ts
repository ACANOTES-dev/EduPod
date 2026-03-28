import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Brute-force cluster detection ───────────────────────────────────────────
// Flags any IP address that caused 5+ account lockouts within 1 hour.
// Indicates a coordinated brute-force attack from a single origin.

const SCAN_WINDOW_MINUTES = 60;
const LOCKOUT_THRESHOLD = 5;

interface ClusterRow {
  ip_address: string;
  lockout_count: bigint;
}

export class BruteForceClusterRule implements DetectionRule {
  readonly name = 'brute_force_cluster';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<ClusterRow[]>`
      SELECT ip_address, COUNT(*) as lockout_count
      FROM audit_logs
      WHERE action = 'brute_force_lockout'
        AND created_at >= ${since}
      GROUP BY ip_address
      HAVING COUNT(*) >= ${LOCKOUT_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'brute_force_cluster',
      severity: 'high',
      description: `IP ${row.ip_address} triggered ${Number(row.lockout_count)} account lockouts in ${SCAN_WINDOW_MINUTES} minutes`,
      affected_tenants: [],
      metadata: {
        ip_address: row.ip_address,
        lockout_count: Number(row.lockout_count),
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
