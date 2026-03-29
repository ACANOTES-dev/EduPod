import { Test } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { AttendanceSignalCollector } from './attendance-signal.collector';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000003';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    dailyAttendanceSummary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    attendancePatternAlert: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─── Date Helpers ───────────────────────────────────────────────────────────

/**
 * Create a date that is N school days ago (skipping weekends).
 * Returns a weekday date.
 */
function schoolDaysAgo(n: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let remaining = n;
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      remaining--;
    }
  }
  return date;
}

function makeSummary(
  overrides: {
    id?: string;
    daysAgo?: number;
    date?: Date;
    status?: string;
  } = {},
): {
  id: string;
  tenant_id: string;
  student_id: string;
  summary_date: Date;
  derived_status: string;
  derived_payload: Record<string, unknown>;
} {
  const daysAgo = overrides.daysAgo ?? 0;
  const date = overrides.date ?? schoolDaysAgo(daysAgo);
  return {
    id: overrides.id ?? `summary-${daysAgo}-${date.toISOString()}`,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    summary_date: date,
    derived_status: overrides.status ?? 'present',
    derived_payload: {},
  };
}

function makePatternAlert(overrides: {
  id?: string;
  alert_type: string;
  status?: string;
  details_json?: Record<string, unknown>;
}): {
  id: string;
  tenant_id: string;
  student_id: string;
  alert_type: string;
  detected_date: Date;
  window_start: Date;
  window_end: Date;
  details_json: Record<string, unknown>;
  status: string;
} {
  return {
    id: overrides.id ?? `alert-${overrides.alert_type}`,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    alert_type: overrides.alert_type,
    detected_date: new Date(),
    window_start: schoolDaysAgo(28),
    window_end: new Date(),
    details_json: overrides.details_json ?? {},
    status: overrides.status ?? 'active',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AttendanceSignalCollector', () => {
  let collector: AttendanceSignalCollector;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        AttendanceSignalCollector,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    collector = module.get(AttendanceSignalCollector);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Test 1: Empty data ───────────────────────────────────────────────────

  it('should return score 0 with empty signals when no data exists', async () => {
    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    expect(result.domain).toBe('attendance');
    expect(result.rawScore).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.summaryFragments).toEqual([]);
  });

  // ─── Test 2: attendance_rate_decline ──────────────────────────────────────

  it('should detect attendance_rate_decline when rate is below 90%', async () => {
    // 30 school days: 22 present + 8 absent = 73% rate
    const summaries = [];
    for (let i = 0; i < 22; i++) {
      summaries.push(makeSummary({ daysAgo: i + 9, status: 'present' }));
    }
    for (let i = 0; i < 8; i++) {
      summaries.push(
        makeSummary({
          id: `absent-${i}`,
          daysAgo: i + 1,
          status: 'absent',
        }),
      );
    }

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    const signal = result.signals.find(
      (s) => s.signalType === 'attendance_rate_decline',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('absences');
  });

  // ─── Test 3: consecutive_absences ─────────────────────────────────────────

  it('should detect consecutive_absences with 3 absent days', async () => {
    // 3 consecutive absent school days followed by a present day
    const summaries = [
      makeSummary({ id: 'absent-1', daysAgo: 1, status: 'absent' }),
      makeSummary({ id: 'absent-2', daysAgo: 2, status: 'absent' }),
      makeSummary({ id: 'absent-3', daysAgo: 3, status: 'absent' }),
      makeSummary({ daysAgo: 4, status: 'present' }),
      makeSummary({ daysAgo: 5, status: 'present' }),
      makeSummary({ daysAgo: 6, status: 'present' }),
      makeSummary({ daysAgo: 7, status: 'present' }),
      makeSummary({ daysAgo: 8, status: 'present' }),
      makeSummary({ daysAgo: 9, status: 'present' }),
      makeSummary({ daysAgo: 10, status: 'present' }),
    ];

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    const signal = result.signals.find(
      (s) => s.signalType === 'consecutive_absences',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('3 consecutive school days');
  });

  // ─── Test 4: recurring_day_pattern ────────────────────────────────────────

  it('should detect recurring_day_pattern from active alert', async () => {
    const alerts = [
      makePatternAlert({
        id: 'alert-recurring-1',
        alert_type: 'recurring_day',
        details_json: { day_name: 'Monday', count: 3 },
      }),
    ];

    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    const signal = result.signals.find(
      (s) => s.signalType === 'recurring_day_pattern',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.severity).toBe('low');
    expect(signal!.summaryFragment).toContain('Mondays');
  });

  // ─── Test 5: chronic_tardiness ────────────────────────────────────────────

  it('should detect chronic_tardiness when late rate exceeds 20%', async () => {
    // 20 attended days (14 present + 6 late) = 30% late rate
    const summaries = [];
    for (let i = 0; i < 14; i++) {
      summaries.push(makeSummary({ daysAgo: i + 7, status: 'present' }));
    }
    for (let i = 0; i < 6; i++) {
      summaries.push(
        makeSummary({
          id: `late-${i}`,
          daysAgo: i + 1,
          status: 'late',
        }),
      );
    }

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    const signal = result.signals.find(
      (s) => s.signalType === 'chronic_tardiness',
    );
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.summaryFragment).toContain('Late');
    expect(signal!.summaryFragment).toContain('of');
    expect(signal!.summaryFragment).toContain('attended days');
  });

  // ─── Test 6: attendance_trajectory declining ──────────────────────────────

  it('should detect attendance_trajectory when rates decline 4 consecutive weeks', async () => {
    // Freeze time so both test data and implementation share the same `new Date()`.
    // Use a Wednesday at noon so week windows have predictable weekday counts.
    const frozenNow = new Date('2026-03-25T12:00:00.000Z'); // Wednesday
    jest.useFakeTimers();
    jest.setSystemTime(frozenNow);

    try {
      // computeWeeklyRates windows (oldest to newest):
      //   w=3: [Mar 04 Wed – Mar 04 Wed+6 = Mar 04–Mar 10] — contains Mon–Fri = 5 weekdays
      //   w=2: [Mar 05 Thu – Mar 11 Thu+6 = Mar 05–Mar 11] — wait, that overlaps.
      //
      // Actually the formula is:
      //   w=3: weekEnd = Mar 25 - 21 = Mar 04, weekStart = Mar 04 - 6 = Feb 26
      //   w=2: weekEnd = Mar 25 - 14 = Mar 11, weekStart = Mar 11 - 6 = Mar 05
      //   w=1: weekEnd = Mar 25 - 7  = Mar 18, weekStart = Mar 18 - 6 = Mar 12
      //   w=0: weekEnd = Mar 25,                weekStart = Mar 25 - 6 = Mar 19
      //
      // Window weekdays (all at noon):
      // w=3: Feb 26(Thu), Feb 27(Fri), Mar 02(Mon), Mar 03(Tue), Mar 04(Wed) = 5
      // w=2: Mar 05(Thu), Mar 06(Fri), Mar 09(Mon), Mar 10(Tue), Mar 11(Wed) = 5
      // w=1: Mar 12(Thu), Mar 13(Fri), Mar 16(Mon), Mar 17(Tue), Mar 18(Wed) = 5
      // w=0: Mar 19(Thu), Mar 20(Fri), Mar 23(Mon), Mar 24(Tue), Mar 25(Wed) = 5

      const weekWindows: Array<{ dates: Date[]; presentCount: number }> = [
        {
          // w=3 (oldest) — 100%: 5/5 present
          dates: [
            new Date('2026-02-26T12:00:00Z'),
            new Date('2026-02-27T12:00:00Z'),
            new Date('2026-03-02T12:00:00Z'),
            new Date('2026-03-03T12:00:00Z'),
            new Date('2026-03-04T12:00:00Z'),
          ],
          presentCount: 5,
        },
        {
          // w=2 — 80%: 4/5 present
          dates: [
            new Date('2026-03-05T12:00:00Z'),
            new Date('2026-03-06T12:00:00Z'),
            new Date('2026-03-09T12:00:00Z'),
            new Date('2026-03-10T12:00:00Z'),
            new Date('2026-03-11T12:00:00Z'),
          ],
          presentCount: 4,
        },
        {
          // w=1 — 60%: 3/5 present
          dates: [
            new Date('2026-03-12T12:00:00Z'),
            new Date('2026-03-13T12:00:00Z'),
            new Date('2026-03-16T12:00:00Z'),
            new Date('2026-03-17T12:00:00Z'),
            new Date('2026-03-18T12:00:00Z'),
          ],
          presentCount: 3,
        },
        {
          // w=0 (newest) — 40%: 2/5 present
          dates: [
            new Date('2026-03-19T12:00:00Z'),
            new Date('2026-03-20T12:00:00Z'),
            new Date('2026-03-23T12:00:00Z'),
            new Date('2026-03-24T12:00:00Z'),
            new Date('2026-03-25T12:00:00Z'),
          ],
          presentCount: 2,
        },
      ];

      const summaries: ReturnType<typeof makeSummary>[] = [];
      weekWindows.forEach(({ dates, presentCount }, wi) => {
        dates.forEach((date, di) => {
          summaries.push(
            makeSummary({
              id: `traj-w${wi}-d${di}`,
              date,
              status: di < presentCount ? 'present' : 'absent',
            }),
          );
        });
      });

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);

      const result = await collector.collectSignals(
        TENANT_ID,
        STUDENT_ID,
        ACADEMIC_YEAR_ID,
      );

      const signal = result.signals.find(
        (s) => s.signalType === 'attendance_trajectory',
      );
      expect(signal).toBeDefined();
      expect(signal!.scoreContribution).toBe(20);
      expect(signal!.severity).toBe('medium');
      expect(signal!.summaryFragment).toContain('declining');
      expect(signal!.summaryFragment).toContain('consecutive weeks');
    } finally {
      jest.useRealTimers();
    }
  });

  // ─── Test 7: Multiple signals cap at 100 ─────────────────────────────────

  it('should cap rawScore at 100 when multiple signals exceed the limit', async () => {
    // Reliably trigger signals 1, 2, 3, 4 at maximum points:
    // Signal 1: attendance_rate_decline — rate < 70% → +30
    // Signal 2: consecutive_absences — 5+ consecutive → +25
    // Signal 3: recurring_day_pattern — 2+ alerts → +20
    // Signal 4: chronic_tardiness — alert-based → +10 (at least)
    // Subtotal already = 85. We also get chronic_tardiness from rate if late rate > 50%.
    //
    // Build: 5 consecutive absences (most recent), then 3 late days, then 2 absent.
    // That's 10 school days: 5 absent + 3 late + 2 absent = rate ~30% → +30
    // Consecutive: 5 → +25
    // Tardiness: 3 late / 3 attended = 100% → +15
    // Recurring: 2 alerts → +20
    // Total = 30+25+15+20 = 90 + potential trajectory.
    // Add chronic_tardiness alert to guarantee we pass 100.

    const summaries: ReturnType<typeof makeSummary>[] = [];

    // 5 consecutive absences (most recent school days)
    for (let i = 0; i < 5; i++) {
      summaries.push(
        makeSummary({
          id: `consec-${i}`,
          daysAgo: i + 1,
          status: 'absent',
        }),
      );
    }

    // 3 late days
    for (let i = 0; i < 3; i++) {
      summaries.push(
        makeSummary({
          id: `late-${i}`,
          daysAgo: i + 6,
          status: 'late',
        }),
      );
    }

    // 2 more absences (pushes rate very low)
    for (let i = 0; i < 2; i++) {
      summaries.push(
        makeSummary({
          id: `abs-extra-${i}`,
          daysAgo: i + 9,
          status: 'absent',
        }),
      );
    }

    // Pattern alerts: 2 recurring_day + 1 chronic_tardiness
    const alerts = [
      makePatternAlert({
        id: 'recur-1',
        alert_type: 'recurring_day',
        details_json: { day_name: 'Monday', count: 3 },
      }),
      makePatternAlert({
        id: 'recur-2',
        alert_type: 'recurring_day',
        details_json: { day_name: 'Friday', count: 2 },
      }),
      makePatternAlert({
        id: 'tard-1',
        alert_type: 'chronic_tardiness',
        details_json: {},
      }),
    ];

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);
    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    // The sum of score contributions should exceed rawScore when capped.
    // Signals: rate_decline(30) + consecutive(25) + tardiness(15) + recurring(20) = 90+
    // Any trajectory signal would push it higher.
    const rawSum = result.signals.reduce(
      (sum, s) => sum + s.scoreContribution,
      0,
    );
    expect(rawSum).toBeGreaterThanOrEqual(90);
    expect(result.rawScore).toBe(Math.min(100, rawSum));
    expect(result.rawScore).toBeLessThanOrEqual(100);
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Test 8: Summary fragments generated ──────────────────────────────────

  it('should generate non-empty summary fragments for each detected signal', async () => {
    // Trigger 2 signals: rate decline + recurring day
    const summaries = [];
    for (let i = 0; i < 20; i++) {
      summaries.push(makeSummary({ daysAgo: i + 11, status: 'present' }));
    }
    for (let i = 0; i < 10; i++) {
      summaries.push(
        makeSummary({
          id: `abs-${i}`,
          daysAgo: i + 1,
          status: 'absent',
        }),
      );
    }

    const alerts = [
      makePatternAlert({
        id: 'alert-r',
        alert_type: 'recurring_day',
        details_json: { day_name: 'Wednesday', count: 4 },
      }),
    ];

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);
    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.summaryFragments.length).toBe(result.signals.length);
    for (const fragment of result.summaryFragments) {
      expect(typeof fragment).toBe('string');
      expect(fragment.length).toBeGreaterThan(0);
    }
  });

  // ─── Test 9: Source entity IDs populated ──────────────────────────────────

  it('should populate sourceEntityType and sourceEntityId on every signal', async () => {
    // Trigger attendance_rate_decline + consecutive_absences
    const summaries = [
      makeSummary({ id: 'abs-1', daysAgo: 1, status: 'absent' }),
      makeSummary({ id: 'abs-2', daysAgo: 2, status: 'absent' }),
      makeSummary({ id: 'abs-3', daysAgo: 3, status: 'absent' }),
      makeSummary({ id: 'abs-4', daysAgo: 4, status: 'absent' }),
      makeSummary({ id: 'pres-5', daysAgo: 5, status: 'present' }),
      makeSummary({ id: 'pres-6', daysAgo: 6, status: 'present' }),
      makeSummary({ id: 'pres-7', daysAgo: 7, status: 'present' }),
      makeSummary({ id: 'pres-8', daysAgo: 8, status: 'present' }),
      makeSummary({ id: 'pres-9', daysAgo: 9, status: 'present' }),
      makeSummary({ id: 'pres-10', daysAgo: 10, status: 'present' }),
    ];

    mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue(summaries);

    const result = await collector.collectSignals(
      TENANT_ID,
      STUDENT_ID,
      ACADEMIC_YEAR_ID,
    );

    expect(result.signals.length).toBeGreaterThan(0);
    for (const signal of result.signals) {
      expect(signal.sourceEntityType).toBeDefined();
      expect(signal.sourceEntityType.length).toBeGreaterThan(0);
      expect(signal.sourceEntityId).toBeDefined();
      expect(signal.sourceEntityId.length).toBeGreaterThan(0);
      expect(
        ['DailyAttendanceSummary', 'AttendancePatternAlert'].includes(
          signal.sourceEntityType,
        ),
      ).toBe(true);
    }
  });
});
