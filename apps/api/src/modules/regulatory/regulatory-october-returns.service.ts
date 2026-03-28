import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OCTOBER_RETURNS_FIELDS } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ─────────────────────────────────────────────────────────────────

interface ReadinessCategory {
  field: string;
  label: string;
  required: boolean;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  message: string;
  count?: number;
}

interface ReadinessResult {
  ready: boolean;
  academic_year: string;
  student_count: number;
  categories: ReadinessCategory[];
}

interface PreviewResult {
  academic_year: string;
  generated_at: string;
  summary: {
    total_students: number;
    gender: { male: number; female: number; other: number };
    nationalities: { nationality: string; count: number }[];
    year_groups: { year_group: string; count: number }[];
    new_entrants: number;
  };
}

interface StudentProblem {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface StudentIssueEntry {
  student_id: string;
  student_name: string;
  student_number: string | null;
  problems: StudentProblem[];
}

interface StudentIssuesResult {
  academic_year: string;
  total_students: number;
  students_with_issues: number;
  issues: StudentIssueEntry[];
}

interface ValidateStudentResult {
  student_id: string;
  student_name: string;
  valid: boolean;
  problems: StudentProblem[];
}

// ─── PPSN Validation ───────────────────────────────────────────────────────

const PPSN_REGEX = /^\d{7}[A-Za-z]{1,2}$/;

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class RegulatoryOctoberReturnsService {
  private readonly logger = new Logger(RegulatoryOctoberReturnsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Check Readiness ───────────────────────────────────────────────────────

  async checkReadiness(tenantId: string, academicYear: string): Promise<ReadinessResult> {
    const ayRecord = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, name: academicYear },
    });

    if (!ayRecord) {
      this.logger.warn(`Academic year "${academicYear}" not found for tenant ${tenantId}`);
      return {
        ready: false,
        academic_year: academicYear,
        student_count: 0,
        categories: OCTOBER_RETURNS_FIELDS.map((f) => ({
          field: f.field,
          label: f.label,
          required: f.required,
          status: 'fail' as const,
          message: `Academic year "${academicYear}" not found`,
        })),
      };
    }

    const activeStudents = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: {
        id: true,
        gender: true,
        nationality: true,
        entry_date: true,
        class_enrolments: {
          where: { status: 'active' },
          select: {
            class_entity: {
              select: { academic_year_id: true, year_group_id: true },
            },
          },
        },
      },
    });

    const studentCount = activeStudents.length;
    const categories: ReadinessCategory[] = [];

    for (const fieldDef of OCTOBER_RETURNS_FIELDS) {
      const category = this.evaluateReadinessField(
        fieldDef,
        activeStudents,
        ayRecord,
      );
      categories.push(category);
    }

    const ready = categories
      .filter((c) => c.required)
      .every((c) => c.status === 'pass' || c.status === 'warning');

    return { ready, academic_year: academicYear, student_count: studentCount, categories };
  }

  // ─── Preview ───────────────────────────────────────────────────────────────

  async preview(tenantId: string, academicYear: string): Promise<PreviewResult> {
    const ayRecord = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, name: academicYear },
    });

    if (!ayRecord) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${academicYear}" not found`,
      });
    }

    const activeStudents = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: {
        id: true,
        gender: true,
        nationality: true,
        entry_date: true,
        class_enrolments: {
          where: { status: 'active' },
          select: {
            class_entity: {
              select: {
                academic_year_id: true,
                year_group: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    // Gender aggregation
    let male = 0;
    let female = 0;
    let other = 0;

    for (const s of activeStudents) {
      if (s.gender === 'male') male++;
      else if (s.gender === 'female') female++;
      else other++;
    }

    // Nationality aggregation
    const nationalityCounts = new Map<string, number>();
    for (const s of activeStudents) {
      const nat = s.nationality ?? 'Unknown';
      nationalityCounts.set(nat, (nationalityCounts.get(nat) ?? 0) + 1);
    }
    const nationalities = Array.from(nationalityCounts.entries())
      .map(([nationality, count]) => ({ nationality, count }))
      .sort((a, b) => b.count - a.count);

    // Year group aggregation (via class enrolments)
    const yearGroupCounts = new Map<string, number>();
    for (const s of activeStudents) {
      let yearGroupName: string | null = null;
      for (const enrol of s.class_enrolments) {
        if (
          enrol.class_entity.academic_year_id === ayRecord.id &&
          enrol.class_entity.year_group
        ) {
          yearGroupName = enrol.class_entity.year_group.name;
          break;
        }
      }
      const groupKey = yearGroupName ?? 'Unassigned';
      yearGroupCounts.set(groupKey, (yearGroupCounts.get(groupKey) ?? 0) + 1);
    }
    const yearGroups = Array.from(yearGroupCounts.entries())
      .map(([year_group, count]) => ({ year_group, count }))
      .sort((a, b) => {
        if (a.year_group === 'Unassigned') return 1;
        if (b.year_group === 'Unassigned') return -1;
        return a.year_group.localeCompare(b.year_group);
      });

    // New entrants — entry_date within academic year range
    const newEntrants = activeStudents.filter((s) => {
      if (!s.entry_date) return false;
      const entryDate = new Date(s.entry_date);
      return entryDate >= new Date(ayRecord.start_date) && entryDate <= new Date(ayRecord.end_date);
    }).length;

    return {
      academic_year: academicYear,
      generated_at: new Date().toISOString(),
      summary: {
        total_students: activeStudents.length,
        gender: { male, female, other },
        nationalities,
        year_groups: yearGroups,
        new_entrants: newEntrants,
      },
    };
  }

  // ─── Student Issues ────────────────────────────────────────────────────────

  async getStudentIssues(tenantId: string, academicYear: string): Promise<StudentIssuesResult> {
    const ayRecord = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, name: academicYear },
    });

    if (!ayRecord) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${academicYear}" not found`,
      });
    }

    const activeStudents = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        national_id: true,
        date_of_birth: true,
        gender: true,
        nationality: true,
        entry_date: true,
        household_id: true,
        household: {
          select: { address_line_1: true },
        },
        class_enrolments: {
          where: { status: 'active' },
          select: {
            class_entity: {
              select: { academic_year_id: true, year_group_id: true },
            },
          },
        },
      },
    });

    const issues: StudentIssueEntry[] = [];

    for (const student of activeStudents) {
      const problems = this.buildStudentProblems(student, ayRecord.id);
      if (problems.length > 0) {
        issues.push({
          student_id: student.id,
          student_name: `${student.first_name} ${student.last_name}`,
          student_number: student.student_number,
          problems,
        });
      }
    }

    return {
      academic_year: academicYear,
      total_students: activeStudents.length,
      students_with_issues: issues.length,
      issues,
    };
  }

  // ─── Validate Single Student ───────────────────────────────────────────────

  async validateStudent(tenantId: string, studentId: string): Promise<ValidateStudentResult> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        national_id: true,
        date_of_birth: true,
        gender: true,
        nationality: true,
        entry_date: true,
        household_id: true,
        household: {
          select: { address_line_1: true },
        },
        class_enrolments: {
          where: { status: 'active' },
          select: {
            class_entity: {
              select: { academic_year_id: true, year_group_id: true },
            },
          },
        },
      },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const problems = this.buildStudentProblems(student, null);

    return {
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      valid: problems.length === 0,
      problems,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private evaluateReadinessField(
    fieldDef: (typeof OCTOBER_RETURNS_FIELDS)[number],
    activeStudents: {
      id: string;
      gender: string | null;
      nationality: string | null;
      entry_date: Date | null;
      class_enrolments: {
        class_entity: { academic_year_id: string; year_group_id: string | null };
      }[];
    }[],
    ayRecord: { id: string; start_date: Date; end_date: Date },
  ): ReadinessCategory {
    const base = {
      field: fieldDef.field,
      label: fieldDef.label,
      required: fieldDef.required,
    };
    const totalStudents = activeStudents.length;

    switch (fieldDef.field) {
      case 'student_count': {
        if (totalStudents > 0) {
          return { ...base, status: 'pass', message: `${totalStudents} active students found`, count: totalStudents };
        }
        return { ...base, status: 'fail', message: 'No active students found', count: 0 };
      }

      case 'gender_breakdown': {
        const withGender = activeStudents.filter((s) => s.gender !== null).length;
        if (totalStudents === 0) {
          return { ...base, status: 'fail', message: 'No active students to check', count: 0 };
        }
        if (withGender === totalStudents) {
          return { ...base, status: 'pass', message: 'All students have gender set', count: withGender };
        }
        return { ...base, status: 'fail', message: `${totalStudents - withGender} students missing gender`, count: withGender };
      }

      case 'nationality_breakdown': {
        const withNationality = activeStudents.filter((s) => s.nationality !== null).length;
        if (totalStudents === 0) {
          return { ...base, status: 'fail', message: 'No active students to check', count: 0 };
        }
        const percentage = (withNationality / totalStudents) * 100;
        if (percentage === 100) {
          return { ...base, status: 'pass', message: 'All students have nationality set', count: withNationality };
        }
        if (percentage >= 80) {
          return { ...base, status: 'warning', message: `${totalStudents - withNationality} students missing nationality (${Math.round(percentage)}% complete)`, count: withNationality };
        }
        return { ...base, status: 'fail', message: `${totalStudents - withNationality} students missing nationality (${Math.round(percentage)}% complete)`, count: withNationality };
      }

      case 'year_group_enrolment': {
        const withYearGroup = activeStudents.filter((s) =>
          s.class_enrolments.some(
            (e) => e.class_entity.academic_year_id === ayRecord.id && e.class_entity.year_group_id !== null,
          ),
        ).length;
        if (totalStudents === 0) {
          return { ...base, status: 'fail', message: 'No active students to check', count: 0 };
        }
        if (withYearGroup === totalStudents) {
          return { ...base, status: 'pass', message: 'All students have year group enrolments', count: withYearGroup };
        }
        return { ...base, status: 'fail', message: `${totalStudents - withYearGroup} students without year group enrolment`, count: withYearGroup };
      }

      case 'new_entrants': {
        const newEntrants = activeStudents.filter((s) => {
          if (!s.entry_date) return false;
          const entryDate = new Date(s.entry_date);
          return entryDate >= new Date(ayRecord.start_date) && entryDate <= new Date(ayRecord.end_date);
        }).length;
        return { ...base, status: 'pass', message: `${newEntrants} new entrants identified`, count: newEntrants };
      }

      case 'sen_students':
      case 'traveller_students':
      case 'eal_students':
      case 'repeat_students': {
        return { ...base, status: 'not_applicable', message: 'Optional — tracked separately if applicable' };
      }

      default: {
        return { ...base, status: 'not_applicable', message: 'Unknown field' };
      }
    }
  }

  private buildStudentProblems(
    student: {
      national_id: string | null;
      date_of_birth: Date | null;
      gender: string | null;
      nationality: string | null;
      entry_date: Date | null;
      household: { address_line_1: string | null } | null;
      class_enrolments: {
        class_entity: { academic_year_id: string; year_group_id: string | null };
      }[];
    },
    academicYearId: string | null,
  ): StudentProblem[] {
    const problems: StudentProblem[] = [];

    // PPSN validation
    if (!student.national_id) {
      problems.push({ field: 'national_id', message: 'PPSN is missing', severity: 'error' });
    } else if (!PPSN_REGEX.test(student.national_id)) {
      problems.push({ field: 'national_id', message: 'PPSN format is invalid (expected 7 digits followed by 1-2 letters)', severity: 'error' });
    }

    // Date of birth
    if (!student.date_of_birth) {
      problems.push({ field: 'date_of_birth', message: 'Date of birth is missing', severity: 'error' });
    }

    // Gender
    if (!student.gender) {
      problems.push({ field: 'gender', message: 'Gender is missing', severity: 'error' });
    }

    // Nationality
    if (!student.nationality) {
      problems.push({ field: 'nationality', message: 'Nationality is missing', severity: 'warning' });
    }

    // Entry date
    if (!student.entry_date) {
      problems.push({ field: 'entry_date', message: 'Entry date is missing', severity: 'warning' });
    }

    // Class enrolment
    const hasActiveEnrolment = student.class_enrolments.length > 0;
    if (!hasActiveEnrolment) {
      problems.push({ field: 'class_enrolment', message: 'No active class enrolment', severity: 'error' });
    }

    // Year group (via class enrolment or no enrolment at all)
    if (hasActiveEnrolment) {
      const hasYearGroup = academicYearId
        ? student.class_enrolments.some(
            (e) => e.class_entity.academic_year_id === academicYearId && e.class_entity.year_group_id !== null,
          )
        : student.class_enrolments.some((e) => e.class_entity.year_group_id !== null);

      if (!hasYearGroup) {
        problems.push({ field: 'year_group', message: 'No year group assigned via class enrolment', severity: 'warning' });
      }
    }

    // Address (via household)
    if (!student.household || !student.household.address_line_1) {
      problems.push({ field: 'address', message: 'No household address on file', severity: 'warning' });
    }

    return problems;
  }
}
