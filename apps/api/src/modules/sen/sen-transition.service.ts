import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ListTransitionNotesQuery } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { CreateTransitionNoteBody } from './dto/create-transition-note.dto';
import { SenScopeService } from './sen-scope.service';

interface TransitionNoteSummary {
  id: string;
  sen_profile_id: string;
  note_type: string;
  content: string;
  created_at: Date;
  created_by: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

interface TransitionNoteRecord {
  id: string;
  sen_profile_id: string;
  note_type: string;
  content: string;
  created_at: Date;
  created_by: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

const transitionNoteInclude = {
  created_by: {
    select: {
      id: true,
      first_name: true,
      last_name: true,
    },
  },
} satisfies Prisma.SenTransitionNoteInclude;

function buildDisplayName(person: { first_name: string; last_name: string }): string {
  return `${person.first_name} ${person.last_name}`.trim();
}

@Injectable()
export class SenTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: SenScopeService,
  ) {}

  async createNote(
    tenantId: string,
    profileId: string,
    dto: CreateTransitionNoteBody,
    userId: string,
  ): Promise<TransitionNoteSummary> {
    await this.assertProfileExists(tenantId, profileId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const note = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.senTransitionNote.create({
        data: {
          tenant_id: tenantId,
          sen_profile_id: profileId,
          note_type: dto.note_type,
          content: dto.content,
          created_by_user_id: userId,
        },
        include: transitionNoteInclude,
      });
    })) as TransitionNoteRecord;

    return this.mapTransitionNote(note);
  }

  async findNotes(
    tenantId: string,
    userId: string,
    permissions: string[],
    profileId: string,
    query: ListTransitionNotesQuery,
  ): Promise<TransitionNoteSummary[]> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      return [];
    }

    const accessibleProfile = await this.prisma.senProfile.findFirst({
      where: {
        id: profileId,
        tenant_id: tenantId,
        ...(scope.scope === 'class' && scope.studentIds
          ? {
              student_id: {
                in: scope.studentIds,
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (!accessibleProfile) {
      return [];
    }

    const notes = await this.prisma.senTransitionNote.findMany({
      where: {
        tenant_id: tenantId,
        sen_profile_id: profileId,
        ...(query.note_type
          ? {
              note_type: query.note_type,
            }
          : {}),
      },
      orderBy: {
        created_at: 'desc',
      },
      include: transitionNoteInclude,
    });

    return notes.map((note) => this.mapTransitionNote(note));
  }

  async generateHandoverPack(
    tenantId: string,
    userId: string,
    permissions: string[],
    studentId: string,
  ) {
    await this.assertStudentAccessible(tenantId, userId, permissions, studentId);

    const profile = await this.prisma.senProfile.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      select: {
        id: true,
        primary_category: true,
        support_level: true,
        is_active: true,
        flagged_date: true,
        diagnosis: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            date_of_birth: true,
            year_group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile for student with id "${studentId}" not found`,
      });
    }

    const [
      activePlan,
      accommodations,
      professionals,
      transitionNotes,
      studentHours,
      snaAssignment,
    ] = await Promise.all([
      this.prisma.senSupportPlan.findFirst({
        where: {
          tenant_id: tenantId,
          sen_profile_id: profile.id,
          status: 'active',
        },
        orderBy: [{ version: 'desc' }, { created_at: 'desc' }],
        include: {
          goals: {
            orderBy: {
              display_order: 'asc',
            },
            include: {
              strategies: {
                where: {
                  is_active: true,
                },
                orderBy: {
                  created_at: 'asc',
                },
                include: {
                  responsible: {
                    select: {
                      id: true,
                      first_name: true,
                      last_name: true,
                    },
                  },
                },
              },
              progress_notes: {
                orderBy: {
                  created_at: 'desc',
                },
                take: 5,
              },
            },
          },
        },
      }),
      this.prisma.senAccommodation.findMany({
        where: {
          tenant_id: tenantId,
          sen_profile_id: profile.id,
          is_active: true,
        },
        orderBy: [{ created_at: 'desc' }],
      }),
      this.prisma.senProfessionalInvolvement.findMany({
        where: {
          tenant_id: tenantId,
          sen_profile_id: profile.id,
        },
        orderBy: [{ referral_date: 'desc' }, { created_at: 'desc' }],
      }),
      this.prisma.senTransitionNote.findMany({
        where: {
          tenant_id: tenantId,
          sen_profile_id: profile.id,
        },
        orderBy: {
          created_at: 'desc',
        },
        include: transitionNoteInclude,
      }),
      this.prisma.senStudentHours.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          sen_profile_id: profile.id,
        },
        include: {
          resource_allocation: {
            select: {
              academic_year: {
                select: {
                  id: true,
                  name: true,
                  start_date: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.senSnaAssignment.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          sen_profile_id: profile.id,
          status: 'active',
        },
        orderBy: [{ start_date: 'desc' }, { created_at: 'desc' }],
        include: {
          staff_profile: {
            select: {
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      student: {
        id: profile.student.id,
        name: buildDisplayName(profile.student),
        date_of_birth: profile.student.date_of_birth,
        year_group: profile.student.year_group,
      },
      sen_profile: {
        id: profile.id,
        primary_category: profile.primary_category,
        support_level: profile.support_level,
        is_active: profile.is_active,
        flagged_date: profile.flagged_date,
        diagnosis: profile.diagnosis,
      },
      active_plan: activePlan
        ? {
            id: activePlan.id,
            plan_number: activePlan.plan_number,
            status: activePlan.status,
            goals: activePlan.goals.map((goal) => ({
              id: goal.id,
              title: goal.title,
              target: goal.target,
              baseline: goal.baseline,
              current_level: goal.current_level,
              status: goal.status,
              strategies: goal.strategies.map((strategy) => ({
                id: strategy.id,
                description: strategy.description,
                responsible: strategy.responsible ? buildDisplayName(strategy.responsible) : null,
                frequency: strategy.frequency,
              })),
              latest_progress: goal.progress_notes.map((progress) => ({
                id: progress.id,
                note: progress.note,
                current_level: progress.current_level,
                recorded_at: progress.created_at,
              })),
            })),
          }
        : null,
      accommodations: accommodations.map((accommodation) => ({
        id: accommodation.id,
        type: accommodation.accommodation_type,
        description: accommodation.description,
        is_active: accommodation.is_active,
      })),
      professionals: professionals.map((professional) => ({
        id: professional.id,
        type: professional.professional_type,
        name: professional.professional_name,
        organisation: professional.organisation,
        status: professional.status,
        recommendations: professional.recommendations,
        referral_date: professional.referral_date,
        assessment_date: professional.assessment_date,
        report_received_date: professional.report_received_date,
      })),
      transition_notes: transitionNotes.map((note) => ({
        id: note.id,
        note_type: note.note_type,
        content: note.content,
        created_at: note.created_at,
        created_by: buildDisplayName(note.created_by),
      })),
      resource_hours: this.getMostRecentResourceHours(studentHours),
      sna_assignment: snaAssignment
        ? {
            sna_name: buildDisplayName(snaAssignment.staff_profile.user),
            schedule: snaAssignment.schedule,
            start_date: snaAssignment.start_date,
          }
        : null,
    };
  }

  private async assertProfileExists(tenantId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.senProfile.findFirst({
      where: {
        id: profileId,
        tenant_id: tenantId,
      },
      select: {
        id: true,
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'SEN_PROFILE_NOT_FOUND',
        message: `SEN profile with id "${profileId}" not found`,
      });
    }
  }

  private async assertStudentAccessible(
    tenantId: string,
    userId: string,
    permissions: string[],
    studentId: string,
  ): Promise<void> {
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);

    if (scope.scope === 'none') {
      throw this.buildStudentNotFound(studentId);
    }

    if (scope.scope === 'class' && scope.studentIds && !scope.studentIds.includes(studentId)) {
      throw this.buildStudentNotFound(studentId);
    }
  }

  private getMostRecentResourceHours(
    studentHours: Array<
      Prisma.SenStudentHoursGetPayload<{
        include: {
          resource_allocation: {
            select: {
              academic_year: {
                select: {
                  id: true;
                  name: true;
                  start_date: true;
                };
              };
            };
          };
        };
      }>
    >,
  ) {
    if (studentHours.length === 0) {
      return null;
    }

    const byAcademicYear = new Map<
      string,
      {
        academic_year_id: string;
        academic_year_name: string;
        start_date: Date;
        allocated_hours: number;
        used_hours: number;
      }
    >();

    for (const assignment of studentHours) {
      const academicYear = assignment.resource_allocation.academic_year;
      const existing = byAcademicYear.get(academicYear.id);
      const allocatedHours = Number(assignment.allocated_hours.toFixed(2));
      const usedHours = Number(assignment.used_hours.toFixed(2));

      if (existing) {
        existing.allocated_hours = Number((existing.allocated_hours + allocatedHours).toFixed(2));
        existing.used_hours = Number((existing.used_hours + usedHours).toFixed(2));
      } else {
        byAcademicYear.set(academicYear.id, {
          academic_year_id: academicYear.id,
          academic_year_name: academicYear.name,
          start_date: academicYear.start_date,
          allocated_hours: allocatedHours,
          used_hours: usedHours,
        });
      }
    }

    const mostRecent = [...byAcademicYear.values()].sort(
      (left, right) => right.start_date.getTime() - left.start_date.getTime(),
    )[0];

    return mostRecent
      ? {
          academic_year_id: mostRecent.academic_year_id,
          academic_year_name: mostRecent.academic_year_name,
          allocated_hours: mostRecent.allocated_hours,
          used_hours: mostRecent.used_hours,
        }
      : null;
  }

  private mapTransitionNote(note: TransitionNoteRecord): TransitionNoteSummary {
    return {
      id: note.id,
      sen_profile_id: note.sen_profile_id,
      note_type: note.note_type,
      content: note.content,
      created_at: note.created_at,
      created_by: note.created_by,
    };
  }

  private buildStudentNotFound(studentId: string): NotFoundException {
    return new NotFoundException({
      code: 'STUDENT_NOT_FOUND',
      message: `Student with id "${studentId}" not found`,
    });
  }
}
