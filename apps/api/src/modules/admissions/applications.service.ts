import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  AdmissionsAnalyticsQuery,
  CreatePublicApplicationDto,
  ListApplicationsQuery,
  ReviewApplicationDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationStateMachineService } from './application-state-machine.service';

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface ApplicationListItem {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  status: string;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  form_definition: { id: string; name: string; version_number: number };
  submitted_by: { id: string; first_name: string; last_name: string } | null;
  _count: { notes: number };
}

export interface ApplicationDetail {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  application_number: string;
  submitted_by_parent_id: string | null;
  student_first_name: string;
  student_last_name: string;
  date_of_birth: Date | null;
  status: string;
  submitted_at: Date | null;
  reviewed_at: Date | null;
  reviewed_by_user_id: string | null;
  payload_json: Prisma.JsonValue;
  created_at: Date;
  updated_at: Date;
  form_definition: {
    id: string;
    name: string;
    version_number: number;
    fields: Array<{
      id: string;
      field_key: string;
      label: string;
      field_type: string;
      required: boolean;
      options_json: Prisma.JsonValue;
      display_order: number;
    }>;
  };
  submitted_by: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  reviewed_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  notes: Array<{
    id: string;
    note: string;
    is_internal: boolean;
    created_at: Date;
    author: { id: string; first_name: string; last_name: string };
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimitService: AdmissionsRateLimitService,
    private readonly stateMachineService: ApplicationStateMachineService,
  ) {}

  // ─── Delegated: State Machine ─────────────────────────────────────────────

  /**
   * Admin review endpoint dispatcher: maps the legacy `{ status }` DTO shape
   * onto the granular new state-machine methods so the `/review` route keeps
   * working while the state graph (impl 03 of the admissions rebuild) enforces
   * the new transitions.
   */
  async review(tenantId: string, id: string, dto: ReviewApplicationDto, userId: string) {
    switch (dto.status) {
      case 'ready_to_admit':
        // ready_to_admit is now a gated entry state only — it is not a target
        // an admin can flip into. Promotion back to ready_to_admit is handled
        // by the auto-promotion service (impl 09).
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message:
              '"ready_to_admit" is not an admin-actionable target; the state machine routes applications into it automatically.',
          },
        });
      case 'conditional_approval':
        return this.stateMachineService.moveToConditionalApproval(tenantId, id, userId);
      case 'approved':
        // Direct approval without a payment event is not permitted in the
        // new flow — use the cash / bank transfer / override endpoints in
        // impl 07 instead.
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message:
              '"approved" cannot be set directly — record a payment or an admin override (impl 07).',
          },
        });
      case 'rejected':
        return this.stateMachineService.reject(tenantId, id, {
          reason: dto.rejection_reason ?? '',
          actingUserId: userId,
        });
      default: {
        // Exhaustiveness guard — ReviewApplicationDto.status only allows the
        // four branches above, so this is unreachable unless the schema grows.
        const exhaustive: never = dto.status;
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Unsupported review target: ${String(exhaustive)}`,
          },
        });
      }
    }
  }

  async withdraw(tenantId: string, id: string, userId: string, isParent: boolean) {
    return this.stateMachineService.withdraw(tenantId, id, {
      actingUserId: userId,
      isParent,
    });
  }

  // ─── Create Public ────────────────────────────────────────────────────────

  async createPublic(tenantId: string, dto: CreatePublicApplicationDto, ip: string) {
    // Honeypot check — if website_url is filled, it's a bot
    if (dto.website_url) {
      // Silently accept but don't create — prevents bots from knowing they were caught
      return {
        id: 'ignored',
        application_number: 'ignored',
        status: 'submitted',
      };
    }

    // Rate limit check
    const rateLimit = await this.rateLimitService.checkAndIncrement(tenantId, ip);
    if (!rateLimit.allowed) {
      throw new BadRequestException({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many submissions. Please try again later.',
        },
      });
    }

    // Validate form is published and the payload satisfies its required
    // fields. A small read-only RLS transaction lets us surface FORM_NOT_FOUND
    // and VALIDATION_ERROR before the state machine opens its own write
    // transaction.
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const form = await db.admissionFormDefinition.findFirst({
        where: {
          id: dto.form_definition_id,
          tenant_id: tenantId,
          status: 'published',
        },
        include: {
          fields: { where: { active: true }, orderBy: { display_order: 'asc' } },
        },
      });

      if (!form) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: 'The admission form is not available',
          },
        });
      }

      this.validatePayloadAgainstFields(dto.payload_json as Record<string, unknown>, form.fields);
    });

    const application = await this.stateMachineService.submit(tenantId, {
      formDefinitionId: dto.form_definition_id,
      studentFirstName: dto.student_first_name,
      studentLastName: dto.student_last_name,
      dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
      targetAcademicYearId: dto.target_academic_year_id,
      targetYearGroupId: dto.target_year_group_id,
      payloadJson: {
        ...(dto.payload_json as Record<string, unknown>),
        __consents: dto.consents,
      },
      submittedByParentId: null,
    });

    return {
      id: application.id,
      application_number: application.application_number,
      status: application.status,
    };
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListApplicationsQuery) {
    const { page, pageSize, status, form_definition_id, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ApplicationWhereInput = { tenant_id: tenantId };

    if (status) {
      where.status = status;
    }

    if (form_definition_id) {
      where.form_definition_id = form_definition_id;
    }

    if (search) {
      where.OR = [
        {
          student_first_name: { contains: search, mode: 'insensitive' },
        },
        {
          student_last_name: { contains: search, mode: 'insensitive' },
        },
        {
          application_number: { contains: search, mode: 'insensitive' },
        },
      ];
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.application.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            form_definition: {
              select: { id: true, name: true, version_number: true },
            },
            submitted_by: {
              select: { id: true, first_name: true, last_name: true },
            },
            _count: { select: { notes: true } },
          },
        }),
        db.application.count({ where }),
      ]);
    })) as [ApplicationListItem[], number];

    const [data, total] = result;

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const application = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.application.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          form_definition: {
            include: {
              fields: {
                orderBy: { display_order: 'asc' },
                select: {
                  id: true,
                  field_key: true,
                  label: true,
                  field_type: true,
                  required: true,
                  options_json: true,
                  display_order: true,
                },
              },
            },
          },
          submitted_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
            },
          },
          reviewed_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          notes: {
            orderBy: { created_at: 'desc' },
            include: {
              author: {
                select: { id: true, first_name: true, last_name: true },
              },
            },
          },
        },
      });
    })) as ApplicationDetail | null;

    if (!application) {
      throw new NotFoundException({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: `Application with id "${id}" not found`,
        },
      });
    }

    return application;
  }

  // ─── Preview ──────────────────────────────────────────────────────────────

  async preview(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const application = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.application.findFirst({
        where: { id, tenant_id: tenantId },
        select: {
          id: true,
          application_number: true,
          student_first_name: true,
          student_last_name: true,
          status: true,
          submitted_at: true,
          created_at: true,
          form_definition: {
            select: { name: true },
          },
        },
      });
    })) as {
      id: string;
      application_number: string;
      student_first_name: string;
      student_last_name: string;
      status: string;
      submitted_at: Date | null;
      created_at: Date;
      form_definition: { name: string };
    } | null;

    if (!application) {
      throw new NotFoundException({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: `Application with id "${id}" not found`,
        },
      });
    }

    return {
      id: application.id,
      entity_type: 'application',
      primary_label: `${application.student_first_name} ${application.student_last_name}`,
      secondary_label: application.application_number,
      status: application.status,
      facts: [
        { label: 'Form', value: application.form_definition.name },
        {
          label: 'Submitted',
          value: application.submitted_at ? application.submitted_at.toISOString() : 'Not yet',
        },
        {
          label: 'Created',
          value: application.created_at.toISOString(),
        },
      ],
    };
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  async getAnalytics(tenantId: string, query: AdmissionsAnalyticsQuery) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Prisma.ApplicationWhereInput = { tenant_id: tenantId };

      if (query.form_definition_id) {
        where.form_definition_id = query.form_definition_id;
      }

      if (query.date_from || query.date_to) {
        where.created_at = {};
        if (query.date_from) {
          (where.created_at as Prisma.DateTimeFilter).gte = new Date(query.date_from);
        }
        if (query.date_to) {
          (where.created_at as Prisma.DateTimeFilter).lte = new Date(query.date_to);
        }
      }

      // Funnel counts by status
      const statusCounts = await Promise.all([
        db.application.count({ where: { ...where, status: 'submitted' } }),
        db.application.count({ where: { ...where, status: 'waiting_list' } }),
        db.application.count({ where: { ...where, status: 'ready_to_admit' } }),
        db.application.count({ where: { ...where, status: 'conditional_approval' } }),
        db.application.count({ where: { ...where, status: 'approved' } }),
        db.application.count({ where: { ...where, status: 'rejected' } }),
        db.application.count({ where: { ...where, status: 'withdrawn' } }),
      ]);

      const total = statusCounts.reduce((sum, c) => sum + c, 0);
      const approved = statusCounts[4];
      const conversionRate = total > 0 ? Number(((approved / total) * 100).toFixed(1)) : 0;

      // Average days to decision (from submitted_at to reviewed_at)
      const rawTx = tx as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      };

      // eslint-disable-next-line school/no-raw-sql-outside-rls -- aggregate query within RLS transaction
      const avgDaysResult = (await rawTx.$queryRaw(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM (reviewed_at - submitted_at)) / 86400) as avg_days
          FROM applications
          WHERE tenant_id = ${tenantId}::uuid
            AND reviewed_at IS NOT NULL
            AND submitted_at IS NOT NULL
        `,
      )) as Array<{ avg_days: number | null }>;

      const avgDaysToDecision = avgDaysResult[0]?.avg_days
        ? Number(Number(avgDaysResult[0].avg_days).toFixed(1))
        : null;

      return {
        funnel: {
          submitted: statusCounts[0],
          waiting_list: statusCounts[1],
          ready_to_admit: statusCounts[2],
          conditional_approval: statusCounts[3],
          approved: statusCounts[4],
          rejected: statusCounts[5],
          withdrawn: statusCounts[6],
        },
        total,
        conversion_rate: conversionRate,
        avg_days_to_decision: avgDaysToDecision,
      };
    });
  }

  // ─── Find By Parent ───────────────────────────────────────────────────────

  async findByParent(tenantId: string, parentUserId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Find the parent record for this user
      const parent = await db.parent.findFirst({
        where: { tenant_id: tenantId, user_id: parentUserId },
      });

      if (!parent) {
        return [];
      }

      return db.application.findMany({
        where: {
          tenant_id: tenantId,
          submitted_by_parent_id: parent.id,
        },
        orderBy: { created_at: 'desc' },
        include: {
          form_definition: {
            select: { id: true, name: true, version_number: true },
          },
        },
      });
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private validatePayloadAgainstFields(
    payload: Record<string, unknown>,
    fields: Array<{
      field_key: string;
      required: boolean;
      field_type: string;
      visible_to_parent: boolean;
    }>,
  ): void {
    const errors: Array<{ field: string; message: string }> = [];

    for (const field of fields) {
      if (!field.visible_to_parent) continue;

      const value = payload[field.field_key];

      if (field.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: field.field_key,
          message: `${field.field_key} is required`,
        });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Application payload validation failed',
          details: { errors },
        },
      });
    }
  }
}
