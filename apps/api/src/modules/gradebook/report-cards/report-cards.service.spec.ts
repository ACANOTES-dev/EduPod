import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade, MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { ReportCardsQueriesService } from './report-cards-queries.service';
import { ReportCardsService } from './report-cards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REPORT_CARD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCard: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
    academicPeriod: { findFirst: jest.fn() },
    student: { findFirst: jest.fn(), findMany: jest.fn() },
    tenant: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn(), count: jest.fn() },
    assessment: { findMany: jest.fn() },
    dailyAttendanceSummary: { groupBy: jest.fn() },
    reportCard: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
  };
}

function buildMockRedis() {
  const client = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    keys: jest.fn().mockResolvedValue([]),
  };
  return { getClient: jest.fn().mockReturnValue(client), _client: client };
}

const _basePeriod = {
  id: PERIOD_ID,
  name: 'Term 1',
  start_date: new Date('2025-09-01'),
  end_date: new Date('2025-12-20'),
  tenant_id: TENANT_ID,
  academic_year: { id: 'year-1', name: '2025-2026' },
};

const _baseStudent = {
  id: STUDENT_ID,
  first_name: 'Ali',
  last_name: 'Hassan',
  student_number: 'S001',
  tenant_id: TENANT_ID,
  year_group: { id: 'yg-1', name: 'Year 5' },
  homeroom_class: { id: 'class-1', name: '5A' },
  household: null,
};

const baseReportCard = {
  id: REPORT_CARD_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  academic_period_id: PERIOD_ID,
  status: 'draft',
  template_locale: 'en',
  snapshot_payload_json: { teacher_comment: null, principal_comment: null },
  teacher_comment: null,
  principal_comment: null,
  published_at: null,
  published_by_user_id: null,
  revision_of_report_card_id: null,
  created_at: new Date('2025-10-01'),
  updated_at: new Date('2025-10-01'),
  student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan', student_number: 'S001' },
  academic_period: { id: PERIOD_ID, name: 'Term 1' },
  published_by: null,
  revision_of: null,
  revisions: [],
};

// ─── findAll ──────────────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — findAll', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [...MOCK_FACADE_PROVIDERS, ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated report cards with meta', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([baseReportCard]);
    mockPrisma.reportCard.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should exclude revised report cards by default', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'revised' } }),
      }),
    );
  });

  it('should include revised report cards when include_revisions is true', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, include_revisions: true });

    // When include_revisions=true and no explicit status, 'status' should not be filtered to exclude revised
    const call = mockPrisma.reportCard.findMany.mock.calls[0]?.[0] as {
      where: { status?: unknown };
    };
    expect(call.where.status).toBeUndefined();
  });

  it('should filter by student_id when provided', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, student_id: STUDENT_ID });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ student_id: STUDENT_ID }),
      }),
    );
  });

  it('should apply pagination correctly', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 3, pageSize: 10 });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });
});

// ─── findOne ──────────────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — findOne', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [...MOCK_FACADE_PROVIDERS, ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the report card when found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(baseReportCard);

    const result = await service.findOne(TENANT_ID, REPORT_CARD_ID);

    expect(result.id).toBe(REPORT_CARD_ID);
  });

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('ReportCardsService — update', () => {
  let service: ReportCardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCard.update.mockReset().mockResolvedValue(baseReportCard);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis() },
      ],
    }).compile();

    service = module.get<ReportCardsService>(ReportCardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, REPORT_CARD_ID, { teacher_comment: 'Good work' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when report card is not draft', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      status: 'published',
    });

    await expect(
      service.update(TENANT_ID, REPORT_CARD_ID, { teacher_comment: 'Good work' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException when optimistic concurrency check fails', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      status: 'draft',
      updated_at: new Date('2025-10-01T10:00:00.000Z'),
    });

    await expect(
      service.update(TENANT_ID, REPORT_CARD_ID, {
        teacher_comment: 'Good work',
        expected_updated_at: '2025-10-01T09:00:00.000Z', // stale
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should update teacher_comment successfully on a draft', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      status: 'draft',
      snapshot_payload_json: { teacher_comment: null, principal_comment: null },
    });

    await service.update(TENANT_ID, REPORT_CARD_ID, { teacher_comment: 'Good work' });

    expect(mockRlsTx.reportCard.update).toHaveBeenCalled();
  });

  it('should update principal_comment and merge into snapshot payload', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      status: 'draft',
      snapshot_payload_json: { teacher_comment: 'Already set', principal_comment: null },
    });

    await service.update(TENANT_ID, REPORT_CARD_ID, { principal_comment: 'Well done!' });

    const updateCall = mockRlsTx.reportCard.update.mock.calls[0]?.[0] as {
      data: { principal_comment?: string | null };
    };
    expect(updateCall.data.principal_comment).toBe('Well done!');
  });
});

// ─── publish ──────────────────────────────────────────────────────────────────

describe('ReportCardsService — publish', () => {
  let service: ReportCardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockRlsTx.reportCard.update
      .mockReset()
      .mockResolvedValue({ ...baseReportCard, status: 'published' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ReportCardsService>(ReportCardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.publish(TENANT_ID, REPORT_CARD_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when report card is already published', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ ...baseReportCard, status: 'published' });

    await expect(service.publish(TENANT_ID, REPORT_CARD_ID, USER_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should publish a draft report card and invalidate transcript cache', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({
      ...baseReportCard,
      status: 'draft',
      student_id: STUDENT_ID,
    });

    await service.publish(TENANT_ID, REPORT_CARD_ID, USER_ID);

    expect(mockRlsTx.reportCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REPORT_CARD_ID },
        data: expect.objectContaining({
          status: 'published',
          published_by_user_id: USER_ID,
        }),
      }),
    );
    expect(mockRedis.getClient().del).toHaveBeenCalled();
  });

  it('should succeed even if cache invalidation throws', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ ...baseReportCard, status: 'draft' });
    mockRedis.getClient().del.mockRejectedValue(new Error('Redis down'));

    // Should not throw
    const result = await service.publish(TENANT_ID, REPORT_CARD_ID, USER_ID);
    expect(result).toBeDefined();
  });
});

// ─── revise ───────────────────────────────────────────────────────────────────

describe('ReportCardsService — revise', () => {
  let service: ReportCardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCard.update
      .mockReset()
      .mockResolvedValue({ ...baseReportCard, status: 'revised' });
    mockRlsTx.reportCard.create.mockReset().mockResolvedValue({ ...baseReportCard, id: 'new-rc' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis() },
      ],
    }).compile();

    service = module.get<ReportCardsService>(ReportCardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card does not exist', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.revise(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when report card is not published', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ ...baseReportCard, status: 'draft' });

    await expect(service.revise(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(ConflictException);
  });

  it('should mark original as revised and create a new draft', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue({ ...baseReportCard, status: 'published' });

    const result = (await service.revise(TENANT_ID, REPORT_CARD_ID)) as { id: string };

    expect(mockRlsTx.reportCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REPORT_CARD_ID },
        data: { status: 'revised' },
      }),
    );
    expect(mockRlsTx.reportCard.create).toHaveBeenCalled();
    expect(result.id).toBe('new-rc');
  });
});

// ─── gradeOverview ────────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — gradeOverview', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [...MOCK_FACADE_PROVIDERS, ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated grade overview with mapped fields', async () => {
    const row = {
      id: 'snap-1',
      student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan', student_number: 'S001' },
      subject: { id: 'sub-1', name: 'Math' },
      academic_period: { id: PERIOD_ID, name: 'Term 1' },
      class_entity: { id: 'class-1', name: '5A' },
      computed_value: 85,
      display_value: 'B+',
      overridden_value: null,
    };
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([row]);
    mockPrisma.periodGradeSnapshot.count.mockResolvedValue(1);

    const result = await service.gradeOverview(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      student_name: 'Ali Hassan',
      subject_name: 'Math',
      class_name: '5A',
      final_grade: 'B+',
      has_override: false,
    });
    expect(result.meta.total).toBe(1);
  });

  it('should use overridden_value as final_grade when set', async () => {
    const row = {
      id: 'snap-2',
      student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan', student_number: 'S001' },
      subject: { id: 'sub-1', name: 'Math' },
      academic_period: { id: PERIOD_ID, name: 'Term 1' },
      class_entity: { id: 'class-1', name: '5A' },
      computed_value: 75,
      display_value: 'C',
      overridden_value: 'B',
    };
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([row]);
    mockPrisma.periodGradeSnapshot.count.mockResolvedValue(1);

    const result = await service.gradeOverview(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]?.final_grade).toBe('B');
    expect(result.data[0]?.has_override).toBe(true);
  });
});

// ─── publishBulk ──────────────────────────────────────────────────────────────

describe('ReportCardsService — publishBulk', () => {
  let service: ReportCardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockRlsTx.reportCard.update
      .mockReset()
      .mockResolvedValue({ ...baseReportCard, status: 'published' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ReportCardsService>(ReportCardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return success and failure counts for bulk publish', async () => {
    // First card: draft — succeeds
    // Second card: not found — fails
    mockPrisma.reportCard.findFirst
      .mockResolvedValueOnce({ ...baseReportCard, status: 'draft', student_id: STUDENT_ID })
      .mockResolvedValueOnce(null);

    const result = await service.publishBulk(TENANT_ID, [REPORT_CARD_ID, 'missing-id'], USER_ID);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results).toHaveLength(2);
  });

  it('edge: empty array returns zero succeeded and failed', async () => {
    const result = await service.publishBulk(TENANT_ID, [], USER_ID);

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

// ─── generateTranscript ───────────────────────────────────────────────────────

describe('ReportCardsQueriesService — generateTranscript', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStudentFacade: { findOneGeneric: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockStudentFacade = { findOneGeneric: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student does not exist', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue(null);

    await expect(service.generateTranscript(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return transcript with student details and empty academic_years when no snapshots', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'S001',
      year_group: { id: 'yg-1', name: 'Year 5' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.id).toBe(STUDENT_ID);
    expect(result.student.first_name).toBe('Ali');
    expect(result.academic_years).toHaveLength(0);
  });

  it('should group snapshots by year and period', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'S001',
      year_group: null,
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        id: 'snap-1',
        student_id: STUDENT_ID,
        subject: { id: 'sub-1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: PERIOD_ID,
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-20'),
          academic_year: { id: 'year-1', name: '2025-2026' },
        },
        computed_value: 85,
        display_value: 'B+',
        overridden_value: null,
      },
    ]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.academic_years).toHaveLength(1);
    expect(result.academic_years[0]?.academic_year_name).toBe('2025-2026');
    expect(result.academic_years[0]?.periods).toHaveLength(1);
    expect(result.academic_years[0]?.periods[0]?.subjects).toHaveLength(1);
  });
});

// ─── generateBulkDrafts ───────────────────────────────────────────────────────

describe('ReportCardsService — generateBulkDrafts', () => {
  let service: ReportCardsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacade: { findEnrolmentsGeneric: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockClassesFacade = { findEnrolmentsGeneric: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: buildMockRedis() },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
      ],
    }).compile();

    service = module.get<ReportCardsService>(ReportCardsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty result when no active enrolments in class', async () => {
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

    const result = await service.generateBulkDrafts(TENANT_ID, 'class-1', PERIOD_ID);

    expect(result).toEqual({ data: [], skipped: 0, generated: 0 });
  });

  it('should skip students who already have a non-revised report card', async () => {
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
    mockPrisma.reportCard.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);

    const result = await service.generateBulkDrafts(TENANT_ID, 'class-1', PERIOD_ID);

    expect(result.skipped).toBe(1);
    expect(result.generated).toBe(0);
  });
});
