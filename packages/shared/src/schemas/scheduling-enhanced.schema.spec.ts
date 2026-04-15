import { reportAbsenceSchema, selfReportAbsenceSchema } from './scheduling-enhanced.schema';

const VALID_STAFF_ID = '00000000-0000-0000-0000-000000000001';

describe('reportAbsenceSchema — period range validation (SCHED-015)', () => {
  it('accepts equal period_from and period_to (single-period absence)', () => {
    const result = reportAbsenceSchema.safeParse({
      staff_id: VALID_STAFF_ID,
      date: '2026-04-20',
      full_day: false,
      period_from: 3,
      period_to: 3,
    });
    expect(result.success).toBe(true);
  });

  it('accepts ascending period range', () => {
    const result = reportAbsenceSchema.safeParse({
      staff_id: VALID_STAFF_ID,
      date: '2026-04-20',
      full_day: false,
      period_from: 2,
      period_to: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects period_to before period_from', () => {
    const result = reportAbsenceSchema.safeParse({
      staff_id: VALID_STAFF_ID,
      date: '2026-04-20',
      full_day: false,
      period_from: 5,
      period_to: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'period_to');
      expect(err?.message).toBe('period_to must be on or after period_from');
    }
  });

  it('accepts period_from with period_to omitted', () => {
    const result = reportAbsenceSchema.safeParse({
      staff_id: VALID_STAFF_ID,
      date: '2026-04-20',
      full_day: false,
      period_from: 2,
    });
    expect(result.success).toBe(true);
  });

  it('still rejects date_to before date', () => {
    const result = reportAbsenceSchema.safeParse({
      staff_id: VALID_STAFF_ID,
      date: '2026-04-20',
      date_to: '2026-04-19',
      full_day: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('selfReportAbsenceSchema — period range validation (SCHED-015)', () => {
  it('rejects period_to before period_from', () => {
    const result = selfReportAbsenceSchema.safeParse({
      date: '2026-04-20',
      full_day: false,
      period_from: 5,
      period_to: 3,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = result.error.issues.find((i) => i.path[0] === 'period_to');
      expect(err?.message).toBe('period_to must be on or after period_from');
    }
  });

  it('accepts ascending period range', () => {
    const result = selfReportAbsenceSchema.safeParse({
      date: '2026-04-20',
      full_day: false,
      period_from: 2,
      period_to: 4,
    });
    expect(result.success).toBe(true);
  });
});
