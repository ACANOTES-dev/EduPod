import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Response Types (parent-facing — NO author fields) ──────────────────────

export interface ParentConcernView {
  id: string;
  student_id: string;
  student_name: string;
  category: string;
  severity: string;
  occurred_at: string;
  summary?: string;
  narrative?: string;
}

export interface ParentInterventionView {
  id: string;
  student_id: string;
  student_name: string;
  intervention_type: string;
  continuum_level: number;
  target_outcomes: Array<{ description: string; measurable_target: string }>;
  parent_input: string | null;
  student_voice: string | null;
  status: string;
  next_review_date: string | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Input Types ────────────────────────────────────────────────────────────

export interface ParentPastoralQuery {
  student_id?: string;
  page: number;
  pageSize: number;
}

export interface ParentSelfReferralInput {
  student_id: string;
  description: string;
  category?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ParentPastoralService {
  private readonly logger = new Logger(ParentPastoralService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── Resolve Parent (private, same pattern as BehaviourParentService) ─────

  async resolveParent(tenantId: string, userId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId, status: 'active' },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'Parent record not found',
      });
    }

    return parent;
  }

  // ─── Get Shared Concerns ──────────────────────────────────────────────────

  async getSharedConcerns(
    tenantId: string,
    userId: string,
    query: ParentPastoralQuery,
  ): Promise<{ data: ParentConcernView[]; meta: PaginationMeta }> {
    const parent = await this.resolveParent(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();

      // 1. Get linked student IDs
      const links = await db.studentParent.findMany({
        where: { parent_id: parent.id, tenant_id: tenantId },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
        },
      });

      if (links.length === 0) {
        return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
      }

      // 2. Check guardian restrictions per student
      const allowedStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

      for (const link of links) {
        const restricted = await this.isRestricted(db, tenantId, link.student_id, parent.id, today);
        if (!restricted) {
          allowedStudents.push({
            id: link.student_id,
            first_name: link.student.first_name,
            last_name: link.student.last_name,
          });
        }
      }

      if (allowedStudents.length === 0) {
        return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
      }

      const allowedStudentIds = allowedStudents.map((s) => s.id);
      const studentNameMap = new Map(
        allowedStudents.map((s) => [s.id, `${s.first_name} ${s.last_name}`]),
      );

      // 3. Filter by specific student if requested
      const targetStudentIds = query.student_id
        ? allowedStudentIds.filter((id) => id === query.student_id)
        : allowedStudentIds;

      if (targetStudentIds.length === 0) {
        return { data: [], meta: { page: query.page, pageSize: query.pageSize, total: 0 } };
      }

      // 4. Query concerns — defence-in-depth: parent_shareable=true AND tier < 3
      const skip = (query.page - 1) * query.pageSize;
      const where = {
        tenant_id: tenantId,
        student_id: { in: targetStudentIds },
        parent_shareable: true,
        tier: { lt: 3 },
      };

      const [rawConcerns, total] = await Promise.all([
        db.pastoralConcern.findMany({
          where,
          include: {
            versions: {
              orderBy: { version_number: 'desc' as const },
              take: 1,
              select: { narrative: true },
            },
          },
          orderBy: { created_at: 'desc' },
          skip,
          take: query.pageSize,
        }),
        db.pastoralConcern.count({ where }),
      ]);

      // 5. Map to parent-safe view — NEVER include author info
      const data: ParentConcernView[] = rawConcerns.map((c) => {
        const latestNarrative = c.versions[0]?.narrative ?? '';
        const view: ParentConcernView = {
          id: c.id,
          student_id: c.student_id,
          student_name: studentNameMap.get(c.student_id) ?? '',
          category: c.category,
          severity: c.severity,
          occurred_at: c.occurred_at.toISOString(),
        };

        // Share level enforcement
        if (c.parent_share_level === 'category_summary') {
          view.summary = latestNarrative.slice(0, 200);
        } else if (c.parent_share_level === 'full_detail') {
          view.summary = latestNarrative;
          view.narrative = latestNarrative;
        }
        // 'category_only' — no summary, no narrative (default)

        return view;
      });

      return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
    }) as unknown as Promise<{ data: ParentConcernView[]; meta: PaginationMeta }>;
  }

  // ─── Submit Self-Referral ─────────────────────────────────────────────────

  async submitSelfReferral(
    tenantId: string,
    userId: string,
    dto: ParentSelfReferralInput,
  ): Promise<{ data: { id: string; created_at: string } }> {
    const parent = await this.resolveParent(tenantId, userId);

    // 1. Check tenant setting: parent_self_referral_enabled (defaults to true)
    const selfReferralEnabled = await this.isSelfReferralEnabled(tenantId);
    if (!selfReferralEnabled) {
      throw new BadRequestException({
        code: 'SELF_REFERRAL_DISABLED',
        message: 'Parent self-referral is not enabled for this tenant',
      });
    }

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 2. Verify parent-student link
      const link = await db.studentParent.findFirst({
        where: { parent_id: parent.id, student_id: dto.student_id, tenant_id: tenantId },
      });

      if (!link) {
        throw new ForbiddenException({
          code: 'STUDENT_NOT_LINKED',
          message: 'You do not have access to this student',
        });
      }

      // 3. Create Tier 1 routine concern
      const concern = await db.pastoralConcern.create({
        data: {
          tenant_id: tenantId,
          student_id: dto.student_id,
          logged_by_user_id: userId,
          author_masked: false,
          category: dto.category ?? 'other',
          severity: 'routine',
          tier: 1,
          occurred_at: new Date(),
        },
      });

      // 4. Create initial narrative version
      await db.pastoralConcernVersion.create({
        data: {
          tenant_id: tenantId,
          concern_id: concern.id,
          version_number: 1,
          narrative: dto.description,
          amended_by_user_id: userId,
          amendment_reason: null,
        },
      });

      // 5. Auto-assign to year head or form tutor
      await this.autoAssign(db, tenantId, dto.student_id, concern.id);

      // 6. Fire concern_created audit event with source = 'parent_self_referral'
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'concern_created',
        entity_type: 'concern',
        entity_id: concern.id,
        student_id: dto.student_id,
        actor_user_id: userId,
        tier: 1,
        payload: {
          concern_id: concern.id,
          student_id: dto.student_id,
          category: dto.category ?? 'other',
          severity: 'routine',
          tier: 1,
          narrative_version: 1,
          narrative_snapshot: dto.description,
          source: 'parent_self_referral' as const,
        },
        ip_address: null,
      });

      return {
        data: {
          id: concern.id,
          created_at: concern.created_at.toISOString(),
        },
      };
    }) as unknown as Promise<{ data: { id: string; created_at: string } }>;
  }

  // ─── Get Intervention Summaries ───────────────────────────────────────────

  async getInterventionSummaries(
    tenantId: string,
    userId: string,
    studentId?: string,
  ): Promise<{ data: ParentInterventionView[] }> {
    const parent = await this.resolveParent(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();

      // 1. Get linked students
      const links = await db.studentParent.findMany({
        where: { parent_id: parent.id, tenant_id: tenantId },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
        },
      });

      if (links.length === 0) {
        return { data: [] };
      }

      // 2. Check guardian restrictions and build allowed list
      const allowedStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

      for (const link of links) {
        const restricted = await this.isRestricted(db, tenantId, link.student_id, parent.id, today);
        if (!restricted) {
          allowedStudents.push({
            id: link.student_id,
            first_name: link.student.first_name,
            last_name: link.student.last_name,
          });
        }
      }

      if (allowedStudents.length === 0) {
        return { data: [] };
      }

      const allowedStudentIds = allowedStudents.map((s) => s.id);
      const studentNameMap = new Map(
        allowedStudents.map((s) => [s.id, `${s.first_name} ${s.last_name}`]),
      );

      // 3. Filter by specific student if requested
      const targetStudentIds = studentId
        ? allowedStudentIds.filter((id) => id === studentId)
        : allowedStudentIds;

      if (targetStudentIds.length === 0) {
        return { data: [] };
      }

      // 4. Query interventions — only parent_informed=true
      const interventions = await db.pastoralIntervention.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: targetStudentIds },
          parent_informed: true,
        },
        select: {
          id: true,
          student_id: true,
          intervention_type: true,
          continuum_level: true,
          target_outcomes: true,
          parent_input: true,
          student_voice: true,
          status: true,
          next_review_date: true,
          // Explicitly NOT selecting: case_id, created_by_user_id
        },
        orderBy: { created_at: 'desc' },
      });

      // 5. Map to parent-safe view
      const data: ParentInterventionView[] = interventions.map((i) => ({
        id: i.id,
        student_id: i.student_id,
        student_name: studentNameMap.get(i.student_id) ?? '',
        intervention_type: i.intervention_type,
        continuum_level: i.continuum_level,
        target_outcomes: this.parseTargetOutcomes(i.target_outcomes),
        parent_input: i.parent_input,
        student_voice: i.student_voice,
        status: i.status,
        next_review_date: i.next_review_date ? i.next_review_date.toISOString() : null,
      }));

      return { data };
    }) as unknown as Promise<{ data: ParentInterventionView[] }>;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Guardian restriction check — same pattern as BehaviourParentService.isRestricted().
   */
  private async isRestricted(
    db: PrismaService,
    tenantId: string,
    studentId: string,
    parentId: string,
    today: Date,
  ): Promise<boolean> {
    const restriction = await db.behaviourGuardianRestriction.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        parent_id: parentId,
        restriction_type: {
          in: [
            'no_behaviour_visibility' as $Enums.RestrictionType,
            'no_behaviour_notifications' as $Enums.RestrictionType,
          ],
        },
        status: 'active_restriction' as $Enums.RestrictionStatus,
        effective_from: { lte: today },
        OR: [{ effective_until: null }, { effective_until: { gte: today } }],
      },
    });

    return restriction !== null;
  }

  /**
   * Reads the raw pastoral settings from the tenant_settings table.
   */
  private async loadRawPastoralSettings(tenantId: string): Promise<Record<string, unknown>> {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    return (settingsJson.pastoral as Record<string, unknown>) ?? {};
  }

  /**
   * Checks whether parent self-referral is enabled for the tenant.
   * Defaults to true if the setting is not present.
   */
  private async isSelfReferralEnabled(tenantId: string): Promise<boolean> {
    const pastoralRaw = await this.loadRawPastoralSettings(tenantId);
    const value = pastoralRaw.parent_self_referral_enabled;
    // Default to true if not explicitly set
    return value !== false;
  }

  /**
   * Auto-assign a self-referral concern to homeroom teacher (form tutor).
   * Falls back silently if no assignee can be resolved.
   */
  private async autoAssign(
    db: PrismaService,
    tenantId: string,
    studentId: string,
    concernId: string,
  ): Promise<void> {
    try {
      // Find the student's active class enrolment to locate homeroom teacher
      const enrolment = await db.classEnrolment.findFirst({
        where: {
          student_id: studentId,
          tenant_id: tenantId,
          status: 'active',
        },
        include: {
          class_entity: {
            select: {
              homeroom_teacher_staff_id: true,
            },
          },
        },
      });

      if (!enrolment?.class_entity?.homeroom_teacher_staff_id) return;

      // Mark concern for follow-up, indicating auto-assignment
      await db.pastoralConcern.update({
        where: { id: concernId },
        data: {
          follow_up_needed: true,
          follow_up_suggestion: 'Auto-assigned to homeroom teacher',
        },
      });
    } catch (err) {
      this.logger.warn(
        `Auto-assign homeroom teacher failed for concern ${concernId} — operation continues`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /**
   * Safely parse target_outcomes JSON to the expected array format.
   */
  private parseTargetOutcomes(
    raw: unknown,
  ): Array<{ description: string; measurable_target: string }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (item): item is { description: string; measurable_target: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).description === 'string' &&
          typeof (item as Record<string, unknown>).measurable_target === 'string',
      )
      .map((item) => ({
        description: item.description,
        measurable_target: item.measurable_target,
      }));
  }
}
