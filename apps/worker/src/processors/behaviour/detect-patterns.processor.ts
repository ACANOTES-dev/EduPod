import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job constants ──────────────────────────────────────────────────────────

export const BEHAVIOUR_DETECT_PATTERNS_JOB = 'behaviour:detect-patterns';

export type DetectPatternsPayload = TenantJobPayload;

/** Statuses excluded from all behaviour aggregations. */
const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = [
  'withdrawn',
  'converted_to_safeguarding' as $Enums.IncidentStatus,
];

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class DetectPatternsProcessor extends WorkerHost {
  private readonly logger = new Logger(DetectPatternsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<DetectPatternsPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_DETECT_PATTERNS_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${BEHAVIOUR_DETECT_PATTERNS_JOB} for tenant ${tenant_id}`);

    const detector = new PatternDetectorJob(this.prisma);
    await detector.execute(job.data);
  }
}

// ─── Detection Job ──────────────────────────────────────────────────────────

class PatternDetectorJob extends TenantAwareJob<DetectPatternsPayload> {
  private readonly logger = new Logger(PatternDetectorJob.name);

  protected async processJob(data: DetectPatternsPayload, tx: PrismaClient): Promise<void> {
    const tenantId = data.tenant_id;
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const priorSevenDays = new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000);

    let created = 0;
    let updated = 0;

    // ─── 1. Escalating Students ──────────────────────────────────────────
    const recentNegatives = await tx.behaviourIncidentParticipant.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        participant_type: 'student' as $Enums.ParticipantType,
        student_id: { not: null },
        incident: {
          polarity: 'negative' as $Enums.BehaviourPolarity,
          occurred_at: { gte: sevenDaysAgo },
          status: { notIn: EXCLUDED_STATUSES },
          retention_status: 'active' as $Enums.RetentionStatus,
        },
      },
      _count: true,
      having: { student_id: { _count: { gte: 3 } } },
    });

    // Check trend: compare with prior 7 days
    const priorNegatives = await tx.behaviourIncidentParticipant.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        participant_type: 'student' as $Enums.ParticipantType,
        student_id: {
          in: recentNegatives.map((r) => r.student_id).filter((id): id is string => id !== null),
        },
        incident: {
          polarity: 'negative' as $Enums.BehaviourPolarity,
          occurred_at: { gte: priorSevenDays, lt: sevenDaysAgo },
          status: { notIn: EXCLUDED_STATUSES },
          retention_status: 'active' as $Enums.RetentionStatus,
        },
      },
      _count: true,
    });

    const priorMap = new Map(
      priorNegatives
        .filter((p) => p.student_id !== null)
        .map((p) => [p.student_id as string, p._count]),
    );

    for (const row of recentNegatives) {
      if (!row.student_id) continue;
      const priorCount = priorMap.get(row.student_id) ?? 0;
      if (row._count <= priorCount) continue; // Not trending up

      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'escalating_student' as $Enums.AlertType,
        severity: 'warning' as $Enums.AlertSeverity,
        student_id: row.student_id,
        title: `Escalating behaviour: ${row._count} negative incidents in 7 days`,
        description: `Student had ${row._count} negative incidents in the last 7 days, up from ${priorCount} in the prior 7 days.`,
        data_snapshot: {
          recent_count: row._count,
          prior_count: priorCount,
          detected_at: now.toISOString(),
        },
      });
      if (result === 'created') created++;
      else updated++;
    }

    // ─── 2. Disengaging Students ─────────────────────────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const studentsWithPriorPositive = await tx.behaviourIncidentParticipant.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        participant_type: 'student' as $Enums.ParticipantType,
        student_id: { not: null },
        incident: {
          polarity: 'positive' as $Enums.BehaviourPolarity,
          occurred_at: { gte: thirtyDaysAgo, lt: sevenDaysAgo },
          status: { notIn: EXCLUDED_STATUSES },
          retention_status: 'active' as $Enums.RetentionStatus,
        },
      },
      _count: true,
    });

    for (const row of studentsWithPriorPositive) {
      if (!row.student_id) continue;

      // Check: zero positives in last 7 days
      const recentPositive = await tx.behaviourIncidentParticipant.count({
        where: {
          tenant_id: tenantId,
          student_id: row.student_id,
          participant_type: 'student' as $Enums.ParticipantType,
          incident: {
            polarity: 'positive' as $Enums.BehaviourPolarity,
            occurred_at: { gte: sevenDaysAgo },
            status: { notIn: EXCLUDED_STATUSES },
            retention_status: 'active' as $Enums.RetentionStatus,
          },
        },
      });

      if (recentPositive > 0) continue;

      // Check: at least 2 negative in last 7 days
      const recentNeg = await tx.behaviourIncidentParticipant.count({
        where: {
          tenant_id: tenantId,
          student_id: row.student_id,
          participant_type: 'student' as $Enums.ParticipantType,
          incident: {
            polarity: 'negative' as $Enums.BehaviourPolarity,
            occurred_at: { gte: sevenDaysAgo },
            status: { notIn: EXCLUDED_STATUSES },
            retention_status: 'active' as $Enums.RetentionStatus,
          },
        },
      });

      if (recentNeg < 2) continue;

      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'disengaging_student' as $Enums.AlertType,
        severity: 'info' as $Enums.AlertSeverity,
        student_id: row.student_id,
        title: 'Possible disengagement detected',
        description: `Student had positive activity in the prior month but zero in the last 7 days, with ${recentNeg} negative incidents.`,
        data_snapshot: {
          prior_positive: row._count,
          recent_negative: recentNeg,
          detected_at: now.toISOString(),
        },
      });
      if (result === 'created') created++;
      else updated++;
    }

    // ─── 3. Logging Gaps ─────────────────────────────────────────────────
    // Staff with behaviour.log who haven't logged in 14 school days
    const staffWithPermission = await tx.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_permissions: {
                some: { permission: { permission_key: 'behaviour.log' } },
              },
            },
          },
        },
      },
      select: { user_id: true },
    });

    for (const staff of staffWithPermission) {
      const lastLog = await tx.behaviourIncident.findFirst({
        where: {
          tenant_id: tenantId,
          reported_by_id: staff.user_id,
          status: { notIn: EXCLUDED_STATUSES },
        },
        orderBy: { occurred_at: 'desc' },
        select: { occurred_at: true },
      });

      if (lastLog && lastLog.occurred_at >= fourteenDaysAgo) continue;

      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'logging_gap' as $Enums.AlertType,
        severity: 'info' as $Enums.AlertSeverity,
        staff_id: staff.user_id,
        title: 'Staff logging gap detected',
        description: `Teacher has not logged any behaviour in the last 14 school days.`,
        data_snapshot: {
          last_logged_at: lastLog?.occurred_at?.toISOString() ?? null,
          detected_at: now.toISOString(),
        },
      });
      if (result === 'created') created++;
      else updated++;
    }

    // ─── 4. Overdue Reviews ──────────────────────────────────────────────
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const overdueInterventions = await tx.behaviourIntervention.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active' as $Enums.InterventionStatus,
        next_review_date: { lt: threeDaysAgo },
      },
      select: {
        id: true,
        student_id: true,
        assigned_to_id: true,
        next_review_date: true,
      },
    });

    for (const iv of overdueInterventions) {
      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'overdue_review' as $Enums.AlertType,
        severity: 'warning' as $Enums.AlertSeverity,
        student_id: iv.student_id,
        title: 'Overdue intervention review',
        description: `An active intervention has a review date more than 3 school days overdue.`,
        data_snapshot: {
          intervention_id: iv.id,
          next_review_date: iv.next_review_date?.toISOString() ?? null,
          detected_at: now.toISOString(),
        },
      });
      if (result === 'created') created++;
      else updated++;
    }

    // ─── 4b. Intervention Completion Reminders (SP3-4) ──────────────────
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eightDaysFromNow = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const approachingCompletion = await tx.behaviourIntervention.findMany({
      where: {
        tenant_id: tenantId,
        status: {
          in: [
            'active_intervention' as $Enums.InterventionStatus,
            'monitoring' as $Enums.InterventionStatus,
          ],
        },
        target_end_date: { gte: sevenDaysFromNow, lt: eightDaysFromNow },
      },
      select: {
        id: true,
        intervention_number: true,
        student_id: true,
        assigned_to_id: true,
        target_end_date: true,
      },
    });

    for (const iv of approachingCompletion) {
      // Check for existing reminder task (idempotency)
      const existingReminderTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id: tenantId,
          entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
          entity_id: iv.id,
          task_type: 'follow_up' as $Enums.BehaviourTaskType,
          title: { startsWith: 'Completion reminder:' },
          status: { notIn: ['cancelled' as $Enums.BehaviourTaskStatus] },
        },
      });
      if (existingReminderTask) continue;

      await tx.behaviourTask.create({
        data: {
          tenant_id: tenantId,
          task_type: 'follow_up' as $Enums.BehaviourTaskType,
          entity_type: 'intervention' as $Enums.BehaviourTaskEntityType,
          entity_id: iv.id,
          title: `Completion reminder: intervention ${iv.intervention_number} ends in 7 days`,
          assigned_to_id: iv.assigned_to_id,
          created_by_id: iv.assigned_to_id,
          priority: 'high' as $Enums.TaskPriority,
          status: 'pending' as $Enums.BehaviourTaskStatus,
          due_date: iv.target_end_date!,
        },
      });
    }

    this.logger.log(
      `Intervention completion reminders: ${approachingCompletion.length} approaching, tasks created where needed`,
    );

    // ─── 5. Hotspot Subjects ────────────────────────────────────────────
    // A subject with incident rate > 2x the school average (per 100 teaching periods)
    const incidentsBySubject = await tx.behaviourIncident.groupBy({
      by: ['subject_id'],
      where: {
        tenant_id: tenantId,
        subject_id: { not: null },
        occurred_at: { gte: thirtyDaysAgo },
        status: { notIn: EXCLUDED_STATUSES },
        retention_status: 'active' as $Enums.RetentionStatus,
      },
      _count: true,
    });

    if (incidentsBySubject.length > 0) {
      const totalIncidents = incidentsBySubject.reduce((sum, s) => sum + s._count, 0);
      const avgCount = totalIncidents / incidentsBySubject.length;

      for (const row of incidentsBySubject) {
        if (!row.subject_id) continue;
        if (row._count <= avgCount * 2) continue;

        const result = await this.upsertAlert(tx, tenantId, {
          alert_type: 'hotspot' as $Enums.AlertType,
          severity: 'warning' as $Enums.AlertSeverity,
          subject_id: row.subject_id,
          title: `Subject hotspot: ${row._count} incidents in 30 days`,
          description: `This subject has ${row._count} incidents in the last 30 days — more than 2x the school average of ${avgCount.toFixed(1)}.`,
          data_snapshot: {
            subject_id: row.subject_id,
            incident_count: row._count,
            school_average: Number(avgCount.toFixed(1)),
            detected_at: now.toISOString(),
          } as Prisma.InputJsonValue,
        });
        if (result === 'created') created++;
        else updated++;
      }
    }

    // ─── 6. Suspension Returns ────────────────────────────────────────────
    // Students returning from suspension within 3 days with no return_check_in task
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const upcomingReturns = await tx.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        type: {
          in: [
            'suspension_external' as $Enums.SanctionType,
            'suspension_internal' as $Enums.SanctionType,
          ],
        },
        status: 'served' as $Enums.SanctionStatus,
        suspension_end_date: { gte: now, lte: threeDaysFromNow },
      },
      select: {
        id: true,
        student_id: true,
        suspension_end_date: true,
      },
    });

    for (const sanction of upcomingReturns) {
      // Check for existing return_check_in task linked to this sanction
      const existingTask = await tx.behaviourTask.findFirst({
        where: {
          tenant_id: tenantId,
          task_type: 'return_check_in' as $Enums.BehaviourTaskType,
          entity_type: 'sanction' as $Enums.BehaviourTaskEntityType,
          entity_id: sanction.id,
          status: { notIn: ['cancelled' as $Enums.BehaviourTaskStatus] },
        },
      });

      if (existingTask) continue;

      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'suspension_return' as $Enums.AlertType,
        severity: 'warning' as $Enums.AlertSeverity,
        student_id: sanction.student_id,
        title: 'Student returning from suspension — no check-in scheduled',
        description: `Student is returning from suspension on ${sanction.suspension_end_date?.toISOString().slice(0, 10) ?? 'unknown'} but has no return check-in task.`,
        data_snapshot: {
          sanction_id: sanction.id,
          student_id: sanction.student_id,
          suspension_end_date: sanction.suspension_end_date?.toISOString() ?? null,
          detected_at: now.toISOString(),
        } as Prisma.InputJsonValue,
      });
      if (result === 'created') created++;
      else updated++;
    }

    // ─── 7. Policy Threshold Breaches ─────────────────────────────────────
    // Students with matched policy evaluations but no corresponding action executions
    const matchedEvaluations = await tx.behaviourPolicyEvaluation.findMany({
      where: {
        tenant_id: tenantId,
        evaluation_result: 'matched' as $Enums.PolicyEvaluationResult,
        created_at: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        student_id: true,
        incident_id: true,
        _count: {
          select: { action_executions: true },
        },
      },
    });

    // Group by student — flag students with matched evaluations but zero action executions
    const breachStudentMap = new Map<
      string,
      { evaluationCount: number; unexecutedCount: number; evaluationIds: string[] }
    >();

    for (const evaluation of matchedEvaluations) {
      const entry = breachStudentMap.get(evaluation.student_id) ?? {
        evaluationCount: 0,
        unexecutedCount: 0,
        evaluationIds: [],
      };
      entry.evaluationCount++;
      entry.evaluationIds.push(evaluation.id);
      if (evaluation._count.action_executions === 0) {
        entry.unexecutedCount++;
      }
      breachStudentMap.set(evaluation.student_id, entry);
    }

    for (const [studentId, breach] of breachStudentMap) {
      if (breach.unexecutedCount === 0) continue;

      const result = await this.upsertAlert(tx, tenantId, {
        alert_type: 'policy_threshold_breach' as $Enums.AlertType,
        severity: 'critical' as $Enums.AlertSeverity,
        student_id: studentId,
        title: `Policy threshold breach — ${breach.unexecutedCount} unexecuted action(s)`,
        description: `Student has ${breach.evaluationCount} matched policy evaluation(s) in the last 7 days with ${breach.unexecutedCount} having no corresponding action executions.`,
        data_snapshot: {
          student_id: studentId,
          matched_evaluations: breach.evaluationCount,
          unexecuted_actions: breach.unexecutedCount,
          evaluation_ids: breach.evaluationIds,
          detected_at: now.toISOString(),
        } as Prisma.InputJsonValue,
      });
      if (result === 'created') created++;
      else updated++;
    }

    this.logger.log(
      `Pattern detection complete for tenant ${tenantId}: ${created} alerts created, ${updated} alerts updated`,
    );

    // Pulse cache (Redis, 5-min TTL) expires naturally before the dashboard
    // is next viewed, so no active invalidation is needed here.
  }

  /**
   * Upsert an alert: update data_snapshot if an active alert of the same type
   * and entity already exists, otherwise create a new one.
   */
  private async upsertAlert(
    tx: PrismaClient,
    tenantId: string,
    data: {
      alert_type: $Enums.AlertType;
      severity: $Enums.AlertSeverity;
      student_id?: string;
      subject_id?: string;
      staff_id?: string;
      title: string;
      description: string;
      data_snapshot: Prisma.InputJsonValue;
    },
  ): Promise<'created' | 'updated'> {
    // Check for existing active alert
    const existing = await tx.behaviourAlert.findFirst({
      where: {
        tenant_id: tenantId,
        alert_type: data.alert_type,
        status: 'active_alert' as $Enums.AlertStatus,
        ...(data.student_id ? { student_id: data.student_id } : {}),
        ...(data.subject_id ? { subject_id: data.subject_id } : {}),
        ...(data.staff_id ? { staff_id: data.staff_id } : {}),
      },
    });

    if (existing) {
      await tx.behaviourAlert.update({
        where: { id: existing.id },
        data: {
          data_snapshot: data.data_snapshot,
          description: data.description,
          title: data.title,
          updated_at: new Date(),
        },
      });
      return 'updated';
    }

    // Create new alert with recipients
    const alert = await tx.behaviourAlert.create({
      data: {
        tenant_id: tenantId,
        alert_type: data.alert_type,
        severity: data.severity,
        title: data.title,
        description: data.description,
        data_snapshot: data.data_snapshot,
        student_id: data.student_id ?? null,
        subject_id: data.subject_id ?? null,
        staff_id: data.staff_id ?? null,
        status: 'active_alert' as $Enums.AlertStatus,
      },
    });

    // Determine recipients based on alert type
    const recipientIds = await this.determineRecipients(tx, tenantId, data.alert_type, data);

    if (recipientIds.length > 0) {
      await tx.behaviourAlertRecipient.createMany({
        data: recipientIds.map((r) => ({
          tenant_id: tenantId,
          alert_id: alert.id,
          recipient_id: r.userId,
          recipient_role: r.role ?? null,
          status: 'unseen' as $Enums.AlertRecipientStatus,
        })),
      });
    }

    return 'created';
  }

  private async determineRecipients(
    tx: PrismaClient,
    tenantId: string,
    _alertType: $Enums.AlertType,
    _data: { student_id?: string; staff_id?: string },
  ): Promise<Array<{ userId: string; role?: string }>> {
    // For now, route all alerts to users with behaviour.admin permission
    const admins = await tx.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_permissions: {
                some: { permission: { permission_key: 'behaviour.admin' } },
              },
            },
          },
        },
      },
      select: { user_id: true },
    });

    return admins.map((a) => ({ userId: a.user_id, role: 'admin' }));
  }
}
