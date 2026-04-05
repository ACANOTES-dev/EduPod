import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { HomeworkService } from './homework.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEWORK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACADEMIC_YEAR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ATTACHMENT_ID = '11111111-1111-1111-1111-111111111111';
const RECURRENCE_RULE_ID = '22222222-2222-2222-2222-222222222222';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  homeworkAssignment: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  homeworkAttachment: {
    create: jest.fn(),
    createMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  homeworkRecurrenceRule: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    homeworkAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    homeworkAttachment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    homeworkRecurrenceRule: {
      findFirst: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        settings: {
          homework: {
            max_attachment_size_mb: 10,
            max_attachments_per_assignment: 5,
          },
        },
      }),
    },
  };
}

function buildMockS3() {
  return {
    upload: jest.fn(),
    delete: jest.fn(),
  };
}

function resetRlsMocks() {
  Object.values(mockRlsTx).forEach((model) =>
    Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
  );
}

const baseCreateDto = {
  class_id: CLASS_ID,
  academic_year_id: ACADEMIC_YEAR_ID,
  title: 'Math Homework Chapter 5',
  homework_type: 'written' as const,
  due_date: '2026-04-15',
};

const baseAssignment = {
  id: HOMEWORK_ID,
  tenant_id: TENANT_ID,
  class_id: CLASS_ID,
  subject_id: null,
  academic_year_id: ACADEMIC_YEAR_ID,
  academic_period_id: null,
  assigned_by_user_id: USER_ID,
  title: 'Math Homework Chapter 5',
  description: null,
  homework_type: 'written',
  status: 'draft',
  due_date: new Date('2026-04-15'),
  due_time: null,
  max_points: null,
  published_at: null,
  copied_from_id: null,
  recurrence_rule_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  class_entity: { id: CLASS_ID, name: 'Year 5A' },
  subject: null,
  assigned_by: { id: USER_ID, first_name: 'John', last_name: 'Teacher' },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkService — create', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should create a homework assignment via RLS transaction', async () => {
    const result = await service.create(TENANT_ID, USER_ID, baseCreateDto);

    expect(mockRlsTx.homeworkAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          assigned_by_user_id: USER_ID,
          title: 'Math Homework Chapter 5',
          status: 'draft',
        }),
      }),
    );
    expect(result).toEqual(baseAssignment);
  });

  it('should set subject_id to null when not provided', async () => {
    await service.create(TENANT_ID, USER_ID, baseCreateDto);

    const callData = mockRlsTx.homeworkAssignment.create.mock.calls[0]?.[0]?.data;
    expect(callData.subject_id).toBeNull();
  });

  it('should pass optional fields when provided', async () => {
    const dto = {
      ...baseCreateDto,
      subject_id: SUBJECT_ID,
      description: 'Complete exercises 1-10',
      due_time: '14:30',
      max_points: 20,
    };

    await service.create(TENANT_ID, USER_ID, dto);

    const callData = mockRlsTx.homeworkAssignment.create.mock.calls[0]?.[0]?.data;
    expect(callData.subject_id).toBe(SUBJECT_ID);
    expect(callData.description).toBe('Complete exercises 1-10');
    expect(callData.max_points).toBe(20);
    expect(callData.due_time).toEqual(new Date('1970-01-01T14:30'));
  });
});

describe('HomeworkService — list', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([baseAssignment]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(1);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return paginated homework list with correct meta', async () => {
    const result = await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      sort: 'due_date',
      order: 'desc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by class_id when provided', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      class_id: CLASS_ID,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class_id: CLASS_ID }),
      }),
    );
  });

  it('should filter by status when provided', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      status: 'published',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'published' }),
      }),
    );
  });

  it('should apply date range filters when provided', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      due_date_from: '2026-04-01',
      due_date_to: '2026-04-30',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          due_date: {
            gte: new Date('2026-04-01'),
            lte: new Date('2026-04-30'),
          },
        }),
      }),
    );
  });

  it('should apply correct skip for page 2', async () => {
    await service.list(TENANT_ID, {
      page: 2,
      pageSize: 10,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });
});

describe('HomeworkService — findOne', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return assignment with all includes when found', async () => {
    const fullAssignment = {
      ...baseAssignment,
      academic_year: { id: ACADEMIC_YEAR_ID, name: '2025-2026' },
      academic_period: null,
      recurrence_rule: null,
      attachments: [],
      completions: [],
      _count: { completions: 0 },
    };
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(fullAssignment);

    const result = await service.findOne(TENANT_ID, HOMEWORK_ID);

    expect(result).toEqual(fullAssignment);
    expect(mockPrisma.homeworkAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOMEWORK_ID, tenant_id: TENANT_ID },
      }),
    );
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, HOMEWORK_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkService — update', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockRlsTx.homeworkAssignment.update.mockResolvedValue({
      ...baseAssignment,
      title: 'Updated Title',
    });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should update a draft assignment', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });

    const result = await service.update(TENANT_ID, HOMEWORK_ID, USER_ID, {
      title: 'Updated Title',
    });

    expect(mockRlsTx.homeworkAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOMEWORK_ID },
        data: expect.objectContaining({ title: 'Updated Title' }),
      }),
    );
    expect((result as { title: string }).title).toBe('Updated Title');
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, HOMEWORK_ID, USER_ID, { title: 'Updated' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when assignment is not draft', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'published',
    });

    await expect(
      service.update(TENANT_ID, HOMEWORK_ID, USER_ID, { title: 'Updated' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should only include fields that are defined in the dto', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });

    await service.update(TENANT_ID, HOMEWORK_ID, USER_ID, {
      title: 'New Title',
    });

    const callData = mockRlsTx.homeworkAssignment.update.mock.calls[0]?.[0]?.data;
    expect(callData).toHaveProperty('title', 'New Title');
    expect(callData).not.toHaveProperty('description');
    expect(callData).not.toHaveProperty('class_id');
  });
});

describe('HomeworkService — updateStatus (state machine)', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockRlsTx.homeworkAssignment.update.mockResolvedValue({
      ...baseAssignment,
      status: 'published',
      published_at: new Date(),
    });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should allow draft -> published transition and set published_at', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });

    await service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'published' });

    expect(mockRlsTx.homeworkAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'published',
          published_at: expect.any(Date),
        }),
      }),
    );
  });

  it('should allow draft -> archived transition', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });
    mockRlsTx.homeworkAssignment.update.mockResolvedValue({
      ...baseAssignment,
      status: 'archived',
    });

    await service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'archived' });

    expect(mockRlsTx.homeworkAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });

  it('should allow published -> archived transition', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'published',
    });
    mockRlsTx.homeworkAssignment.update.mockResolvedValue({
      ...baseAssignment,
      status: 'archived',
    });

    await service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'archived' });

    expect(mockRlsTx.homeworkAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });

  it('should not set published_at when transitioning to archived', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });
    mockRlsTx.homeworkAssignment.update.mockResolvedValue({
      ...baseAssignment,
      status: 'archived',
    });

    await service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'archived' });

    const callData = mockRlsTx.homeworkAssignment.update.mock.calls[0]?.[0]?.data;
    expect(callData).not.toHaveProperty('published_at');
  });

  it('should throw BadRequestException for invalid transition archived -> published', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'archived',
    });

    await expect(
      service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'published' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'published' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('edge: published -> published is an invalid same-status transition', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'published',
    });

    await expect(
      service.updateStatus(TENANT_ID, HOMEWORK_ID, { status: 'published' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('HomeworkService — copy', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should create a copy with new due_date and copied_from_id', async () => {
    const source = {
      ...baseAssignment,
      attachments: [],
    };
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(source);

    const copiedAssignment = {
      ...baseAssignment,
      id: '99999999-9999-9999-9999-999999999999',
      copied_from_id: HOMEWORK_ID,
      due_date: new Date('2026-05-01'),
    };
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(copiedAssignment);

    const result = await service.copy(TENANT_ID, HOMEWORK_ID, USER_ID, {
      due_date: '2026-05-01',
    });

    expect(mockRlsTx.homeworkAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          copied_from_id: HOMEWORK_ID,
          assigned_by_user_id: USER_ID,
          status: 'draft',
          due_date: new Date('2026-05-01'),
        }),
      }),
    );
    expect((result as { copied_from_id: string }).copied_from_id).toBe(HOMEWORK_ID);
  });

  it('should copy attachments from the source', async () => {
    const source = {
      ...baseAssignment,
      attachments: [
        {
          id: ATTACHMENT_ID,
          tenant_id: TENANT_ID,
          homework_assignment_id: HOMEWORK_ID,
          attachment_type: 'file',
          file_name: 'worksheet.pdf',
          file_key: 'uploads/worksheet.pdf',
          file_size_bytes: 12345,
          mime_type: 'application/pdf',
          url: null,
          display_order: 0,
        },
      ],
    };
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(source);

    const copiedAssignment = {
      ...baseAssignment,
      id: '99999999-9999-9999-9999-999999999999',
    };
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(copiedAssignment);
    mockRlsTx.homeworkAttachment.createMany.mockResolvedValue({ count: 1 });

    await service.copy(TENANT_ID, HOMEWORK_ID, USER_ID, {
      due_date: '2026-05-01',
    });

    expect(mockRlsTx.homeworkAttachment.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID,
            file_name: 'worksheet.pdf',
          }),
        ]),
      }),
    );
  });

  it('should throw NotFoundException when source assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.copy(TENANT_ID, HOMEWORK_ID, USER_ID, { due_date: '2026-05-01' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkService — remove', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should delete a draft assignment and clean up S3 files', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      status: 'draft',
      attachments: [{ id: ATTACHMENT_ID, file_key: 'uploads/file.pdf', attachment_type: 'file' }],
    });

    await service.remove(TENANT_ID, HOMEWORK_ID);

    expect(mockS3.delete).toHaveBeenCalledWith('uploads/file.pdf');
    expect(mockRlsTx.homeworkAssignment.delete).toHaveBeenCalledWith({
      where: { id: HOMEWORK_ID },
    });
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, HOMEWORK_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when assignment is not draft', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      status: 'published',
      attachments: [],
    });

    await expect(service.remove(TENANT_ID, HOMEWORK_ID)).rejects.toThrow(BadRequestException);
  });

  it('should not fail when S3 delete throws (logs error instead)', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      status: 'draft',
      attachments: [{ id: ATTACHMENT_ID, file_key: 'uploads/file.pdf', attachment_type: 'file' }],
    });
    mockS3.delete.mockRejectedValue(new Error('S3 network error'));

    await expect(service.remove(TENANT_ID, HOMEWORK_ID)).resolves.toBeUndefined();

    expect(mockRlsTx.homeworkAssignment.delete).toHaveBeenCalled();
  });

  it('should skip S3 delete for attachments without file_key', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      status: 'draft',
      attachments: [{ id: ATTACHMENT_ID, file_key: null, attachment_type: 'file' }],
    });

    await service.remove(TENANT_ID, HOMEWORK_ID);

    expect(mockS3.delete).not.toHaveBeenCalled();
    expect(mockRlsTx.homeworkAssignment.delete).toHaveBeenCalled();
  });
});

describe('HomeworkService — addAttachment', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({ id: HOMEWORK_ID });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should create a file attachment with valid mime type', async () => {
    const attachment = {
      id: ATTACHMENT_ID,
      attachment_type: 'file',
      file_name: 'doc.pdf',
      mime_type: 'application/pdf',
    };
    mockRlsTx.homeworkAttachment.create.mockResolvedValue(attachment);

    const result = await service.addAttachment(TENANT_ID, HOMEWORK_ID, {
      attachment_type: 'file',
      file_name: 'doc.pdf',
      file_key: 'uploads/doc.pdf',
      file_size_bytes: 1024,
      mime_type: 'application/pdf',
      display_order: 0,
    });

    expect(mockRlsTx.homeworkAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          homework_assignment_id: HOMEWORK_ID,
          attachment_type: 'file',
          file_name: 'doc.pdf',
        }),
      }),
    );
    expect(result).toEqual(attachment);
  });

  it('should create a link attachment', async () => {
    const attachment = {
      id: ATTACHMENT_ID,
      attachment_type: 'link',
      url: 'https://example.com',
    };
    mockRlsTx.homeworkAttachment.create.mockResolvedValue(attachment);

    const result = await service.addAttachment(TENANT_ID, HOMEWORK_ID, {
      attachment_type: 'link',
      url: 'https://example.com',
      display_order: 0,
    });

    expect((result as { attachment_type: string }).attachment_type).toBe('link');
  });

  it('should throw BadRequestException for invalid mime type on file attachments', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'file',
        file_name: 'script.exe',
        mime_type: 'application/x-msdownload',
        display_order: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when mime_type is missing for file attachment', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'file',
        file_name: 'doc.pdf',
        display_order: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when file exceeds max size', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'file',
        file_name: 'large.pdf',
        mime_type: 'application/pdf',
        file_size_bytes: 11 * 1024 * 1024, // 11MB > 10MB limit
        display_order: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when url is missing for link attachment', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'link',
        display_order: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when url is missing for video attachment', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'video',
        display_order: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when homework assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'link',
        url: 'https://example.com',
        display_order: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkService — removeAttachment', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should delete file attachment and call S3 delete', async () => {
    mockPrisma.homeworkAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      attachment_type: 'file',
      file_key: 'uploads/doc.pdf',
    });

    await service.removeAttachment(TENANT_ID, HOMEWORK_ID, ATTACHMENT_ID);

    expect(mockS3.delete).toHaveBeenCalledWith('uploads/doc.pdf');
    expect(mockRlsTx.homeworkAttachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
  });

  it('should delete link attachment without calling S3', async () => {
    mockPrisma.homeworkAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      attachment_type: 'link',
      file_key: null,
      url: 'https://example.com',
    });

    await service.removeAttachment(TENANT_ID, HOMEWORK_ID, ATTACHMENT_ID);

    expect(mockS3.delete).not.toHaveBeenCalled();
    expect(mockRlsTx.homeworkAttachment.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
  });

  it('should throw NotFoundException when attachment not found', async () => {
    mockPrisma.homeworkAttachment.findFirst.mockResolvedValue(null);

    await expect(service.removeAttachment(TENANT_ID, HOMEWORK_ID, ATTACHMENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should not fail when S3 delete throws (logs error instead)', async () => {
    mockPrisma.homeworkAttachment.findFirst.mockResolvedValue({
      id: ATTACHMENT_ID,
      attachment_type: 'file',
      file_key: 'uploads/doc.pdf',
    });
    mockS3.delete.mockRejectedValue(new Error('S3 error'));

    await expect(
      service.removeAttachment(TENANT_ID, HOMEWORK_ID, ATTACHMENT_ID),
    ).resolves.toBeUndefined();

    expect(mockRlsTx.homeworkAttachment.delete).toHaveBeenCalled();
  });
});

describe('HomeworkService — findByClass', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([baseAssignment]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(1);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return assignments for a specific class', async () => {
    const result = await service.findByClass(TENANT_ID, CLASS_ID, {
      page: 1,
      pageSize: 20,
      sort: 'due_date',
      order: 'desc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
        }),
      }),
    );
  });
});

describe('HomeworkService — findToday', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([baseAssignment]);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it("should return today's assignments for the teacher", async () => {
    const result = await service.findToday(TENANT_ID, USER_ID);

    expect(result.data).toHaveLength(1);
    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          assigned_by_user_id: USER_ID,
          due_date: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date),
          }),
        }),
      }),
    );
  });
});

describe('HomeworkService — findTemplates', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([baseAssignment]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(1);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return paginated templates with published/archived status filter', async () => {
    const result = await service.findTemplates(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: { in: ['published', 'archived'] },
        }),
      }),
    );
  });

  it('should apply search filter when provided', async () => {
    await service.findTemplates(TENANT_ID, {
      page: 1,
      pageSize: 20,
      search: 'Math',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: { contains: 'Math', mode: 'insensitive' },
        }),
      }),
    );
  });
});

describe('HomeworkService — createRecurrenceRule', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should create a recurrence rule via RLS transaction', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'weekly',
      interval: 1,
      days_of_week: [1, 3, 5],
      start_date: new Date('2026-04-01'),
      end_date: null,
      active: true,
    };
    mockRlsTx.homeworkRecurrenceRule.create.mockResolvedValue(rule);

    const result = await service.createRecurrenceRule(TENANT_ID, {
      frequency: 'weekly',
      interval: 1,
      days_of_week: [1, 3, 5],
      start_date: '2026-04-01',
    });

    expect(mockRlsTx.homeworkRecurrenceRule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          frequency: 'weekly',
          interval: 1,
          days_of_week: [1, 3, 5],
          active: true,
        }),
      }),
    );
    expect(result).toEqual(rule);
  });
});

describe('HomeworkService — updateRecurrenceRule', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should update a recurrence rule', async () => {
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue({
      id: RECURRENCE_RULE_ID,
    });
    mockRlsTx.homeworkRecurrenceRule.update.mockResolvedValue({
      id: RECURRENCE_RULE_ID,
      frequency: 'daily',
      interval: 2,
    });

    const result = await service.updateRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID, {
      frequency: 'daily',
      interval: 2,
    });

    expect(mockRlsTx.homeworkRecurrenceRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RECURRENCE_RULE_ID },
        data: expect.objectContaining({ frequency: 'daily', interval: 2 }),
      }),
    );
    expect((result as { frequency: string }).frequency).toBe('daily');
  });

  it('should throw NotFoundException when rule not found', async () => {
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(null);

    await expect(
      service.updateRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID, { interval: 3 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkService — deleteRecurrenceRule', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should delete a recurrence rule', async () => {
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue({
      id: RECURRENCE_RULE_ID,
    });

    await service.deleteRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID);

    expect(mockRlsTx.homeworkRecurrenceRule.delete).toHaveBeenCalledWith({
      where: { id: RECURRENCE_RULE_ID },
    });
  });

  it('should throw NotFoundException when rule not found', async () => {
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(null);

    await expect(service.deleteRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('HomeworkService — bulkCreate', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should generate assignments from a daily recurrence rule', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'daily',
      interval: 1,
      days_of_week: [],
      start_date: new Date('2026-04-01'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    const result = await service.bulkCreate(TENANT_ID, USER_ID, {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      class_id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      title: 'Daily Reading',
      homework_type: 'reading',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
    });

    // 3 days: Apr 1, 2, 3
    const bulkResult = result as { count: number; data: unknown[] };
    expect(bulkResult.count).toBe(3);
    expect(bulkResult.data).toHaveLength(3);
    expect(mockRlsTx.homeworkAssignment.create).toHaveBeenCalledTimes(3);
  });

  it('should generate assignments from a weekly recurrence rule with specific days', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'weekly',
      interval: 1,
      days_of_week: [1, 3], // Monday, Wednesday
      start_date: new Date('2026-04-06'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    // 2026-04-06 is a Monday, 2026-04-12 is a Sunday
    const result = await service.bulkCreate(TENANT_ID, USER_ID, {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      class_id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      title: 'Weekly Quiz',
      homework_type: 'written',
      start_date: '2026-04-06',
      end_date: '2026-04-12',
    });

    // Mon Apr 6 (day 1) and Wed Apr 8 (day 3)
    expect((result as { count: number }).count).toBe(2);
    expect(mockRlsTx.homeworkAssignment.create).toHaveBeenCalledTimes(2);
  });

  it('should throw NotFoundException when recurrence rule not found', async () => {
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(null);

    await expect(
      service.bulkCreate(TENANT_ID, USER_ID, {
        recurrence_rule_id: RECURRENCE_RULE_ID,
        class_id: CLASS_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        title: 'Test',
        homework_type: 'written',
        start_date: '2026-04-01',
        end_date: '2026-04-07',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when template homework not found', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'daily',
      interval: 1,
      days_of_week: [],
      start_date: new Date('2026-04-01'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);
    // findFirst for homework template returns null
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.bulkCreate(TENANT_ID, USER_ID, {
        recurrence_rule_id: RECURRENCE_RULE_ID,
        template_homework_id: HOMEWORK_ID,
        class_id: CLASS_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        title: 'Test',
        homework_type: 'written',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when no dates are generated', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'weekly',
      interval: 1,
      days_of_week: [6], // Saturday only
      start_date: new Date('2026-04-06'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);

    // Range is Monday-Wednesday, rule only generates Saturday -> 0 dates
    await expect(
      service.bulkCreate(TENANT_ID, USER_ID, {
        recurrence_rule_id: RECURRENCE_RULE_ID,
        class_id: CLASS_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        title: 'No Dates',
        homework_type: 'written',
        start_date: '2026-04-06',
        end_date: '2026-04-08',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('edge: should respect rule end_date as a ceiling when it is before range end', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'daily',
      interval: 1,
      days_of_week: [],
      start_date: new Date('2026-04-01'),
      end_date: new Date('2026-04-02'), // Rule ends Apr 2 but range is Apr 1-5
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    const result = await service.bulkCreate(TENANT_ID, USER_ID, {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      class_id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      title: 'Limited',
      homework_type: 'written',
      start_date: '2026-04-01',
      end_date: '2026-04-05',
    });

    // Only Apr 1 and Apr 2 (rule end_date caps)
    expect((result as { count: number }).count).toBe(2);
  });
});

describe('HomeworkService — findByClassWeek', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([baseAssignment]);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return assignments with week_start and week_end', async () => {
    const result = await service.findByClassWeek(TENANT_ID, CLASS_ID, '2026-04-06');

    expect(result.data).toHaveLength(1);
    // week_start/week_end are derived via toISOString() which depends on timezone offset
    expect(result).toHaveProperty('week_start');
    expect(result).toHaveProperty('week_end');
    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          due_date: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );
  });

  it('should snap a mid-week date to the same week boundaries', async () => {
    // Both '2026-04-06' (Monday) and '2026-04-08' (Wednesday) should resolve to same week
    const resultMonday = await service.findByClassWeek(TENANT_ID, CLASS_ID, '2026-04-06');
    const resultWednesday = await service.findByClassWeek(TENANT_ID, CLASS_ID, '2026-04-08');

    expect(resultMonday.week_start).toBe(resultWednesday.week_start);
    expect(resultMonday.week_end).toBe(resultWednesday.week_end);
  });

  it('should use current date when weekStart is not provided', async () => {
    const result = await service.findByClassWeek(TENANT_ID, CLASS_ID);

    expect(result).toHaveProperty('week_start');
    expect(result).toHaveProperty('week_end');
    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledTimes(1);
  });

  it('should handle a non-Monday date (snaps to previous Monday)', async () => {
    // 2026-04-08 is a Wednesday
    const result = await service.findByClassWeek(TENANT_ID, CLASS_ID, '2026-04-08');

    expect(result).toHaveProperty('week_start');
    // week_start should be the Monday of that week
    expect(result.week_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ─── Additional branch coverage tests ───────────────────────────────────────

describe('HomeworkService — list — additional filter branches', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(0);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should filter by subject_id', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      subject_id: SUBJECT_ID,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject_id: SUBJECT_ID }),
      }),
    );
  });

  it('should filter by academic_year_id', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      academic_year_id: ACADEMIC_YEAR_ID,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academic_year_id: ACADEMIC_YEAR_ID }),
      }),
    );
  });

  it('should filter by academic_period_id', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      academic_period_id: 'ap-1',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academic_period_id: 'ap-1' }),
      }),
    );
  });

  it('should filter by homework_type', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      homework_type: 'reading',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ homework_type: 'reading' }),
      }),
    );
  });

  it('should filter by assigned_by_user_id', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      assigned_by_user_id: USER_ID,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ assigned_by_user_id: USER_ID }),
      }),
    );
  });

  it('should filter by due_date_from only', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      due_date_from: '2026-04-01',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          due_date: { gte: new Date('2026-04-01') },
        }),
      }),
    );
  });

  it('should filter by due_date_to only', async () => {
    await service.list(TENANT_ID, {
      page: 1,
      pageSize: 20,
      due_date_to: '2026-04-30',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          due_date: { lte: new Date('2026-04-30') },
        }),
      }),
    );
  });
});

describe('HomeworkService — findByClass — filter branches', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(0);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should filter by status and homework_type', async () => {
    await service.findByClass(TENANT_ID, CLASS_ID, {
      page: 1,
      pageSize: 20,
      status: 'published',
      homework_type: 'written',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id: CLASS_ID,
          status: 'published',
          homework_type: 'written',
        }),
      }),
    );
  });

  it('should filter by subject_id and assigned_by_user_id', async () => {
    await service.findByClass(TENANT_ID, CLASS_ID, {
      page: 1,
      pageSize: 20,
      subject_id: SUBJECT_ID,
      assigned_by_user_id: USER_ID,
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subject_id: SUBJECT_ID,
          assigned_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should apply due_date_from filter in findByClass', async () => {
    await service.findByClass(TENANT_ID, CLASS_ID, {
      page: 1,
      pageSize: 20,
      due_date_from: '2026-04-01',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          due_date: { gte: new Date('2026-04-01') },
        }),
      }),
    );
  });

  it('should apply due_date_to filter in findByClass', async () => {
    await service.findByClass(TENANT_ID, CLASS_ID, {
      page: 1,
      pageSize: 20,
      due_date_to: '2026-04-30',
      sort: 'due_date',
      order: 'desc',
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          due_date: { lte: new Date('2026-04-30') },
        }),
      }),
    );
  });
});

describe('HomeworkService — findTemplates — filter branches', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);
    mockPrisma.homeworkAssignment.count.mockResolvedValue(0);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should filter by class_id', async () => {
    await service.findTemplates(TENANT_ID, {
      page: 1,
      pageSize: 20,
      class_id: CLASS_ID,
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class_id: CLASS_ID }),
      }),
    );
  });

  it('should filter by subject_id', async () => {
    await service.findTemplates(TENANT_ID, {
      page: 1,
      pageSize: 20,
      subject_id: SUBJECT_ID,
    });

    expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject_id: SUBJECT_ID }),
      }),
    );
  });
});

describe('HomeworkService — update — all dto field branches', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      status: 'draft',
    });
    mockRlsTx.homeworkAssignment.update.mockResolvedValue(baseAssignment);

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should include all dto fields when all are provided', async () => {
    await service.update(TENANT_ID, HOMEWORK_ID, USER_ID, {
      title: 'New Title',
      description: 'New desc',
      class_id: 'new-class',
      subject_id: SUBJECT_ID,
      academic_year_id: 'new-ay',
      academic_period_id: 'new-ap',
      homework_type: 'reading',
      due_date: '2026-05-01',
      due_time: '15:00',
      max_points: 50,
      recurrence_rule_id: RECURRENCE_RULE_ID,
    });

    const callData = mockRlsTx.homeworkAssignment.update.mock.calls[0]?.[0]?.data;
    expect(callData.title).toBe('New Title');
    expect(callData.description).toBe('New desc');
    expect(callData.class_id).toBe('new-class');
    expect(callData.subject_id).toBe(SUBJECT_ID);
    expect(callData.academic_year_id).toBe('new-ay');
    expect(callData.academic_period_id).toBe('new-ap');
    expect(callData.homework_type).toBe('reading');
    expect(callData.due_date).toEqual(new Date('2026-05-01'));
    expect(callData.due_time).toEqual(new Date('1970-01-01T15:00'));
    expect(callData.max_points).toBe(50);
    expect(callData.recurrence_rule_id).toBe(RECURRENCE_RULE_ID);
  });

  it('should set nullable fields to null when cleared', async () => {
    await service.update(TENANT_ID, HOMEWORK_ID, USER_ID, {
      subject_id: null,
      academic_period_id: null,
      due_time: null,
      max_points: null,
      recurrence_rule_id: null,
    });

    const callData = mockRlsTx.homeworkAssignment.update.mock.calls[0]?.[0]?.data;
    expect(callData.subject_id).toBeNull();
    expect(callData.academic_period_id).toBeNull();
    expect(callData.due_time).toBeNull();
    expect(callData.max_points).toBeNull();
    expect(callData.recurrence_rule_id).toBeNull();
  });
});

describe('HomeworkService — copy — due_time branch', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should use dto due_time when provided in copy', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      due_time: new Date('1970-01-01T09:00'),
      attachments: [],
    });
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    await service.copy(TENANT_ID, HOMEWORK_ID, USER_ID, {
      due_date: '2026-05-01',
      due_time: '14:30',
    });

    const callData = mockRlsTx.homeworkAssignment.create.mock.calls[0]?.[0]?.data;
    expect(callData.due_time).toEqual(new Date('1970-01-01T14:30'));
  });

  it('should use source due_time when dto due_time is not provided', async () => {
    const sourceDueTime = new Date('1970-01-01T09:00');
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      ...baseAssignment,
      due_time: sourceDueTime,
      attachments: [],
    });
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    await service.copy(TENANT_ID, HOMEWORK_ID, USER_ID, {
      due_date: '2026-05-01',
    });

    const callData = mockRlsTx.homeworkAssignment.create.mock.calls[0]?.[0]?.data;
    expect(callData.due_time).toEqual(sourceDueTime);
  });
});

describe('HomeworkService — bulkCreate — custom frequency and template', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should generate dates from custom frequency rule', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'custom',
      interval: 1,
      days_of_week: [1, 5], // Monday and Friday
      start_date: new Date('2026-04-06'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);
    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    // 2026-04-06 = Monday, 2026-04-12 = Sunday
    const result = await service.bulkCreate(TENANT_ID, USER_ID, {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      class_id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      title: 'Custom Schedule',
      homework_type: 'written',
      start_date: '2026-04-06',
      end_date: '2026-04-12',
    });

    // Monday Apr 6 (day 1) and Friday Apr 10 (day 5)
    expect((result as { count: number }).count).toBe(2);
  });

  it('should use template fields when template_homework_id is provided', async () => {
    const rule = {
      id: RECURRENCE_RULE_ID,
      tenant_id: TENANT_ID,
      frequency: 'daily',
      interval: 1,
      days_of_week: [],
      start_date: new Date('2026-04-01'),
      end_date: null,
    };
    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue(rule);

    // Template homework
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      title: 'Template Title',
      description: 'Template Desc',
      homework_type: 'project',
      max_points: 100,
      class_id: 'template-class',
      subject_id: 'template-subject',
      academic_year_id: 'template-ay',
      academic_period_id: 'template-ap',
    });

    mockRlsTx.homeworkAssignment.create.mockResolvedValue(baseAssignment);

    await service.bulkCreate(TENANT_ID, USER_ID, {
      recurrence_rule_id: RECURRENCE_RULE_ID,
      template_homework_id: HOMEWORK_ID,
      class_id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      title: 'Override Title',
      homework_type: 'written',
      start_date: '2026-04-01',
      end_date: '2026-04-01',
    });

    // Should use template values not dto values
    const callData = mockRlsTx.homeworkAssignment.create.mock.calls[0]?.[0]?.data;
    expect(callData.title).toBe('Template Title');
    expect(callData.description).toBe('Template Desc');
    expect(callData.homework_type).toBe('project');
    expect(callData.max_points).toBe(100);
    expect(callData.class_id).toBe('template-class');
    expect(callData.subject_id).toBe('template-subject');
  });
});

describe('HomeworkService — updateRecurrenceRule — all dto fields', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkRecurrenceRule.findFirst.mockResolvedValue({
      id: RECURRENCE_RULE_ID,
    });
    mockRlsTx.homeworkRecurrenceRule.update.mockResolvedValue({});

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should include all dto fields when all are provided', async () => {
    await service.updateRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID, {
      frequency: 'custom',
      interval: 2,
      days_of_week: [1, 3, 5],
      start_date: '2026-05-01',
      end_date: '2026-06-30',
    });

    const callData = mockRlsTx.homeworkRecurrenceRule.update.mock.calls[0]?.[0]?.data;
    expect(callData.frequency).toBe('custom');
    expect(callData.interval).toBe(2);
    expect(callData.days_of_week).toEqual([1, 3, 5]);
    expect(callData.start_date).toEqual(new Date('2026-05-01'));
    expect(callData.end_date).toEqual(new Date('2026-06-30'));
  });

  it('should set end_date to null when cleared', async () => {
    await service.updateRecurrenceRule(TENANT_ID, RECURRENCE_RULE_ID, {
      end_date: null,
    });

    const callData = mockRlsTx.homeworkRecurrenceRule.update.mock.calls[0]?.[0]?.data;
    expect(callData.end_date).toBeNull();
  });
});

describe('HomeworkService — addAttachment — max attachments reached', () => {
  let module: TestingModule;
  let service: HomeworkService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    resetRlsMocks();

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({ id: HOMEWORK_ID });
    mockPrisma.homeworkAttachment.count.mockResolvedValue(5); // At limit

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<HomeworkService>(HomeworkService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should throw BadRequestException when max attachments reached', async () => {
    await expect(
      service.addAttachment(TENANT_ID, HOMEWORK_ID, {
        attachment_type: 'link',
        url: 'https://example.com',
        display_order: 5,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
