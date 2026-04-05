import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { GradebookReadFacade } from './gradebook-read.facade';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const DAY_WINDOW = 30;

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    grade: { findMany: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
    studentAcademicRiskAlert: { findMany: jest.fn() },
    reportCard: { findMany: jest.fn() },
    studentCompetencySnapshot: { findMany: jest.fn() },
    progressReport: { findMany: jest.fn() },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GradebookReadFacade', () => {
  let facade: GradebookReadFacade;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradebookReadFacade, { provide: PrismaService, useValue: prisma }],
    }).compile();

    facade = module.get<GradebookReadFacade>(GradebookReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findGradesForStudent ─────────────────────────────────────────────────

  describe('GradebookReadFacade — findGradesForStudent', () => {
    it('should query grades with tenant_id and student_id in where clause', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      await facade.findGradesForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return the array returned by prisma', async () => {
      const row = { id: 'g1', tenant_id: TENANT_ID, student_id: STUDENT_ID };
      prisma.grade.findMany.mockResolvedValue([row]);

      const result = await facade.findGradesForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findRecentGrades ─────────────────────────────────────────────────────

  describe('GradebookReadFacade — findRecentGrades', () => {
    it('should include tenant_id and student_id in where clause', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      await facade.findRecentGrades(TENANT_ID, STUDENT_ID, DAY_WINDOW);

      expect(prisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should apply a created_at gte filter based on dayWindow', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      const before = new Date();
      before.setDate(before.getDate() - DAY_WINDOW);
      before.setSeconds(before.getSeconds() - 1); // tolerance

      await facade.findRecentGrades(TENANT_ID, STUDENT_ID, DAY_WINDOW);

      const call = prisma.grade.findMany.mock.calls[0] as Array<{
        where: { created_at?: { gte?: Date } };
      }>;
      const where = call[0]?.where as { created_at?: { gte?: Date } };
      const gteDate = where?.created_at?.gte;

      expect(gteDate).toBeInstanceOf(Date);
      expect(gteDate!.getTime()).toBeGreaterThan(before.getTime());
    });

    it('should return empty array when no recent grades exist', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      const result = await facade.findRecentGrades(TENANT_ID, STUDENT_ID, DAY_WINDOW);

      expect(result).toEqual([]);
    });
  });

  // ─── findPeriodSnapshotsForStudent ────────────────────────────────────────

  describe('GradebookReadFacade — findPeriodSnapshotsForStudent', () => {
    it('should query period snapshots with tenant_id and student_id', async () => {
      prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      await facade.findPeriodSnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.periodGradeSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return snapshots from prisma', async () => {
      const row = { id: 'ps1', tenant_id: TENANT_ID, student_id: STUDENT_ID };
      prisma.periodGradeSnapshot.findMany.mockResolvedValue([row]);

      const result = await facade.findPeriodSnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findGpaSnapshotsForStudent ───────────────────────────────────────────

  describe('GradebookReadFacade — findGpaSnapshotsForStudent', () => {
    it('should query gpa snapshots with tenant_id and student_id', async () => {
      prisma.gpaSnapshot.findMany.mockResolvedValue([]);

      await facade.findGpaSnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.gpaSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return gpa snapshots from prisma', async () => {
      const row = { id: 'gpa1', tenant_id: TENANT_ID, student_id: STUDENT_ID };
      prisma.gpaSnapshot.findMany.mockResolvedValue([row]);

      const result = await facade.findGpaSnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findRiskAlertsForStudent ─────────────────────────────────────────────

  describe('GradebookReadFacade — findRiskAlertsForStudent', () => {
    it('should filter by tenant_id and student_id', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findRiskAlertsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.studentAcademicRiskAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should filter status to active and acknowledged only', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findRiskAlertsForStudent(TENANT_ID, STUDENT_ID);

      const call = prisma.studentAcademicRiskAlert.findMany.mock.calls[0] as Array<{
        where: { status?: { in?: string[] } };
      }>;
      const where = call[0]?.where as { status?: { in?: string[] } };

      expect(where?.status).toEqual({ in: ['active', 'acknowledged'] });
    });

    it('should return alerts from prisma', async () => {
      const row = { id: 'ra1', tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'active' };
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([row]);

      const result = await facade.findRiskAlertsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findReportCardsForStudent ────────────────────────────────────────────

  describe('GradebookReadFacade — findReportCardsForStudent', () => {
    it('should query report cards with tenant_id and student_id', async () => {
      prisma.reportCard.findMany.mockResolvedValue([]);

      await facade.findReportCardsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.reportCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return report cards from prisma', async () => {
      const row = { id: 'rc1', tenant_id: TENANT_ID, student_id: STUDENT_ID };
      prisma.reportCard.findMany.mockResolvedValue([row]);

      const result = await facade.findReportCardsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findCompetencySnapshotsForStudent ────────────────────────────────────

  describe('GradebookReadFacade — findCompetencySnapshotsForStudent', () => {
    it('should query competency snapshots with tenant_id and student_id', async () => {
      prisma.studentCompetencySnapshot.findMany.mockResolvedValue([]);

      await facade.findCompetencySnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.studentCompetencySnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return competency snapshots from prisma', async () => {
      const row = { id: 'cs1', tenant_id: TENANT_ID, student_id: STUDENT_ID };
      prisma.studentCompetencySnapshot.findMany.mockResolvedValue([row]);

      const result = await facade.findCompetencySnapshotsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findProgressReportsForStudent ───────────────────────────────────────

  describe('GradebookReadFacade — findProgressReportsForStudent', () => {
    it('should query progress reports with tenant_id and student_id', async () => {
      prisma.progressReport.findMany.mockResolvedValue([]);

      await facade.findProgressReportsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.progressReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should include entries in the select', async () => {
      prisma.progressReport.findMany.mockResolvedValue([]);

      await facade.findProgressReportsForStudent(TENANT_ID, STUDENT_ID);

      const call = prisma.progressReport.findMany.mock.calls[0] as Array<{
        select?: { entries?: unknown };
      }>;
      const select = call[0]?.select as { entries?: unknown } | undefined;

      expect(select?.entries).toBeDefined();
    });

    it('should return progress reports from prisma', async () => {
      const row = {
        id: 'pr1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        entries: [],
      };
      prisma.progressReport.findMany.mockResolvedValue([row]);

      const result = await facade.findProgressReportsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([row]);
    });
  });

  // ─── findAllRiskAlertsForStudent ───────────────────────────────────────────

  describe('GradebookReadFacade — findAllRiskAlertsForStudent', () => {
    it('should query risk alerts without status filter', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findAllRiskAlertsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.studentAcademicRiskAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });

    it('should return all alerts including resolved ones', async () => {
      const rows = [
        { id: 'r1', status: 'active' },
        { id: 'r2', status: 'resolved' },
      ];
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue(rows);

      const result = await facade.findAllRiskAlertsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(rows);
    });
  });

  // ─── countAssessmentsByPeriodAndStatus ──────────────────────────────────────

  describe('GradebookReadFacade — countAssessmentsByPeriodAndStatus', () => {
    it('should count assessments by period and status list', async () => {
      (prisma as Record<string, unknown>)['assessment'] = { count: jest.fn().mockResolvedValue(5) };

      const result = await facade.countAssessmentsByPeriodAndStatus(TENANT_ID, 'period-1', [
        'draft',
        'open',
      ]);

      expect(result).toBe(5);
    });
  });

  // ─── findClassSubjectConfigs ───────────────────────────────────────────────

  describe('GradebookReadFacade — findClassSubjectConfigs', () => {
    it('should return empty array when classIds is empty', async () => {
      const result = await facade.findClassSubjectConfigs(TENANT_ID, []);

      expect(result).toEqual([]);
    });

    it('should return configs mapped with class_name', async () => {
      (prisma as Record<string, unknown>)['classSubjectGradeConfig'] = {
        findMany: jest.fn().mockResolvedValue([
          {
            class_id: 'c1',
            subject_id: 's1',
            subject: { id: 's1', name: 'Math' },
            class_entity: { id: 'c1', name: 'Grade 5A' },
          },
        ]),
      };

      const result = await facade.findClassSubjectConfigs(TENANT_ID, ['c1']);

      expect(result).toEqual([
        {
          class_id: 'c1',
          subject_id: 's1',
          subject: { id: 's1', name: 'Math' },
          class_name: 'Grade 5A',
        },
      ]);
    });
  });

  // ─── countNlQueryHistoryBeforeDate ──────────────────────────────────────────

  describe('GradebookReadFacade — countNlQueryHistoryBeforeDate', () => {
    it('should count NL query history before cutoff date', async () => {
      (prisma as Record<string, unknown>)['nlQueryHistory'] = {
        count: jest.fn().mockResolvedValue(42),
      };

      const cutoff = new Date('2026-01-01');
      const result = await facade.countNlQueryHistoryBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
    });
  });

  // ─── findGradesGeneric ─────────────────────────────────────────────────────

  describe('GradebookReadFacade — findGradesGeneric', () => {
    it('should pass where, select, and orderBy when all provided', async () => {
      prisma.grade.findMany.mockResolvedValue([{ id: 'g1' }]);

      const result = await facade.findGradesGeneric(TENANT_ID, {
        where: { assessment_id: 'a1' },
        select: { id: true, raw_score: true },
        orderBy: { created_at: 'desc' },
      });

      expect(prisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, assessment_id: 'a1' },
          select: { id: true, raw_score: true },
          orderBy: { created_at: 'desc' },
        }),
      );
      expect(result).toEqual([{ id: 'g1' }]);
    });

    it('should omit select and orderBy when not provided', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      await facade.findGradesGeneric(TENANT_ID, {});

      const call = prisma.grade.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
      expect(call).not.toHaveProperty('orderBy');
    });

    it('should include select but omit orderBy when only select provided', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      await facade.findGradesGeneric(TENANT_ID, {
        select: { id: true },
      });

      const call = prisma.grade.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).toHaveProperty('select');
      expect(call).not.toHaveProperty('orderBy');
    });

    it('should include orderBy but omit select when only orderBy provided', async () => {
      prisma.grade.findMany.mockResolvedValue([]);

      await facade.findGradesGeneric(TENANT_ID, {
        orderBy: { created_at: 'asc' },
      });

      const call = prisma.grade.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
      expect(call).toHaveProperty('orderBy');
    });
  });

  // ─── groupGradesBy ──────────────────────────────────────────────────────────

  describe('GradebookReadFacade — groupGradesBy', () => {
    it('should group grades by specified fields', async () => {
      (prisma.grade as Record<string, unknown>)['groupBy'] = jest
        .fn()
        .mockResolvedValue([{ assessment_id: 'a1', _count: 5 }]);

      const result = await facade.groupGradesBy(TENANT_ID, ['assessment_id' as never]);

      expect(result).toEqual([{ assessment_id: 'a1', _count: 5 }]);
    });

    it('should pass _avg option when provided', async () => {
      const mockGroupBy = jest.fn().mockResolvedValue([]);
      (prisma.grade as Record<string, unknown>)['groupBy'] = mockGroupBy;

      await facade.groupGradesBy(
        TENANT_ID,
        ['assessment_id' as never],
        { assessment_id: 'a1' },
        { _avg: { raw_score: true } },
      );

      expect(mockGroupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          _avg: { raw_score: true },
        }),
      );
    });

    it('should not include _avg when options not provided', async () => {
      const mockGroupBy = jest.fn().mockResolvedValue([]);
      (prisma.grade as Record<string, unknown>)['groupBy'] = mockGroupBy;

      await facade.groupGradesBy(TENANT_ID, ['assessment_id' as never]);

      const call = mockGroupBy.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('_avg');
    });
  });

  // ─── aggregateGrades ───────────────────────────────────────────────────────

  describe('GradebookReadFacade — aggregateGrades', () => {
    it('should return numeric avg when raw_score is not null', async () => {
      (prisma.grade as Record<string, unknown>)['aggregate'] = jest.fn().mockResolvedValue({
        _avg: { raw_score: 85.5 },
      });

      const result = await facade.aggregateGrades(TENANT_ID, { assessment_id: 'a1' });

      expect(result._avg.raw_score).toBe(85.5);
    });

    it('should return null avg when raw_score is null', async () => {
      (prisma.grade as Record<string, unknown>)['aggregate'] = jest.fn().mockResolvedValue({
        _avg: { raw_score: null },
      });

      const result = await facade.aggregateGrades(TENANT_ID);

      expect(result._avg.raw_score).toBeNull();
    });
  });

  // ─── findAssessmentsGeneric ────────────────────────────────────────────────

  describe('GradebookReadFacade — findAssessmentsGeneric', () => {
    it('should pass select when provided', async () => {
      (prisma as Record<string, unknown>)['assessment'] = {
        findMany: jest.fn().mockResolvedValue([]),
      };

      await facade.findAssessmentsGeneric(TENANT_ID, {
        where: { status: 'open' },
        select: { id: true, title: true },
      });

      const mockFindMany = (
        (prisma as Record<string, unknown>)['assessment'] as { findMany: jest.Mock }
      ).findMany;
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, title: true },
        }),
      );
    });

    it('should omit select when not provided', async () => {
      const mockFn = jest.fn().mockResolvedValue([]);
      (prisma as Record<string, unknown>)['assessment'] = { findMany: mockFn };

      await facade.findAssessmentsGeneric(TENANT_ID, {});

      const call = mockFn.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
    });
  });

  // ─── countAssessments ──────────────────────────────────────────────────────

  describe('GradebookReadFacade — countAssessments', () => {
    it('should count assessments with where filter', async () => {
      (prisma as Record<string, unknown>)['assessment'] = {
        count: jest.fn().mockResolvedValue(12),
      };

      const result = await facade.countAssessments(TENANT_ID, { status: 'open' });

      expect(result).toBe(12);
    });

    it('should count assessments without where filter', async () => {
      (prisma as Record<string, unknown>)['assessment'] = {
        count: jest.fn().mockResolvedValue(20),
      };

      const result = await facade.countAssessments(TENANT_ID);

      expect(result).toBe(20);
    });
  });

  // ─── findPeriodSnapshotsGeneric ────────────────────────────────────────────

  describe('GradebookReadFacade — findPeriodSnapshotsGeneric', () => {
    it('should pass select and orderBy when provided', async () => {
      prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      await facade.findPeriodSnapshotsGeneric(TENANT_ID, {
        where: { student_id: STUDENT_ID },
        select: { id: true, computed_value: true },
        orderBy: { snapshot_at: 'desc' },
      });

      expect(prisma.periodGradeSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, computed_value: true },
          orderBy: { snapshot_at: 'desc' },
        }),
      );
    });

    it('should omit select and orderBy when not provided', async () => {
      prisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

      await facade.findPeriodSnapshotsGeneric(TENANT_ID, {});

      const call = prisma.periodGradeSnapshot.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
      expect(call).not.toHaveProperty('orderBy');
    });
  });

  // ─── findGpaSnapshotsGeneric ───────────────────────────────────────────────

  describe('GradebookReadFacade — findGpaSnapshotsGeneric', () => {
    it('should pass select when provided', async () => {
      prisma.gpaSnapshot.findMany.mockResolvedValue([]);

      await facade.findGpaSnapshotsGeneric(
        TENANT_ID,
        { student_id: STUDENT_ID },
        { id: true, gpa_value: true },
      );

      expect(prisma.gpaSnapshot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, gpa_value: true },
        }),
      );
    });

    it('should omit select when not provided', async () => {
      prisma.gpaSnapshot.findMany.mockResolvedValue([]);

      await facade.findGpaSnapshotsGeneric(TENANT_ID);

      const call = prisma.gpaSnapshot.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
    });
  });

  // ─── countRiskAlerts ───────────────────────────────────────────────────────

  describe('GradebookReadFacade — countRiskAlerts', () => {
    it('should count risk alerts with where filter', async () => {
      (prisma.studentAcademicRiskAlert as Record<string, unknown>)['count'] = jest
        .fn()
        .mockResolvedValue(7);

      const result = await facade.countRiskAlerts(TENANT_ID, { status: 'active' });

      expect(result).toBe(7);
    });

    it('should count risk alerts without where filter', async () => {
      (prisma.studentAcademicRiskAlert as Record<string, unknown>)['count'] = jest
        .fn()
        .mockResolvedValue(15);

      const result = await facade.countRiskAlerts(TENANT_ID);

      expect(result).toBe(15);
    });
  });

  // ─── findRiskAlertsGeneric ─────────────────────────────────────────────────

  describe('GradebookReadFacade — findRiskAlertsGeneric', () => {
    it('should pass select, orderBy, and take when provided', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findRiskAlertsGeneric(TENANT_ID, {
        where: { status: 'active' },
        select: { id: true },
        orderBy: { detected_date: 'desc' },
        take: 10,
      });

      expect(prisma.studentAcademicRiskAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true },
          orderBy: { detected_date: 'desc' },
          take: 10,
        }),
      );
    });

    it('should omit select, orderBy, and take when not provided', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findRiskAlertsGeneric(TENANT_ID, {});

      const call = prisma.studentAcademicRiskAlert.findMany.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      expect(call).not.toHaveProperty('select');
      expect(call).not.toHaveProperty('orderBy');
      expect(call).not.toHaveProperty('take');
    });

    it('should include take=0 when take is explicitly 0', async () => {
      prisma.studentAcademicRiskAlert.findMany.mockResolvedValue([]);

      await facade.findRiskAlertsGeneric(TENANT_ID, { take: 0 });

      const call = prisma.studentAcademicRiskAlert.findMany.mock.calls[0]![0] as Record<
        string,
        unknown
      >;
      expect(call).toHaveProperty('take', 0);
    });
  });

  // ─── findReportCardsGeneric ────────────────────────────────────────────────

  describe('GradebookReadFacade — findReportCardsGeneric', () => {
    it('should pass select and orderBy when provided', async () => {
      prisma.reportCard.findMany.mockResolvedValue([]);

      await facade.findReportCardsGeneric(
        TENANT_ID,
        { status: 'published' },
        { id: true, student_id: true },
        { created_at: 'desc' },
      );

      expect(prisma.reportCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, student_id: true },
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should omit select and orderBy when not provided', async () => {
      prisma.reportCard.findMany.mockResolvedValue([]);

      await facade.findReportCardsGeneric(TENANT_ID);

      const call = prisma.reportCard.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call).not.toHaveProperty('select');
      expect(call).not.toHaveProperty('orderBy');
    });

    it('should pass where filter merged with tenant_id', async () => {
      prisma.reportCard.findMany.mockResolvedValue([]);

      await facade.findReportCardsGeneric(TENANT_ID, { student_id: STUDENT_ID });

      expect(prisma.reportCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });
});
