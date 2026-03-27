import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  CreateDocumentTemplateDto,
  ListDocumentTemplatesQuery,
  UpdateDocumentTemplateDto,
} from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourDocumentTemplateService } from './behaviour-document-template.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'template-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx = {
  behaviourDocumentTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
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

// ─── Factories ────────────────────────────────────────────────────────────
const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: TEMPLATE_ID,
  tenant_id: TENANT_ID,
  document_type: 'detention_notice',
  name: 'Default Detention Notice',
  locale: 'en',
  template_body: '<p>Dear {{parent_name}}</p>',
  merge_fields: [
    { field_name: 'student_name', source: 'student', description: 'Student full name' },
  ],
  is_active: true,
  is_system: false,
  created_at: new Date('2026-03-01T00:00:00Z'),
  updated_at: new Date('2026-03-01T00:00:00Z'),
  ...overrides,
});

describe('BehaviourDocumentTemplateService', () => {
  let service: BehaviourDocumentTemplateService;
  let mockPrisma: Record<string, unknown>;

  beforeEach(async () => {
    mockPrisma = {};

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourDocumentTemplateService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourDocumentTemplateService>(BehaviourDocumentTemplateService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listTemplates ────────────────────────────────────────────────────

  describe('listTemplates', () => {
    it('should return all templates for tenant', async () => {
      const templates = [makeTemplate(), makeTemplate({ id: 'template-2', name: 'Second' })];
      mockRlsTx.behaviourDocumentTemplate.findMany.mockResolvedValue(templates);

      const query: ListDocumentTemplatesQuery = {};
      const result = await service.listTemplates(TENANT_ID, query);

      expect(result.data).toHaveLength(2);
      expect(mockRlsTx.behaviourDocumentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('should filter by document_type when provided', async () => {
      mockRlsTx.behaviourDocumentTemplate.findMany.mockResolvedValue([]);

      const query: ListDocumentTemplatesQuery = { document_type: 'suspension_letter' };
      await service.listTemplates(TENANT_ID, query);

      expect(mockRlsTx.behaviourDocumentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, document_type: 'suspension_letter' },
        }),
      );
    });

    it('should filter by locale when provided', async () => {
      mockRlsTx.behaviourDocumentTemplate.findMany.mockResolvedValue([]);

      const query: ListDocumentTemplatesQuery = { locale: 'ar' };
      await service.listTemplates(TENANT_ID, query);

      expect(mockRlsTx.behaviourDocumentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, locale: 'ar' },
        }),
      );
    });

    it('should filter by is_active when provided', async () => {
      mockRlsTx.behaviourDocumentTemplate.findMany.mockResolvedValue([]);

      const query: ListDocumentTemplatesQuery = { is_active: true };
      await service.listTemplates(TENANT_ID, query);

      expect(mockRlsTx.behaviourDocumentTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, is_active: true },
        }),
      );
    });
  });

  // ─── createTemplate ───────────────────────────────────────────────────

  describe('createTemplate', () => {
    const baseDto: CreateDocumentTemplateDto = {
      document_type: 'detention_notice',
      name: 'My Custom Template',
      locale: 'en',
      template_body: '<p>Hello {{student_name}}</p>',
    };

    it('should create template with is_system=false', async () => {
      const created = makeTemplate({ name: baseDto.name });
      mockRlsTx.behaviourDocumentTemplate.create.mockResolvedValue(created);

      const result = await service.createTemplate(TENANT_ID, baseDto);

      expect(result.data).toEqual(created);
      expect(mockRlsTx.behaviourDocumentTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          is_system: false,
          is_active: true,
          document_type: 'detention_notice',
          name: baseDto.name,
        }),
      });
    });

    it('should use provided merge_fields when given', async () => {
      const customFields = [
        { field_name: 'custom_field', source: 'custom', description: 'Custom' },
      ];
      const dtoWithFields: CreateDocumentTemplateDto = {
        ...baseDto,
        merge_fields: customFields,
      };
      mockRlsTx.behaviourDocumentTemplate.create.mockResolvedValue(
        makeTemplate({ merge_fields: customFields }),
      );

      await service.createTemplate(TENANT_ID, dtoWithFields);

      expect(mockRlsTx.behaviourDocumentTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          merge_fields: customFields,
        }),
      });
    });

    it('should auto-populate merge_fields from type when not provided', async () => {
      const dtoNoFields: CreateDocumentTemplateDto = {
        document_type: 'suspension_letter',
        name: 'Suspension Template',
        locale: 'en',
        template_body: '<p>Suspension</p>',
      };
      mockRlsTx.behaviourDocumentTemplate.create.mockResolvedValue(
        makeTemplate({ document_type: 'suspension_letter' }),
      );

      await service.createTemplate(TENANT_ID, dtoNoFields);

      const callData = mockRlsTx.behaviourDocumentTemplate.create.mock.calls[0][0].data as {
        merge_fields: { field_name: string }[];
      };

      // suspension_letter includes COMMON + INCIDENT + SANCTION fields
      expect(callData.merge_fields.length).toBeGreaterThan(12);
      const fieldNames = callData.merge_fields.map(
        (f: { field_name: string }) => f.field_name,
      );
      expect(fieldNames).toContain('student_name');
      expect(fieldNames).toContain('incident_date');
      expect(fieldNames).toContain('sanction_type');
    });

    it('should default locale to "en" when not provided', async () => {
      const dtoNoLocale: CreateDocumentTemplateDto = {
        document_type: 'detention_notice',
        name: 'No Locale',
        template_body: '<p>Test</p>',
      };
      mockRlsTx.behaviourDocumentTemplate.create.mockResolvedValue(makeTemplate());

      await service.createTemplate(TENANT_ID, dtoNoLocale);

      expect(mockRlsTx.behaviourDocumentTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          locale: 'en',
        }),
      });
    });
  });

  // ─── updateTemplate ───────────────────────────────────────────────────

  describe('updateTemplate', () => {
    it('should update custom template fields', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(
        makeTemplate({ is_system: false }),
      );
      const updated = makeTemplate({ name: 'Updated Name', is_system: false });
      mockRlsTx.behaviourDocumentTemplate.update.mockResolvedValue(updated);

      const dto: UpdateDocumentTemplateDto = { name: 'Updated Name' };
      const result = await service.updateTemplate(TENANT_ID, TEMPLATE_ID, dto);

      expect(result.data.name).toBe('Updated Name');
      expect(mockRlsTx.behaviourDocumentTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: expect.objectContaining({ name: 'Updated Name' }),
      });
    });

    it('should restrict system template updates (only is_active, template_body)', async () => {
      const systemTemplate = makeTemplate({ is_system: true });
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(systemTemplate);
      mockRlsTx.behaviourDocumentTemplate.update.mockResolvedValue({
        ...systemTemplate,
        is_active: false,
      });

      const dto: UpdateDocumentTemplateDto = {
        is_active: false,
        template_body: '<p>New body</p>',
      };
      await service.updateTemplate(TENANT_ID, TEMPLATE_ID, dto);

      expect(mockRlsTx.behaviourDocumentTemplate.update).toHaveBeenCalledWith({
        where: { id: TEMPLATE_ID },
        data: { is_active: false, template_body: '<p>New body</p>' },
      });
    });

    it('should throw BadRequestException when renaming system template', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(
        makeTemplate({ is_system: true }),
      );

      const dto: UpdateDocumentTemplateDto = { name: 'Renamed System Template' };

      await expect(
        service.updateTemplate(TENANT_ID, TEMPLATE_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent template', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);

      const dto: UpdateDocumentTemplateDto = { name: 'Anything' };

      await expect(
        service.updateTemplate(TENANT_ID, 'nonexistent-id', dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getActiveTemplate ────────────────────────────────────────────────

  describe('getActiveTemplate', () => {
    it('should return custom template over system template', async () => {
      const customTemplate = makeTemplate({
        id: 'custom-1',
        is_system: false,
        document_type: 'detention_notice',
        locale: 'en',
      });
      // With orderBy is_system: 'asc', custom (false) sorts before system (true)
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(customTemplate);

      const result = await service.getActiveTemplate(
        mockRlsTx as unknown as import('@prisma/client').PrismaClient,
        TENANT_ID,
        'detention_notice',
        'en',
      );

      expect(result).toEqual(customTemplate);
      expect(mockRlsTx.behaviourDocumentTemplate.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          document_type: 'detention_notice',
          locale: 'en',
          is_active: true,
        },
        orderBy: { is_system: 'asc' },
      });
    });

    it('should return null when no active template matches', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(null);

      const result = await service.getActiveTemplate(
        mockRlsTx as unknown as import('@prisma/client').PrismaClient,
        TENANT_ID,
        'exclusion_notice',
        'ar',
      );

      expect(result).toBeNull();
    });

    it('should match by document_type and locale', async () => {
      mockRlsTx.behaviourDocumentTemplate.findFirst.mockResolvedValue(
        makeTemplate({ document_type: 'suspension_letter', locale: 'ar' }),
      );

      await service.getActiveTemplate(
        mockRlsTx as unknown as import('@prisma/client').PrismaClient,
        TENANT_ID,
        'suspension_letter',
        'ar',
      );

      expect(mockRlsTx.behaviourDocumentTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            document_type: 'suspension_letter',
            locale: 'ar',
          }),
        }),
      );
    });
  });

  // ─── getMergeFieldsForType ────────────────────────────────────────────

  describe('getMergeFieldsForType', () => {
    it('should return COMMON_MERGE_FIELDS for unknown types', async () => {
      const fields = service.getMergeFieldsForType('nonexistent_type');

      // COMMON_MERGE_FIELDS has 12 fields
      expect(fields).toHaveLength(12);
      const fieldNames = fields.map((f) => f.field_name);
      expect(fieldNames).toContain('student_name');
      expect(fieldNames).toContain('school_name');
      expect(fieldNames).toContain('parent_name');
      expect(fieldNames).toContain('today_date');
    });
  });
});
