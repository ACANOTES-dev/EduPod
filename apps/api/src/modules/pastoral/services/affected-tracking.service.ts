import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AddAffectedPersonDto {
  person_type: 'student' | 'staff';
  student_id?: string;
  staff_id?: string;
  impact_level: 'directly_affected' | 'indirectly_affected';
  wellbeing_flag_expires_at?: string;
  notes?: string;
}

export interface UpdateAffectedPersonDto {
  impact_level?: 'directly_affected' | 'indirectly_affected';
  wellbeing_flag_active?: boolean;
  wellbeing_flag_expires_at?: string | null;
  support_offered?: boolean;
  support_notes?: string;
  notes?: string;
}

export interface StudentWellbeingFlag {
  student_id: string;
  flag_message: string;
  since: string;
  expires_at: string | null;
}

export interface AffectedSummary {
  total_students: number;
  total_staff: number;
  directly_affected_count: number;
  indirectly_affected_count: number;
  support_offered_count: number;
  support_pending_count: number;
}

export interface AffectedPersonFilters {
  person_type?: string;
  impact_level?: string;
  support_offered?: boolean;
}

// ─── Impact Level Mapping ───────────────────────────────────────────────────

// The Prisma enum uses 'direct' / 'indirect', but DTOs use 'directly_affected' / 'indirectly_affected'
const IMPACT_LEVEL_TO_PRISMA: Record<string, string> = {
  directly_affected: 'direct',
  indirectly_affected: 'indirect',
};

const WELLBEING_FLAG_MESSAGE = 'Be aware this student may be affected by a recent event';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class AffectedTrackingService {
  private readonly logger = new Logger(AffectedTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── ADD AFFECTED PERSON ──────────────────────────────────────────────────

  async addAffectedPerson(
    tenantId: string,
    incidentId: string,
    addedById: string,
    dto: AddAffectedPersonDto,
  ): Promise<{ data: Record<string, unknown> }> {
    // Validate person_type consistency
    if (dto.person_type === 'student' && !dto.student_id) {
      throw new BadRequestException({
        code: 'STUDENT_ID_REQUIRED',
        message: 'student_id is required when person_type is student',
      });
    }

    if (dto.person_type === 'staff' && !dto.staff_id) {
      throw new BadRequestException({
        code: 'STAFF_ID_REQUIRED',
        message: 'staff_id is required when person_type is staff',
      });
    }

    const prismaImpactLevel = IMPACT_LEVEL_TO_PRISMA[dto.impact_level] ?? dto.impact_level;

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: addedById,
    });

    const created = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate the incident exists
      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      // Validate the person exists
      if (dto.person_type === 'student') {
        const student = await db.student.findFirst({
          where: { id: dto.student_id, tenant_id: tenantId },
        });
        if (!student) {
          throw new NotFoundException({
            code: 'STUDENT_NOT_FOUND',
            message: `Student ${dto.student_id} not found`,
          });
        }
      }

      // Create the affected person record
      return db.criticalIncidentAffected.create({
        data: {
          tenant_id: tenantId,
          incident_id: incidentId,
          affected_type: dto.person_type,
          student_id: dto.person_type === 'student' ? dto.student_id : null,
          staff_profile_id: dto.person_type === 'staff' ? dto.staff_id : null,
          impact_level: prismaImpactLevel as 'direct' | 'indirect',
          notes: dto.notes ?? null,
          support_offered: false,
        },
      });
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'affected_person_added',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: dto.person_type === 'student' ? (dto.student_id ?? null) : null,
      actor_user_id: addedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        person_type: dto.person_type,
        student_id: dto.student_id ?? null,
        staff_id: dto.staff_id ?? null,
        impact_level: dto.impact_level,
      },
      ip_address: null,
    });

    return { data: created };
  }

  // ─── BULK ADD AFFECTED ────────────────────────────────────────────────────

  async bulkAddAffected(
    tenantId: string,
    incidentId: string,
    addedById: string,
    persons: AddAffectedPersonDto[],
  ): Promise<{ data: { added: number; skipped: number } }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: addedById,
    });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate the incident exists
      const incident = await db.criticalIncident.findFirst({
        where: { id: incidentId, tenant_id: tenantId },
      });

      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: `Critical incident ${incidentId} not found`,
        });
      }

      let added = 0;
      let skipped = 0;

      for (const person of persons) {
        const prismaImpactLevel =
          IMPACT_LEVEL_TO_PRISMA[person.impact_level] ?? person.impact_level;

        try {
          await db.criticalIncidentAffected.create({
            data: {
              tenant_id: tenantId,
              incident_id: incidentId,
              affected_type: person.person_type,
              student_id: person.person_type === 'student' ? person.student_id : null,
              staff_profile_id: person.person_type === 'staff' ? person.staff_id : null,
              impact_level: prismaImpactLevel as 'direct' | 'indirect',
              notes: person.notes ?? null,
              support_offered: false,
            },
          });
          added++;
        } catch (error: unknown) {
          // P2002 = unique constraint violation (duplicate)
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            skipped++;
          } else {
            throw error;
          }
        }
      }

      return { added, skipped };
    })) as { added: number; skipped: number };

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'affected_persons_bulk_added',
      entity_type: 'critical_incident',
      entity_id: incidentId,
      student_id: null,
      actor_user_id: addedById,
      tier: 3,
      payload: {
        incident_id: incidentId,
        added: result.added,
        skipped: result.skipped,
        total_attempted: persons.length,
      },
      ip_address: null,
    });

    return { data: result };
  }

  // ─── UPDATE AFFECTED PERSON ───────────────────────────────────────────────

  async updateAffectedPerson(
    tenantId: string,
    affectedPersonId: string,
    updatedById: string,
    dto: UpdateAffectedPersonDto,
  ): Promise<{ data: Record<string, unknown> }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: updatedById,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.criticalIncidentAffected.findFirst({
        where: { id: affectedPersonId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'AFFECTED_PERSON_NOT_FOUND',
          message: `Affected person ${affectedPersonId} not found`,
        });
      }

      const updateData: Record<string, unknown> = {};

      if (dto.impact_level !== undefined) {
        const prismaImpactLevel = IMPACT_LEVEL_TO_PRISMA[dto.impact_level] ?? dto.impact_level;
        updateData.impact_level = prismaImpactLevel;
      }

      if (dto.support_offered !== undefined) {
        updateData.support_offered = dto.support_offered;
      }

      if (dto.notes !== undefined) {
        updateData.notes = dto.notes;
      }

      return db.criticalIncidentAffected.update({
        where: { id: affectedPersonId },
        data: updateData,
      });
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'affected_person_updated',
      entity_type: 'critical_incident',
      entity_id: (updated.incident_id as string) ?? affectedPersonId,
      student_id: (updated.student_id as string) ?? null,
      actor_user_id: updatedById,
      tier: 3,
      payload: {
        affected_person_id: affectedPersonId,
        changed_fields: Object.keys(dto).filter(
          (k) => dto[k as keyof UpdateAffectedPersonDto] !== undefined,
        ),
      },
      ip_address: null,
    });

    return { data: updated };
  }

  // ─── REMOVE AFFECTED PERSON ──────────────────────────────────────────────

  async removeAffectedPerson(
    tenantId: string,
    affectedPersonId: string,
    removedById: string,
    reason: string,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: removedById,
    });

    const removed = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.criticalIncidentAffected.findFirst({
        where: { id: affectedPersonId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'AFFECTED_PERSON_NOT_FOUND',
          message: `Affected person ${affectedPersonId} not found`,
        });
      }

      await db.criticalIncidentAffected.delete({
        where: { id: affectedPersonId },
      });

      return existing;
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'affected_person_removed',
      entity_type: 'critical_incident',
      entity_id: (removed.incident_id as string) ?? affectedPersonId,
      student_id: (removed.student_id as string) ?? null,
      actor_user_id: removedById,
      tier: 3,
      payload: {
        affected_person_id: affectedPersonId,
        person_type: removed.affected_type,
        reason,
      },
      ip_address: null,
    });
  }

  // ─── LIST AFFECTED PERSONS ───────────────────────────────────────────────

  async listAffectedPersons(
    tenantId: string,
    incidentId: string,
    filters: AffectedPersonFilters,
  ): Promise<{ data: Record<string, unknown>[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const data = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        incident_id: incidentId,
      };

      if (filters.person_type) {
        where.affected_type = filters.person_type;
      }

      if (filters.impact_level) {
        const prismaLevel = IMPACT_LEVEL_TO_PRISMA[filters.impact_level] ?? filters.impact_level;
        where.impact_level = prismaLevel;
      }

      if (filters.support_offered !== undefined) {
        where.support_offered = filters.support_offered;
      }

      return db.criticalIncidentAffected.findMany({
        where,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          staff_profile: {
            select: {
              id: true,
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
        orderBy: { created_at: 'desc' },
      });
    })) as Record<string, unknown>[];

    return { data };
  }

  // ─── GET STUDENT WELLBEING FLAGS ──────────────────────────────────────────

  async getStudentWellbeingFlags(
    tenantId: string,
    studentId: string,
  ): Promise<{ data: StudentWellbeingFlag[] }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const flags = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Find all affected records where:
      // - This student is tagged
      // - wellbeing_flag_active is implicitly true (support_offered is our proxy if flag columns not yet added)
      // - The linked incident is active or monitoring
      const affectedRecords = await db.criticalIncidentAffected.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          affected_type: 'student',
          // The incident must be active or monitoring
          incident: {
            status: { in: ['ci_active', 'ci_monitoring'] },
          },
        },
        select: {
          created_at: true,
        },
      });

      return affectedRecords.map((record) => ({
        student_id: studentId,
        flag_message: WELLBEING_FLAG_MESSAGE,
        since: record.created_at.toISOString(),
        expires_at: null,
      }));
    })) as StudentWellbeingFlag[];

    return { data: flags };
  }

  // ─── HAS ACTIVE WELLBEING FLAG ────────────────────────────────────────────

  async hasActiveWellbeingFlag(tenantId: string, studentId: string): Promise<boolean> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const count = await db.criticalIncidentAffected.count({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          affected_type: 'student',
          incident: {
            status: { in: ['ci_active', 'ci_monitoring'] },
          },
        },
      });

      return count > 0;
    }) as Promise<boolean>;
  }

  // ─── RECORD SUPPORT OFFERED ───────────────────────────────────────────────

  async recordSupportOffered(
    tenantId: string,
    affectedPersonId: string,
    offeredById: string,
    notes: string,
  ): Promise<{ data: Record<string, unknown> }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: offeredById,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.criticalIncidentAffected.findFirst({
        where: { id: affectedPersonId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'AFFECTED_PERSON_NOT_FOUND',
          message: `Affected person ${affectedPersonId} not found`,
        });
      }

      return db.criticalIncidentAffected.update({
        where: { id: affectedPersonId },
        data: {
          support_offered: true,
          notes: notes,
        },
      });
    })) as Record<string, unknown>;

    // Fire-and-forget: audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'support_offered',
      entity_type: 'critical_incident',
      entity_id: (updated.incident_id as string) ?? affectedPersonId,
      student_id: (updated.student_id as string) ?? null,
      actor_user_id: offeredById,
      tier: 3,
      payload: {
        affected_person_id: affectedPersonId,
        notes,
      },
      ip_address: null,
    });

    return { data: updated };
  }

  // ─── GET AFFECTED SUMMARY ────────────────────────────────────────────────

  async getAffectedSummary(
    tenantId: string,
    incidentId: string,
  ): Promise<{ data: AffectedSummary }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const summary = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const baseWhere = { tenant_id: tenantId, incident_id: incidentId };

      const [
        totalStudents,
        totalStaff,
        directCount,
        indirectCount,
        supportOfferedCount,
        supportPendingCount,
      ] = await Promise.all([
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, affected_type: 'student' },
        }),
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, affected_type: 'staff' },
        }),
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, impact_level: 'direct' },
        }),
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, impact_level: 'indirect' },
        }),
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, support_offered: true },
        }),
        db.criticalIncidentAffected.count({
          where: { ...baseWhere, support_offered: false },
        }),
      ]);

      return {
        total_students: totalStudents,
        total_staff: totalStaff,
        directly_affected_count: directCount,
        indirectly_affected_count: indirectCount,
        support_offered_count: supportOfferedCount,
        support_pending_count: supportPendingCount,
      };
    })) as AffectedSummary;

    return { data: summary };
  }
}
