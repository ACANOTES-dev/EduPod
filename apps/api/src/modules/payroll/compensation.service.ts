import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateCompensationDto, UpdateCompensationDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

interface CompensationFilters {
  page: number;
  pageSize: number;
  compensation_type?: 'salaried' | 'per_class';
  staff_profile_id?: string;
  active_only: boolean;
}

interface CsvRow {
  staff_number: string;
  compensation_type: string;
  base_salary: string;
  per_class_rate: string;
  assigned_class_count: string;
  bonus_class_rate: string;
  bonus_day_multiplier: string;
  effective_from: string;
}

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
  ) {}

  // ─── Staff picker for the compensation page (Wave 3) ─────────────────────
  //
  // Returns all active staff with their currently-effective compensation
  // record, paginated. Used by the redesigned compensation page's filter
  // dropdown and any staff-picker that needs to show "current pay type".

  async listStaffForPicker(
    tenantId: string,
    page = 1,
    pageSize = 50,
  ): Promise<{
    data: Array<{
      id: string;
      full_name: string;
      employee_number: string | null;
      compensation_type: string | null;
      base_salary: number | null;
      per_class_rate: number | null;
      currently_active: boolean;
    }>;
    meta: { page: number; pageSize: number; total: number };
  }> {
    const allStaff = await this.staffProfileReadFacade.findActiveStaff(tenantId);
    const total = allStaff.length;
    const skip = (page - 1) * pageSize;
    const pageStaff = allStaff.slice(skip, skip + pageSize);

    if (pageStaff.length === 0) {
      return { data: [], meta: { page, pageSize, total } };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const compensations = await this.prisma.staffCompensation.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: { in: pageStaff.map((s) => s.id) },
        effective_from: { lte: today },
        OR: [{ effective_to: null }, { effective_to: { gte: today } }],
      },
      orderBy: { effective_from: 'desc' },
    });

    const compByStaffId = new Map<string, (typeof compensations)[number]>();
    for (const c of compensations) {
      if (!compByStaffId.has(c.staff_profile_id)) {
        compByStaffId.set(c.staff_profile_id, c);
      }
    }

    const data = pageStaff.map((staff) => {
      const comp = compByStaffId.get(staff.id) ?? null;
      return {
        id: staff.id,
        full_name: `${staff.user.first_name} ${staff.user.last_name}`.trim(),
        employee_number: staff.staff_number,
        compensation_type: comp?.compensation_type ?? null,
        base_salary: comp?.base_salary != null ? Number(comp.base_salary) : null,
        per_class_rate: comp?.per_class_rate != null ? Number(comp.per_class_rate) : null,
        currently_active: comp !== null,
      };
    });

    return { data, meta: { page, pageSize, total } };
  }

  async listCompensation(tenantId: string, filters: CompensationFilters) {
    const { page, pageSize, compensation_type, staff_profile_id, active_only } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (compensation_type) {
      where.compensation_type = compensation_type;
    }
    if (staff_profile_id) {
      where.staff_profile_id = staff_profile_id;
    }
    if (active_only) {
      where.effective_to = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.staffCompensation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          staff_profile: {
            select: {
              id: true,
              staff_number: true,
              job_title: true,
              department: true,
              user: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.staffCompensation.count({ where }),
    ]);

    return {
      data: data.map((c) => this.serialize(c)),
      meta: { page, pageSize, total },
    };
  }

  async getCompensation(tenantId: string, id: string) {
    const comp = await this.prisma.staffCompensation.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        staff_profile: {
          select: {
            id: true,
            staff_number: true,
            job_title: true,
            department: true,
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!comp) {
      throw new NotFoundException({
        code: 'COMPENSATION_NOT_FOUND',
        message: `Compensation record with id "${id}" not found`,
      });
    }

    return this.serialize(comp);
  }

  async createCompensation(tenantId: string, userId: string, dto: CreateCompensationDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate staff profile belongs to tenant
      const staffProfile = await db.staffProfile.findFirst({
        where: { id: dto.staff_profile_id, tenant_id: tenantId },
      });
      if (!staffProfile) {
        throw new BadRequestException({
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: `Staff profile with id "${dto.staff_profile_id}" not found`,
        });
      }

      const effectiveFrom = new Date(dto.effective_from);

      // Close any existing active compensation for this staff
      const existingActive = await db.staffCompensation.findFirst({
        where: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          effective_to: null,
        },
      });

      if (existingActive) {
        // Set effective_to to the day before the new record's effective_from
        const closingDate = new Date(effectiveFrom);
        closingDate.setDate(closingDate.getDate() - 1);

        if (closingDate < new Date(existingActive.effective_from)) {
          throw new BadRequestException({
            code: 'EFFECTIVE_DATE_CONFLICT',
            message:
              'New effective date cannot be before or on the same day as the existing active compensation start date',
          });
        }

        await db.staffCompensation.update({
          where: { id: existingActive.id },
          data: { effective_to: closingDate },
        });
      }

      const record = await db.staffCompensation.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          compensation_type: dto.compensation_type,
          base_salary: dto.base_salary,
          per_class_rate: dto.per_class_rate,
          assigned_class_count: dto.assigned_class_count,
          bonus_class_rate: dto.bonus_class_rate,
          bonus_day_multiplier: dto.bonus_day_multiplier,
          effective_from: effectiveFrom,
          effective_to: null,
          created_by_user_id: userId,
        },
        include: {
          staff_profile: {
            select: {
              id: true,
              staff_number: true,
              job_title: true,
              department: true,
              user: {
                select: {
                  id: true,
                  first_name: true,
                  last_name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      return this.serialize(record);
    });
  }

  async updateCompensation(tenantId: string, id: string, dto: UpdateCompensationDto) {
    const existing = await this.prisma.staffCompensation.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'COMPENSATION_NOT_FOUND',
        message: `Compensation record with id "${id}" not found`,
      });
    }

    // Optimistic concurrency check
    if (existing.updated_at.toISOString() !== dto.expected_updated_at) {
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'This record has been modified by another user. Please refresh and try again.',
      });
    }

    const updateData: Record<string, unknown> = {};

    if (dto.compensation_type !== undefined) {
      updateData.compensation_type = dto.compensation_type;
    }
    if (dto.base_salary !== undefined) {
      updateData.base_salary = dto.base_salary;
    }
    if (dto.per_class_rate !== undefined) {
      updateData.per_class_rate = dto.per_class_rate;
    }
    if (dto.assigned_class_count !== undefined) {
      updateData.assigned_class_count = dto.assigned_class_count;
    }
    if (dto.bonus_class_rate !== undefined) {
      updateData.bonus_class_rate = dto.bonus_class_rate;
    }
    if (dto.bonus_day_multiplier !== undefined) {
      updateData.bonus_day_multiplier = dto.bonus_day_multiplier;
    }
    if (dto.effective_from !== undefined) {
      updateData.effective_from = new Date(dto.effective_from);
    }

    const updated = await this.prisma.staffCompensation.update({
      where: { id },
      data: updateData,
      include: {
        staff_profile: {
          select: {
            id: true,
            staff_number: true,
            job_title: true,
            department: true,
            user: {
              select: {
                id: true,
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return this.serialize(updated);
  }

  async bulkImport(tenantId: string, userId: string, csvBuffer: Buffer) {
    const csvText = csvBuffer.toString('utf-8');
    const lines = csvText.split('\n').filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      throw new BadRequestException({
        code: 'EMPTY_CSV',
        message: 'CSV file must contain a header row and at least one data row',
      });
    }

    // Parse header
    const headers = (lines[0] as string).split(',').map((h) => h.trim().toLowerCase());
    const requiredHeaders = ['staff_number', 'compensation_type', 'effective_from'];
    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        throw new BadRequestException({
          code: 'MISSING_CSV_HEADER',
          message: `CSV is missing required header: ${required}`,
        });
      }
    }

    const rows: CsvRow[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = (lines[i] as string).split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j] as string] = values[j] ?? '';
      }
      rows.push(row as unknown as CsvRow);
    }

    // Validate rows and look up staff profiles
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const results: Array<Record<string, unknown>> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as CsvRow;
        const rowNum = i + 2; // 1-indexed, plus header

        // Find staff by staff_number
        const staffProfile = await db.staffProfile.findFirst({
          where: { tenant_id: tenantId, staff_number: row.staff_number },
        });

        if (!staffProfile) {
          errors.push(`Row ${rowNum}: Staff with number "${row.staff_number}" not found`);
          continue;
        }

        if (!['salaried', 'per_class'].includes(row.compensation_type)) {
          errors.push(`Row ${rowNum}: Invalid compensation_type "${row.compensation_type}"`);
          continue;
        }

        const effectiveFrom = new Date(row.effective_from);
        if (isNaN(effectiveFrom.getTime())) {
          errors.push(`Row ${rowNum}: Invalid effective_from date "${row.effective_from}"`);
          continue;
        }

        // Close existing active compensation
        const existingActive = await db.staffCompensation.findFirst({
          where: {
            tenant_id: tenantId,
            staff_profile_id: staffProfile.id,
            effective_to: null,
          },
        });

        if (existingActive) {
          const closingDate = new Date(effectiveFrom);
          closingDate.setDate(closingDate.getDate() - 1);

          if (closingDate >= new Date(existingActive.effective_from)) {
            await db.staffCompensation.update({
              where: { id: existingActive.id },
              data: { effective_to: closingDate },
            });
          }
        }

        const baseSalary = row.base_salary ? parseFloat(row.base_salary) : null;
        const perClassRate = row.per_class_rate ? parseFloat(row.per_class_rate) : null;
        const assignedClassCount = row.assigned_class_count
          ? parseInt(row.assigned_class_count, 10)
          : null;
        const bonusClassRate = row.bonus_class_rate ? parseFloat(row.bonus_class_rate) : null;
        const bonusDayMultiplier = row.bonus_day_multiplier
          ? parseFloat(row.bonus_day_multiplier)
          : 1.0;

        const record = await db.staffCompensation.create({
          data: {
            tenant_id: tenantId,
            staff_profile_id: staffProfile.id,
            compensation_type: row.compensation_type as 'salaried' | 'per_class',
            base_salary: baseSalary,
            per_class_rate: perClassRate,
            assigned_class_count: assignedClassCount,
            bonus_class_rate: bonusClassRate,
            bonus_day_multiplier: bonusDayMultiplier,
            effective_from: effectiveFrom,
            effective_to: null,
            created_by_user_id: userId,
          },
        });

        results.push({ row: rowNum, id: record.id, staff_number: row.staff_number });
      }

      return {
        imported: results.length,
        errors,
        results,
      };
    });
  }

  async getActiveCompensation(tenantId: string, staffProfileId: string) {
    const comp = await this.prisma.staffCompensation.findFirst({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        effective_to: null,
      },
      orderBy: { effective_from: 'desc' },
    });

    return comp ? this.serialize(comp) : null;
  }

  /**
   * Period-bracketed compensation lookup. Returns the most-recent
   * compensation row whose effective range overlaps `[periodStart, periodEnd]`.
   * Wave 2 of the payroll-overhaul rebuild — the audit found the engine was
   * fetching `effective_to: null` only, ignoring runs whose period sat
   * BEFORE a still-active comp's `effective_from`. See payrollnew/PLAN.md.
   *
   * If a staff member has multiple historical comps overlapping the period,
   * the highest `effective_from` wins. Documented as the convention; Wave 5
   * adds an architectural-doc danger-zone entry on overlap behaviour.
   */
  async findActiveForPeriod(
    tenantId: string,
    staffProfileId: string,
    periodStart: Date,
    periodEnd: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const rows = await db.staffCompensation.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: staffProfileId,
        effective_from: { lte: periodEnd },
        OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
      },
      orderBy: { effective_from: 'desc' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  private serialize(record: Record<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = { ...record };

    // Convert Decimal fields to numbers
    const decimalFields = [
      'base_salary',
      'per_class_rate',
      'bonus_class_rate',
      'bonus_day_multiplier',
    ];
    for (const field of decimalFields) {
      if (serialized[field] !== null && serialized[field] !== undefined) {
        serialized[field] = Number(serialized[field]);
      }
    }

    return serialized;
  }
}
