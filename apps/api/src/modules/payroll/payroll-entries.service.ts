import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { UpdatePayrollEntryDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { CalculationService } from './calculation.service';
import type { CalcInput } from './calculation.service';

@Injectable()
export class PayrollEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: CalculationService,
  ) {}

  async updateEntry(tenantId: string, entryId: string, dto: UpdatePayrollEntryDto) {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
      include: {
        payroll_run: {
          select: { id: true, status: true, total_working_days: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry with id "${entryId}" not found`,
      });
    }

    if (entry.payroll_run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Entries can only be updated when the payroll run is in draft status',
      });
    }

    // Optimistic concurrency check
    if (entry.updated_at.toISOString() !== dto.expected_updated_at) {
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'This entry has been modified by another user. Please refresh and try again.',
      });
    }

    // Validate field matches compensation type
    if (
      dto.days_worked !== undefined &&
      dto.days_worked !== null &&
      entry.compensation_type !== 'salaried'
    ) {
      throw new BadRequestException({
        code: 'INVALID_FIELD_FOR_TYPE',
        message: 'days_worked can only be set for salaried compensation type',
      });
    }

    if (
      dto.classes_taught !== undefined &&
      dto.classes_taught !== null &&
      entry.compensation_type !== 'per_class'
    ) {
      throw new BadRequestException({
        code: 'INVALID_FIELD_FOR_TYPE',
        message: 'classes_taught can only be set for per_class compensation type',
      });
    }

    // Merge updates
    const daysWorked =
      dto.days_worked !== undefined
        ? dto.days_worked
        : entry.days_worked !== null
          ? Number(entry.days_worked)
          : null;
    const classesTaught =
      dto.classes_taught !== undefined
        ? dto.classes_taught
        : entry.classes_taught !== null
          ? Number(entry.classes_taught)
          : null;
    const notes = dto.notes !== undefined ? dto.notes : entry.notes;

    // Recalculate
    const calcInput: CalcInput = {
      compensation_type: entry.compensation_type as 'salaried' | 'per_class',
      snapshot_base_salary:
        entry.snapshot_base_salary !== null ? Number(entry.snapshot_base_salary) : null,
      snapshot_per_class_rate:
        entry.snapshot_per_class_rate !== null ? Number(entry.snapshot_per_class_rate) : null,
      snapshot_assigned_class_count: entry.snapshot_assigned_class_count,
      snapshot_bonus_class_rate:
        entry.snapshot_bonus_class_rate !== null ? Number(entry.snapshot_bonus_class_rate) : null,
      snapshot_bonus_day_multiplier:
        entry.snapshot_bonus_day_multiplier !== null
          ? Number(entry.snapshot_bonus_day_multiplier)
          : null,
      total_working_days: entry.payroll_run.total_working_days,
      days_worked: daysWorked,
      classes_taught: classesTaught,
    };

    const result = this.calculationService.calculate(calcInput);

    // Handle override
    const updateData: Record<string, unknown> = {
      days_worked: daysWorked,
      classes_taught: classesTaught,
      notes,
      basic_pay: result.basic_pay,
      bonus_pay: result.bonus_pay,
      total_pay: result.total_pay,
    };

    if (dto.override_total_pay !== undefined) {
      if (
        dto.override_total_pay !== null &&
        (!dto.override_note || dto.override_note.trim().length === 0)
      ) {
        throw new BadRequestException({
          code: 'OVERRIDE_NOTE_REQUIRED',
          message: 'A note explaining the override is required when overriding total pay',
        });
      }
      updateData.override_total_pay = dto.override_total_pay;
      updateData.override_note = dto.override_note ?? null;
      updateData.override_at = dto.override_total_pay !== null ? new Date() : null;
    }

    const updated = await this.prisma.payrollEntry.update({
      where: { id: entryId },
      data: updateData,
      include: {
        staff_profile: {
          select: {
            id: true,
            staff_number: true,
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
    });

    return this.serializeEntry(updated);
  }

  async calculatePreview(
    tenantId: string,
    entryId: string,
    overrides: { days_worked?: number | null; classes_taught?: number | null },
  ) {
    const entry = await this.prisma.payrollEntry.findFirst({
      where: { id: entryId, tenant_id: tenantId },
      include: {
        payroll_run: {
          select: { total_working_days: true },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException({
        code: 'PAYROLL_ENTRY_NOT_FOUND',
        message: `Payroll entry with id "${entryId}" not found`,
      });
    }

    const calcInput: CalcInput = {
      compensation_type: entry.compensation_type as 'salaried' | 'per_class',
      snapshot_base_salary:
        entry.snapshot_base_salary !== null ? Number(entry.snapshot_base_salary) : null,
      snapshot_per_class_rate:
        entry.snapshot_per_class_rate !== null ? Number(entry.snapshot_per_class_rate) : null,
      snapshot_assigned_class_count: entry.snapshot_assigned_class_count,
      snapshot_bonus_class_rate:
        entry.snapshot_bonus_class_rate !== null ? Number(entry.snapshot_bonus_class_rate) : null,
      snapshot_bonus_day_multiplier:
        entry.snapshot_bonus_day_multiplier !== null
          ? Number(entry.snapshot_bonus_day_multiplier)
          : null,
      total_working_days: entry.payroll_run.total_working_days,
      days_worked:
        overrides.days_worked !== undefined
          ? overrides.days_worked
          : entry.days_worked !== null
            ? Number(entry.days_worked)
            : null,
      classes_taught:
        overrides.classes_taught !== undefined
          ? overrides.classes_taught
          : entry.classes_taught !== null
            ? Number(entry.classes_taught)
            : null,
    };

    return this.calculationService.calculate(calcInput);
  }

  serializeEntry(entry: Record<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = { ...entry };

    const decimalFields = [
      'snapshot_base_salary',
      'snapshot_per_class_rate',
      'snapshot_bonus_class_rate',
      'snapshot_bonus_day_multiplier',
      'basic_pay',
      'bonus_pay',
      'total_pay',
      'override_total_pay',
    ];

    for (const field of decimalFields) {
      if (serialized[field] !== null && serialized[field] !== undefined) {
        serialized[field] = Number(serialized[field]);
      }
    }

    return serialized;
  }
}
