import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  CreateLeaveTypeDto,
  LeaveBalancePerType,
  LeaveBalanceResponse,
  LeaveTypeAdminResponse,
  LeaveTypeResponse,
  UpdateLeaveTypeDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Read (staff-facing) ──────────────────────────────────────────────────

  // Returns the effective leave-type catalogue for a tenant: tenant-specific
  // rows take precedence over same-code system rows. Only `is_active=true`.
  async list(tenantId: string): Promise<{ data: LeaveTypeResponse[] }> {
    const rows = await this.prisma.leaveType.findMany({
      where: {
        is_active: true,
        OR: [{ tenant_id: null }, { tenant_id: tenantId }],
      },
      orderBy: { display_order: 'asc' },
    });

    const byCode = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byCode.get(row.code);
      if (!existing || (existing.tenant_id === null && row.tenant_id !== null)) {
        byCode.set(row.code, row);
      }
    }

    const data: LeaveTypeResponse[] = Array.from(byCode.values())
      .sort((a, b) => a.display_order - b.display_order)
      .map((r) => ({
        id: r.id,
        code: r.code,
        label: r.label,
        requires_approval: r.requires_approval,
        is_paid_default: r.is_paid_default,
        max_days_per_request: r.max_days_per_request,
        requires_evidence: r.requires_evidence,
        display_order: r.display_order,
      }));

    return { data };
  }

  // ─── Read (admin-facing) ──────────────────────────────────────────────────

  // Admin view for /settings/leave-types. Returns every row — active + inactive,
  // system + tenant-override — with flags so the UI can show which rows are the
  // tenant's own and which shadow a system default.
  async listAdmin(tenantId: string): Promise<{ data: LeaveTypeAdminResponse[] }> {
    const rows = await this.prisma.leaveType.findMany({
      where: { OR: [{ tenant_id: null }, { tenant_id: tenantId }] },
      orderBy: [{ display_order: 'asc' }, { code: 'asc' }],
    });

    const tenantCodes = new Set(rows.filter((r) => r.tenant_id !== null).map((r) => r.code));

    const data: LeaveTypeAdminResponse[] = rows.map((r) => {
      const is_system = r.tenant_id === null;
      const is_overridden = is_system && tenantCodes.has(r.code);
      return {
        id: r.id,
        code: r.code,
        label: r.label,
        requires_approval: r.requires_approval,
        is_paid_default: r.is_paid_default,
        max_days_per_request: r.max_days_per_request,
        requires_evidence: r.requires_evidence,
        display_order: r.display_order,
        tenant_id: r.tenant_id,
        is_active: r.is_active,
        is_system,
        is_overridden,
        system_code_match: !is_system && tenantCodes.has(r.code) ? r.code : null,
      };
    });

    return { data };
  }

  async findById(tenantId: string, id: string) {
    return this.prisma.leaveType.findFirst({
      where: { id, OR: [{ tenant_id: null }, { tenant_id: tenantId }] },
    });
  }

  // ─── Write (admin) ────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateLeaveTypeDto): Promise<LeaveTypeAdminResponse> {
    // Tenant code must be unique within the tenant (system rows with the same
    // code are allowed — the tenant row will shadow the system default).
    const existing = await this.prisma.leaveType.findFirst({
      where: { tenant_id: tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'LEAVE_TYPE_CODE_EXISTS',
          message: `Leave type with code "${dto.code}" already exists for this tenant`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const created = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.leaveType.create({
        data: {
          tenant_id: tenantId,
          code: dto.code,
          label: dto.label,
          requires_approval: dto.requires_approval,
          is_paid_default: dto.is_paid_default,
          max_days_per_request: dto.max_days_per_request ?? null,
          requires_evidence: dto.requires_evidence,
          display_order: dto.display_order,
          is_active: true,
        },
      });
    });

    return this.toAdminResponse(created, /*tenantHasOverride*/ true, tenantId);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLeaveTypeDto,
  ): Promise<LeaveTypeAdminResponse> {
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      // Refuse to edit system rows — tenants must create their own override first.
      const systemRow = await this.prisma.leaveType.findFirst({
        where: { id, tenant_id: null },
      });
      if (systemRow) {
        throw new BadRequestException({
          error: {
            code: 'LEAVE_TYPE_SYSTEM_READONLY',
            message:
              'System leave types are read-only. Create a tenant override with the same code to customise it.',
          },
        });
      }
      throw new NotFoundException({
        error: { code: 'LEAVE_TYPE_NOT_FOUND', message: `Leave type with id "${id}" not found` },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.leaveType.update({
        where: { id },
        data: {
          label: dto.label ?? undefined,
          requires_approval: dto.requires_approval ?? undefined,
          is_paid_default: dto.is_paid_default ?? undefined,
          max_days_per_request:
            dto.max_days_per_request === undefined ? undefined : dto.max_days_per_request,
          requires_evidence: dto.requires_evidence ?? undefined,
          display_order: dto.display_order ?? undefined,
          is_active: dto.is_active ?? undefined,
        },
      });
    });

    return this.toAdminResponse(updated, /*tenantHasOverride*/ true, tenantId);
  }

  async archive(tenantId: string, id: string): Promise<{ id: string; is_active: boolean }> {
    const existing = await this.prisma.leaveType.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      const systemRow = await this.prisma.leaveType.findFirst({
        where: { id, tenant_id: null },
      });
      if (systemRow) {
        throw new BadRequestException({
          error: {
            code: 'LEAVE_TYPE_SYSTEM_READONLY',
            message:
              'System leave types cannot be archived. Create a tenant override and mark it inactive to hide it.',
          },
        });
      }
      throw new NotFoundException({
        error: { code: 'LEAVE_TYPE_NOT_FOUND', message: `Leave type with id "${id}" not found` },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.leaveType.update({
        where: { id },
        data: { is_active: false },
      });
    });
    return { id, is_active: false };
  }

  // ─── Leave Balance ────────────────────────────────────────────────────────

  // Aggregates per-type days-taken + days-pending for a single staff member
  // across the current academic year. When no active academic year exists,
  // falls back to the current calendar year.
  async getBalanceForUser(tenantId: string, userId: string): Promise<LeaveBalanceResponse> {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      return this.emptyBalance(tenantId, null, null);
    }

    const staffName = staff.user ? `${staff.user.first_name} ${staff.user.last_name}` : null;
    return this.buildBalance(tenantId, staff.id, staffName);
  }

  async getBalanceForStaff(
    tenantId: string,
    staffProfileId: string,
  ): Promise<LeaveBalanceResponse> {
    const staff = await this.staffProfileReadFacade.findById(tenantId, staffProfileId);
    if (!staff) {
      throw new NotFoundException({
        error: { code: 'STAFF_PROFILE_NOT_FOUND', message: 'Staff profile not found' },
      });
    }
    const staffName = staff.user ? `${staff.user.first_name} ${staff.user.last_name}` : null;
    return this.buildBalance(tenantId, staff.id, staffName);
  }

  private async buildBalance(
    tenantId: string,
    staffProfileId: string,
    staffName: string | null,
  ): Promise<LeaveBalanceResponse> {
    const year = await this.academicReadFacade.findCurrentYear(tenantId).catch(() => null);

    const now = new Date();
    const fallbackStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const fallbackEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31));

    const rangeStart = year ? year.start_date : fallbackStart;
    const rangeEnd = year ? year.end_date : fallbackEnd;

    // teacher_absences is owned by the scheduling module; the payroll/absences
    // aggregation already reaches directly for the same reason (same eslint
    // disable in payroll-attendance.service). A future scheduling-side
    // AbsenceReadFacade can absorb this query.
    const [pendingRequests, approvedAbsences] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: {
          tenant_id: tenantId,
          staff_profile_id: staffProfileId,
          status: 'pending',
          date_from: { lte: rangeEnd },
          date_to: { gte: rangeStart },
        },
        include: { leave_type: true },
      }),
      // eslint-disable-next-line school/no-cross-module-prisma-access
      this.prisma.teacherAbsence.findMany({
        where: {
          tenant_id: tenantId,
          staff_profile_id: staffProfileId,
          absence_type: 'approved_leave',
          cancelled_at: null,
          absence_date: { lte: rangeEnd },
          OR: [{ date_to: null }, { date_to: { gte: rangeStart } }],
        },
        include: { leave_type: true },
      }),
    ]);

    const perType = new Map<string, LeaveBalancePerType>();

    const ensureType = (
      id: string,
      code: string,
      label: string,
      is_paid_default: boolean,
    ): LeaveBalancePerType => {
      const existing = perType.get(id);
      if (existing) return existing;
      const row: LeaveBalancePerType = {
        leave_type_id: id,
        code,
        label,
        is_paid_default,
        days_taken: 0,
        days_pending: 0,
        approved_requests: 0,
        pending_requests: 0,
      };
      perType.set(id, row);
      return row;
    };

    let totalDaysTaken = 0;
    let totalDaysPending = 0;
    for (const abs of approvedAbsences) {
      if (!abs.leave_type_id || !abs.leave_type) continue;
      const row = ensureType(
        abs.leave_type.id,
        abs.leave_type.code,
        abs.leave_type.label,
        abs.leave_type.is_paid_default,
      );
      const daysCounted = Number(abs.days_counted ?? 0);
      row.days_taken += daysCounted;
      row.approved_requests += 1;
      totalDaysTaken += daysCounted;
    }

    for (const req of pendingRequests) {
      const lt = req.leave_type;
      const row = ensureType(lt.id, lt.code, lt.label, lt.is_paid_default);
      const days = diffDays(req.date_from, req.date_to, req.full_day);
      row.days_pending += days;
      row.pending_requests += 1;
      totalDaysPending += days;
    }

    const totals = {
      pending_count: pendingRequests.length,
      approved_count: approvedAbsences.filter((a) => a.leave_type_id).length,
      total_days_taken: round2(totalDaysTaken),
      total_days_pending: round2(totalDaysPending),
    };

    const perTypeSorted = Array.from(perType.values())
      .map((row) => ({
        ...row,
        days_taken: round2(row.days_taken),
        days_pending: round2(row.days_pending),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      staff_profile_id: staffProfileId,
      staff_name: staffName,
      academic_year: year
        ? {
            id: year.id,
            name: year.name,
            start_date: year.start_date.toISOString().slice(0, 10),
            end_date: year.end_date.toISOString().slice(0, 10),
          }
        : null,
      totals,
      per_type: perTypeSorted,
    };
  }

  private emptyBalance(
    _tenantId: string,
    staffProfileId: string | null,
    staffName: string | null,
  ): LeaveBalanceResponse {
    return {
      staff_profile_id: staffProfileId,
      staff_name: staffName,
      academic_year: null,
      totals: {
        pending_count: 0,
        approved_count: 0,
        total_days_taken: 0,
        total_days_pending: 0,
      },
      per_type: [],
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async toAdminResponse(
    row: {
      id: string;
      tenant_id: string | null;
      code: string;
      label: string;
      requires_approval: boolean;
      is_paid_default: boolean;
      max_days_per_request: number | null;
      requires_evidence: boolean;
      display_order: number;
      is_active: boolean;
    },
    _tenantHasOverride: boolean,
    tenantId: string,
  ): Promise<LeaveTypeAdminResponse> {
    const is_system = row.tenant_id === null;
    const sibling = is_system
      ? await this.prisma.leaveType.findFirst({
          where: { tenant_id: tenantId, code: row.code },
          select: { id: true },
        })
      : null;
    return {
      id: row.id,
      code: row.code,
      label: row.label,
      requires_approval: row.requires_approval,
      is_paid_default: row.is_paid_default,
      max_days_per_request: row.max_days_per_request,
      requires_evidence: row.requires_evidence,
      display_order: row.display_order,
      tenant_id: row.tenant_id,
      is_active: row.is_active,
      is_system,
      is_overridden: is_system && sibling !== null,
      system_code_match: is_system ? null : row.code,
    };
  }
}

function diffDays(from: Date, to: Date, fullDay: boolean): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  return fullDay ? days : 0.5;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
