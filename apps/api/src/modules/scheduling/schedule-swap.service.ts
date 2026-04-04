import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { EmergencyChangeDto, ExecuteSwapDto, ValidateSwapDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';

export interface SwapValidationResult {
  valid: boolean;
  violations: string[];
  impact: {
    teachers_affected: string[];
    rooms_changed: boolean;
    description: string;
  };
}

@Injectable()
export class ScheduleSwapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
  ) {}

  // ─── Validate Swap ────────────────────────────────────────────────────────

  async validateSwap(tenantId: string, dto: ValidateSwapDto): Promise<SwapValidationResult> {
    const [scheduleA, scheduleB] = await Promise.all([
      this.schedulesReadFacade.findByIdWithSwapContext(tenantId, dto.schedule_id_a),
      this.schedulesReadFacade.findByIdWithSwapContext(tenantId, dto.schedule_id_b),
    ]);

    if (!scheduleA) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_A_NOT_FOUND', message: 'Schedule A not found' },
      });
    }
    if (!scheduleB) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_B_NOT_FOUND', message: 'Schedule B not found' },
      });
    }

    const violations: string[] = [];

    // After swap: A's teacher would be at B's slot, B's teacher at A's slot
    // Check if A's teacher has a conflict at B's slot (excluding A and B themselves)
    if (scheduleA.teacher_staff_id) {
      const conflict = await this.schedulesReadFacade.hasConflict(tenantId, {
        excludeIds: [dto.schedule_id_a, dto.schedule_id_b],
        teacherStaffId: scheduleA.teacher_staff_id,
        weekday: scheduleB.weekday,
        startTime: scheduleB.start_time,
        endTime: scheduleB.end_time,
      });
      const conflictExists = conflict;
      if (conflictExists) {
        const name = scheduleA.teacher
          ? `${scheduleA.teacher.user.first_name} ${scheduleA.teacher.user.last_name}`.trim()
          : scheduleA.teacher_staff_id;
        violations.push(`${name} has a conflict at the target time slot`);
      }
    }

    if (scheduleB.teacher_staff_id) {
      const bConflict = await this.schedulesReadFacade.hasConflict(tenantId, {
        excludeIds: [dto.schedule_id_a, dto.schedule_id_b],
        teacherStaffId: scheduleB.teacher_staff_id,
        weekday: scheduleA.weekday,
        startTime: scheduleA.start_time,
        endTime: scheduleA.end_time,
      });
      if (bConflict) {
        const name = scheduleB.teacher
          ? `${scheduleB.teacher.user.first_name} ${scheduleB.teacher.user.last_name}`.trim()
          : scheduleB.teacher_staff_id;
        violations.push(`${name} has a conflict at the target time slot`);
      }
    }

    // Check room conflicts after swap
    if (scheduleA.room_id) {
      const roomConflict = await this.schedulesReadFacade.hasConflict(tenantId, {
        excludeIds: [dto.schedule_id_a, dto.schedule_id_b],
        roomId: scheduleA.room_id,
        weekday: scheduleB.weekday,
        startTime: scheduleB.start_time,
        endTime: scheduleB.end_time,
      });
      if (roomConflict) {
        violations.push(
          `Room ${scheduleA.room?.name ?? scheduleA.room_id} has a conflict at the target slot`,
        );
      }
    }

    if (scheduleB.room_id) {
      const roomConflict = await this.schedulesReadFacade.hasConflict(tenantId, {
        excludeIds: [dto.schedule_id_a, dto.schedule_id_b],
        roomId: scheduleB.room_id,
        weekday: scheduleA.weekday,
        startTime: scheduleA.start_time,
        endTime: scheduleA.end_time,
      });
      if (roomConflict) {
        violations.push(
          `Room ${scheduleB.room?.name ?? scheduleB.room_id} has a conflict at the target slot`,
        );
      }
    }

    const teachersAffected: string[] = [];
    if (scheduleA.teacher) {
      teachersAffected.push(
        `${scheduleA.teacher.user.first_name} ${scheduleA.teacher.user.last_name}`.trim(),
      );
    }
    if (scheduleB.teacher && scheduleB.teacher_staff_id !== scheduleA.teacher_staff_id) {
      teachersAffected.push(
        `${scheduleB.teacher.user.first_name} ${scheduleB.teacher.user.last_name}`.trim(),
      );
    }

    const classAName = scheduleA.class_entity?.name ?? 'Class A';
    const classBName = scheduleB.class_entity?.name ?? 'Class B';

    return {
      valid: violations.length === 0,
      violations,
      impact: {
        teachers_affected: teachersAffected,
        rooms_changed: scheduleA.room_id !== scheduleB.room_id,
        description: `Swapping ${classAName} (slot ${scheduleA.weekday}-P${scheduleA.period_order ?? '?'}) with ${classBName} (slot ${scheduleB.weekday}-P${scheduleB.period_order ?? '?'}). Affects ${teachersAffected.length} teacher(s).`,
      },
    };
  }

  // ─── Execute Swap ─────────────────────────────────────────────────────────

  async executeSwap(tenantId: string, userId: string, dto: ExecuteSwapDto) {
    // Validate first
    const validation = await this.validateSwap(tenantId, dto);
    if (!validation.valid) {
      throw new BadRequestException({
        error: {
          code: 'SWAP_CONSTRAINT_VIOLATION',
          message: 'Swap violates scheduling constraints',
          details: { violations: validation.violations },
        },
      });
    }

    const [scheduleA, scheduleB] = await Promise.all([
      this.schedulesReadFacade.findCoreById(tenantId, dto.schedule_id_a),
      this.schedulesReadFacade.findCoreById(tenantId, dto.schedule_id_b),
    ]);

    if (!scheduleA || !scheduleB) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'One or both schedules not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Swap teachers and rooms between the two schedules
      await db.schedule.update({
        where: { id: dto.schedule_id_a },
        data: {
          teacher_staff_id: scheduleB.teacher_staff_id,
          room_id: scheduleB.room_id,
        },
      });

      await db.schedule.update({
        where: { id: dto.schedule_id_b },
        data: {
          teacher_staff_id: scheduleA.teacher_staff_id,
          room_id: scheduleA.room_id,
        },
      });
    });

    return {
      swapped: true,
      schedule_id_a: dto.schedule_id_a,
      schedule_id_b: dto.schedule_id_b,
      swapped_by: userId,
      swapped_at: new Date().toISOString(),
      impact: validation.impact,
    };
  }

  // ─── Emergency Change ─────────────────────────────────────────────────────

  async emergencyChange(tenantId: string, userId: string, dto: EmergencyChangeDto) {
    const schedule = await this.schedulesReadFacade.findCoreById(tenantId, dto.schedule_id);

    if (!schedule) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      });
    }

    if (!dto.new_room_id && !dto.new_teacher_staff_id && !dto.cancel_period) {
      throw new BadRequestException({
        error: {
          code: 'NO_CHANGES',
          message:
            'At least one change must be specified: new_room_id, new_teacher_staff_id, or cancel_period',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      if (dto.cancel_period) {
        // End-date the schedule entry today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return db.schedule.update({
          where: { id: dto.schedule_id },
          data: { effective_end_date: today },
        });
      }

      const updateData: { room_id?: string | null; teacher_staff_id?: string | null } = {};
      if (dto.new_room_id !== undefined) {
        updateData.room_id = dto.new_room_id;
      }
      if (dto.new_teacher_staff_id !== undefined) {
        updateData.teacher_staff_id = dto.new_teacher_staff_id;
      }

      return db.schedule.update({
        where: { id: dto.schedule_id },
        data: updateData,
      });
    })) as unknown as { id: string; updated_at: Date };

    return {
      id: (updated as { id: string }).id,
      changed_by: userId,
      changed_at: new Date().toISOString(),
      reason: dto.reason,
      cancelled: dto.cancel_period ?? false,
    };
  }
}
