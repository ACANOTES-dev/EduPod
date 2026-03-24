import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CurveMethod, Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import type { ApplyCurveDto, UndoCurveDto } from '../dto/gradebook.dto';

interface ScoreRecord {
  student_id: string;
  raw_score: number | null;
}

interface BellParams {
  target_mean?: number;
  target_stddev?: number;
}

interface LinearShiftParams {
  shift?: number;
}

interface CustomMapping {
  from: number;
  to: number;
}

interface CustomParams {
  mappings?: CustomMapping[];
}

@Injectable()
export class GradeCurveService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Apply a grade curve to all grades for an assessment.
   * Stores before/after scores in audit log with can_undo = true.
   */
  async applyCurve(
    tenantId: string,
    assessmentId: string,
    userId: string,
    dto: ApplyCurveDto,
  ) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        max_score: true,
        curve_applied: true,
      },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    if (assessment.status === 'locked') {
      throw new ConflictException({
        code: 'ASSESSMENT_LOCKED',
        message: 'Cannot apply curve to a locked assessment',
      });
    }

    if (assessment.curve_applied !== 'none') {
      throw new ConflictException({
        code: 'CURVE_ALREADY_APPLIED',
        message: `A curve (${assessment.curve_applied}) has already been applied to this assessment. Undo the existing curve first.`,
      });
    }

    // Load all grades with a raw_score
    const grades = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        raw_score: { not: null },
      },
      select: { id: true, student_id: true, raw_score: true },
    });

    if (grades.length === 0) {
      throw new BadRequestException({
        code: 'NO_GRADES',
        message: 'No grades found to apply curve to',
      });
    }

    const maxScore = Number(assessment.max_score);
    const beforeScores: ScoreRecord[] = grades.map((g) => ({
      student_id: g.student_id,
      raw_score: g.raw_score != null ? Number(g.raw_score) : null,
    }));

    // Apply the curve transformation
    const afterScores: ScoreRecord[] = this.transformScores(
      beforeScores,
      maxScore,
      dto.method,
      dto.params,
    );

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Update each grade
      for (const after of afterScores) {
        if (after.raw_score === null) continue;

        const gradeRecord = grades.find((g) => g.student_id === after.student_id);
        if (!gradeRecord) continue;

        await db.grade.update({
          where: { id: gradeRecord.id },
          data: { raw_score: after.raw_score },
        });
      }

      // Update assessment curve metadata
      await db.assessment.update({
        where: { id: assessmentId },
        data: {
          curve_applied: dto.method as CurveMethod,
          curve_params_json: (dto.params ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        },
      });

      // Create audit record
      const audit = await db.gradeCurveAudit.create({
        data: {
          tenant_id: tenantId,
          assessment_id: assessmentId,
          applied_by_user_id: userId,
          applied_at: now,
          method: dto.method as CurveMethod,
          params_json: (dto.params ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
          before_scores: beforeScores as unknown as Parameters<typeof db.gradeCurveAudit.create>[0]['data']['before_scores'],
          after_scores: afterScores as unknown as Parameters<typeof db.gradeCurveAudit.create>[0]['data']['after_scores'],
          can_undo: true,
        },
      });

      return {
        audit_id: audit.id,
        grades_updated: afterScores.filter((s) => s.raw_score !== null).length,
        method: dto.method,
      };
    });
  }

  /**
   * Undo a curve application by reverting grades to before_scores.
   * Only allowed when can_undo = true on the audit record.
   */
  async undoCurve(
    tenantId: string,
    assessmentId: string,
    dto: UndoCurveDto,
  ) {
    const audit = await this.prisma.gradeCurveAudit.findFirst({
      where: {
        id: dto.audit_id,
        tenant_id: tenantId,
        assessment_id: assessmentId,
      },
      select: {
        id: true,
        can_undo: true,
        before_scores: true,
        method: true,
      },
    });

    if (!audit) {
      throw new NotFoundException({
        code: 'CURVE_AUDIT_NOT_FOUND',
        message: `Curve audit record with id "${dto.audit_id}" not found`,
      });
    }

    if (!audit.can_undo) {
      throw new ConflictException({
        code: 'UNDO_NOT_AVAILABLE',
        message: 'This curve cannot be undone because grades were manually edited after it was applied',
      });
    }

    const beforeScores = audit.before_scores as unknown as ScoreRecord[];

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Revert each grade
      for (const before of beforeScores) {
        const gradeRecord = await db.grade.findFirst({
          where: {
            tenant_id: tenantId,
            assessment_id: assessmentId,
            student_id: before.student_id,
          },
          select: { id: true },
        });

        if (!gradeRecord) continue;

        await db.grade.update({
          where: { id: gradeRecord.id },
          data: { raw_score: before.raw_score },
        });
      }

      // Reset assessment curve metadata
      await db.assessment.update({
        where: { id: assessmentId },
        data: {
          curve_applied: 'none',
          curve_params_json: Prisma.JsonNull,
        },
      });

      // Mark audit as no longer undoable
      await db.gradeCurveAudit.update({
        where: { id: dto.audit_id },
        data: { can_undo: false },
      });

      return {
        grades_reverted: beforeScores.length,
        method: audit.method,
      };
    });
  }

  /**
   * Get curve audit history for an assessment.
   */
  async getCurveHistory(tenantId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!assessment) {
      throw new NotFoundException({
        code: 'ASSESSMENT_NOT_FOUND',
        message: `Assessment with id "${assessmentId}" not found`,
      });
    }

    const data = await this.prisma.gradeCurveAudit.findMany({
      where: { tenant_id: tenantId, assessment_id: assessmentId },
      include: {
        applied_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
      orderBy: { applied_at: 'desc' },
    });

    return { data };
  }

  /**
   * Mark all curve audits for an assessment as can_undo = false.
   * Called when a grade is manually edited after a curve was applied.
   */
  async invalidateCurveUndo(tenantId: string, assessmentId: string) {
    await this.prisma.gradeCurveAudit.updateMany({
      where: {
        tenant_id: tenantId,
        assessment_id: assessmentId,
        can_undo: true,
      },
      data: { can_undo: false },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private transformScores(
    beforeScores: ScoreRecord[],
    maxScore: number,
    method: string,
    params: Record<string, unknown> | undefined,
  ): ScoreRecord[] {
    const scoredRecords = beforeScores.filter((s) => s.raw_score !== null);

    switch (method) {
      case 'linear_shift': {
        const shift = ((params as LinearShiftParams | undefined)?.shift) ?? 0;
        return beforeScores.map((s) => ({
          ...s,
          raw_score: s.raw_score !== null
            ? Math.min(maxScore, Math.max(0, s.raw_score + shift))
            : null,
        }));
      }

      case 'linear_scale': {
        const scores = scoredRecords.map((s) => s.raw_score as number);
        const highest = Math.max(...scores);
        if (highest === 0) return beforeScores;
        return beforeScores.map((s) => ({
          ...s,
          raw_score: s.raw_score !== null
            ? Math.min(maxScore, Math.round((s.raw_score / highest) * maxScore * 100) / 100)
            : null,
        }));
      }

      case 'sqrt': {
        return beforeScores.map((s) => ({
          ...s,
          raw_score: s.raw_score !== null && maxScore > 0
            ? Math.min(maxScore, Math.round(Math.sqrt(s.raw_score / maxScore) * maxScore * 100) / 100)
            : null,
        }));
      }

      case 'bell': {
        if (scoredRecords.length === 0) return beforeScores;

        const bellParams = (params as BellParams | undefined) ?? {};
        const targetMean = bellParams.target_mean ?? 75;
        const targetStddev = bellParams.target_stddev ?? 10;

        const scores = scoredRecords.map((s) => s.raw_score as number);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
        const stddev = Math.sqrt(variance);

        if (stddev === 0) return beforeScores;

        return beforeScores.map((s) => {
          if (s.raw_score === null) return s;
          const zScore = (s.raw_score - mean) / stddev;
          const newPercentage = targetMean + zScore * targetStddev;
          const newScore = (newPercentage / 100) * maxScore;
          return {
            ...s,
            raw_score: Math.min(maxScore, Math.max(0, Math.round(newScore * 100) / 100)),
          };
        });
      }

      case 'custom': {
        const customParams = (params as CustomParams | undefined) ?? {};
        const mappings = customParams.mappings ?? [];

        return beforeScores.map((s) => {
          if (s.raw_score === null) return s;

          // Find exact or nearest mapping
          const exactMapping = mappings.find((m) => m.from === s.raw_score);
          if (exactMapping) {
            return { ...s, raw_score: Math.min(maxScore, Math.max(0, exactMapping.to)) };
          }

          // Interpolate between nearest points
          const lower = mappings.filter((m) => m.from <= (s.raw_score as number)).sort((a, b) => b.from - a.from)[0];
          const upper = mappings.filter((m) => m.from >= (s.raw_score as number)).sort((a, b) => a.from - b.from)[0];

          if (lower && upper && lower.from !== upper.from) {
            const ratio = ((s.raw_score as number) - lower.from) / (upper.from - lower.from);
            const interpolated = lower.to + ratio * (upper.to - lower.to);
            return { ...s, raw_score: Math.min(maxScore, Math.max(0, Math.round(interpolated * 100) / 100)) };
          }

          return s;
        });
      }

      default:
        return beforeScores;
    }
  }
}
