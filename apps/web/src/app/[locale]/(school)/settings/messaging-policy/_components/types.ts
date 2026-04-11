import type { MessagingRole } from '@school/shared/inbox';

export type PolicyMatrixDict = Record<MessagingRole, Record<MessagingRole, boolean>>;

export interface InboxSettingsPayload {
  messaging_enabled: boolean;
  students_can_initiate: boolean;
  parents_can_initiate: boolean;
  parent_to_parent_messaging: boolean;
  student_to_student_messaging: boolean;
  student_to_parent_messaging: boolean;
  require_admin_approval_for_parent_to_teacher: boolean;
  edit_window_minutes: number;
  retention_days: number | null;
}

export const MESSAGING_ROLES: MessagingRole[] = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
  'parent',
  'student',
];

export const ROLE_LABELS: Record<MessagingRole, string> = {
  owner: 'Owner',
  principal: 'Principal',
  vice_principal: 'Vice Principal',
  office: 'Office',
  finance: 'Finance',
  nurse: 'Nurse',
  teacher: 'Teacher',
  parent: 'Parent',
  student: 'Student',
};

/**
 * Relational scope notes — informational tooltips on the matrix cells.
 * Match the hard-coded rules in `RelationalScopeResolver` (impl 02).
 */
export const RELATIONAL_SCOPE_NOTES: Partial<Record<`${MessagingRole}:${MessagingRole}`, string>> =
  {
    'teacher:parent':
      'Teachers can only message parents of students in their own classes. This scope is hard-coded and cannot be changed.',
    'parent:teacher':
      'Parents can only message teachers of their own children. This scope is hard-coded and cannot be changed.',
    'teacher:student':
      'Teachers can only message students in their own classes. This scope is hard-coded and cannot be changed.',
    'student:teacher':
      'Students can only message their own teachers. This scope is hard-coded and cannot be changed.',
  };
