import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const REPORT_CARD_AUTO_GENERATE_JOB = 'report-cards:auto-generate';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant daily cron processor — does NOT use TenantAwareJob.
 * Iterates over all active tenants and checks if any academic periods ended
 * within the last 24 hours. For each such period, creates draft report cards
 * for all enrolled students who do not already have one.
 *
 * Plain @Injectable service — the `GradebookQueueDispatcher` owns the
 * queue subscription and routes jobs to this class by name.
 */
@Injectable()
export class ReportCardAutoGenerateProcessor {
  private readonly logger = new Logger(ReportCardAutoGenerateProcessor.name);

  // RC-C029: In-memory circuit breaker — skip tenants after 3 consecutive failures
  private readonly failureCountByTenant = new Map<string, number>();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3;

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(_job: Job): Promise<void> {
    this.logger.log('Running report card auto-generate across all tenants...');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, default_locale: true },
    });

    let totalGenerated = 0;
    let skippedInvalid = 0;

    for (const tenant of tenants) {
      // Defensive UUID guard. The root cause of prior "invalid input syntax for
      // type uuid: \"\"" storms in this cron was RLS policies failing when the
      // `app.current_tenant_id` GUC was cast from an empty string — we now set
      // the GUC per-tenant in a transaction below, but a tenant row with an
      // empty/whitespace id would still poison everything it touches. Skip
      // those explicitly and log so the upstream data can be fixed.
      if (!isValidUuid(tenant.id)) {
        this.logger.error(
          `Skipping tenant with invalid id "${tenant.id}" — ignored to avoid RLS cast failure`,
        );
        skippedInvalid += 1;
        continue;
      }

      // RC-C029: Skip tenants that have tripped the circuit breaker
      const failures = this.failureCountByTenant.get(tenant.id) ?? 0;
      if (failures >= ReportCardAutoGenerateProcessor.CIRCUIT_BREAKER_THRESHOLD) {
        this.logger.warn(
          `Skipping tenant ${tenant.id} — circuit breaker open after ${failures} consecutive failures`,
        );
        continue;
      }

      try {
        const generated = await this.processForTenant(tenant.id, tenant.default_locale);
        totalGenerated += generated;
        // Reset on success
        this.failureCountByTenant.delete(tenant.id);
      } catch (err) {
        const newCount = failures + 1;
        this.failureCountByTenant.set(tenant.id, newCount);
        this.logger.error(
          `Tenant ${tenant.id} auto-generate failed (${newCount}/${ReportCardAutoGenerateProcessor.CIRCUIT_BREAKER_THRESHOLD}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (skippedInvalid > 0) {
      this.logger.warn(
        `Report card auto-generate: skipped ${skippedInvalid} tenant(s) with invalid UUIDs`,
      );
    }

    this.logger.log(
      `Report card auto-generate complete: ${totalGenerated} draft(s) created across ${tenants.length} tenants`,
    );
  }

  private async processForTenant(tenantId: string, locale: string): Promise<number> {
    // Every tenant-scoped query below relies on RLS policies that cast
    // `app.current_tenant_id` to UUID. Without a transaction-scoped
    // `set_config`, the GUC is either unset (runtime error) or a stale
    // empty string from a prior PgBouncer session ("invalid input syntax
    // for type uuid: \"\"" — the original prod failure). Wrap the whole
    // per-tenant pipeline in one interactive transaction with the GUC
    // set locally, so every read/write inside sees the right context and
    // the cleanup is automatic on commit.
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`,
      );

      // Find academic periods that ended within the last 24 hours
      const now = new Date();
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const recentlyEndedPeriods = await tx.academicPeriod.findMany({
        where: {
          tenant_id: tenantId,
          end_date: {
            gte: since,
            lte: now,
          },
          status: { in: ['active', 'closed'] },
        },
        select: { id: true, name: true, academic_year_id: true },
      });

      if (recentlyEndedPeriods.length === 0) {
        return 0;
      }

      let created = 0;

      for (const period of recentlyEndedPeriods) {
        // Find all distinct students enrolled in classes within this period's academic year
        const enrolments = await tx.classEnrolment.findMany({
          where: {
            tenant_id: tenantId,
            class_entity: {
              academic_year: {
                periods: {
                  some: { id: period.id },
                },
              },
            },
            status: 'active',
          },
          select: { student_id: true },
          distinct: ['student_id'],
        });

        const studentIds = enrolments.map((e: { student_id: string }) => e.student_id);

        if (studentIds.length === 0) {
          this.logger.log(
            `Tenant ${tenantId}: period "${period.name}" has no enrolled students, skipping.`,
          );
          continue;
        }

        // Find students who already have a report card for this period
        const existing = await tx.reportCard.findMany({
          where: {
            tenant_id: tenantId,
            academic_period_id: period.id,
            student_id: { in: studentIds },
          },
          select: { student_id: true },
        });
        const existingStudentIds = new Set(
          existing.map((r: { student_id: string }) => r.student_id),
        );

        const missing = studentIds.filter((id: string) => !existingStudentIds.has(id));

        if (missing.length === 0) {
          this.logger.log(
            `Tenant ${tenantId}: period "${period.name}" — all students already have report cards.`,
          );
          continue;
        }

        // Batch-create draft report cards for missing students
        await tx.reportCard.createMany({
          data: missing.map((studentId: string) => ({
            tenant_id: tenantId,
            student_id: studentId,
            academic_period_id: period.id,
            academic_year_id: period.academic_year_id,
            status: 'draft' as const,
            template_locale: locale,
            snapshot_payload_json: {},
          })),
          skipDuplicates: true,
        });

        created += missing.length;

        this.logger.log(
          `Tenant ${tenantId}: period "${period.name}" — created ${missing.length} draft report card(s)`,
        );
      }

      return created;
    });
  }
}

// UUID v1-v5 validator. Keep the check permissive (any hex-8-4-4-4-12 shape)
// so we don't break fixture UUIDs used in tests — the goal is to catch
// empty/obviously-malformed values, not to validate version bits.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}
