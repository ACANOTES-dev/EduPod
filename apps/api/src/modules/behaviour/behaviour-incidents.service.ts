import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';

import {
  type CreateIncidentDto,
  type ListIncidentsQuery,
  type UpdateIncidentDto,
} from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

/**
 * Map the Zod/shared context_type strings to Prisma's ContextType enum.
 * Prisma generates `class_` and `break_` because `class` and `break` are
 * reserved JS keywords.
 */
const CONTEXT_TYPE_MAP: Record<string, $Enums.ContextType> = {
  class: 'class_' as $Enums.ContextType,
  break: 'break_' as $Enums.ContextType,
  before_school: 'before_school' as $Enums.ContextType,
  after_school: 'after_school' as $Enums.ContextType,
  lunch: 'lunch' as $Enums.ContextType,
  transport: 'transport' as $Enums.ContextType,
  extra_curricular: 'extra_curricular' as $Enums.ContextType,
  off_site: 'off_site' as $Enums.ContextType,
  online: 'online' as $Enums.ContextType,
  other: 'other' as $Enums.ContextType,
};

function toContextType(value: string): $Enums.ContextType {
  return CONTEXT_TYPE_MAP[value] ?? ('other' as $Enums.ContextType);
}

// ─── Incident CRUD & query operations ─────────────────────────────────────────

@Injectable()
export class BehaviourIncidentsService {
  private readonly logger = new Logger(BehaviourIncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
    private readonly scopeService: BehaviourScopeService,
    private readonly sideEffects: BehaviourSideEffectsService,
  ) {}

  // ─── Create Incident ────────────────────────────────────────────────────

  async createIncident(tenantId: string, userId: string, dto: CreateIncidentDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Idempotency check
        if (dto.idempotency_key) {
          const existing = await db.behaviourIncident.findFirst({
            where: {
              tenant_id: tenantId,
              idempotency_key: dto.idempotency_key,
            },
            include: { participants: true },
          });
          if (existing) return existing;
        }

        // Load category
        const category = await db.behaviourCategory.findFirst({
          where: {
            id: dto.category_id,
            tenant_id: tenantId,
            is_active: true,
          },
        });
        if (!category) {
          throw new NotFoundException({
            code: 'CATEGORY_NOT_FOUND',
            message: 'Category not found',
          });
        }

        // Validate students
        const students = await db.student.findMany({
          where: { id: { in: dto.student_ids }, tenant_id: tenantId },
          include: {
            year_group: { select: { id: true, name: true } },
            class_enrolments: {
              where: { status: 'active' },
              include: {
                class_entity: { select: { name: true } },
              },
              take: 1,
            },
          },
        });
        if (students.length === 0) {
          throw new BadRequestException({
            code: 'NO_VALID_STUDENTS',
            message: 'At least one valid student is required',
          });
        }

        // Generate sequence number
        const incidentNumber = await this.sequenceService.nextNumber(
          tenantId,
          'behaviour_incident',
          tx,
          'BH',
        );

        // Reporter info for context snapshot
        const reporter = await db.user.findUnique({
          where: { id: userId },
          select: { first_name: true, last_name: true },
        });

        // Optional context lookups
        const academicYear = dto.academic_year_id
          ? await db.academicYear.findUnique({
              where: { id: dto.academic_year_id },
              select: { name: true },
            })
          : null;

        const academicPeriod = dto.academic_period_id
          ? await db.academicPeriod.findUnique({
              where: { id: dto.academic_period_id },
              select: { name: true },
            })
          : null;

        const subject = dto.subject_id
          ? await db.subject.findUnique({
              where: { id: dto.subject_id },
              select: { name: true },
            })
          : null;

        const room = dto.room_id
          ? await db.room.findUnique({
              where: { id: dto.room_id },
              select: { name: true },
            })
          : null;

        const contextSnapshot = {
          category_name: category.name,
          category_polarity: category.polarity,
          category_severity: category.severity,
          category_point_value: category.point_value,
          category_benchmark_category: category.benchmark_category,
          reported_by_name: reporter ? `${reporter.first_name} ${reporter.last_name}` : 'Unknown',
          reported_by_role: null,
          subject_name: subject?.name ?? null,
          room_name: room?.name ?? null,
          academic_year_name: academicYear?.name ?? null,
          academic_period_name: academicPeriod?.name ?? null,
        };

        // Determine initial status and parent notification status
        const initialStatus: $Enums.IncidentStatus = dto.auto_submit ? 'active' : 'draft';

        const parentNotifStatus: $Enums.ParentNotifStatus = category.requires_parent_notification
          ? 'pending'
          : 'not_required';

        // Create incident
        const incident = await db.behaviourIncident.create({
          data: {
            tenant_id: tenantId,
            incident_number: incidentNumber,
            idempotency_key: dto.idempotency_key ?? null,
            category_id: dto.category_id,
            polarity: category.polarity,
            severity: category.severity,
            reported_by_id: userId,
            description: dto.description ?? category.name,
            parent_description: dto.parent_description ?? null,
            parent_description_ar: dto.parent_description_ar ?? null,
            context_notes: dto.context_notes ?? null,
            location: dto.location ?? null,
            context_type: toContextType(dto.context_type ?? 'class'),
            occurred_at: new Date(dto.occurred_at),
            logged_at: new Date(),
            academic_year_id: dto.academic_year_id,
            academic_period_id: dto.academic_period_id ?? null,
            schedule_entry_id: dto.schedule_entry_id ?? null,
            subject_id: dto.subject_id ?? null,
            room_id: dto.room_id ?? null,
            period_order: dto.period_order ?? null,
            weekday: dto.weekday ?? null,
            status: initialStatus,
            parent_notification_status: parentNotifStatus,
            follow_up_required: dto.follow_up_required ?? category.requires_follow_up,
            context_snapshot: contextSnapshot,
          },
        });

        // Create participants (one per student)
        for (const student of students) {
          const studentSnapshot = {
            student_name: `${student.first_name} ${student.last_name}`,
            year_group_id: student.year_group?.id ?? null,
            year_group_name: student.year_group?.name ?? null,
            class_name: student.class_enrolments?.[0]?.class_entity?.name ?? null,
            has_send: false,
            house_id: null,
            house_name: null,
            had_active_intervention: false,
            active_intervention_ids: [],
          };

          await db.behaviourIncidentParticipant.create({
            data: {
              tenant_id: tenantId,
              incident_id: incident.id,
              participant_type: 'student',
              student_id: student.id,
              role: 'subject',
              points_awarded: category.point_value,
              parent_visible: category.parent_visible,
              student_snapshot: studentSnapshot,
            },
          });
        }

        // Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'incident',
          incident.id,
          userId,
          'created',
          null,
          { status: initialStatus, category: category.name },
        );

        // Auto-create follow-up task if required
        if (incident.follow_up_required && initialStatus === 'active') {
          await db.behaviourTask.create({
            data: {
              tenant_id: tenantId,
              task_type: 'follow_up',
              entity_type: 'incident',
              entity_id: incident.id,
              title: `Follow up on ${category.name} incident ${incidentNumber}`,
              assigned_to_id: userId,
              created_by_id: userId,
              priority: 'medium',
              status: 'pending',
              due_date: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
        }

        // Queue side-effects; track if any enqueue fails (R-13)
        let automationFailed = false;

        // Queue parent notification if needed
        if (parentNotifStatus === 'pending' && initialStatus === 'active') {
          const ok = await this.sideEffects.emitParentNotification({
            tenant_id: tenantId,
            incident_id: incident.id,
            student_ids: dto.student_ids,
          });
          if (!ok) automationFailed = true;
        }

        // Queue policy evaluation
        if (initialStatus === 'active') {
          const ok = await this.sideEffects.emitPolicyEvaluation({
            tenant_id: tenantId,
            incident_id: incident.id,
            trigger: 'incident_created',
            triggered_at: new Date().toISOString(),
          });
          if (!ok) automationFailed = true;
        }

        // Queue auto-award check for positive incidents
        if (initialStatus === 'active' && category.polarity === 'positive') {
          const ok = await this.sideEffects.emitCheckAwards({
            tenant_id: tenantId,
            incident_id: incident.id,
            student_ids: dto.student_ids,
            academic_year_id: dto.academic_year_id,
            academic_period_id: dto.academic_period_id ?? null,
          });
          if (!ok) automationFailed = true;
        }

        // Persist automation_failed flag if any queue dispatch failed
        if (automationFailed) {
          await db.behaviourIncident.update({
            where: { id: incident.id },
            data: { automation_failed: true },
          });
        }

        return db.behaviourIncident.findUnique({
          where: { id: incident.id },
          include: {
            category: true,
            participants: true,
          },
        });
      },
      { timeout: 30000 },
    );
  }

  // ─── List Incidents ─────────────────────────────────────────────────────

  async listIncidents(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListIncidentsQuery,
  ) {
    const scopeCtx = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const scopeFilter = this.scopeService.buildScopeFilter({
      userId,
      ...scopeCtx,
    });

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      retention_status: 'active' as $Enums.RetentionStatus,
      ...scopeFilter,
    };

    // Tab filters
    if (query.tab === 'positive') where.polarity = 'positive';
    else if (query.tab === 'negative') where.polarity = 'negative';
    else if (query.tab === 'pending')
      where.status = {
        in: [
          'draft',
          'investigating',
          'under_review',
          'awaiting_approval',
          'awaiting_parent_meeting',
        ],
      };
    else if (query.tab === 'escalated') where.status = 'escalated';
    else if (query.tab === 'my') where.reported_by_id = userId;

    // Additional filters
    if (query.polarity) where.polarity = query.polarity;
    if (query.status) where.status = query.status;
    if (query.category_id) where.category_id = query.category_id;
    if (query.reported_by_id) where.reported_by_id = query.reported_by_id;
    if (query.academic_year_id) where.academic_year_id = query.academic_year_id;
    if (query.follow_up_required !== undefined) where.follow_up_required = query.follow_up_required;
    if (query.date_from || query.date_to) {
      const occurredAt: Record<string, Date> = {};
      if (query.date_from) occurredAt.gte = new Date(query.date_from);
      if (query.date_to) occurredAt.lte = new Date(query.date_to);
      where.occurred_at = occurredAt;
    }
    if (query.student_id) {
      where.participants = {
        some: {
          student_id: query.student_id,
          participant_type: 'student',
        },
      };
    }

    const orderBy = { [query.sort]: query.order };

    const [data, total] = await Promise.all([
      this.prisma.behaviourIncident.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              name_ar: true,
              polarity: true,
              severity: true,
              color: true,
              icon: true,
            },
          },
          reported_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          participants: {
            where: { participant_type: 'student' },
            include: {
              student: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
            take: 5,
          },
        },
      }),
      this.prisma.behaviourIncident.count({ where }),
    ]);

    // Project safeguarding status for users without safeguarding.view
    const hasSafeguardingView = permissions.includes('safeguarding.view');
    const projected = data.map((inc) => ({
      ...inc,
      status:
        inc.status === 'converted_to_safeguarding' && !hasSafeguardingView
          ? ('closed' as const)
          : inc.status,
    }));

    return {
      data: projected,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Single Incident ────────────────────────────────────────────────

  async getIncident(tenantId: string, id: string, userId: string, permissions: string[]) {
    const scopeCtx = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const scopeFilter = this.scopeService.buildScopeFilter({
      userId,
      ...scopeCtx,
    });

    const incident = await this.prisma.behaviourIncident.findFirst({
      where: { id, tenant_id: tenantId, ...scopeFilter },
      include: {
        category: true,
        reported_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        participants: {
          include: {
            student: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
            staff_profile: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
            parent: {
              select: {
                id: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException({
        code: 'INCIDENT_NOT_FOUND',
        message: 'Incident not found',
      });
    }

    // Apply data classification stripping
    const hasSafeguardingView = permissions.includes('safeguarding.view');
    const result = {
      ...incident,
      status:
        incident.status === 'converted_to_safeguarding' && !hasSafeguardingView
          ? ('closed' as const)
          : incident.status,
      context_notes: permissions.includes('behaviour.view_sensitive')
        ? incident.context_notes
        : undefined,
    };

    return result;
  }

  // ─── Update Incident ────────────────────────────────────────────────────

  async updateIncident(tenantId: string, id: string, userId: string, dto: UpdateIncidentDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.behaviourIncident.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found',
        });
      }

      // Diff previous vs new values
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(dto)) {
        if (
          value !== undefined &&
          (incident as unknown as Record<string, unknown>)[key] !== value
        ) {
          previousValues[key] = (incident as unknown as Record<string, unknown>)[key];
          newValues[key] = value;
        }
      }

      if (Object.keys(newValues).length === 0) return incident;

      // Check parent description lock
      if (dto.parent_description !== undefined && incident.parent_description_locked) {
        throw new ForbiddenException({
          code: 'PARENT_DESCRIPTION_LOCKED',
          message: 'Parent description is locked after notification was sent',
        });
      }

      const updated = await db.behaviourIncident.update({
        where: { id },
        data: {
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.parent_description !== undefined
            ? {
                parent_description: dto.parent_description,
                parent_description_set_by_id: userId,
                parent_description_set_at: new Date(),
              }
            : {}),
          ...(dto.parent_description_ar !== undefined
            ? { parent_description_ar: dto.parent_description_ar }
            : {}),
          ...(dto.context_notes !== undefined ? { context_notes: dto.context_notes } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.context_type !== undefined
            ? { context_type: toContextType(dto.context_type) }
            : {}),
          ...(dto.follow_up_required !== undefined
            ? { follow_up_required: dto.follow_up_required }
            : {}),
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'incident',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      return updated;
    });
  }

  // ─── My Incidents ───────────────────────────────────────────────────────

  async getMyIncidents(tenantId: string, userId: string, page: number, pageSize: number) {
    const where = {
      tenant_id: tenantId,
      reported_by_id: userId,
      retention_status: 'active' as $Enums.RetentionStatus,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourIncident.findMany({
        where,
        orderBy: { occurred_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              color: true,
              icon: true,
            },
          },
          participants: {
            where: { participant_type: 'student' },
            include: {
              student: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                },
              },
            },
            take: 3,
          },
        },
      }),
      this.prisma.behaviourIncident.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Feed (alias for listIncidents with defaults) ───────────────────────

  async getFeed(
    tenantId: string,
    userId: string,
    permissions: string[],
    page: number,
    pageSize: number,
  ) {
    return this.listIncidents(tenantId, userId, permissions, {
      page,
      pageSize,
      sort: 'occurred_at',
      order: 'desc',
    } as ListIncidentsQuery);
  }
}
