import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FormTemplatesService } from './form-templates.service';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  engagementFormTemplate: {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    engagementFormTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    engagementFormSubmission: {
      count: jest.fn(),
    },
  };
}

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const baseCreateDto = {
  name: 'Photo Consent',
  description: 'Consent for school photos',
  form_type: 'consent_form' as const,
  consent_type: 'annual' as const,
  fields_json: [
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      field_key: 'agree',
      label: { en: 'I agree' },
      field_type: 'boolean' as const,
      required: true,
      display_order: 1,
    },
  ],
  requires_signature: true,
};

const baseTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Photo Consent',
  description: 'Consent for school photos',
  form_type: 'consent_form',
  consent_type: 'annual',
  fields_json: baseCreateDto.fields_json,
  requires_signature: true,
  status: 'draft',
  academic_year_id: null,
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FormTemplatesService — create', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset().mockResolvedValue(baseTemplate);
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a form template with RLS transaction', async () => {
    const result = await service.create(TENANT_ID, baseCreateDto, USER_ID);

    expect(result).toEqual(baseTemplate);
    expect(mockRlsTx.engagementFormTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        name: 'Photo Consent',
        form_type: 'consent_form',
        consent_type: 'annual',
        status: 'draft',
        created_by_user_id: USER_ID,
      }),
    });
  });
});

describe('FormTemplatesService — findAll', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated results with filters', async () => {
    const templates = [baseTemplate];
    mockPrisma.engagementFormTemplate.findMany.mockResolvedValue(templates);
    mockPrisma.engagementFormTemplate.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      status: 'draft',
      form_type: 'consent_form',
    });

    expect(result).toEqual({
      data: templates,
      meta: { page: 1, pageSize: 20, total: 1 },
    });
    expect(mockPrisma.engagementFormTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'draft',
          form_type: 'consent_form',
        }),
        skip: 0,
        take: 20,
        orderBy: { created_at: 'desc' },
      }),
    );
  });

  it('should apply no filters when none provided', async () => {
    mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);
    mockPrisma.engagementFormTemplate.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 2, pageSize: 10 });

    expect(mockPrisma.engagementFormTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe('FormTemplatesService — findOne', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return a template by id', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(baseTemplate);

    const result = await service.findOne(TENANT_ID, TEMPLATE_ID);

    expect(result).toEqual(baseTemplate);
    expect(mockPrisma.engagementFormTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID, tenant_id: TENANT_ID },
    });
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('FormTemplatesService — update', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update
      .mockReset()
      .mockResolvedValue({ ...baseTemplate, name: 'Updated' });
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update a template when no submissions exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

    const result = await service.update(TENANT_ID, TEMPLATE_ID, { name: 'Updated' });

    expect(result).toHaveProperty('name', 'Updated');
    expect(mockRlsTx.engagementFormTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { name: 'Updated' },
    });
  });

  it('should reject update when submissions exist (immutability)', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(3);

    await expect(service.update(TENANT_ID, TEMPLATE_ID, { name: 'Updated' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, TEMPLATE_ID, { name: 'Updated' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('FormTemplatesService — delete', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete a draft template with no submissions', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'draft',
    });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

    await service.delete(TENANT_ID, TEMPLATE_ID);

    expect(mockRlsTx.engagementFormTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });
  });

  it('should reject delete when submissions exist (immutability)', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'draft',
    });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(5);

    await expect(service.delete(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should reject delete when template is not in draft status', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'published',
    });

    await expect(service.delete(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    await expect(service.delete(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('FormTemplatesService — publish', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset().mockResolvedValue({
      ...baseTemplate,
      status: 'published',
    });
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should publish a draft template', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'draft',
    });

    const result = await service.publish(TENANT_ID, TEMPLATE_ID);

    expect(result).toHaveProperty('status', 'published');
    expect(mockRlsTx.engagementFormTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { status: 'published' },
    });
  });

  it('should reject publish when template is not in draft status', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'published',
    });

    await expect(service.publish(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should reject publish for archived templates', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'archived',
    });

    await expect(service.publish(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    await expect(service.publish(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('FormTemplatesService — archive', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset().mockResolvedValue({
      ...baseTemplate,
      status: 'archived',
    });
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should archive a published template', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'published',
    });

    const result = await service.archive(TENANT_ID, TEMPLATE_ID);

    expect(result).toHaveProperty('status', 'archived');
    expect(mockRlsTx.engagementFormTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { status: 'archived' },
    });
  });

  it('should reject archive when template is in draft status', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'draft',
    });

    await expect(service.archive(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should reject archive for already-archived templates', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'archived',
    });

    await expect(service.archive(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    await expect(service.archive(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('FormTemplatesService — distribute', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should enqueue a distribute job for a published template', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'published',
    });

    const dto = {
      target_type: 'whole_school' as const,
      deadline: '2026-06-01',
    };

    const result = await service.distribute(TENANT_ID, TEMPLATE_ID, dto);

    expect(result).toEqual({ queued: true });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'engagement:distribute-forms',
      {
        tenant_id: TENANT_ID,
        form_template_id: TEMPLATE_ID,
        target_type: 'whole_school',
        target_ids: undefined,
        deadline: '2026-06-01',
        event_id: undefined,
      },
      { removeOnComplete: 10, removeOnFail: 50 },
    );
  });

  it('should reject distribute when template is not published', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'draft',
    });

    const dto = { target_type: 'whole_school' as const };

    await expect(service.distribute(TENANT_ID, TEMPLATE_ID, dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should throw NotFoundException when template does not exist', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue(null);

    const dto = { target_type: 'whole_school' as const };

    await expect(service.distribute(TENANT_ID, TEMPLATE_ID, dto)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── Additional branch coverage ──────────────────────────────────────────────

describe('FormTemplatesService — findAll — consent_type filter', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should apply consent_type filter when provided', async () => {
    mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);
    mockPrisma.engagementFormTemplate.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      consent_type: 'annual',
    });

    expect(mockPrisma.engagementFormTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consent_type: 'annual',
        }),
      }),
    );
  });

  it('should apply all three filters at once', async () => {
    mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);
    mockPrisma.engagementFormTemplate.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 10,
      status: 'published',
      form_type: 'consent_form',
      consent_type: 'standing',
    });

    expect(mockPrisma.engagementFormTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
          form_type: 'consent_form',
          consent_type: 'standing',
        }),
      }),
    );
  });
});

describe('FormTemplatesService — update — multiple field conditionals', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update
      .mockReset()
      .mockResolvedValue({ ...baseTemplate, name: 'Updated' });
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should set all fields when all provided in update DTO', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

    const fullDto = {
      name: 'New Name',
      description: 'New Desc',
      form_type: 'survey' as const,
      consent_type: 'standing' as const,
      fields_json: [
        {
          id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          field_key: 'q1',
          label: { en: 'Question 1' },
          field_type: 'short_text' as const,
          required: false,
          display_order: 1,
        },
      ],
      requires_signature: false,
      academic_year_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    };

    await service.update(TENANT_ID, TEMPLATE_ID, fullDto);

    expect(mockRlsTx.engagementFormTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: expect.objectContaining({
        name: 'New Name',
        description: 'New Desc',
        form_type: 'survey',
        consent_type: 'standing',
        fields_json: fullDto.fields_json,
        requires_signature: false,
        academic_year_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      }),
    });
  });

  it('should only set fields that are defined in update DTO', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });
    mockPrisma.engagementFormSubmission.count.mockResolvedValue(0);

    await service.update(TENANT_ID, TEMPLATE_ID, { description: 'Only description' });

    expect(mockRlsTx.engagementFormTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { description: 'Only description' },
    });
  });
});

describe('FormTemplatesService — validateTransition — unknown status fallback', () => {
  let service: FormTemplatesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = { add: jest.fn() };

    mockRlsTx.engagementFormTemplate.create.mockReset();
    mockRlsTx.engagementFormTemplate.update.mockReset();
    mockRlsTx.engagementFormTemplate.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('engagement'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<FormTemplatesService>(FormTemplatesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('edge: should throw for transition from unknown status (fallback to empty array)', async () => {
    mockPrisma.engagementFormTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      status: 'unknown_status',
    });

    await expect(service.publish(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(BadRequestException);
  });
});
