import type { PrismaClient } from '@prisma/client';

import type { DetectionRule, Violation } from './detection-rule.interface';

// ─── Authentication spike detection ──────────────────────────────────────────
// Flags 10+ failed login attempts for the same email within the scan window.
// Indicates credential stuffing or targeted brute-force against a single account.

const SCAN_WINDOW_MINUTES = 15;
const FAILURE_THRESHOLD = 10;

interface FailureRow {
  email: string;
  failure_count: bigint;
}

export class AuthSpikeRule implements DetectionRule {
  readonly name = 'auth_spike';

  async evaluate(prisma: PrismaClient): Promise<Violation[]> {
    const since = new Date(Date.now() - SCAN_WINDOW_MINUTES * 60 * 1000);

    const rows = await prisma.$queryRaw<FailureRow[]>`
      SELECT metadata_json->>'attempted_email' as email, COUNT(*) as failure_count
      FROM audit_logs
      WHERE action = 'login_failure'
        AND created_at >= ${since}
      GROUP BY metadata_json->>'attempted_email'
      HAVING COUNT(*) >= ${FAILURE_THRESHOLD}
    `;

    return rows.map((row) => ({
      incident_type: 'auth_spike',
      severity: 'medium',
      description: `${Number(row.failure_count)} failed login attempts for ${row.email} in ${SCAN_WINDOW_MINUTES} minutes`,
      affected_tenants: [],
      metadata: {
        email: row.email,
        failure_count: Number(row.failure_count),
        window_minutes: SCAN_WINDOW_MINUTES,
      },
    }));
  }
}
