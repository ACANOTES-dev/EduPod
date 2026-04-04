import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { CreateParticipantDto } from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

// ─── Incident participant management ──────────────────────────────────────────

@Injectable()
export class BehaviourParticipantsService {
  private readonly logger = new Logger(BehaviourParticipantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
    private readonly sideEffects: BehaviourSideEffectsService,
  ) {}

  // ─── Add Participant ────────────────────────────────────────────────────

  async addParticipant(
    tenantId: string,
    incidentId: string,
    userId: string,
    dto: CreateParticipantDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.behaviourIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
        include: { category: true },
      });
      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found',
        });
      }

      // Build student snapshot if participant is a student
      let studentSnapshot: Record<string, unknown> | null = null;
      if (dto.participant_type === 'student' && dto.student_id) {
        const student = await db.student.findFirst({
          where: { id: dto.student_id, tenant_id: tenantId },
          include: {
            year_group: { select: { id: true, name: true } },
            class_enrolments: {
              where: { status: 'active' },
              include: {
                class_entity: { select: { name: true } },
              },
              take: 1,
            },
          },
        });
        if (!student) {
          throw new NotFoundException({
            code: 'STUDENT_NOT_FOUND',
            message: 'Student not found',
          });
        }

        studentSnapshot = {
          student_name: `${student.first_name} ${student.last_name}`,
          year_group_id: student.year_group?.id ?? null,
          year_group_name: student.year_group?.name ?? null,
          class_name: student.class_enrolments?.[0]?.class_entity?.name ?? null,
          has_send: false,
          house_id: null,
          house_name: null,
          had_active_intervention: false,
          active_intervention_ids: [],
        };
      }

      const participant = await db.behaviourIncidentParticipant.create({
        data: {
          tenant_id: tenantId,
          incident_id: incidentId,
          participant_type: dto.participant_type as $Enums.ParticipantType,
          student_id: dto.student_id ?? null,
          staff_id: dto.staff_id ?? null,
          parent_id: dto.parent_id ?? null,
          external_name: dto.external_name ?? null,
          role: (dto.role ?? 'subject') as $Enums.ParticipantRole,
          points_awarded: dto.participant_type === 'student' ? incident.category.point_value : 0,
          parent_visible: dto.parent_visible ?? true,
          notes: dto.notes ?? null,
          student_snapshot:
            studentSnapshot !== null ? (studentSnapshot as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'incident',
        incidentId,
        userId,
        'participant_added',
        null,
        {
          participant_id: participant.id,
          participant_type: dto.participant_type,
          student_id: dto.student_id ?? null,
        },
      );

      // Queue policy evaluation for the new participant
      if (dto.participant_type === 'student') {
        await this.sideEffects.emitPolicyEvaluation({
          tenant_id: tenantId,
          incident_id: incidentId,
          trigger: 'participant_added',
          triggered_at: new Date().toISOString(),
        });
      }

      return participant;
    });
  }

  // ─── Remove Participant ─────────────────────────────────────────────────

  async removeParticipant(
    tenantId: string,
    incidentId: string,
    participantId: string,
    userId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const participant = await db.behaviourIncidentParticipant.findFirst({
        where: {
          id: participantId,
          incident_id: incidentId,
          tenant_id: tenantId,
        },
      });
      if (!participant) {
        throw new NotFoundException({
          code: 'PARTICIPANT_NOT_FOUND',
          message: 'Participant not found',
        });
      }

      // Domain constraint: can't remove last student participant
      if (participant.participant_type === 'student') {
        const studentCount = await db.behaviourIncidentParticipant.count({
          where: {
            incident_id: incidentId,
            participant_type: 'student',
          },
        });
        if (studentCount <= 1) {
          throw new BadRequestException({
            code: 'LAST_STUDENT_PARTICIPANT',
            message: 'Cannot remove the last student participant from an incident',
          });
        }
      }

      await db.behaviourIncidentParticipant.delete({
        where: { id: participantId },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'incident',
        incidentId,
        userId,
        'participant_removed',
        {
          participant_id: participantId,
          participant_type: participant.participant_type,
          student_id: participant.student_id,
        },
        {},
      );

      return { success: true };
    });
  }
}
