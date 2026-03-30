import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { homeworkSettingsSchema } from '@school/shared';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const HOMEWORK_GENERATE_RECURRING_JOB = 'homework:generate-recurring';

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.HOMEWORK)
export class HomeworkGenerateRecurringProcessor extends WorkerHost {
  private readonly logger = new Logger(HomeworkGenerateRecurringProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== HOMEWORK_GENERATE_RECURRING_JOB) return;

    this.logger.log(
      `Processing ${HOMEWORK_GENERATE_RECURRING_JOB} — cross-tenant cron run`,
    );

    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        modules: { some: { module_key: 'homework', is_enabled: true } },
      },
      select: { id: true },
    });

    let successCount = 0;
    for (const tenant of tenants) {
      try {
        const innerJob = new HomeworkGenerateRecurringJob(this.prisma);
        await innerJob.execute({ tenant_id: tenant.id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(
          `Recurring homework generation failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `${HOMEWORK_GENERATE_RECURRING_JOB} cron complete: ${successCount}/${tenants.length} tenants processed`,
    );
  }
}

// ─── TenantAwareJob implementation ────────────────────────────────────────────

class HomeworkGenerateRecurringJob extends TenantAwareJob<TenantJobPayload> {
  private readonly logger = new Logger(HomeworkGenerateRecurringJob.name);

  protected async processJob(
    data: TenantJobPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // ─── 1. Check homework settings ─────────────────────────────────────────

    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    const hwRaw = (rawSettings.homework as Record<string, unknown>) ?? {};
    const hwSettings = homeworkSettingsSchema.parse(hwRaw);

    if (!hwSettings.enabled) {
      this.logger.log(
        `Tenant ${tenant_id}: homework disabled in settings, skipping.`,
      );
      return;
    }

    // ─── 2. Determine today's date and day of week ──────────────────────────

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday

    // ─── 3. Check for school closure ────────────────────────────────────────

    const closure = await tx.schoolClosure.findFirst({
      where: {
        tenant_id,
        closure_date: today,
      },
      select: { id: true },
    });

    if (closure) {
      this.logger.log(
        `Tenant ${tenant_id}: school closure found for today, skipping recurring generation.`,
      );
      return;
    }

    // ─── 4. Find active recurrence rules ────────────────────────────────────

    const rules = await tx.homeworkRecurrenceRule.findMany({
      where: {
        tenant_id,
        active: true,
        start_date: { lte: today },
        OR: [
          { end_date: null },
          { end_date: { gte: today } },
        ],
      },
    });

    if (rules.length === 0) {
      this.logger.log(
        `Tenant ${tenant_id}: no active recurrence rules found.`,
      );
      return;
    }

    let rulesEvaluated = 0;
    let assignmentsCreated = 0;

    // ─── 5. Process each rule ───────────────────────────────────────────────

    for (const rule of rules) {
      rulesEvaluated++;

      // Check if today's day of week matches the rule's days_of_week array
      if (!rule.days_of_week.includes(dayOfWeek)) continue;

      // Idempotency: check if an assignment already exists for today with this rule
      const existingAssignment = await tx.homeworkAssignment.findFirst({
        where: {
          tenant_id,
          recurrence_rule_id: rule.id,
          due_date: today,
        },
        select: { id: true },
      });

      if (existingAssignment) continue;

      // Find the most recent assignment linked to this rule (template)
      const template = await tx.homeworkAssignment.findFirst({
        where: {
          recurrence_rule_id: rule.id,
          tenant_id,
        },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          class_id: true,
          subject_id: true,
          academic_year_id: true,
          academic_period_id: true,
          assigned_by_user_id: true,
          title: true,
          description: true,
          homework_type: true,
          due_time: true,
          max_points: true,
        },
      });

      if (!template) {
        this.logger.warn(
          `Tenant ${tenant_id}: recurrence rule ${rule.id} has no template assignment, skipping.`,
        );
        continue;
      }

      // Create the new draft assignment from template
      await tx.homeworkAssignment.create({
        data: {
          tenant_id,
          class_id: template.class_id,
          subject_id: template.subject_id,
          academic_year_id: template.academic_year_id,
          academic_period_id: template.academic_period_id,
          assigned_by_user_id: template.assigned_by_user_id,
          title: template.title,
          description: template.description,
          homework_type: template.homework_type,
          status: 'draft',
          due_date: today,
          due_time: template.due_time,
          recurrence_rule_id: rule.id,
          max_points: template.max_points,
          copied_from_id: template.id,
        },
      });

      assignmentsCreated++;
    }

    // ─── 6. Log summary ─────────────────────────────────────────────────────

    this.logger.log(
      `Tenant ${tenant_id}: recurring generation complete — ` +
        `${rulesEvaluated} rules evaluated, ` +
        `${assignmentsCreated} assignments created`,
    );
  }
}
