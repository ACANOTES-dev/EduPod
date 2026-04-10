import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { ConvertApplicationDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationConversionService {
  private readonly logger = new Logger(ApplicationConversionService.name);
  private static readonly CONVERSION_NOTE_PREFIX = 'Converted to student:';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

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

      const existingConversion = await db.applicationNote.findFirst({
        where: {
          application_id: id,
          is_internal: true,
          note: { startsWith: ApplicationConversionService.CONVERSION_NOTE_PREFIX },
          tenant_id: tenantId,
        },
        select: { id: true },
      });

      if (existingConversion) {
        throw new BadRequestException({
          error: {
            code: 'ALREADY_CONVERTED',
            message: 'This application has already been converted to a student',
          },
        });
      }

      if (application.status !== 'approved') {
        throw new BadRequestException({
          error: {
            code: 'NOT_APPROVED',
            message: 'Only approved applications can be converted to students',
          },
        });
      }

      // Extract parent email from payload for matching
      const payload = application.payload_json as Record<string, unknown>;
      const parentEmail =
        (payload.parent_email as string) ?? application.submitted_by?.email ?? null;

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
          updated_at: application.updated_at,
        },
        submitted_by_parent: application.submitted_by,
        matching_parents: matchingParents,
        year_groups: yearGroups,
      };
    });
  }

  // ─── Convert ──────────────────────────────────────────────────────────────

  async convert(tenantId: string, id: string, dto: ConvertApplicationDto, userId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    let result: {
      application_id: string;
      student: {
        id: string;
        first_name: string;
        last_name: string;
        full_name: string | null;
        student_number: string | null;
        status: string;
      };
      household: { id: string; household_name: string };
      parent1_id: string;
      parent2_id: string | null;
    };

    try {
      result = (await prismaWithRls.$transaction(async (tx) => {
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

        const existingConversion = await db.applicationNote.findFirst({
          where: {
            application_id: id,
            is_internal: true,
            note: { startsWith: ApplicationConversionService.CONVERSION_NOTE_PREFIX },
            tenant_id: tenantId,
          },
          select: { id: true },
        });

        if (existingConversion) {
          throw new BadRequestException({
            error: {
              code: 'ALREADY_CONVERTED',
              message: 'This application has already been converted to a student',
            },
          });
        }

        if (application.status !== 'approved') {
          throw new BadRequestException({
            error: {
              code: 'NOT_APPROVED',
              message: 'Only approved applications can be converted to students',
            },
          });
        }

        if (application.updated_at.toISOString() !== dto.expected_updated_at) {
          throw new BadRequestException({
            error: {
              code: 'CONCURRENT_MODIFICATION',
              message: 'The application has been modified. Please reload and try again.',
            },
          });
        }

        // The stale updated_at check above protects callers from overwriting
        // a newer application state. A partial unique index on conversion
        // notes ensures only one conversion can commit per application.

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

        let parent1Id: string;

        if (dto.parent1_link_existing_id) {
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

        const householdName = dto.household_name ?? `${dto.student_last_name} Family`;
        const householdNumber = await this.sequenceService.generateHouseholdReference(tenantId, db);

        const household = await db.household.create({
          data: {
            tenant_id: tenantId,
            household_name: householdName,
            household_number: householdNumber,
            primary_billing_parent_id: parent1Id,
            status: 'active',
            needs_completion: true,
          },
        });

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

        const student = await db.student.create({
          data: {
            tenant_id: tenantId,
            household_id: household.id,
            first_name: dto.student_first_name,
            last_name: dto.student_last_name,
            date_of_birth: new Date(dto.date_of_birth),
            national_id: dto.national_id ?? null,
            nationality: dto.nationality ?? null,
            status: 'active',
            year_group_id: dto.year_group_id,
            entry_date: new Date(),
          },
        });

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

        await db.applicationNote.create({
          data: {
            tenant_id: tenantId,
            application_id: id,
            author_user_id: userId,
            note: `${ApplicationConversionService.CONVERSION_NOTE_PREFIX} ${student.first_name} ${student.last_name} (ID: ${student.id}). Household: ${household.household_name} (ID: ${household.id}).`,
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
      })) as typeof result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const committedConversion = await this.prisma.applicationNote.findFirst({
          where: {
            application_id: id,
            is_internal: true,
            note: { startsWith: ApplicationConversionService.CONVERSION_NOTE_PREFIX },
            tenant_id: tenantId,
          },
          select: { id: true },
        });

        if (committedConversion) {
          throw new BadRequestException({
            error: {
              code: 'ALREADY_CONVERTED',
              message: 'This application has already been converted to a student',
            },
          });
        }
      }

      throw error;
    }

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
      this.logger.warn(
        `Search indexing failed for student: ${indexError instanceof Error ? indexError.message : String(indexError)}`,
      );
    }

    return result;
  }
}
