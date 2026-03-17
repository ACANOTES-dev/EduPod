import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type {
  CreatePayrollRunDto,
  UpdatePayrollRunDto,
  FinaliseRunDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../configuration/settings.service';

import { CalculationService } from './calculation.service';
import type { CalcInput } from './calculation.service';
import { PayslipsService } from './payslips.service';

interface RunFilters {
  page: number;
  pageSize: number;
  status?: string;
  period_year?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

@Injectable()
export class PayrollRunsService {
  private readonly logger = new Logger(PayrollRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: CalculationService,
    private readonly payslipsService: PayslipsService,
    private readonly approvalRequestsService: ApprovalRequestsService,
    private readonly redisService: RedisService,
    private readonly settingsService: SettingsService,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
  ) {}

  async listRuns(tenantId: string, filters: RunFilters) {
    const { page, pageSize, status, period_year, sort, order } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    // Exclude cancelled by default
    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'cancelled' };
    }

    if (period_year) {
      where.period_year = period_year;
    }

    const orderBy: Record<string, string> = {};
    if (sort && ['created_at', 'period_year', 'period_month', 'total_pay', 'status'].includes(sort)) {
      orderBy[sort] = order ?? 'desc';
    } else {
      orderBy.created_at = 'desc';
    }

    const [data, total] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          finalised_by: {
            select: { id: true, first_name: true, last_name: true },
          },
          _count: { select: { entries: true } },
        },
      }),
      this.prisma.payrollRun.count({ where }),
    ]);

    return {
      data: data.map((r) => this.serializeRun(r)),
      meta: { page, pageSize, total },
    };
  }

  async getRun(tenantId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        finalised_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        entries: {
          include: {
            staff_profile: {
              select: {
                id: true,
                staff_number: true,
                job_title: true,
                department: true,
                employment_type: true,
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
            payslip: {
              select: {
                id: true,
                payslip_number: true,
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
        _count: { select: { entries: true } },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    return this.serializeRunFull(run);
  }

  async createRun(tenantId: string, userId: string, dto: CreatePayrollRunDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Check for duplicate month
      const existingRun = await db.payrollRun.findFirst({
        where: {
          tenant_id: tenantId,
          period_month: dto.period_month,
          period_year: dto.period_year,
          status: { not: 'cancelled' },
        },
      });

      if (existingRun) {
        throw new ConflictException({
          code: 'DUPLICATE_PAYROLL_RUN',
          message: `A payroll run already exists for ${dto.period_month}/${dto.period_year}`,
        });
      }

      // Create the run
      const run = await db.payrollRun.create({
        data: {
          tenant_id: tenantId,
          period_label: dto.period_label,
          period_month: dto.period_month,
          period_year: dto.period_year,
          total_working_days: dto.total_working_days,
          status: 'draft',
          created_by_user_id: userId,
        },
      });

      // Auto-populate entries from active staff compensation
      const activeCompensations = await db.staffCompensation.findMany({
        where: {
          tenant_id: tenantId,
          effective_to: null,
        },
        include: {
          staff_profile: {
            select: {
              id: true,
              employment_status: true,
            },
          },
        },
      });

      // Get tenant settings for auto-populate class counts
      let autoPopulateClassCounts = true;
      try {
        const settings = await this.settingsService.getSettings(tenantId);
        autoPopulateClassCounts = settings.payroll.autoPopulateClassCounts;
      } catch {
        // Default to true if settings not found
      }

      const firstDayOfMonth = new Date(dto.period_year, dto.period_month - 1, 1);
      const lastDayOfMonth = new Date(dto.period_year, dto.period_month, 0);

      for (const comp of activeCompensations) {
        // Skip inactive staff
        if (comp.staff_profile.employment_status !== 'active') {
          continue;
        }

        const staffProfileId = comp.staff_profile_id;

        // Auto-populate class counts from schedules if enabled and per_class
        let autoPopulatedClassCount: number | null = null;
        if (autoPopulateClassCounts && comp.compensation_type === 'per_class') {
          const scheduleCount = await db.schedule.count({
            where: {
              tenant_id: tenantId,
              teacher_staff_id: staffProfileId,
              effective_start_date: { lte: lastDayOfMonth },
              OR: [
                { effective_end_date: null },
                { effective_end_date: { gte: firstDayOfMonth } },
              ],
            },
          });
          autoPopulatedClassCount = scheduleCount;
        }

        const calcInput: CalcInput = {
          compensation_type: comp.compensation_type as 'salaried' | 'per_class',
          snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
          snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
          snapshot_assigned_class_count: comp.assigned_class_count,
          snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
          snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
          total_working_days: dto.total_working_days,
          days_worked: comp.compensation_type === 'salaried' ? dto.total_working_days : null,
          classes_taught: autoPopulatedClassCount,
        };

        const result = this.calculationService.calculate(calcInput);

        await db.payrollEntry.create({
          data: {
            tenant_id: tenantId,
            payroll_run_id: run.id,
            staff_profile_id: staffProfileId,
            compensation_type: comp.compensation_type,
            snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
            snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
            snapshot_assigned_class_count: comp.assigned_class_count,
            snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
            snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
            days_worked: comp.compensation_type === 'salaried' ? dto.total_working_days : null,
            classes_taught: autoPopulatedClassCount,
            auto_populated_class_count: autoPopulatedClassCount,
            basic_pay: result.basic_pay,
            bonus_pay: result.bonus_pay,
            total_pay: result.total_pay,
          },
        });
      }

      // Return the created run with entries
      return this.getRun(tenantId, run.id);
    });
  }

  async updateRun(tenantId: string, runId: string, dto: UpdatePayrollRunDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    if (run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Payroll runs can only be updated when in draft status',
      });
    }

    // Optimistic concurrency
    if (run.updated_at.toISOString() !== dto.expected_updated_at) {
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'This payroll run has been modified by another user. Please refresh and try again.',
      });
    }

    const updateData: Record<string, unknown> = {};
    if (dto.period_label !== undefined) {
      updateData.period_label = dto.period_label;
    }

    const totalWorkingDaysChanged = dto.total_working_days !== undefined && dto.total_working_days !== run.total_working_days;
    if (dto.total_working_days !== undefined) {
      updateData.total_working_days = dto.total_working_days;
    }

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: updateData,
    });

    // If total_working_days changed, recalculate all salaried entries
    if (totalWorkingDaysChanged && dto.total_working_days !== undefined) {
      const salariedEntries = await this.prisma.payrollEntry.findMany({
        where: {
          payroll_run_id: runId,
          tenant_id: tenantId,
          compensation_type: 'salaried',
        },
      });

      for (const entry of salariedEntries) {
        const calcInput: CalcInput = {
          compensation_type: 'salaried',
          snapshot_base_salary: entry.snapshot_base_salary !== null ? Number(entry.snapshot_base_salary) : null,
          snapshot_per_class_rate: null,
          snapshot_assigned_class_count: null,
          snapshot_bonus_class_rate: null,
          snapshot_bonus_day_multiplier: entry.snapshot_bonus_day_multiplier !== null ? Number(entry.snapshot_bonus_day_multiplier) : null,
          total_working_days: dto.total_working_days,
          days_worked: entry.days_worked,
          classes_taught: null,
        };

        const result = this.calculationService.calculate(calcInput);

        await this.prisma.payrollEntry.update({
          where: { id: entry.id },
          data: {
            basic_pay: result.basic_pay,
            bonus_pay: result.bonus_pay,
            total_pay: result.total_pay,
          },
        });
      }
    }

    return this.getRun(tenantId, runId);
  }

  async refreshEntries(tenantId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    if (run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Entries can only be refreshed when the payroll run is in draft status',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get all active compensations
      const activeCompensations = await db.staffCompensation.findMany({
        where: {
          tenant_id: tenantId,
          effective_to: null,
        },
        include: {
          staff_profile: {
            select: {
              id: true,
              employment_status: true,
            },
          },
        },
      });

      // Get existing entries
      const existingEntries = await db.payrollEntry.findMany({
        where: { payroll_run_id: runId, tenant_id: tenantId },
      });

      const existingStaffIds = new Set(existingEntries.map((e) => e.staff_profile_id));

      let autoPopulateClassCounts = true;
      try {
        const settings = await this.settingsService.getSettings(tenantId);
        autoPopulateClassCounts = settings.payroll.autoPopulateClassCounts;
      } catch {
        // Default
      }

      const firstDayOfMonth = new Date(run.period_year, run.period_month - 1, 1);
      const lastDayOfMonth = new Date(run.period_year, run.period_month, 0);

      // Update existing entries with new snapshot values
      for (const entry of existingEntries) {
        const comp = activeCompensations.find((c) => c.staff_profile_id === entry.staff_profile_id);
        if (!comp) continue;

        let autoPopulatedClassCount: number | null = null;
        if (autoPopulateClassCounts && comp.compensation_type === 'per_class') {
          const scheduleCount = await db.schedule.count({
            where: {
              tenant_id: tenantId,
              teacher_staff_id: entry.staff_profile_id,
              effective_start_date: { lte: lastDayOfMonth },
              OR: [
                { effective_end_date: null },
                { effective_end_date: { gte: firstDayOfMonth } },
              ],
            },
          });
          autoPopulatedClassCount = scheduleCount;
        }

        const daysWorked = entry.days_worked;
        const classesTaught = entry.classes_taught !== null ? Number(entry.classes_taught) : autoPopulatedClassCount;

        const calcInput: CalcInput = {
          compensation_type: comp.compensation_type as 'salaried' | 'per_class',
          snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
          snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
          snapshot_assigned_class_count: comp.assigned_class_count,
          snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
          snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
          total_working_days: run.total_working_days,
          days_worked: daysWorked,
          classes_taught: classesTaught,
        };

        const result = this.calculationService.calculate(calcInput);

        await db.payrollEntry.update({
          where: { id: entry.id },
          data: {
            compensation_type: comp.compensation_type,
            snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
            snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
            snapshot_assigned_class_count: comp.assigned_class_count,
            snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
            snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
            classes_taught: classesTaught,
            auto_populated_class_count: autoPopulatedClassCount,
            basic_pay: result.basic_pay,
            bonus_pay: result.bonus_pay,
            total_pay: result.total_pay,
          },
        });
      }

      // Add new staff that weren't in existing entries
      for (const comp of activeCompensations) {
        if (comp.staff_profile.employment_status !== 'active') continue;
        if (existingStaffIds.has(comp.staff_profile_id)) continue;

        let autoPopulatedClassCount: number | null = null;
        if (autoPopulateClassCounts && comp.compensation_type === 'per_class') {
          const scheduleCount = await db.schedule.count({
            where: {
              tenant_id: tenantId,
              teacher_staff_id: comp.staff_profile_id,
              effective_start_date: { lte: lastDayOfMonth },
              OR: [
                { effective_end_date: null },
                { effective_end_date: { gte: firstDayOfMonth } },
              ],
            },
          });
          autoPopulatedClassCount = scheduleCount;
        }

        const calcInput: CalcInput = {
          compensation_type: comp.compensation_type as 'salaried' | 'per_class',
          snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
          snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
          snapshot_assigned_class_count: comp.assigned_class_count,
          snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
          snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
          total_working_days: run.total_working_days,
          days_worked: comp.compensation_type === 'salaried' ? run.total_working_days : null,
          classes_taught: autoPopulatedClassCount,
        };

        const result = this.calculationService.calculate(calcInput);

        await db.payrollEntry.create({
          data: {
            tenant_id: tenantId,
            payroll_run_id: runId,
            staff_profile_id: comp.staff_profile_id,
            compensation_type: comp.compensation_type,
            snapshot_base_salary: comp.base_salary !== null ? Number(comp.base_salary) : null,
            snapshot_per_class_rate: comp.per_class_rate !== null ? Number(comp.per_class_rate) : null,
            snapshot_assigned_class_count: comp.assigned_class_count,
            snapshot_bonus_class_rate: comp.bonus_class_rate !== null ? Number(comp.bonus_class_rate) : null,
            snapshot_bonus_day_multiplier: comp.bonus_day_multiplier !== null ? Number(comp.bonus_day_multiplier) : null,
            days_worked: comp.compensation_type === 'salaried' ? run.total_working_days : null,
            classes_taught: autoPopulatedClassCount,
            auto_populated_class_count: autoPopulatedClassCount,
            basic_pay: result.basic_pay,
            bonus_pay: result.bonus_pay,
            total_pay: result.total_pay,
          },
        });
      }

      return this.getRun(tenantId, runId);
    });
  }

  async triggerSessionGeneration(tenantId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    if (run.status !== 'draft') {
      throw new BadRequestException({
        code: 'RUN_NOT_DRAFT',
        message: 'Session generation can only be triggered for draft runs',
      });
    }

    const redisKey = `payroll:session-gen:${tenantId}:${runId}`;
    const redis = this.redisService.getClient();
    await redis.set(redisKey, JSON.stringify({ status: 'queued', started_at: new Date().toISOString() }), 'EX', 3600);

    await this.payrollQueue.add('payroll:session-generation', {
      tenant_id: tenantId,
      run_id: runId,
    });

    return { status: 'queued', run_id: runId };
  }

  async getSessionGenerationStatus(tenantId: string, runId: string) {
    const redisKey = `payroll:session-gen:${tenantId}:${runId}`;
    const redis = this.redisService.getClient();
    const data = await redis.get(redisKey);

    if (!data) {
      return { status: 'not_found' };
    }

    return JSON.parse(data) as Record<string, unknown>;
  }

  async finalise(
    tenantId: string,
    runId: string,
    userId: string,
    dto: FinaliseRunDto,
    isSchoolOwner: boolean,
  ) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    if (run.status !== 'draft' && run.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: `Cannot finalise a payroll run with status "${run.status}"`,
      });
    }

    // Optimistic concurrency
    if (run.updated_at.toISOString() !== dto.expected_updated_at) {
      throw new ConflictException({
        code: 'CONCURRENT_MODIFICATION',
        message: 'This payroll run has been modified by another user. Please refresh and try again.',
      });
    }

    // Validate completeness: all salaried entries have days_worked, all per_class have classes_taught
    for (const entry of run.entries) {
      if (entry.compensation_type === 'salaried' && entry.days_worked === null) {
        throw new BadRequestException({
          code: 'INCOMPLETE_ENTRIES',
          message: 'All salaried entries must have days_worked filled in before finalising',
        });
      }
      if (entry.compensation_type === 'per_class' && entry.classes_taught === null) {
        throw new BadRequestException({
          code: 'INCOMPLETE_ENTRIES',
          message: 'All per_class entries must have classes_taught filled in before finalising',
        });
      }
    }

    // Check if approval is required
    let requireApproval = true;
    try {
      const settings = await this.settingsService.getSettings(tenantId);
      requireApproval = settings.payroll.requireApprovalForNonPrincipal;
    } catch {
      // Default to requiring approval
    }

    if (run.status === 'draft' && requireApproval && !isSchoolOwner) {
      // Check approval workflow
      const approvalResult = await this.approvalRequestsService.checkAndCreateIfNeeded(
        tenantId,
        'payroll_finalise',
        'payroll_run',
        runId,
        userId,
        false,
      );

      if (!approvalResult.approved) {
        // Set run to pending_approval
        await this.prisma.payrollRun.update({
          where: { id: runId },
          data: {
            status: 'pending_approval',
            approval_request_id: approvalResult.request_id,
          },
        });

        return {
          status: 'pending_approval',
          approval_request_id: approvalResult.request_id,
          message: 'Payroll run requires approval before finalisation',
        };
      }
    }

    // Execute finalisation
    return this.executeFinalisation(tenantId, runId, userId);
  }

  async executeFinalisation(tenantId: string, runId: string, userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Fetch entries for totals
      const entries = await db.payrollEntry.findMany({
        where: { payroll_run_id: runId, tenant_id: tenantId },
      });

      // Compute totals
      let totalBasicPay = 0;
      let totalBonusPay = 0;
      let totalPay = 0;

      for (const entry of entries) {
        totalBasicPay += Number(entry.basic_pay);
        totalBonusPay += Number(entry.bonus_pay);
        totalPay += Number(entry.total_pay);
      }

      totalBasicPay = Number(totalBasicPay.toFixed(2));
      totalBonusPay = Number(totalBonusPay.toFixed(2));
      totalPay = Number(totalPay.toFixed(2));

      // Freeze the run
      const now = new Date();
      await db.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'finalised',
          total_basic_pay: totalBasicPay,
          total_bonus_pay: totalBonusPay,
          total_pay: totalPay,
          headcount: entries.length,
          finalised_by_user_id: userId,
          finalised_at: now,
        },
      });

      // Generate payslips
      await this.payslipsService.generatePayslipsForRun(tenantId, runId, userId, db);

      return this.getRun(tenantId, runId);
    });
  }

  async cancelRun(tenantId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    if (run.status !== 'draft' && run.status !== 'pending_approval') {
      throw new BadRequestException({
        code: 'INVALID_STATUS_FOR_CANCEL',
        message: `Cannot cancel a payroll run with status "${run.status}". Only draft or pending_approval runs can be cancelled.`,
      });
    }

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'cancelled' },
    });

    return { id: runId, status: 'cancelled' };
  }

  private serializeRun(run: Record<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = { ...run };

    const decimalFields = ['total_basic_pay', 'total_bonus_pay', 'total_pay'];
    for (const field of decimalFields) {
      if (serialized[field] !== null && serialized[field] !== undefined) {
        serialized[field] = Number(serialized[field]);
      }
    }

    return serialized;
  }

  private serializeRunFull(run: Record<string, unknown>): Record<string, unknown> {
    const serialized = this.serializeRun(run);

    if (Array.isArray(serialized['entries'])) {
      serialized['entries'] = (serialized['entries'] as Array<Record<string, unknown>>).map(
        (entry) => {
          const e: Record<string, unknown> = { ...entry };
          const entryDecimalFields = [
            'snapshot_base_salary',
            'snapshot_per_class_rate',
            'snapshot_bonus_class_rate',
            'snapshot_bonus_day_multiplier',
            'basic_pay',
            'bonus_pay',
            'total_pay',
          ];
          for (const field of entryDecimalFields) {
            if (e[field] !== null && e[field] !== undefined) {
              e[field] = Number(e[field]);
            }
          }
          return e;
        },
      );
    }

    return serialized;
  }
}
