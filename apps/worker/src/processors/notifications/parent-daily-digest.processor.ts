import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { $Enums, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { parentDigestSettingsSchema } from '@school/shared';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ParentDailyDigestPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const PARENT_DAILY_DIGEST_JOB = 'notifications:parent-daily-digest';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ParentDailyDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(ParentDailyDigestProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ParentDailyDigestPayload>): Promise<void> {
    if (job.name !== PARENT_DAILY_DIGEST_JOB) return;

    const { tenant_id } = job.data;

    if (tenant_id) {
      // Per-tenant mode
      this.logger.log(`Processing ${PARENT_DAILY_DIGEST_JOB} — tenant ${tenant_id}`);
      const innerJob = new ParentDailyDigestJob(this.prisma);
      await innerJob.execute(job.data);
      return;
    }

    // Cross-tenant cron mode: iterate all active tenants
    this.logger.log(`Processing ${PARENT_DAILY_DIGEST_JOB} — cross-tenant cron run`);

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });

    let successCount = 0;
    for (const tenant of tenants) {
      const innerJob = new ParentDailyDigestJob(this.prisma);
      try {
        await innerJob.execute({ tenant_id: tenant.id });
        successCount++;
      } catch (err: unknown) {
        this.logger.error(`Parent daily digest failed for tenant ${tenant.id}: ${String(err)}`);
      }
    }

    this.logger.log(
      `${PARENT_DAILY_DIGEST_JOB} cron complete: ${successCount}/${tenants.length} tenants processed`,
    );
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChildDigestSection {
  student_id: string;
  student_name: string;
  attendance: { status: string } | null;
  grades: Array<{
    assessment_title: string;
    subject_name: string;
    raw_score: string | null;
    max_score: string;
  }>;
  behaviour_incidents: Array<{
    description: string;
    category_name: string;
    polarity: string;
  }>;
  behaviour_awards: Array<{
    award_type_name: string;
    notes: string | null;
  }>;
  homework: Array<{
    title: string;
    class_name: string;
    subject_name: string | null;
    due_date: string;
  }>;
}

interface FeesSummary {
  outstanding_count: number;
  total_amount: number;
  currency_code: string;
}

interface ParentDigestData {
  parent_id: string;
  user_id: string;
  locale: string;
  channels: $Enums.NotificationChannel[];
  children: ChildDigestSection[];
  fees: FeesSummary | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_EXTRA_CHANNELS = new Set(['email', 'whatsapp', 'sms']);

function resolveChannels(preferredRaw: unknown): $Enums.NotificationChannel[] {
  const channels: $Enums.NotificationChannel[] = ['in_app'];

  if (Array.isArray(preferredRaw)) {
    for (const ch of preferredRaw) {
      if (typeof ch === 'string' && VALID_EXTRA_CHANNELS.has(ch)) {
        channels.push(ch as $Enums.NotificationChannel);
      }
    }
  }

  return channels;
}

function resolveStudentName(
  student: {
    first_name: string;
    last_name: string;
    full_name: string | null;
    full_name_ar: string | null;
  },
  locale: string,
): string {
  if (locale === 'ar' && student.full_name_ar) {
    return student.full_name_ar;
  }
  return student.full_name ?? `${student.first_name} ${student.last_name}`;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class ParentDailyDigestJob extends TenantAwareJob<ParentDailyDigestPayload> {
  private readonly logger = new Logger(ParentDailyDigestJob.name);

  protected async processJob(data: ParentDailyDigestPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;

    // ─── 1. Load and validate tenant settings ───────────────────────────
    const tenantSetting = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = (tenantSetting?.settings as Record<string, unknown>) ?? {};
    const digestSettings = parentDigestSettingsSchema.parse(rawSettings.parent_digest ?? {});

    if (!digestSettings.enabled) {
      this.logger.log(`Parent daily digest disabled for tenant ${tenant_id} — skipping`);
      return;
    }

    // ─── 2. Check if current hour matches tenant's send_hour_utc ────────
    const now = new Date();
    const currentHourUtc = now.getUTCHours();

    if (currentHourUtc !== digestSettings.send_hour_utc) {
      this.logger.log(
        `Current hour ${currentHourUtc} ≠ send_hour_utc ${digestSettings.send_hour_utc} ` +
          `for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // ─── 3. Load student-parent links with parent + student info ────────
    const studentParentLinks = await tx.studentParent.findMany({
      where: { tenant_id },
      include: {
        parent: {
          select: {
            id: true,
            user_id: true,
            status: true,
            preferred_contact_channels: true,
          },
        },
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            full_name: true,
            full_name_ar: true,
            status: true,
            household_id: true,
          },
        },
      },
    });

    // Filter to active parents with user accounts linked to active students
    const activeLinks = studentParentLinks.filter(
      (sp) => sp.parent.status === 'active' && sp.parent.user_id && sp.student.status === 'active',
    );

    if (activeLinks.length === 0) {
      this.logger.log(`No active student-parent links for tenant ${tenant_id} — skipping`);
      return;
    }

    // ─── 4. Resolve parent locales from User.preferred_locale ───────────
    const parentUserIds = [...new Set(activeLinks.map((l) => l.parent.user_id!))];
    const users = await tx.user.findMany({
      where: { id: { in: parentUserIds } },
      select: { id: true, preferred_locale: true },
    });
    const userLocaleMap = new Map(users.map((u) => [u.id, u.preferred_locale ?? 'en']));

    // ─── 5. Collect unique IDs for batch queries ────────────────────────
    const studentIds = [...new Set(activeLinks.map((l) => l.student.id))];
    const householdIds = [...new Set(activeLinks.map((l) => l.student.household_id))];

    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);
    const sevenDaysFromNow = new Date(todayStart);
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // ─── 6. Batch query all data sources ────────────────────────────────

    // 6a. Attendance for today
    const attendanceSummaries = digestSettings.include_attendance
      ? await tx.dailyAttendanceSummary.findMany({
          where: {
            tenant_id,
            student_id: { in: studentIds },
            summary_date: todayStart,
          },
        })
      : [];

    const attendanceByStudent = new Map(attendanceSummaries.map((a) => [a.student_id, a]));

    // 6b. Grades published today
    const recentGrades = digestSettings.include_grades
      ? await tx.grade.findMany({
          where: {
            tenant_id,
            student_id: { in: studentIds },
            assessment: {
              grades_published_at: { gte: todayStart, lte: todayEnd },
            },
          },
          include: {
            assessment: {
              select: {
                title: true,
                max_score: true,
                subject: { select: { name: true } },
              },
            },
          },
        })
      : [];

    const gradesByStudent = new Map<string, typeof recentGrades>();
    for (const grade of recentGrades) {
      const existing = gradesByStudent.get(grade.student_id) ?? [];
      existing.push(grade);
      gradesByStudent.set(grade.student_id, existing);
    }

    // 6c. Behaviour incidents today (parent-visible only)
    const behaviourIncidents = digestSettings.include_behaviour
      ? await tx.behaviourIncident.findMany({
          where: {
            tenant_id,
            occurred_at: { gte: todayStart, lte: todayEnd },
            category: { parent_visible: true },
            retention_status: 'active' as $Enums.RetentionStatus,
            participants: {
              some: {
                student_id: { in: studentIds },
                role: 'subject',
              },
            },
          },
          include: {
            category: { select: { name: true } },
            participants: {
              where: { role: 'subject' },
              select: { student_id: true },
            },
          },
        })
      : [];

    const incidentsByStudent = new Map<string, typeof behaviourIncidents>();
    for (const inc of behaviourIncidents) {
      for (const p of inc.participants) {
        if (!p.student_id) continue;
        const existing = incidentsByStudent.get(p.student_id) ?? [];
        existing.push(inc);
        incidentsByStudent.set(p.student_id, existing);
      }
    }

    // 6d. Behaviour awards today
    const behaviourAwards = digestSettings.include_behaviour
      ? await tx.behaviourRecognitionAward.findMany({
          where: {
            tenant_id,
            student_id: { in: studentIds },
            awarded_at: { gte: todayStart, lte: todayEnd },
            superseded_by_id: null,
          },
          include: {
            award_type: { select: { name: true, name_ar: true } },
          },
        })
      : [];

    const awardsByStudent = new Map<string, typeof behaviourAwards>();
    for (const award of behaviourAwards) {
      const existing = awardsByStudent.get(award.student_id) ?? [];
      existing.push(award);
      awardsByStudent.set(award.student_id, existing);
    }

    // 6e. Homework due within 7 days
    const homeworkByStudent = new Map<string, ChildDigestSection['homework']>();

    if (digestSettings.include_homework) {
      const classEnrolments = await tx.classEnrolment.findMany({
        where: {
          tenant_id,
          student_id: { in: studentIds },
          status: 'active',
        },
        select: { student_id: true, class_id: true },
      });

      const classIds = [...new Set(classEnrolments.map((e) => e.class_id))];

      if (classIds.length > 0) {
        const assignments = await tx.homeworkAssignment.findMany({
          where: {
            tenant_id,
            class_id: { in: classIds },
            status: 'published',
            due_date: { gte: todayStart, lte: sevenDaysFromNow },
          },
          include: {
            class_entity: { select: { name: true } },
            subject: { select: { name: true } },
          },
        });

        const assignmentsByClass = new Map<string, typeof assignments>();
        for (const a of assignments) {
          const existing = assignmentsByClass.get(a.class_id) ?? [];
          existing.push(a);
          assignmentsByClass.set(a.class_id, existing);
        }

        // Map assignments to students via class enrolment, dedup by assignment ID
        const seenPerStudent = new Map<string, Set<string>>();

        for (const enrolment of classEnrolments) {
          const classAssignments = assignmentsByClass.get(enrolment.class_id) ?? [];
          const seen = seenPerStudent.get(enrolment.student_id) ?? new Set<string>();
          const existing = homeworkByStudent.get(enrolment.student_id) ?? [];

          for (const a of classAssignments) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            existing.push({
              title: a.title,
              class_name: a.class_entity.name,
              subject_name: a.subject?.name ?? null,
              due_date: a.due_date.toISOString().split('T')[0] ?? '',
            });
          }

          seenPerStudent.set(enrolment.student_id, seen);
          homeworkByStudent.set(enrolment.student_id, existing);
        }
      }
    }

    // 6f. Outstanding fees by household
    const feesByHousehold = new Map<string, FeesSummary>();

    if (digestSettings.include_fees) {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenant_id },
        select: { currency_code: true },
      });
      const currencyCode = tenant?.currency_code ?? 'EUR';

      const invoices = await tx.invoice.findMany({
        where: {
          tenant_id,
          household_id: { in: householdIds },
          status: {
            in: ['issued', 'overdue'] as $Enums.InvoiceStatus[],
          },
          balance_amount: { gt: 0 },
        },
        select: { household_id: true, balance_amount: true },
      });

      for (const inv of invoices) {
        const existing = feesByHousehold.get(inv.household_id) ?? {
          outstanding_count: 0,
          total_amount: 0,
          currency_code: currencyCode,
        };
        existing.outstanding_count++;
        existing.total_amount += Number(inv.balance_amount);
        feesByHousehold.set(inv.household_id, existing);
      }
    }

    // ─── 7. Build per-parent, per-child digest ──────────────────────────
    const parentDigests = new Map<string, ParentDigestData>();

    for (const link of activeLinks) {
      const parentId = link.parent.id;
      const userId = link.parent.user_id!;
      const locale = userLocaleMap.get(userId) ?? 'en';

      const digest = parentDigests.get(parentId) ?? {
        parent_id: parentId,
        user_id: userId,
        locale,
        channels: resolveChannels(link.parent.preferred_contact_channels),
        children: [],
        fees: null,
      };

      const studentId = link.student.id;
      const studentName = resolveStudentName(link.student, locale);

      // Skip if this child was already added (multi-link edge case)
      if (digest.children.some((c) => c.student_id === studentId)) {
        parentDigests.set(parentId, digest);
        continue;
      }

      const attendance = attendanceByStudent.get(studentId);
      const grades = gradesByStudent.get(studentId) ?? [];
      const incidents = incidentsByStudent.get(studentId) ?? [];
      const awards = awardsByStudent.get(studentId) ?? [];
      const homework = homeworkByStudent.get(studentId) ?? [];

      digest.children.push({
        student_id: studentId,
        student_name: studentName,
        attendance: attendance ? { status: attendance.derived_status } : null,
        grades: grades.map((g) => ({
          assessment_title: g.assessment.title,
          subject_name: g.assessment.subject.name,
          raw_score: g.raw_score !== null ? String(g.raw_score) : null,
          max_score: String(g.assessment.max_score),
        })),
        behaviour_incidents: incidents.map((inc) => ({
          description: inc.parent_description?.trim() || inc.category?.name || 'Incident',
          category_name: inc.category?.name ?? 'Incident',
          polarity: inc.polarity,
        })),
        behaviour_awards: awards.map((a) => ({
          award_type_name:
            locale === 'ar' && a.award_type.name_ar ? a.award_type.name_ar : a.award_type.name,
          notes: a.notes,
        })),
        homework,
      });

      // Fees — set once per parent from any linked child's household
      if (digestSettings.include_fees && !digest.fees) {
        const householdFees = feesByHousehold.get(link.student.household_id);
        if (householdFees) {
          digest.fees = householdFees;
        }
      }

      parentDigests.set(parentId, digest);
    }

    // ─── 8. Dedup check and create notification rows ────────────────────
    let parentsNotified = 0;
    let notificationsSent = 0;

    for (const [, digest] of parentDigests) {
      // Skip if already sent today
      const existingDigest = await tx.notification.findFirst({
        where: {
          tenant_id,
          recipient_user_id: digest.user_id,
          template_key: 'parent_daily_digest',
          created_at: { gte: todayStart },
        },
        select: { id: true },
      });

      if (existingDigest) continue;

      // Smart content: check whether there's anything worth reporting
      const hasContent =
        digest.children.some(
          (c) =>
            c.attendance !== null ||
            c.grades.length > 0 ||
            c.behaviour_incidents.length > 0 ||
            c.behaviour_awards.length > 0 ||
            c.homework.length > 0,
        ) ||
        (digest.fees !== null && digest.fees.outstanding_count > 0);

      const payload = {
        digest_date: todayStart.toISOString().split('T')[0],
        has_content: hasContent,
        children: digest.children,
        fees: digest.fees,
      };

      try {
        for (const channel of digest.channels) {
          const isInApp = channel === 'in_app';

          await tx.notification.create({
            data: {
              tenant_id,
              recipient_user_id: digest.user_id,
              channel,
              template_key: 'parent_daily_digest',
              locale: digest.locale,
              status: isInApp ? 'delivered' : 'queued',
              payload_json: payload as unknown as Prisma.InputJsonValue,
              source_entity_type: 'parent_daily_digest',
              source_entity_id: tenant_id,
              delivered_at: isInApp ? now : undefined,
            },
          });
          notificationsSent++;
        }
        parentsNotified++;
      } catch (err) {
        this.logger.error(
          `Failed to create digest for parent ${digest.parent_id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Parent daily digest complete for tenant ${tenant_id}: ` +
        `${parentsNotified} parents notified, ${notificationsSent} notifications sent`,
    );
  }
}
