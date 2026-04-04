import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  AcademicReadFacade,
} from '../../../common/tests/mock-facades';
import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

import { ProgressReportService } from './progress-report.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const CLASS_ID = 'class-1';
const PERIOD_ID = 'period-1';
const STUDENT_ID = 'student-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  progressReport: {
    create: jest.fn(),
    update: jest.fn(),
  },
  progressReportEntry: {
    create: jest.fn(),
    update: jest.fn(),
  },
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
    class: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    subject: { findMany: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    progressReport: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    progressReportEntry: { findFirst: jest.fn() },
  };
}

function buildMockNotificationsService() {
  return {
    createBatch: jest.fn().mockResolvedValue(undefined),
  };
}

const basePeriod = { id: PERIOD_ID, name: 'Term 1' };
const baseEnrolment = { student_id: STUDENT_ID };
const baseSubject = { id: 'subject-1', name: 'Math' };

const baseReportFromTx = {
  id: 'pr-1',
  student_id: STUDENT_ID,
};

const baseEntryFromTx = {
  id: 'entry-1',
  subject_id: 'subject-1',
  current_average: 75,
  trend: 'stable',
};

// ─── generate Tests ───────────────────────────────────────────────────────────

const mockClassesFacade = { existsOrThrow: jest.fn(), findEnrolmentsGeneric: jest.fn() };
const mockAcademicFacade = { findPeriodById: jest.fn(), findSubjectsByIds: jest.fn() };

describe('ProgressReportService — generate', () => {
  let service: ProgressReportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockNotifications: ReturnType<typeof buildMockNotificationsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockNotifications = buildMockNotificationsService();

    mockRlsTx.progressReport.create.mockReset().mockResolvedValue(baseReportFromTx);
    mockRlsTx.progressReportEntry.create.mockReset().mockResolvedValue(baseEntryFromTx);

    mockClassesFacade.existsOrThrow.mockResolvedValue(true);
    mockAcademicFacade.findPeriodById.mockResolvedValue(basePeriod);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([baseEnrolment]);
    mockPrisma.assessment.findMany.mockResolvedValue([]);
    mockAcademicFacade.findSubjectsByIds.mockResolvedValue([baseSubject]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        ProgressReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ProgressReportService>(ProgressReportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when class does not exist', async () => {
    mockClassesFacade.existsOrThrow.mockRejectedValue(new NotFoundException('class not found'));

    await expect(
      service.generate(TENANT_ID, USER_ID, { class_id: CLASS_ID, academic_period_id: PERIOD_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when period does not exist', async () => {
    mockAcademicFacade.findPeriodById.mockResolvedValue(null);

    await expect(
      service.generate(TENANT_ID, USER_ID, { class_id: CLASS_ID, academic_period_id: PERIOD_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return generated:0 when no students are enrolled', async () => {
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

    const result = await service.generate(TENANT_ID, USER_ID, {
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
    });

    expect(result.generated).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it('should generate one progress report per enrolled student', async () => {
    const result = await service.generate(TENANT_ID, USER_ID, {
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
    });

    expect(result.generated).toBe(1);
    expect(mockRlsTx.progressReport.create).toHaveBeenCalledTimes(1);
  });

  it('should compute current_average of 0 when student has no grades', async () => {
    // No grades for the student on any assessment
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        subject_id: 'subject-1',
        max_score: 100,
        grades: [],
      },
    ]);

    await service.generate(TENANT_ID, USER_ID, {
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
    });

    expect(mockRlsTx.progressReportEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ current_average: 0 }),
      }),
    );
  });

  it('should compute correct weighted average when student has grades', async () => {
    // Student scored 80/100 → 80%
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        subject_id: 'subject-1',
        max_score: 100,
        grades: [{ student_id: STUDENT_ID, raw_score: 80 }],
      },
    ]);

    await service.generate(TENANT_ID, USER_ID, {
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
    });

    expect(mockRlsTx.progressReportEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ current_average: 80 }),
      }),
    );
  });
});

// ─── send Tests ───────────────────────────────────────────────────────────────

describe('ProgressReportService — send', () => {
  let service: ProgressReportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockNotifications: ReturnType<typeof buildMockNotificationsService>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockNotifications = buildMockNotificationsService();

    mockRlsTx.progressReport.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ProgressReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<ProgressReportService>(ProgressReportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return sent:0 when no draft reports are found', async () => {
    mockPrisma.progressReport.findMany.mockResolvedValue([]);

    const result = await service.send(TENANT_ID, USER_ID, ['pr-1']);

    expect(result.sent).toBe(0);
  });

  it('should mark reports as sent and send notifications to parents', async () => {
    mockPrisma.progressReport.findMany.mockResolvedValue([
      {
        id: 'pr-1',
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_parents: [{ parent: { user_id: 'parent-user-1' } }],
        },
      },
    ]);

    const result = await service.send(TENANT_ID, USER_ID, ['pr-1']);

    expect(result.sent).toBe(1);
    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([expect.objectContaining({ recipient_user_id: 'parent-user-1' })]),
    );
  });

  it('should not send notifications when parents have no user accounts', async () => {
    mockPrisma.progressReport.findMany.mockResolvedValue([
      {
        id: 'pr-1',
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_parents: [{ parent: { user_id: null } }],
        },
      },
    ]);

    await service.send(TENANT_ID, USER_ID, ['pr-1']);

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });
});

// ─── updateEntry Tests ────────────────────────────────────────────────────────

describe('ProgressReportService — updateEntry', () => {
  let service: ProgressReportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    // Simulate tx.progressReportEntry.update directly (not on the mockRlsTx)
    // The service calls `tx.progressReportEntry.update` which goes through the mock transaction
    const mockTxWithUpdate = {
      progressReportEntry: {
        update: jest.fn().mockResolvedValue({ id: 'entry-1', teacher_note: 'Good progress.' }),
      },
    };

    const { createRlsClient } = jest.requireMock('../../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxWithUpdate)),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ProgressReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: buildMockNotificationsService() },
      ],
    }).compile();

    service = module.get<ProgressReportService>(ProgressReportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore the default mock for rls.middleware
    const { createRlsClient } = jest.requireMock('../../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
    });
  });

  it('should throw NotFoundException when entry does not exist', async () => {
    mockPrisma.progressReportEntry.findFirst.mockResolvedValue(null);

    await expect(service.updateEntry(TENANT_ID, 'entry-missing', 'Good progress.')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should update teacher_note when entry exists', async () => {
    mockPrisma.progressReportEntry.findFirst.mockResolvedValue({ id: 'entry-1' });

    const result = await service.updateEntry(TENANT_ID, 'entry-1', 'Well done!');

    expect(result).toMatchObject({ id: 'entry-1' });
  });
});

// ─── list Tests ───────────────────────────────────────────────────────────────

describe('ProgressReportService — list', () => {
  let service: ProgressReportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ProgressReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: buildMockNotificationsService() },
      ],
    }).compile();

    service = module.get<ProgressReportService>(ProgressReportService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated progress reports', async () => {
    mockPrisma.progressReport.findMany.mockResolvedValue([
      {
        id: 'pr-1',
        student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan', student_number: '1001' },
        class_entity: { id: CLASS_ID, name: 'Grade 5A' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        entries: [],
      },
    ]);
    mockPrisma.progressReport.count.mockResolvedValue(1);

    const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
  });

  it('should return empty list when no progress reports exist', async () => {
    mockPrisma.progressReport.findMany.mockResolvedValue([]);
    mockPrisma.progressReport.count.mockResolvedValue(0);

    const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(0);
  });
});
