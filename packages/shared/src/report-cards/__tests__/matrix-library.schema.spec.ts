import { classMatrixQuerySchema, listReportCardLibraryQuerySchema } from '../matrix-library.schema';

describe('classMatrixQuerySchema', () => {
  it('defaults academic_period_id to "all"', () => {
    const result = classMatrixQuerySchema.parse({});
    expect(result.academic_period_id).toBe('all');
  });

  it('accepts a uuid', () => {
    const result = classMatrixQuerySchema.parse({
      academic_period_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.academic_period_id).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('accepts the literal "all"', () => {
    const result = classMatrixQuerySchema.parse({ academic_period_id: 'all' });
    expect(result.academic_period_id).toBe('all');
  });

  it('rejects an invalid uuid / string', () => {
    expect(() => classMatrixQuerySchema.parse({ academic_period_id: 'bogus' })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => classMatrixQuerySchema.parse({ extra: 'x' })).toThrow();
  });
});

describe('listReportCardLibraryQuerySchema', () => {
  it('defaults page and pageSize', () => {
    const result = listReportCardLibraryQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });

  it('coerces string pagination', () => {
    const result = listReportCardLibraryQuerySchema.parse({ page: '3', pageSize: '50' });
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
  });

  it('accepts optional filters', () => {
    const result = listReportCardLibraryQuerySchema.parse({
      class_id: '11111111-1111-4111-8111-111111111111',
      year_group_id: '22222222-2222-4222-8222-222222222222',
      academic_period_id: '33333333-3333-4333-8333-333333333333',
      language: 'en',
    });
    expect(result.class_id).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.year_group_id).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.academic_period_id).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.language).toBe('en');
  });

  it('rejects pageSize > 100', () => {
    expect(() => listReportCardLibraryQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  it('rejects invalid uuids', () => {
    expect(() => listReportCardLibraryQuerySchema.parse({ class_id: 'bogus' })).toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => listReportCardLibraryQuerySchema.parse({ unknown: 1 })).toThrow();
  });
});
