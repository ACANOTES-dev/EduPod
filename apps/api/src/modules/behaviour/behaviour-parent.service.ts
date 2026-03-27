import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  ParentChildSummary,
  ParentIncidentView,
  ParentPointsAwards,
  ParentRecognitionItem,
  ParentSanctionView,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourParentService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Resolve Parent ──────────────────────────────────────────────────

  async resolveParent(tenantId: string, userId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId, status: 'active' },
      include: { user: { select: { preferred_locale: true } } },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    return parent;
  }

  // ─── Summary ─────────────────────────────────────────────────────────

  async getSummary(tenantId: string, userId: string): Promise<{ data: ParentChildSummary[] }> {
    const parent = await this.resolveParent(tenantId, userId);
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Get parent's linked students
      const rawLinks = await db.studentParent.findMany({
        where: { parent_id: parent.id, tenant_id: tenantId },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
        },
      });
      const studentLinks = rawLinks as Array<typeof rawLinks[0] & { student: { id: string; first_name: string; last_name: string } }>;

      const summaries: ParentChildSummary[] = [];

      for (const link of studentLinks) {
        const studentId = link.student_id;

        // Guardian restriction check
        const restricted = await this.isRestricted(db, tenantId, studentId, parent.id, today);
        if (restricted) {
          // Return student name but zero data (no indication of restriction)
          summaries.push({
            student_id: studentId,
            student_name: `${link.student.first_name} ${link.student.last_name}`,
            positive_count_7d: 0,
            negative_count_7d: 0,
            points_total: 0,
            pending_acknowledgements: 0,
          });
          continue;
        }

        // Get incident counts (last 7 days) — parent_visible is on BehaviourCategory, not BehaviourIncident
        const [positiveCount, negativeCount] = await Promise.all([
          db.behaviourIncident.count({
            where: {
              tenant_id: tenantId,
              polarity: 'positive',
              occurred_at: { gte: sevenDaysAgo },
              category: { parent_visible: true },
              retention_status: 'active' as $Enums.RetentionStatus,
              participants: { some: { student_id: studentId, role: 'subject' } },
            },
          }),
          db.behaviourIncident.count({
            where: {
              tenant_id: tenantId,
              polarity: 'negative',
              occurred_at: { gte: sevenDaysAgo },
              category: { parent_visible: true },
              retention_status: 'active' as $Enums.RetentionStatus,
              participants: { some: { student_id: studentId, role: 'subject' } },
            },
          }),
        ]);

        // Get points total
        const pointsAgg = await db.behaviourIncidentParticipant.aggregate({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            role: 'subject',
            incident: {
              retention_status: 'active' as $Enums.RetentionStatus,
            },
          },
          _sum: { points_awarded: true },
        });

        // Get pending acknowledgements
        const pendingAcks = await db.behaviourParentAcknowledgement.count({
          where: {
            tenant_id: tenantId,
            parent_id: parent.id,
            incident: {
              participants: { some: { student_id: studentId } },
            },
            acknowledged_at: null,
          },
        });

        summaries.push({
          student_id: studentId,
          student_name: `${link.student.first_name} ${link.student.last_name}`,
          positive_count_7d: positiveCount,
          negative_count_7d: negativeCount,
          points_total: pointsAgg._sum.points_awarded ?? 0,
          pending_acknowledgements: pendingAcks,
        });
      }

      return { data: summaries };
    }) as unknown as Promise<{ data: ParentChildSummary[] }>);
  }

  // ─── Incidents (parent-safe) ─────────────────────────────────────────

  async getIncidents(
    tenantId: string,
    userId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: ParentIncidentView[]; meta: { page: number; pageSize: number; total: number } }> {
    const parent = await this.resolveParent(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();

      // Verify parent-student link
      await this.verifyParentStudentLink(db, tenantId, parent.id, studentId);

      // Guardian restriction check
      const restricted = await this.isRestricted(db, tenantId, studentId, parent.id, today);
      if (restricted) {
        return { data: [], meta: { page, pageSize, total: 0 } };
      }

      // Resolve parent locale from the linked User record
      const parentLocale = parent.user?.preferred_locale ?? 'en';

      // Load tenant settings for teacher name visibility
      const tenantSettings = await db.tenantSetting.findFirst({
        where: { tenant_id: tenantId },
        select: { settings: true },
      });
      const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
      const behaviourSettings = (settings.behaviour as Record<string, unknown>) ?? {};
      const showTeacherName = (behaviourSettings.parent_visibility_show_teacher_name as boolean) ?? false;

      // parent_visible is on BehaviourCategory, not BehaviourIncident
      const where: Prisma.BehaviourIncidentWhereInput = {
        tenant_id: tenantId,
        category: { parent_visible: true },
        retention_status: 'active' as $Enums.RetentionStatus,
        participants: { some: { student_id: studentId, role: 'subject' } },
      };

      const [rawIncidents, total] = await Promise.all([
        db.behaviourIncident.findMany({
          where,
          orderBy: { occurred_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            category: { select: { name: true, name_ar: true } },
            reported_by: showTeacherName
              ? { select: { first_name: true, last_name: true } }
              : false,
          },
        }),
        db.behaviourIncident.count({ where }),
      ]);

      type IncidentRow = typeof rawIncidents[0] & {
        category: { name: string; name_ar: string | null } | null;
        reported_by: { first_name: string; last_name: string } | null;
        parent_description: string | null;
        parent_description_ar: string | null;
        context_snapshot: unknown;
      };
      const incidents = rawIncidents as IncidentRow[];

      // Get pending acknowledgements for these incidents
      const incidentIds = incidents.map((i) => i.id);
      const acks = incidentIds.length > 0
        ? await db.behaviourParentAcknowledgement.findMany({
            where: {
              tenant_id: tenantId,
              parent_id: parent.id,
              incident_id: { in: incidentIds },
              acknowledged_at: null,
            },
            select: { id: true, incident_id: true },
          })
        : [];
      const ackByIncident = new Map(acks.map((a) => [a.incident_id, a.id]));

      // Apply parent-safe rendering priority chain
      const data: ParentIncidentView[] = incidents.map((inc) => ({
        id: inc.id,
        incident_number: inc.incident_number ?? '',
        category_name: inc.category?.name ?? '',
        category_name_ar: inc.category?.name_ar ?? null,
        polarity: inc.polarity,
        severity: inc.severity,
        incident_description: this.renderIncidentForParent(inc, parentLocale),
        occurred_at: inc.occurred_at.toISOString(),
        reported_by_name: showTeacherName && inc.reported_by
          ? `${inc.reported_by.first_name} ${inc.reported_by.last_name}`
          : null,
        pending_acknowledgement_id: ackByIncident.get(inc.id) ?? null,
      }));

      return { data, meta: { page, pageSize, total } };
    }) as unknown as Promise<{ data: ParentIncidentView[]; meta: { page: number; pageSize: number; total: number } }>);
  }

  // ─── Points & Awards ─────────────────────────────────────────────────

  async getPointsAwards(
    tenantId: string,
    userId: string,
    studentId: string,
  ): Promise<{ data: ParentPointsAwards }> {
    const parent = await this.resolveParent(tenantId, userId);
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      await this.verifyParentStudentLink(db, tenantId, parent.id, studentId);

      const restricted = await this.isRestricted(db, tenantId, studentId, parent.id, today);
      if (restricted) {
        return { data: { points_total: 0, points_change_7d: 0, awards: [] } };
      }

      const pointsAgg = await db.behaviourIncidentParticipant.aggregate({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          role: 'subject',
          incident: { retention_status: 'active' as $Enums.RetentionStatus },
        },
        _sum: { points_awarded: true },
      });

      const recentPointsAgg = await db.behaviourIncidentParticipant.aggregate({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          role: 'subject',
          incident: {
            retention_status: 'active' as $Enums.RetentionStatus,
            occurred_at: { gte: sevenDaysAgo },
          },
        },
        _sum: { points_awarded: true },
      });

      // superseded_by_id: null means not superseded (is_superseded is not a DB column)
      const rawAwards = await db.behaviourRecognitionAward.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          superseded_by_id: null,
        },
        include: {
          award_type: { select: { name: true, tier_level: true } },
        },
        orderBy: { awarded_at: 'desc' },
        take: 20,
      });
      type AwardWithType = typeof rawAwards[0] & {
        award_type: { name: string; tier_level: number | null };
      };
      const awards = rawAwards as AwardWithType[];

      return {
        data: {
          points_total: pointsAgg._sum.points_awarded ?? 0,
          points_change_7d: recentPointsAgg._sum.points_awarded ?? 0,
          awards: awards.map((a) => ({
            award_type_name: a.award_type.name,
            awarded_at: a.awarded_at.toISOString(),
            tier_level: a.award_type.tier_level,
          })),
        },
      };
    }) as unknown as Promise<{ data: ParentPointsAwards }>);
  }

  // ─── Sanctions (parent-safe) ─────────────────────────────────────────

  async getSanctions(
    tenantId: string,
    userId: string,
    studentId: string,
  ): Promise<{ data: { upcoming: ParentSanctionView[]; recent: ParentSanctionView[] } }> {
    const parent = await this.resolveParent(tenantId, userId);
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();

      await this.verifyParentStudentLink(db, tenantId, parent.id, studentId);

      const restricted = await this.isRestricted(db, tenantId, studentId, parent.id, today);
      if (restricted) {
        return { data: { upcoming: [], recent: [] } };
      }

      const sanctions = await db.behaviourSanction.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          status: {
            notIn: [
              'cancelled' as $Enums.SanctionStatus,
              'superseded' as $Enums.SanctionStatus,
            ],
          },
        },
        select: {
          id: true,
          sanction_number: true,
          type: true,
          scheduled_date: true,
          suspension_start_date: true,
          suspension_end_date: true,
          status: true,
        },
        orderBy: { scheduled_date: 'desc' },
        take: 20,
      });

      const upcoming: ParentSanctionView[] = [];
      const recent: ParentSanctionView[] = [];

      for (const s of sanctions) {
        const view: ParentSanctionView = {
          id: s.id,
          sanction_number: s.sanction_number ?? '',
          type: s.type.replace(/_/g, ' '),
          scheduled_date: s.scheduled_date?.toISOString() ?? null,
          suspension_start_date: s.suspension_start_date?.toISOString() ?? null,
          suspension_end_date: s.suspension_end_date?.toISOString() ?? null,
          status: s.status,
        };

        const sanctionDate = s.scheduled_date ?? s.suspension_start_date;
        if (sanctionDate && sanctionDate >= today) {
          upcoming.push(view);
        } else {
          recent.push(view);
        }
      }

      return { data: { upcoming, recent } };
    }) as unknown as Promise<{ data: { upcoming: ParentSanctionView[]; recent: ParentSanctionView[] } }>);
  }

  // ─── Acknowledge ─────────────────────────────────────────────────────

  async acknowledge(tenantId: string, userId: string, acknowledgementId: string) {
    const parent = await this.resolveParent(tenantId, userId);
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const ack = await db.behaviourParentAcknowledgement.findFirst({
        where: {
          id: acknowledgementId,
          tenant_id: tenantId,
          parent_id: parent.id,
        },
      });

      if (!ack) {
        throw new NotFoundException('Acknowledgement not found');
      }

      if (ack.acknowledged_at) {
        return { data: { acknowledged: true, already_acknowledged: true } };
      }

      const now = new Date();

      await db.behaviourParentAcknowledgement.update({
        where: { id: acknowledgementId },
        data: {
          acknowledged_at: now,
          acknowledgement_method: 'in_app_button' as $Enums.AcknowledgementMethod,
        },
      });

      // If this acknowledgement is linked to an amendment, update the notice
      if (ack.amendment_notice_id) {
        await db.behaviourAmendmentNotice.update({
          where: { id: ack.amendment_notice_id },
          data: { parent_reacknowledged_at: now },
        });
      }

      // Update incident parent_notification_status if all acks for this incident are acknowledged
      if (ack.incident_id) {
        const unacknowledged = await db.behaviourParentAcknowledgement.count({
          where: {
            tenant_id: tenantId,
            incident_id: ack.incident_id,
            acknowledged_at: null,
          },
        });

        if (unacknowledged === 0) {
          await db.behaviourIncident.update({
            where: { id: ack.incident_id },
            data: { parent_notification_status: 'acknowledged' as $Enums.ParentNotifStatus },
          });
        }
      }

      return { data: { acknowledged: true } };
    });
  }

  // ─── Recognition Wall ────────────────────────────────────────────────

  async getRecognitionWall(
    tenantId: string,
    userId: string,
  ): Promise<{ data: ParentRecognitionItem[] }> {
    await this.resolveParent(tenantId, userId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Check if recognition wall is enabled
      const tenantSettings = await db.tenantSetting.findFirst({
        where: { tenant_id: tenantId },
        select: { settings: true },
      });
      const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
      const behaviourSettings = (settings.behaviour as Record<string, unknown>) ?? {};

      // superseded_by_id: null means not superseded (is_superseded is not a DB column)
      const rawAwards = await db.behaviourRecognitionAward.findMany({
        where: {
          tenant_id: tenantId,
          superseded_by_id: null,
        },
        include: {
          student: { select: { first_name: true, last_name: true } },
          award_type: { select: { name: true, icon: true } },
        },
        orderBy: { awarded_at: 'desc' },
        take: 50,
      });
      type WallAward = typeof rawAwards[0] & {
        student: { first_name: string; last_name: string };
        award_type: { name: string; icon: string | null };
      };
      const awards = rawAwards as WallAward[];

      // Check consent requirements
      const requiresConsent = (behaviourSettings.recognition_wall_requires_consent as boolean) ?? true;

      let filtered: WallAward[];
      if (requiresConsent) {
        // Only show awards with a granted publication approval
        const approvedRecords = await db.behaviourPublicationApproval.findMany({
          where: {
            tenant_id: tenantId,
            entity_type: 'award' as $Enums.PublicationEntityType,
            parent_consent_status: 'granted' as $Enums.ParentConsentStatus,
          },
          select: { entity_id: true },
        });
        const approvedIds = new Set(approvedRecords.map((a) => a.entity_id));
        filtered = awards.filter((a) => approvedIds.has(a.id));
      } else {
        filtered = awards;
      }

      const data: ParentRecognitionItem[] = filtered.map((a) => ({
        student_first_name: a.student.first_name,
        student_last_initial: a.student.last_name.charAt(0),
        award_type_name: a.award_type.name,
        award_icon: a.award_type.icon ?? null,
        awarded_at: a.awarded_at.toISOString(),
      }));

      return { data };
    }) as unknown as Promise<{ data: ParentRecognitionItem[] }>);
  }

  // ─── Parent-Safe Rendering Priority Chain ────────────────────────────

  /**
   * Content priority:
   * 1. parent_description_ar (if locale is 'ar' and not null), else parent_description
   * 2. Template text from context_snapshot
   * 3. Category name (name_ar for Arabic locale) + date fallback
   */
  private renderIncidentForParent(
    incident: {
      parent_description?: string | null;
      parent_description_ar?: string | null;
      occurred_at: Date;
      category?: { name: string; name_ar?: string | null } | null;
      context_snapshot?: unknown;
    },
    parentLocale: string = 'en',
  ): string {
    const isArabic = parentLocale === 'ar';

    // Priority 1: parent_description (locale-aware)
    if (isArabic && incident.parent_description_ar?.trim()) {
      return incident.parent_description_ar;
    }
    if (incident.parent_description?.trim()) {
      return incident.parent_description;
    }

    // Priority 2: template text from context_snapshot
    const snapshot = incident.context_snapshot as Record<string, unknown> | null;
    if (snapshot?.description_template_text) {
      return snapshot.description_template_text as string;
    }

    // Priority 3: category name + date (locale-aware)
    const categoryName = (isArabic && incident.category?.name_ar?.trim())
      ? incident.category.name_ar
      : (incident.category?.name ?? 'Incident');
    const dateLocale = isArabic ? 'ar-SA' : 'en-IE';
    const dateStr = incident.occurred_at.toLocaleDateString(dateLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return `${categoryName} — ${dateStr}`;
  }

  // ─── Guardian Restriction Check ──────────────────────────────────────

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
        OR: [
          { effective_until: null },
          { effective_until: { gte: today } },
        ],
      },
    });

    return restriction !== null;
  }

  // ─── Verify Parent-Student Link ──────────────────────────────────────

  private async verifyParentStudentLink(
    db: PrismaService,
    tenantId: string,
    parentId: string,
    studentId: string,
  ) {
    const link = await db.studentParent.findFirst({
      where: { parent_id: parentId, student_id: studentId, tenant_id: tenantId },
    });

    if (!link) {
      throw new ForbiddenException({
        code: 'STUDENT_NOT_LINKED',
        message: 'You do not have access to this student\'s behaviour data',
      });
    }
  }
}
