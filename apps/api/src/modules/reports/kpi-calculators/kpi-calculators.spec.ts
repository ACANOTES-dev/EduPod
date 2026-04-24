import {
  calculateAtRiskStudentsNew,
  calculateAttendanceToday,
  calculateBehaviourIncidentsWeek,
  calculateCoverGapsWeek,
  calculateGradesSubmissionLag,
  calculateNewApplicationsWeek,
  calculateOpenSafeguardingConcerns,
  calculateOverdueInvoices,
  calculateParentEscalations,
  calculateTeacherSubmissionCompliance,
} from './index';

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

// Loose mock shape for the calculator's Prisma transaction client. The
// calculators narrow whatever model they need, so a generic bag of jest
// mocks is good enough — cast via `unknown` at the call site.
type MockTx = Record<string, Record<string, jest.Mock>>;

const asTx = (tx: MockTx): Parameters<typeof calculateAttendanceToday>[0] =>
  tx as unknown as Parameters<typeof calculateAttendanceToday>[0];

describe('kpi calculators', () => {
  // ─── kpi-attendance-today ─────────────────────────────────────────────────

  describe('calculateAttendanceToday', () => {
    it('computes present rate and 7-day delta', async () => {
      const groupBy = jest
        .fn()
        .mockResolvedValueOnce([
          { status: 'present', _count: 80 },
          { status: 'late', _count: 5 },
          { status: 'absent_unexcused', _count: 15 },
        ])
        .mockResolvedValueOnce([
          { status: 'present', _count: 800 },
          { status: 'absent_unexcused', _count: 200 },
        ]);

      const result = await calculateAttendanceToday(
        asTx({ attendanceRecord: { groupBy } }),
        TENANT_ID,
      );

      expect(result.value).toBe('85.0%');
      expect(result.value_raw).toBe(85);
      expect(result.delta).not.toBeNull();
      expect(result.delta!.unit).toBe('percent');
      expect(result.severity).toBeNull();
    });

    it('returns em-dash and null delta when no attendance today AND no rolling data', async () => {
      const groupBy = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await calculateAttendanceToday(
        asTx({ attendanceRecord: { groupBy } }),
        TENANT_ID,
      );

      expect(result.value).toBe('—');
      expect(result.value_raw).toBe(0);
      expect(result.delta).toBeNull();
      expect(result.severity).toBeNull();
    });

    it('marks severity=warning when rate falls below 80%', async () => {
      const groupBy = jest
        .fn()
        .mockResolvedValueOnce([
          { status: 'present', _count: 70 },
          { status: 'absent_unexcused', _count: 30 },
        ])
        .mockResolvedValueOnce([]);

      const result = await calculateAttendanceToday(
        asTx({ attendanceRecord: { groupBy } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(70);
      expect(result.severity).toBe('warning');
    });
  });

  // ─── kpi-teacher-submission-compliance ────────────────────────────────────

  describe('calculateTeacherSubmissionCompliance', () => {
    it('computes submission rate vs last week', async () => {
      const count = jest
        .fn()
        .mockResolvedValueOnce(100) // expected this week
        .mockResolvedValueOnce(90) // submitted this week
        .mockResolvedValueOnce(100) // expected last week
        .mockResolvedValueOnce(85); // submitted last week

      const result = await calculateTeacherSubmissionCompliance(
        asTx({ attendanceSession: { count } }),
        TENANT_ID,
      );

      expect(result.value).toBe('90.0%');
      expect(result.value_raw).toBe(90);
      expect(result.delta!.value).toBe(5);
      expect(result.delta!.direction).toBe('up');
    });

    it('returns 0% when nothing was expected', async () => {
      const count = jest.fn().mockResolvedValue(0);

      const result = await calculateTeacherSubmissionCompliance(
        asTx({ attendanceSession: { count } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(0);
      expect(result.value).toBe('0.0%');
    });
  });

  // ─── kpi-at-risk-students-new ─────────────────────────────────────────────

  describe('calculateAtRiskStudentsNew', () => {
    it('returns week-over-week delta for new alerts', async () => {
      const count = jest.fn().mockResolvedValueOnce(6).mockResolvedValueOnce(4);

      const result = await calculateAtRiskStudentsNew(
        asTx({ studentAcademicRiskAlert: { count } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(6);
      expect(result.delta!.value).toBe(2);
      expect(result.delta!.direction).toBe('up');
      expect(result.delta!.better_when).toBe('down');
    });

    it('returns severity=warning when more than 10 new alerts this week', async () => {
      const count = jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(8);

      const result = await calculateAtRiskStudentsNew(
        asTx({ studentAcademicRiskAlert: { count } }),
        TENANT_ID,
      );

      expect(result.severity).toBe('warning');
    });
  });

  // ─── kpi-behaviour-incidents-week ─────────────────────────────────────────

  describe('calculateBehaviourIncidentsWeek', () => {
    it('returns this-week incident count and delta vs rolling 7-day avg', async () => {
      const count = jest
        .fn()
        .mockResolvedValueOnce(15) // thisWeekCount
        .mockResolvedValueOnce(14); // rollingCount (7 days)

      const result = await calculateBehaviourIncidentsWeek(
        asTx({ behaviourIncident: { count } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(15);
      // 15 - (14/7) = 13
      expect(result.delta!.value).toBe(13);
      expect(result.delta!.direction).toBe('up');
      expect(result.delta!.better_when).toBe('down');
    });

    it('severity=warning when more than 20 incidents this week', async () => {
      const count = jest.fn().mockResolvedValueOnce(25).mockResolvedValueOnce(14);

      const result = await calculateBehaviourIncidentsWeek(
        asTx({ behaviourIncident: { count } }),
        TENANT_ID,
      );

      expect(result.severity).toBe('warning');
    });
  });

  // ─── kpi-open-safeguarding-concerns ───────────────────────────────────────

  describe('calculateOpenSafeguardingConcerns', () => {
    it('returns count with oldest age and null delta', async () => {
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const findFirst = jest.fn().mockResolvedValue({ created_at: fourDaysAgo });
      const count = jest.fn().mockResolvedValue(3);

      const result = await calculateOpenSafeguardingConcerns(
        asTx({ safeguardingConcern: { findFirst, count } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(3);
      expect(String(result.value)).toMatch(/^3 \(\d+d oldest\)$/);
      expect(result.delta).toBeNull();
    });

    it('returns 0 when no open concerns exist', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const count = jest.fn().mockResolvedValue(0);

      const result = await calculateOpenSafeguardingConcerns(
        asTx({ safeguardingConcern: { findFirst, count } }),
        TENANT_ID,
      );

      expect(result.value).toBe(0);
      expect(result.value_raw).toBe(0);
      expect(result.severity).toBeNull();
    });

    it('severity=critical when the oldest open concern is > 14 days', async () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      const findFirst = jest.fn().mockResolvedValue({ created_at: twentyDaysAgo });
      const count = jest.fn().mockResolvedValue(1);

      const result = await calculateOpenSafeguardingConcerns(
        asTx({ safeguardingConcern: { findFirst, count } }),
        TENANT_ID,
      );

      expect(result.severity).toBe('critical');
    });
  });

  // ─── kpi-overdue-invoices ─────────────────────────────────────────────────

  describe('calculateOverdueInvoices', () => {
    it('returns current overdue count and week-on-week delta', async () => {
      const count = jest
        .fn()
        .mockResolvedValueOnce(8) // current total overdue
        .mockResolvedValueOnce(3) // this week newly overdue
        .mockResolvedValueOnce(2); // last week newly overdue

      const result = await calculateOverdueInvoices(asTx({ invoice: { count } }), TENANT_ID);

      expect(result.value_raw).toBe(8);
      expect(result.delta!.value).toBe(1);
      expect(result.delta!.direction).toBe('up');
    });
  });

  // ─── kpi-grades-submission-lag ────────────────────────────────────────────

  describe('calculateGradesSubmissionLag', () => {
    it('counts unpublished assessments past their grading_deadline', async () => {
      const count = jest
        .fn()
        .mockResolvedValueOnce(7) // current overdue
        .mockResolvedValueOnce(3); // last week overdue

      const result = await calculateGradesSubmissionLag(asTx({ assessment: { count } }), TENANT_ID);

      expect(result.value_raw).toBe(7);
      expect(result.delta!.value).toBe(4);
      expect(result.severity).toBe('warning');
    });
  });

  // ─── kpi-new-applications-week ────────────────────────────────────────────

  describe('calculateNewApplicationsWeek', () => {
    it('returns week-over-week delta for applications', async () => {
      const count = jest.fn().mockResolvedValueOnce(9).mockResolvedValueOnce(6);

      const result = await calculateNewApplicationsWeek(
        asTx({ application: { count } }),
        TENANT_ID,
      );

      expect(result.value_raw).toBe(9);
      expect(result.delta!.value).toBe(3);
      expect(result.delta!.direction).toBe('up');
      expect(result.delta!.better_when).toBe('up');
    });
  });

  // ─── kpi-parent-escalations ───────────────────────────────────────────────

  describe('calculateParentEscalations', () => {
    it('counts conversations matching the escalation predicate', async () => {
      const count = jest.fn().mockResolvedValue(4);

      const result = await calculateParentEscalations(asTx({ conversation: { count } }), TENANT_ID);

      expect(result.value_raw).toBe(4);
      expect(result.delta).toBeNull();
      expect(result.sparkline).toEqual([4]);
    });

    it('severity=warning when more than 5 escalations', async () => {
      const count = jest.fn().mockResolvedValue(7);

      const result = await calculateParentEscalations(asTx({ conversation: { count } }), TENANT_ID);

      expect(result.severity).toBe('warning');
    });
  });

  // ─── kpi-cover-gaps-week ──────────────────────────────────────────────────

  describe('calculateCoverGapsWeek', () => {
    it('counts non-cancelled teacher absences this week without a substitution', async () => {
      const count = jest.fn().mockResolvedValue(2);

      const result = await calculateCoverGapsWeek(asTx({ teacherAbsence: { count } }), TENANT_ID);

      expect(result.value_raw).toBe(2);
      expect(result.delta).toBeNull();
      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            cancelled_at: null,
            substitution_records: { none: {} },
          }),
        }),
      );
    });
  });
});
