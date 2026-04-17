import { Injectable, NotFoundException } from '@nestjs/common';

import type { UpsertExamSessionConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hhmmToTime(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

function timeToHhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

export interface ExamSessionConfigResponse {
  id: string;
  exam_session_id: string;
  allowed_weekdays: number[];
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  min_gap_minutes_same_student: number;
  max_exams_per_day_per_yg: number;
  updated_at: string;
}

@Injectable()
export class ExamSessionConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get session config ────────────────────────────────────────────────────

  async getConfig(tenantId: string, sessionId: string): Promise<ExamSessionConfigResponse | null> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const config = await this.prisma.examSessionConfig.findFirst({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
    });
    if (!config) return null;

    return {
      id: config.id,
      exam_session_id: config.exam_session_id,
      allowed_weekdays: config.allowed_weekdays,
      morning_start: timeToHhmm(config.morning_start),
      morning_end: timeToHhmm(config.morning_end),
      afternoon_start: timeToHhmm(config.afternoon_start),
      afternoon_end: timeToHhmm(config.afternoon_end),
      min_gap_minutes_same_student: config.min_gap_minutes_same_student,
      max_exams_per_day_per_yg: config.max_exams_per_day_per_yg,
      updated_at: config.updated_at.toISOString(),
    };
  }

  // ─── Upsert session config ─────────────────────────────────────────────────

  async upsertConfig(
    tenantId: string,
    sessionId: string,
    dto: UpsertExamSessionConfigDto,
  ): Promise<ExamSessionConfigResponse> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const saved = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const existing = await db.examSessionConfig.findFirst({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
        select: { id: true },
      });

      if (existing) {
        return db.examSessionConfig.update({
          where: { id: existing.id },
          data: {
            allowed_weekdays: dto.allowed_weekdays,
            morning_start: hhmmToTime(dto.morning_start),
            morning_end: hhmmToTime(dto.morning_end),
            afternoon_start: hhmmToTime(dto.afternoon_start),
            afternoon_end: hhmmToTime(dto.afternoon_end),
            min_gap_minutes_same_student: dto.min_gap_minutes_same_student,
            max_exams_per_day_per_yg: dto.max_exams_per_day_per_yg,
          },
        });
      }

      return db.examSessionConfig.create({
        data: {
          tenant_id: tenantId,
          exam_session_id: sessionId,
          allowed_weekdays: dto.allowed_weekdays,
          morning_start: hhmmToTime(dto.morning_start),
          morning_end: hhmmToTime(dto.morning_end),
          afternoon_start: hhmmToTime(dto.afternoon_start),
          afternoon_end: hhmmToTime(dto.afternoon_end),
          min_gap_minutes_same_student: dto.min_gap_minutes_same_student,
          max_exams_per_day_per_yg: dto.max_exams_per_day_per_yg,
        },
      });
    })) as {
      id: string;
      exam_session_id: string;
      allowed_weekdays: number[];
      morning_start: Date;
      morning_end: Date;
      afternoon_start: Date;
      afternoon_end: Date;
      min_gap_minutes_same_student: number;
      max_exams_per_day_per_yg: number;
      updated_at: Date;
    };

    return {
      id: saved.id,
      exam_session_id: saved.exam_session_id,
      allowed_weekdays: saved.allowed_weekdays,
      morning_start: timeToHhmm(saved.morning_start),
      morning_end: timeToHhmm(saved.morning_end),
      afternoon_start: timeToHhmm(saved.afternoon_start),
      afternoon_end: timeToHhmm(saved.afternoon_end),
      min_gap_minutes_same_student: saved.min_gap_minutes_same_student,
      max_exams_per_day_per_yg: saved.max_exams_per_day_per_yg,
      updated_at: saved.updated_at.toISOString(),
    };
  }
}
