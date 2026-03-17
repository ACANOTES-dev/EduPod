import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdmissionsAnalyticsQuery,
  ConvertApplicationDto,
  CreatePublicApplicationDto,
  ListApplicationsQuery,
  ReviewApplicationDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../tenants/sequence.service';

import { AdmissionsRateLimitService } from './admissions-rate-limit.service';

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
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly rateLimitService: AdmissionsRateLimitService,
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  // ─── Create Public ────────────────────────────────────────────────────────

  async createPublic(
    tenantId: string,
    dto: CreatePublicApplicationDto,
    ip: string,
  ) {
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
    const rateLimit = await this.rateLimitService.checkAndIncrement(
      tenantId,
      ip,
    );
    if (!rateLimit.allowed) {
      throw new BadRequestException({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message:
            'Too many submissions. Please try again later.',
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
      this.validatePayloadAgainstFields(
        dto.payload_json as Record<string, unknown>,
        form.fields,
      );

      // Generate application number
      const applicationNumber = await this.sequenceService.nextNumber(
        tenantId,
        'application',
        tx,
      );

      const application = await db.application.create({
        data: {
          tenant_id: tenantId,
          form_definition_id: dto.form_definition_id,
          application_number: applicationNumber,
          student_first_name: dto.student_first_name,
          student_last_name: dto.student_last_name,
          date_of_birth: dto.date_of_birth ? new Date(dto.date_of_birth) : null,
          status: 'draft',
          payload_json: dto.payload_json as Prisma.InputJsonValue,
        },
      });

      return {
        id: application.id,
        application_number: application.application_number,
        status: application.status,
      };
    });
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async submit(tenantId: string, applicationId: string, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id: applicationId, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${applicationId}" not found`,
          },
        });
      }

      if (application.status !== 'draft') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot submit an application with status "${application.status}". Only draft applications can be submitted.`,
          },
        });
      }

      // Link to parent user — find parent record for this user
      const parent = await db.parent.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
        },
      });

      const parentId = parent?.id ?? null;

      // Check for potential duplicates (same name + DOB within this tenant)
      if (application.date_of_birth) {
        const duplicates = await db.application.findMany({
          where: {
            tenant_id: tenantId,
            id: { not: applicationId },
            student_first_name: {
              equals: application.student_first_name,
              mode: 'insensitive',
            },
            student_last_name: {
              equals: application.student_last_name,
              mode: 'insensitive',
            },
            date_of_birth: application.date_of_birth,
            status: {
              notIn: ['withdrawn', 'rejected'],
            },
          },
        });

        if (duplicates.length > 0) {
          // Flag as potential duplicate but still allow submission
          await db.applicationNote.create({
            data: {
              tenant_id: tenantId,
              application_id: applicationId,
              author_user_id: userId,
              note: `Potential duplicate detected: ${duplicates.length} existing application(s) with same name and date of birth (${duplicates.map((d) => d.application_number).join(', ')}).`,
              is_internal: true,
            },
          });
        }
      }

      const updated = await db.application.update({
        where: { id: applicationId },
        data: {
          status: 'submitted',
          submitted_at: new Date(),
          submitted_by_parent_id: parentId,
        },
      });

      return updated;
    })) as { id: string; application_number: string; student_first_name: string; student_last_name: string; status: string };

    // Enqueue search index after transaction
    try {
      await this.searchIndexService.indexEntity('applications', {
        id: result.id,
        tenant_id: tenantId,
        application_number: result.application_number,
        student_first_name: result.student_first_name,
        student_last_name: result.student_last_name,
        status: result.status,
      });
    } catch (indexError) {
      this.logger.warn(`Search indexing failed for application: ${indexError instanceof Error ? indexError.message : String(indexError)}`);
    }

    return result;
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
          value: application.submitted_at
            ? application.submitted_at.toISOString()
            : 'Not yet',
        },
        {
          label: 'Created',
          value: application.created_at.toISOString(),
        },
      ],
    };
  }

  // ─── Review ───────────────────────────────────────────────────────────────

  async review(
    tenantId: string,
    id: string,
    dto: ReviewApplicationDto,
    userId: string,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      // Optimistic concurrency check
      if (application.updated_at.toISOString() !== dto.expected_updated_at) {
        throw new BadRequestException({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message:
              'The application has been modified by another user. Please reload and try again.',
          },
        });
      }

      // Validate status transitions
      const validTransitions: Record<string, string[]> = {
        submitted: ['under_review', 'rejected'],
        under_review: [
          'pending_acceptance_approval',
          'rejected',
        ],
        pending_acceptance_approval: ['rejected'],
      };

      const allowedTargets = validTransitions[application.status];
      if (!allowedTargets || !allowedTargets.includes(dto.status)) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from "${application.status}" to "${dto.status}"`,
          },
        });
      }

      // For acceptance flow, check if approval is required
      if (dto.status === 'pending_acceptance_approval') {
        // Read tenant settings to check approval requirement
        const tenantSettings = await db.tenantSetting.findFirst({
          where: { tenant_id: tenantId },
        });

        const settings = (tenantSettings?.settings ?? {}) as Record<
          string,
          Record<string, unknown>
        >;
        const requireApproval =
          settings.admissions?.requireApprovalForAcceptance !== false;

        if (requireApproval) {
          // Check with the approval system
          // We pass hasDirectAuthority = false; school_owner bypasses are handled
          // by the approval workflow check itself
          const approvalResult =
            await this.approvalRequestsService.checkAndCreateIfNeeded(
              tenantId,
              'application_accept',
              'application',
              id,
              userId,
              false, // hasDirectAuthority
            );

          if (!approvalResult.approved) {
            // Update status to pending_acceptance_approval
            const updated = await db.application.update({
              where: { id },
              data: {
                status: 'pending_acceptance_approval',
                reviewed_at: new Date(),
                reviewed_by_user_id: userId,
              },
            });

            return {
              ...updated,
              approval_request_id: approvalResult.request_id,
              approval_required: true,
            };
          }
        }

        // If no approval needed or auto-approved, accept directly
        const updated = await db.application.update({
          where: { id },
          data: {
            status: 'accepted',
            reviewed_at: new Date(),
            reviewed_by_user_id: userId,
          },
        });

        return updated;
      }

      // Standard status update (under_review, rejected)
      const updated = await db.application.update({
        where: { id },
        data: {
          status: dto.status,
          reviewed_at: new Date(),
          reviewed_by_user_id: userId,
        },
      });

      return updated;
    });
  }

  // ─── Withdraw ─────────────────────────────────────────────────────────────

  async withdraw(
    tenantId: string,
    id: string,
    userId: string,
    isParent: boolean,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      // Parents can only withdraw their own applications
      if (isParent) {
        const parent = await db.parent.findFirst({
          where: { tenant_id: tenantId, user_id: userId },
        });

        if (
          !parent ||
          application.submitted_by_parent_id !== parent.id
        ) {
          throw new BadRequestException({
            error: {
              code: 'NOT_OWNER',
              message: 'You can only withdraw your own applications',
            },
          });
        }
      }

      // Can only withdraw from certain statuses
      const withdrawableStatuses = [
        'draft',
        'submitted',
        'under_review',
        'pending_acceptance_approval',
      ];

      if (!withdrawableStatuses.includes(application.status)) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot withdraw an application with status "${application.status}"`,
          },
        });
      }

      return db.application.update({
        where: { id },
        data: {
          status: 'withdrawn',
          reviewed_at: new Date(),
          reviewed_by_user_id: userId,
        },
      });
    });
  }

  // ─── Conversion Preview ───────────────────────────────────────────────────

  async getConversionPreview(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          submitted_by: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      if (application.status !== 'accepted') {
        throw new BadRequestException({
          error: {
            code: 'NOT_ACCEPTED',
            message:
              'Only accepted applications can be converted to students',
          },
        });
      }

      // Extract parent email from payload for matching
      const payload = application.payload_json as Record<string, unknown>;
      const parentEmail =
        (payload.parent_email as string) ??
        application.submitted_by?.email ??
        null;

      // Try to match existing parents by email
      let matchingParents: Array<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        user_id: string | null;
      }> = [];

      if (parentEmail) {
        matchingParents = await db.parent.findMany({
          where: {
            tenant_id: tenantId,
            email: parentEmail,
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
            user_id: true,
          },
        });
      }

      // Get year groups for the conversion form
      const yearGroups = await db.yearGroup.findMany({
        where: { tenant_id: tenantId },
        orderBy: { display_order: 'asc' },
        select: {
          id: true,
          name: true,
          display_order: true,
        },
      });

      return {
        application: {
          id: application.id,
          application_number: application.application_number,
          student_first_name: application.student_first_name,
          student_last_name: application.student_last_name,
          date_of_birth: application.date_of_birth,
          payload_json: application.payload_json,
        },
        submitted_by_parent: application.submitted_by,
        matching_parents: matchingParents,
        year_groups: yearGroups,
      };
    });
  }

  // ─── Convert ──────────────────────────────────────────────────────────────

  async convert(
    tenantId: string,
    id: string,
    dto: ConvertApplicationDto,
    userId: string,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const application = await db.application.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!application) {
        throw new NotFoundException({
          error: {
            code: 'APPLICATION_NOT_FOUND',
            message: `Application with id "${id}" not found`,
          },
        });
      }

      // Check for double-conversion by looking for an existing conversion note
      const existingConversionNote = await db.applicationNote.findFirst({
        where: {
          application_id: id,
          tenant_id: tenantId,
          is_internal: true,
          note: { startsWith: 'Converted to student:' },
        },
      });
      if (existingConversionNote) {
        throw new BadRequestException({
          error: {
            code: 'ALREADY_CONVERTED',
            message: 'This application has already been converted',
          },
        });
      }

      if (application.status !== 'accepted') {
        throw new BadRequestException({
          error: {
            code: 'NOT_ACCEPTED',
            message:
              'Only accepted applications can be converted to students',
          },
        });
      }

      // Optimistic concurrency check
      if (application.updated_at.toISOString() !== dto.expected_updated_at) {
        throw new BadRequestException({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message:
              'The application has been modified. Please reload and try again.',
          },
        });
      }

      // Verify year group exists
      const yearGroup = await db.yearGroup.findFirst({
        where: { id: dto.year_group_id, tenant_id: tenantId },
      });

      if (!yearGroup) {
        throw new NotFoundException({
          error: {
            code: 'YEAR_GROUP_NOT_FOUND',
            message: `Year group with id "${dto.year_group_id}" not found`,
          },
        });
      }

      // 1. Create or link parent 1
      let parent1Id: string;

      if (dto.parent1_link_existing_id) {
        // Verify existing parent belongs to this tenant
        const existingParent = await db.parent.findFirst({
          where: { id: dto.parent1_link_existing_id, tenant_id: tenantId },
        });

        if (!existingParent) {
          throw new NotFoundException({
            error: {
              code: 'PARENT_NOT_FOUND',
              message: `Parent with id "${dto.parent1_link_existing_id}" not found`,
            },
          });
        }

        parent1Id = existingParent.id;
      } else {
        const newParent = await db.parent.create({
          data: {
            tenant_id: tenantId,
            first_name: dto.parent1_first_name,
            last_name: dto.parent1_last_name,
            email: dto.parent1_email ?? null,
            phone: dto.parent1_phone ?? null,
            preferred_contact_channels: ['email'],
            is_primary_contact: true,
            is_billing_contact: true,
            status: 'active',
          },
        });
        parent1Id = newParent.id;
      }

      // 2. Create or link parent 2 (optional)
      let parent2Id: string | null = null;

      if (dto.parent2_link_existing_id) {
        const existingParent2 = await db.parent.findFirst({
          where: { id: dto.parent2_link_existing_id, tenant_id: tenantId },
        });

        if (!existingParent2) {
          throw new NotFoundException({
            error: {
              code: 'PARENT_NOT_FOUND',
              message: `Parent with id "${dto.parent2_link_existing_id}" not found`,
            },
          });
        }

        parent2Id = existingParent2.id;
      } else if (dto.parent2_first_name && dto.parent2_last_name) {
        const newParent2 = await db.parent.create({
          data: {
            tenant_id: tenantId,
            first_name: dto.parent2_first_name,
            last_name: dto.parent2_last_name,
            email: dto.parent2_email ?? null,
            preferred_contact_channels: ['email'],
            is_primary_contact: false,
            is_billing_contact: false,
            status: 'active',
          },
        });
        parent2Id = newParent2.id;
      }

      // 3. Create household
      const householdName =
        dto.household_name ??
        `${dto.student_last_name} Family`;

      const household = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: householdName,
          primary_billing_parent_id: parent1Id,
          status: 'active',
          needs_completion: true,
        },
      });

      // Link parents to household
      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          parent_id: parent1Id,
        },
      });

      if (parent2Id) {
        await db.householdParent.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            parent_id: parent2Id,
          },
        });
      }

      // 4. Create student (full_name is a generated column — do not set it)
      const student = await db.student.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          first_name: dto.student_first_name,
          last_name: dto.student_last_name,
          date_of_birth: new Date(dto.date_of_birth),
          status: 'active',
          year_group_id: dto.year_group_id,
          entry_date: new Date(),
        },
      });

      // 5. Create student-parent junctions
      await db.studentParent.create({
        data: {
          tenant_id: tenantId,
          student_id: student.id,
          parent_id: parent1Id,
        },
      });

      if (parent2Id) {
        await db.studentParent.create({
          data: {
            tenant_id: tenantId,
            student_id: student.id,
            parent_id: parent2Id,
          },
        });
      }

      // 6. Record conversion via internal note (idempotency guard checks for this)
      await db.applicationNote.create({
        data: {
          tenant_id: tenantId,
          application_id: id,
          author_user_id: userId,
          note: `Converted to student: ${student.first_name} ${student.last_name} (ID: ${student.id}). Household: ${household.household_name} (ID: ${household.id}).`,
          is_internal: true,
        },
      });

      return {
        application_id: id,
        student,
        household,
        parent1_id: parent1Id,
        parent2_id: parent2Id,
      };
    }) as {
      application_id: string;
      student: { id: string; first_name: string; last_name: string; full_name: string | null; student_number: string | null; status: string };
      household: { id: string; household_name: string };
      parent1_id: string;
      parent2_id: string | null;
    };

    // Enqueue search indexing after transaction
    try {
      await this.searchIndexService.indexEntity('students', {
        id: result.student.id,
        tenant_id: tenantId,
        first_name: result.student.first_name,
        last_name: result.student.last_name,
        full_name: result.student.full_name,
        student_number: result.student.student_number,
        status: result.student.status,
      });
    } catch (indexError) {
      this.logger.warn(`Search indexing failed for student: ${indexError instanceof Error ? indexError.message : String(indexError)}`);
    }

    return result;
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
          (where.created_at as Prisma.DateTimeFilter).gte = new Date(
            query.date_from,
          );
        }
        if (query.date_to) {
          (where.created_at as Prisma.DateTimeFilter).lte = new Date(
            query.date_to,
          );
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
      const conversionRate =
        total > 0 ? Number(((accepted / total) * 100).toFixed(1)) : 0;

      // Average days to decision (from submitted_at to reviewed_at)
      const rawTx = tx as unknown as {
        $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      };

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
