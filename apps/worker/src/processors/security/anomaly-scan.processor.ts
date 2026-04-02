import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { CrossTenantSystemJob } from '../../base/cross-tenant-system-job';
import { QUEUE_NAMES } from '../../base/queue.constants';
import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

import { AuthSpikeRule } from './rules/auth-spike.rule';
import { BruteForceClusterRule } from './rules/brute-force-cluster.rule';
import { CrossTenantAttemptRule } from './rules/cross-tenant-attempt.rule';
import { DataExportSpikeRule } from './rules/data-export-spike.rule';
import type { DetectionRule, Violation } from './rules/detection-rule.interface';
import { OffHoursBulkAccessRule } from './rules/off-hours-bulk-access.rule';
import { PermissionProbeRule } from './rules/permission-probe.rule';
import { UnusualAccessRule } from './rules/unusual-access.rule';

export const ANOMALY_SCAN_JOB = 'security:anomaly-scan';

// ─── Row shapes (until Prisma client is regenerated with Phase J models) ─────

interface IncidentRow {
  id: string;
  incident_type: string;
  status: string;
  detected_at: Date;
}

// ─── Prisma delegate shapes for type-safe access ────────────────────────────

interface SecurityIncidentDelegate {
  findFirst: (args: Record<string, unknown>) => Promise<IncidentRow | null>;
  create: (args: Record<string, unknown>) => Promise<IncidentRow>;
  update: (args: Record<string, unknown>) => Promise<IncidentRow>;
}

interface SecurityIncidentEventDelegate {
  create: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── Job ─────────────────────────────────────────────────────────────────────
//
// Runs all breach detection rules and creates or updates SecurityIncident records.
// Platform-level job — extends CrossTenantSystemJob (intentionally no RLS context),
// because it scans across all tenants in one pass.

class AnomalyScanJob extends CrossTenantSystemJob {
  constructor(prisma: PrismaClient) {
    super(prisma, AnomalyScanJob.name);
  }

  // ─── Typed accessors for pending Prisma models ─────────────────────────

  private get incidents(): SecurityIncidentDelegate {
    return this.prisma.securityIncident as unknown as SecurityIncidentDelegate;
  }

  private get incidentEvents(): SecurityIncidentEventDelegate {
    return this.prisma.securityIncidentEvent as unknown as SecurityIncidentEventDelegate;
  }

  // ─── Main run ──────────────────────────────────────────────────────────

  protected async runSystemJob(): Promise<void> {
    const rules: DetectionRule[] = [
      new UnusualAccessRule(),
      new AuthSpikeRule(),
      new CrossTenantAttemptRule(),
      new PermissionProbeRule(),
      new BruteForceClusterRule(),
      new OffHoursBulkAccessRule(),
      new DataExportSpikeRule(),
    ];

    let totalViolations = 0;
    let incidentsCreated = 0;
    let incidentsUpdated = 0;

    for (const rule of rules) {
      let violations: Violation[];

      try {
        violations = await rule.evaluate(this.prisma);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Rule "${rule.name}" failed: ${message}`);
        continue;
      }

      totalViolations += violations.length;

      for (const violation of violations) {
        const result = await this.processViolation(violation);
        if (result === 'created') incidentsCreated++;
        else incidentsUpdated++;
      }
    }

    this.logger.log(
      `Anomaly scan complete: ${rules.length} rules checked, ${totalViolations} violations found, ` +
        `${incidentsCreated} incidents created, ${incidentsUpdated} incidents updated`,
    );
  }

  // ─── Violation processing ─────────────────────────────────────────────────

  private async processViolation(violation: Violation): Promise<'created' | 'updated'> {
    const existing = await this.incidents.findFirst({
      where: {
        incident_type: violation.incident_type,
        status: { notIn: ['resolved', 'closed'] },
      },
      orderBy: { detected_at: 'desc' },
    });

    if (existing) {
      await this.incidentEvents.create({
        data: {
          incident_id: existing.id,
          event_type: 'evidence',
          description: `Anomaly re-detected: ${violation.description}`,
          created_by_user_id: SYSTEM_USER_SENTINEL,
        },
      });

      await this.incidents.update({
        where: { id: existing.id },
        data: { detected_at: new Date() },
      });

      return 'updated';
    }

    await this.incidents.create({
      data: {
        severity: violation.severity,
        incident_type: violation.incident_type,
        description: violation.description,
        affected_tenants: violation.affected_tenants,
        data_categories_affected: [],
        status: 'detected',
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });

    return 'created';
  }
}

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.SECURITY, { lockDuration: 300_000 })
export class AnomalyScanProcessor extends WorkerHost {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ANOMALY_SCAN_JOB) return;

    await new AnomalyScanJob(this.prisma).execute();
  }
}
