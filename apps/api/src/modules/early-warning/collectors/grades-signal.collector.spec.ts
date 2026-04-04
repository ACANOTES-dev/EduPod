import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, GradebookReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { GradesSignalCollector } from './grades-signal.collector';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000003';
const PERIOD_1_ID = '00000000-0000-0000-0000-000000000010';
const PERIOD_2_ID = '00000000-0000-0000-0000-000000000011';
const ALERT_ID_1 = '00000000-0000-0000-0000-000000000020';
const SNAPSHOT_ID_1 = '00000000-0000-0000-0000-000000000030';
const SNAPSHOT_ID_2 = '00000000-0000-0000-0000-000000000031';
const GRADE_ID_1 = '00000000-0000-0000-0000-000000000040';

const SUBJECT_A = '00000000-0000-0000-0000-0000000000a1';
const SUBJECT_B = '00000000-0000-0000-0000-0000000000a2';
const SUBJECT_C = '00000000-0000-0000-0000-0000000000a3';
const SUBJECT_D = '00000000-0000-0000-0000-0000000000a4';

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    studentAcademicRiskAlert: { findMany: jest.fn().mockResolvedValue([]) },
    periodGradeSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    grade: { findMany: jest.fn().mockResolvedValue([]) },
    progressReportEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

// ─── Snapshot Helper ──────────────────────────────────────────────────────────

function makeSnapshot(
  id: string,
  subjectId: string,
  periodId: string,
  computedValue: number,
  startDate: Date,
) {
  return {
    id,
    subject_id: subjectId,
    academic_period_id: periodId,
    computed_value: computedValue,
    academic_period: { start_date: startDate },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GradesSignalCollector', () => {
  let collector: GradesSignalCollector;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        GradesSignalCollector,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: GradebookReadFacade,
          useValue: {
            findRiskAlertsForStudent: mockPrisma.studentAcademicRiskAlert.findMany,
            findPeriodSnapshotsForStudent: mockPrisma.periodGradeSnapshot.findMany,
            findGradesForStudent: mockPrisma.grade.findMany,
            findProgressReportsForStudent: mockPrisma.progressReportEntry.findMany,
          },
        },
      ],
    }).compile();

    collector = module.get(GradesSignalCollector);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Test 1 ─────────────────────────────────────────────────────────────────

  it('should return score 0 with empty signals when no data exists', async () => {
    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.domain).toBe('grades');
    expect(result.rawScore).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.summaryFragments).toEqual([]);
  });

  // ─── Test 2 ─────────────────────────────────────────────────────────────────

  it('should detect below_class_mean from at_risk_medium alert with score 20', async () => {
    mockPrisma.studentAcademicRiskAlert.findMany.mockResolvedValue([
      {
        id: ALERT_ID_1,
        alert_type: 'at_risk_medium',
        trigger_reason: 'Student below class mean in Mathematics',
        subject_id: SUBJECT_A,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.rawScore).toBe(20);
    expect(result.signals).toHaveLength(1);
    const signal = result.signals[0];
    expect(signal).toBeDefined();
    expect(signal?.signalType).toBe('below_class_mean');
    expect(signal?.scoreContribution).toBe(20);
    expect(signal?.severity).toBe('medium');
    expect(signal?.sourceEntityType).toBe('StudentAcademicRiskAlert');
    expect(signal?.sourceEntityId).toBe(ALERT_ID_1);
    expect(signal?.summaryFragment).toBe(
      'Academic risk alert: Student below class mean in Mathematics',
    );
  });

  // ─── Test 3 ─────────────────────────────────────────────────────────────────

  it('should detect grade_trajectory_decline across 2 subjects with score 15', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      // Subject A: declining from 80 -> 65
      makeSnapshot(`${SNAPSHOT_ID_1}-a1`, SUBJECT_A, PERIOD_1_ID, 80, new Date('2025-09-01')),
      makeSnapshot(`${SNAPSHOT_ID_2}-a1`, SUBJECT_A, PERIOD_2_ID, 65, new Date('2026-01-01')),
      // Subject B: declining from 75 -> 60
      makeSnapshot(`${SNAPSHOT_ID_1}-b1`, SUBJECT_B, PERIOD_1_ID, 75, new Date('2025-09-01')),
      makeSnapshot(`${SNAPSHOT_ID_2}-b1`, SUBJECT_B, PERIOD_2_ID, 60, new Date('2026-01-01')),
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const trajectorySignal = result.signals.find((s) => s.signalType === 'grade_trajectory_decline');
    expect(trajectorySignal).toBeDefined();
    expect(trajectorySignal!.scoreContribution).toBe(15);
    expect(trajectorySignal!.severity).toBe('medium');
    expect(trajectorySignal!.summaryFragment).toBe('Grade declined in 2 subject(s) between periods');
    expect(trajectorySignal!.sourceEntityType).toBe('PeriodGradeSnapshot');
  });

  // ─── Test 4 ─────────────────────────────────────────────────────────────────

  it('should detect missing_assessments with score 10 for 3 missing grades', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_1, is_missing: true },
      { id: `${GRADE_ID_1}-2`, is_missing: true },
      { id: `${GRADE_ID_1}-3`, is_missing: true },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const missingSignal = result.signals.find((s) => s.signalType === 'missing_assessments');
    expect(missingSignal).toBeDefined();
    expect(missingSignal!.scoreContribution).toBe(10);
    expect(missingSignal!.severity).toBe('low');
    expect(missingSignal!.summaryFragment).toBe('3 missing assessment(s) in current period');
    expect(missingSignal!.sourceEntityType).toBe('Grade');
    expect(missingSignal!.sourceEntityId).toBe(GRADE_ID_1);
  });

  // ─── Test 5 ─────────────────────────────────────────────────────────────────

  it('should detect score_anomaly from 1 alert with score 15', async () => {
    mockPrisma.studentAcademicRiskAlert.findMany.mockResolvedValue([
      {
        id: ALERT_ID_1,
        alert_type: 'score_anomaly',
        trigger_reason: 'Sudden score drop in English',
        subject_id: SUBJECT_A,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const anomalySignal = result.signals.find((s) => s.signalType === 'score_anomaly');
    expect(anomalySignal).toBeDefined();
    expect(anomalySignal!.scoreContribution).toBe(15);
    expect(anomalySignal!.severity).toBe('medium');
    expect(anomalySignal!.summaryFragment).toBe('Score anomaly detected: Sudden score drop in English');
    expect(anomalySignal!.sourceEntityType).toBe('StudentAcademicRiskAlert');
  });

  // ─── Test 6 ─────────────────────────────────────────────────────────────────

  it('should detect multi_subject_decline when 4 subjects declining', async () => {
    // 4 subjects declining via snapshots
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      makeSnapshot('snap-a1', SUBJECT_A, PERIOD_1_ID, 80, new Date('2025-09-01')),
      makeSnapshot('snap-a2', SUBJECT_A, PERIOD_2_ID, 65, new Date('2026-01-01')),
      makeSnapshot('snap-b1', SUBJECT_B, PERIOD_1_ID, 75, new Date('2025-09-01')),
      makeSnapshot('snap-b2', SUBJECT_B, PERIOD_2_ID, 60, new Date('2026-01-01')),
      makeSnapshot('snap-c1', SUBJECT_C, PERIOD_1_ID, 90, new Date('2025-09-01')),
      makeSnapshot('snap-c2', SUBJECT_C, PERIOD_2_ID, 70, new Date('2026-01-01')),
      makeSnapshot('snap-d1', SUBJECT_D, PERIOD_1_ID, 85, new Date('2025-09-01')),
      makeSnapshot('snap-d2', SUBJECT_D, PERIOD_2_ID, 68, new Date('2026-01-01')),
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    // grade_trajectory_decline: 4 subjects => 3+ => score 25
    const trajectorySignal = result.signals.find((s) => s.signalType === 'grade_trajectory_decline');
    expect(trajectorySignal).toBeDefined();
    expect(trajectorySignal!.scoreContribution).toBe(25);

    // multi_subject_decline: 4 subjects => score 20
    const multiSignal = result.signals.find((s) => s.signalType === 'multi_subject_decline');
    expect(multiSignal).toBeDefined();
    expect(multiSignal!.scoreContribution).toBe(20);
    expect(multiSignal!.severity).toBe('medium');
    expect(multiSignal!.summaryFragment).toBe('Declining grades across 4 subjects simultaneously');

    // Total = 25 + 20 = 45
    expect(result.rawScore).toBe(45);
  });

  // ─── Test 7 ─────────────────────────────────────────────────────────────────

  it('should cap rawScore at 100 when multiple signals exceed it', async () => {
    // at_risk_high alert => below_class_mean +30
    mockPrisma.studentAcademicRiskAlert.findMany.mockResolvedValue([
      {
        id: ALERT_ID_1,
        alert_type: 'at_risk_high',
        trigger_reason: 'Far below class mean',
        subject_id: SUBJECT_A,
      },
      {
        id: `${ALERT_ID_1}-anomaly-1`,
        alert_type: 'score_anomaly',
        trigger_reason: 'Score anomaly 1',
        subject_id: SUBJECT_B,
      },
      {
        id: `${ALERT_ID_1}-anomaly-2`,
        alert_type: 'score_anomaly',
        trigger_reason: 'Score anomaly 2',
        subject_id: SUBJECT_C,
      },
    ]);

    // 6 missing grades => +20
    mockPrisma.grade.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ id: `grade-${i}`, is_missing: true })),
    );

    // 5 subjects declining => grade_trajectory +25, multi_subject +30
    const subjects = [SUBJECT_A, SUBJECT_B, SUBJECT_C, SUBJECT_D, '00000000-0000-0000-0000-0000000000a5'];
    const snapshotData = subjects.flatMap((subjectId, i) => [
      makeSnapshot(`snap-${i}-1`, subjectId, PERIOD_1_ID, 80, new Date('2025-09-01')),
      makeSnapshot(`snap-${i}-2`, subjectId, PERIOD_2_ID, 50, new Date('2026-01-01')),
    ]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue(snapshotData);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    // below_class_mean(30) + score_anomaly(25) + missing(20) + trajectory(25) + multi_subject(30) = 130
    expect(result.rawScore).toBe(100);
  });

  // ─── Test 8 ─────────────────────────────────────────────────────────────────

  it('should generate summaryFragments for each detected signal', async () => {
    // Trigger below_class_mean + missing_assessments
    mockPrisma.studentAcademicRiskAlert.findMany.mockResolvedValue([
      {
        id: ALERT_ID_1,
        alert_type: 'at_risk_low',
        trigger_reason: 'Slightly below class mean',
        subject_id: SUBJECT_A,
      },
    ]);

    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_1, is_missing: true },
      { id: `${GRADE_ID_1}-2`, is_missing: true },
      { id: `${GRADE_ID_1}-3`, is_missing: true },
      { id: `${GRADE_ID_1}-4`, is_missing: true },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.signals.length).toBeGreaterThanOrEqual(2);
    expect(result.summaryFragments).toHaveLength(result.signals.length);

    // Every signal must have a non-empty summaryFragment
    for (const signal of result.signals) {
      expect(signal.summaryFragment).toBeTruthy();
      expect(typeof signal.summaryFragment).toBe('string');
      expect(signal.summaryFragment.length).toBeGreaterThan(0);
    }

    // summaryFragments on the result must match signal summaryFragments
    expect(result.summaryFragments).toEqual(result.signals.map((s) => s.summaryFragment));

    // Verify specific fragments are present
    expect(result.summaryFragments).toContain('Academic risk alert: Slightly below class mean');
    expect(result.summaryFragments).toContain('4 missing assessment(s) in current period');
  });
});
