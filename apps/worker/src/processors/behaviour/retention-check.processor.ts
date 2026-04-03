import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { behaviourSettingsSchema } from '@school/shared/behaviour';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job constants ──────────────────────────────────────────────────────────

export const BEHAVIOUR_RETENTION_CHECK_JOB = 'behaviour:retention-check';

export interface RetentionCheckPayload extends TenantJobPayload {
  tenant_id: string;
  dry_run?: boolean;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR)
export class RetentionCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<RetentionCheckPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_RETENTION_CHECK_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${BEHAVIOUR_RETENTION_CHECK_JOB} for tenant ${tenant_id} (dry_run=${job.data.dry_run ?? false})`,
    );

    const worker = new RetentionCheckJob(this.prisma);
    await worker.executeAndReturn(job.data);
  }
}

// ─── Result type ────────────────────────────────────────────────────────────

interface RetentionResult {
  archived_count: number;
  anonymised_count: number;
  held_skipped_count: number;
  held_entities: Array<{ entity_type: string; entity_id: string; hold_reason: string }>;
  exclusion_cases_for_review: number;
  safeguarding_cases_for_review: number;
  guardian_restrictions_expired: number;
}

// ─── Entity retention config ────────────────────────────────────────────────

interface EntityRetentionConfig {
  model: string;
  retentionSettingsKey: string;
  entityType: string;
  dateField: string;
  alwaysHeld?: boolean;
  skipLegalHoldCheck?: boolean;
}

const _ENTITY_CONFIGS: EntityRetentionConfig[] = [
  {
    model: 'behaviourIncident',
    retentionSettingsKey: 'incident_retention_years',
    entityType: 'incident',
    dateField: 'occurred_at',
  },
  {
    model: 'behaviourSanction',
    retentionSettingsKey: 'sanction_retention_years',
    entityType: 'sanction',
    dateField: 'scheduled_date',
  },
  {
    model: 'behaviourIntervention',
    retentionSettingsKey: 'intervention_retention_years',
    entityType: 'intervention',
    dateField: 'created_at',
  },
  {
    model: 'behaviourAppeal',
    retentionSettingsKey: 'appeal_retention_years',
    entityType: 'appeal',
    dateField: 'decided_at',
  },
  {
    model: 'behaviourExclusionCase',
    retentionSettingsKey: 'exclusion_case_retention_years',
    entityType: 'exclusion_case',
    dateField: 'created_at',
    alwaysHeld: true,
  },
  {
    model: 'behaviourTask',
    retentionSettingsKey: 'task_retention_years',
    entityType: 'task',
    dateField: 'completed_at',
    skipLegalHoldCheck: true,
  },
  {
    model: 'behaviourPolicyEvaluation',
    retentionSettingsKey: 'policy_evaluation_retention_years',
    entityType: 'incident',
    dateField: 'created_at',
  },
  {
    model: 'behaviourAlert',
    retentionSettingsKey: 'alert_retention_years',
    entityType: 'task',
    dateField: 'created_at',
    skipLegalHoldCheck: true,
  },
];

// ─── Retention Job ──────────────────────────────────────────────────────────

class RetentionCheckJob extends TenantAwareJob<RetentionCheckPayload> {
  private readonly logger = new Logger(RetentionCheckJob.name);

  /**
   * Public entry point that returns the result.
   * TenantAwareJob.execute() returns void, so we use a wrapper
   * that stores the result and returns it.
   */
  private result: RetentionResult = {
    archived_count: 0,
    anonymised_count: 0,
    held_skipped_count: 0,
    held_entities: [],
    exclusion_cases_for_review: 0,
    safeguarding_cases_for_review: 0,
    guardian_restrictions_expired: 0,
  };

  async executeAndReturn(data: RetentionCheckPayload): Promise<RetentionResult> {
    await this.execute(data);
    return this.result;
  }

  protected async processJob(data: RetentionCheckPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, dry_run } = data;
    const now = new Date();

    // Load tenant settings
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });
    const rawSettings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const settings = behaviourSettingsSchema.parse(
      (rawSettings?.behaviour as Record<string, unknown>) ?? {},
    );

    // ── Pass 1: Archival ────────────────────────────────────────────────

    // Find students who have left (withdrawn/graduated)
    const leftStudents = await tx.student.findMany({
      where: {
        tenant_id,
        status: { in: ['withdrawn', 'graduated'] as $Enums.StudentStatus[] },
        exit_date: { not: null },
      },
      select: { id: true, exit_date: true },
    });

    for (const student of leftStudents) {
      if (!student.exit_date) continue;

      // Process incidents for this student
      await this.archiveEntitiesForStudent(
        tx,
        tenant_id,
        student.id,
        student.exit_date,
        now,
        settings,
        dry_run ?? false,
      );
    }

    // ── Pass 2: Anonymisation ───────────────────────────────────────────

    // Find archived entities where retention deadline has fully elapsed
    await this.anonymiseArchivedEntities(tx, tenant_id, now, settings, dry_run ?? false);

    // ── Pass 3: Flag exclusion cases and safeguarding for manual review ─

    // Exclusion cases don't have retention_status — they are always retained
    // Count all exclusion cases for manual review flagging
    this.result.exclusion_cases_for_review = await tx.behaviourExclusionCase.count({
      where: {
        tenant_id,
      },
    });

    this.result.safeguarding_cases_for_review = await tx.safeguardingConcern.count({
      where: {
        tenant_id,
        // Safeguarding concerns don't have retention_status — they are always held
      },
    });

    // ── Pass 4: Guardian restriction expiry ──────────────────────────────

    if (!dry_run) {
      const expiredRestrictions = await tx.behaviourGuardianRestriction.updateMany({
        where: {
          tenant_id,
          status: 'active_restriction' as $Enums.RestrictionStatus,
          effective_until: { lt: now },
        },
        data: {
          status: 'expired' as $Enums.RestrictionStatus,
        },
      });
      this.result.guardian_restrictions_expired = expiredRestrictions.count;
    } else {
      this.result.guardian_restrictions_expired = await tx.behaviourGuardianRestriction.count({
        where: {
          tenant_id,
          status: 'active_restriction' as $Enums.RestrictionStatus,
          effective_until: { lt: now },
        },
      });
    }

    this.logger.log(
      `Retention check complete for tenant ${tenant_id}: ` +
        `archived=${this.result.archived_count}, anonymised=${this.result.anonymised_count}, ` +
        `held_skipped=${this.result.held_skipped_count}, restrictions_expired=${this.result.guardian_restrictions_expired}`,
    );
  }

  // ─── Archival Logic ───────────────────────────────────────────────────

  private async archiveEntitiesForStudent(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
    leftDate: Date,
    now: Date,
    settings: Record<string, unknown>,
    dryRun: boolean,
  ): Promise<void> {
    // Archive incidents
    const retentionYears = (settings.incident_retention_years as number) ?? 7;
    const cutoffDate = new Date(leftDate);
    cutoffDate.setFullYear(cutoffDate.getFullYear() + retentionYears);

    if (now < cutoffDate) return; // Not yet past retention period

    // Find active incidents for this student (as reported_for)
    const incidents = await tx.behaviourIncident.findMany({
      where: {
        tenant_id: tenantId,
        retention_status: 'active' as $Enums.RetentionStatus,
        participants: { some: { student_id: studentId } },
        occurred_at: { lt: cutoffDate },
      },
      select: { id: true },
    });

    for (const incident of incidents) {
      if (!dryRun) {
        await tx.behaviourIncident.update({
          where: { id: incident.id },
          data: {
            retention_status: 'archived' as $Enums.RetentionStatus,
            archived_at: now,
          },
        });
      }
      this.result.archived_count++;
    }

    // Archive sanctions for this student
    const sanctionRetention = (settings.sanction_retention_years as number) ?? 7;
    const sanctionCutoff = new Date(leftDate);
    sanctionCutoff.setFullYear(sanctionCutoff.getFullYear() + sanctionRetention);

    if (now >= sanctionCutoff) {
      const sanctions = await tx.behaviourSanction.findMany({
        where: {
          tenant_id: tenantId,
          retention_status: 'active' as $Enums.RetentionStatus,
          student_id: studentId,
          scheduled_date: { lt: sanctionCutoff },
        },
        select: { id: true },
      });

      for (const sanction of sanctions) {
        if (!dryRun) {
          await tx.behaviourSanction.update({
            where: { id: sanction.id },
            data: {
              retention_status: 'archived' as $Enums.RetentionStatus,
            },
          });
        }
        this.result.archived_count++;
      }
    }

    // Archive interventions
    const interventionRetention = (settings.intervention_retention_years as number) ?? 7;
    const interventionCutoff = new Date(leftDate);
    interventionCutoff.setFullYear(interventionCutoff.getFullYear() + interventionRetention);

    if (now >= interventionCutoff) {
      const interventions = await tx.behaviourIntervention.findMany({
        where: {
          tenant_id: tenantId,
          retention_status: 'active' as $Enums.RetentionStatus,
          student_id: studentId,
          created_at: { lt: interventionCutoff },
        },
        select: { id: true },
      });

      for (const intervention of interventions) {
        if (!dryRun) {
          await tx.behaviourIntervention.update({
            where: { id: intervention.id },
            data: {
              retention_status: 'archived' as $Enums.RetentionStatus,
            },
          });
        }
        this.result.archived_count++;
      }
    }
  }

  // ─── Anonymisation Logic ──────────────────────────────────────────────

  private async anonymiseArchivedEntities(
    tx: PrismaClient,
    tenantId: string,
    now: Date,
    settings: Record<string, unknown>,
    dryRun: boolean,
  ): Promise<void> {
    // Anonymise archived incidents that are past the full retention deadline
    const _incidentRetention = (settings.incident_retention_years as number) ?? 7;

    const archivedIncidents = await tx.behaviourIncident.findMany({
      where: {
        tenant_id: tenantId,
        retention_status: 'archived' as $Enums.RetentionStatus,
      },
      select: { id: true, archived_at: true, occurred_at: true },
      take: 500, // Process in batches
    });

    for (const incident of archivedIncidents) {
      if (!incident.archived_at) continue;

      // Check if enough time has passed since archival
      const _archivalDate = new Date(incident.archived_at);
      // Full retention has elapsed if archived_at is in the past (archival already checked retention period)
      // The anonymisation happens after the archival pass on subsequent runs

      // Check legal hold
      const holdCheck = await tx.behaviourLegalHold.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type: 'incident' as $Enums.LegalHoldEntityType,
          entity_id: incident.id,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
        select: { id: true, hold_reason: true, legal_basis: true },
      });

      if (holdCheck) {
        this.result.held_skipped_count++;
        this.result.held_entities.push({
          entity_type: 'incident',
          entity_id: incident.id,
          hold_reason: holdCheck.hold_reason,
        });
        continue;
      }

      if (!dryRun) {
        // Anonymise PII fields
        await tx.behaviourIncident.update({
          where: { id: incident.id },
          data: {
            description: '[Archived content]',
            parent_description: null,
            context_notes: null,
            retention_status: 'anonymised' as $Enums.RetentionStatus,
          },
        });

        // Anonymise linked participants
        const participants = await tx.behaviourIncidentParticipant.findMany({
          where: { incident_id: incident.id, tenant_id: tenantId },
          select: { id: true },
        });
        for (const p of participants) {
          await tx.behaviourIncidentParticipant.update({
            where: { id: p.id },
            data: {
              student_snapshot: Prisma.DbNull,
            },
          });
        }

        // Log anonymisation
        await tx.behaviourEntityHistory.create({
          data: {
            tenant_id: tenantId,
            entity_type: 'incident' as $Enums.BehaviourEntityType,
            entity_id: incident.id,
            changed_by_id: '00000000-0000-0000-0000-000000000000', // System
            change_type: 'anonymised',
            previous_values: Prisma.DbNull,
            new_values: {
              retention_status: 'anonymised',
              anonymised_at: now.toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      this.result.anonymised_count++;
    }

    // Anonymise archived sanctions
    const archivedSanctions = await tx.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        retention_status: 'archived' as $Enums.RetentionStatus,
      },
      select: { id: true },
      take: 500,
    });

    for (const sanction of archivedSanctions) {
      const holdCheck = await tx.behaviourLegalHold.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type: 'sanction' as $Enums.LegalHoldEntityType,
          entity_id: sanction.id,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
        select: { id: true, hold_reason: true },
      });

      if (holdCheck) {
        this.result.held_skipped_count++;
        this.result.held_entities.push({
          entity_type: 'sanction',
          entity_id: sanction.id,
          hold_reason: holdCheck.hold_reason,
        });
        continue;
      }

      if (!dryRun) {
        await tx.behaviourSanction.update({
          where: { id: sanction.id },
          data: {
            notes: null,
            return_conditions: null,
            appeal_notes: null,
            parent_meeting_notes: null,
            retention_status: 'anonymised' as $Enums.RetentionStatus,
          },
        });

        await tx.behaviourEntityHistory.create({
          data: {
            tenant_id: tenantId,
            entity_type: 'sanction' as $Enums.BehaviourEntityType,
            entity_id: sanction.id,
            changed_by_id: '00000000-0000-0000-0000-000000000000',
            change_type: 'anonymised',
            previous_values: Prisma.DbNull,
            new_values: {
              retention_status: 'anonymised',
              anonymised_at: now.toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      this.result.anonymised_count++;
    }

    // Anonymise archived interventions
    const archivedInterventions = await tx.behaviourIntervention.findMany({
      where: {
        tenant_id: tenantId,
        retention_status: 'archived' as $Enums.RetentionStatus,
      },
      select: { id: true },
      take: 500,
    });

    for (const intervention of archivedInterventions) {
      const holdCheck = await tx.behaviourLegalHold.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type: 'intervention' as $Enums.LegalHoldEntityType,
          entity_id: intervention.id,
          status: 'active_hold' as $Enums.LegalHoldStatus,
        },
        select: { id: true, hold_reason: true },
      });

      if (holdCheck) {
        this.result.held_skipped_count++;
        this.result.held_entities.push({
          entity_type: 'intervention',
          entity_id: intervention.id,
          hold_reason: holdCheck.hold_reason,
        });
        continue;
      }

      if (!dryRun) {
        await tx.behaviourIntervention.update({
          where: { id: intervention.id },
          data: {
            trigger_description: '[Archived content]',
            outcome_notes: null,
            send_notes: null,
            retention_status: 'anonymised' as $Enums.RetentionStatus,
          },
        });

        await tx.behaviourEntityHistory.create({
          data: {
            tenant_id: tenantId,
            entity_type: 'intervention' as $Enums.BehaviourEntityType,
            entity_id: intervention.id,
            changed_by_id: '00000000-0000-0000-0000-000000000000',
            change_type: 'anonymised',
            previous_values: Prisma.DbNull,
            new_values: {
              retention_status: 'anonymised',
              anonymised_at: now.toISOString(),
            } as unknown as Prisma.InputJsonValue,
          },
        });
      }
      this.result.anonymised_count++;
    }
  }
}
