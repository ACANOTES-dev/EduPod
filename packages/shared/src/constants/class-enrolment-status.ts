import type { EnrolmentStatus } from '../types/class';

export const VALID_ENROLMENT_TRANSITIONS: Record<EnrolmentStatus, EnrolmentStatus[]> = {
  active: ['dropped', 'completed'],
  dropped: ['active'],
  completed: [],
};
