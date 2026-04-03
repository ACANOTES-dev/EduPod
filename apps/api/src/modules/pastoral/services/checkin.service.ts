import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { CheckinAlertService } from './checkin-alert.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface CreateCheckinDto {
  mood_score: number;
  freeform_text?: string;
}

export interface CheckinResponse {
  id: string;
  checkin_date: string;
  mood_score: number;
  freeform_text: string | null;
  was_flagged: boolean;
}

export interface MonitoringCheckinResponse extends CheckinResponse {
  flag_reason: string | null;
  auto_concern_id: string | null;
  student_id: string;
  student_name?: string | null;
}

export interface FlaggedCheckinFilters {
  date_from?: string;
  date_to?: string;
  flag_reason?: string;
}

export interface CheckinStatusResponse {
  enabled: boolean;
  can_submit_today: boolean;
  frequency: 'daily' | 'weekly';
  last_checkin_date: string | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CheckinService {
  private readonly logger = new Logger(CheckinService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: CheckinAlertService,
  ) {}

  // ─── SUBMIT CHECKIN ─────────────────────────────────────────────────────────

  async submitCheckin(
    tenantId: string,
    studentId: string,
    userId: string,
    dto: CreateCheckinDto,
  ): Promise<CheckinResponse> {
    // 1. Verify check-ins are enabled
    const settings = await this.loadCheckinSettings(tenantId);
    if (!settings.enabled) {
      throw new ForbiddenException({
        code: 'CHECKINS_DISABLED',
        message: 'Student self-check-ins are not enabled for this tenant',
      });
    }

    // 2. Get today's date as DATE string
    const today = new Date();
    const checkinDateStr = this.formatDateOnly(today);

    // 3. Enforce frequency
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const checkin = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Weekly frequency: check if a checkin exists in the same ISO week
      if (settings.frequency === 'weekly') {
        const { monday, sunday } = this.getIsoWeekBounds(today);
        const existingWeekly = await db.studentCheckin.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            checkin_date: {
              gte: monday,
              lte: sunday,
            },
          },
        });

        if (existingWeekly) {
          throw new ConflictException({
            code: 'CHECKIN_ALREADY_SUBMITTED',
            message: 'You have already submitted a check-in this week',
          });
        }
      }

      // 4. Create the checkin record
      try {
        const created = await db.studentCheckin.create({
          data: {
            tenant_id: tenantId,
            student_id: studentId,
            mood_score: dto.mood_score,
            freeform_text: dto.freeform_text ?? null,
            flagged: false,
            checkin_date: new Date(checkinDateStr),
          },
        });

        return created;
      } catch (err) {
        // Daily frequency: unique constraint (tenant_id, student_id, checkin_date) handles duplicate
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException({
            code: 'CHECKIN_ALREADY_SUBMITTED',
            message: 'You have already submitted a check-in today',
          });
        }
        throw err;
      }
    })) as {
      id: string;
      tenant_id: string;
      student_id: string;
      mood_score: number;
      freeform_text: string | null;
      flagged: boolean;
      flag_reason: string | null;
      auto_concern_id: string | null;
      checkin_date: Date;
      created_at: Date;
    };

    // 5. Evaluate for alerts (keyword/consecutive-low detection)
    const alertResult = await this.alertService.evaluateCheckin(
      tenantId,
      studentId,
      checkin.id,
      checkinDateStr,
      dto.mood_score,
      dto.freeform_text ?? null,
    );

    // 6. Return student-facing response (privacy: no flag_reason or auto_concern_id)
    return {
      id: checkin.id,
      checkin_date: checkinDateStr,
      mood_score: checkin.mood_score,
      freeform_text: checkin.freeform_text,
      was_flagged: alertResult.was_flagged,
    };
  }

  // ─── GET MY CHECKINS ────────────────────────────────────────────────────────

  async getMyCheckins(
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: CheckinResponse[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [records, total] = await Promise.all([
        db.studentCheckin.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
          },
          orderBy: { checkin_date: 'desc' },
          skip,
          take: pageSize,
        }),
        db.studentCheckin.count({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
          },
        }),
      ]);

      const data: CheckinResponse[] = records.map((r) => ({
        id: r.id,
        checkin_date: this.formatDateOnly(r.checkin_date),
        mood_score: r.mood_score,
        freeform_text: r.freeform_text,
        was_flagged: r.flagged,
      }));

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{ data: CheckinResponse[]; meta: PaginationMeta }>;
  }

  // ─── GET STUDENT CHECKINS (MONITORING) ──────────────────────────────────────

  async getStudentCheckins(
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: MonitoringCheckinResponse[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [records, total] = await Promise.all([
        db.studentCheckin.findMany({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
          },
          orderBy: { checkin_date: 'desc' },
          skip,
          take: pageSize,
        }),
        db.studentCheckin.count({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
          },
        }),
      ]);

      const data: MonitoringCheckinResponse[] = records.map((r) => ({
        id: r.id,
        checkin_date: this.formatDateOnly(r.checkin_date),
        mood_score: r.mood_score,
        freeform_text: r.freeform_text,
        was_flagged: r.flagged,
        flag_reason: r.flag_reason,
        auto_concern_id: r.auto_concern_id,
        student_id: r.student_id,
      }));

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{ data: MonitoringCheckinResponse[]; meta: PaginationMeta }>;
  }

  // ─── GET FLAGGED CHECKINS ───────────────────────────────────────────────────

  async getFlaggedCheckins(
    tenantId: string,
    filters: FlaggedCheckinFilters,
    page: number,
    pageSize: number,
  ): Promise<{ data: MonitoringCheckinResponse[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const skip = (page - 1) * pageSize;

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        flagged: true,
      };

      if (filters.date_from || filters.date_to) {
        const dateFilter: Record<string, Date> = {};
        if (filters.date_from) {
          dateFilter.gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          dateFilter.lte = new Date(filters.date_to);
        }
        where.checkin_date = dateFilter;
      }

      if (filters.flag_reason) {
        where.flag_reason = filters.flag_reason;
      }

      const [records, total] = await Promise.all([
        db.studentCheckin.findMany({
          where,
          orderBy: { checkin_date: 'desc' },
          skip,
          take: pageSize,
          include: {
            student: {
              select: { first_name: true, last_name: true },
            },
          },
        }),
        db.studentCheckin.count({ where }),
      ]);

      const data: MonitoringCheckinResponse[] = records.map((r) => ({
        id: r.id,
        checkin_date: this.formatDateOnly(r.checkin_date),
        mood_score: r.mood_score,
        freeform_text: r.freeform_text,
        was_flagged: r.flagged,
        flag_reason: r.flag_reason,
        auto_concern_id: r.auto_concern_id,
        student_id: r.student_id,
        student_name: r.student ? `${r.student.first_name} ${r.student.last_name}`.trim() : null,
      }));

      return { data, meta: { page, pageSize, total } };
    }) as Promise<{ data: MonitoringCheckinResponse[]; meta: PaginationMeta }>;
  }

  // ─── GET CHECKIN STATUS ─────────────────────────────────────────────────────

  async getCheckinStatus(tenantId: string, studentId: string): Promise<CheckinStatusResponse> {
    const settings = await this.loadCheckinSettings(tenantId);

    if (!settings.enabled) {
      return {
        enabled: false,
        can_submit_today: false,
        frequency: settings.frequency,
        last_checkin_date: null,
      };
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Get the most recent checkin for this student
      const lastCheckin = await db.studentCheckin.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
        },
        orderBy: { checkin_date: 'desc' },
      });

      const lastCheckinDate = lastCheckin ? this.formatDateOnly(lastCheckin.checkin_date) : null;

      const today = new Date();
      let canSubmitToday = true;

      if (settings.frequency === 'daily') {
        // Check if a checkin already exists today
        const todayStr = this.formatDateOnly(today);
        if (lastCheckinDate === todayStr) {
          canSubmitToday = false;
        }
      } else {
        // Weekly: check if a checkin exists in the same ISO week
        const { monday, sunday } = this.getIsoWeekBounds(today);
        const existingWeekly = await db.studentCheckin.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            checkin_date: {
              gte: monday,
              lte: sunday,
            },
          },
        });
        if (existingWeekly) {
          canSubmitToday = false;
        }
      }

      return {
        enabled: true,
        can_submit_today: canSubmitToday,
        frequency: settings.frequency,
        last_checkin_date: lastCheckinDate,
      };
    }) as Promise<CheckinStatusResponse>;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getIsoWeekBounds(date: Date): { monday: Date; sunday: Date } {
    const dayOfWeek = date.getDay(); // 0=Sun
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
  }

  private async loadCheckinSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(pastoralRaw);

    return parsed.checkins;
  }
}
