import type { StudentStatus } from '../types/student';

export const VALID_STUDENT_TRANSITIONS: Record<StudentStatus, StudentStatus[]> = {
  applicant: ['active'],
  active: ['withdrawn', 'graduated', 'archived'],
  withdrawn: ['active'],
  graduated: ['archived'],
  archived: [],
};
