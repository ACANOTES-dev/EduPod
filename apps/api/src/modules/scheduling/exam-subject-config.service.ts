import { Injectable, NotFoundException } from '@nestjs/common';

import type { BulkUpsertExamSubjectConfigsDto, UpsertExamSubjectConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { CurriculumMatrixService } from '../academics/curriculum-matrix.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExamSubjectConfigRow {
  id: string | null;
  exam_session_id: string;
  year_group_id: string;
  year_group_name: string;
  subject_id: string;
  subject_name: string;
  is_examinable: boolean;
  paper_count: number;
  paper_1_duration_mins: number;
  paper_2_duration_mins: number | null;
  mode: 'in_person' | 'online';
  invigilators_required: number;
  student_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function defaultInvigilators(studentCount: number): number {
  return Math.max(1, Math.ceil(studentCount / 25));
}

@Injectable()
export class ExamSubjectConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly curriculumMatrix: CurriculumMatrixService,
  ) {}

  // ─── List configs — one row per curriculum-valid (year_group, subject) pair ─

  async listConfigs(tenantId: string, sessionId: string): Promise<ExamSubjectConfigRow[]> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const [configs, curriculumPairs] = await Promise.all([
      this.prisma.examSubjectConfig.findMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      }),
      this.curriculumMatrix.findExamCurriculumPairs(tenantId),
    ]);

    const configsByKey = new Map(configs.map((c) => [`${c.year_group_id}:${c.subject_id}`, c]));

    const rows: ExamSubjectConfigRow[] = curriculumPairs.map((pair) => {
      const key = `${pair.year_group_id}:${pair.subject_id}`;
      const config = configsByKey.get(key);
      if (config) {
        return {
          id: config.id,
          exam_session_id: sessionId,
          year_group_id: pair.year_group_id,
          year_group_name: pair.year_group_name,
          subject_id: pair.subject_id,
          subject_name: pair.subject_name,
          is_examinable: config.is_examinable,
          paper_count: config.paper_count,
          paper_1_duration_mins: config.paper_1_duration_mins,
          paper_2_duration_mins: config.paper_2_duration_mins,
          mode: config.mode === 'online' ? 'online' : 'in_person',
          invigilators_required: config.invigilators_required,
          student_count: pair.student_count,
        };
      }
      return {
        id: null,
        exam_session_id: sessionId,
        year_group_id: pair.year_group_id,
        year_group_name: pair.year_group_name,
        subject_id: pair.subject_id,
        subject_name: pair.subject_name,
        is_examinable: false,
        paper_count: 1,
        paper_1_duration_mins: 90,
        paper_2_duration_mins: null,
        mode: 'in_person',
        invigilators_required: defaultInvigilators(pair.student_count),
        student_count: pair.student_count,
      };
    });

    rows.sort((a, b) => {
      const yg = a.year_group_name.localeCompare(b.year_group_name);
      return yg !== 0 ? yg : a.subject_name.localeCompare(b.subject_name);
    });

    return rows;
  }

  // ─── Upsert single row ─────────────────────────────────────────────────────

  async upsertConfig(
    tenantId: string,
    sessionId: string,
    dto: UpsertExamSubjectConfigDto,
  ): Promise<ExamSubjectConfigRow> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const existing = await db.examSubjectConfig.findFirst({
        where: {
          tenant_id: tenantId,
          exam_session_id: sessionId,
          year_group_id: dto.year_group_id,
          subject_id: dto.subject_id,
        },
        select: { id: true },
      });

      if (existing) {
        await db.examSubjectConfig.update({
          where: { id: existing.id },
          data: {
            is_examinable: dto.is_examinable,
            paper_count: dto.paper_count,
            paper_1_duration_mins: dto.paper_1_duration_mins,
            paper_2_duration_mins: dto.paper_2_duration_mins ?? null,
            mode: dto.mode,
            invigilators_required: dto.invigilators_required,
          },
        });
      } else {
        await db.examSubjectConfig.create({
          data: {
            tenant_id: tenantId,
            exam_session_id: sessionId,
            year_group_id: dto.year_group_id,
            subject_id: dto.subject_id,
            is_examinable: dto.is_examinable,
            paper_count: dto.paper_count,
            paper_1_duration_mins: dto.paper_1_duration_mins,
            paper_2_duration_mins: dto.paper_2_duration_mins ?? null,
            mode: dto.mode,
            invigilators_required: dto.invigilators_required,
          },
        });
      }
    });

    const rows = await this.listConfigs(tenantId, sessionId);
    const match = rows.find(
      (r) => r.year_group_id === dto.year_group_id && r.subject_id === dto.subject_id,
    );
    if (!match) {
      throw new NotFoundException({
        error: {
          code: 'EXAM_SUBJECT_CONFIG_NOT_FOUND',
          message: 'Config row not found after upsert',
        },
      });
    }
    return match;
  }

  // ─── Bulk upsert (used by "mark all examinable" UX) ───────────────────────

  async bulkUpsert(
    tenantId: string,
    sessionId: string,
    dto: BulkUpsertExamSubjectConfigsDto,
  ): Promise<{ upserted: number }> {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    let count = 0;

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      for (const cfg of dto.configs) {
        const existing = await db.examSubjectConfig.findFirst({
          where: {
            tenant_id: tenantId,
            exam_session_id: sessionId,
            year_group_id: cfg.year_group_id,
            subject_id: cfg.subject_id,
          },
          select: { id: true },
        });

        if (existing) {
          await db.examSubjectConfig.update({
            where: { id: existing.id },
            data: {
              is_examinable: cfg.is_examinable,
              paper_count: cfg.paper_count,
              paper_1_duration_mins: cfg.paper_1_duration_mins,
              paper_2_duration_mins: cfg.paper_2_duration_mins ?? null,
              mode: cfg.mode,
              invigilators_required: cfg.invigilators_required,
            },
          });
        } else {
          await db.examSubjectConfig.create({
            data: {
              tenant_id: tenantId,
              exam_session_id: sessionId,
              year_group_id: cfg.year_group_id,
              subject_id: cfg.subject_id,
              is_examinable: cfg.is_examinable,
              paper_count: cfg.paper_count,
              paper_1_duration_mins: cfg.paper_1_duration_mins,
              paper_2_duration_mins: cfg.paper_2_duration_mins ?? null,
              mode: cfg.mode,
              invigilators_required: cfg.invigilators_required,
            },
          });
        }
        count++;
      }
    });

    return { upserted: count };
  }
}
