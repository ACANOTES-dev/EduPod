import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  AcademicReadFacade,
} from '../../../common/tests/mock-facades';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AiProgressSummaryService } from '../ai/ai-progress-summary.service';

import { GradePublishingService } from './grade-publishing.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const CLASS_ID = 'class-1';
const PERIOD_ID = 'period-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  assessment: { update: jest.fn() },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    assessment: {
      findMany: jest.fn(),
    },
    classEnrolment: {
      groupBy: jest.fn(),
    },
    class: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
  };
}

function buildMockNotificationsService() {
  return {
    createBatch: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockAiProgressSummaryService() {
  return {
    invalidateCache: jest.fn().mockResolvedValue(undefined),
  };
}

const baseAssessment = {
  id: 'assessment-1',
  title: 'Math Quiz',
  subject: { name: 'Math' },
  grades: [
    {
      student_id: 'student-1',
      student: {
        id: 'student-1',
        first_name: 'Ali',
        last_name: 'Hassan',
        student_parents: [{ parent: { user_id: 'parent-user-1' } }],
      },
    },
  ],
};

// ─── getReadinessDashboard Tests ──────────────────────────────────────────────

const mockClassesFacade = { findEnrolmentCountsByClasses: jest.fn(), existsOrThrow: jest.fn() };
const mockAcademicFacade = { findPeriodById: jest.fn() };

describe('GradePublishingService — getReadinessDashboard', () => {
  let service: GradePublishingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(new Map());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        GradePublishingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: buildMockNotificationsService() },
        { provide: AiProgressSummaryService, useValue: buildMockAiProgressSummaryService() },
      ],
    }).compile();

    service = module.get<GradePublishingService>(GradePublishingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty data when no assessments exist', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(new Map());

    const result = await service.getReadinessDashboard(TENANT_ID, {});

    expect(result.data).toHaveLength(0);
  });

  it('should compute completion_percent correctly', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        class_id: CLASS_ID,
        subject_id: 'subject-1',
        academic_period_id: PERIOD_ID,
        grades_published_at: null,
        class_entity: { id: CLASS_ID, name: 'Grade 5A' },
        subject: { id: 'subject-1', name: 'Math' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        grades: [
          { student_id: 's1', raw_score: 80, is_missing: false },
          { student_id: 's2', raw_score: null, is_missing: false },
        ],
      },
    ]);
    mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(new Map([[CLASS_ID, 2]]));

    const result = await service.getReadinessDashboard(TENANT_ID, {});

    expect(result.data[0]?.completion_percent).toBe(50);
    expect(result.data[0]?.status).toBe('incomplete');
    expect(result.data[0]?.graded_count).toBe(1);
    expect(result.data[0]?.enrolled_count).toBe(2);
  });

  it('should set status to published when grades_published_at is set', async () => {
    const publishedAt = new Date('2026-01-15');
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        class_id: CLASS_ID,
        subject_id: 'subject-1',
        academic_period_id: PERIOD_ID,
        grades_published_at: publishedAt,
        class_entity: { id: CLASS_ID, name: 'Grade 5A' },
        subject: { id: 'subject-1', name: 'Math' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(new Map([[CLASS_ID, 1]]));

    const result = await service.getReadinessDashboard(TENANT_ID, {});

    expect(result.data[0]?.status).toBe('published');
    expect(result.data[0]?.published_at).not.toBeNull();
  });

  it('should set status to ready when all students are graded', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        title: 'Quiz 1',
        class_id: CLASS_ID,
        subject_id: 'subject-1',
        academic_period_id: PERIOD_ID,
        grades_published_at: null,
        class_entity: { id: CLASS_ID, name: 'Grade 5A' },
        subject: { id: 'subject-1', name: 'Math' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        grades: [{ student_id: 's1', raw_score: 90, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(new Map([[CLASS_ID, 1]]));

    const result = await service.getReadinessDashboard(TENANT_ID, {});

    expect(result.data[0]?.status).toBe('ready');
  });
});

// ─── publishGrades Tests ──────────────────────────────────────────────────────

describe('GradePublishingService — publishGrades', () => {
  let service: GradePublishingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockNotifications: ReturnType<typeof buildMockNotificationsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockNotifications = buildMockNotificationsService();

    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        GradePublishingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AiProgressSummaryService, useValue: buildMockAiProgressSummaryService() },
      ],
    }).compile();

    service = module.get<GradePublishingService>(GradePublishingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return published:0 when no unpublished assessments are found', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    const result = await service.publishGrades(TENANT_ID, USER_ID, ['a1']);

    expect(result.published).toBe(0);
    expect(result.assessment_ids).toHaveLength(0);
  });

  it('should publish assessments and return correct count', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([baseAssessment]);

    const result = await service.publishGrades(TENANT_ID, USER_ID, ['assessment-1']);

    expect(result.published).toBe(1);
    expect(result.assessment_ids).toContain('assessment-1');
  });

  it('should send parent notifications when parents are linked', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([baseAssessment]);

    await service.publishGrades(TENANT_ID, USER_ID, ['assessment-1']);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([expect.objectContaining({ recipient_user_id: 'parent-user-1' })]),
    );
  });

  it('should not send notifications when no parents have user accounts', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        ...baseAssessment,
        grades: [
          {
            student_id: 'student-1',
            student: {
              id: 'student-1',
              first_name: 'Ali',
              last_name: 'Hassan',
              student_parents: [{ parent: { user_id: null } }],
            },
          },
        ],
      },
    ]);

    await service.publishGrades(TENANT_ID, USER_ID, ['assessment-1']);

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });
});

// ─── publishPeriodGrades Tests ────────────────────────────────────────────────

describe('GradePublishingService — publishPeriodGrades', () => {
  let service: GradePublishingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockClassesFacade.existsOrThrow.mockResolvedValue(true);
    mockAcademicFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });

    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        GradePublishingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: buildMockNotificationsService() },
        { provide: AiProgressSummaryService, useValue: buildMockAiProgressSummaryService() },
      ],
    }).compile();

    service = module.get<GradePublishingService>(GradePublishingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when class does not exist', async () => {
    mockClassesFacade.existsOrThrow.mockRejectedValue(new NotFoundException('class not found'));

    await expect(
      service.publishPeriodGrades(TENANT_ID, USER_ID, CLASS_ID, PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when period does not exist', async () => {
    mockAcademicFacade.findPeriodById.mockResolvedValue(null);

    await expect(
      service.publishPeriodGrades(TENANT_ID, USER_ID, CLASS_ID, PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return published:0 when all assessments are already published', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    const result = await service.publishPeriodGrades(TENANT_ID, USER_ID, CLASS_ID, PERIOD_ID);

    expect(result.published).toBe(0);
  });

  it('should publish unpublished assessments and return their IDs', async () => {
    // First call: findMany for unpublished assessments (in publishPeriodGrades)
    // Second call: findMany for assessment details (in publishGrades)
    mockPrisma.assessment.findMany
      .mockResolvedValueOnce([{ id: 'assessment-1' }, { id: 'assessment-2' }])
      .mockResolvedValueOnce([
        {
          id: 'assessment-1',
          title: 'Quiz 1',
          subject: { name: 'Math' },
          grades: [
            {
              student_id: 'student-1',
              student: {
                id: 'student-1',
                first_name: 'Ali',
                last_name: 'Hassan',
                student_parents: [],
              },
            },
          ],
        },
        {
          id: 'assessment-2',
          title: 'Quiz 2',
          subject: { name: 'Math' },
          grades: [
            {
              student_id: 'student-1',
              student: {
                id: 'student-1',
                first_name: 'Ali',
                last_name: 'Hassan',
                student_parents: [],
              },
            },
          ],
        },
      ]);
    mockRlsTx.assessment.update.mockResolvedValue({});

    const result = await service.publishPeriodGrades(TENANT_ID, USER_ID, CLASS_ID, PERIOD_ID);

    expect(result.published).toBe(2);
    expect(result.assessment_ids).toEqual(['assessment-1', 'assessment-2']);
  });
});
