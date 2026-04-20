import type { NavSection } from './in-page-nav';

interface StaffSectionLabels {
  my: string;
  aggregate: string;
  surveys: string;
  boardReport: string;
  resources: string;
}

export function computeStaffSections(isAdmin: boolean, labels: StaffSectionLabels): NavSection[] {
  const sections: NavSection[] = [{ id: 'my', label: labels.my }];
  if (isAdmin) {
    sections.push(
      { id: 'aggregate', label: labels.aggregate },
      { id: 'surveys', label: labels.surveys },
      { id: 'board-report', label: labels.boardReport },
    );
  }
  sections.push({ id: 'resources', label: labels.resources });
  return sections;
}

export const ADMIN_ROLES = [
  'school_owner',
  'school_principal',
  'school_vice_principal',
  'admin',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(roleKeys: string[]): boolean {
  return roleKeys.some((k) => (ADMIN_ROLES as readonly string[]).includes(k));
}
