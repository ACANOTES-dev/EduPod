import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';

import {
  CreateTemplateDto,
  ReportCardTemplateService,
  TemplateSectionConfig,
} from './report-card-template.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEMPLATE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardTemplate: {
    updateMany: jest.fn(),
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

const mockGdprTokenService = {
  processOutbound: jest.fn().mockResolvedValue({
    processedData: { entities: [], entityCount: 0 },
    tokenMap: null,
  }),
  processInbound: jest.fn().mockImplementation(async (_tenantId: string, response: string) => response),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCardTemplate: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const sampleSections: TemplateSectionConfig[] = [
  { id: 'header', type: 'header', order: 1, style_variant: 'centered', enabled: true, config: {} },
  {
    id: 'grades_table',
    type: 'grades_table',
    order: 2,
    style_variant: 'expanded',
    enabled: true,
    config: {},
  },
];

const baseTemplate = {
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  name: 'Standard Template',
  locale: 'en',
  is_default: false,
  sections_json: sampleSections,
  branding_overrides_json: null,
  created_by_user_id: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── create ───────────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — create', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardTemplate.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.reportCardTemplate.create.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a template successfully', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const dto: CreateTemplateDto = {
      name: 'Standard Template',
      locale: 'en',
      sections_json: sampleSections,
    };

    await service.create(TENANT_ID, USER_ID, dto);

    expect(mockRlsTx.reportCardTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: 'Standard Template',
          locale: 'en',
          is_default: false,
          created_by_user_id: USER_ID,
        }),
      }),
    );
  });

  it('should clear other defaults when is_default is true', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    await service.create(TENANT_ID, USER_ID, {
      name: 'New Default',
      locale: 'en',
      sections_json: sampleSections,
      is_default: true,
    });

    expect(mockRlsTx.reportCardTemplate.updateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, locale: 'en', is_default: true },
      data: { is_default: false },
    });
  });

  it('should throw ConflictException when name+locale already exists', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(baseTemplate);

    await expect(
      service.create(TENANT_ID, USER_ID, {
        name: 'Standard Template',
        locale: 'en',
        sections_json: sampleSections,
      }),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── findAll ──────────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — findAll', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated templates with meta', async () => {
    mockPrisma.reportCardTemplate.findMany.mockResolvedValue([baseTemplate]);
    mockPrisma.reportCardTemplate.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by locale when provided', async () => {
    mockPrisma.reportCardTemplate.findMany.mockResolvedValue([]);
    mockPrisma.reportCardTemplate.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, locale: 'ar' });

    expect(mockPrisma.reportCardTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_ID, locale: 'ar' }),
      }),
    );
  });
});

// ─── findOne ──────────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — findOne', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the template when found', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(baseTemplate);

    const result = await service.findOne(TENANT_ID, TEMPLATE_ID);

    expect(result.id).toBe(TEMPLATE_ID);
  });

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — update', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardTemplate.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.reportCardTemplate.update.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update template name successfully', async () => {
    mockPrisma.reportCardTemplate.findFirst
      .mockResolvedValueOnce({ id: TEMPLATE_ID, locale: 'en' })
      .mockResolvedValueOnce(null); // no name conflict

    await service.update(TENANT_ID, TEMPLATE_ID, { name: 'Renamed' });

    expect(mockRlsTx.reportCardTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ name: 'Renamed' }),
      }),
    );
  });

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, TEMPLATE_ID, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when renaming to an existing name', async () => {
    mockPrisma.reportCardTemplate.findFirst
      .mockResolvedValueOnce({ id: TEMPLATE_ID, locale: 'en' })
      .mockResolvedValueOnce({ id: 'other-template' }); // conflict

    await expect(
      service.update(TENANT_ID, TEMPLATE_ID, { name: 'Conflict Name' }),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — remove', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardTemplate.delete.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delete the template and return { deleted: true }', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });

    const result = await service.remove(TENANT_ID, TEMPLATE_ID);

    expect(result).toEqual({ deleted: true });
    expect(mockRlsTx.reportCardTemplate.delete).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
    });
  });

  it('should throw NotFoundException when template not found', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, TEMPLATE_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── setDefault ───────────────────────────────────────────────────────────────

describe('ReportCardTemplateService — setDefault', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCardTemplate.updateMany.mockReset().mockResolvedValue({ count: 1 });
    mockRlsTx.reportCardTemplate.update
      .mockReset()
      .mockResolvedValue({ ...baseTemplate, is_default: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should clear old defaults then set the new default', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({ id: TEMPLATE_ID });

    const result = await service.setDefault(TENANT_ID, TEMPLATE_ID, 'en');

    expect(mockRlsTx.reportCardTemplate.updateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, locale: 'en', is_default: true },
      data: { is_default: false },
    });
    expect(mockRlsTx.reportCardTemplate.update).toHaveBeenCalledWith({
      where: { id: TEMPLATE_ID },
      data: { is_default: true },
    });
    expect(result).toMatchObject({ is_default: true });
  });

  it('should throw NotFoundException when template/locale not found', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    await expect(service.setDefault(TENANT_ID, TEMPLATE_ID, 'en')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── convertFromImage ─────────────────────────────────────────────────────────

describe('ReportCardTemplateService — convertFromImage', () => {
  let service: ReportCardTemplateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    // create flow inside convertFromImage
    mockRlsTx.reportCardTemplate.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.reportCardTemplate.create.mockReset().mockResolvedValue(baseTemplate);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when Anthropic client is not configured', async () => {
    // Service constructed without ANTHROPIC_API_KEY — anthropic is null
    await expect(
      service.convertFromImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw ConflictException when monthly rate limit is reached', async () => {
    // Inject a mock anthropic client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).anthropic = {
      messages: { create: jest.fn() },
    };
    mockPrisma.reportCardTemplate.count.mockResolvedValue(10); // at limit

    await expect(
      service.convertFromImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ConflictException);
  });

  it('should call Anthropic and save a draft template when AI succeeds', async () => {
    const mockSections = [
      { id: 's1', type: 'header', order: 1, style_variant: 'centered', enabled: true, config: {} },
    ];

    const mockAnthropicClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(mockSections) }],
        }),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).anthropic = mockAnthropicClient;

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0); // under limit
    // create inside findFirst check: no duplicate
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const result = await service.convertFromImage(
      TENANT_ID,
      USER_ID,
      Buffer.from('imagedata'),
      'image/jpeg',
    );

    expect(mockAnthropicClient.messages.create).toHaveBeenCalled();
    expect(result).toHaveProperty('template');
    expect(result).toHaveProperty('sections_json');
    expect(result.sections_json).toEqual(mockSections);
  });

  it('should log AI processing to audit trail', async () => {
    const mockSections = [
      { id: 's1', type: 'header', order: 1, style_variant: 'centered', enabled: true, config: {} },
    ];

    const mockAnthropicClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify(mockSections) }],
        }),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).anthropic = mockAnthropicClient;

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0);
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
      ],
    }).compile();

    const svc = module.get<ReportCardTemplateService>(ReportCardTemplateService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).anthropic = mockAnthropicClient;

    await svc.convertFromImage(TENANT_ID, USER_ID, Buffer.from('imagedata'), 'image/jpeg');

    const mockAuditService = module.get(AiAuditService);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_template_conversion',
        tokenised: true,
      }),
    );
  });

  it('should fall back to default sections when AI returns invalid JSON', async () => {
    const mockAnthropicClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'NOT JSON {{{{' }],
        }),
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).anthropic = mockAnthropicClient;

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0);
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const result = await service.convertFromImage(
      TENANT_ID,
      USER_ID,
      Buffer.from('bad'),
      'image/jpeg',
    );

    // Default sections include header, student_info, grades_table, attendance_summary, teacher_comment
    expect(result.sections_json.length).toBeGreaterThanOrEqual(1);
    expect(result.sections_json[0]).toHaveProperty('type');
  });
});
