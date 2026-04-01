import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  AdmissionsAnalyticsQuery,
  ConvertApplicationDto,
  CreatePublicApplicationDto,
  ListApplicationsQuery,
  ReviewApplicationDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';
import { ApplicationConversionService } from './application-conversion.service';
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
    private readonly sequenceService: SequenceService,
    private readonly rateLimitService: AdmissionsRateLimitService,
    private readonly stateMachineService: ApplicationStateMachineService,
    private readonly conversionService: ApplicationConversionService,
  ) {}

  // ─── Delegated: State Machine ─────────────────────────────────────────────

  async submit(tenantId: string, applicationId: string, userId: string) {
    return this.stateMachineService.submit(tenantId, applicationId, userId);
  }

  async review(tenantId: string, id: string, dto: ReviewApplicationDto, userId: string) {
    return this.stateMachineService.review(tenantId, id, dto, userId);
  }

  async withdraw(tenantId: string, id: string, userId: string, isParent: boolean) {
    return this.stateMachineService.withdraw(tenantId, id, userId, isParent);
  }

  // ─── Delegated: Conversion ────────────────────────────────────────────────

  async getConversionPreview(tenantId: string, id: string) {
    return this.conversionService.getConversionPreview(tenantId, id);
  }

  async convert(tenantId: string, id: string, dto: ConvertApplicationDto, userId: string) {
    return this.conversionService.convert(tenantId, id, dto, userId);
  }

  // ─── Create Public ────────────────────────────────────────────────────────

  async createPublic(tenantId: string, dto: CreatePublicApplicationDto, ip: string) {
    // Honeypot check — if website_url is filled, it's a bot
    if (dto.website_url) {
      // Silently accept but don't create — prevents bots from knowing they were caught
      return {
        id: 'ignored',
        application_number: 'ignored',
        status: 'draft',
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

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate form exists and is published
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

      // Validate payload against form fields
      this.validatePayloadAgainstFields(dto.payload_json as Record<string, unknown>, form.fields);

      // Generate application number
      const applicationNumber = await this.sequenceService.nextNumber(tenantId, 'application', tx);

      const application = await db.application.create({
        data: {
          tenant_id: tenantId,
          form_definition_id: dto.form_definition_id,
          application_number: applicationNumber,
          student_first_name: dto.student_first_name,
          student_last_name: dto.student_last_name,
          date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          status: 'draft',
          payload_json: {
            ...(dto.payload_json as Record<string, unknown>),
            __consents: dto.consents,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        id: application.id,
        application_number: application.application_number,
        status: application.status,
      };
    });
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
        db.application.count({ where: { ...where, status: 'draft' } }),
        db.application.count({ where: { ...where, status: 'submitted' } }),
        db.application.count({ where: { ...where, status: 'under_review' } }),
        db.application.count({
          where: { ...where, status: 'pending_acceptance_approval' },
        }),
        db.application.count({ where: { ...where, status: 'accepted' } }),
        db.application.count({ where: { ...where, status: 'rejected' } }),
        db.application.count({ where: { ...where, status: 'withdrawn' } }),
      ]);

      const total = statusCounts.reduce((sum, c) => sum + c, 0);
      const accepted = statusCounts[4];
      const conversionRate = total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 0;

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
          draft: statusCounts[0],
          submitted: statusCounts[1],
          under_review: statusCounts[2],
          pending_acceptance_approval: statusCounts[3],
          accepted: statusCounts[4],
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
