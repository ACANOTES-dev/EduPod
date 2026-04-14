import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LeaveRequestStatus } from '@prisma/client';

import type {
  CreateLeaveRequestDto,
  LeaveRequestQuery,
  ReviewLeaveRequestDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { LeaveTypesService } from './leave-types.service';

const VALID_TRANSITIONS: Record<LeaveRequestStatus, LeaveRequestStatus[]> = {
  pending: ['approved', 'rejected', 'withdrawn'],
  approved: ['cancelled'],
  rejected: [],
  cancelled: [],
  withdrawn: [],
};

@Injectable()
export class LeaveRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly leaveTypesService: LeaveTypesService,
  ) {}

  // ─── Submit (Teacher) ─────────────────────────────────────────────────────

  async submit(tenantId: string, userId: string, dto: CreateLeaveRequestDto) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      throw new BadRequestException({
        error: {
          code: 'STAFF_PROFILE_NOT_FOUND',
          message: 'No staff profile linked to the current user',
        },
      });
    }

    const leaveType = await this.leaveTypesService.findById(tenantId, dto.leave_type_id);
    if (!leaveType) {
      throw new NotFoundException({
        error: { code: 'LEAVE_TYPE_NOT_FOUND', message: 'Leave type not found' },
      });
    }

    const rangeDays = this.diffDays(dto.date_from, dto.date_to);
    if (leaveType.max_days_per_request && rangeDays > leaveType.max_days_per_request) {
      throw new BadRequestException({
        error: {
          code: 'LEAVE_EXCEEDS_MAX_DAYS',
          message: `This leave type allows a maximum of ${leaveType.max_days_per_request} days per request`,
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const created = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.leaveRequest.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: staff.id,
          leave_type_id: dto.leave_type_id,
          date_from: new Date(dto.date_from),
          date_to: new Date(dto.date_to),
          full_day: dto.full_day ?? true,
          period_from: dto.period_from ?? null,
          period_to: dto.period_to ?? null,
          reason: dto.reason ?? null,
          evidence_url: dto.evidence_url ?? null,
          submitted_by_user_id: userId,
          status: 'pending',
        },
      });
    })) as unknown as { id: string; created_at: Date };

    return { id: created.id, status: 'pending', created_at: created.created_at.toISOString() };
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async listForAdmin(tenantId: string, query: LeaveRequestQuery) {
    return this.listWithFilter(tenantId, query, null);
  }

  async listForStaff(tenantId: string, userId: string, query: LeaveRequestQuery) {
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff) {
      return {
        data: [],
        meta: { page: query.page, pageSize: query.pageSize, total: 0 },
      };
    }
    return this.listWithFilter(tenantId, query, staff.id);
  }

  private async listWithFilter(
    tenantId: string,
    query: LeaveRequestQuery,
    staffProfileId: string | null,
  ) {
    const where: {
      tenant_id: string;
      staff_profile_id?: string;
      status?: LeaveRequestStatus;
      date_from?: { gte?: Date; lte?: Date };
    } = { tenant_id: tenantId };

    if (staffProfileId) where.staff_profile_id = staffProfileId;
    else if (query.staff_id) where.staff_profile_id = query.staff_id;
    if (query.status) where.status = query.status;
    if (query.date_from || query.date_to) {
      where.date_from = {};
      if (query.date_from) where.date_from.gte = new Date(query.date_from);
      if (query.date_to) where.date_from.lte = new Date(query.date_to);
    }

    const skip = (query.page - 1) * query.pageSize;
    const [rows, total] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where,
        include: {
          leave_type: true,
          staff_profile: { include: { user: true } },
          reviewed_by: true,
        },
        orderBy: { submitted_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        staff_profile_id: r.staff_profile_id,
        staff_name:
          r.staff_profile && r.staff_profile.user
            ? `${r.staff_profile.user.first_name} ${r.staff_profile.user.last_name}`
            : null,
        leave_type: {
          id: r.leave_type.id,
          code: r.leave_type.code,
          label: r.leave_type.label,
          is_paid_default: r.leave_type.is_paid_default,
        },
        date_from: r.date_from.toISOString().slice(0, 10),
        date_to: r.date_to.toISOString().slice(0, 10),
        full_day: r.full_day,
        period_from: r.period_from,
        period_to: r.period_to,
        reason: r.reason,
        evidence_url: r.evidence_url,
        status: r.status,
        submitted_at: r.submitted_at.toISOString(),
        reviewed_at: r.reviewed_at ? r.reviewed_at.toISOString() : null,
        review_notes: r.review_notes,
        reviewer_name:
          r.reviewed_by && r.reviewed_by.first_name
            ? `${r.reviewed_by.first_name} ${r.reviewed_by.last_name ?? ''}`.trim()
            : null,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Approve / Reject / Withdraw / Cancel ────────────────────────────────

  async approve(tenantId: string, userId: string, id: string, dto: ReviewLeaveRequestDto) {
    const request = await this.findOrThrow(tenantId, id);
    this.assertTransition(request.status as LeaveRequestStatus, 'approved');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Create the teacher_absence row that implements the approved leave.
      const leaveType = await db.leaveType.findFirst({ where: { id: request.leave_type_id } });
      const rangeDays = this.diffDays(
        request.date_from.toISOString().slice(0, 10),
        request.date_to.toISOString().slice(0, 10),
      );
      const daysCounted = request.full_day ? rangeDays : 0.5;
      const isPaid = leaveType ? leaveType.is_paid_default : true;

      const singleDay = request.date_from.getTime() === request.date_to.getTime();

      const absence = await db.teacherAbsence.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: request.staff_profile_id,
          absence_date: request.date_from,
          date_to: singleDay ? null : request.date_to,
          absence_type: 'approved_leave',
          leave_type_id: request.leave_type_id,
          leave_request_id: request.id,
          full_day: request.full_day,
          period_from: request.period_from,
          period_to: request.period_to,
          is_paid: isPaid,
          days_counted: daysCounted,
          reason: request.reason,
          reported_by_user_id: userId,
          reported_at: new Date(),
        },
      });

      await db.leaveRequest.update({
        where: { id },
        data: {
          status: 'approved',
          reviewed_by_user_id: userId,
          reviewed_at: new Date(),
          review_notes: dto.review_notes ?? null,
        },
      });

      return { id, status: 'approved', absence_id: absence.id };
    });
  }

  async reject(tenantId: string, userId: string, id: string, dto: ReviewLeaveRequestDto) {
    const request = await this.findOrThrow(tenantId, id);
    this.assertTransition(request.status as LeaveRequestStatus, 'rejected');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.leaveRequest.update({
        where: { id },
        data: {
          status: 'rejected',
          reviewed_by_user_id: userId,
          reviewed_at: new Date(),
          review_notes: dto.review_notes ?? null,
        },
      });
    });

    return { id, status: 'rejected' };
  }

  async withdraw(tenantId: string, userId: string, id: string) {
    const request = await this.findOrThrow(tenantId, id);
    const staff = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staff || staff.id !== request.staff_profile_id) {
      throw new ForbiddenException({
        error: {
          code: 'NOT_OWN_LEAVE_REQUEST',
          message: 'You can only withdraw your own leave requests',
        },
      });
    }
    this.assertTransition(request.status as LeaveRequestStatus, 'withdrawn');

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.leaveRequest.update({
        where: { id },
        data: { status: 'withdrawn' },
      });
    });

    return { id, status: 'withdrawn' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findOrThrow(tenantId: string, id: string) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!request) {
      throw new NotFoundException({
        error: {
          code: 'LEAVE_REQUEST_NOT_FOUND',
          message: `Leave request with id "${id}" not found`,
        },
      });
    }
    return request;
  }

  private assertTransition(from: LeaveRequestStatus, to: LeaveRequestStatus) {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed.includes(to)) {
      throw new ConflictException({
        error: {
          code: 'INVALID_LEAVE_TRANSITION',
          message: `Cannot transition leave request from "${from}" to "${to}"`,
        },
      });
    }
  }

  private diffDays(from: string, to: string): number {
    const a = new Date(from).getTime();
    const b = new Date(to).getTime();
    return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
  }
}
