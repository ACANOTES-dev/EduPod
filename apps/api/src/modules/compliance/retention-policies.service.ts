import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  CreateRetentionHoldDto,
  RetentionDataCategory,
  RetentionHoldsQueryDto,
  RetentionPreviewRequestDto,
  RetentionPreviewResultDto,
  UpdateRetentionPolicyDto,
} from '@school/shared/gdpr';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AdmissionsReadFacade } from '../admissions/admissions-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { AuditLogReadFacade } from '../audit-log/audit-log-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { CommunicationsReadFacade } from '../communications/communications-read.facade';
import { FinanceReadFacade } from '../finance/finance-read.facade';
import { GdprReadFacade } from '../gdpr/gdpr-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { ParentInquiriesReadFacade } from '../parent-inquiries/parent-inquiries-read.facade';
import { PayrollReadFacade } from '../payroll/payroll-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../students/student-read.facade';
import { WebsiteReadFacade } from '../website/website-read.facade';

type TransactionClient = PrismaService;

// ─── Retention Policies Service ─────────────────────────────────────────────

@Injectable()
export class RetentionPoliciesService {
  private readonly logger = new Logger(RetentionPoliciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly behaviourReadFacade: BehaviourReadFacade,
    private readonly gdprReadFacade: GdprReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly admissionsReadFacade: AdmissionsReadFacade,
    private readonly payrollReadFacade: PayrollReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly communicationsReadFacade: CommunicationsReadFacade,
    private readonly auditLogReadFacade: AuditLogReadFacade,
    private readonly websiteReadFacade: WebsiteReadFacade,
    private readonly parentInquiriesReadFacade: ParentInquiriesReadFacade,
    private readonly gradebookReadFacade: GradebookReadFacade,
  ) {}

  // ─── Get Effective Policies ───────────────────────────────────────────────

  /**
   * Returns all 17 retention policies with tenant overrides merged
   * over platform defaults. Each policy includes computed fields:
   * `is_override` and `default_retention_months`.
   */
  async getEffectivePolicies(tenantId: string) {
    const [platformDefaults, tenantOverrides] = await Promise.all([
      this.gdprReadFacade.findPlatformDefaultPolicies(),
      this.gdprReadFacade.findTenantPolicyOverrides(tenantId),
    ]);

    const overrideMap = new Map(tenantOverrides.map((o) => [o.data_category, o]));

    const effectivePolicies = platformDefaults.map((defaultPolicy) => {
      const override = overrideMap.get(defaultPolicy.data_category);
      if (override) {
        return {
          ...override,
          is_override: true,
          default_retention_months: defaultPolicy.retention_months,
        };
      }
      return {
        ...defaultPolicy,
        is_override: false,
        default_retention_months: defaultPolicy.retention_months,
      };
    });

    return { data: effectivePolicies };
  }

  // ─── Override Policy ──────────────────────────────────────────────────────

  /**
   * Allows a tenant to override an overridable policy.
   * Cannot reduce below the statutory minimum (platform default).
   */
  async overridePolicy(tenantId: string, policyId: string, dto: UpdateRetentionPolicyDto) {
    const policy = await this.gdprReadFacade.findRetentionPolicyById(policyId);

    if (!policy) {
      throw new NotFoundException({
        code: 'POLICY_NOT_FOUND',
        message: `Retention policy with id "${policyId}" not found`,
      });
    }

    if (!policy.is_overridable) {
      throw new BadRequestException({
        code: 'POLICY_NOT_OVERRIDABLE',
        message: `Retention policy for "${policy.data_category}" is not overridable`,
      });
    }

    // Determine the platform default for this category
    let platformDefault = policy;
    if (policy.tenant_id !== null) {
      // This is a tenant override — find the platform default
      const defaultPolicy = await this.gdprReadFacade.findDefaultPolicyByCategory(
        policy.data_category,
      );
      if (defaultPolicy) {
        platformDefault = defaultPolicy;
      }
    }

    // Cannot reduce below statutory minimum
    if (dto.retention_months < platformDefault.retention_months) {
      throw new BadRequestException({
        code: 'RETENTION_BELOW_MINIMUM',
        message: `Cannot set retention to ${dto.retention_months} months. Minimum is ${platformDefault.retention_months} months (statutory requirement).`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;

      // Check if a tenant override already exists for this category
      const existingOverride = await db.retentionPolicy.findFirst({
        where: {
          tenant_id: tenantId,
          data_category: policy.data_category,
        },
      });

      if (existingOverride) {
        // Update existing override
        return db.retentionPolicy.update({
          where: { id: existingOverride.id },
          data: { retention_months: dto.retention_months },
        });
      }

      // Create new tenant override based on platform default
      return db.retentionPolicy.create({
        data: {
          tenant_id: tenantId,
          data_category: platformDefault.data_category,
          retention_months: dto.retention_months,
          action_on_expiry: platformDefault.action_on_expiry,
          is_overridable: platformDefault.is_overridable,
          statutory_basis: platformDefault.statutory_basis,
        },
      });
    });
  }

  // ─── Preview Retention ────────────────────────────────────────────────────

  /**
   * Shows how many records would be affected if retention enforcement ran now.
   * This is a best-effort preview — categories with unavailable models return 0.
   */
  async previewRetention(tenantId: string, dto?: RetentionPreviewRequestDto) {
    const { data: effectivePolicies } = await this.getEffectivePolicies(tenantId);

    let policies = effectivePolicies;
    if (dto?.data_category) {
      policies = policies.filter((p) => p.data_category === dto.data_category);
    }

    const results: RetentionPreviewResultDto[] = await Promise.all(
      policies.map(async (policy) => {
        const affectedCount = await this.countExpiredRecords(
          tenantId,
          policy.data_category as RetentionDataCategory,
          policy.retention_months,
        );
        return {
          data_category: policy.data_category as RetentionDataCategory,
          retention_months: policy.retention_months,
          action_on_expiry: policy.action_on_expiry as 'anonymise' | 'delete' | 'archive',
          affected_count: affectedCount,
        };
      }),
    );

    return { data: results };
  }

  // ─── Create Hold ──────────────────────────────────────────────────────────

  /**
   * Place a legal hold on a subject, preventing retention enforcement.
   */
  async createHold(tenantId: string, userId: string, dto: CreateRetentionHoldDto) {
    // Verify no active hold already exists for same subject
    const existingHold = await this.gdprReadFacade.findActiveRetentionHoldBySubject(
      tenantId,
      dto.subject_type,
      dto.subject_id,
    );

    if (existingHold) {
      throw new BadRequestException({
        code: 'HOLD_ALREADY_ACTIVE',
        message: `An active hold already exists for ${dto.subject_type} "${dto.subject_id}"`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;

      return db.retentionHold.create({
        data: {
          tenant_id: tenantId,
          subject_type: dto.subject_type,
          subject_id: dto.subject_id,
          reason: dto.reason,
          held_by_user_id: userId,
          held_at: new Date(),
        },
      });
    });
  }

  // ─── Release Hold ─────────────────────────────────────────────────────────

  /**
   * Release a legal hold, allowing retention enforcement to proceed.
   */
  async releaseHold(tenantId: string, holdId: string) {
    const hold = await this.gdprReadFacade.findRetentionHoldById(tenantId, holdId);

    if (!hold) {
      throw new NotFoundException({
        code: 'HOLD_NOT_FOUND',
        message: `Retention hold with id "${holdId}" not found`,
      });
    }

    if (hold.released_at !== null) {
      throw new BadRequestException({
        code: 'HOLD_ALREADY_RELEASED',
        message: `Hold "${holdId}" has already been released`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as TransactionClient;

      return db.retentionHold.update({
        where: { id: holdId },
        data: { released_at: new Date() },
      });
    });
  }

  // ─── List Holds ───────────────────────────────────────────────────────────

  /**
   * List active retention holds with pagination.
   */
  async listHolds(tenantId: string, query: RetentionHoldsQueryDto) {
    const { page, pageSize } = query;
    const _skip = (page - 1) * pageSize;

    const _where = {
      tenant_id: tenantId,
      released_at: null,
    };

    const result = await this.gdprReadFacade.findRetentionHolds(tenantId, {
      page,
      pageSize,
      activeOnly: true,
    });
    const data = result.data;
    const total = result.total;

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Private: Count Expired Records ───────────────────────────────────────

  /**
   * Count records past their retention period for a given category.
   * Best-effort: returns 0 for categories whose models are unavailable.
   * retention_months = 0 means indefinite retention (never expires).
   */
  private async countExpiredRecords(
    tenantId: string,
    category: RetentionDataCategory,
    retentionMonths: number,
  ): Promise<number> {
    // 0 means indefinite retention — nothing expires
    if (retentionMonths === 0) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

    try {
      switch (category) {
        case 'active_student_records':
          return this.studentReadFacade.count(tenantId, {
            status: 'active',
            created_at: { lt: cutoffDate },
          });

        case 'graduated_withdrawn_students':
          return this.studentReadFacade.count(tenantId, {
            status: { in: ['graduated', 'withdrawn'] },
            updated_at: { lt: cutoffDate },
          });

        case 'rejected_admissions':
          return this.admissionsReadFacade.countByStatus(tenantId, 'rejected', cutoffDate);

        case 'financial_records':
          return this.financeReadFacade.countInvoicesBeforeDate(tenantId, cutoffDate);

        case 'payroll_records':
          return this.payrollReadFacade.countPayrollRunsBeforeDate(tenantId, cutoffDate);

        case 'staff_records_post_employment':
          return this.staffProfileReadFacade.count(tenantId, {
            employment_status: 'inactive',
            updated_at: { lt: cutoffDate },
          });

        case 'attendance_records':
          return this.attendanceReadFacade.countAttendanceRecords(tenantId, {
            beforeDate: cutoffDate,
          });

        case 'behaviour_records':
          return this.behaviourReadFacade.countIncidentsBeforeDate(tenantId, cutoffDate);

        case 'child_protection_safeguarding':
          // Never expires — indefinite retention
          return 0;

        case 'communications_notifications':
          return this.communicationsReadFacade.countNotificationsBeforeDate(tenantId, cutoffDate);

        case 'audit_logs':
          return this.auditLogReadFacade.count(tenantId, { createdBefore: cutoffDate });

        case 'contact_form_submissions':
          return this.websiteReadFacade.countSubmissionsBeforeDate(tenantId, cutoffDate);

        case 'parent_inquiry_messages':
          return this.parentInquiriesReadFacade.countMessagesBeforeDate(tenantId, cutoffDate);

        case 'nl_query_history':
          return this.gradebookReadFacade.countNlQueryHistoryBeforeDate(tenantId, cutoffDate);

        case 'ai_processing_logs':
          return this.gdprReadFacade.countTokenUsageLogsBeforeDate(tenantId, cutoffDate);

        case 'tokenisation_usage_logs':
          return this.gdprReadFacade.countTokenUsageLogsBeforeDate(tenantId, cutoffDate);

        case 's3_compliance_exports':
          return this.prisma.complianceRequest.count({
            where: {
              tenant_id: tenantId,
              export_file_key: { not: null },
              created_at: { lt: cutoffDate },
            },
          });

        default:
          return 0;
      }
    } catch (error) {
      this.logger.warn(
        `[countExpiredRecords] Could not count records for category "${category}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }
}
