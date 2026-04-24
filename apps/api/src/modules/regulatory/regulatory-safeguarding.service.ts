import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ChildProtectionReviewStatus,
  DlpRole,
  Prisma,
  StaffVettingStatus,
  StaffVettingType,
} from '@prisma/client';

import type {
  CreateCpReviewDto,
  CreateDlpEntryDto,
  CreateStaffVettingDto,
  ListMandatoryReportsQueryDto,
  ListStaffVettingQueryDto,
  UpdateCpReviewDto,
  UpdateDlpEntryDto,
  UpdateStaffVettingDto,
} from '@school/shared/regulatory';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SafeguardingReadFacade } from '../safeguarding/safeguarding-read.facade';

// ─── Types ────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;

export interface RegulatorySafeguardingDashboard {
  open_concerns: number;
  pending_tusla_reports: number;
  vetting_expiring_soon: number;
  vetting_overdue: number;
  days_until_annual_review: number | null;
  next_review_due: string | null;
  last_review_date: string | null;
  active_dlp_count: number;
  deputy_dlp_count: number;
  recent_tusla_reports: RecentTuslaReport[];
}

export interface RecentTuslaReport {
  id: string;
  concern_number: string;
  severity: string;
  status: string;
  tusla_referred_at: string | null;
  tusla_reference_number: string | null;
}

export interface DlpEntryRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  role: DlpRole;
  appointed_at: string;
  retired_at: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface StaffVettingRow {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  vetting_type: StaffVettingType;
  reference_number: string | null;
  vetting_date: string;
  expiry_date: string;
  days_remaining: number;
  status: StaffVettingStatus;
  notes: string | null;
}

export interface CpReviewRow {
  id: string;
  academic_year: string;
  review_date: string;
  next_review_due: string;
  conducted_by_id: string | null;
  conducted_by_name: string | null;
  attendees: string | null;
  findings: string | null;
  actions_required: string | null;
  status: ChildProtectionReviewStatus;
}

export interface MandatoryReportRow {
  id: string;
  concern_number: string;
  student_reference: string;
  concern_type: string;
  severity: string;
  status: string;
  tusla_referred_at: string | null;
  tusla_reference_number: string | null;
  reported_at: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RegulatorySafeguardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safeguardingReadFacade: SafeguardingReadFacade,
  ) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string): Promise<RegulatorySafeguardingDashboard> {
    const now = new Date();
    const sixtyDays = new Date(now.getTime() + 60 * MS_PER_DAY);

    const [
      openConcerns,
      pendingTuslaReports,
      vettingExpiringSoon,
      vettingOverdue,
      nextReview,
      lastReview,
      activeDlps,
      deputyDlps,
      recentTuslaRaw,
    ] = await Promise.all([
      this.safeguardingReadFacade.countSafeguardingHub(tenantId),
      this.safeguardingReadFacade.countPendingTuslaReferrals(tenantId),
      this.prisma.staffVettingRecord.count({
        where: {
          tenant_id: tenantId,
          status: { in: [StaffVettingStatus.active, StaffVettingStatus.expiring_soon] },
          expiry_date: { gt: now, lte: sixtyDays },
        },
      }),
      this.prisma.staffVettingRecord.count({
        where: {
          tenant_id: tenantId,
          OR: [
            { expiry_date: { lte: now } },
            { status: { in: [StaffVettingStatus.expired, StaffVettingStatus.revoked] } },
          ],
        },
      }),
      this.prisma.childProtectionReview.findFirst({
        where: {
          tenant_id: tenantId,
          status: {
            in: [ChildProtectionReviewStatus.scheduled, ChildProtectionReviewStatus.in_progress],
          },
        },
        orderBy: { next_review_due: 'asc' },
        select: { next_review_due: true },
      }),
      this.prisma.childProtectionReview.findFirst({
        where: { tenant_id: tenantId, status: ChildProtectionReviewStatus.completed },
        orderBy: { review_date: 'desc' },
        select: { review_date: true },
      }),
      this.prisma.dlpRegisterEntry.count({
        where: { tenant_id: tenantId, retired_at: null, role: DlpRole.designated_liaison },
      }),
      this.prisma.dlpRegisterEntry.count({
        where: { tenant_id: tenantId, retired_at: null, role: DlpRole.deputy_liaison },
      }),
      this.safeguardingReadFacade.findRecentTuslaReferrals(tenantId, 5),
    ]);

    const daysUntilAnnualReview =
      nextReview?.next_review_due != null
        ? Math.floor((nextReview.next_review_due.getTime() - now.getTime()) / MS_PER_DAY)
        : null;

    return {
      open_concerns: openConcerns,
      pending_tusla_reports: pendingTuslaReports,
      vetting_expiring_soon: vettingExpiringSoon,
      vetting_overdue: vettingOverdue,
      days_until_annual_review: daysUntilAnnualReview,
      next_review_due: nextReview?.next_review_due?.toISOString() ?? null,
      last_review_date: lastReview?.review_date?.toISOString() ?? null,
      active_dlp_count: activeDlps,
      deputy_dlp_count: deputyDlps,
      recent_tusla_reports: recentTuslaRaw.map((row) => ({
        id: row.id,
        concern_number: row.concern_number,
        severity: row.severity,
        status: row.status,
        tusla_referred_at: row.tusla_referred_at?.toISOString() ?? null,
        tusla_reference_number: row.tusla_reference_number,
      })),
    };
  }

  // ─── Mandatory Reporting ──────────────────────────────────────────────────

  async listMandatoryReports(tenantId: string, params: ListMandatoryReportsQueryDto) {
    const { page, pageSize } = params;
    const skip = (page - 1) * pageSize;

    const { rows: raw, total } = await this.safeguardingReadFacade.listTuslaReferrals(
      tenantId,
      skip,
      pageSize,
    );

    const rows: MandatoryReportRow[] = raw.map((r) => ({
      id: r.id,
      concern_number: r.concern_number,
      // Anonymise: only the first 8 chars of the student UUID; deep view in
      // the standalone safeguarding module enforces stricter permission gating.
      student_reference: r.student_id.slice(0, 8),
      concern_type: r.concern_type,
      severity: r.severity,
      status: r.status,
      tusla_referred_at: r.tusla_referred_at?.toISOString() ?? null,
      tusla_reference_number: r.tusla_reference_number,
      reported_at: r.created_at.toISOString(),
    }));

    return { data: rows, meta: { page, pageSize, total } };
  }

  // ─── DLP Register ─────────────────────────────────────────────────────────

  async listDlpRegister(tenantId: string): Promise<DlpEntryRow[]> {
    const rows = await this.prisma.dlpRegisterEntry.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ retired_at: 'asc' }, { appointed_at: 'desc' }],
      include: {
        user: { select: { id: true, first_name: true, last_name: true, email: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      user_name: `${row.user.first_name} ${row.user.last_name}`.trim(),
      user_email: row.user.email,
      role: row.role,
      appointed_at: row.appointed_at.toISOString(),
      retired_at: row.retired_at?.toISOString() ?? null,
      is_active: row.retired_at === null,
      notes: row.notes,
    }));
  }

  async createDlpEntry(tenantId: string, dto: CreateDlpEntryDto): Promise<DlpEntryRow> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const entry = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.dlpRegisterEntry.create({
        data: {
          tenant_id: tenantId,
          user_id: dto.user_id,
          role: dto.role,
          appointed_at: new Date(dto.appointed_at),
          retired_at: dto.retired_at ? new Date(dto.retired_at) : null,
          notes: dto.notes ?? null,
        },
        include: {
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      });
    });
    return {
      id: entry.id,
      user_id: entry.user_id,
      user_name: `${entry.user.first_name} ${entry.user.last_name}`.trim(),
      user_email: entry.user.email,
      role: entry.role,
      appointed_at: entry.appointed_at.toISOString(),
      retired_at: entry.retired_at?.toISOString() ?? null,
      is_active: entry.retired_at === null,
      notes: entry.notes,
    };
  }

  async updateDlpEntry(tenantId: string, id: string, dto: UpdateDlpEntryDto): Promise<DlpEntryRow> {
    const existing = await this.prisma.dlpRegisterEntry.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DLP_ENTRY_NOT_FOUND',
        message: `DLP register entry "${id}" not found`,
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const entry = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.dlpRegisterEntry.update({
        where: { id },
        data: {
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.appointed_at !== undefined && { appointed_at: new Date(dto.appointed_at) }),
          ...(dto.retired_at !== undefined && {
            retired_at: dto.retired_at ? new Date(dto.retired_at) : null,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        },
        include: {
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      });
    });
    return {
      id: entry.id,
      user_id: entry.user_id,
      user_name: `${entry.user.first_name} ${entry.user.last_name}`.trim(),
      user_email: entry.user.email,
      role: entry.role,
      appointed_at: entry.appointed_at.toISOString(),
      retired_at: entry.retired_at?.toISOString() ?? null,
      is_active: entry.retired_at === null,
      notes: entry.notes,
    };
  }

  async deleteDlpEntry(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.dlpRegisterEntry.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'DLP_ENTRY_NOT_FOUND',
        message: `DLP register entry "${id}" not found`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.dlpRegisterEntry.delete({ where: { id } });
    });
  }

  // ─── Staff Vetting ────────────────────────────────────────────────────────

  async listStaffVetting(tenantId: string, params: ListStaffVettingQueryDto) {
    const { page, pageSize, status, vetting_type } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.StaffVettingRecordWhereInput = {
      tenant_id: tenantId,
      ...(status && { status }),
      ...(vetting_type && { vetting_type }),
    };

    const [data, total] = await Promise.all([
      this.prisma.staffVettingRecord.findMany({
        where,
        orderBy: { expiry_date: 'asc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      }),
      this.prisma.staffVettingRecord.count({ where }),
    ]);

    const now = Date.now();
    const rows: StaffVettingRow[] = data.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      user_name: `${r.user.first_name} ${r.user.last_name}`.trim(),
      user_email: r.user.email,
      vetting_type: r.vetting_type,
      reference_number: r.reference_number,
      vetting_date: r.vetting_date.toISOString(),
      expiry_date: r.expiry_date.toISOString(),
      days_remaining: Math.floor((r.expiry_date.getTime() - now) / MS_PER_DAY),
      status: r.status,
      notes: r.notes,
    }));

    return { data: rows, meta: { page, pageSize, total } };
  }

  async createStaffVetting(tenantId: string, dto: CreateStaffVettingDto): Promise<StaffVettingRow> {
    const status = dto.status ?? this.computeVettingStatus(new Date(dto.expiry_date));
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const rec = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffVettingRecord.create({
        data: {
          tenant_id: tenantId,
          user_id: dto.user_id,
          vetting_type: dto.vetting_type,
          reference_number: dto.reference_number ?? null,
          vetting_date: new Date(dto.vetting_date),
          expiry_date: new Date(dto.expiry_date),
          status,
          notes: dto.notes ?? null,
        },
        include: {
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      });
    });
    return this.toVettingRow(rec);
  }

  async updateStaffVetting(
    tenantId: string,
    id: string,
    dto: UpdateStaffVettingDto,
  ): Promise<StaffVettingRow> {
    const existing = await this.prisma.staffVettingRecord.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'VETTING_RECORD_NOT_FOUND',
        message: `Staff vetting record "${id}" not found`,
      });
    }

    const nextExpiry = dto.expiry_date ? new Date(dto.expiry_date) : existing.expiry_date;
    const status = dto.status ?? this.computeVettingStatus(nextExpiry);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const rec = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.staffVettingRecord.update({
        where: { id },
        data: {
          ...(dto.vetting_type !== undefined && { vetting_type: dto.vetting_type }),
          ...(dto.reference_number !== undefined && {
            reference_number: dto.reference_number ?? null,
          }),
          ...(dto.vetting_date !== undefined && { vetting_date: new Date(dto.vetting_date) }),
          ...(dto.expiry_date !== undefined && { expiry_date: new Date(dto.expiry_date) }),
          status,
          ...(dto.notes !== undefined && { notes: dto.notes ?? null }),
        },
        include: {
          user: { select: { id: true, first_name: true, last_name: true, email: true } },
        },
      });
    });
    return this.toVettingRow(rec);
  }

  async deleteStaffVetting(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.staffVettingRecord.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'VETTING_RECORD_NOT_FOUND',
        message: `Staff vetting record "${id}" not found`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.staffVettingRecord.delete({ where: { id } });
    });
  }

  // ─── Child Protection Reviews ─────────────────────────────────────────────

  async listCpReviews(tenantId: string): Promise<CpReviewRow[]> {
    const rows = await this.prisma.childProtectionReview.findMany({
      where: { tenant_id: tenantId },
      orderBy: { review_date: 'desc' },
      include: {
        conducted_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });
    return rows.map((row) => this.toCpReviewRow(row));
  }

  async createCpReview(tenantId: string, dto: CreateCpReviewDto): Promise<CpReviewRow> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const review = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.childProtectionReview.create({
        data: {
          tenant_id: tenantId,
          academic_year: dto.academic_year,
          review_date: new Date(dto.review_date),
          next_review_due: new Date(dto.next_review_due),
          conducted_by_id: dto.conducted_by_id ?? null,
          attendees: dto.attendees ?? null,
          findings: dto.findings ?? null,
          actions_required: dto.actions_required ?? null,
          status: dto.status,
        },
        include: {
          conducted_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
    return this.toCpReviewRow(review);
  }

  async updateCpReview(tenantId: string, id: string, dto: UpdateCpReviewDto): Promise<CpReviewRow> {
    const existing = await this.prisma.childProtectionReview.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'CP_REVIEW_NOT_FOUND',
        message: `Child protection review "${id}" not found`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const review = await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.childProtectionReview.update({
        where: { id },
        data: {
          ...(dto.review_date !== undefined && { review_date: new Date(dto.review_date) }),
          ...(dto.next_review_due !== undefined && {
            next_review_due: new Date(dto.next_review_due),
          }),
          ...(dto.conducted_by_id !== undefined && {
            conducted_by_id: dto.conducted_by_id ?? null,
          }),
          ...(dto.attendees !== undefined && { attendees: dto.attendees ?? null }),
          ...(dto.findings !== undefined && { findings: dto.findings ?? null }),
          ...(dto.actions_required !== undefined && {
            actions_required: dto.actions_required ?? null,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
        include: {
          conducted_by: { select: { id: true, first_name: true, last_name: true } },
        },
      });
    });
    return this.toCpReviewRow(review);
  }

  async deleteCpReview(tenantId: string, id: string): Promise<void> {
    const existing = await this.prisma.childProtectionReview.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'CP_REVIEW_NOT_FOUND',
        message: `Child protection review "${id}" not found`,
      });
    }
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.childProtectionReview.delete({ where: { id } });
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private computeVettingStatus(expiryDate: Date): StaffVettingStatus {
    const now = new Date();
    const sixtyDays = new Date(now.getTime() + 60 * MS_PER_DAY);
    if (expiryDate <= now) return StaffVettingStatus.expired;
    if (expiryDate <= sixtyDays) return StaffVettingStatus.expiring_soon;
    return StaffVettingStatus.active;
  }

  private toVettingRow(rec: {
    id: string;
    user_id: string;
    vetting_type: StaffVettingType;
    reference_number: string | null;
    vetting_date: Date;
    expiry_date: Date;
    status: StaffVettingStatus;
    notes: string | null;
    user: { first_name: string; last_name: string; email: string };
  }): StaffVettingRow {
    return {
      id: rec.id,
      user_id: rec.user_id,
      user_name: `${rec.user.first_name} ${rec.user.last_name}`.trim(),
      user_email: rec.user.email,
      vetting_type: rec.vetting_type,
      reference_number: rec.reference_number,
      vetting_date: rec.vetting_date.toISOString(),
      expiry_date: rec.expiry_date.toISOString(),
      days_remaining: Math.floor((rec.expiry_date.getTime() - Date.now()) / MS_PER_DAY),
      status: rec.status,
      notes: rec.notes,
    };
  }

  private toCpReviewRow(row: {
    id: string;
    academic_year: string;
    review_date: Date;
    next_review_due: Date;
    conducted_by_id: string | null;
    attendees: string | null;
    findings: string | null;
    actions_required: string | null;
    status: ChildProtectionReviewStatus;
    conducted_by: { first_name: string; last_name: string } | null;
  }): CpReviewRow {
    return {
      id: row.id,
      academic_year: row.academic_year,
      review_date: row.review_date.toISOString(),
      next_review_due: row.next_review_due.toISOString(),
      conducted_by_id: row.conducted_by_id,
      conducted_by_name: row.conducted_by
        ? `${row.conducted_by.first_name} ${row.conducted_by.last_name}`.trim()
        : null,
      attendees: row.attendees,
      findings: row.findings,
      actions_required: row.actions_required,
      status: row.status,
    };
  }
}
