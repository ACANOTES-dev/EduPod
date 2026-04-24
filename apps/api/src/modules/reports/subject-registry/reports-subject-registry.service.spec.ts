import { BadRequestException } from '@nestjs/common';

import { REPORT_SUBJECT_KEYS } from '@school/shared/reports';

import {
  OWNER_SENTINEL_PERMISSION,
  ReportsSubjectRegistryService,
} from './reports-subject-registry.service';

describe('ReportsSubjectRegistryService', () => {
  let service: ReportsSubjectRegistryService;

  beforeEach(() => {
    service = new ReportsSubjectRegistryService();
  });

  it('returns all 11 subjects to an owner-like caller', () => {
    const subjects = service.getAllSubjects([OWNER_SENTINEL_PERMISSION]);
    expect(subjects).toHaveLength(REPORT_SUBJECT_KEYS.length);
    expect(subjects.map((s) => s.key).sort()).toEqual([...REPORT_SUBJECT_KEYS].sort());
  });

  it('returns all 11 subjects to any permission set (subjects themselves are not permission-gated)', () => {
    const subjects = service.getAllSubjects([]);
    expect(subjects).toHaveLength(REPORT_SUBJECT_KEYS.length);
  });

  it('strips permission-gated Finance Summary fields from Student for a non-finance user', () => {
    const scoped = service.getSubject('student', []);
    const financeFields = scoped.fields.filter((f) => f.id.startsWith('student.finance_summary.'));
    expect(financeFields).toHaveLength(0);
  });

  it('keeps finance-gated fields visible on Invoice subject when the user has finance.view', () => {
    const withFinance = service.getSubject('invoice', ['finance.view']);
    const withoutFinance = service.getSubject('invoice', []);
    expect(withFinance.fields.length).toBeGreaterThan(0);
    // Invoice fields are gated entirely on finance.view; without it, the
    // tree should come back empty.
    expect(withoutFinance.fields).toHaveLength(0);
  });

  it('keeps the national_id field hidden from Student unless students.view_sensitive is held', () => {
    const ordinary = service.getSubject('student', []);
    const sensitive = service.getSubject('student', ['students.view_sensitive']);
    expect(ordinary.fields.some((f) => f.id === 'student.identity.national_id')).toBe(false);
    expect(sensitive.fields.some((f) => f.id === 'student.identity.national_id')).toBe(true);
  });

  it('owner sentinel bypasses every permission gate', () => {
    const ownerView = service.getSubject('invoice', [OWNER_SENTINEL_PERMISSION]);
    expect(ownerView.fields.length).toBeGreaterThan(0);
    expect(ownerView.fields.every((f) => f.id.startsWith('invoice.'))).toBe(true);
  });

  it('throws BadRequestException for an unknown subject key', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.getSubject('not_a_real_subject' as any, [OWNER_SENTINEL_PERMISSION]),
    ).toThrow(BadRequestException);
  });

  it('getScopedFieldMap produces a Map keyed by field id', () => {
    const map = service.getScopedFieldMap('student', [OWNER_SENTINEL_PERMISSION]);
    expect(map.get('student.identity.first_name')?.type).toBe('string');
    expect(map.get('student.identity.age')?.filterable).toBe(false);
  });

  it('getAdapter returns an adapter with filterColumnMap and buildSelect', () => {
    const adapter = service.getAdapter('student');
    expect(adapter.filterColumnMap['student.identity.first_name']).toBe('first_name');
    expect(typeof adapter.buildSelect).toBe('function');
  });
});
