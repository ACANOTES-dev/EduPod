import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import {
  DryRunResult,
  DryRunStageResult,
  EvaluatedInput,
  PolicyCondition,
  PolicyConditionSchema,
  PolicyDryRunDto,
  ReplayPolicyRuleDto,
  ReplayResult,
  ReplaySampleMatch,
} from '@school/shared/behaviour';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { PolicyEvaluationEngine } from './policy-evaluation-engine';

const STAGE_ORDER_PRISMA: $Enums.PolicyStage[] = [
  'consequence',
  'approval_stage',
  'notification_stage',
  'support',
  'alerting',
];

const PRISMA_TO_STAGE: Record<string, string> = {
  consequence: 'consequence',
  approval_stage: 'approval',
  notification_stage: 'notification',
  support: 'support',
  alerting: 'alerting',
};

function toApiStage(prismaStage: string): string {
  return PRISMA_TO_STAGE[prismaStage] ?? prismaStage;
}

@Injectable()
export class PolicyReplayService {
  private readonly logger = new Logger(PolicyReplayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluationEngine: PolicyEvaluationEngine,
    private readonly behaviourReadFacade: BehaviourReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  /**
   * Historical replay: evaluates a rule against past incidents WITHOUT
   * executing any actions or writing any ledger entries.
   */
  async replayRule(tenantId: string, dto: ReplayPolicyRuleDto): Promise<ReplayResult> {
    // Validate period
    const fromDate = new Date(dto.replay_period.from);
    const toDate = new Date(dto.replay_period.to + 'T23:59:59Z');

    if (fromDate >= toDate) {
      throw new BadRequestException({
        code: 'INVALID_REPLAY_PERIOD',
        message: 'replay_period.from must be before replay_period.to',
      });
    }

    // Load the rule
    const rule = await this.behaviourReadFacade.findPolicyRuleById(tenantId, dto.rule_id);

    if (!rule) {
      throw new NotFoundException({
        code: 'POLICY_RULE_NOT_FOUND',
        message: 'Policy rule not found',
      });
    }

    const conditions = PolicyConditionSchema.parse(rule.conditions);

    // Load incidents in the period
    const incidents = (await this.behaviourReadFacade.findIncidentsForReplay(
      tenantId,
      fromDate,
      toDate,
      ['withdrawn', 'draft'],
    )) as Array<{
      id: string;
      category_id: string;
      polarity: string;
      severity: number;
      context_type: string;
      occurred_at: Date;
      weekday: number | null;
      period_order: number | null;
      category?: { name: string } | null;
      participants: Array<{
        student_id: string | null;
        role: string;
        student_snapshot: unknown;
      }>;
      incident_number?: string;
    }>;

    if (incidents.length > 10000) {
      throw new BadRequestException({
        code: 'REPLAY_TOO_LARGE',
        message: `Replay window contains ${incidents.length} incidents (max 10,000). Use a narrower date range.`,
      });
    }

    const matchedIncidentIds = new Set<string>();
    const affectedStudentIds = new Set<string>();
    const affectedYearGroupNames = new Set<string>();
    const actionCounts: Record<string, number> = {};
    const sanctionEstimates: Record<string, number> = {};
    const sampleMatches: ReplaySampleMatch[] = [];
    let studentCounter = 0;
    const studentLabelMap = new Map<string, string>();

    for (const incident of incidents) {
      for (const participant of incident.participants) {
        if (!participant.student_id) continue;

        const input = this.buildEvaluatedInputFromSnapshot(incident, participant, conditions);
        const matches = this.evaluationEngine.evaluateConditions(conditions, input);

        if (matches) {
          matchedIncidentIds.add(incident.id);
          affectedStudentIds.add(participant.student_id);

          const snapshot = (participant.student_snapshot ?? {}) as Record<string, unknown>;
          if (snapshot.year_group_name) {
            affectedYearGroupNames.add(snapshot.year_group_name as string);
          }

          for (const action of rule.actions) {
            const at = action.action_type as string;
            actionCounts[at] = (actionCounts[at] ?? 0) + 1;

            if (at === 'create_sanction') {
              const cfg = action.action_config as Record<string, unknown>;
              const st = (cfg.sanction_type as string) ?? 'other';
              sanctionEstimates[st] = (sanctionEstimates[st] ?? 0) + 1;
            }
          }

          if (sampleMatches.length < 10) {
            // Anonymise student labels
            if (!studentLabelMap.has(participant.student_id)) {
              studentCounter++;
              studentLabelMap.set(
                participant.student_id,
                `Student ${String.fromCharCode(64 + studentCounter)}`,
              );
            }

            sampleMatches.push({
              incident_id: incident.id,
              incident_number: (incident as Record<string, unknown>).incident_number as string,
              occurred_at: incident.occurred_at.toISOString(),
              student_id: participant.student_id,
              student_label: studentLabelMap.get(participant.student_id)!,
              year_group: (snapshot.year_group_name as string) ?? null,
              category_name: incident.category?.name ?? '',
              matched_conditions: conditions as unknown as Record<string, unknown>,
              actions_that_would_fire: rule.actions.map((a) => a.action_type as string),
            });
          }
        }
      }
    }

    const approvalCount =
      (actionCounts['require_approval'] ?? 0) + (actionCounts['block_without_approval'] ?? 0);

    return {
      rule_id: rule.id,
      rule_name: rule.name,
      stage: toApiStage(rule.stage),
      replay_period: dto.replay_period,
      incidents_evaluated: incidents.length,
      incidents_matched: matchedIncidentIds.size,
      students_affected: affectedStudentIds.size,
      affected_year_groups: Array.from(affectedYearGroupNames).sort(),
      actions_that_would_fire: actionCounts,
      estimated_sanctions_created: sanctionEstimates,
      estimated_approvals_created: approvalCount,
      sample_matches: sampleMatches,
    };
  }

  /**
   * Admin dry-run: evaluate a hypothetical incident against all active rules.
   * No data is written.
   */
  async dryRun(tenantId: string, dto: PolicyDryRunDto): Promise<DryRunResult> {
    const category = await this.behaviourReadFacade.findCategoryById(tenantId, dto.category_id);

    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: 'Category not found',
      });
    }

    // Build hypothetical input
    const hypotheticalInput: EvaluatedInput = {
      category_id: dto.category_id,
      category_name: category.name,
      polarity: dto.polarity,
      severity: dto.severity,
      context_type: dto.context_type,
      occurred_at: new Date().toISOString(),
      weekday: dto.weekday ?? null,
      period_order: dto.period_order ?? null,
      student_id: '00000000-0000-0000-0000-000000000000',
      participant_role: dto.participant_role,
      year_group_id: dto.student_year_group_id ?? null,
      year_group_name: null,
      has_send: dto.student_has_send,
      had_active_intervention: dto.student_has_active_intervention,
      repeat_count: dto.repeat_count,
      repeat_window_days_used: null,
      repeat_category_ids_used: [],
    };

    // Resolve year group name if ID provided
    if (dto.student_year_group_id) {
      const yg = await this.academicReadFacade.findYearGroupById(
        tenantId,
        dto.student_year_group_id,
      );
      if (yg) hypotheticalInput.year_group_name = yg.name;
    }

    const stageResults: DryRunStageResult[] = [];

    for (const stage of STAGE_ORDER_PRISMA) {
      const stageResult = await this.behaviourReadFacade.findPolicyRulesPaginated(
        tenantId,
        { stage, is_active: true },
        { skip: 0, take: 1000 },
      );
      const rules = stageResult.data as Array<{
        id: string;
        name: string;
        conditions: unknown;
        stop_processing_stage: boolean;
        match_strategy: string;
        actions: Array<{
          action_type: string;
          action_config: unknown;
        }>;
      }>;

      const matchedRules: DryRunStageResult['matched_rules'] = [];

      for (const rule of rules) {
        const conditions = PolicyConditionSchema.safeParse(rule.conditions);
        if (!conditions.success) continue;

        const matches = this.evaluationEngine.evaluateConditions(
          conditions.data,
          hypotheticalInput,
        );

        if (matches) {
          matchedRules.push({
            rule_id: rule.id,
            rule_name: rule.name,
            matched_conditions: conditions.data as unknown as Record<string, unknown>,
            actions_that_would_fire: rule.actions.map((a) => ({
              action_type: a.action_type as string,
              action_config: a.action_config as Record<string, unknown>,
            })),
          });

          if (rule.stop_processing_stage || rule.match_strategy === 'first_match') {
            break;
          }
        }
      }

      stageResults.push({
        stage: toApiStage(stage),
        rules_evaluated: rules.length,
        matched_rules: matchedRules,
      });
    }

    return {
      hypothetical_input: hypotheticalInput as unknown as Record<string, unknown>,
      stage_results: stageResults,
    };
  }

  /**
   * Full policy decision trace for an incident.
   */
  async getIncidentEvaluationTrace(tenantId: string, incidentId: string) {
    const evaluations = (await this.behaviourReadFacade.findPolicyEvaluationTrace(
      tenantId,
      incidentId,
    )) as Array<{
      stage: string;
      action_executions: Array<Record<string, unknown>>;
      rule_version: { stage: string; name: string; [key: string]: unknown } | null;
      [key: string]: unknown;
    }>;

    return {
      data: evaluations.map((e) => ({
        ...e,
        stage: toApiStage(e.stage),
        rule_version: e.rule_version
          ? { ...e.rule_version, stage: toApiStage(e.rule_version.stage) }
          : null,
      })),
    };
  }

  /**
   * Build evaluated input from frozen participant snapshot.
   * Used for replay — never queries live student data.
   */
  private buildEvaluatedInputFromSnapshot(
    incident: {
      id: string;
      category_id: string;
      polarity: string;
      severity: number;
      context_type: string;
      occurred_at: Date;
      weekday: number | null;
      period_order: number | null;
      category?: { name: string } | null;
    },
    participant: {
      student_id: string | null;
      role: string;
      student_snapshot: unknown;
    },
    conditions: PolicyCondition,
  ): EvaluatedInput {
    const snapshot = (participant.student_snapshot ?? {}) as Record<string, unknown>;

    return {
      category_id: incident.category_id,
      category_name: incident.category?.name ?? '',
      polarity: incident.polarity as 'positive' | 'negative' | 'neutral',
      severity: incident.severity,
      context_type: incident.context_type,
      occurred_at: incident.occurred_at.toISOString(),
      weekday: incident.weekday,
      period_order: incident.period_order,
      student_id: participant.student_id ?? '',
      participant_role: participant.role,
      year_group_id: (snapshot.year_group_id as string) ?? null,
      year_group_name: (snapshot.year_group_name as string) ?? null,
      has_send: (snapshot.has_send as boolean) ?? false,
      had_active_intervention: (snapshot.had_active_intervention as boolean) ?? false,
      repeat_count: 0, // Replay doesn't recompute repeat count from DB
      repeat_window_days_used: conditions.repeat_window_days ?? null,
      repeat_category_ids_used: conditions.repeat_category_ids ?? [],
    };
  }
}
