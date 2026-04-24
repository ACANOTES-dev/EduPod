import {
  getMetricCalculator,
  getTodayStart,
  getWeekStart,
  METRIC_REGISTRY,
  type PrismaTransaction,
} from './metric-registry';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

type MockTx = Record<string, Record<string, jest.Mock>>;
const asTx = (tx: MockTx): PrismaTransaction => tx as unknown as PrismaTransaction;

describe('report-alerts metric registry', () => {
  describe('time helpers', () => {
    it('getTodayStart zeroes time-of-day', () => {
      const today = getTodayStart(new Date('2026-04-24T13:45:30Z'));
      expect(today.getHours()).toBe(0);
      expect(today.getMinutes()).toBe(0);
    });

    it('getWeekStart returns the Sunday before now', () => {
      const start = getWeekStart(new Date('2026-04-22T13:45:30Z')); // Wednesday
      expect(start.getDay()).toBe(0);
      expect(start.getHours()).toBe(0);
    });
  });

  describe('registry shape', () => {
    it('exposes all 8 documented metric keys', () => {
      const keys = Object.keys(METRIC_REGISTRY).sort();
      expect(keys).toEqual(
        [
          'at_risk_students_count',
          'attendance_rate_today',
          'behaviour_incidents_week',
          'cover_gaps_week',
          'open_safeguarding_concerns_count',
          'overdue_invoices_count',
          'teacher_submission_compliance_week',
          'unpaid_balance_total',
        ].sort(),
      );
    });

    it('returns a calculator for every registered key', () => {
      for (const key of Object.keys(METRIC_REGISTRY)) {
        expect(getMetricCalculator(key)).toBeInstanceOf(Function);
      }
    });

    it('returns null for unknown keys', () => {
      expect(getMetricCalculator('not_a_real_metric')).toBeNull();
      expect(getMetricCalculator('')).toBeNull();
    });
  });

  describe('overdue_invoices_count', () => {
    it('counts active invoices past due with positive balance', async () => {
      const count = jest.fn().mockResolvedValue(7);
      const tx = asTx({ invoice: { count } });
      const calc = getMetricCalculator('overdue_invoices_count');
      expect(calc).not.toBeNull();
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(7);
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            balance_amount: { gt: 0 },
          }),
        }),
      );
    });
  });

  describe('attendance_rate_today', () => {
    it('returns the present rate as a 1dp percentage', async () => {
      const groupBy = jest.fn().mockResolvedValueOnce([
        { status: 'present', _count: 80 },
        { status: 'late', _count: 5 },
        { status: 'absent_unexcused', _count: 15 },
      ]);
      const tx = asTx({ attendanceRecord: { groupBy } });
      const calc = getMetricCalculator('attendance_rate_today');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(85.0);
    });

    it('returns 0 when no attendance has been marked today', async () => {
      const groupBy = jest.fn().mockResolvedValueOnce([]);
      const tx = asTx({ attendanceRecord: { groupBy } });
      const calc = getMetricCalculator('attendance_rate_today');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(0);
    });

    it('rounds to one decimal place', async () => {
      const groupBy = jest.fn().mockResolvedValueOnce([
        { status: 'present', _count: 1 },
        { status: 'absent_unexcused', _count: 2 },
      ]);
      const tx = asTx({ attendanceRecord: { groupBy } });
      const calc = getMetricCalculator('attendance_rate_today');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(33.3);
    });
  });

  describe('open_safeguarding_concerns_count', () => {
    it('counts concerns whose status is in the open set', async () => {
      const count = jest.fn().mockResolvedValue(4);
      const tx = asTx({ safeguardingConcern: { count } });
      const calc = getMetricCalculator('open_safeguarding_concerns_count');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(4);
    });
  });

  describe('at_risk_students_count', () => {
    it('counts active risk alerts only', async () => {
      const count = jest.fn().mockResolvedValue(12);
      const tx = asTx({ studentAcademicRiskAlert: { count } });
      const calc = getMetricCalculator('at_risk_students_count');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(12);
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });
  });

  describe('unpaid_balance_total', () => {
    it('sums positive balances on active invoices', async () => {
      const aggregate = jest.fn().mockResolvedValue({ _sum: { balance_amount: 12345.67 } });
      const tx = asTx({ invoice: { aggregate } });
      const calc = getMetricCalculator('unpaid_balance_total');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(12345.67);
    });

    it('returns 0 when there are no rows', async () => {
      const aggregate = jest.fn().mockResolvedValue({ _sum: { balance_amount: null } });
      const tx = asTx({ invoice: { aggregate } });
      const calc = getMetricCalculator('unpaid_balance_total');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(0);
    });
  });

  describe('behaviour_incidents_week', () => {
    it('counts incidents this week excluding withdrawn/appealed', async () => {
      const count = jest.fn().mockResolvedValue(9);
      const tx = asTx({ behaviourIncident: { count } });
      const calc = getMetricCalculator('behaviour_incidents_week');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(9);
    });
  });

  describe('teacher_submission_compliance_week', () => {
    it('returns 0 when no sessions are expected', async () => {
      const count = jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0);
      const tx = asTx({ attendanceSession: { count } });
      const calc = getMetricCalculator('teacher_submission_compliance_week');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(0);
    });

    it('computes (submitted / expected) * 100 rounded to 1dp', async () => {
      const count = jest.fn().mockResolvedValueOnce(120).mockResolvedValueOnce(96);
      const tx = asTx({ attendanceSession: { count } });
      const calc = getMetricCalculator('teacher_submission_compliance_week');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(80);
    });
  });

  describe('cover_gaps_week', () => {
    it('counts uncovered absences this week', async () => {
      const count = jest.fn().mockResolvedValue(3);
      const tx = asTx({ teacherAbsence: { count } });
      const calc = getMetricCalculator('cover_gaps_week');
      const result = await calc!(tx, TENANT_ID);
      expect(result).toBe(3);
      const args = count.mock.calls[0]![0];
      const where = args.where as Record<string, unknown>;
      expect(where.cancelled_at).toBeNull();
      expect(where.substitution_records).toEqual({ none: {} });
    });
  });
});
