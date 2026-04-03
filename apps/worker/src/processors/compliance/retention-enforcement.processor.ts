import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

// ─── Job name ───────────────────────────────────────────────────────────────
export const RETENTION_ENFORCEMENT_JOB = 'data-retention:enforce';

// ─── Constants ──────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;
type DeletableModel =
  | 'notification'
  | 'auditLog'
  | 'contactFormSubmission'
  | 'nlQueryHistory'
  | 'gdprTokenUsageLog'
  | 'aiProcessingLog'
  | 'parentInquiryMessage';

/** Categories where the action is a straightforward deleteMany */
const DELETABLE_CATEGORIES: Record<string, { model: DeletableModel; dateField: string }> = {
  communications_notifications: { model: 'notification', dateField: 'created_at' },
  audit_logs: { model: 'auditLog', dateField: 'created_at' },
  contact_form_submissions: { model: 'contactFormSubmission', dateField: 'created_at' },
  nl_query_history: { model: 'nlQueryHistory', dateField: 'created_at' },
  ai_processing_logs: { model: 'aiProcessingLog', dateField: 'created_at' },
  tokenisation_usage_logs: { model: 'gdprTokenUsageLog', dateField: 'created_at' },
  parent_inquiry_messages: { model: 'parentInquiryMessage', dateField: 'created_at' },
};

/**
 * Categories that require complex anonymisation (cascade to many tables).
 * These are logged as dry-run capable but not executed automatically.
 * TODO: Integrate with ComplianceAnonymisationCore when DSAR/anonymisation pipeline matures.
 */
const ANONYMISE_ONLY_CATEGORIES = new Set([
  'student_records',
  'financial_records',
  'payroll_records',
  'staff_records',
  'attendance_records',
]);

// ─── Types ──────────────────────────────────────────────────────────────────

interface MergedPolicy {
  data_category: string;
  retention_months: number;
  action_on_expiry: string;
}

interface EnforcementSummary {
  data_category: string;
  action_on_expiry: string;
  records_affected: number;
  retention_months: number;
  dry_run: boolean;
  skipped_reason?: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.COMPLIANCE, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class RetentionEnforcementProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionEnforcementProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RETENTION_ENFORCEMENT_JOB) return;

    const dryRun = (job.data as Record<string, unknown>)?.dry_run === true;

    this.logger.log(`Starting retention enforcement (dry_run=${dryRun})`);

    // Cross-tenant cron — iterate all active tenants
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
    });

    for (const tenant of tenants) {
      try {
        await this.enforceForTenant(tenant.id, tenant.name, dryRun);
      } catch (error) {
        this.logger.error(
          `Retention enforcement failed for tenant ${tenant.name} (${tenant.id}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(`Retention enforcement complete — processed ${tenants.length} tenants`);
  }

  // ─── Per-tenant enforcement ─────────────────────────────────────────────

  private async enforceForTenant(
    tenantId: string,
    tenantName: string,
    dryRun: boolean,
  ): Promise<void> {
    this.logger.log(`Processing tenant ${tenantName} (${tenantId})`);

    // 1. Merge effective policies: platform defaults + tenant overrides
    const policies = await this.getEffectivePolicies(tenantId);

    if (policies.length === 0) {
      this.logger.log(`No retention policies found for tenant ${tenantName} — skipping`);
      return;
    }

    // 2. Get active retention holds
    const holds = await this.prisma.retentionHold.findMany({
      where: {
        tenant_id: tenantId,
        released_at: null,
      },
      select: { subject_type: true, subject_id: true },
    });

    const holdSet = new Set(holds.map((h) => `${h.subject_type}:${h.subject_id}`));

    // 3. Process each policy
    for (const policy of policies) {
      try {
        const summary = await this.enforceCategory(tenantId, policy, holdSet, dryRun);
        await this.createAuditEntry(tenantId, summary);
      } catch (error) {
        this.logger.error(
          `Failed to enforce category ${policy.data_category} for tenant ${tenantName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  // ─── Policy merging ─────────────────────────────────────────────────────

  private async getEffectivePolicies(tenantId: string): Promise<MergedPolicy[]> {
    // Fetch platform defaults (tenant_id IS NULL) and tenant overrides
    const allPolicies = await this.prisma.retentionPolicy.findMany({
      where: {
        OR: [{ tenant_id: null }, { tenant_id: tenantId }],
      },
      select: {
        tenant_id: true,
        data_category: true,
        retention_months: true,
        action_on_expiry: true,
      },
    });

    // Merge: tenant override wins over platform default
    const policyMap = new Map<string, MergedPolicy>();

    // First, load platform defaults
    for (const p of allPolicies) {
      if (p.tenant_id === null) {
        policyMap.set(p.data_category, {
          data_category: p.data_category,
          retention_months: p.retention_months,
          action_on_expiry: p.action_on_expiry,
        });
      }
    }

    // Then, apply tenant overrides
    for (const p of allPolicies) {
      if (p.tenant_id !== null) {
        policyMap.set(p.data_category, {
          data_category: p.data_category,
          retention_months: p.retention_months,
          action_on_expiry: p.action_on_expiry,
        });
      }
    }

    return Array.from(policyMap.values());
  }

  // ─── Category enforcement ───────────────────────────────────────────────

  private async enforceCategory(
    tenantId: string,
    policy: MergedPolicy,
    holdSet: Set<string>,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, retention_months, action_on_expiry } = policy;

    // Skip indefinite retention (retention_months = 0)
    if (retention_months === 0) {
      this.logger.log(`Skipping ${data_category} — indefinite retention (retention_months=0)`);
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
        skipped_reason: 'indefinite_retention',
      };
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retention_months);

    // Route to appropriate handler
    if (action_on_expiry === 'delete' && DELETABLE_CATEGORIES[data_category]) {
      return this.deleteCategoryRecords(tenantId, policy, cutoffDate, holdSet, dryRun);
    }

    if (action_on_expiry === 'anonymise' || ANONYMISE_ONLY_CATEGORIES.has(data_category)) {
      return this.handleAnonymiseCategory(tenantId, policy, cutoffDate, dryRun);
    }

    // s3_compliance_exports — special handling
    if (data_category === 's3_compliance_exports' && action_on_expiry === 'delete') {
      return this.deleteComplianceExports(tenantId, policy, cutoffDate, dryRun);
    }

    // rejected_admissions — special handling (extra status filter)
    if (data_category === 'rejected_admissions' && action_on_expiry === 'delete') {
      return this.deleteRejectedAdmissions(tenantId, policy, cutoffDate, holdSet, dryRun);
    }

    // behaviour_records — skip (complex anonymisation)
    if (data_category === 'behaviour_records') {
      this.logger.log(`Skipping ${data_category} — behaviour anonymisation is complex, deferred`);
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
        skipped_reason: 'complex_anonymisation_deferred',
      };
    }

    // archive — no infrastructure yet, log and skip
    if (action_on_expiry === 'archive') {
      return this.handleArchiveCategory(tenantId, policy, cutoffDate, dryRun);
    }

    // Unknown category — log and skip
    this.logger.warn(`Unknown data category: ${data_category} — skipping`);
    return {
      data_category,
      action_on_expiry,
      records_affected: 0,
      retention_months,
      dry_run: dryRun,
      skipped_reason: 'unknown_category',
    };
  }

  // ─── Delete records (simple categories) ─────────────────────────────────

  private async deleteCategoryRecords(
    tenantId: string,
    policy: MergedPolicy,
    cutoffDate: Date,
    holdSet: Set<string>,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, action_on_expiry, retention_months } = policy;
    const categoryConfig = DELETABLE_CATEGORIES[data_category];
    if (!categoryConfig) {
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
        skipped_reason: 'no_config',
      };
    }

    // Find expired records within an RLS transaction
    const expiredIds = await this.findExpiredRecordIds(
      tenantId,
      categoryConfig.model,
      cutoffDate,
      holdSet,
      data_category,
    );

    if (expiredIds.length === 0) {
      this.logger.log(`No expired records for ${data_category} (tenant ${tenantId})`);
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
      };
    }

    if (dryRun) {
      this.logger.log(
        `[DRY RUN] Would delete ${expiredIds.length} ${data_category} records for tenant ${tenantId}`,
      );
      return {
        data_category,
        action_on_expiry,
        records_affected: expiredIds.length,
        retention_months,
        dry_run: true,
      };
    }

    // Delete in batches
    let totalDeleted = 0;
    for (let i = 0; i < expiredIds.length; i += BATCH_SIZE) {
      const chunk = expiredIds.slice(i, i + BATCH_SIZE);
      const deleted = await this.deleteChunk(tenantId, categoryConfig.model, chunk);
      totalDeleted += deleted;
    }

    this.logger.log(`Deleted ${totalDeleted} ${data_category} records for tenant ${tenantId}`);

    return {
      data_category,
      action_on_expiry,
      records_affected: totalDeleted,
      retention_months,
      dry_run: false,
    };
  }

  // ─── Find expired record IDs ────────────────────────────────────────────

  private async findExpiredRecordIds(
    tenantId: string,
    model: DeletableModel,
    cutoffDate: Date,
    holdSet: Set<string>,
    dataCategory: string,
  ): Promise<string[]> {
    // Use direct tenant_id filter (no RLS transaction needed for reads with explicit where clause)
    const delegate = this.prisma[model] as unknown as PrismaModelDelegate;

    const records: Array<{ id: string }> = await delegate.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
      select: { id: true },
    });

    // Filter out records with active holds
    if (holdSet.size > 0) {
      return records.filter((r) => !holdSet.has(`${dataCategory}:${r.id}`)).map((r) => r.id);
    }

    return records.map((r) => r.id);
  }

  // ─── Delete a batch of records ──────────────────────────────────────────

  private async deleteChunk(
    tenantId: string,
    model: DeletableModel,
    ids: string[],
  ): Promise<number> {
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${SYSTEM_USER_SENTINEL}::text, true)`;

      const db = tx as unknown as PrismaClient;
      const delegate = db[model] as unknown as PrismaModelDelegate;

      const deleteResult = await delegate.deleteMany({
        where: { id: { in: ids } },
      });
      return deleteResult.count;
    });

    return result;
  }

  // ─── Anonymise category (deferred — log only) ──────────────────────────

  /**
   * For categories that require anonymisation (student/staff/financial records),
   * log what WOULD be anonymised but do not execute.
   * TODO: Integrate with ComplianceAnonymisationCore in DSAR/anonymisation pipeline phase.
   */
  private async handleAnonymiseCategory(
    tenantId: string,
    policy: MergedPolicy,
    cutoffDate: Date,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, action_on_expiry, retention_months } = policy;

    this.logger.log(
      `[DEFERRED] Category ${data_category} requires anonymisation — ` +
        `cutoff ${cutoffDate.toISOString()}, action=${action_on_expiry}. ` +
        `Automatic execution deferred to DSAR/anonymisation pipeline integration.`,
    );

    return {
      data_category,
      action_on_expiry,
      records_affected: 0,
      retention_months,
      dry_run: dryRun,
      skipped_reason: 'anonymisation_deferred',
    };
  }

  // ─── Delete compliance exports ──────────────────────────────────────────

  private async deleteComplianceExports(
    tenantId: string,
    policy: MergedPolicy,
    cutoffDate: Date,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, action_on_expiry, retention_months } = policy;

    const records: Array<{ id: string }> = await this.prisma.complianceRequest.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
        export_file_key: { not: null },
      },
      select: { id: true },
    });

    if (records.length === 0) {
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
      };
    }

    if (dryRun) {
      this.logger.log(
        `[DRY RUN] Would clear export_file_key on ${records.length} compliance requests for tenant ${tenantId}`,
      );
      return {
        data_category,
        action_on_expiry,
        records_affected: records.length,
        retention_months,
        dry_run: true,
      };
    }

    const ids = records.map((r) => r.id);
    let totalCleared = 0;

    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const chunk = ids.slice(i, i + BATCH_SIZE);
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${SYSTEM_USER_SENTINEL}::text, true)`;

        const db = tx as unknown as PrismaClient;
        const updateResult = await db.complianceRequest.updateMany({
          where: { id: { in: chunk } },
          data: { export_file_key: null },
        });
        return updateResult.count;
      });
      totalCleared += result;
    }

    this.logger.log(
      `Cleared export_file_key on ${totalCleared} compliance requests for tenant ${tenantId}`,
    );

    return {
      data_category,
      action_on_expiry,
      records_affected: totalCleared,
      retention_months,
      dry_run: false,
    };
  }

  // ─── Delete rejected admissions (special case — extra status filter) ──

  private async deleteRejectedAdmissions(
    tenantId: string,
    policy: MergedPolicy,
    cutoffDate: Date,
    holdSet: Set<string>,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, action_on_expiry, retention_months } = policy;

    const records: Array<{ id: string }> = await this.prisma.application.findMany({
      where: {
        tenant_id: tenantId,
        status: 'rejected',
        updated_at: { lt: cutoffDate },
      },
      select: { id: true },
    });

    // Filter out records with active holds
    const eligibleIds =
      holdSet.size > 0
        ? records.filter((r) => !holdSet.has(`${data_category}:${r.id}`)).map((r) => r.id)
        : records.map((r) => r.id);

    if (eligibleIds.length === 0) {
      this.logger.log(`No expired records for ${data_category} (tenant ${tenantId})`);
      return {
        data_category,
        action_on_expiry,
        records_affected: 0,
        retention_months,
        dry_run: dryRun,
      };
    }

    if (dryRun) {
      this.logger.log(
        `[DRY RUN] Would delete ${eligibleIds.length} ${data_category} records for tenant ${tenantId}`,
      );
      return {
        data_category,
        action_on_expiry,
        records_affected: eligibleIds.length,
        retention_months,
        dry_run: true,
      };
    }

    let totalDeleted = 0;
    for (let i = 0; i < eligibleIds.length; i += BATCH_SIZE) {
      const chunk = eligibleIds.slice(i, i + BATCH_SIZE);
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${SYSTEM_USER_SENTINEL}::text, true)`;

        const db = tx as unknown as PrismaClient;
        const deleteResult = await db.application.deleteMany({
          where: { id: { in: chunk } },
        });
        return deleteResult.count;
      });
      totalDeleted += result;
    }

    this.logger.log(`Deleted ${totalDeleted} ${data_category} records for tenant ${tenantId}`);

    return {
      data_category,
      action_on_expiry,
      records_affected: totalDeleted,
      retention_months,
      dry_run: false,
    };
  }

  // ─── Archive category (deferred — no infrastructure yet) ───────────────

  /**
   * For categories with action_on_expiry = 'archive', log the intent but do not
   * execute. There is no archive/cold-storage infrastructure yet.
   * TODO: Implement archive pipeline (cold storage / separate schema) when needed.
   */
  private async handleArchiveCategory(
    _tenantId: string,
    policy: MergedPolicy,
    cutoffDate: Date,
    dryRun: boolean,
  ): Promise<EnforcementSummary> {
    const { data_category, action_on_expiry, retention_months } = policy;

    this.logger.log(
      `[DEFERRED] Category ${data_category} requires archiving — ` +
        `cutoff ${cutoffDate.toISOString()}, action=${action_on_expiry}. ` +
        `No archive infrastructure exists yet; skipping.`,
    );

    return {
      data_category,
      action_on_expiry,
      records_affected: 0,
      retention_months,
      dry_run: dryRun,
      skipped_reason: 'archive_deferred',
    };
  }

  // ─── Audit logging ──────────────────────────────────────────────────────

  private async createAuditEntry(tenantId: string, summary: EnforcementSummary): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenant_id: tenantId,
        actor_user_id: SYSTEM_USER_SENTINEL,
        action: 'retention_enforcement',
        entity_type: summary.data_category,
        entity_id: tenantId,
        metadata_json: {
          data_category: summary.data_category,
          action_on_expiry: summary.action_on_expiry,
          records_affected: summary.records_affected,
          retention_months: summary.retention_months,
          dry_run: summary.dry_run,
          ...(summary.skipped_reason ? { skipped_reason: summary.skipped_reason } : {}),
        },
      },
    });
  }
}

// ─── Prisma delegate type helper ────────────────────────────────────────────

/**
 * Minimal interface for Prisma model delegates used in dynamic model access.
 * Avoids `any` by typing the specific methods we invoke.
 */
interface PrismaModelDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    select?: Record<string, boolean>;
  }): Promise<Array<{ id: string }>>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}
