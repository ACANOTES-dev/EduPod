import { Injectable, Logger } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  EvaluatedInput,
  EvaluatedInputSchema,
  PolicyCondition,
  PolicyConditionSchema,
} from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { BehaviourHistoryService } from '../behaviour-history.service';

/**
 * Prisma enum stage values in pipeline order.
 * Note: approval_stage maps to "approval" in DB, notification_stage to "notification".
 */
const STAGE_ORDER: $Enums.PolicyStage[] = [
  'consequence',
  'approval_stage',
  'notification_stage',
  'support',
  'alerting',
];

interface IncidentForEval {
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
  category?: { name: string } | null;
}

interface ParticipantForEval {
  id: string;
  student_id: string | null;
  participant_type: string;
  role: string;
  student_snapshot: unknown;
}

interface ActionExecResult {
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class PolicyEvaluationEngine {
  private readonly logger = new Logger(PolicyEvaluationEngine.name);

  constructor(private readonly historyService: BehaviourHistoryService) {}

  /**
   * Evaluates all 5 stages for a single student participant.
   * Skips stages already evaluated (for idempotent retries).
   */
  async evaluateForStudent(
    incident: IncidentForEval,
    participant: ParticipantForEval,
    evaluatedStages: Set<string>,
    tx: PrismaService,
  ): Promise<void> {
    if (!participant.student_id) return;

    let firstConsequenceEvaluationId: string | null = null;

    for (const stage of STAGE_ORDER) {
      if (evaluatedStages.has(stage)) continue;

      const startMs = Date.now();

      // Load active rules for this stage, sorted by priority ascending
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
          `Tenant ${incident.tenant_id} has ${rules.length} active rules in stage ${stage} — consider rule hygiene`,
        );
      }

      const matchedRules: typeof rules = [];

      for (const rule of rules) {
        const conditions = PolicyConditionSchema.safeParse(rule.conditions);
        if (!conditions.success) {
          this.logger.warn(`Rule ${rule.id} has invalid conditions — skipping`);
          continue;
        }

        const input = await this.buildEvaluatedInput(incident, participant, conditions.data, tx);
        const matches = this.evaluateConditions(conditions.data, input);

        if (matches) {
          matchedRules.push(rule);

          if (rule.stop_processing_stage || rule.match_strategy === 'first_match') {
            break;
          }
        }
      }

      // Record evaluation result in the ledger
      const evaluationResult: $Enums.PolicyEvaluationResult =
        matchedRules.length > 0 ? 'matched' : 'no_match';

      const evaluatedInput = await this.buildEvaluatedInput(incident, participant, {}, tx);

      // Get version ID for the first matched rule
      let ruleVersionId: string | null = null;
      const firstMatch = matchedRules[0] ?? null;
      if (firstMatch) {
        ruleVersionId = await this.getVersionId(firstMatch.id, firstMatch.current_version, tx);
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

      // Execute actions for all matched rules
      for (const rule of matchedRules) {
        for (const action of rule.actions) {
          await this.executeAction(action, incident, participant, evaluation.id, tx);
        }
      }
    }

    // Link first consequence evaluation to the incident
    if (firstConsequenceEvaluationId) {
      await tx.behaviourIncident.update({
        where: { id: incident.id },
        data: { policy_evaluation_id: firstConsequenceEvaluationId },
      });
    }
  }

  /**
   * Pure condition matching — all specified conditions must pass (AND).
   * Unspecified conditions are wildcards.
   */
  evaluateConditions(conditions: PolicyCondition, input: EvaluatedInput): boolean {
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
      if (!input.year_group_id || !conditions.year_group_ids.includes(input.year_group_id)) {
        return false;
      }
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

  /**
   * Build the evaluated input from incident + participant snapshots.
   * Uses frozen snapshot data, never live student queries.
   */
  async buildEvaluatedInput(
    incident: IncidentForEval,
    participant: ParticipantForEval,
    conditions: Partial<PolicyCondition>,
    tx: PrismaService,
  ): Promise<EvaluatedInput> {
    const snapshot = (participant.student_snapshot ?? {}) as Record<string, unknown>;

    // Get category name
    let categoryName = '';
    if (incident.category) {
      categoryName = incident.category.name;
    } else {
      const cat = await tx.behaviourCategory.findFirst({
        where: { id: incident.category_id, tenant_id: incident.tenant_id },
        select: { name: true },
      });
      categoryName = cat?.name ?? '';
    }

    // Compute repeat count if needed
    const repeatCount = await this.computeRepeatCount(incident, participant, conditions, tx);

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

  /**
   * Count prior incidents for the same student matching the repeat criteria.
   */
  private async computeRepeatCount(
    incident: IncidentForEval,
    participant: ParticipantForEval,
    conditions: Partial<PolicyCondition>,
    tx: PrismaService,
  ): Promise<number> {
    if (!conditions.repeat_count_min || !conditions.repeat_window_days) return 0;
    if (!participant.student_id) return 0;

    const windowStart = new Date(incident.occurred_at);
    windowStart.setDate(windowStart.getDate() - conditions.repeat_window_days);

    const categoryFilter = conditions.repeat_category_ids?.length
      ? conditions.repeat_category_ids
      : undefined;

    const incidentWhere: Prisma.BehaviourIncidentWhereInput = {
      tenant_id: incident.tenant_id,
      occurred_at: { gte: windowStart },
      status: { notIn: ['withdrawn', 'draft'] as $Enums.IncidentStatus[] },
      ...(categoryFilter ? { category_id: { in: categoryFilter } } : {}),
    };

    const count = await tx.behaviourIncidentParticipant.count({
      where: {
        tenant_id: incident.tenant_id,
        student_id: participant.student_id,
        participant_type: 'student',
        incident: incidentWhere,
      },
    });

    return count;
  }

  /**
   * Look up the version snapshot ID for a rule at a specific version number.
   */
  private async getVersionId(
    ruleId: string,
    version: number,
    tx: PrismaService,
  ): Promise<string | null> {
    const versionRecord = await tx.behaviourPolicyRuleVersion.findFirst({
      where: { rule_id: ruleId, version },
      select: { id: true },
    });
    return versionRecord?.id ?? null;
  }

  /**
   * Execute a single action with dedup guard.
   */
  private async executeAction(
    action: {
      action_type: $Enums.PolicyActionType;
      action_config: Prisma.JsonValue;
      execution_order: number;
    },
    incident: IncidentForEval,
    participant: ParticipantForEval,
    evaluationId: string,
    tx: PrismaService,
  ): Promise<void> {
    // Check for duplicate execution
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
      const result = await this.dispatchAction(
        action.action_type,
        action.action_config as Record<string, unknown>,
        incident,
        participant,
        tx,
      );

      await tx.behaviourPolicyActionExecution.create({
        data: {
          tenant_id: incident.tenant_id,
          evaluation_id: evaluationId,
          action_type: action.action_type,
          action_config: action.action_config as Prisma.InputJsonValue,
          execution_status: 'success',
          created_entity_type: result?.entityType ?? null,
          created_entity_id: result?.entityId ?? null,
          executed_at: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Action ${action.action_type} failed for evaluation ${evaluationId}: ${err instanceof Error ? err.message : String(err)}`,
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
      // Do not rethrow — single failed action must not abort pipeline
    }
  }

  /**
   * Dispatch action by type. Each handler is responsible for dedup.
   */
  private async dispatchAction(
    actionType: $Enums.PolicyActionType,
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    switch (actionType) {
      case 'auto_escalate':
        return this.executeAutoEscalate(config, incident, participant, tx);
      case 'create_sanction':
        return this.executeCreateSanction(config, incident, participant, tx);
      case 'require_approval':
        return this.executeRequireApproval(config, incident, tx);
      case 'require_parent_meeting':
        return this.executeRequireParentMeeting(config, incident, participant, tx);
      case 'require_parent_notification':
        return this.executeRequireParentNotification(incident, tx);
      case 'create_task':
        return this.executeCreateTask(config, incident, participant, tx);
      case 'create_intervention':
        return this.executeCreateIntervention(config, incident, participant, tx);
      case 'notify_roles':
        // Enqueuing notifications is a side-effect we skip inside the tx
        // We record the action as success; actual dispatch is separate
        return null;
      case 'notify_users':
        return null;
      case 'flag_for_review':
        return this.executeFlagForReview(config, incident, tx);
      case 'block_without_approval':
        return this.executeBlockWithoutApproval(config, incident, tx);
      default:
        this.logger.warn(`Unknown action type: ${actionType}`);
        return null;
    }
  }

  private async executeAutoEscalate(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    const targetCategoryId = config.target_category_id as string;
    if (!targetCategoryId) return null;

    const targetCategory = await tx.behaviourCategory.findFirst({
      where: { id: targetCategoryId, tenant_id: incident.tenant_id },
    });
    if (!targetCategory) {
      this.logger.warn(`Auto-escalate: target category ${targetCategoryId} not found`);
      return null;
    }

    // Get the academic year from the original incident
    const original = await tx.behaviourIncident.findFirst({
      where: { id: incident.id },
      select: { academic_year_id: true },
    });

    // Create new escalated incident
    const escalated = await tx.behaviourIncident.create({
      data: {
        tenant_id: incident.tenant_id,
        category_id: targetCategoryId,
        description:
          `Auto-escalated from ${incident.incident_number}. ${(config.reason as string) ?? ''}`.trim(),
        polarity: targetCategory.polarity as $Enums.BehaviourPolarity,
        severity: targetCategory.severity,
        context_type: incident.context_type as $Enums.ContextType,
        occurred_at: incident.occurred_at,
        weekday: incident.weekday,
        period_order: incident.period_order,
        status: 'active',
        reported_by_id: incident.reported_by_id,
        incident_number: '',
        escalated_from_id: incident.id,
        academic_year_id: original?.academic_year_id ?? '',
        context_snapshot: {} as Prisma.InputJsonValue,
      },
    });

    // Transition original incident to 'escalated'
    await tx.behaviourIncident.update({
      where: { id: incident.id },
      data: { status: 'escalated' },
    });

    return {
      entityType: 'behaviour_incidents',
      entityId: escalated.id,
    };
  }

  private async executeCreateSanction(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    if (!participant.student_id) return null;

    const sanctionType = config.sanction_type as string;

    // Dedup: check for existing sanction of same type on same incident+student
    const existing = await tx.behaviourSanction.findFirst({
      where: {
        tenant_id: incident.tenant_id,
        incident_id: incident.id,
        student_id: participant.student_id,
        type: sanctionType as $Enums.SanctionType,
      },
    });
    if (existing) return { entityType: 'behaviour_sanctions', entityId: existing.id };

    const daysOffset = (config.days_offset as number) ?? 0;
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + daysOffset);

    const sanction = await tx.behaviourSanction.create({
      data: {
        tenant_id: incident.tenant_id,
        sanction_number: '',
        incident_id: incident.id,
        student_id: participant.student_id,
        type: sanctionType as $Enums.SanctionType,
        status: 'scheduled',
        scheduled_date: scheduledDate,
        notes: (config.notes as string) ?? null,
      },
    });

    return { entityType: 'behaviour_sanctions', entityId: sanction.id };
  }

  private async executeRequireApproval(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    // Dedup: check if approval already required
    if (incident.status === 'awaiting_approval') return null;
    const currentIncident = await tx.behaviourIncident.findFirst({
      where: { id: incident.id },
      select: { approval_status: true },
    });
    if (currentIncident?.approval_status !== 'not_required') return null;

    // Set approval status to pending
    await tx.behaviourIncident.update({
      where: { id: incident.id },
      data: { approval_status: 'pending' },
    });

    return null;
  }

  private async executeRequireParentMeeting(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    if (!participant.student_id) return null;

    // Dedup: check for existing incomplete parent_meeting task
    const existing = await tx.behaviourTask.findFirst({
      where: {
        tenant_id: incident.tenant_id,
        entity_type: 'incident',
        entity_id: incident.id,
        task_type: 'parent_meeting',
        status: { notIn: ['completed', 'cancelled'] },
      },
    });
    if (existing) return { entityType: 'behaviour_tasks', entityId: existing.id };

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
        description: (config.notes as string) ?? null,
      },
    });

    return { entityType: 'behaviour_tasks', entityId: task.id };
  }

  private async executeRequireParentNotification(
    incident: IncidentForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    const current = await tx.behaviourIncident.findFirst({
      where: { id: incident.id },
      select: { parent_notification_status: true },
    });

    if (
      current?.parent_notification_status !== 'not_required' &&
      current?.parent_notification_status !== 'pending'
    ) {
      return null;
    }

    if (current.parent_notification_status === 'not_required') {
      await tx.behaviourIncident.update({
        where: { id: incident.id },
        data: { parent_notification_status: 'pending' },
      });
    }

    return null;
  }

  private async executeCreateTask(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    if (!participant.student_id) return null;

    const taskType = config.task_type as string;

    // Dedup: check for existing task of same type for incident+student
    const existing = await tx.behaviourTask.findFirst({
      where: {
        tenant_id: incident.tenant_id,
        entity_type: 'incident',
        entity_id: incident.id,
        task_type: taskType as $Enums.BehaviourTaskType,
        status: { notIn: ['completed', 'cancelled'] },
      },
    });
    if (existing) return { entityType: 'behaviour_tasks', entityId: existing.id };

    const dueInDays = (config.due_in_school_days as number) ?? 3;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueInDays);

    const assigneeId = (config.assigned_to_user_id as string) ?? incident.reported_by_id;

    const task = await tx.behaviourTask.create({
      data: {
        tenant_id: incident.tenant_id,
        task_type: taskType as $Enums.BehaviourTaskType,
        entity_type: 'incident',
        entity_id: incident.id,
        title: (config.title as string) ?? `Task for ${incident.incident_number}`,
        assigned_to_id: assigneeId,
        created_by_id: incident.reported_by_id,
        priority: ((config.priority as string) ?? 'medium') as $Enums.TaskPriority,
        status: 'pending',
        due_date: dueDate,
      },
    });

    return { entityType: 'behaviour_tasks', entityId: task.id };
  }

  private async executeCreateIntervention(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    participant: ParticipantForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    if (!participant.student_id) return null;

    const interventionType = config.type as string;

    // Dedup: check for active intervention of same type within last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const existing = await tx.behaviourIntervention.findFirst({
      where: {
        tenant_id: incident.tenant_id,
        student_id: participant.student_id,
        type: interventionType as $Enums.InterventionType,
        status: { in: ['active_intervention', 'planned'] },
        created_at: { gte: thirtyDaysAgo },
      },
    });
    if (existing) {
      return {
        entityType: 'behaviour_interventions',
        entityId: existing.id,
      };
    }

    const intervention = await tx.behaviourIntervention.create({
      data: {
        tenant_id: incident.tenant_id,
        intervention_number: '',
        student_id: participant.student_id,
        type: interventionType as $Enums.InterventionType,
        status: 'active_intervention',
        title: (config.title as string) ?? `Intervention for ${incident.incident_number}`,
        trigger_description: `Auto-created by policy engine for incident ${incident.incident_number}`,
        assigned_to_id: incident.reported_by_id,
        start_date: new Date(),
      },
    });

    return {
      entityType: 'behaviour_interventions',
      entityId: intervention.id,
    };
  }

  private async executeFlagForReview(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
    const current = await tx.behaviourIncident.findFirst({
      where: { id: incident.id },
      select: { status: true },
    });

    if (current?.status === 'active') {
      await tx.behaviourIncident.update({
        where: { id: incident.id },
        data: { status: 'under_review' },
      });

      await this.historyService.recordHistory(
        tx,
        incident.tenant_id,
        'incident',
        incident.id,
        incident.reported_by_id,
        'status_changed',
        { status: 'active' },
        { status: 'under_review' },
        (config.reason as string) ?? 'Flagged for review by policy engine',
      );
    }

    return null;
  }

  private async executeBlockWithoutApproval(
    config: Record<string, unknown>,
    incident: IncidentForEval,
    tx: PrismaService,
  ): Promise<ActionExecResult | null> {
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

    return null;
  }
}
