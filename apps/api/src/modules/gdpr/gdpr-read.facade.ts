/**
 * GdprReadFacade — Centralised read service for GDPR-related data.
 *
 * PURPOSE:
 * Multiple modules (compliance, reports, early-warning) read GDPR tables directly
 * via Prisma, duplicating select clauses and coupling tightly to the schema.
 * This facade provides a single, well-typed entry point for all cross-module
 * GDPR reads. Schema changes propagate through a single file.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Select shapes ──────────────────────────────────────────────────────────

const CONSENT_RECORD_SELECT = {
  id: true,
  tenant_id: true,
  subject_type: true,
  subject_id: true,
  consent_type: true,
  status: true,
  granted_at: true,
  withdrawn_at: true,
  granted_by_user_id: true,
  evidence_type: true,
  notes: true,
  created_at: true,
  updated_at: true,
} as const;

const RETENTION_POLICY_SELECT = {
  id: true,
  tenant_id: true,
  data_category: true,
  retention_months: true,
  action_on_expiry: true,
  is_overridable: true,
  statutory_basis: true,
  created_at: true,
  updated_at: true,
} as const;

const RETENTION_HOLD_SELECT = {
  id: true,
  tenant_id: true,
  subject_type: true,
  subject_id: true,
  reason: true,
  held_by_user_id: true,
  held_at: true,
  released_at: true,
  created_at: true,
} as const;

const ANONYMISATION_TOKEN_SELECT = {
  id: true,
  tenant_id: true,
  entity_type: true,
  entity_id: true,
  field_type: true,
  token: true,
  created_at: true,
} as const;

const TOKEN_USAGE_LOG_SELECT = {
  id: true,
  tenant_id: true,
  export_type: true,
  tokenised: true,
  policy_applied: true,
  lawful_basis: true,
  tokens_used: true,
  entity_count: true,
  triggered_by: true,
  created_at: true,
} as const;

const AI_PROCESSING_LOG_SELECT = {
  id: true,
  tenant_id: true,
  ai_service: true,
  subject_type: true,
  subject_id: true,
  model_used: true,
  prompt_summary: true,
  response_summary: true,
  tokenised: true,
  created_at: true,
} as const;

// ─── Result types ───────────────────────────────────────────────────────────

export interface ConsentRecordRow {
  id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  consent_type: string;
  status: string;
  granted_at: Date;
  withdrawn_at: Date | null;
  granted_by_user_id: string;
  evidence_type: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RetentionPolicyRow {
  id: string;
  tenant_id: string | null;
  data_category: string;
  retention_months: number;
  action_on_expiry: string;
  is_overridable: boolean;
  statutory_basis: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RetentionHoldRow {
  id: string;
  tenant_id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  held_by_user_id: string;
  held_at: Date;
  released_at: Date | null;
  created_at: Date;
}

export interface AnonymisationTokenRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  field_type: string;
  token: string;
  created_at: Date;
}

export interface TokenUsageLogRow {
  id: string;
  tenant_id: string;
  export_type: string;
  tokenised: boolean;
  policy_applied: string;
  lawful_basis: string | null;
  tokens_used: string[];
  entity_count: number;
  triggered_by: string;
  created_at: Date;
}

export interface AiProcessingLogRow {
  id: string;
  tenant_id: string;
  ai_service: string;
  subject_type: string | null;
  subject_id: string | null;
  model_used: string | null;
  prompt_summary: string | null;
  response_summary: string | null;
  tokenised: boolean;
  created_at: Date;
}

// ─── Facade ─────────────────────────────────────────────────────────────────

@Injectable()
export class GdprReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Consent Records ──────────────────────────────────────────────────────

  /**
   * Find consent records for a specific subject (student, staff, applicant).
   * Used by DSAR traversal.
   */
  async findConsentRecordsBySubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<ConsentRecordRow[]> {
    return this.prisma.consentRecord.findMany({
      where: { tenant_id: tenantId, subject_type: subjectType, subject_id: subjectId },
      select: CONSENT_RECORD_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Find all consent records for a tenant (optionally by type).
   * Used by compliance dashboards.
   */
  async findConsentRecords(
    tenantId: string,
    options?: { consentType?: string },
  ): Promise<ConsentRecordRow[]> {
    return this.prisma.consentRecord.findMany({
      where: {
        tenant_id: tenantId,
        ...(options?.consentType ? { consent_type: options.consentType } : {}),
      },
      select: CONSENT_RECORD_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Retention Policies ───────────────────────────────────────────────────

  /**
   * Find platform-default retention policies (tenant_id IS NULL).
   * Used by compliance retention service.
   */
  async findPlatformDefaultPolicies(): Promise<RetentionPolicyRow[]> {
    return this.prisma.retentionPolicy.findMany({
      where: { tenant_id: null },
      select: RETENTION_POLICY_SELECT,
      orderBy: { data_category: 'asc' },
    });
  }

  /**
   * Find tenant-specific retention policy overrides.
   * Used by compliance retention service.
   */
  async findTenantPolicyOverrides(tenantId: string): Promise<RetentionPolicyRow[]> {
    return this.prisma.retentionPolicy.findMany({
      where: { tenant_id: tenantId },
      select: RETENTION_POLICY_SELECT,
      orderBy: { data_category: 'asc' },
    });
  }

  /**
   * Find a retention policy by ID.
   * Used by compliance policy override workflow.
   */
  async findRetentionPolicyById(policyId: string): Promise<RetentionPolicyRow | null> {
    return this.prisma.retentionPolicy.findFirst({
      where: { id: policyId },
      select: RETENTION_POLICY_SELECT,
    });
  }

  /**
   * Find a platform default policy for a given data category.
   */
  async findDefaultPolicyByCategory(dataCategory: string): Promise<RetentionPolicyRow | null> {
    return this.prisma.retentionPolicy.findFirst({
      where: { tenant_id: null, data_category: dataCategory },
      select: RETENTION_POLICY_SELECT,
    });
  }

  // ─── Retention Holds ──────────────────────────────────────────────────────

  /**
   * Find retention holds for a tenant, paginated.
   * Used by compliance retention holds management.
   */
  async findRetentionHolds(
    tenantId: string,
    options?: { page?: number; pageSize?: number; activeOnly?: boolean },
  ): Promise<{ data: RetentionHoldRow[]; total: number }> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (options?.activeOnly) {
      where.released_at = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.retentionHold.findMany({
        where,
        select: RETENTION_HOLD_SELECT,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.retentionHold.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find an active retention hold by subject type + ID.
   * Used by compliance to check if a hold already exists.
   */
  /**
   * Find a retention hold by ID.
   * Used by compliance retention hold release.
   */
  async findRetentionHoldById(
    tenantId: string,
    holdId: string,
  ): Promise<RetentionHoldRow | null> {
    return this.prisma.retentionHold.findFirst({
      where: { id: holdId, tenant_id: tenantId },
      select: RETENTION_HOLD_SELECT,
    });
  }

  async findActiveRetentionHoldBySubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<RetentionHoldRow | null> {
    return this.prisma.retentionHold.findFirst({
      where: {
        tenant_id: tenantId,
        subject_type: subjectType,
        subject_id: subjectId,
        released_at: null,
      },
      select: RETENTION_HOLD_SELECT,
    });
  }

  // ─── Anonymisation Tokens ─────────────────────────────────────────────────

  /**
   * Find anonymisation tokens for a specific entity.
   * Used by DSAR traversal to discover all tokens for a data subject.
   */
  async findAnonymisationTokensByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<AnonymisationTokenRow[]> {
    return this.prisma.gdprAnonymisationToken.findMany({
      where: { tenant_id: tenantId, entity_type: entityType, entity_id: entityId },
      select: ANONYMISATION_TOKEN_SELECT,
    });
  }

  /**
   * Count all anonymisation tokens for a tenant.
   * Used by GDPR token dashboard.
   */
  async countAnonymisationTokens(tenantId: string): Promise<number> {
    return this.prisma.gdprAnonymisationToken.count({
      where: { tenant_id: tenantId },
    });
  }

  // ─── Token Usage Logs ─────────────────────────────────────────────────────

  /**
   * Find all token usage logs for a tenant.
   * Used by DSAR traversal.
   */
  async findTokenUsageLogs(tenantId: string): Promise<TokenUsageLogRow[]> {
    return this.prisma.gdprTokenUsageLog.findMany({
      where: { tenant_id: tenantId },
      select: TOKEN_USAGE_LOG_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count token usage logs before a cutoff date.
   * Used by retention policies for purgeable record counts.
   */
  async countTokenUsageLogsBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.gdprTokenUsageLog.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  // ─── AI Processing Logs ───────────────────────────────────────────────────

  /**
   * Find AI processing logs for a specific subject.
   * Used by DSAR traversal.
   */
  async findAiProcessingLogsBySubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<AiProcessingLogRow[]> {
    return this.prisma.aiProcessingLog.findMany({
      where: { tenant_id: tenantId, subject_type: subjectType, subject_id: subjectId },
      select: AI_PROCESSING_LOG_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }
}
