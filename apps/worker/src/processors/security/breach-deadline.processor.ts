import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

export const BREACH_DEADLINE_JOB = 'security:breach-deadline';

// ─── Row shapes (until Prisma client is regenerated with Phase J models) ─────

interface IncidentRow {
  id: string;
  detected_at: Date;
  severity: string;
  status: string;
  reported_to_dpc_at: Date | null;
}

interface EscalationEventRow {
  id: string;
  description: string;
  event_type: string;
}

// ─── Prisma delegate shapes for type-safe access ────────────────────────────

interface SecurityIncidentDelegate {
  findMany: (args: Record<string, unknown>) => Promise<IncidentRow[]>;
}

interface SecurityIncidentEventDelegate {
  findMany: (args: Record<string, unknown>) => Promise<EscalationEventRow[]>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── Escalation thresholds (hours) ───────────────────────────────────────────

const ESCALATION_12H = 12;
const ESCALATION_48H = 48;
const ESCALATION_72H = 72;

// ─── Processor ────────────────────────────────────────────────────────────────
//
// Runs hourly. Checks all open high/critical security incidents and adds
// escalation events at 12h, 48h, and 72h marks per GDPR Article 33 timelines.
// This is a platform-level job — no TenantAwareJob or RLS context needed.

@Processor(QUEUE_NAMES.SECURITY)
export class BreachDeadlineProcessor extends WorkerHost {
  private readonly logger = new Logger(BreachDeadlineProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  // ─── Typed accessors for pending Prisma models ─────────────────────────

  private get incidents(): SecurityIncidentDelegate {
    return this.prisma.securityIncident as unknown as SecurityIncidentDelegate;
  }

  private get incidentEvents(): SecurityIncidentEventDelegate {
    return this.prisma.securityIncidentEvent as unknown as SecurityIncidentEventDelegate;
  }

  // ─── Main process ──────────────────────────────────────────────────────

  async process(job: Job): Promise<void> {
    if (job.name !== BREACH_DEADLINE_JOB) return;

    const incidents = await this.incidents.findMany({
      where: {
        status: { notIn: ['resolved', 'closed'] },
        severity: { in: ['high', 'critical'] },
      },
    });

    let escalationsApplied = 0;

    for (const incident of incidents) {
      const hoursElapsed =
        (Date.now() - incident.detected_at.getTime()) / (1000 * 60 * 60);

      const existingEscalations = await this.incidentEvents.findMany({
        where: { incident_id: incident.id, event_type: 'escalation' },
      });

      const has12h = existingEscalations.some((e) =>
        e.description.includes('12-hour'),
      );
      const has48h = existingEscalations.some((e) =>
        e.description.includes('48-hour'),
      );
      const has72h = existingEscalations.some((e) =>
        e.description.includes('72-hour'),
      );

      // ─── 12-hour checkpoint ───────────────────────────────────────────

      if (hoursElapsed >= ESCALATION_12H && !has12h) {
        await this.addEscalation(
          incident.id,
          '12-hour mark: incident not yet acknowledged',
        );
        escalationsApplied++;
      }

      // ─── 48-hour checkpoint ───────────────────────────────────────────

      if (hoursElapsed >= ESCALATION_48H && !has48h) {
        await this.addEscalation(
          incident.id,
          '48-hour warning: 24 hours remaining for DPC notification',
        );
        escalationsApplied++;
      }

      // ─── 72-hour checkpoint ───────────────────────────────────────────

      if (
        hoursElapsed >= ESCALATION_72H &&
        !has72h &&
        incident.reported_to_dpc_at === null
      ) {
        await this.addEscalation(
          incident.id,
          'CRITICAL: 72-hour DPC notification deadline reached',
        );
        escalationsApplied++;
      }
    }

    this.logger.log(
      `Breach deadline check complete: ${incidents.length} incidents reviewed, ${escalationsApplied} escalations applied`,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async addEscalation(
    incidentId: string,
    description: string,
  ): Promise<void> {
    await this.incidentEvents.create({
      data: {
        incident_id: incidentId,
        event_type: 'escalation',
        description,
        created_by_user_id: SYSTEM_USER_SENTINEL,
      },
    });
  }
}
