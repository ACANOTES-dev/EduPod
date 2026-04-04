import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { CreateParentDto, UpdateParentDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── Query filter type ────────────────────────────────────────────────────────

interface ParentQueryParams {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface ParentListItem {
  id: string;
  tenant_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_contact_channels: Prisma.JsonValue;
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface HouseholdParentRecord {
  household_id: string;
  parent_id: string;
  role_label: string | null;
  tenant_id: string;
  updated_at: Date;
  household: {
    id: string;
    household_name: string;
  };
}

export interface StudentParentRecord {
  student_id: string;
  parent_id: string;
  relationship_label: string | null;
  tenant_id: string;
  updated_at: Date;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    status: string;
  };
}

export interface ParentDetail extends ParentListItem {
  household_parents: HouseholdParentRecord[];
  student_parents: StudentParentRecord[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ParentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authReadFacade: AuthReadFacade,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateParentDto) {
    // Try to find matching user by email (platform-level table — no RLS)
    let userId: string | null = null;

    if (dto.email) {
      const user = await this.authReadFacade.findUserByEmail(tenantId, dto.email);
      if (user) {
        userId = user.id;
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      let parent: ParentListItem;

      try {
        parent = (await db.parent.create({
          data: {
            tenant_id: tenantId,
            user_id: userId,
            first_name: dto.first_name,
            last_name: dto.last_name,
            email: dto.email ?? null,
            phone: dto.phone ?? null,
            whatsapp_phone: dto.whatsapp_phone ?? null,
            preferred_contact_channels: dto.preferred_contact_channels,
            relationship_label: dto.relationship_label ?? null,
            is_primary_contact: dto.is_primary_contact ?? false,
            is_billing_contact: dto.is_billing_contact ?? false,
            status: 'active',
          },
        })) as ParentListItem;
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            error: {
              code: 'PARENT_EMAIL_EXISTS',
              message: 'A parent with this email already exists in this tenant',
            },
          });
        }
        throw err;
      }

      // If household_id provided, create household_parents link
      if (dto.household_id) {
        try {
          await db.householdParent.create({
            data: {
              tenant_id: tenantId,
              household_id: dto.household_id,
              parent_id: parent.id,
              role_label: dto.role_label ?? null,
            },
          });
        } catch (err: unknown) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            // Already linked — skip silently
          } else {
            throw err;
          }
        }
      }

      return parent;
    });
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ParentQueryParams) {
    const { page, pageSize, status, search } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ParentWhereInput = { tenant_id: tenantId };

    if (status) {
      where.status = status as 'active' | 'inactive';
    }

    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.parent.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
        }),
        db.parent.count({ where }),
      ]);
    })) as [ParentListItem[], number];

    const [data, total] = result;

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const parent = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.parent.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          household_parents: {
            include: {
              household: {
                select: {
                  id: true,
                  household_name: true,
                },
              },
            },
          },
          student_parents: {
            include: {
              student: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  student_number: true,
                  status: true,
                },
              },
            },
          },
        },
      });
    })) as ParentDetail | null;

    if (!parent) {
      throw new NotFoundException({
        error: {
          code: 'PARENT_NOT_FOUND',
          message: `Parent with id "${id}" not found`,
        },
      });
    }

    return parent;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateParentDto) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.parent.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent with id "${id}" not found`,
          },
        });
      }

      // Build update data — only include fields present in dto
      const updateData: Prisma.ParentUpdateInput = {};

      if (dto.first_name !== undefined) updateData.first_name = dto.first_name;
      if (dto.last_name !== undefined) updateData.last_name = dto.last_name;
      if (dto.email !== undefined) updateData.email = dto.email;
      if (dto.phone !== undefined) updateData.phone = dto.phone;
      if (dto.whatsapp_phone !== undefined) updateData.whatsapp_phone = dto.whatsapp_phone;
      if (dto.preferred_contact_channels !== undefined) {
        updateData.preferred_contact_channels = dto.preferred_contact_channels;
      }
      if (dto.relationship_label !== undefined) {
        updateData.relationship_label = dto.relationship_label;
      }
      if (dto.is_primary_contact !== undefined) {
        updateData.is_primary_contact = dto.is_primary_contact;
      }
      if (dto.is_billing_contact !== undefined) {
        updateData.is_billing_contact = dto.is_billing_contact;
      }

      try {
        return await db.parent.update({ where: { id }, data: updateData });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            error: {
              code: 'PARENT_EMAIL_EXISTS',
              message: 'A parent with this email already exists in this tenant',
            },
          });
        }
        throw err;
      }
    });
  }

  // ─── Student Links ────────────────────────────────────────────────────────

  async linkStudent(
    tenantId: string,
    parentId: string,
    studentId: string,
    relationshipLabel?: string,
  ) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const parent = await db.parent.findFirst({
        where: { id: parentId, tenant_id: tenantId },
      });

      if (!parent) {
        throw new NotFoundException({
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent with id "${parentId}" not found`,
          },
        });
      }

      const student = await db.student.findFirst({
        where: { id: studentId, tenant_id: tenantId },
      });

      if (!student) {
        throw new NotFoundException({
          error: {
            code: 'STUDENT_NOT_FOUND',
            message: `Student with id "${studentId}" not found`,
          },
        });
      }

      try {
        return await db.studentParent.create({
          data: {
            tenant_id: tenantId,
            student_id: studentId,
            parent_id: parentId,
            relationship_label: relationshipLabel ?? null,
          },
        });
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            error: {
              code: 'STUDENT_ALREADY_LINKED',
              message: 'This student is already linked to this parent',
            },
          });
        }
        throw err;
      }
    });
  }

  async unlinkStudent(tenantId: string, parentId: string, studentId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const link = await db.studentParent.findUnique({
        where: {
          student_id_parent_id: {
            student_id: studentId,
            parent_id: parentId,
          },
        },
      });

      if (!link) {
        throw new NotFoundException({
          error: {
            code: 'STUDENT_PARENT_LINK_NOT_FOUND',
            message: 'This student is not linked to this parent',
          },
        });
      }

      await db.studentParent.delete({
        where: {
          student_id_parent_id: {
            student_id: studentId,
            parent_id: parentId,
          },
        },
      });
    });
  }
}
