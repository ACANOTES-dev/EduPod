import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import {
  EvaluatedInputSchema,
  PolicyCondition,
  PolicyConditionSchema,
} from '@school/shared/behaviour';
import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared/early-warning';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface EvaluatePolicyPayload extends TenantJobPayload {
  incident_id: string;
  trigger: 'incident_created' | 'participant_added';
  triggered_at: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const EVALUATE_POLICY_JOB = 'behaviour:evaluate-policy';

// ─── Stage pipeline order ────────────────────────────────────────────────────

const STAGE_ORDER: $Enums.PolicyStage[] = [
  'consequence',
  'approval_stage',
  'notification_stage',
  'support',
  'alerting',
];

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EvaluatePolicyProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluatePolicyProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.EARLY_WARNING) private readonly earlyWarningQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EvaluatePolicyPayload>): Promise<void> {
    if (job.name !== EVALUATE_POLICY_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${EVALUATE_POLICY_JOB} — incident ${job.data.incident_id}, trigger: ${job.data.trigger}`,
    );

    const evaluator = new EvaluatePolicyJob(this.prisma);
    await evaluator.execute(job.data);

    // ── Early warning intraday trigger ──────────────────────────────────────
    for (const studentId of evaluator.exclusionAffectedStudentIds) {
      await this.earlyWarningQueue.add(
        EARLY_WARNING_COMPUTE_STUDENT_JOB,
        {
          tenant_id: job.data.tenant_id,
          student_id: studentId,
          trigger_event: 'suspension',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log(
        `Enqueued early warning recompute for student ${studentId} (trigger: suspension)`,
      );
    }
  }
}

// ─── Job Implementation ──────────────────────────────────────────────────────

class EvaluatePolicyJob extends TenantAwareJob<EvaluatePolicyPayload> {
  private readonly logger = new Logger(EvaluatePolicyJob.name);

  /** Student IDs that received exclusion/suspension-related actions. Read after execute(). */
  public exclusionAffectedStudentIds: string[] = [];

  protected async processJob(data: EvaluatePolicyPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, incident_id } = data;

    const incident = await (tx as unknown as PrismaClientExt).behaviourIncident.findFirst({
      where: { id: incident_id, tenant_id },
      include: {
        category: { select: { name: true } },
        participants: {
          where: { participant_type: 'student' },
        },
      },
    });

    if (!incident) {
      this.logger.warn(`Incident ${incident_id} not found for tenant ${tenant_id} — skipping`);
      return;
    }

    // Skip withdrawn or draft incidents
    if (['withdrawn', 'draft'].includes(incident.status)) {
      this.logger.log(`Incident ${incident_id} is ${incident.status} — skipping evaluation`);
      return;
    }

    for (const participant of incident.participants) {
      if (!participant.student_id) continue;

      // Idempotency: find stages already evaluated for this student
      const existingEvaluations = await (
        tx as unknown as PrismaClientExt
      ).behaviourPolicyEvaluation.findMany({
        where: { incident_id, student_id: participant.student_id, tenant_id },
        select: { stage: true },
      });
      const evaluatedStages = new Set(existingEvaluations.map((e: { stage: string }) => e.stage));

      await this.evaluateForStudent(
        incident,
        participant,
        evaluatedStages,
        tx as unknown as PrismaClientExt,
      );
    }
  }

  /**
   * Evaluates all 5 stages for a single student participant.
   */
  private async evaluateForStudent(
    incident: IncidentWithCategory,
    participant: ParticipantRecord,
    evaluatedStages: Set<string>,
    tx: PrismaClientExt,
  ): Promise<void> {
    if (!participant.student_id) return;

    let firstConsequenceEvaluationId: string | null = null;

    for (const stage of STAGE_ORDER) {
      if (evaluatedStages.has(stage)) continue;

      const startMs = Date.now();

      const rules = await tx.behaviourPolicyRule.findMany({
        where: {
          tenant_id: incident.tenant_id,
          stage,
          is_active: true,
        },
        include: {
          actions: { orderBy: { execution_order: 'asc' } },
        },
        orderBy: { priority: 'asc' },
      });

      if (rules.length > 50) {
        this.logger.warn(
          `Tenant ${incident.tenant_id} has ${rules.length} active rules in stage ${stage}`,
        );
      }

      const matchedRules: typeof rules = [];

      for (const rule of rules) {
        const conditions = PolicyConditionSchema.safeParse(rule.conditions);
        if (!conditions.success) continue;

        const input = await this.buildEvaluatedInput(incident, participant, conditions.data, tx);
        const matches = this.evaluateConditions(conditions.data, input);

        if (matches) {
          matchedRules.push(rule);

          if (rule.stop_processing_stage || rule.match_strategy === 'first_match') {
            break;
          }
        }
      }

      const evaluationResult: $Enums.PolicyEvaluationResult =
        matchedRules.length > 0 ? 'matched' : 'no_match';

      const evaluatedInput = await this.buildEvaluatedInput(incident, participant, {}, tx);

      let ruleVersionId: string | null = null;
      const firstMatch = matchedRules[0] ?? null;
      if (firstMatch) {
        const versionRecord = await tx.behaviourPolicyRuleVersion.findFirst({
          where: {
            rule_id: firstMatch.id,
            version: firstMatch.current_version,
          },
          select: { id: true },
        });
        ruleVersionId = versionRecord?.id ?? null;
      }

      const evaluation = await tx.behaviourPolicyEvaluation.create({
        data: {
          tenant_id: incident.tenant_id,
          incident_id: incident.id,
          student_id: participant.student_id,
          stage,
          rule_version_id: ruleVersionId,
          evaluation_result: evaluationResult,
          evaluated_input: evaluatedInput as unknown as Prisma.InputJsonValue,
          matched_conditions: firstMatch
            ? (firstMatch.conditions as Prisma.InputJsonValue)
            : Prisma.DbNull,
          unmatched_conditions: Prisma.DbNull,
          rules_evaluated_count: rules.length,
          evaluation_duration_ms: Date.now() - startMs,
        },
      });

      if (stage === 'consequence') {
        firstConsequenceEvaluationId = evaluation.id;
      }

      // Execute actions
      for (const rule of matchedRules) {
        for (const action of rule.actions) {
          // SP3-2: Inter-escalation cooldown — skip if same rule+student+action was recently executed
          // TODO: use rule.cooldown_hours once the field is added to BehaviourPolicyRule schema
          const cooldownHours = 24; // default 24h until cooldown_hours field exists on the model
          const cooldownStart = new Date(Date.now() - cooldownHours * 3600 * 1000);

          const recentExecution = await tx.behaviourPolicyActionExecution.findFirst({
            where: {
              tenant_id: incident.tenant_id,
              action_type: action.action_type,
              execution_status: 'success',
              created_at: { gte: cooldownStart },
              evaluation: {
                student_id: participant.student_id!,
                rule_version: {
                  rule_id: rule.id,
                },
              },
            },
          });

          if (recentExecution) {
            this.logger.log(
              `Skipping action ${action.action_type} for rule ${rule.id} — cooldown active (last: ${recentExecution.created_at.toISOString()})`,
            );
            continue;
          }

          await this.executeAction(action, incident, participant, evaluation.id, tx);
        }
      }
    }

    // Link consequence evaluation to incident
    if (firstConsequenceEvaluationId) {
      await tx.behaviourIncident.update({
        where: { id: incident.id },
        data: { policy_evaluation_id: firstConsequenceEvaluationId },
      });
    }
  }

  private evaluateConditions(
    conditions: PolicyCondition,
    input: ReturnType<typeof EvaluatedInputSchema.parse>,
  ): boolean {
    if (conditions.category_ids?.length) {
      if (!conditions.category_ids.includes(input.category_id)) return false;
    }
    if (conditions.polarity !== undefined) {
      if (input.polarity !== conditions.polarity) return false;
    }
    if (conditions.severity_min !== undefined) {
      if (input.severity < conditions.severity_min) return false;
    }
    if (conditions.severity_max !== undefined) {
      if (input.severity > conditions.severity_max) return false;
    }
    if (conditions.year_group_ids?.length) {
      if (!input.year_group_id || !conditions.year_group_ids.includes(input.year_group_id))
        return false;
    }
    if (conditions.student_has_send !== undefined) {
      if (input.has_send !== conditions.student_has_send) return false;
    }
    if (conditions.student_has_active_intervention !== undefined) {
      if (input.had_active_intervention !== conditions.student_has_active_intervention)
        return false;
    }
    if (conditions.context_types?.length) {
      if (
        !conditions.context_types.includes(
          input.context_type as (typeof conditions.context_types)[number],
        )
      )
        return false;
    }
    if (conditions.participant_role !== undefined) {
      if (input.participant_role !== conditions.participant_role) return false;
    }
    if (conditions.repeat_count_min !== undefined) {
      if (input.repeat_count < conditions.repeat_count_min) return false;
    }
    if (conditions.weekdays?.length) {
      if (input.weekday === null || !conditions.weekdays.includes(input.weekday)) return false;
    }
    if (conditions.period_orders?.length) {
      if (input.period_order === null || !conditions.period_orders.includes(input.period_order))
        return false;
    }
    return true;
  }

  private async buildEvaluatedInput(
    incident: IncidentWithCategory,
    participant: ParticipantRecord,
    conditions: Partial<PolicyCondition>,
    tx: PrismaClientExt,
  ) {
    const snapshot = (participant.student_snapshot ?? {}) as Record<string, unknown>;
    const categoryName = incident.category?.name ?? '';

    let repeatCount = 0;
    if (conditions.repeat_count_min && conditions.repeat_window_days && participant.student_id) {
      const windowStart = new Date(incident.occurred_at);
      windowStart.setDate(windowStart.getDate() - conditions.repeat_window_days);

      const categoryFilter = conditions.repeat_category_ids?.length
        ? conditions.repeat_category_ids
        : undefined;

      repeatCount = await tx.behaviourIncidentParticipant.count({
        where: {
          tenant_id: incident.tenant_id,
          student_id: participant.student_id,
          participant_type: 'student',
          incident: {
            occurred_at: { gte: windowStart },
            status: {
              notIn: ['withdrawn', 'draft'] as $Enums.IncidentStatus[],
            },
            ...(categoryFilter ? { category_id: { in: categoryFilter } } : {}),
          },
        },
      });
    }

    return EvaluatedInputSchema.parse({
      category_id: incident.category_id,
      category_name: categoryName,
      polarity: incident.polarity,
      severity: incident.severity,
      context_type: incident.context_type,
      occurred_at: incident.occurred_at.toISOString(),
      weekday: incident.weekday,
      period_order: incident.period_order,
      student_id: participant.student_id,
      participant_role: participant.role,
      year_group_id: (snapshot.year_group_id as string) ?? null,
      year_group_name: (snapshot.year_group_name as string) ?? null,
      has_send: (snapshot.has_send as boolean) ?? false,
      had_active_intervention: (snapshot.had_active_intervention as boolean) ?? false,
      repeat_count: repeatCount,
      repeat_window_days_used: conditions.repeat_window_days ?? null,
      repeat_category_ids_used: conditions.repeat_category_ids ?? [],
    });
  }

  private async executeAction(
    action: {
      action_type: $Enums.PolicyActionType;
      action_config: Prisma.JsonValue;
      execution_order: number;
    },
    incident: IncidentWithCategory,
    participant: ParticipantRecord,
    evaluationId: string,
    tx: PrismaClientExt,
  ): Promise<void> {
    // Dedup check
    const existing = await tx.behaviourPolicyActionExecution.findFirst({
      where: {
        evaluation_id: evaluationId,
        action_type: action.action_type,
        execution_status: 'success',
      },
    });

    if (existing) {
      await tx.behaviourPolicyActionExecution.create({
        data: {
          tenant_id: incident.tenant_id,
          evaluation_id: evaluationId,
          action_type: action.action_type,
          action_config: action.action_config as Prisma.InputJsonValue,
          execution_status: 'skipped_duplicate',
          executed_at: new Date(),
        },
      });
      return;
    }

    try {
      const config = action.action_config as Record<string, unknown>;
      let entityType: string | null = null;
      let entityId: string | null = null;

      switch (action.action_type) {
        case 'require_parent_notification': {
          const current = await tx.behaviourIncident.findFirst({
            where: { id: incident.id },
            select: { parent_notification_status: true },
          });
          if (current?.parent_notification_status === 'not_required') {
            await tx.behaviourIncident.update({
              where: { id: incident.id },
              data: { parent_notification_status: 'pending' },
            });
          }
          break;
        }
        case 'require_approval':
        case 'block_without_approval': {
          const current = await tx.behaviourIncident.findFirst({
            where: { id: incident.id },
            select: { approval_status: true },
          });
          if (current?.approval_status === 'not_required') {
            await tx.behaviourIncident.update({
              where: { id: incident.id },
              data: { approval_status: 'pending' },
            });
          }
          break;
        }
        case 'flag_for_review': {
          const current = await tx.behaviourIncident.findFirst({
            where: { id: incident.id },
            select: { status: true },
          });
          if (current?.status === 'active') {
            await tx.behaviourIncident.update({
              where: { id: incident.id },
              data: { status: 'under_review' },
            });
          }
          break;
        }
        case 'create_task': {
          if (participant.student_id) {
            const taskType = config.task_type as string;
            const existingTask = await tx.behaviourTask.findFirst({
              where: {
                tenant_id: incident.tenant_id,
                entity_type: 'incident',
                entity_id: incident.id,
                task_type: taskType as $Enums.BehaviourTaskType,
                status: { notIn: ['completed', 'cancelled'] },
              },
            });
            if (!existingTask) {
              const dueInDays = (config.due_in_school_days as number) ?? 3;
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + dueInDays);
              const task = await tx.behaviourTask.create({
                data: {
                  tenant_id: incident.tenant_id,
                  task_type: taskType as $Enums.BehaviourTaskType,
                  entity_type: 'incident',
                  entity_id: incident.id,
                  title: (config.title as string) ?? `Policy task for ${incident.incident_number}`,
                  assigned_to_id: (config.assigned_to_user_id as string) ?? incident.reported_by_id,
                  created_by_id: incident.reported_by_id,
                  priority: ((config.priority as string) ?? 'medium') as $Enums.TaskPriority,
                  status: 'pending',
                  due_date: dueDate,
                },
              });
              entityType = 'behaviour_tasks';
              entityId = task.id;
            }
          }
          break;
        }
        case 'require_parent_meeting': {
          if (participant.student_id) {
            const existingTask = await tx.behaviourTask.findFirst({
              where: {
                tenant_id: incident.tenant_id,
                entity_type: 'incident',
                entity_id: incident.id,
                task_type: 'parent_meeting',
                status: { notIn: ['completed', 'cancelled'] },
              },
            });
            if (!existingTask) {
              const dueInDays = (config.due_within_school_days as number) ?? 5;
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + dueInDays);
              const task = await tx.behaviourTask.create({
                data: {
                  tenant_id: incident.tenant_id,
                  task_type: 'parent_meeting',
                  entity_type: 'incident',
                  entity_id: incident.id,
                  title: `Parent meeting required for ${incident.incident_number}`,
                  assigned_to_id: incident.reported_by_id,
                  created_by_id: incident.reported_by_id,
                  priority: 'high',
                  status: 'pending',
                  due_date: dueDate,
                },
              });
              entityType = 'behaviour_tasks';
              entityId = task.id;
            }
          }
          break;
        }
        default:
          // notify_roles, notify_users, auto_escalate, create_sanction, create_intervention
          // These are handled minimally — full implementation deferred to action-specific services
          break;
      }

      // Track exclusion-related actions for early warning intraday trigger
      if (
        ['create_sanction', 'auto_escalate'].includes(action.action_type) &&
        participant.student_id
      ) {
        this.exclusionAffectedStudentIds.push(participant.student_id);
      }

      await tx.behaviourPolicyActionExecution.create({
        data: {
          tenant_id: incident.tenant_id,
          evaluation_id: evaluationId,
          action_type: action.action_type,
          action_config: action.action_config as Prisma.InputJsonValue,
          execution_status: 'success',
          created_entity_type: entityType,
          created_entity_id: entityId,
          executed_at: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Action ${action.action_type} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await tx.behaviourPolicyActionExecution.create({
        data: {
          tenant_id: incident.tenant_id,
          evaluation_id: evaluationId,
          action_type: action.action_type,
          action_config: action.action_config as Prisma.InputJsonValue,
          execution_status: 'failed',
          failure_reason: err instanceof Error ? err.message : String(err),
          executed_at: new Date(),
        },
      });
    }
  }
}

// ─── Type helpers ────────────────────────────────────────────────────────────

type PrismaClientExt = PrismaClient & {
  behaviourIncident: PrismaClient['behaviourIncident'];
  behaviourPolicyRule: PrismaClient['behaviourPolicyRule'];
  behaviourPolicyRuleVersion: PrismaClient['behaviourPolicyRuleVersion'];
  behaviourPolicyEvaluation: PrismaClient['behaviourPolicyEvaluation'];
  behaviourPolicyActionExecution: PrismaClient['behaviourPolicyActionExecution'];
  behaviourTask: PrismaClient['behaviourTask'];
  behaviourIncidentParticipant: PrismaClient['behaviourIncidentParticipant'];
};

interface IncidentWithCategory {
  id: string;
  tenant_id: string;
  category_id: string;
  polarity: string;
  severity: number;
  context_type: string;
  occurred_at: Date;
  weekday: number | null;
  period_order: number | null;
  status: string;
  reported_by_id: string;
  incident_number: string;
  category: { name: string } | null;
  participants: ParticipantRecord[];
}

interface ParticipantRecord {
  id: string;
  student_id: string | null;
  participant_type: string;
  role: string;
  student_snapshot: unknown;
}
