import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../../ai/anthropic-client.service';
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
  processInbound: jest
    .fn()
    .mockImplementation(async (_tenantId: string, response: string) => response),
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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

    await expect(service.update(TENANT_ID, TEMPLATE_ID, { name: 'Conflict Name' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should update sections_json when provided', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      locale: 'en',
    });

    const newSections = [{ type: 'grades', title: 'Grades', visible: true }];
    await service.update(TENANT_ID, TEMPLATE_ID, {
      sections_json: newSections as unknown as TemplateSectionConfig[],
    });

    expect(mockRlsTx.reportCardTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sections_json: newSections,
        }),
      }),
    );
  });

  it('should update branding_overrides_json when provided', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      locale: 'en',
    });

    const brandingOverrides = { logo_url: 'https://example.com/logo.png' };
    await service.update(TENANT_ID, TEMPLATE_ID, {
      branding_overrides_json: brandingOverrides,
    });

    expect(mockRlsTx.reportCardTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branding_overrides_json: brandingOverrides,
        }),
      }),
    );
  });

  it('should clear branding_overrides_json to JsonNull when set to null', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      locale: 'en',
    });

    await service.update(TENANT_ID, TEMPLATE_ID, {
      branding_overrides_json: null,
    });

    expect(mockRlsTx.reportCardTemplate.update).toHaveBeenCalledTimes(1);
  });

  it('should clear other defaults when is_default is set to true', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue({
      id: TEMPLATE_ID,
      locale: 'en',
    });

    await service.update(TENANT_ID, TEMPLATE_ID, { is_default: true });

    expect(mockRlsTx.reportCardTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          locale: 'en',
          is_default: true,
          id: { not: TEMPLATE_ID },
        }),
        data: { is_default: false },
      }),
    );
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw ServiceUnavailableException when Anthropic client is not configured', async () => {
    // Override isConfigured to false
    (service['anthropicClient'] as unknown as { isConfigured: boolean }).isConfigured = false;

    await expect(
      service.convertFromImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('should throw ConflictException when monthly rate limit is reached', async () => {
    mockPrisma.reportCardTemplate.count.mockResolvedValue(10); // at limit

    await expect(
      service.convertFromImage(TENANT_ID, USER_ID, Buffer.from('img'), 'image/jpeg'),
    ).rejects.toThrow(ConflictException);
  });

  it('should call Anthropic and save a draft template when AI succeeds', async () => {
    const mockSections = [
      { id: 's1', type: 'header', order: 1, style_variant: 'centered', enabled: true, config: {} },
    ];

    const mockCreateMessage = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockSections) }],
    });

    const module2: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockCreateMessage },
        },
      ],
    }).compile();

    const svc = module2.get<ReportCardTemplateService>(ReportCardTemplateService);

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0); // under limit
    // create inside findFirst check: no duplicate
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const result = await svc.convertFromImage(
      TENANT_ID,
      USER_ID,
      Buffer.from('imagedata'),
      'image/jpeg',
    );

    expect(mockCreateMessage).toHaveBeenCalled();
    expect(result).toHaveProperty('template');
    expect(result).toHaveProperty('sections_json');
    expect(result.sections_json).toEqual(mockSections);
  });

  it('should log AI processing to audit trail', async () => {
    const mockSections = [
      { id: 's1', type: 'header', order: 1, style_variant: 'centered', enabled: true, config: {} },
    ];

    const mockCreateMessage = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockSections) }],
    });

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0);
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const module2: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockCreateMessage },
        },
      ],
    }).compile();

    const svc = module2.get<ReportCardTemplateService>(ReportCardTemplateService);

    await svc.convertFromImage(TENANT_ID, USER_ID, Buffer.from('imagedata'), 'image/jpeg');

    const mockAuditService = module2.get(AiAuditService);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_template_conversion',
        tokenised: true,
      }),
    );
  });

  it('should fall back to default sections when AI returns invalid JSON', async () => {
    const mockCreateMessage = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'NOT JSON {{{{' }],
    });

    const module2: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        {
          provide: AnthropicClientService,
          useValue: { isConfigured: true, createMessage: mockCreateMessage },
        },
      ],
    }).compile();

    const svc = module2.get<ReportCardTemplateService>(ReportCardTemplateService);

    mockPrisma.reportCardTemplate.count.mockResolvedValue(0);
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const result = await svc.convertFromImage(TENANT_ID, USER_ID, Buffer.from('bad'), 'image/jpeg');

    // Default sections include header, student_info, grades_table, attendance_summary, teacher_comment
    expect(result.sections_json.length).toBeGreaterThanOrEqual(1);
    expect(result.sections_json[0]).toHaveProperty('type');
  });
});

// ─── listContentScopes (impl 03) ─────────────────────────────────────────────

describe('ReportCardTemplateService — listContentScopes', () => {
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('groups templates by design_key and exposes a flat locales list for backwards compatibility', async () => {
    mockPrisma.reportCardTemplate.findMany.mockResolvedValue([
      {
        id: 'ea-en',
        name: 'Editorial Academic',
        locale: 'en',
        is_default: true,
        content_scope: 'grades_only',
        branding_overrides_json: { design_key: 'editorial-academic' },
      },
      {
        id: 'ea-ar',
        name: 'Editorial Academic',
        locale: 'ar',
        is_default: false,
        content_scope: 'grades_only',
        branding_overrides_json: { design_key: 'editorial-academic' },
      },
      {
        id: 'me-en',
        name: 'Modern Editorial',
        locale: 'en',
        is_default: false,
        content_scope: 'grades_only',
        branding_overrides_json: { design_key: 'modern-editorial' },
      },
      {
        id: 'me-ar',
        name: 'Modern Editorial',
        locale: 'ar',
        is_default: false,
        content_scope: 'grades_only',
        branding_overrides_json: { design_key: 'modern-editorial' },
      },
    ]);

    const result = await service.listContentScopes(TENANT_ID);

    const gradesOnly = result.find((r) => r.content_scope === 'grades_only');
    expect(gradesOnly).toBeDefined();
    // Flat list still contains every row — consumers migrating to the new
    // shape can rely on `designs` but legacy callers keep working.
    expect(gradesOnly?.locales).toHaveLength(4);
    // Two design entries, one per bundle, each with both locales nested.
    expect(gradesOnly?.designs).toHaveLength(2);
    const ea = gradesOnly?.designs.find((d) => d.design_key === 'editorial-academic');
    const me = gradesOnly?.designs.find((d) => d.design_key === 'modern-editorial');
    expect(ea?.name).toBe('Editorial Academic');
    expect(ea?.is_default).toBe(true);
    expect(ea?.preview_pdf_url).toBe('/report-card-previews/editorial-academic-en.pdf');
    expect(ea?.locales.map((l) => l.locale).sort()).toEqual(['ar', 'en']);
    expect(me?.is_default).toBe(false);
    expect(me?.locales.map((l) => l.locale).sort()).toEqual(['ar', 'en']);
    expect(gradesOnly?.is_available).toBe(true);
    expect(gradesOnly?.is_default).toBe(true);
  });

  it('marks non-grades_only scopes as is_available: false with empty locales', async () => {
    mockPrisma.reportCardTemplate.findMany.mockResolvedValue([
      {
        id: 't-en',
        name: 'Editorial Academic',
        locale: 'en',
        is_default: true,
        content_scope: 'grades_only',
        branding_overrides_json: { design_key: 'editorial-academic' },
      },
    ]);

    const result = await service.listContentScopes(TENANT_ID);
    const unavailable = result.filter((r) => !r.is_available);

    expect(unavailable.length).toBeGreaterThan(0);
    unavailable.forEach((row) => {
      expect(row.locales).toEqual([]);
      expect(row.content_scope).not.toBe('grades_only');
    });
  });

  it('returns grades_only as the first entry with is_available: true', async () => {
    mockPrisma.reportCardTemplate.findMany.mockResolvedValue([]);

    const result = await service.listContentScopes(TENANT_ID);

    expect(result[0]?.content_scope).toBe('grades_only');
    expect(result[0]?.is_available).toBe(true);
  });
});

// ─── resolveForGeneration (impl 03) ──────────────────────────────────────────

describe('ReportCardTemplateService — resolveForGeneration', () => {
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
        {
          provide: AnthropicClientService,
          useValue: {
            isConfigured: true,
            createMessage: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: '[]' }] }),
          },
        },
      ],
    }).compile();

    service = module.get<ReportCardTemplateService>(ReportCardTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns the default English template when one exists', async () => {
    const enTemplate = { ...baseTemplate, id: 't-en', locale: 'en', is_default: true };
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValueOnce(enTemplate);

    const result = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'en',
    });

    expect(result?.id).toBe('t-en');
    expect(mockPrisma.reportCardTemplate.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenant_id: TENANT_ID,
        content_scope: 'grades_only',
        locale: 'en',
        is_default: true,
      }),
    });
  });

  it('falls back to a non-default row when no default is set for the locale', async () => {
    mockPrisma.reportCardTemplate.findFirst
      .mockResolvedValueOnce(null) // default lookup misses
      .mockResolvedValueOnce({ ...baseTemplate, id: 't-ar', locale: 'ar' }); // fallback hits

    const result = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'ar',
    });

    expect(result?.id).toBe('t-ar');
    expect(mockPrisma.reportCardTemplate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('returns null when no template exists for the (scope, locale) pair', async () => {
    mockPrisma.reportCardTemplate.findFirst.mockResolvedValue(null);

    const result = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'fr',
    });

    expect(result).toBeNull();
  });

  it('returns null for unavailable scopes without touching the DB', async () => {
    const result = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_homework',
      locale: 'en',
    });

    expect(result).toBeNull();
    expect(mockPrisma.reportCardTemplate.findFirst).not.toHaveBeenCalled();
  });
});
