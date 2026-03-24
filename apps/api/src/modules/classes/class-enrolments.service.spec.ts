import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ClassEnrolmentsService } from './class-enrolments.service';
import type { BulkEnrolDto } from './dto/bulk-enrol.dto';
import type { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import type { UpdateEnrolmentStatusDto } from './dto/update-enrolment-status.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ENROLMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  classEnrolment: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    class: { findFirst: jest.fn() },
    classEnrolment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

const baseEnrolment = {
  id: ENROLMENT_ID,
  tenant_id: TENANT_ID,
  class_id: CLASS_ID,
  student_id: STUDENT_ID,
  status: 'active',
  start_date: new Date('2025-09-01'),
  end_date: null,
  student: {
    id: STUDENT_ID,
    first_name: 'Alice',
    last_name: 'Smith',
    full_name: 'Alice Smith',
    student_number: 'STU-001',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassEnrolmentsService — create', () => {
  let service: ClassEnrolmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.classEnrolment.create.mockReset().mockResolvedValue(baseEnrolment);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassEnrolmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassEnrolmentsService>(ClassEnrolmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create an enrolment successfully', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

    const dto: CreateEnrolmentDto = {
      student_id: STUDENT_ID,
      start_date: '2025-09-01',
    };

    const result = await service.create(TENANT_ID, CLASS_ID, dto);

    expect(mockRlsTx.classEnrolment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          student_id: STUDENT_ID,
          status: 'active',
        }),
      }),
    );
    expect(result).toEqual(baseEnrolment);
  });

  it('should throw NotFoundException if class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    const dto: CreateEnrolmentDto = {
      student_id: STUDENT_ID,
      start_date: '2025-09-01',
    };

    await expect(service.create(TENANT_ID, CLASS_ID, dto)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException if student already actively enrolled', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.classEnrolment.findFirst.mockResolvedValue(baseEnrolment);

    const dto: CreateEnrolmentDto = {
      student_id: STUDENT_ID,
      start_date: '2025-09-01',
    };

    await expect(service.create(TENANT_ID, CLASS_ID, dto)).rejects.toThrow(ConflictException);
  });

  it('should pass start_date as Date to the DB', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

    const dto: CreateEnrolmentDto = {
      student_id: STUDENT_ID,
      start_date: '2025-09-01',
    };

    await service.create(TENANT_ID, CLASS_ID, dto);

    expect(mockRlsTx.classEnrolment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          start_date: new Date('2025-09-01'),
        }),
      }),
    );
  });
});

describe('ClassEnrolmentsService — findAllForClass', () => {
  let service: ClassEnrolmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassEnrolmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassEnrolmentsService>(ClassEnrolmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return enrolments for a class', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.classEnrolment.findMany.mockResolvedValue([baseEnrolment]);

    const result = await service.findAllForClass(TENANT_ID, CLASS_ID);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe(ENROLMENT_ID);
  });

  it('should throw NotFoundException when class does not belong to tenant', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.findAllForClass(TENANT_ID, CLASS_ID)).rejects.toThrow(NotFoundException);
  });

  it('should apply status filter when provided', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    await service.findAllForClass(TENANT_ID, CLASS_ID, 'dropped');

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'dropped' }),
      }),
    );
  });
});

describe('ClassEnrolmentsService — updateStatus', () => {
  let service: ClassEnrolmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.classEnrolment.update.mockReset().mockResolvedValue({
      ...baseEnrolment,
      status: 'dropped',
      end_date: new Date(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassEnrolmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassEnrolmentsService>(ClassEnrolmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should allow active -> dropped status transition', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue({ ...baseEnrolment, status: 'active' });

    const dto: UpdateEnrolmentStatusDto = { status: 'dropped' };

    await expect(service.updateStatus(TENANT_ID, ENROLMENT_ID, dto)).resolves.not.toThrow();

    expect(mockRlsTx.classEnrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ENROLMENT_ID },
        data: expect.objectContaining({ status: 'dropped' }),
      }),
    );
  });

  it('should block completed -> active status transition', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue({ ...baseEnrolment, status: 'completed' });

    const dto: UpdateEnrolmentStatusDto = { status: 'active' };

    await expect(service.updateStatus(TENANT_ID, ENROLMENT_ID, dto)).rejects.toThrow(BadRequestException);
  });

  it('should block active -> active status transition', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue({ ...baseEnrolment, status: 'active' });

    const dto: UpdateEnrolmentStatusDto = { status: 'active' };

    await expect(service.updateStatus(TENANT_ID, ENROLMENT_ID, dto)).rejects.toThrow(BadRequestException);
  });

  it('should set end_date when dropping an enrolment', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue({ ...baseEnrolment, status: 'active' });

    const dto: UpdateEnrolmentStatusDto = { status: 'dropped', end_date: '2026-01-15' };

    await service.updateStatus(TENANT_ID, ENROLMENT_ID, dto);

    expect(mockRlsTx.classEnrolment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'dropped',
          end_date: new Date('2026-01-15'),
        }),
      }),
    );
  });

  it('should throw NotFoundException when enrolment not found', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

    const dto: UpdateEnrolmentStatusDto = { status: 'dropped' };

    await expect(service.updateStatus(TENANT_ID, ENROLMENT_ID, dto)).rejects.toThrow(NotFoundException);
  });

  it('should allow dropped -> active status transition', async () => {
    mockPrisma.classEnrolment.findFirst.mockResolvedValue({ ...baseEnrolment, status: 'dropped' });

    mockRlsTx.classEnrolment.update.mockResolvedValue({ ...baseEnrolment, status: 'active' });

    const dto: UpdateEnrolmentStatusDto = { status: 'active' };

    await expect(service.updateStatus(TENANT_ID, ENROLMENT_ID, dto)).resolves.not.toThrow();
  });
});

describe('ClassEnrolmentsService — bulkEnrol', () => {
  let service: ClassEnrolmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.classEnrolment.create.mockReset().mockResolvedValue({ id: ENROLMENT_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassEnrolmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassEnrolmentsService>(ClassEnrolmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should enrol students and skip already-enrolled ones', async () => {
    const secondStudentId = 'student-2222';
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });
    // First student: not yet enrolled; second student: already enrolled
    mockPrisma.classEnrolment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: ENROLMENT_ID, status: 'active' });

    const dto: BulkEnrolDto = {
      student_ids: [STUDENT_ID, secondStudentId],
      start_date: '2025-09-01',
    };

    const result = await service.bulkEnrol(TENANT_ID, CLASS_ID, dto);

    expect(result.enrolled).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('should throw NotFoundException when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    const dto: BulkEnrolDto = {
      student_ids: [STUDENT_ID],
      start_date: '2025-09-01',
    };

    await expect(service.bulkEnrol(TENANT_ID, CLASS_ID, dto)).rejects.toThrow(NotFoundException);
  });
});

describe('ClassEnrolmentsService — dropAllActiveForStudent', () => {
  let service: ClassEnrolmentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockPrisma.classEnrolment.updateMany.mockResolvedValue({ count: 2 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassEnrolmentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassEnrolmentsService>(ClassEnrolmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should drop all active enrolments for a student', async () => {
    await service.dropAllActiveForStudent(TENANT_ID, STUDENT_ID);

    expect(mockPrisma.classEnrolment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          status: 'active',
        }),
        data: expect.objectContaining({ status: 'dropped' }),
      }),
    );
  });

  it('should use provided transaction client instead of prisma when given', async () => {
    const mockTxPrisma = {
      classEnrolment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    await service.dropAllActiveForStudent(TENANT_ID, STUDENT_ID, mockTxPrisma);

    expect(mockTxPrisma.classEnrolment.updateMany).toHaveBeenCalled();
    // The service-level prisma should NOT have been called
    expect(mockPrisma.classEnrolment.updateMany).not.toHaveBeenCalled();
  });
});
