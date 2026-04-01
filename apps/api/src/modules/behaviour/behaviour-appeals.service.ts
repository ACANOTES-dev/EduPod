import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import {
  isValidAppealTransition,
  SANCTION_PARENT_VISIBLE_FIELDS,
  type AppealListQuery,
  type AppealStatusKey,
  type RecordAppealDecisionDto,
  type SubmitAppealDto,
  type UpdateAppealDto,
  type WithdrawAppealDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourAmendmentsService } from './behaviour-amendments.service';
import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourHistoryService } from './behaviour-history.service';

/**
 * Map DTO appellant_type strings (API-facing) to Prisma enum names.
 * DTO uses 'parent'/'student'/'staff'; Prisma uses 'parent_appellant'/'student_appellant'/'staff_appellant'.
 */
const APPELLANT_TYPE_MAP: Record<string, $Enums.AppellantType> = {
  parent: 'parent_appellant' as $Enums.AppellantType,
  student: 'student_appellant' as $Enums.AppellantType,
  staff: 'staff_appellant' as $Enums.AppellantType,
};

/**
 * Map DTO grounds_category strings to Prisma enum names.
 * DTO uses 'other'; Prisma uses 'other_grounds'.
 */
function toGroundsCategory(value: string): $Enums.GroundsCategory {
  return value === 'other'
    ? ('other_grounds' as $Enums.GroundsCategory)
    : (value as $Enums.GroundsCategory);
}

/**
 * Map DTO appeal_status strings to Prisma enum names.
 * DTO uses 'withdrawn'; Prisma uses 'withdrawn_appeal'.
 */
function toAppealStatus(value: string): $Enums.AppealStatus {
  return value === 'withdrawn'
    ? ('withdrawn_appeal' as $Enums.AppealStatus)
    : (value as $Enums.AppealStatus);
}

/**
 * Incident parent-visible fields for amendment tracking.
 */
const INCIDENT_PARENT_VISIBLE_FIELDS = [
  'category_id',
  'parent_description',
  'parent_description_ar',
  'occurred_at',
] as const;

@Injectable()
export class BehaviourAppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceService: SequenceService,
    private readonly historyService: BehaviourHistoryService,
    private readonly amendmentsService: BehaviourAmendmentsService,
    @Optional() private readonly documentService: BehaviourDocumentService | null,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── Submit Appeal ──────────────────────────────────────────────────────────

  async submit(tenantId: string, userId: string, dto: SubmitAppealDto) {
    // Validate entity_type='sanction' implies sanction_id present
    if (dto.entity_type === 'sanction' && !dto.sanction_id) {
      throw new BadRequestException({
        code: 'SANCTION_ID_REQUIRED',
        message: 'sanction_id is required when entity_type is sanction',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Verify incident exists
        const incident = await db.behaviourIncident.findFirst({
          where: { id: dto.incident_id, tenant_id: tenantId },
        });
        if (!incident) {
          throw new NotFoundException({
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found',
          });
        }

        // If sanction-level appeal, verify sanction exists
        let sanction: Awaited<ReturnType<typeof db.behaviourSanction.findFirst>> = null;
        if (dto.sanction_id) {
          sanction = await db.behaviourSanction.findFirst({
            where: { id: dto.sanction_id, tenant_id: tenantId },
          });
          if (!sanction) {
            throw new NotFoundException({
              code: 'SANCTION_NOT_FOUND',
              message: 'Sanction not found',
            });
          }

          // Check no open appeal exists for this sanction
          const existingAppeal = await db.behaviourAppeal.findFirst({
            where: {
              tenant_id: tenantId,
              sanction_id: dto.sanction_id,
              status: {
                notIn: [
                  'decided' as $Enums.AppealStatus,
                  'withdrawn_appeal' as $Enums.AppealStatus,
                ],
              },
            },
          });
          if (existingAppeal) {
            throw new BadRequestException({
              code: 'OPEN_APPEAL_EXISTS',
              message: 'An open appeal already exists for this sanction',
            });
          }
        }

        // Generate appeal number
        const appealNumber = await this.sequenceService.nextNumber(
          tenantId,
          'behaviour_appeal',
          tx,
          'AP',
        );

        // Create the appeal
        const appeal = await db.behaviourAppeal.create({
          data: {
            tenant_id: tenantId,
            appeal_number: appealNumber,
            entity_type: dto.entity_type,
            incident_id: dto.incident_id,
            sanction_id: dto.sanction_id ?? null,
            student_id: dto.student_id,
            appellant_type:
              APPELLANT_TYPE_MAP[dto.appellant_type] ??
              ('parent_appellant' as $Enums.AppellantType),
            appellant_parent_id: dto.appellant_parent_id ?? null,
            appellant_staff_id: dto.appellant_staff_id ?? null,
            status: 'submitted' as $Enums.AppealStatus,
            grounds: dto.grounds,
            grounds_category: toGroundsCategory(dto.grounds_category),
            submitted_at: new Date(),
          },
        });

        // If sanction is 'scheduled', transition to 'appealed'
        if (sanction && sanction.status === 'scheduled') {
          await db.behaviourSanction.update({
            where: { id: sanction.id },
            data: { status: 'appealed' as $Enums.SanctionStatus },
          });

          await this.historyService.recordHistory(
            db,
            tenantId,
            'sanction',
            sanction.id,
            userId,
            'status_changed',
            { status: sanction.status },
            { status: 'appealed', appeal_id: appeal.id },
          );
        }

        // Set legal holds on incident, sanction, and linked entities
        const legalHoldEntities: Array<{
          entity_type: $Enums.LegalHoldEntityType;
          entity_id: string;
        }> = [
          {
            entity_type: 'incident' as $Enums.LegalHoldEntityType,
            entity_id: dto.incident_id,
          },
        ];
        if (dto.sanction_id) {
          legalHoldEntities.push({
            entity_type: 'sanction' as $Enums.LegalHoldEntityType,
            entity_id: dto.sanction_id,
          });
        }
        legalHoldEntities.push({
          entity_type: 'appeal' as $Enums.LegalHoldEntityType,
          entity_id: appeal.id,
        });

        for (const entity of legalHoldEntities) {
          // Only set if no active hold exists
          const existingHold = await db.behaviourLegalHold.findFirst({
            where: {
              tenant_id: tenantId,
              entity_type: entity.entity_type,
              entity_id: entity.entity_id,
              status: 'active_hold' as $Enums.LegalHoldStatus,
            },
          });
          if (!existingHold) {
            await db.behaviourLegalHold.create({
              data: {
                tenant_id: tenantId,
                entity_type: entity.entity_type,
                entity_id: entity.entity_id,
                hold_reason: `Appeal ${appealNumber} submitted`,
                legal_basis: 'Active appeal proceedings',
                set_by_id: userId,
              },
            });
          }
        }

        // If appeal links to an exclusion case, set exclusion_cases.appeal_id
        if (dto.sanction_id) {
          const exclusionCase = await db.behaviourExclusionCase.findFirst({
            where: {
              tenant_id: tenantId,
              sanction_id: dto.sanction_id,
              appeal_id: null,
            },
          });
          if (exclusionCase) {
            await db.behaviourExclusionCase.update({
              where: { id: exclusionCase.id },
              data: { appeal_id: appeal.id },
            });
          }
        }

        // Create appeal_review task (due = submitted_at + 5 business days)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7); // ~5 school days approximation
        await db.behaviourTask.create({
          data: {
            tenant_id: tenantId,
            task_type: 'appeal_review' as $Enums.BehaviourTaskType,
            entity_type: 'appeal' as $Enums.BehaviourTaskEntityType,
            entity_id: appeal.id,
            title: `Review appeal ${appealNumber}`,
            assigned_to_id: userId,
            created_by_id: userId,
            priority: 'high' as $Enums.TaskPriority,
            status: 'pending' as $Enums.BehaviourTaskStatus,
            due_date: dueDate,
          },
        });

        // Record entity history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'appeal',
          appeal.id,
          userId,
          'created',
          null,
          {
            status: 'submitted',
            entity_type: dto.entity_type,
            incident_id: dto.incident_id,
            sanction_id: dto.sanction_id ?? null,
            student_id: dto.student_id,
            grounds_category: dto.grounds_category,
          },
        );

        return appeal;
      },
      { timeout: 30000 },
    );
  }

  // ─── List Appeals ───────────────────────────────────────────────────────────

  async list(tenantId: string, filters: AppealListQuery) {
    const where: Prisma.BehaviourAppealWhereInput = {
      tenant_id: tenantId,
      retention_status: 'active' as $Enums.RetentionStatus,
    };

    if (filters.status) {
      where.status = toAppealStatus(filters.status);
    }
    if (filters.grounds_category) {
      where.grounds_category = toGroundsCategory(filters.grounds_category);
    }
    if (filters.student_id) {
      where.student_id = filters.student_id;
    }
    if (filters.entity_type) {
      where.entity_type = filters.entity_type;
    }
    if (filters.reviewer_id) {
      where.reviewer_id = filters.reviewer_id;
    }
    if (filters.date_from || filters.date_to) {
      const submittedAt: Record<string, Date> = {};
      if (filters.date_from) submittedAt.gte = new Date(filters.date_from);
      if (filters.date_to) submittedAt.lte = new Date(filters.date_to);
      where.submitted_at = submittedAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.behaviourAppeal.findMany({
        where,
        orderBy: { submitted_at: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          incident: {
            select: {
              id: true,
              incident_number: true,
              description: true,
              status: true,
            },
          },
          sanction: {
            select: {
              id: true,
              sanction_number: true,
              type: true,
              status: true,
            },
          },
          reviewer: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourAppeal.count({ where }),
    ]);

    return {
      data,
      meta: { page: filters.page, pageSize: filters.pageSize, total },
    };
  }

  // ─── Get By ID ──────────────────────────────────────────────────────────────

  async getById(tenantId: string, id: string) {
    const appeal = await this.prisma.behaviourAppeal.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
          },
        },
        incident: {
          select: {
            id: true,
            incident_number: true,
            description: true,
            status: true,
            occurred_at: true,
            category: {
              select: {
                id: true,
                name: true,
                name_ar: true,
                severity: true,
              },
            },
          },
        },
        sanction: {
          select: {
            id: true,
            sanction_number: true,
            type: true,
            status: true,
            scheduled_date: true,
            suspension_start_date: true,
            suspension_end_date: true,
          },
        },
        reviewer: {
          select: { id: true, first_name: true, last_name: true },
        },
        decided_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        exclusion_cases: {
          select: {
            id: true,
            case_number: true,
            type: true,
            status: true,
          },
        },
      },
    });

    if (!appeal) {
      throw new NotFoundException({
        code: 'APPEAL_NOT_FOUND',
        message: 'Appeal not found',
      });
    }

    return appeal;
  }

  // ─── Update Appeal ──────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateAppealDto, userId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const appeal = await db.behaviourAppeal.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!appeal) {
        throw new NotFoundException({
          code: 'APPEAL_NOT_FOUND',
          message: 'Appeal not found',
        });
      }

      // Cannot update decided or withdrawn appeals
      if (appeal.status === 'decided' || appeal.status === 'withdrawn_appeal') {
        throw new BadRequestException({
          code: 'APPEAL_CLOSED',
          message: `Cannot update appeal with status "${appeal.status}"`,
        });
      }

      const updateData: Prisma.BehaviourAppealUpdateInput = {};
      const previousValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      let targetStatus: $Enums.AppealStatus | null = null;

      // Handle reviewer assignment
      if (dto.reviewer_id !== undefined) {
        previousValues.reviewer_id = appeal.reviewer_id;
        newValues.reviewer_id = dto.reviewer_id;
        updateData.reviewer = { connect: { id: dto.reviewer_id } };

        // Assigning a reviewer moves from submitted -> under_review
        if (appeal.status === 'submitted') {
          targetStatus = 'under_review' as $Enums.AppealStatus;
        }
      }

      // Handle hearing date
      if (dto.hearing_date !== undefined) {
        previousValues.hearing_date = appeal.hearing_date;
        newValues.hearing_date = dto.hearing_date;
        updateData.hearing_date = new Date(dto.hearing_date);

        // Setting hearing moves to hearing_scheduled
        if (appeal.status === 'submitted' || appeal.status === 'under_review') {
          targetStatus = 'hearing_scheduled' as $Enums.AppealStatus;
        }
      }

      // Handle hearing attendees
      if (dto.hearing_attendees !== undefined) {
        previousValues.hearing_attendees = appeal.hearing_attendees;
        newValues.hearing_attendees = dto.hearing_attendees;
        updateData.hearing_attendees = dto.hearing_attendees as unknown as Prisma.InputJsonValue;
      }

      if (Object.keys(newValues).length === 0) {
        return appeal;
      }

      // Apply status transition if applicable
      if (targetStatus) {
        const currentStatus = appeal.status as AppealStatusKey;
        const target = targetStatus as AppealStatusKey;
        if (isValidAppealTransition(currentStatus, target)) {
          previousValues.status = appeal.status;
          newValues.status = targetStatus;
          updateData.status = targetStatus;
        }
      }

      const updated = await db.behaviourAppeal.update({
        where: { id },
        data: updateData,
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'appeal',
        id,
        userId,
        'updated',
        previousValues,
        newValues,
      );

      // Auto-generate hearing invite when hearing date is set
      if (dto.hearing_date !== undefined && this.documentService) {
        try {
          await this.documentService.autoGenerateDocument(
            db,
            tenantId,
            userId,
            'appeal_hearing_invite',
            'appeal',
            appeal.id,
            appeal.student_id,
            'en',
          );
        } catch (err) {
          console.error(
            '[BehaviourAppealsService.update] document generation failed',
            err instanceof Error ? err.stack : err,
          );
        }
      }

      return updated;
    });
  }

  // ─── Decide Appeal ──────────────────────────────────────────────────────────

  async decide(tenantId: string, id: string, userId: string, dto: RecordAppealDecisionDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        const appeal = await db.behaviourAppeal.findFirst({
          where: { id, tenant_id: tenantId },
          include: {
            sanction: true,
            incident: true,
            exclusion_cases: true,
          },
        });
        if (!appeal) {
          throw new NotFoundException({
            code: 'APPEAL_NOT_FOUND',
            message: 'Appeal not found',
          });
        }

        // Validate appeal is in a decidable status
        const decidableStatuses: $Enums.AppealStatus[] = [
          'submitted' as $Enums.AppealStatus,
          'under_review' as $Enums.AppealStatus,
          'hearing_scheduled' as $Enums.AppealStatus,
        ];
        if (!decidableStatuses.includes(appeal.status)) {
          throw new BadRequestException({
            code: 'APPEAL_NOT_DECIDABLE',
            message: `Cannot decide appeal with status "${appeal.status}"`,
          });
        }

        // Build update data for the appeal
        const appealUpdate: Prisma.BehaviourAppealUpdateInput = {
          status: 'decided' as $Enums.AppealStatus,
          decision: dto.decision as $Enums.AppealDecision,
          decision_reasoning: dto.decision_reasoning,
          decided_by: { connect: { id: userId } },
          decided_at: new Date(),
        };
        if (dto.hearing_notes) {
          appealUpdate.hearing_notes = dto.hearing_notes;
        }
        if (dto.hearing_attendees) {
          appealUpdate.hearing_attendees =
            dto.hearing_attendees as unknown as Prisma.InputJsonValue;
        }

        // Apply decision outcome
        switch (dto.decision) {
          case 'upheld_original': {
            // Sanction returns from appealed -> scheduled
            if (appeal.sanction && appeal.sanction.status === 'appealed') {
              await db.behaviourSanction.update({
                where: { id: appeal.sanction.id },
                data: {
                  status: 'scheduled' as $Enums.SanctionStatus,
                  appeal_outcome: 'upheld' as $Enums.AppealOutcome,
                  appeal_notes: dto.decision_reasoning,
                },
              });

              await this.historyService.recordHistory(
                db,
                tenantId,
                'sanction',
                appeal.sanction.id,
                userId,
                'status_changed',
                { status: 'appealed' },
                {
                  status: 'scheduled',
                  appeal_outcome: 'upheld',
                  appeal_id: appeal.id,
                },
              );
            }
            break;
          }

          case 'modified': {
            // Apply amendments to the sanction
            const resultingAmendments: Array<Record<string, unknown>> = [];

            if (dto.amendments && dto.amendments.length > 0) {
              for (const amendment of dto.amendments) {
                resultingAmendments.push({
                  entity_type: amendment.entity_type,
                  entity_id: amendment.entity_id,
                  field: amendment.field,
                  new_value: amendment.new_value,
                });

                // Apply field-level amendment to the entity
                if (amendment.entity_type === 'sanction' && appeal.sanction) {
                  const sanctionFieldUpdate: Record<string, unknown> = {};
                  const prevSanctionValue = (appeal.sanction as unknown as Record<string, unknown>)[
                    amendment.field
                  ];
                  sanctionFieldUpdate[amendment.field] = amendment.new_value;

                  await db.behaviourSanction.update({
                    where: { id: amendment.entity_id },
                    data: sanctionFieldUpdate,
                  });

                  // Check if this is a parent-visible field and create amendment notice
                  if (
                    SANCTION_PARENT_VISIBLE_FIELDS.includes(
                      amendment.field as (typeof SANCTION_PARENT_VISIBLE_FIELDS)[number],
                    )
                  ) {
                    await this.amendmentsService.createAmendmentNotice({
                      tenantId,
                      entityType: 'sanction',
                      entityId: amendment.entity_id,
                      changedById: userId,
                      previousValues: {
                        [amendment.field]: prevSanctionValue,
                      },
                      newValues: {
                        [amendment.field]: amendment.new_value,
                      },
                      reason: `Appeal ${appeal.appeal_number} decision: modified`,
                      amendmentType: 'correction',
                    });
                  }
                }

                if (amendment.entity_type === 'incident' && appeal.incident) {
                  const incidentFieldUpdate: Record<string, unknown> = {};
                  const prevIncidentValue = (appeal.incident as unknown as Record<string, unknown>)[
                    amendment.field
                  ];
                  incidentFieldUpdate[amendment.field] = amendment.new_value;

                  await db.behaviourIncident.update({
                    where: { id: amendment.entity_id },
                    data: incidentFieldUpdate,
                  });

                  // Check if this is a parent-visible field
                  if (
                    INCIDENT_PARENT_VISIBLE_FIELDS.includes(
                      amendment.field as (typeof INCIDENT_PARENT_VISIBLE_FIELDS)[number],
                    )
                  ) {
                    await this.amendmentsService.createAmendmentNotice({
                      tenantId,
                      entityType: 'incident',
                      entityId: amendment.entity_id,
                      changedById: userId,
                      previousValues: {
                        [amendment.field]: prevIncidentValue,
                      },
                      newValues: {
                        [amendment.field]: amendment.new_value,
                      },
                      reason: `Appeal ${appeal.appeal_number} decision: modified`,
                      amendmentType: 'correction',
                    });
                  }
                }
              }
            }

            // Update sanction appeal_outcome
            if (appeal.sanction && appeal.sanction.status === 'appealed') {
              await db.behaviourSanction.update({
                where: { id: appeal.sanction.id },
                data: {
                  status: 'scheduled' as $Enums.SanctionStatus,
                  appeal_outcome: 'modified_appeal' as $Enums.AppealOutcome,
                  appeal_notes: dto.decision_reasoning,
                },
              });

              await this.historyService.recordHistory(
                db,
                tenantId,
                'sanction',
                appeal.sanction.id,
                userId,
                'status_changed',
                { status: 'appealed' },
                {
                  status: 'scheduled',
                  appeal_outcome: 'modified',
                  appeal_id: appeal.id,
                },
              );
            }

            appealUpdate.resulting_amendments =
              resultingAmendments as unknown as Prisma.InputJsonValue;
            break;
          }

          case 'overturned': {
            // Sanction -> cancelled
            if (appeal.sanction) {
              await db.behaviourSanction.update({
                where: { id: appeal.sanction.id },
                data: {
                  status: 'cancelled' as $Enums.SanctionStatus,
                  appeal_outcome: 'overturned_appeal' as $Enums.AppealOutcome,
                  appeal_notes: dto.decision_reasoning,
                },
              });

              await this.historyService.recordHistory(
                db,
                tenantId,
                'sanction',
                appeal.sanction.id,
                userId,
                'status_changed',
                { status: appeal.sanction.status },
                {
                  status: 'cancelled',
                  appeal_outcome: 'overturned',
                  appeal_id: appeal.id,
                },
              );
            }

            // Incident -> closed_after_appeal
            await db.behaviourIncident.update({
              where: { id: appeal.incident_id },
              data: {
                status: 'closed_after_appeal' as $Enums.IncidentStatus,
              },
            });

            await this.historyService.recordHistory(
              db,
              tenantId,
              'incident',
              appeal.incident_id,
              userId,
              'status_changed',
              { status: appeal.incident.status },
              {
                status: 'closed_after_appeal',
                appeal_id: appeal.id,
              },
            );

            // Exclusion case -> overturned if exists
            if (appeal.exclusion_cases.length > 0) {
              for (const excCase of appeal.exclusion_cases) {
                await db.behaviourExclusionCase.update({
                  where: { id: excCase.id },
                  data: {
                    status: 'overturned' as $Enums.ExclusionStatus,
                  },
                });

                await this.historyService.recordHistory(
                  db,
                  tenantId,
                  'exclusion_case',
                  excCase.id,
                  userId,
                  'status_changed',
                  { status: excCase.status },
                  {
                    status: 'overturned',
                    appeal_id: appeal.id,
                  },
                );
              }
            }
            break;
          }
        }

        // Update the appeal record
        const updatedAppeal = await db.behaviourAppeal.update({
          where: { id },
          data: appealUpdate,
        });

        // Record appeal entity history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'appeal',
          id,
          userId,
          'decided',
          { status: appeal.status },
          {
            status: 'decided',
            decision: dto.decision,
          },
        );

        // Auto-generate appeal decision letter
        if (this.documentService) {
          try {
            await this.documentService.autoGenerateDocument(
              db,
              tenantId,
              userId,
              'appeal_decision_letter',
              'appeal',
              appeal.id,
              appeal.student_id,
              'en',
            );
          } catch (err) {
            console.error(
              '[BehaviourAppealsService.decide] document generation failed',
              err instanceof Error ? err.stack : err,
            );
          }
        }

        return updatedAppeal;
      },
      { timeout: 30000 },
    );
  }

  // ─── Withdraw Appeal ────────────────────────────────────────────────────────

  async withdraw(tenantId: string, id: string, userId: string, dto: WithdrawAppealDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const appeal = await db.behaviourAppeal.findFirst({
        where: { id, tenant_id: tenantId },
        include: { sanction: true },
      });
      if (!appeal) {
        throw new NotFoundException({
          code: 'APPEAL_NOT_FOUND',
          message: 'Appeal not found',
        });
      }

      // Validate status allows withdrawal
      const currentStatus = appeal.status as AppealStatusKey;
      const targetStatus = 'withdrawn_appeal' as AppealStatusKey;
      if (!isValidAppealTransition(currentStatus, targetStatus)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot withdraw appeal with status "${appeal.status}"`,
        });
      }

      // Withdraw the appeal
      const updated = await db.behaviourAppeal.update({
        where: { id },
        data: {
          status: 'withdrawn_appeal' as $Enums.AppealStatus,
        },
      });

      // If sanction was appealed, transition back to scheduled
      if (appeal.sanction && appeal.sanction.status === 'appealed') {
        await db.behaviourSanction.update({
          where: { id: appeal.sanction.id },
          data: { status: 'scheduled' as $Enums.SanctionStatus },
        });

        await this.historyService.recordHistory(
          db,
          tenantId,
          'sanction',
          appeal.sanction.id,
          userId,
          'status_changed',
          { status: 'appealed' },
          {
            status: 'scheduled',
            reason: `Appeal ${appeal.appeal_number} withdrawn`,
          },
        );
      }

      // Record appeal entity history
      await this.historyService.recordHistory(
        db,
        tenantId,
        'appeal',
        id,
        userId,
        'withdrawn',
        { status: appeal.status },
        { status: 'withdrawn' },
        dto.reason,
      );

      return updated;
    });
  }

  // ─── Attachment Stubs ───────────────────────────────────────────────────────

  async uploadAttachment(
    _tenantId: string,
    _id: string,
    _file: unknown,
  ): Promise<{ status: string }> {
    return { status: 'not_implemented' };
  }

  async getAttachments(_tenantId: string, _id: string): Promise<unknown[]> {
    return [];
  }

  // ─── Document Stubs ─────────────────────────────────────────────────────────

  async generateDecisionLetter(_tenantId: string, _id: string): Promise<{ status: string }> {
    return { status: 'not_implemented' };
  }

  async getEvidenceBundle(_tenantId: string, _id: string): Promise<{ status: string }> {
    return { status: 'not_implemented' };
  }
}
