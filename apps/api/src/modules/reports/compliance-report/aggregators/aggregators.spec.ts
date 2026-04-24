/**
 * Focused unit tests for individual aggregators. The generation-service
 * spec covers end-to-end orchestration (RLS wiring, gap fallbacks, audit
 * persistence); this file exercises per-aggregator branches that are
 * painful to set up through the orchestrator (chronic absenteeism math,
 * teacher-headcount gap path, write-off sum, etc.).
 */
import type { PrismaClient } from '@prisma/client';

import type { AggregatorContext } from '../aggregator.types';

import { attendanceRateAnnualAggregator } from './attendance-rate-annual.aggregator';
import { chronicAbsenteeismCountAggregator } from './chronic-absenteeism-count.aggregator';
import { criticalIncidentsThisYearAggregator } from './critical-incidents-this-year.aggregator';
import { exclusionsThisYearAggregator } from './exclusions-this-year.aggregator';
import { feesCollectedYtdAggregator } from './fees-collected-ytd.aggregator';
import { instructionHoursHeldAggregator } from './instruction-hours-held.aggregator';
import { outstandingBalanceTotalAggregator } from './outstanding-balance-total.aggregator';
import { pupilTeacherRatioAggregator } from './pupil-teacher-ratio.aggregator';
import { qualifiedTeachersPercentAggregator } from './qualified-teachers-percent.aggregator';
import { safeguardingConcernsRaisedAggregator } from './safeguarding-concerns-raised.aggregator';
import { schoolDaysHeldAggregator } from './school-days-held.aggregator';
import { senRegisterCountAggregator } from './sen-register-count.aggregator';
import { staffAbsenceRateAnnualAggregator } from './staff-absence-rate-annual.aggregator';
import { staffHeadcountAggregator } from './staff-headcount.aggregator';
import { studentHeadcountAggregator } from './student-headcount.aggregator';
import { teacherAbsenceDaysUncoveredAggregator } from './teacher-absence-days-uncovered.aggregator';
import { teacherHeadcountAggregator } from './teacher-headcount.aggregator';
import { vettingCurrentPercentAggregator } from './vetting-current-percent.aggregator';
import { writeOffsYtdAggregator } from './write-offs-ytd.aggregator';

const CTX: AggregatorContext = {
  tenantId: 'tenant-1',
  academicYear: {
    id: 'ay-1',
    name: '2026–2027',
    start_date: new Date('2026-09-01'),
    end_date: new Date('2027-06-30'),
  },
};

function makeTx(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    student: { count: jest.fn().mockResolvedValue(0) },
    staffProfile: { count: jest.fn().mockResolvedValue(0) },
    attendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) },
    attendanceSession: { findMany: jest.fn().mockResolvedValue([]) },
    behaviourExclusionCase: { count: jest.fn().mockResolvedValue(0) },
    safeguardingConcern: { count: jest.fn().mockResolvedValue(0) },
    criticalIncident: { count: jest.fn().mockResolvedValue(0) },
    senSupportPlan: { findMany: jest.fn().mockResolvedValue([]) },
    staffVettingRecord: { findMany: jest.fn().mockResolvedValue([]) },
    staffAttendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    invoice: {
      aggregate: jest
        .fn()
        .mockResolvedValue({ _sum: { balance_amount: null, write_off_amount: null } }),
    },
    teacherAbsence: { count: jest.fn().mockResolvedValue(0) },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

describe('studentHeadcountAggregator', () => {
  it('returns the active-students count with no gap', async () => {
    const tx = makeTx({ student: { count: jest.fn().mockResolvedValue(42) } });
    const result = await studentHeadcountAggregator(tx, CTX);
    expect(result.value).toBe(42);
    expect(result.has_gap).toBe(false);
  });
});

describe('staffHeadcountAggregator', () => {
  it('returns the active-staff count with no gap', async () => {
    const tx = makeTx({ staffProfile: { count: jest.fn().mockResolvedValue(8) } });
    const result = await staffHeadcountAggregator(tx, CTX);
    expect(result.value).toBe(8);
    expect(result.has_gap).toBe(false);
  });
});

describe('teacherHeadcountAggregator', () => {
  it('declares a gap when no staff matches a recognised teacher title', async () => {
    const tx = makeTx({ staffProfile: { count: jest.fn().mockResolvedValue(0) } });
    const result = await teacherHeadcountAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('no_staff_with_recognised_teacher_job_title');
  });

  it('returns the matched-teacher count otherwise', async () => {
    const tx = makeTx({ staffProfile: { count: jest.fn().mockResolvedValue(9) } });
    const result = await teacherHeadcountAggregator(tx, CTX);
    expect(result.value).toBe(9);
    expect(result.has_gap).toBe(false);
  });
});

describe('pupilTeacherRatioAggregator', () => {
  it('computes ratio as students/teachers', async () => {
    const tx = makeTx({
      student: { count: jest.fn().mockResolvedValue(120) },
      staffProfile: { count: jest.fn().mockResolvedValue(10) },
    });
    const result = await pupilTeacherRatioAggregator(tx, CTX);
    expect(result.value).toBe(12);
  });

  it('declares a gap on zero teachers (never divides by zero)', async () => {
    const tx = makeTx({
      student: { count: jest.fn().mockResolvedValue(120) },
      staffProfile: { count: jest.fn().mockResolvedValue(0) },
    });
    const result = await pupilTeacherRatioAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('no_active_teachers_to_divide_by');
  });
});

describe('qualifiedTeachersPercentAggregator', () => {
  it('is always an honest gap (field not yet collected)', async () => {
    const tx = makeTx();
    const result = await qualifiedTeachersPercentAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('qualification_field_not_yet_collected');
    expect(result.value).toBeNull();
  });
});

describe('vettingCurrentPercentAggregator', () => {
  it('declares a gap when no active staff exists', async () => {
    const tx = makeTx({ staffProfile: { count: jest.fn().mockResolvedValue(0) } });
    const result = await vettingCurrentPercentAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('no_active_staff');
  });

  it('returns 50% when half of active staff have current vetting', async () => {
    const tx = makeTx({
      staffProfile: { count: jest.fn().mockResolvedValue(10) },
      staffVettingRecord: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { user_id: 'u1' },
            { user_id: 'u2' },
            { user_id: 'u3' },
            { user_id: 'u4' },
            { user_id: 'u5' },
          ]),
      },
    });
    const result = await vettingCurrentPercentAggregator(tx, CTX);
    expect(result.value).toBe(50);
    expect(result.has_gap).toBe(false);
  });
});

describe('attendanceRateAnnualAggregator', () => {
  it('returns null + gap when there are no records', async () => {
    const tx = makeTx({ attendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) } });
    const result = await attendanceRateAnnualAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('no_attendance_records_in_academic_year');
  });

  it('counts late as present when computing the rate', async () => {
    const tx = makeTx({
      attendanceRecord: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'present', _count: { _all: 80 } },
          { status: 'late', _count: { _all: 10 } },
          { status: 'absent_unexcused', _count: { _all: 10 } },
        ]),
      },
    });
    const result = await attendanceRateAnnualAggregator(tx, CTX);
    expect(result.value).toBe(90);
    expect(result.has_gap).toBe(false);
  });
});

describe('chronicAbsenteeismCountAggregator', () => {
  it('counts students below 80% attendance', async () => {
    const tx = makeTx({
      attendanceRecord: {
        groupBy: jest.fn().mockResolvedValue([
          // student A → 50% (below)
          { student_id: 'A', status: 'present', _count: { _all: 5 } },
          { student_id: 'A', status: 'absent_unexcused', _count: { _all: 5 } },
          // student B → 90% (above)
          { student_id: 'B', status: 'present', _count: { _all: 9 } },
          { student_id: 'B', status: 'absent_unexcused', _count: { _all: 1 } },
          // student C → 100%
          { student_id: 'C', status: 'present', _count: { _all: 10 } },
        ]),
      },
    });
    const result = await chronicAbsenteeismCountAggregator(tx, CTX);
    expect(result.value).toBe(1);
    expect(result.has_gap).toBe(false);
  });

  it('returns 0 when no students are below the threshold', async () => {
    const tx = makeTx({
      attendanceRecord: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ student_id: 'A', status: 'present', _count: { _all: 100 } }]),
      },
    });
    const result = await chronicAbsenteeismCountAggregator(tx, CTX);
    expect(result.value).toBe(0);
  });
});

describe('exclusionsThisYearAggregator', () => {
  it('returns the exclusion count within the academic-year window', async () => {
    const tx = makeTx({ behaviourExclusionCase: { count: jest.fn().mockResolvedValue(4) } });
    const result = await exclusionsThisYearAggregator(tx, CTX);
    expect(result.value).toBe(4);
  });
});

describe('senRegisterCountAggregator', () => {
  it('returns the count of distinct SEN profiles with a plan this year', async () => {
    const tx = makeTx({
      senSupportPlan: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ sen_profile_id: 'sp-1' }, { sen_profile_id: 'sp-2' }]),
      },
    });
    const result = await senRegisterCountAggregator(tx, CTX);
    expect(result.value).toBe(2);
  });
});

describe('safeguardingConcernsRaisedAggregator', () => {
  it('returns the count of safeguarding concerns created this year', async () => {
    const tx = makeTx({ safeguardingConcern: { count: jest.fn().mockResolvedValue(5) } });
    const result = await safeguardingConcernsRaisedAggregator(tx, CTX);
    expect(result.value).toBe(5);
  });
});

describe('criticalIncidentsThisYearAggregator', () => {
  it('returns the count of critical incidents declared this year', async () => {
    const tx = makeTx({ criticalIncident: { count: jest.fn().mockResolvedValue(2) } });
    const result = await criticalIncidentsThisYearAggregator(tx, CTX);
    expect(result.value).toBe(2);
  });
});

describe('staffAbsenceRateAnnualAggregator', () => {
  it('returns gap when no staff attendance records exist', async () => {
    const tx = makeTx({ staffAttendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) } });
    const result = await staffAbsenceRateAnnualAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('no_staff_attendance_records_in_academic_year');
  });

  it('returns 25% when a quarter of records are absent', async () => {
    const tx = makeTx({
      staffAttendanceRecord: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'present', _count: { _all: 75 } },
          { status: 'sick_leave', _count: { _all: 15 } },
          { status: 'absent', _count: { _all: 10 } },
        ]),
      },
    });
    const result = await staffAbsenceRateAnnualAggregator(tx, CTX);
    expect(result.value).toBe(25);
    expect(result.has_gap).toBe(false);
  });
});

describe('feesCollectedYtdAggregator', () => {
  it('returns 0 when no payments posted', async () => {
    const tx = makeTx({
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
    });
    const result = await feesCollectedYtdAggregator(tx, CTX);
    expect(result.value).toBe(0);
    expect(result.has_gap).toBe(false);
  });

  it('coerces Decimal sum to Number', async () => {
    const tx = makeTx({
      payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 12345.67 } }) },
    });
    const result = await feesCollectedYtdAggregator(tx, CTX);
    expect(result.value).toBe(12345.67);
  });
});

describe('outstandingBalanceTotalAggregator', () => {
  it('returns 0 when no invoices have an outstanding balance', async () => {
    const tx = makeTx({
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance_amount: null, write_off_amount: null } }),
      },
    });
    const result = await outstandingBalanceTotalAggregator(tx, CTX);
    expect(result.value).toBe(0);
  });
});

describe('writeOffsYtdAggregator', () => {
  it('returns 0 when no write-offs in the academic year', async () => {
    const tx = makeTx({
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance_amount: null, write_off_amount: null } }),
      },
    });
    const result = await writeOffsYtdAggregator(tx, CTX);
    expect(result.value).toBe(0);
  });
});

describe('schoolDaysHeldAggregator', () => {
  it('returns the count of distinct session_date entries', async () => {
    const tx = makeTx({
      attendanceSession: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { session_date: new Date('2026-09-01') },
            { session_date: new Date('2026-09-02') },
            { session_date: new Date('2026-09-03') },
          ]),
      },
    });
    const result = await schoolDaysHeldAggregator(tx, CTX);
    expect(result.value).toBe(3);
  });
});

describe('instructionHoursHeldAggregator', () => {
  it('is an honest gap (data source not yet collected)', async () => {
    const tx = makeTx();
    const result = await instructionHoursHeldAggregator(tx, CTX);
    expect(result.has_gap).toBe(true);
    expect(result.gap_reason).toBe('session_duration_field_not_yet_collected');
    expect(result.value).toBeNull();
  });
});

describe('teacherAbsenceDaysUncoveredAggregator', () => {
  it('returns the count of uncovered teacher absences', async () => {
    const tx = makeTx({ teacherAbsence: { count: jest.fn().mockResolvedValue(6) } });
    const result = await teacherAbsenceDaysUncoveredAggregator(tx, CTX);
    expect(result.value).toBe(6);
  });
});
