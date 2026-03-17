import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PreviewResponse } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import type { CreateStudentDto } from './dto/create-student.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';
import type { UpdateStudentStatusDto } from './dto/update-student-status.dto';

// ─── Status transition map ────────────────────────────────────────────────────

type StudentStatus = 'applicant' | 'active' | 'withdrawn' | 'graduated' | 'archived';

const VALID_STUDENT_TRANSITIONS: Record<StudentStatus, StudentStatus[]> = {
  applicant: ['active'],
  active: ['withdrawn', 'graduated', 'archived'],
  withdrawn: ['active'],
  graduated: ['archived'],
  archived: [],
};

// ─── Query types ──────────────────────────────────────────────────────────────

interface ListStudentsQuery {
  page: number;
  pageSize: number;
  status?: StudentStatus;
  year_group_id?: string;
  household_id?: string;
  has_allergy?: boolean;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface AllergyReportFilters {
  year_group_id?: string;
  class_id?: string;
}

// ─── Local include-result types ───────────────────────────────────────────────

export interface StudentRow {
  id: string;
  tenant_id: string;
  household_id: string;
  student_number: string | null;
  first_name: string;
  last_name: string;
  full_name: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  full_name_ar: string | null;
  date_of_birth: Date;
  gender: string | null;
  status: string;
  entry_date: Date | null;
  exit_date: Date | null;
  year_group_id: string | null;
  class_homeroom_id: string | null;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface HouseholdSummary {
  id: string;
  household_name: string;
}

export interface YearGroupSummary {
  id: string;
  name: string;
}

export interface ClassSummary {
  id: string;
  name: string;
}

export interface ParentSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface StudentParentRow {
  parent_id: string;
  relationship_label: string | null;
  parent: ParentSummary;
}

export interface ClassEnrolmentRow {
  id: string;
  class_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
  class_entity: {
    id: string;
    name: string;
    subject: { name: string } | null;
    academic_year: { name: string };
  };
}

export interface StudentDetail extends StudentRow {
  household: HouseholdSummary;
  year_group: YearGroupSummary | null;
  homeroom_class: ClassSummary | null;
  student_parents: StudentParentRow[];
  class_enrolments: ClassEnrolmentRow[];
}

interface AllergyStudentRow {
  id: string;
  student_number: string | null;
  first_name: string;
  last_name: string;
  allergy_details: string | null;
  year_group: YearGroupSummary | null;
  homeroom_class: ClassSummary | null;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create a new student. Validates household_id exists and allergy rule.
   * Creates student_parents records if parent_links provided.
   */
  async create(tenantId: string, dto: CreateStudentDto) {
    // Validate household exists (tenant-scoped)
    const household = await this.prisma.household.findFirst({
      where: { id: dto.household_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${dto.household_id}" not found`,
      });
    }

    // Validate year_group if provided
    if (dto.year_group_id) {
      const yearGroup = await this.prisma.yearGroup.findFirst({
        where: { id: dto.year_group_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!yearGroup) {
        throw new NotFoundException({
          code: 'YEAR_GROUP_NOT_FOUND',
          message: `Year group with id "${dto.year_group_id}" not found`,
        });
      }
    }

    // Validate homeroom class if provided
    if (dto.class_homeroom_id) {
      const homeroomClass = await this.prisma.class.findFirst({
        where: { id: dto.class_homeroom_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!homeroomClass) {
        throw new NotFoundException({
          code: 'CLASS_NOT_FOUND',
          message: `Class with id "${dto.class_homeroom_id}" not found`,
        });
      }
    }

    // Validate parent_links if provided
    if (dto.parent_links && dto.parent_links.length > 0) {
      for (const link of dto.parent_links) {
        const parent = await this.prisma.parent.findFirst({
          where: { id: link.parent_id, tenant_id: tenantId },
          select: { id: true },
        });
        if (!parent) {
          throw new NotFoundException({
            code: 'PARENT_NOT_FOUND',
            message: `Parent with id "${link.parent_id}" not found`,
          });
        }
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const student = await db.student.create({
        data: {
          tenant_id: tenantId,
          household_id: dto.household_id,
          first_name: dto.first_name,
          last_name: dto.last_name,
          first_name_ar: dto.first_name_ar ?? null,
          last_name_ar: dto.last_name_ar ?? null,
          date_of_birth: new Date(dto.date_of_birth),
          gender: dto.gender ?? null,
          status: dto.status,
          entry_date: dto.entry_date ? new Date(dto.entry_date) : null,
          year_group_id: dto.year_group_id ?? null,
          class_homeroom_id: dto.class_homeroom_id ?? null,
          student_number: dto.student_number ?? null,
          medical_notes: dto.medical_notes ?? null,
          has_allergy: dto.has_allergy ?? false,
          allergy_details: dto.allergy_details ?? null,
        },
        include: {
          household: {
            select: { id: true, household_name: true },
          },
          year_group: {
            select: { id: true, name: true },
          },
          homeroom_class: {
            select: { id: true, name: true },
          },
        },
      });

      // Create student_parents join records
      if (dto.parent_links && dto.parent_links.length > 0) {
        for (const link of dto.parent_links) {
          await db.studentParent.create({
            data: {
              student_id: student.id,
              parent_id: link.parent_id,
              tenant_id: tenantId,
              relationship_label: link.relationship_label ?? null,
            },
          });
        }
      }

      return student;
    });
  }

  /**
   * Paginated list of students with optional filters.
   */
  async findAll(tenantId: string, query: ListStudentsQuery) {
    const {
      page,
      pageSize,
      status,
      year_group_id,
      household_id,
      has_allergy,
      search,
      sort,
      order,
    } = query;

    const skip = (page - 1) * pageSize;

    const where: Prisma.StudentWhereInput = { tenant_id: tenantId };

    if (status) {
      where.status = status;
    }
    if (year_group_id) {
      where.year_group_id = year_group_id;
    }
    if (household_id) {
      where.household_id = household_id;
    }
    if (has_allergy !== undefined) {
      where.has_allergy = has_allergy;
    }
    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { full_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const sortField = sort || 'last_name';
    const sortOrder = order || 'asc';
    const orderBy: Prisma.StudentOrderByWithRelationInput = {
      [sortField]: sortOrder,
    };

    const [data, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          year_group: { select: { id: true, name: true } },
          household: { select: { id: true, household_name: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get full student detail including relations.
   */
  async findOne(tenantId: string, id: string) {
    const student = (await this.prisma.student.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        household: {
          select: { id: true, household_name: true },
        },
        year_group: {
          select: { id: true, name: true },
        },
        homeroom_class: {
          select: { id: true, name: true },
        },
        student_parents: {
          include: {
            parent: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
                phone: true,
                is_primary_contact: true,
                is_billing_contact: true,
              },
            },
          },
        },
        class_enrolments: {
          include: {
            class_entity: {
              select: {
                id: true,
                name: true,
                subject: { select: { name: true } },
                academic_year: { select: { name: true } },
              },
            },
          },
          orderBy: { start_date: 'desc' },
        },
      },
    })) as StudentDetail | null;

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${id}" not found`,
      });
    }

    return student;
  }

  /**
   * Update student fields (NOT status). Use updateStatus for status changes.
   */
  async update(tenantId: string, id: string, dto: UpdateStudentDto) {
    // Verify student exists
    const existing = await this.prisma.student.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${id}" not found`,
      });
    }

    // Validate household if being changed
    if (dto.household_id) {
      const household = await this.prisma.household.findFirst({
        where: { id: dto.household_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!household) {
        throw new NotFoundException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: `Household with id "${dto.household_id}" not found`,
        });
      }
    }

    // Validate year_group if being changed
    if (dto.year_group_id) {
      const yearGroup = await this.prisma.yearGroup.findFirst({
        where: { id: dto.year_group_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!yearGroup) {
        throw new NotFoundException({
          code: 'YEAR_GROUP_NOT_FOUND',
          message: `Year group with id "${dto.year_group_id}" not found`,
        });
      }
    }

    // Validate homeroom class if being changed
    if (dto.class_homeroom_id) {
      const homeroomClass = await this.prisma.class.findFirst({
        where: { id: dto.class_homeroom_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!homeroomClass) {
        throw new NotFoundException({
          code: 'CLASS_NOT_FOUND',
          message: `Class with id "${dto.class_homeroom_id}" not found`,
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Use unchecked update input to allow raw scalar FK fields
      const updateData: Prisma.StudentUncheckedUpdateInput = {};

      if (dto.household_id !== undefined) updateData.household_id = dto.household_id;
      if (dto.first_name !== undefined) updateData.first_name = dto.first_name;
      if (dto.last_name !== undefined) updateData.last_name = dto.last_name;
      if ('first_name_ar' in dto) updateData.first_name_ar = dto.first_name_ar ?? null;
      if ('last_name_ar' in dto) updateData.last_name_ar = dto.last_name_ar ?? null;
      if (dto.date_of_birth !== undefined)
        updateData.date_of_birth = new Date(dto.date_of_birth);
      if ('gender' in dto) updateData.gender = dto.gender ?? null;
      if ('entry_date' in dto)
        updateData.entry_date = dto.entry_date ? new Date(dto.entry_date) : null;
      if ('year_group_id' in dto) updateData.year_group_id = dto.year_group_id ?? null;
      if ('class_homeroom_id' in dto)
        updateData.class_homeroom_id = dto.class_homeroom_id ?? null;
      if ('student_number' in dto) updateData.student_number = dto.student_number ?? null;
      if ('medical_notes' in dto) updateData.medical_notes = dto.medical_notes ?? null;
      if (dto.has_allergy !== undefined) updateData.has_allergy = dto.has_allergy;
      if ('allergy_details' in dto) updateData.allergy_details = dto.allergy_details ?? null;

      return db.student.update({
        where: { id },
        data: updateData,
        include: {
          household: { select: { id: true, household_name: true } },
          year_group: { select: { id: true, name: true } },
          homeroom_class: { select: { id: true, name: true } },
        },
      });
    });

    // Invalidate preview cache
    await this.redis.getClient().del(`preview:student:${id}`);

    return updated;
  }

  /**
   * Transition a student's status. Enforces VALID_STUDENT_TRANSITIONS.
   * On withdrawal: drops all active class enrolments and sets exit_date.
   * On graduation: sets exit_date.
   */
  async updateStatus(
    tenantId: string,
    id: string,
    dto: UpdateStudentStatusDto,
  ) {
    const { status: newStatus, reason } = dto;

    const student = await this.prisma.student.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${id}" not found`,
      });
    }

    const currentStatus = student.status as StudentStatus;
    const allowed = VALID_STUDENT_TRANSITIONS[currentStatus];

    if (!allowed.includes(newStatus as StudentStatus)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${newStatus}"`,
      });
    }

    if (newStatus === 'withdrawn' && (!reason || reason.trim().length === 0)) {
      throw new BadRequestException({
        code: 'WITHDRAWAL_REASON_REQUIRED',
        message: 'A reason is required when withdrawing a student',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const today = new Date();

      // Withdrawal side-effects: drop all active class enrolments
      if (newStatus === 'withdrawn') {
        await db.classEnrolment.updateMany({
          where: {
            student_id: id,
            tenant_id: tenantId,
            status: 'active',
          },
          data: {
            status: 'dropped',
            end_date: today,
          },
        });
      }

      // Build update data
      const updateData: Prisma.StudentUpdateInput = {
        status: newStatus as StudentStatus,
      };

      if (newStatus === 'withdrawn') {
        updateData.exit_date = today;
      } else if (newStatus === 'graduated') {
        updateData.exit_date = today;
      }

      return db.student.update({
        where: { id },
        data: updateData,
      });
    });

    // Invalidate preview cache
    await this.redis.getClient().del(`preview:student:${id}`);

    return updated;
  }

  /**
   * Lightweight preview data for hover cards. Redis-cached for 30s.
   */
  async preview(tenantId: string, id: string): Promise<PreviewResponse> {
    const cacheKey = `preview:student:${id}`;
    const redisClient = this.redis.getClient();

    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as PreviewResponse;
    }

    const student = (await this.prisma.student.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        full_name: true,
        first_name: true,
        last_name: true,
        status: true,
        date_of_birth: true,
        has_allergy: true,
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
        household: { select: { household_name: true } },
      },
    })) as {
      id: string;
      full_name: string | null;
      first_name: string;
      last_name: string;
      status: string;
      date_of_birth: Date;
      has_allergy: boolean;
      year_group: { name: string } | null;
      homeroom_class: { name: string } | null;
      household: { household_name: string };
    } | null;

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${id}" not found`,
      });
    }

    const fullName =
      student.full_name ??
      `${student.first_name} ${student.last_name}`.trim();

    const secondaryParts: string[] = [];
    if (student.year_group?.name) secondaryParts.push(student.year_group.name);
    if (student.homeroom_class?.name)
      secondaryParts.push(student.homeroom_class.name);

    const previewData: PreviewResponse = {
      id: student.id,
      entity_type: 'student',
      primary_label: fullName,
      secondary_label: secondaryParts.join(' — '),
      status: student.status,
      facts: [
        { label: 'Household', value: student.household.household_name },
        {
          label: 'DOB',
          value: student.date_of_birth.toISOString().split('T')[0] ?? '',
        },
        { label: 'Allergy', value: student.has_allergy ? 'Yes' : 'No' },
      ],
    };

    await redisClient.set(cacheKey, JSON.stringify(previewData), 'EX', 30);

    return previewData;
  }

  /**
   * Export pack for a student. Returns profile + placeholder arrays for
   * attendance/grades (built in later phases).
   */
  async exportPack(tenantId: string, id: string) {
    const student = await this.findOne(tenantId, id);

    return {
      profile: student,
      attendance_summary: [], // placeholder for P4a
      grades: [], // placeholder for P5
      report_cards: [], // placeholder for P5
    };
  }

  /**
   * Allergy report — all students with has_allergy = true.
   * Optionally filtered by year_group_id or class_id.
   */
  async allergyReport(tenantId: string, filters: AllergyReportFilters) {
    const where: Prisma.StudentWhereInput = {
      tenant_id: tenantId,
      has_allergy: true,
    };

    if (filters.year_group_id) {
      where.year_group_id = filters.year_group_id;
    }

    if (filters.class_id) {
      where.class_enrolments = {
        some: {
          class_id: filters.class_id,
          tenant_id: tenantId,
          status: 'active',
        },
      };
    }

    const students = (await this.prisma.student.findMany({
      where,
      select: {
        id: true,
        student_number: true,
        first_name: true,
        last_name: true,
        allergy_details: true,
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
      },
      orderBy: { last_name: 'asc' },
    })) as AllergyStudentRow[];

    const data = students.map((s) => ({
      student_id: s.id,
      student_number: s.student_number,
      first_name: s.first_name,
      last_name: s.last_name,
      year_group_name: s.year_group?.name ?? null,
      class_homeroom_name: s.homeroom_class?.name ?? null,
      allergy_details: s.allergy_details ?? '',
    }));

    return {
      data,
      meta: { total: data.length },
    };
  }
}
