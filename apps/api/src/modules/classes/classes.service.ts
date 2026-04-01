import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import type { PreviewResponse } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { SchedulesService as SchedulesServiceType } from '../schedules/schedules.service';

import type { AssignClassStaffDto } from './dto/assign-class-staff.dto';
import type { CreateClassDto } from './dto/create-class.dto';
import type { UpdateClassDto, UpdateClassStatusDto } from './dto/update-class.dto';

interface ListClassesParams {
  page: number;
  pageSize: number;
  academic_year_id?: string;
  year_group_id?: string;
  status?: string;
  search?: string;
  /** When true (default), only return homeroom classes (subject_id IS NULL) */
  homeroom_only?: boolean;
}

@Injectable()
export class ClassesService {
  private schedulesService?: SchedulesServiceType;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Injected lazily to avoid circular dependency */
  setSchedulesService(service: SchedulesServiceType) {
    this.schedulesService = service;
  }

  async create(tenantId: string, dto: CreateClassDto) {
    // Validate academic year exists and belongs to tenant
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academic_year_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${dto.academic_year_id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        // Validate room assignment for fixed classes
        const homeroomId = (dto as Record<string, unknown>).homeroom_id as string | undefined;
        if (homeroomId) {
          const room = await db.room.findFirst({
            where: { id: homeroomId, tenant_id: tenantId, active: true },
            select: { id: true, name: true, capacity: true },
          });
          if (!room) {
            throw new NotFoundException({
              code: 'ROOM_NOT_FOUND',
              message: 'Selected classroom not found',
            });
          }
          // Check capacity
          const classSize = (dto as Record<string, unknown>).max_capacity as number | undefined;
          if (classSize && room.capacity && classSize > room.capacity) {
            throw new BadRequestException({
              code: 'ROOM_CAPACITY_EXCEEDED',
              message: `Class size (${classSize}) exceeds room "${room.name}" capacity (${room.capacity})`,
            });
          }
          // Check exclusivity — room must not be assigned to another class
          const existingClass = await db.class.findFirst({
            where: {
              tenant_id: tenantId,
              homeroom_id: homeroomId,
              status: { in: ['active', 'inactive'] },
            },
            select: { id: true, name: true },
          });
          if (existingClass) {
            throw new BadRequestException({
              code: 'ROOM_ALREADY_ASSIGNED',
              message: `Room is already assigned to class "${existingClass.name}"`,
            });
          }
        }

        return db.class.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: dto.year_group_id ?? null,
            subject_id: null,
            homeroom_teacher_staff_id: dto.homeroom_teacher_staff_id ?? null,
            homeroom_id: homeroomId ?? null,
            name: dto.name,
            max_capacity: ((dto as Record<string, unknown>).max_capacity as number) ?? null,
            status: dto.status,
          },
          include: {
            academic_year: { select: { id: true, name: true } },
            year_group: { select: { id: true, name: true } },
            homeroom_room: { select: { id: true, name: true } },
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_CLASS_NAME',
          message: `A class with name "${dto.name}" already exists in this academic year`,
        });
      }
      throw err;
    }
  }

  async findAll(tenantId: string, params: ListClassesParams) {
    const { page, pageSize, academic_year_id, year_group_id, status, search, homeroom_only } =
      params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ClassWhereInput = { tenant_id: tenantId };

    if (academic_year_id) where.academic_year_id = academic_year_id;
    if (year_group_id) where.year_group_id = year_group_id;
    if (status) where.status = status as $Enums.ClassStatus;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    // Default: only show homeroom classes (no subject_id)
    if (homeroom_only !== false) {
      where.subject_id = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          academic_year: { select: { id: true, name: true } },
          year_group: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          _count: {
            select: {
              class_enrolments: {
                where: { status: 'active' },
              },
            },
          },
        },
      }),
      this.prisma.class.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const classEntity = await this.prisma.class.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        academic_year: { select: { id: true, name: true } },
        year_group: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        homeroom_teacher: {
          select: {
            id: true,
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
        class_staff: {
          include: {
            staff_profile: {
              select: {
                id: true,
                user: {
                  select: {
                    id: true,
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            class_enrolments: {
              where: { status: 'active' },
            },
            class_staff: true,
          },
        },
      },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${id}" not found`,
      });
    }

    return classEntity;
  }

  async update(tenantId: string, id: string, dto: UpdateClassDto) {
    await this.assertExists(tenantId, id);

    // Validate FK references belong to this tenant before connecting
    if ('year_group_id' in dto && dto.year_group_id) {
      const yg = await this.prisma.yearGroup.findFirst({
        where: { id: dto.year_group_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!yg)
        throw new NotFoundException({
          code: 'YEAR_GROUP_NOT_FOUND',
          message: `Year group not found`,
        });
    }
    if ('subject_id' in dto && dto.subject_id) {
      const sub = await this.prisma.subject.findFirst({
        where: { id: dto.subject_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!sub)
        throw new NotFoundException({ code: 'SUBJECT_NOT_FOUND', message: `Subject not found` });
    }
    if ('homeroom_teacher_staff_id' in dto && dto.homeroom_teacher_staff_id) {
      const sp = await this.prisma.staffProfile.findFirst({
        where: { id: dto.homeroom_teacher_staff_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!sp)
        throw new NotFoundException({
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: `Staff profile not found`,
        });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      const updated = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        const updateData: Prisma.ClassUpdateInput = {};
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.status !== undefined) updateData.status = dto.status;
        if ('year_group_id' in dto)
          updateData.year_group = dto.year_group_id
            ? { connect: { id: dto.year_group_id } }
            : { disconnect: true };
        if ('subject_id' in dto)
          updateData.subject = dto.subject_id
            ? { connect: { id: dto.subject_id } }
            : { disconnect: true };
        if ('homeroom_teacher_staff_id' in dto)
          updateData.homeroom_teacher = dto.homeroom_teacher_staff_id
            ? { connect: { id: dto.homeroom_teacher_staff_id } }
            : { disconnect: true };
        if ('max_capacity' in dto) updateData.max_capacity = dto.max_capacity ?? null;

        return db.class.update({
          where: { id },
          data: updateData,
        });
      });

      // Invalidate preview cache
      await this.redis.getClient().del(`preview:class:${id}`);

      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'DUPLICATE_CLASS_NAME',
          message: `A class with name "${dto.name}" already exists in this academic year`,
        });
      }
      throw err;
    }
  }

  async updateStatus(tenantId: string, id: string, dto: UpdateClassStatusDto) {
    await this.assertExists(tenantId, id);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.class.update({
        where: { id },
        data: { status: dto.status },
      });
    });

    // Side-effect: when class set to inactive, end-date all future schedules
    if (dto.status === 'inactive' && this.schedulesService) {
      await this.schedulesService.endDateForClass(tenantId, id);
    }

    // Invalidate preview cache
    await this.redis.getClient().del(`preview:class:${id}`);

    return updated;
  }

  async findStaff(tenantId: string, classId: string) {
    await this.assertExists(tenantId, classId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const staff = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.classStaff.findMany({
        where: { class_id: classId, tenant_id: tenantId },
        include: {
          staff_profile: {
            select: {
              id: true,
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
      });
    });

    const results = staff as Array<{
      class_id: string;
      staff_profile_id: string;
      assignment_role: string;
      staff_profile: { id: string; user: { first_name: string; last_name: string } };
    }>;

    return {
      data: results.map((s) => ({
        id: `${s.class_id}_${s.staff_profile_id}_${s.assignment_role}`,
        role: s.assignment_role,
        staff_profile: s.staff_profile,
      })),
    };
  }

  async assignStaff(tenantId: string, classId: string, dto: AssignClassStaffDto) {
    await this.assertExists(tenantId, classId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    try {
      return await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.classStaff.create({
          data: {
            tenant_id: tenantId,
            class_id: classId,
            staff_profile_id: dto.staff_profile_id,
            assignment_role: dto.assignment_role,
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: 'STAFF_ALREADY_ASSIGNED',
          message: `Staff member is already assigned to this class with role "${dto.assignment_role}"`,
        });
      }
      throw err;
    }
  }

  async removeStaff(tenantId: string, classId: string, staffProfileId: string, role: string) {
    const existing = await this.prisma.classStaff.findFirst({
      where: {
        class_id: classId,
        staff_profile_id: staffProfileId,
        assignment_role: role as $Enums.ClassStaffRole,
        tenant_id: tenantId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'STAFF_ASSIGNMENT_NOT_FOUND',
        message: `Staff assignment not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      // ClassStaff composite PK: (class_id, staff_profile_id, assignment_role)
      return db.classStaff.delete({
        where: {
          class_id_staff_profile_id_assignment_role: {
            class_id: classId,
            staff_profile_id: staffProfileId,
            assignment_role: role as $Enums.ClassStaffRole,
          },
        },
      });
    });
  }

  async preview(tenantId: string, id: string): Promise<PreviewResponse> {
    const cacheKey = `preview:class:${id}`;
    const redisClient = this.redis.getClient();

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PreviewResponse;
    }

    const classEntity = await this.prisma.class.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        name: true,
        status: true,
        academic_year: { select: { name: true } },
        year_group: { select: { name: true } },
        subject: { select: { name: true } },
        homeroom_teacher: {
          select: {
            user: {
              select: { first_name: true, last_name: true },
            },
          },
        },
        _count: {
          select: {
            class_enrolments: {
              where: { status: 'active' },
            },
          },
        },
      },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${id}" not found`,
      });
    }

    const secondaryParts = [classEntity.academic_year.name];
    if (classEntity.year_group) {
      secondaryParts.push(classEntity.year_group.name);
    }

    const facts: { label: string; value: string }[] = [
      {
        label: 'Students',
        value: String(classEntity._count.class_enrolments),
      },
    ];

    if (classEntity.homeroom_teacher) {
      const teacherName =
        `${classEntity.homeroom_teacher.user.first_name} ${classEntity.homeroom_teacher.user.last_name}`.trim();
      facts.push({ label: 'Teacher', value: teacherName });
    }

    if (classEntity.subject) {
      facts.push({ label: 'Subject', value: classEntity.subject.name });
    }

    const previewData: PreviewResponse = {
      id: classEntity.id,
      entity_type: 'class',
      primary_label: classEntity.name,
      secondary_label: secondaryParts.join(' · '),
      status: classEntity.status,
      facts,
    };

    await redisClient.set(cacheKey, JSON.stringify(previewData), 'EX', 30);

    return previewData;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async assertExists(tenantId: string, id: string) {
    const classEntity = await this.prisma.class.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${id}" not found`,
      });
    }
  }
}
