import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job Name ────────────────────────────────────────────────────────────────

export const ANNUAL_CONSENT_RENEWAL_JOB = 'engagement:annual-consent-renewal';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RenewableConsentRecord {
  id: string;
  student_id: string;
  form_template_id: string;
  student: {
    first_name: string;
    last_name: string;
  };
  form_template: {
    name: string;
  };
}

interface RenewalCandidate {
  student_id: string;
  form_template_id: string;
  student_name: string;
  template_name: string;
}

// ─── Processor ──────────────────────────────────────────────────────────────

/**
 * Cross-tenant year-rollover processor.
 * Expires annual consent records from the previous academic year and creates
 * fresh pending submissions for the current active academic year.
 */
@Processor(QUEUE_NAMES.ENGAGEMENT, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EngagementAnnualRenewalProcessor extends WorkerHost {
  private readonly logger = new Logger(EngagementAnnualRenewalProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ANNUAL_CONSENT_RENEWAL_JOB) return;

    this.logger.log('Running annual engagement consent renewal across all tenants...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        default_locale: true,
      },
      orderBy: { created_at: 'asc' },
    });

    let totalExpired = 0;
    let totalRenewed = 0;
    let totalNotifications = 0;

    for (const tenant of tenants) {
      try {
        const result = await this.renewForTenant(tenant.id, tenant.default_locale ?? 'en');

        totalExpired += result.expired_count;
        totalRenewed += result.renewed_count;
        totalNotifications += result.notifications_count;

        this.logger.log(
          `Processing tenant ${tenant.id}: expired ${result.expired_count} annual consents, renewed ${result.renewed_count}, notified ${result.notifications_count}`,
        );
      } catch (error) {
        this.logger.error(
          `Annual consent renewal failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Annual engagement consent renewal complete: expired ${totalExpired}, renewed ${totalRenewed}, notified ${totalNotifications} across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Per-tenant Renewal ──────────────────────────────────────────────────

  private async renewForTenant(
    tenantId: string,
    defaultLocale: string,
  ): Promise<{
    expired_count: number;
    renewed_count: number;
    notifications_count: number;
  }> {
    const today = this.startOfDay(new Date());

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      const activeAcademicYear = await tx.academicYear.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'active',
        },
        select: {
          id: true,
          name: true,
          start_date: true,
          end_date: true,
        },
        orderBy: { start_date: 'desc' },
      });

      if (!activeAcademicYear) {
        this.logger.debug(`Tenant ${tenantId}: no active academic year found, skipping`);
        return {
          expired_count: 0,
          renewed_count: 0,
          notifications_count: 0,
        };
      }

      const renewableRecords = await tx.engagementConsentRecord.findMany({
        where: {
          tenant_id: tenantId,
          consent_type: 'annual',
          status: 'active',
          expires_at: { lt: today },
          academic_year_id: { not: activeAcademicYear.id },
        },
        select: {
          id: true,
          student_id: true,
          form_template_id: true,
          student: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
          form_template: {
            select: {
              name: true,
            },
          },
        },
      });

      if (renewableRecords.length === 0) {
        return {
          expired_count: 0,
          renewed_count: 0,
          notifications_count: 0,
        };
      }

      const uniqueRenewals = this.dedupeRenewals(renewableRecords);
      const existingSubmissions = await this.findExistingRenewalSubmissions(
        tx,
        tenantId,
        activeAcademicYear.id,
        uniqueRenewals,
      );

      const renewalsToCreate = uniqueRenewals.filter((candidate) => {
        const key = `${candidate.student_id}:${candidate.form_template_id}`;
        return !existingSubmissions.has(key);
      });

      if (renewalsToCreate.length > 0) {
        await tx.engagementFormSubmission.createMany({
          data: renewalsToCreate.map((candidate) => ({
            tenant_id: tenantId,
            form_template_id: candidate.form_template_id,
            event_id: null,
            student_id: candidate.student_id,
            submitted_by_user_id: null,
            responses_json: {},
            signature_json: Prisma.JsonNull,
            status: 'pending',
            academic_year_id: activeAcademicYear.id,
          })),
        });
      }

      await tx.engagementConsentRecord.updateMany({
        where: {
          tenant_id: tenantId,
          id: { in: renewableRecords.map((record) => record.id) },
        },
        data: {
          status: 'expired',
        },
      });

      const notificationsCount =
        renewalsToCreate.length === 0
          ? 0
          : await this.notifyParents(
              tx,
              tenantId,
              defaultLocale,
              activeAcademicYear.name,
              renewalsToCreate,
            );

      return {
        expired_count: renewableRecords.length,
        renewed_count: renewalsToCreate.length,
        notifications_count: notificationsCount,
      };
    });
  }

  private dedupeRenewals(records: RenewableConsentRecord[]): RenewalCandidate[] {
    const uniqueRenewals = new Map<string, RenewalCandidate>();

    for (const record of records) {
      const key = `${record.student_id}:${record.form_template_id}`;

      if (!uniqueRenewals.has(key)) {
        uniqueRenewals.set(key, {
          student_id: record.student_id,
          form_template_id: record.form_template_id,
          student_name: `${record.student.first_name} ${record.student.last_name}`.trim(),
          template_name: record.form_template.name,
        });
      }
    }

    return Array.from(uniqueRenewals.values());
  }

  private async findExistingRenewalSubmissions(
    txClient: Prisma.TransactionClient,
    tenantId: string,
    academicYearId: string,
    renewals: RenewalCandidate[],
  ): Promise<Set<string>> {
    if (renewals.length === 0) {
      return new Set();
    }

    const existing = await txClient.engagementFormSubmission.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        OR: renewals.map((renewal) => ({
          student_id: renewal.student_id,
          form_template_id: renewal.form_template_id,
        })),
      },
      select: {
        student_id: true,
        form_template_id: true,
      },
    });

    return new Set(
      existing.map((submission) => `${submission.student_id}:${submission.form_template_id}`),
    );
  }

  private async notifyParents(
    txClient: Prisma.TransactionClient,
    tenantId: string,
    defaultLocale: string,
    academicYearName: string,
    renewals: RenewalCandidate[],
  ): Promise<number> {
    const studentIds = Array.from(new Set(renewals.map((renewal) => renewal.student_id)));

    const parentLinks = await txClient.studentParent.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
      },
      select: {
        student_id: true,
        parent: {
          select: {
            user_id: true,
          },
        },
      },
    });

    const renewalLookup = new Map(
      renewals.map((renewal) => [renewal.student_id, renewal] as const),
    );

    const notificationRows = parentLinks
      .map((link) => {
        const renewal = renewalLookup.get(link.student_id);

        if (!renewal || !link.parent.user_id) {
          return null;
        }

        return {
          tenant_id: tenantId,
          recipient_user_id: link.parent.user_id,
          channel: 'in_app' as const,
          template_key: 'engagement_annual_consent_renewal',
          locale: defaultLocale,
          status: 'delivered' as const,
          payload_json: {
            title: 'Annual consent renewal ready',
            body: `A new ${renewal.template_name} form is ready for ${renewal.student_name} for ${academicYearName}.`,
            link: '/engagement/parent/events',
            student_id: renewal.student_id,
            student_name: renewal.student_name,
            form_template_id: renewal.form_template_id,
            form_template_name: renewal.template_name,
            academic_year_name: academicYearName,
          },
          source_entity_type: 'engagement_form_template',
          source_entity_id: renewal.form_template_id,
          delivered_at: new Date(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (notificationRows.length === 0) {
      return 0;
    }

    await txClient.notification.createMany({
      data: notificationRows,
    });

    return notificationRows.length;
  }

  private startOfDay(value: Date): Date {
    const date = new Date(value);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }
}
