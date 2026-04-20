import { computeStaffSections, isAdminRole } from './compute-staff-sections';

const labels = {
  my: 'My Workload',
  aggregate: 'Aggregate',
  surveys: 'Surveys',
  boardReport: 'Board Report',
  resources: 'Resources',
};

describe('computeStaffSections', () => {
  it('principal (admin) sees all five sections in order', () => {
    const sections = computeStaffSections(true, labels);
    expect(sections.map((s) => s.id)).toEqual([
      'my',
      'aggregate',
      'surveys',
      'board-report',
      'resources',
    ]);
  });

  it('teacher (non-admin) sees only my + resources', () => {
    const sections = computeStaffSections(false, labels);
    expect(sections.map((s) => s.id)).toEqual(['my', 'resources']);
  });

  it('always places my first and resources last', () => {
    const adminSections = computeStaffSections(true, labels);
    expect(adminSections[0]!.id).toBe('my');
    expect(adminSections[adminSections.length - 1]!.id).toBe('resources');

    const teacherSections = computeStaffSections(false, labels);
    expect(teacherSections[0]!.id).toBe('my');
    expect(teacherSections[teacherSections.length - 1]!.id).toBe('resources');
  });

  it('applies provided labels to every section', () => {
    const sections = computeStaffSections(true, labels);
    expect(sections.find((s) => s.id === 'my')?.label).toBe('My Workload');
    expect(sections.find((s) => s.id === 'aggregate')?.label).toBe('Aggregate');
    expect(sections.find((s) => s.id === 'surveys')?.label).toBe('Surveys');
    expect(sections.find((s) => s.id === 'board-report')?.label).toBe('Board Report');
    expect(sections.find((s) => s.id === 'resources')?.label).toBe('Resources');
  });
});

describe('isAdminRole', () => {
  it('returns true for school_owner', () => {
    expect(isAdminRole(['school_owner'])).toBe(true);
  });

  it('returns true for school_principal', () => {
    expect(isAdminRole(['school_principal'])).toBe(true);
  });

  it('returns true for school_vice_principal', () => {
    expect(isAdminRole(['school_vice_principal'])).toBe(true);
  });

  it('returns true for admin', () => {
    expect(isAdminRole(['admin'])).toBe(true);
  });

  it('returns false for teacher', () => {
    expect(isAdminRole(['teacher'])).toBe(false);
  });

  it('returns false for parent', () => {
    expect(isAdminRole(['parent'])).toBe(false);
  });

  it('returns false for empty role list', () => {
    expect(isAdminRole([])).toBe(false);
  });

  it('returns true when user has at least one admin role among many', () => {
    expect(isAdminRole(['teacher', 'school_principal'])).toBe(true);
  });
});
