/**
 * BehaviourReadFacade — Centralised read service for behaviour data.
 *
 * PURPOSE:
 * Several modules (compliance, early-warning, policy-engine, regulatory) read
 * behaviour tables directly via Prisma, duplicating select clauses and coupling
 * tightly to the schema. This facade provides a single, well-typed entry point
 * for all cross-module behaviour reads. Select clauses live here, so schema
 * changes propagate through a single file instead of many consumer modules.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Select constants ─────────────────────────────────────────────────────────

const INCIDENT_SELECT = {
  id: true,
  incident_number: true,
  category_id: true,
  polarity: true,
  severity: true,
  description: true,
  occurred_at: true,
  logged_at: true,
  status: true,
  retention_status: true,
  created_at: true,
} as const;

const INCIDENT_PARTICIPANT_SELECT = {
  id: true,
  incident_id: true,
  student_id: true,
  role: true,
  points_awarded: true,
  incident: { select: INCIDENT_SELECT },
} as const;

const SANCTION_SELECT = {
  id: true,
  sanction_number: true,
  incident_id: true,
  student_id: true,
  type: true,
  status: true,
  scheduled_date: true,
  suspension_start_date: true,
  suspension_end_date: true,
  suspension_days: true,
  retention_status: true,
  created_at: true,
} as const;

const APPEAL_SELECT = {
  id: true,
  appeal_number: true,
  incident_id: true,
  sanction_id: true,
  student_id: true,
  status: true,
  grounds: true,
  grounds_category: true,
  submitted_at: true,
  decision: true,
  decided_at: true,
  retention_status: true,
  created_at: true,
} as const;

const EXCLUSION_CASE_SELECT = {
  id: true,
  case_number: true,
  sanction_id: true,
  incident_id: true,
  student_id: true,
  type: true,
  status: true,
  decision: true,
  decision_date: true,
  created_at: true,
} as const;

const RECOGNITION_AWARD_SELECT = {
  id: true,
  student_id: true,
  award_type_id: true,
  points_at_award: true,
  awarded_at: true,
  academic_year_id: true,
  triggered_by_incident_id: true,
  created_at: true,
} as const;

const INTERVENTION_SELECT = {
  id: true,
  intervention_number: true,
  student_id: true,
  title: true,
  type: true,
  status: true,
  start_date: true,
  target_end_date: true,
  actual_end_date: true,
  retention_status: true,
  created_at: true,
} as const;

const PARENT_ACKNOWLEDGEMENT_SELECT = {
  id: true,
  incident_id: true,
  sanction_id: true,
  parent_id: true,
  sent_at: true,
  acknowledged_at: true,
  acknowledgement_method: true,
  created_at: true,
} as const;

const POLICY_RULE_SELECT = {
  id: true,
  name: true,
  description: true,
  is_active: true,
  stage: true,
  priority: true,
  match_strategy: true,
  stop_processing_stage: true,
  conditions: true,
  current_version: true,
  cooldown_hours: true,
  actions: { select: { id: true, action_type: true, action_config: true, execution_order: true } },
} as const;

const POLICY_EVALUATION_SELECT = {
  id: true,
  incident_id: true,
  student_id: true,
  stage: true,
  rule_version_id: true,
  evaluation_result: true,
  evaluated_input: true,
  matched_conditions: true,
  unmatched_conditions: true,
  rules_evaluated_count: true,
  evaluation_duration_ms: true,
  created_at: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface BehaviourIncidentRow {
  id: string;
  incident_number: string;
  category_id: string;
  polarity: string;
  severity: number;
  description: string;
  occurred_at: Date;
  logged_at: Date;
  status: string;
  retention_status: string;
  created_at: Date;
}

export interface BehaviourIncidentParticipantRow {
  id: string;
  incident_id: string;
  student_id: string | null;
  role: string;
  points_awarded: number;
  incident: BehaviourIncidentRow;
}

export interface BehaviourSanctionRow {
  id: string;
  sanction_number: string;
  incident_id: string;
  student_id: string;
  type: string;
  status: string;
  scheduled_date: Date;
  suspension_start_date: Date | null;
  suspension_end_date: Date | null;
  suspension_days: number | null;
  retention_status: string;
  created_at: Date;
}

export interface BehaviourAppealRow {
  id: string;
  appeal_number: string;
  incident_id: string;
  sanction_id: string | null;
  student_id: string;
  status: string;
  grounds: string;
  grounds_category: string;
  submitted_at: Date;
  decision: string | null;
  decided_at: Date | null;
  retention_status: string;
  created_at: Date;
}

export interface BehaviourExclusionCaseRow {
  id: string;
  case_number: string;
  sanction_id: string;
  incident_id: string;
  student_id: string;
  type: string;
  status: string;
  decision: string | null;
  decision_date: Date | null;
  created_at: Date;
}

export interface BehaviourRecognitionAwardRow {
  id: string;
  student_id: string;
  award_type_id: string;
  points_at_award: number;
  awarded_at: Date;
  academic_year_id: string;
  triggered_by_incident_id: string | null;
  created_at: Date;
}

export interface BehaviourInterventionRow {
  id: string;
  intervention_number: string;
  student_id: string;
  title: string;
  type: string;
  status: string;
  start_date: Date;
  target_end_date: Date | null;
  actual_end_date: Date | null;
  retention_status: string;
  created_at: Date;
}

export interface BehaviourParentAcknowledgementRow {
  id: string;
  incident_id: string | null;
  sanction_id: string | null;
  parent_id: string;
  sent_at: Date;
  acknowledged_at: Date | null;
  acknowledgement_method: string | null;
  created_at: Date;
}

export interface BehaviourPolicyRuleActionRow {
  id: string;
  action_type: string;
  action_config: unknown;
  execution_order: number;
}

export interface BehaviourPolicyRuleRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  stage: string;
  priority: number;
  match_strategy: string;
  stop_processing_stage: boolean;
  conditions: unknown;
  current_version: number;
  cooldown_hours: number | null;
  actions: BehaviourPolicyRuleActionRow[];
}

export interface BehaviourPolicyEvaluationRow {
  id: string;
  incident_id: string;
  student_id: string;
  stage: string;
  rule_version_id: string | null;
  evaluation_result: string;
  evaluated_input: unknown;
  matched_conditions: unknown;
  unmatched_conditions: unknown;
  rules_evaluated_count: number;
  evaluation_duration_ms: number | null;
  created_at: Date;
}

export interface BehaviourAttachmentRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  uploaded_by_id: string;
  file_name: string;
  file_key: string;
  file_size_bytes: bigint;
  mime_type: string;
  sha256_hash: string;
  classification: string;
  description: string | null;
  visibility: string;
  is_redactable: boolean;
  scan_status: string;
  created_at: Date;
  updated_at: Date;
}

export interface BehaviourTaskRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  priority: string;
  status: string;
  due_date: Date | null;
  completed_at: Date | null;
  completed_by_id: string | null;
  completion_notes: string | null;
  created_at: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find all incidents a student participated in (via participant join).
   * Used by DSAR traversal.
   */
  async findIncidentsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourIncidentParticipantRow[]> {
    return this.prisma.behaviourIncidentParticipant.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: INCIDENT_PARTICIPANT_SELECT,
    });
  }

  /**
   * Find all sanctions issued to a student.
   * Used by DSAR traversal and regulatory Tusla SAR.
   */
  async findSanctionsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourSanctionRow[]> {
    return this.prisma.behaviourSanction.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: SANCTION_SELECT,
    });
  }

  /**
   * Find all appeals lodged for a student.
   * Used by DSAR traversal.
   */
  async findAppealsForStudent(tenantId: string, studentId: string): Promise<BehaviourAppealRow[]> {
    return this.prisma.behaviourAppeal.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: APPEAL_SELECT,
    });
  }

  /**
   * Find all exclusion cases for a student.
   * Used by DSAR traversal and early-warning signals.
   */
  async findExclusionCasesForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourExclusionCaseRow[]> {
    return this.prisma.behaviourExclusionCase.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: EXCLUSION_CASE_SELECT,
    });
  }

  /**
   * Find all recognition awards for a student.
   * Used by DSAR traversal.
   */
  async findRecognitionAwardsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourRecognitionAwardRow[]> {
    return this.prisma.behaviourRecognitionAward.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: RECOGNITION_AWARD_SELECT,
    });
  }

  /**
   * Find incident participant records within a recent time window.
   * Used by early-warning behaviour signals (14d/30d windows).
   */
  async findRecentIncidents(
    tenantId: string,
    studentId: string,
    dayWindow: number,
  ): Promise<BehaviourIncidentParticipantRow[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayWindow);

    return this.prisma.behaviourIncidentParticipant.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        incident: { occurred_at: { gte: cutoff } },
      },
      select: INCIDENT_PARTICIPANT_SELECT,
    });
  }

  /**
   * Find sanctions within a recent time window.
   * Used by early-warning behaviour signals.
   */
  async findRecentSanctions(
    tenantId: string,
    studentId: string,
    dayWindow: number,
  ): Promise<BehaviourSanctionRow[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayWindow);

    return this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        created_at: { gte: cutoff },
      },
      select: SANCTION_SELECT,
    });
  }

  /**
   * Find all active or historical interventions for a student.
   * Used by early-warning signals.
   */
  async findInterventionsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourInterventionRow[]> {
    return this.prisma.behaviourIntervention.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: INTERVENTION_SELECT,
    });
  }

  /**
   * Find parent acknowledgement records within a time window for a student.
   * Used by early-warning engagement signals.
   */
  async findParentAcknowledgements(
    tenantId: string,
    studentId: string,
    dayWindow: number,
  ): Promise<BehaviourParentAcknowledgementRow[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - dayWindow);

    // behaviourParentAcknowledgement has no direct student_id; join via incident participant.
    // We look for acks linked to incidents where the student participated.
    const participants = await this.prisma.behaviourIncidentParticipant.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { incident_id: true },
    });

    const incidentIds = participants.map((p) => p.incident_id);

    if (incidentIds.length === 0) return [];

    return this.prisma.behaviourParentAcknowledgement.findMany({
      where: {
        tenant_id: tenantId,
        incident_id: { in: incidentIds },
        sent_at: { gte: cutoff },
      },
      select: PARENT_ACKNOWLEDGEMENT_SELECT,
    });
  }

  /**
   * Count incidents created before a given cutoff date across all students.
   * Used by retention-policies to determine purgeable records.
   */
  async countIncidentsBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.behaviourIncident.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  /**
   * Find suspension-type sanctions for a student, optionally filtered by date range.
   * Used by regulatory Tusla SAR reporting. Suspension types:
   *   suspension_internal, suspension_external.
   */
  async findSuspensionsForStudent(
    tenantId: string,
    studentId: string,
    dateRange?: { from: Date; to: Date },
  ): Promise<BehaviourSanctionRow[]> {
    return this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        type: { in: ['suspension_internal', 'suspension_external'] },
        ...(dateRange
          ? {
              scheduled_date: {
                gte: dateRange.from,
                lte: dateRange.to,
              },
            }
          : {}),
      },
      select: SANCTION_SELECT,
    });
  }

  /**
   * Find all active policy rules for a tenant, including their actions.
   * Used by policy-engine replay.
   */
  async findPolicyRules(tenantId: string): Promise<BehaviourPolicyRuleRow[]> {
    return this.prisma.behaviourPolicyRule.findMany({
      where: { tenant_id: tenantId, is_active: true },
      select: POLICY_RULE_SELECT,
      orderBy: [{ stage: 'asc' }, { priority: 'asc' }],
    });
  }

  /**
   * Find all policy evaluations for a given incident.
   * Used by policy-engine replay to inspect past evaluation history.
   */
  async findPolicyEvaluationsForIncident(
    tenantId: string,
    incidentId: string,
  ): Promise<BehaviourPolicyEvaluationRow[]> {
    return this.prisma.behaviourPolicyEvaluation.findMany({
      where: { tenant_id: tenantId, incident_id: incidentId },
      select: POLICY_EVALUATION_SELECT,
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Find policy evaluations with action executions and rule version for trace view.
   * Used by policy-engine incident trace.
   */
  async findPolicyEvaluationTrace(
    tenantId: string,
    incidentId: string,
  ): Promise<unknown[]> {
    return this.prisma.behaviourPolicyEvaluation.findMany({
      where: { tenant_id: tenantId, incident_id: incidentId },
      include: {
        action_executions: {
          orderBy: { executed_at: 'asc' },
        },
        rule_version: true,
      },
      orderBy: [{ stage: 'asc' }, { created_at: 'asc' }],
    });
  }

  /**
   * Find a single policy rule by ID with actions.
   * Used by policy-engine for rule CRUD and replay.
   */
  async findPolicyRuleById(
    tenantId: string,
    ruleId: string,
  ): Promise<BehaviourPolicyRuleRow | null> {
    return this.prisma.behaviourPolicyRule.findFirst({
      where: { id: ruleId, tenant_id: tenantId },
      select: POLICY_RULE_SELECT,
    }) as Promise<BehaviourPolicyRuleRow | null>;
  }

  /**
   * List policy rules with pagination and optional filters.
   * Used by policy-engine rules listing.
   */
  async findPolicyRulesPaginated(
    tenantId: string,
    filters: { stage?: string; is_active?: boolean },
    pagination: { skip: number; take: number },
  ): Promise<{ data: unknown[]; total: number }> {
    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (filters.stage !== undefined) where.stage = filters.stage;
    if (filters.is_active !== undefined) where.is_active = filters.is_active;

    const [data, total] = await Promise.all([
      this.prisma.behaviourPolicyRule.findMany({
        where,
        include: { actions: { orderBy: { execution_order: 'asc' } } },
        orderBy: [{ stage: 'asc' }, { priority: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.behaviourPolicyRule.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find policy rule version history for a rule.
   * Used by policy-engine version management.
   */
  async findPolicyRuleVersions(
    tenantId: string,
    ruleId: string,
  ): Promise<unknown[]> {
    return this.prisma.behaviourPolicyRuleVersion.findMany({
      where: { rule_id: ruleId, tenant_id: tenantId },
      orderBy: { version: 'desc' },
      include: {
        changed_by: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  /**
   * Find a specific policy rule version.
   * Used by policy-engine version detail view.
   */
  async findPolicyRuleVersion(
    tenantId: string,
    ruleId: string,
    version: number,
  ): Promise<unknown | null> {
    return this.prisma.behaviourPolicyRuleVersion.findFirst({
      where: { rule_id: ruleId, tenant_id: tenantId, version },
      include: {
        changed_by: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
  }

  /**
   * Find behaviour categories for a tenant.
   * Used by policy-engine import/export for category name resolution.
   */
  async findCategories(
    tenantId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.behaviourCategory.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });
  }

  /**
   * Find a single behaviour category by ID.
   * Used by policy-engine dry-run for category name resolution.
   */
  async findCategoryById(
    tenantId: string,
    categoryId: string,
  ): Promise<{ name: string } | null> {
    return this.prisma.behaviourCategory.findFirst({
      where: { id: categoryId, tenant_id: tenantId },
      select: { name: true },
    });
  }

  /**
   * Find incidents in a date range with category and student participants.
   * Used by policy-engine replay.
   */
  async findIncidentsForReplay(
    tenantId: string,
    fromDate: Date,
    toDate: Date,
    excludeStatuses: string[],
  ): Promise<unknown[]> {
    return this.prisma.behaviourIncident.findMany({
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: fromDate, lte: toDate },
        status: { notIn: excludeStatuses as never[] },
      },
      include: {
        category: { select: { name: true } },
        participants: { where: { participant_type: 'student' } },
      },
    });
  }

  // ─── Tusla / Regulatory Methods ────────────────────────────────────────────

  /**
   * Find sanctions matching Tusla notification criteria (suspension type + minimum days).
   * Used by regulatory-tusla for suspension notifications.
   */
  async findSanctionsForTusla(
    tenantId: string,
    filters: {
      types: string[];
      minSuspensionDays: number;
      dateFilter?: { gte: Date; lte: Date };
    },
  ): Promise<unknown[]> {
    return this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        type: { in: filters.types as never[] },
        suspension_days: { gte: filters.minSuspensionDays },
        ...(filters.dateFilter ? { created_at: filters.dateFilter } : {}),
      },
      select: {
        id: true,
        sanction_number: true,
        type: true,
        status: true,
        suspension_start_date: true,
        suspension_end_date: true,
        suspension_days: true,
        notes: true,
        created_at: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
            date_of_birth: true,
            year_group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Find exclusion cases for Tusla notification.
   * Used by regulatory-tusla for expulsion notifications.
   */
  async findExclusionCasesForTusla(
    tenantId: string,
    filters: {
      dateFilter?: { gte: Date; lte: Date };
    },
  ): Promise<unknown[]> {
    return this.prisma.behaviourExclusionCase.findMany({
      where: {
        tenant_id: tenantId,
        ...(filters.dateFilter ? { created_at: filters.dateFilter } : {}),
      },
      select: {
        id: true,
        case_number: true,
        type: true,
        status: true,
        decision: true,
        decision_date: true,
        formal_notice_issued_at: true,
        hearing_date: true,
        created_at: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
            date_of_birth: true,
            year_group: { select: { id: true, name: true } },
          },
        },
        sanction: {
          select: { id: true, sanction_number: true, type: true, suspension_days: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Attachment Methods ─────────────────────────────────────────────────────

  /**
   * Find a single behaviour attachment by ID and tenant.
   * Used by safeguarding attachment download.
   */
  async findAttachmentById(
    tenantId: string,
    attachmentId: string,
  ): Promise<BehaviourAttachmentRow | null> {
    return this.prisma.behaviourAttachment.findFirst({
      where: { id: attachmentId, tenant_id: tenantId },
    }) as Promise<BehaviourAttachmentRow | null>;
  }

  /**
   * Find all behaviour attachments for a given entity (e.g., safeguarding_concern).
   * Used by safeguarding attachment listing.
   */
  async findAttachmentsByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<Array<{
    id: string;
    file_name: string;
    classification: string;
    scan_status: string;
    file_size_bytes: bigint;
    uploaded_by: { id: string; first_name: string; last_name: string };
    created_at: Date;
  }>> {
    return this.prisma.behaviourAttachment.findMany({
      where: {
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
      },
      orderBy: { created_at: 'desc' },
      include: {
        uploaded_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    }) as Promise<Array<{
      id: string;
      file_name: string;
      classification: string;
      scan_status: string;
      file_size_bytes: bigint;
      uploaded_by: { id: string; first_name: string; last_name: string };
      created_at: Date;
    }>>;
  }

  // ─── Task Methods ───────────────────────────────────────────────────────────

  /**
   * Find overdue behaviour tasks filtered by entity types.
   * Used by safeguarding dashboard to display overdue safeguarding tasks.
   */
  async findOverdueTasksByEntityTypes(
    tenantId: string,
    entityTypes: string[],
    limit: number,
  ): Promise<BehaviourTaskRow[]> {
    return this.prisma.behaviourTask.findMany({
      where: {
        tenant_id: tenantId,
        entity_type: { in: entityTypes as never[] },
        status: { in: ['pending', 'in_progress', 'overdue'] as never[] },
        due_date: { lt: new Date() },
      },
      take: limit,
      orderBy: { due_date: 'asc' },
    }) as Promise<BehaviourTaskRow[]>;
  }
}
