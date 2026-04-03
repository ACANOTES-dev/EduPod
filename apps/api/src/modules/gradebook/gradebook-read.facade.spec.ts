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
});
