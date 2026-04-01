import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type { CreateManualAwardDto, ListAwardsQuery } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

/** Common incident status filter for active, non-withdrawn incidents. */
const ACTIVE_INCIDENT_FILTER = {
  retention_status: 'active' as $Enums.RetentionStatus,
  status: {
    notIn: ['draft', 'withdrawn'] as $Enums.IncidentStatus[],
  },
};

/** Shape of the award type fields needed for eligibility checks. */
interface AwardTypeEligibility {
  id: string;
  repeat_mode: string;
  repeat_max_per_year: number | null;
}

@Injectable()
export class BehaviourAwardService {
  private readonly logger = new Logger(BehaviourAwardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
    // TODO(M-17): Migrate to BehaviourSideEffectsService
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Create Manual Award ──────────────────────────────────────────────────

  async createManualAward(tenantId: string, userId: string, dto: CreateManualAwardDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Load award type
        const awardType = await db.behaviourAwardType.findFirst({
          where: {
            id: dto.award_type_id,
            tenant_id: tenantId,
            is_active: true,
          },
        });
        if (!awardType) {
          throw new NotFoundException({
            code: 'AWARD_TYPE_NOT_FOUND',
            message: 'Award type not found or inactive',
          });
        }

        // Validate student exists
        const student = await db.student.findFirst({
          where: { id: dto.student_id, tenant_id: tenantId },
        });
        if (!student) {
          throw new NotFoundException({
            code: 'STUDENT_NOT_FOUND',
            message: 'Student not found',
          });
        }

        // Find current academic year
        const academicYear = await db.academicYear.findFirst({
          where: { tenant_id: tenantId, status: 'active' },
        });
        if (!academicYear) {
          throw new BadRequestException({
            code: 'NO_ACTIVE_ACADEMIC_YEAR',
            message: 'No active academic year found',
          });
        }

        // Find current academic period (optional, for once_per_period)
        const now = new Date();
        const currentPeriod = await db.academicPeriod.findFirst({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYear.id,
            start_date: { lte: now },
            end_date: { gte: now },
          },
        });

        // Check eligibility based on repeat_mode
        const eligible = await this.checkAwardEligibility(
          db,
          tenantId,
          dto.student_id,
          awardType,
          academicYear.id,
          currentPeriod?.id ?? null,
        );
        if (!eligible) {
          throw new ConflictException({
            code: 'AWARD_NOT_ELIGIBLE',
            message: 'Student is not eligible for this award based on repeat mode rules',
          });
        }

        // Compute fresh points for this student
        const pointsAtAward = await this.computeFreshStudentPoints(db, tenantId, dto.student_id);

        // Create the award
        const award = await db.behaviourRecognitionAward.create({
          data: {
            tenant_id: tenantId,
            student_id: dto.student_id,
            award_type_id: dto.award_type_id,
            points_at_award: pointsAtAward,
            awarded_by_id: userId,
            awarded_at: now,
            academic_year_id: academicYear.id,
            triggered_by_incident_id: null,
            notes: dto.notes ?? null,
          },
        });

        // Handle tier supersession
        if (awardType.supersedes_lower_tiers && awardType.tier_group) {
          await this.handleTierSupersession(
            db,
            tenantId,
            dto.student_id,
            awardType.tier_group,
            awardType.tier_level ?? 0,
            award.id,
          );
        }

        // Enqueue parent notification
        try {
          await this.notificationsQueue.add('behaviour:parent-notification', {
            tenant_id: tenantId,
            template_key: 'behaviour_award_parent',
            student_ids: [dto.student_id],
            award_id: award.id,
          });
        } catch (err) {
          this.logger.warn(
            'Failed to enqueue behaviour:parent-notification for award — award creation succeeded',
            err,
          );
        }

        return award;
      },
      { timeout: 30000 },
    );
  }

  // ─── Auto Award Check (called by worker) ──────────────────────────────────

  async checkAndCreateAutoAwards(
    tx: PrismaService,
    tenantId: string,
    incidentId: string,
    studentIds: string[],
    academicYearId: string,
    academicPeriodId: string | null,
  ): Promise<void> {
    for (const studentId of studentIds) {
      // Compute fresh points for the student
      const currentPoints = await this.computeFreshStudentPoints(tx, tenantId, studentId);

      // Load active award types with thresholds, ordered by tier_level DESC
      const awardTypes = await tx.behaviourAwardType.findMany({
        where: {
          tenant_id: tenantId,
          is_active: true,
          points_threshold: { not: null },
        },
        orderBy: { tier_level: 'desc' },
      });

      for (const awardType of awardTypes) {
        // Check points meet threshold
        if (awardType.points_threshold === null || currentPoints < awardType.points_threshold) {
          continue;
        }

        // Dedup: skip if already awarded for this incident + award type
        const existingForIncident = await tx.behaviourRecognitionAward.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
            triggered_by_incident_id: incidentId,
          },
        });
        if (existingForIncident) {
          continue;
        }

        // Check repeat_mode eligibility
        const eligible = await this.checkAwardEligibility(
          tx,
          tenantId,
          studentId,
          awardType,
          academicYearId,
          academicPeriodId,
        );
        if (!eligible) {
          continue;
        }

        // Create the auto award
        const award = await tx.behaviourRecognitionAward.create({
          data: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
            points_at_award: currentPoints,
            awarded_by_id: '00000000-0000-0000-0000-000000000000', // system
            awarded_at: new Date(),
            academic_year_id: academicYearId,
            triggered_by_incident_id: incidentId,
            notes: null,
          },
        });

        // Handle tier supersession
        if (awardType.supersedes_lower_tiers && awardType.tier_group) {
          await this.handleTierSupersession(
            tx,
            tenantId,
            studentId,
            awardType.tier_group,
            awardType.tier_level ?? 0,
            award.id,
          );
        }

        // Enqueue parent notification for auto-award
        try {
          await this.notificationsQueue.add('behaviour:parent-notification', {
            tenant_id: tenantId,
            template_key: 'behaviour_award_parent',
            student_ids: [studentId],
            award_id: award.id,
          });
        } catch (err) {
          this.logger.warn(
            'Failed to enqueue behaviour:parent-notification for auto-award — award creation succeeded',
            err,
          );
        }
      }
    }
  }

  // ─── List Awards ──────────────────────────────────────────────────────────

  async listAwards(tenantId: string, query: ListAwardsQuery) {
    const where: Prisma.BehaviourRecognitionAwardWhereInput = {
      tenant_id: tenantId,
    };

    if (query.student_id) {
      where.student_id = query.student_id;
    }
    if (query.award_type_id) {
      where.award_type_id = query.award_type_id;
    }
    if (query.academic_year_id) {
      where.academic_year_id = query.academic_year_id;
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourRecognitionAward.findMany({
        where,
        orderBy: { awarded_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
          award_type: {
            select: {
              id: true,
              name: true,
              name_ar: true,
              icon: true,
              color: true,
              tier_group: true,
              tier_level: true,
            },
          },
          awarded_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourRecognitionAward.count({ where }),
    ]);

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Private: Check Award Eligibility ─────────────────────────────────────

  private async checkAwardEligibility(
    tx: PrismaService,
    tenantId: string,
    studentId: string,
    awardType: AwardTypeEligibility,
    academicYearId: string,
    academicPeriodId: string | null,
  ): Promise<boolean> {
    switch (awardType.repeat_mode) {
      case 'unlimited':
        break;

      case 'once_ever': {
        const existing = await tx.behaviourRecognitionAward.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
          },
        });
        if (existing) return false;
        break;
      }

      case 'once_per_year': {
        const existingThisYear = await tx.behaviourRecognitionAward.findFirst({
          where: {
            tenant_id: tenantId,
            student_id: studentId,
            award_type_id: awardType.id,
            academic_year_id: academicYearId,
          },
        });
        if (existingThisYear) return false;
        break;
      }

      case 'once_per_period': {
        if (academicPeriodId) {
          // Look up the period date range and check awards within it
          const period = await tx.academicPeriod.findUnique({
            where: { id: academicPeriodId },
            select: { start_date: true, end_date: true },
          });
          if (period) {
            const existingThisPeriod = await tx.behaviourRecognitionAward.findFirst({
              where: {
                tenant_id: tenantId,
                student_id: studentId,
                award_type_id: awardType.id,
                academic_year_id: academicYearId,
                awarded_at: {
                  gte: period.start_date,
                  lte: period.end_date,
                },
              },
            });
            if (existingThisPeriod) return false;
          }
        }
        // If no period provided, allow the award (cannot check period constraint)
        break;
      }

      default:
        // Unknown repeat_mode treated as unlimited
        break;
    }

    // Check repeat_max_per_year if set
    if (awardType.repeat_max_per_year !== null) {
      const countThisYear = await tx.behaviourRecognitionAward.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          award_type_id: awardType.id,
          academic_year_id: academicYearId,
        },
      });
      if (countThisYear >= awardType.repeat_max_per_year) {
        return false;
      }
    }

    return true;
  }

  // ─── Private: Compute Fresh Student Points ────────────────────────────────

  private async computeFreshStudentPoints(
    tx: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<number> {
    const result = await tx.behaviourIncidentParticipant.aggregate({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        participant_type: 'student',
        incident: ACTIVE_INCIDENT_FILTER,
      },
      _sum: { points_awarded: true },
    });
    return result._sum.points_awarded ?? 0;
  }

  // ─── Private: Handle Tier Supersession ────────────────────────────────────

  private async handleTierSupersession(
    tx: PrismaService,
    tenantId: string,
    studentId: string,
    tierGroup: string,
    currentTierLevel: number,
    newAwardId: string,
  ): Promise<void> {
    // Find lower-tier awards for this student in the same tier_group
    // that haven't already been superseded
    const lowerTierAwards = await tx.behaviourRecognitionAward.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        superseded_by_id: null,
        id: { not: newAwardId },
        award_type: {
          tier_group: tierGroup,
          tier_level: { lt: currentTierLevel },
        },
      },
      select: { id: true },
    });

    if (lowerTierAwards.length > 0) {
      await tx.behaviourRecognitionAward.updateMany({
        where: {
          id: { in: lowerTierAwards.map((a) => a.id) },
        },
        data: { superseded_by_id: newAwardId },
      });
    }
  }
}
