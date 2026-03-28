import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Age calculation ──────────────────────────────────────────────────────────

/** Calculate full years between a date of birth and a reference date. */
function fullYearsBetween(dob: Date, reference: Date): number {
  let years = reference.getFullYear() - dob.getFullYear();
  const monthDiff = reference.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < dob.getDate())) {
    years--;
  }
  return years;
}

@Injectable()
export class AgeGateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Determines whether a student is age-gated (17+ years old).
   * Students aged 17 or above may have independent data-subject rights
   * and require additional confirmation before GDPR actions on their data.
   */
  isStudentAgeGated(student: { date_of_birth: Date }): boolean {
    return fullYearsBetween(student.date_of_birth, new Date()) >= 17;
  }

  /**
   * Looks up the student by tenant + id and checks if they are age-gated.
   * Returns false when the student is not found.
   */
  async checkStudentAgeGated(tenantId: string, studentId: string): Promise<boolean> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { date_of_birth: true },
    });
    if (!student) return false;
    return this.isStudentAgeGated(student);
  }
}
