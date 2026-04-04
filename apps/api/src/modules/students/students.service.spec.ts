import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  HouseholdReadFacade,
  AcademicReadFacade,
  ClassesReadFacade,
  ParentReadFacade,
  GdprReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../sequence/sequence.service';

import { StudentsService } from './students.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const HOUSEHOLD_ID = 'household-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: {
    create: jest.fn(),
    update: jest.fn(),
  },
  studentParent: {
    create: jest.fn(),
  },
  classEnrolment: {
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    household: { findFirst: jest.fn() },
    yearGroup: { findFirst: jest.fn() },
    class: { findFirst: jest.fn() },
    parent: { findFirst: jest.fn() },
    student: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    consentRecord: {
      findMany: jest.fn(),
    },
  };
}

function buildMockRedis() {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return { getClient: jest.fn().mockReturnValue(client), _client: client };
}

const baseCreateDto = {
  household_id: HOUSEHOLD_ID,
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: '2010-05-15',
  status: 'active' as const,
  national_id: 'NID-001',
  nationality: 'Jordanian',
};

const baseStudent = {
  id: STUDENT_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  first_name: 'John',
  last_name: 'Doe',
  status: 'active',
  date_of_birth: new Date('2010-05-15'),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StudentsService — create', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn().mockResolvedValue('STU-202601-0001') };

    mockRlsTx.student.create.mockReset().mockResolvedValue({
      ...baseStudent,
      student_number: 'STU-202601-0001',
      household: { id: HOUSEHOLD_ID, household_name: 'Doe Family' },
      year_group: null,
      homeroom_class: null,
    });
    mockRlsTx.studentParent.create.mockReset().mockResolvedValue({});
    mockRlsTx.classEnrolment.updateMany.mockReset().mockResolvedValue({ count: 0 });

    mockPrisma.household.findFirst.mockResolvedValue({ id: HOUSEHOLD_ID });
    mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: 'yg-1' });
    mockPrisma.class.findFirst.mockResolvedValue({ id: 'class-1' });
    mockPrisma.parent.findFirst.mockResolvedValue({ id: 'parent-1' });

    const mockFacades = {
      householdExistsOrThrow: jest.fn().mockResolvedValue(undefined),
      yearGroupOrThrow: jest.fn().mockResolvedValue(undefined),
      classExistsOrThrow: jest.fn().mockResolvedValue(undefined),
      parentExistsOrThrow: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
        {
          provide: HouseholdReadFacade,
          useValue: { existsOrThrow: mockFacades.householdExistsOrThrow },
        },
        {
          provide: AcademicReadFacade,
          useValue: { findYearGroupByIdOrThrow: mockFacades.yearGroupOrThrow },
        },
        { provide: ClassesReadFacade, useValue: { existsOrThrow: mockFacades.classExistsOrThrow } },
        { provide: ParentReadFacade, useValue: { existsOrThrow: mockFacades.parentExistsOrThrow } },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
    // Store mocks for per-test overrides
    (service as unknown as Record<string, unknown>).__mockFacades = mockFacades;
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a student and generate a student number', async () => {
    await service.create(TENANT_ID, baseCreateDto);

    expect(mockSequence.nextNumber).toHaveBeenCalledWith(
      TENANT_ID,
      'student',
      expect.anything(),
      'STU',
    );
    expect(mockRlsTx.student.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          first_name: 'John',
          last_name: 'Doe',
          student_number: 'STU-202601-0001',
        }),
      }),
    );
  });

  it('should not set full_name (generated column computed by database)', async () => {
    await service.create(TENANT_ID, { ...baseCreateDto, first_name: 'Jane', last_name: 'Smith' });

    const callData = mockRlsTx.student.create.mock.calls[0]?.[0]?.data;
    expect(callData).not.toHaveProperty('full_name');
  });

  it('should create studentParent records when parent_links provided', async () => {
    await service.create(TENANT_ID, {
      ...baseCreateDto,
      parent_links: [{ parent_id: 'parent-1', relationship_label: 'Father' }],
    });

    expect(mockRlsTx.studentParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parent_id: 'parent-1',
          relationship_label: 'Father',
          tenant_id: TENANT_ID,
        }),
      }),
    );
  });

  it('should throw NotFoundException when household does not exist', async () => {
    const facades = (service as unknown as Record<string, Record<string, jest.Mock>>)
      .__mockFacades!;
    facades.householdExistsOrThrow!.mockRejectedValue(
      new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found' }),
    );

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when year_group_id does not exist', async () => {
    const facades = (service as unknown as Record<string, Record<string, jest.Mock>>)
      .__mockFacades!;
    facades.yearGroupOrThrow!.mockRejectedValue(
      new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }),
    );

    await expect(
      service.create(TENANT_ID, { ...baseCreateDto, year_group_id: 'nonexistent-yg' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when parent_links contains nonexistent parent', async () => {
    const facades = (service as unknown as Record<string, Record<string, jest.Mock>>)
      .__mockFacades!;
    facades.parentExistsOrThrow!.mockRejectedValue(
      new NotFoundException({ code: 'PARENT_NOT_FOUND', message: 'Parent not found' }),
    );

    await expect(
      service.create(TENANT_ID, {
        ...baseCreateDto,
        parent_links: [{ parent_id: 'nonexistent-parent' }],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('StudentsService — findAll', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockPrisma.student.findMany.mockResolvedValue([baseStudent]);
    mockPrisma.student.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated list with correct meta', async () => {
    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by status when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'active' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should filter by year_group_id when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, year_group_id: 'yg-1' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ year_group_id: 'yg-1' }),
      }),
    );
  });

  it('should apply search filter on name fields', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'John' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([expect.objectContaining({ first_name: expect.anything() })]),
        }),
      }),
    );
  });

  it('should filter by has_allergy when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, has_allergy: true });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ has_allergy: true }),
      }),
    );
  });

  it('should apply correct skip for page 2', async () => {
    await service.findAll(TENANT_ID, { page: 2, pageSize: 20 });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20 }));
  });
});

describe('StudentsService — allergyReport', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockPrisma.student.findMany.mockResolvedValue([
      {
        id: 'student-1',
        student_number: 'STU-1',
        first_name: 'John',
        last_name: 'Doe',
        allergy_details: 'Peanuts',
        year_group: { name: 'Year 5' },
        homeroom_class: { name: '5A' },
      },
      {
        id: 'student-2',
        student_number: 'STU-2',
        first_name: 'Sara',
        last_name: 'Ali',
        allergy_details: 'Milk',
        year_group: { name: 'Year 6' },
        homeroom_class: { name: '6A' },
      },
    ]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
        {
          provide: GdprReadFacade,
          useValue: {
            findConsentRecordsWhere: jest.fn().mockResolvedValue([{ subject_id: 'student-1' }]),
          },
        },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should include only students with active health data consent', async () => {
    const result = await service.allergyReport(TENANT_ID, {});

    expect(result.data).toEqual([
      expect.objectContaining({
        student_id: 'student-1',
        allergy_details: 'Peanuts',
      }),
    ]);
    expect(result.meta.total).toBe(1);
  });
});

describe('StudentsService — findOne', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student detail when found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      ...baseStudent,
      household: { id: HOUSEHOLD_ID, household_name: 'Doe Family' },
      year_group: null,
      homeroom_class: null,
      student_parents: [],
      class_enrolments: [],
    });

    const result = await service.findOne(TENANT_ID, STUDENT_ID);

    expect(result.id).toBe(STUDENT_ID);
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, STUDENT_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('StudentsService — updateStatus (status machine)', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockRlsTx.student.update.mockReset().mockResolvedValue({ ...baseStudent, status: 'withdrawn' });
    mockRlsTx.classEnrolment.updateMany.mockReset().mockResolvedValue({ count: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should allow active -> withdrawn transition', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, {
      status: 'withdrawn',
      reason: 'Family relocation',
    });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'withdrawn' }),
      }),
    );
  });

  it('should drop active class enrolments on withdrawal', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, {
      status: 'withdrawn',
      reason: 'Moving abroad',
    });

    expect(mockRlsTx.classEnrolment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          status: 'active',
        }),
        data: expect.objectContaining({ status: 'dropped' }),
      }),
    );
  });

  it('should allow applicant -> active transition', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'applicant' });
    mockRlsTx.student.update.mockResolvedValue({ ...baseStudent, status: 'active' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should allow active -> graduated and set exit_date', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });
    mockRlsTx.student.update.mockResolvedValue({ ...baseStudent, status: 'graduated' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'graduated' });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'graduated',
          exit_date: expect.any(Date),
        }),
      }),
    );
  });

  it('should throw BadRequestException for invalid transition (withdrawn -> graduated)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'withdrawn' });

    await expect(
      service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'graduated' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException for invalid transition (archived -> active)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'archived' });

    await expect(service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when withdrawing without reason', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });

    await expect(
      service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'withdrawn' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when withdrawal reason is empty string', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });

    await expect(
      service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'withdrawn', reason: '   ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('edge: graduated -> archived is valid, no class enrolment cleanup needed', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'graduated' });
    mockRlsTx.student.update.mockResolvedValue({ ...baseStudent, status: 'archived' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'archived' });

    // No classEnrolment.updateMany should have been called (not a withdrawal)
    expect(mockRlsTx.classEnrolment.updateMany).not.toHaveBeenCalled();
    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });
});

describe('StudentsService — update', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };
  let mockHouseholdFacade: { existsOrThrow: jest.Mock };
  let mockAcademicFacade: { findYearGroupByIdOrThrow: jest.Mock };
  let mockClassesFacade: { existsOrThrow: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockRlsTx.student.update.mockReset().mockResolvedValue(baseStudent);

    mockHouseholdFacade = { existsOrThrow: jest.fn().mockResolvedValue(undefined) };
    mockAcademicFacade = { findYearGroupByIdOrThrow: jest.fn().mockResolvedValue(undefined) };
    mockClassesFacade = { existsOrThrow: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
        { provide: HouseholdReadFacade, useValue: mockHouseholdFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update student fields', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);

    await service.update(TENANT_ID, STUDENT_ID, { first_name: 'Jonathan' });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STUDENT_ID },
        data: expect.objectContaining({ first_name: 'Jonathan' }),
      }),
    );
  });

  it('should throw NotFoundException when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, STUDENT_ID, { first_name: 'Jonathan' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should invalidate preview cache after update', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);

    await service.update(TENANT_ID, STUDENT_ID, { first_name: 'Jonathan' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:student:${STUDENT_ID}`);
  });

  it('should throw NotFoundException when household_id FK not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);
    mockHouseholdFacade.existsOrThrow.mockRejectedValue(
      new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: 'Household not found' }),
    );

    await expect(
      service.update(TENANT_ID, STUDENT_ID, { household_id: 'nonexistent-hh' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when year_group_id FK not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);
    mockAcademicFacade.findYearGroupByIdOrThrow.mockRejectedValue(
      new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }),
    );

    await expect(
      service.update(TENANT_ID, STUDENT_ID, { year_group_id: 'nonexistent-yg' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when class_homeroom_id FK not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);
    mockClassesFacade.existsOrThrow.mockRejectedValue(
      new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class not found' }),
    );

    await expect(
      service.update(TENANT_ID, STUDENT_ID, { class_homeroom_id: 'nonexistent-class' }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── preview ─────────────────────────────────────────────────────────────────

describe('StudentsService — preview', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  const studentPreviewEntity = {
    id: STUDENT_ID,
    full_name: 'John Doe',
    first_name: 'John',
    last_name: 'Doe',
    status: 'active',
    date_of_birth: new Date('2010-05-15'),
    has_allergy: false,
    year_group: { name: 'Year 5' },
    homeroom_class: { name: '5A' },
    household: { household_name: 'Doe Family' },
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached preview data on cache hit', async () => {
    const cachedData = {
      id: STUDENT_ID,
      entity_type: 'student',
      primary_label: 'John Doe',
      secondary_label: 'Year 5 — 5A',
      status: 'active',
      facts: [
        { label: 'Household', value: 'Doe Family' },
        { label: 'DOB', value: '2010-05-15' },
        { label: 'Allergy', value: 'No' },
      ],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.preview(TENANT_ID, STUDENT_ID);

    expect(result).toEqual(cachedData);
    expect(mockPrisma.student.findFirst).not.toHaveBeenCalled();
  });

  it('should build preview from DB on cache miss and cache it', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.student.findFirst.mockResolvedValue(studentPreviewEntity);

    const result = await service.preview(TENANT_ID, STUDENT_ID);

    expect(result.entity_type).toBe('student');
    expect(result.primary_label).toBe('John Doe');
    expect(result.secondary_label).toBe('Year 5 — 5A');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Household', value: 'Doe Family' }),
        expect.objectContaining({ label: 'Allergy', value: 'No' }),
      ]),
    );
    expect(mockRedis._client.set).toHaveBeenCalledWith(
      `preview:student:${STUDENT_ID}`,
      expect.any(String),
      'EX',
      30,
    );
  });

  it('should fallback to first_name + last_name when full_name is null', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.student.findFirst.mockResolvedValue({
      ...studentPreviewEntity,
      full_name: null,
    });

    const result = await service.preview(TENANT_ID, STUDENT_ID);

    expect(result.primary_label).toBe('John Doe');
  });

  it('should omit year_group and homeroom_class from secondary_label when null', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.student.findFirst.mockResolvedValue({
      ...studentPreviewEntity,
      year_group: null,
      homeroom_class: null,
    });

    const result = await service.preview(TENANT_ID, STUDENT_ID);

    expect(result.secondary_label).toBe('');
  });

  it('should throw NotFoundException when student not found on cache miss', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.preview(TENANT_ID, STUDENT_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── getExportData ───────────────────────────────────────────────────────────

describe('StudentsService — getExportData', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockPrisma.student.findMany.mockResolvedValue([
      {
        id: STUDENT_ID,
        student_number: 'STU-001',
        first_name: 'John',
        middle_name: null,
        last_name: 'Doe',
        national_id: 'NID-001',
        nationality: 'Jordanian',
        city_of_birth: null,
        gender: 'male',
        date_of_birth: new Date('2010-05-15'),
        status: 'active',
        entry_date: new Date('2023-09-01'),
        medical_notes: null,
        has_allergy: false,
        allergy_details: null,
        year_group: { id: 'yg-1', name: 'Year 5' },
        household: { id: HOUSEHOLD_ID, household_name: 'Doe Family' },
        homeroom_class: { id: 'class-1', name: '5A' },
        student_parents: [],
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should filter by status when provided', async () => {
    await service.getExportData(TENANT_ID, { status: 'active' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should filter by has_allergy when provided', async () => {
    await service.getExportData(TENANT_ID, { has_allergy: true });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ has_allergy: true }),
      }),
    );
  });

  it('should apply search filter on name fields', async () => {
    await service.getExportData(TENANT_ID, { search: 'Doe' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ last_name: expect.objectContaining({ contains: 'Doe' }) }),
          ]),
        }),
      }),
    );
  });

  it('should filter by year_group_id when provided', async () => {
    await service.getExportData(TENANT_ID, { year_group_id: 'yg-1' });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ year_group_id: 'yg-1' }),
      }),
    );
  });

  it('should return data wrapper with students array', async () => {
    const result = await service.getExportData(TENANT_ID, {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.first_name).toBe('John');
  });
});

// ─── exportPack ──────────────────────────────────────────────────────────────

describe('StudentsService — exportPack', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return profile with placeholder arrays', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      ...baseStudent,
      household: { id: HOUSEHOLD_ID, household_name: 'Doe Family' },
      year_group: null,
      homeroom_class: null,
      student_parents: [],
      class_enrolments: [],
    });

    const result = await service.exportPack(TENANT_ID, STUDENT_ID);

    expect(result.profile).toBeDefined();
    expect(result.profile.id).toBe(STUDENT_ID);
    expect(result.attendance_summary).toEqual([]);
    expect(result.grades).toEqual([]);
    expect(result.report_cards).toEqual([]);
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.exportPack(TENANT_ID, STUDENT_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── updateStatus re-enrolment ───────────────────────────────────────────────

describe('StudentsService — updateStatus (re-enrolment transitions)', () => {
  let service: StudentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockSequence = { nextNumber: jest.fn() };

    mockRlsTx.student.update.mockReset().mockResolvedValue({ ...baseStudent, status: 'active' });
    mockRlsTx.classEnrolment.updateMany.mockReset().mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        StudentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StudentsService>(StudentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should allow withdrawn -> active (re-enrolment)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'withdrawn' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should block graduated -> active (not allowed)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'graduated' });

    await expect(service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should NOT drop class enrolments when re-enrolling (withdrawn -> active)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'withdrawn' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'active' });

    expect(mockRlsTx.classEnrolment.updateMany).not.toHaveBeenCalled();
  });

  it('edge: active -> archived is a valid transition', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'active' });
    mockRlsTx.student.update.mockResolvedValue({ ...baseStudent, status: 'archived' });

    await service.updateStatus(TENANT_ID, STUDENT_ID, { status: 'archived' });

    expect(mockRlsTx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });

  it('edge: applicant -> withdrawn is blocked', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ ...baseStudent, status: 'applicant' });

    await expect(
      service.updateStatus(TENANT_ID, STUDENT_ID, {
        status: 'withdrawn',
        reason: 'Changed mind',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
