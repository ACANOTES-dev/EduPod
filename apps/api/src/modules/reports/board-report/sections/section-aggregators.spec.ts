/**
 * Unit tests for each Board Report section aggregator (impl 06).
 *
 * Each aggregator is tested in isolation with a hand-rolled mock Prisma
 * transaction object — the same pattern the KPI calculators use. Real
 * DB behaviour (RLS, cross-tenant isolation, actual column values) is
 * exercised via the existing `board_reports_tenant_isolation` RLS policy
 * together with the service's use of `createRlsClient` (asserted in
 * the service-level spec).
 */
import { AcademicSectionAggregator } from './academic.aggregator';
import { AttendanceSectionAggregator } from './attendance.aggregator';
import { BehaviourSectionAggregator } from './behaviour.aggregator';
import { EnrolmentSectionAggregator } from './enrolment.aggregator';
import { ExecutiveSummarySectionAggregator } from './executive-summary.aggregator';
import { FinanceSectionAggregator } from './finance.aggregator';
import { SafeguardingSectionAggregator } from './safeguarding.aggregator';
import type { PrismaTransaction, ResolvedTerm } from './section-aggregator.types';
import { displayName, round, toNumber } from './section-aggregator.types';
import { StaffingSectionAggregator } from './staffing.aggregator';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

type MockTx = Record<string, Record<string, jest.Mock>>;
const asTx = (tx: MockTx): PrismaTransaction => tx as unknown as PrismaTransaction;

function term(overrides: Partial<ResolvedTerm> = {}): ResolvedTerm {
  return {
    academic_year_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    academic_year_name: '2026-2027',
    term_number: 1,
    term_label: 'Term 1',
    academic_period_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    term_start: new Date('2026-09-01'),
    term_end: new Date('2026-12-15'),
    prior_term: null,
    ...overrides,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

describe('board-report helpers', () => {
  describe('displayName', () => {
    it('returns full name when anonymise is false', () => {
      expect(displayName('Alice', 'Smith', false)).toBe('Alice Smith');
    });

    it('returns initials with dots when anonymise is true', () => {
      expect(displayName('Alice', 'Smith', true)).toBe('A.S.');
    });

    it('handles a single-name student gracefully', () => {
      expect(displayName('Alice', null, true)).toBe('A.');
      expect(displayName(null, 'Smith', false)).toBe('Smith');
    });

    it('collapses to an em dash when neither name is present', () => {
      expect(displayName(null, null, true)).toBe('—');
      expect(displayName('', '', false)).toBe('—');
    });
  });

  describe('toNumber', () => {
    it('passes through plain numbers', () => {
      expect(toNumber(42)).toBe(42);
    });
    it('parses numeric strings', () => {
      expect(toNumber('1234.5')).toBe(1234.5);
    });
    it('coerces decimal-like objects via toString', () => {
      expect(toNumber({ toString: () => '99.75' })).toBe(99.75);
    });
    it('returns 0 for null / undefined / NaN', () => {
      expect(toNumber(null)).toBe(0);
      expect(toNumber(undefined)).toBe(0);
      expect(toNumber('not-a-number')).toBe(0);
    });
  });

  describe('round', () => {
    it('rounds to two decimals by default', () => {
      expect(round(1.2345)).toBe(1.23);
    });
    it('supports a custom precision', () => {
      expect(round(1.2345, 1)).toBe(1.2);
    });
    it('returns 0 when passed infinities or NaN', () => {
      expect(round(Number.POSITIVE_INFINITY)).toBe(0);
      expect(round(Number.NaN)).toBe(0);
    });
  });
});

// ─── Executive Summary ─────────────────────────────────────────────────────

describe('ExecutiveSummarySectionAggregator', () => {
  it('rolls up five headline metrics from domain queries', async () => {
    const aggregator = new ExecutiveSummarySectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        student: { count: jest.fn().mockResolvedValue(430) },
        attendanceRecord: {
          groupBy: jest.fn().mockResolvedValue([
            { status: 'present', _count: 380 },
            { status: 'late', _count: 30 },
            { status: 'absent_unexcused', _count: 40 },
          ]),
        },
        invoice: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { total_amount: 100000, balance_amount: 10000 } }),
        },
        studentAcademicRiskAlert: { count: jest.fn().mockResolvedValue(12) },
        safeguardingConcern: { count: jest.fn().mockResolvedValue(3) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('executive');
    expect(result.headline_metrics.student_headcount).toBe(430);
    expect(result.headline_metrics.attendance_rate_pct).toBeCloseTo(91.1, 1);
    expect(result.headline_metrics.collection_rate_pct).toBe(90);
    expect(result.headline_metrics.at_risk_student_count).toBe(12);
    expect(result.headline_metrics.open_safeguarding_concerns).toBe(3);
    expect(result.narrative).toBe('');
  });

  it('returns 0 rates when no data exists for the term', async () => {
    const aggregator = new ExecutiveSummarySectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        student: { count: jest.fn().mockResolvedValue(0) },
        attendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) },
        invoice: {
          aggregate: jest
            .fn()
            .mockResolvedValue({ _sum: { total_amount: null, balance_amount: null } }),
        },
        studentAcademicRiskAlert: { count: jest.fn().mockResolvedValue(0) },
        safeguardingConcern: { count: jest.fn().mockResolvedValue(0) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.headline_metrics.attendance_rate_pct).toBe(0);
    expect(result.headline_metrics.collection_rate_pct).toBe(0);
  });
});

// ─── Enrolment ─────────────────────────────────────────────────────────────

describe('EnrolmentSectionAggregator', () => {
  it('groups students by year-group / gender / nationality with prior-term delta', async () => {
    const aggregator = new EnrolmentSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        student: {
          findMany: jest.fn().mockResolvedValue([
            { year_group_id: 'yg-1', gender: 'male', nationality: 'IE' },
            { year_group_id: 'yg-1', gender: 'female', nationality: 'IE' },
            { year_group_id: 'yg-2', gender: 'female', nationality: 'GB' },
            { year_group_id: null, gender: null, nationality: null },
          ]),
          count: jest.fn().mockResolvedValue(3),
        },
        yearGroup: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'yg-1', name: 'Year 7' },
            { id: 'yg-2', name: 'Year 8' },
          ]),
        },
      }),
      TENANT_ID,
      term({
        prior_term: {
          academic_period_id: 'prior-period',
          term_start: new Date('2026-05-01'),
          term_end: new Date('2026-08-31'),
        },
      }),
      { anonymise: true },
    );

    expect(result.type).toBe('enrolment');
    expect(result.total_headcount).toBe(4);
    expect(result.enrolment_change_vs_prior_term.prior).toBe(3);
    expect(result.enrolment_change_vs_prior_term.delta).toBe(1);

    const year7 = result.headcount_by_year_group.find((r) => r.year_group_id === 'yg-1');
    expect(year7?.count).toBe(2);

    expect(result.gender_split).toEqual(
      expect.arrayContaining([
        { gender: 'female', count: 2 },
        { gender: 'male', count: 1 },
        { gender: 'unknown', count: 1 },
      ]),
    );
    expect(result.nationality_split.map((n) => n.nationality)).toEqual(
      expect.arrayContaining(['IE', 'GB', 'unknown']),
    );
  });

  it('returns zero prior when there is no prior term', async () => {
    const aggregator = new EnrolmentSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        student: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn(),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      }),
      TENANT_ID,
      term({ prior_term: null }),
      { anonymise: false },
    );

    expect(result.total_headcount).toBe(0);
    expect(result.enrolment_change_vs_prior_term).toEqual({
      current: 0,
      prior: 0,
      delta: 0,
    });
  });
});

// ─── Attendance ────────────────────────────────────────────────────────────

describe('AttendanceSectionAggregator', () => {
  it('computes average rate, per-year-group breakdown, chronic count, and day-of-week pattern', async () => {
    const aggregator = new AttendanceSectionAggregator();

    const records = [
      {
        status: 'present',
        student_id: 's1',
        student: { year_group_id: 'yg-1' },
        session: { session_date: new Date('2026-09-01T00:00:00Z') },
      },
      {
        status: 'absent_unexcused',
        student_id: 's1',
        student: { year_group_id: 'yg-1' },
        session: { session_date: new Date('2026-09-02T00:00:00Z') },
      },
      {
        status: 'absent_unexcused',
        student_id: 's1',
        student: { year_group_id: 'yg-1' },
        session: { session_date: new Date('2026-09-03T00:00:00Z') },
      },
      {
        status: 'present',
        student_id: 's2',
        student: { year_group_id: 'yg-2' },
        session: { session_date: new Date('2026-09-01T00:00:00Z') },
      },
    ];

    const result = await aggregator.aggregate(
      asTx({
        attendanceRecord: { findMany: jest.fn().mockResolvedValue(records) },
        yearGroup: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'yg-1', name: 'Year 7' },
            { id: 'yg-2', name: 'Year 8' },
          ]),
        },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('attendance');
    expect(result.average_rate_pct).toBeCloseTo(50, 1);
    expect(result.chronic_absenteeism_count).toBe(1);
    expect(result.chronic_absenteeism_threshold_pct).toBe(85);

    const yg1 = result.rate_by_year_group.find((r) => r.year_group_id === 'yg-1');
    expect(yg1?.rate_pct).toBeCloseTo(33.3, 1);
    const yg2 = result.rate_by_year_group.find((r) => r.year_group_id === 'yg-2');
    expect(yg2?.rate_pct).toBe(100);

    expect(result.day_of_week_pattern.length).toBe(3);
  });
});

// ─── Academic ──────────────────────────────────────────────────────────────

describe('AcademicSectionAggregator', () => {
  const basicGrades = [
    {
      raw_score: 85,
      student_id: 's1',
      student: { first_name: 'Alice', last_name: 'Smith', year_group_id: 'yg-1' },
      assessment: {
        max_score: 100,
        subject_id: 'sub-maths',
        subject: { id: 'sub-maths', name: 'Maths' },
      },
    },
    {
      raw_score: 40,
      student_id: 's2',
      student: { first_name: 'Bob', last_name: 'Jones', year_group_id: 'yg-1' },
      assessment: {
        max_score: 100,
        subject_id: 'sub-maths',
        subject: { id: 'sub-maths', name: 'Maths' },
      },
    },
    {
      raw_score: 70,
      student_id: 's1',
      student: { first_name: 'Alice', last_name: 'Smith', year_group_id: 'yg-1' },
      assessment: {
        max_score: 100,
        subject_id: 'sub-eng',
        subject: { id: 'sub-eng', name: 'English' },
      },
    },
  ];

  it('anonymises performer display labels to initials by default', async () => {
    const aggregator = new AcademicSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        grade: { findMany: jest.fn().mockResolvedValue(basicGrades) },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 7' }]) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('academic');
    const alice = result.top_performers[0];
    expect(alice?.display_label).toBe('A.S.');
    expect(alice?.average_score_pct).toBeCloseTo(77.5, 1);
  });

  it('returns full names when anonymise is false', async () => {
    const aggregator = new AcademicSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        grade: { findMany: jest.fn().mockResolvedValue(basicGrades) },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 7' }]) },
      }),
      TENANT_ID,
      term(),
      { anonymise: false },
    );

    const alice = result.top_performers[0];
    expect(alice?.display_label).toBe('Alice Smith');
  });

  it('computes pass/fail rates and subject averages', async () => {
    const aggregator = new AcademicSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        grade: { findMany: jest.fn().mockResolvedValue(basicGrades) },
        yearGroup: { findMany: jest.fn().mockResolvedValue([{ id: 'yg-1', name: 'Year 7' }]) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    const year7 = result.pass_fail_by_year_group.find((r) => r.year_group_id === 'yg-1');
    expect(year7?.pass_rate_pct).toBeCloseTo(66.7, 1);
    expect(year7?.fail_rate_pct).toBeCloseTo(33.3, 1);
    expect(year7?.graded_count).toBe(3);

    const maths = result.subject_averages.find((s) => s.subject_id === 'sub-maths');
    expect(maths?.average_score_pct).toBeCloseTo(62.5, 1);
  });

  it('skips grades with a zero or missing max_score to avoid divide-by-zero', async () => {
    const aggregator = new AcademicSectionAggregator();
    const result = await aggregator.aggregate(
      asTx({
        grade: {
          findMany: jest.fn().mockResolvedValue([
            {
              raw_score: 10,
              student_id: 's9',
              student: { first_name: 'X', last_name: 'Y', year_group_id: null },
              assessment: {
                max_score: 0,
                subject_id: null,
                subject: { id: null, name: 'Other' },
              },
            },
          ]),
        },
        yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.pass_fail_by_year_group).toHaveLength(0);
    expect(result.top_performers).toHaveLength(0);
  });
});

// ─── Behaviour ─────────────────────────────────────────────────────────────

describe('BehaviourSectionAggregator', () => {
  it('counts incidents by category, year group, sanction type, and appeal decision', async () => {
    const aggregator = new BehaviourSectionAggregator();
    const result = await aggregator.aggregate(
      asTx({
        behaviourIncident: {
          findMany: jest.fn().mockResolvedValue([
            {
              category_id: 'cat-1',
              category: { id: 'cat-1', name: 'Disruption' },
              participants: [
                {
                  student: {
                    year_group_id: 'yg-1',
                    year_group: { id: 'yg-1', name: 'Year 7' },
                  },
                },
              ],
              sanctions: [{ type: 'detention' }],
              appeals: [{ decision: 'upheld' }],
            },
            {
              category_id: 'cat-1',
              category: { id: 'cat-1', name: 'Disruption' },
              participants: [
                {
                  student: {
                    year_group_id: 'yg-2',
                    year_group: { id: 'yg-2', name: 'Year 8' },
                  },
                },
              ],
              sanctions: [{ type: 'detention' }, { type: 'warning' }],
              appeals: [],
            },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
      }),
      TENANT_ID,
      term({
        prior_term: {
          academic_period_id: 'prior-period',
          term_start: new Date('2026-05-01'),
          term_end: new Date('2026-08-31'),
        },
      }),
      { anonymise: true },
    );

    expect(result.incident_count_total).toBe(2);
    expect(result.incident_count_by_category.find((c) => c.category_id === 'cat-1')?.count).toBe(2);
    expect(result.incident_count_by_year_group.find((y) => y.year_group_id === 'yg-1')?.count).toBe(
      1,
    );
    expect(result.sanction_outcomes.find((s) => s.sanction_type === 'detention')?.count).toBe(2);
    expect(result.appeals_outcomes.find((a) => a.outcome === 'upheld')?.count).toBe(1);
    expect(result.trend_vs_prior_term).toEqual({ current: 2, prior: 1, delta: 1 });
  });

  it('skips prior-term count when there is no prior term', async () => {
    const aggregator = new BehaviourSectionAggregator();
    const count = jest.fn();
    const result = await aggregator.aggregate(
      asTx({
        behaviourIncident: { findMany: jest.fn().mockResolvedValue([]), count },
      }),
      TENANT_ID,
      term({ prior_term: null }),
      { anonymise: true },
    );

    expect(result.trend_vs_prior_term.prior).toBe(0);
    expect(count).not.toHaveBeenCalled();
  });
});

// ─── Safeguarding ──────────────────────────────────────────────────────────

describe('SafeguardingSectionAggregator', () => {
  it('counts open concerns by age bucket without leaking student identifiers', async () => {
    const aggregator = new SafeguardingSectionAggregator();

    const now = Date.now();
    const daysAgo = (d: number): Date => new Date(now - d * 24 * 60 * 60 * 1000);

    const result = await aggregator.aggregate(
      asTx({
        safeguardingConcern: {
          findMany: jest.fn().mockResolvedValue([
            { created_at: daysAgo(3), student_id: 's1' },
            { created_at: daysAgo(10), student_id: 's2' },
            { created_at: daysAgo(60), student_id: 's1' },
          ]),
          count: jest.fn().mockResolvedValue(1),
        },
        safeguardingAction: { count: jest.fn().mockResolvedValue(5) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('safeguarding');
    expect(result.open_concerns_count).toBe(3);
    expect(result.oldest_open_concern_age_days).toBeGreaterThanOrEqual(60);
    expect(result.actions_taken_count).toBe(5);
    expect(result.critical_incidents_count).toBe(1);
    const sample = result.age_histogram.find((b) => b.bucket_label === '0–7 days');
    expect(sample?.count).toBe(1);
    expect(result.detail_summary).not.toMatch(/s1|s2|student_id/);
  });

  it('returns a friendly zero state when no concerns are open', async () => {
    const aggregator = new SafeguardingSectionAggregator();
    const result = await aggregator.aggregate(
      asTx({
        safeguardingConcern: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
        safeguardingAction: { count: jest.fn().mockResolvedValue(0) },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.open_concerns_count).toBe(0);
    expect(result.oldest_open_concern_age_days).toBeNull();
    expect(result.detail_summary).toBe('No open safeguarding concerns.');
  });
});

// ─── Finance ───────────────────────────────────────────────────────────────

describe('FinanceSectionAggregator', () => {
  it('computes the collection rate from invoice totals and falls back to GBP when no invoice exists', async () => {
    const aggregator = new FinanceSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        invoice: {
          aggregate: jest
            .fn()
            .mockResolvedValueOnce({
              _count: { _all: 120 },
              _sum: { total_amount: 200000, balance_amount: 20000 },
            })
            .mockResolvedValueOnce({
              _count: { _all: 8 },
              _sum: { balance_amount: 8000 },
            })
            .mockResolvedValueOnce({
              _count: { _all: 2 },
              _sum: { write_off_amount: 1200 },
            }),
          findFirst: jest.fn().mockResolvedValue({ currency_code: 'EUR' }),
        },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('finance');
    expect(result.invoices_issued_count).toBe(120);
    expect(result.total_invoiced_amount).toBe(200000);
    expect(result.total_collected_amount).toBe(180000);
    expect(result.collection_rate_pct).toBe(90);
    expect(result.overdue_count).toBe(8);
    expect(result.overdue_amount).toBe(8000);
    expect(result.write_off_count).toBe(2);
    expect(result.write_off_amount).toBe(1200);
    expect(result.currency_code).toBe('EUR');
  });
});

// ─── Staffing ──────────────────────────────────────────────────────────────

describe('StaffingSectionAggregator', () => {
  it('rolls up headcount, turnover, attendance rate, pending leave, and cover gaps', async () => {
    const aggregator = new StaffingSectionAggregator();

    const result = await aggregator.aggregate(
      asTx({
        staffProfile: {
          count: jest
            .fn()
            .mockResolvedValueOnce(32)
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(1),
        },
        staffAttendanceRecord: {
          groupBy: jest.fn().mockResolvedValue([
            { status: 'present', _count: 400 },
            { status: 'half_day', _count: 10 },
            { status: 'sick_leave', _count: 15 },
          ]),
        },
        leaveRequest: { count: jest.fn().mockResolvedValue(3) },
        teacherAbsence: {
          count: jest.fn().mockResolvedValue(20),
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', substitution_records: [{ id: 'r1' }] },
            { id: 'a2', substitution_records: [] },
            { id: 'a3', substitution_records: [] },
          ]),
        },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );

    expect(result.type).toBe('staffing');
    expect(result.headcount_active).toBe(32);
    expect(result.headcount_inactive).toBe(4);
    expect(result.turnover_this_term).toEqual({ arrivals: 2, departures: 1 });
    expect(result.attendance_rate_pct).toBeCloseTo(96.5, 1);
    expect(result.pending_leave_requests).toBe(3);
    expect(result.absences_this_term).toBe(20);
    expect(result.cover_gaps_unfilled).toBe(2);
  });

  it('returns 0 attendance rate when no staff attendance rows exist', async () => {
    const aggregator = new StaffingSectionAggregator();
    const result = await aggregator.aggregate(
      asTx({
        staffProfile: { count: jest.fn().mockResolvedValue(0) },
        staffAttendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) },
        leaveRequest: { count: jest.fn().mockResolvedValue(0) },
        teacherAbsence: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
      }),
      TENANT_ID,
      term(),
      { anonymise: true },
    );
    expect(result.attendance_rate_pct).toBe(0);
  });
});
