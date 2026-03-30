import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { homeworkSettingsSchema } from '@school/shared';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface HomeworkDigestPayload extends TenantJobPayload {
  tenant_id: string;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const HOMEWORK_DIGEST_JOB = 'homework:digest-homework';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.HOMEWORK)
export class HomeworkDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(HomeworkDigestProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<HomeworkDigestPayload>): Promise<void> {
    if (job.name !== HOMEWORK_DIGEST_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${HOMEWORK_DIGEST_JOB} for tenant ${tenant_id}`,
    );

    const digestJob = new HomeworkDigestJob(this.prisma);
    await digestJob.execute(job.data);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DigestEntry {
  assignment_id: string;
  title: string;
  class_name: string;
  subject_name: string | null;
  due_date: string;
  homework_type: string;
}

interface ParentDigest {
  user_id: string;
  entries: DigestEntry[];
  assignmentIds: Set<string>;
}

// ─── TenantAwareJob implementation ──────────────────────────────────────────

class HomeworkDigestJob extends TenantAwareJob<HomeworkDigestPayload> {
  private readonly logger = new Logger(HomeworkDigestJob.name);

  protected async processJob(
    data: HomeworkDigestPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id } = data;

    // ─── 1. Parse tenant homework settings ──────────────────────────────────
    const tenantSetting = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = (tenantSetting?.settings as Record<string, unknown>) ?? {};
    const homeworkSettings = homeworkSettingsSchema.parse(rawSettings.homework ?? {});

    if (!homeworkSettings.parent_digest_include_homework) {
      this.logger.log(
        `Homework digest disabled for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // ─── 2. Get today's date ────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ─── 3. Find published assignments with due_date >= today ───────────────
    const assignments = await tx.homeworkAssignment.findMany({
      where: {
        tenant_id,
        status: 'published',
        due_date: { gte: today },
      },
      include: {
        class_entity: { select: { id: true, name: true } },
        subject: { select: { name: true } },
      },
    });

    if (assignments.length === 0) {
      this.logger.log(
        `No upcoming published assignments for tenant ${tenant_id} — skipping digest`,
      );
      return;
    }

    // ─── 4. Collect unique class IDs and find enrolled students ─────────────
    const classIds = [...new Set(assignments.map((a: { class_id: string }) => a.class_id))];

    const enrolments = await tx.classEnrolment.findMany({
      where: {
        tenant_id,
        class_id: { in: classIds },
        status: 'active',
      },
      select: { student_id: true, class_id: true },
    });

    if (enrolments.length === 0) {
      this.logger.log(
        `No active enrolments for assignment classes in tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // ─── 5. Build studentId -> assignments map ──────────────────────────────
    // Map class_id -> assignments for that class
    const assignmentsByClass = new Map<string, typeof assignments>();
    for (const assignment of assignments) {
      const existing = assignmentsByClass.get(assignment.class_id) ?? [];
      existing.push(assignment);
      assignmentsByClass.set(assignment.class_id, existing);
    }

    // Map student_id -> assignments for their class(es)
    const assignmentsByStudent = new Map<string, typeof assignments>();
    for (const enrolment of enrolments) {
      const classAssignments = assignmentsByClass.get(enrolment.class_id) ?? [];
      const existing = assignmentsByStudent.get(enrolment.student_id) ?? [];
      existing.push(...classAssignments);
      assignmentsByStudent.set(enrolment.student_id, existing);
    }

    const studentIds = [...assignmentsByStudent.keys()];

    // ─── 6. Find parent links (active parents only) ────────────────────────
    const studentParentLinks = await tx.studentParent.findMany({
      where: {
        tenant_id,
        student_id: { in: studentIds },
      },
      include: {
        parent: {
          select: {
            id: true,
            user_id: true,
            status: true,
            preferred_contact_channels: true,
          },
        },
      },
    });

    // Build parentsByStudent map — only active parents with a user account
    const parentsByStudent = new Map<
      string,
      Array<{ parent_id: string; user_id: string }>
    >();
    for (const sp of studentParentLinks) {
      if (sp.parent.status !== 'active' || !sp.parent.user_id) continue;
      const existing = parentsByStudent.get(sp.student_id) ?? [];
      existing.push({
        parent_id: sp.parent.id,
        user_id: sp.parent.user_id,
      });
      parentsByStudent.set(sp.student_id, existing);
    }

    // ─── 7. Build per-parent digest ─────────────────────────────────────────
    // Collect assignments across all linked students, dedup by assignment ID
    const parentDigests = new Map<string, ParentDigest>();

    for (const [studentId, parents] of parentsByStudent) {
      const studentAssignments = assignmentsByStudent.get(studentId) ?? [];
      if (studentAssignments.length === 0) continue;

      for (const parentInfo of parents) {
        const digest = parentDigests.get(parentInfo.user_id) ?? {
          user_id: parentInfo.user_id,
          entries: [],
          assignmentIds: new Set<string>(),
        };

        for (const assignment of studentAssignments) {
          // Deduplicate by assignment ID across multiple linked students
          if (digest.assignmentIds.has(assignment.id)) continue;

          digest.assignmentIds.add(assignment.id);
          digest.entries.push({
            assignment_id: assignment.id,
            title: assignment.title,
            class_name: assignment.class_entity.name,
            subject_name: assignment.subject?.name ?? null,
            due_date: assignment.due_date.toISOString().split('T')[0] ?? '',
            homework_type: assignment.homework_type,
          });
        }

        parentDigests.set(parentInfo.user_id, digest);
      }
    }

    // ─── 8. Create notification rows ────────────────────────────────────────
    const now = new Date();
    let parentsNotified = 0;

    for (const [userId, digest] of parentDigests) {
      if (digest.entries.length === 0) continue;

      try {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: userId,
            channel: 'in_app',
            template_key: 'homework_digest',
            locale: 'en',
            status: 'delivered',
            payload_json: JSON.parse(JSON.stringify({
              is_digest: true,
              entries: digest.entries,
              total_assignments: digest.entries.length,
            })),
            source_entity_type: 'homework_digest',
            source_entity_id: tenant_id,
            delivered_at: now,
          },
        });
        parentsNotified++;
      } catch (err) {
        this.logger.error(
          `Failed to create digest notification for user ${userId}: ${(err as Error).message}`,
        );
      }
    }

    // ─── 9. Log summary ────────────────────────────────────────────────────
    this.logger.log(
      `Homework digest complete for tenant ${tenant_id}: ${parentsNotified} parents notified, ${assignments.length} assignments included`,
    );
  }
}
