import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AdmissionFormsService } from './admission-forms.service';

// Mock createRlsClient to bypass RLS for unit tests
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

describe('AdmissionFormsService', () => {
  let service: AdmissionFormsService;
  let mockPrisma: {
    admissionFormDefinition: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    admissionFormField: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  function buildFormField(overrides: Record<string, unknown> = {}) {
    return {
      field_key: 'first_name',
      label: 'First Name',
      field_type: 'short_text' as const,
      required: true,
      visible_to_parent: true,
      visible_to_staff: true,
      searchable: false,
      reportable: false,
      options_json: null,
      validation_rules_json: null,
      conditional_visibility_json: null,
      display_order: 0,
      active: true,
      ...overrides,
    };
  }

  function buildFormRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'form-1',
      tenant_id: TENANT_ID,
      name: 'Test Form',
      base_form_id: 'form-1',
      version_number: 1,
      status: 'draft',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
      fields: [],
      _count: { applications: 0, fields: 0 },
      ...overrides,
    };
  }

  beforeEach(async () => {
    mockPrisma = {
      admissionFormDefinition: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      admissionFormField: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionFormsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AdmissionFormsService>(AdmissionFormsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create form with fields in draft status', async () => {
      const fields = [
        buildFormField({ field_key: 'first_name', display_order: 0 }),
        buildFormField({ field_key: 'last_name', label: 'Last Name', display_order: 1 }),
      ];

      const createdForm = buildFormRecord();
      mockPrisma.admissionFormDefinition.create.mockResolvedValue(createdForm);
      mockPrisma.admissionFormDefinition.update.mockResolvedValue(createdForm);
      mockPrisma.admissionFormField.create.mockResolvedValue({});
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue({
        ...createdForm,
        fields,
      });

      const result = await service.create(TENANT_ID, {
        name: 'Test Form',
        fields,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.admissionFormDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'draft',
            version_number: 1,
          }),
        }),
      );
      expect(mockPrisma.admissionFormField.create).toHaveBeenCalledTimes(2);
    });

    it('should reject duplicate field_keys', async () => {
      const fields = [
        buildFormField({ field_key: 'same_key', display_order: 0 }),
        buildFormField({ field_key: 'same_key', display_order: 1 }),
      ];

      await expect(
        service.create(TENANT_ID, { name: 'Test', fields }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.create(TENANT_ID, { name: 'Test', fields });
      } catch (e) {
        const err = e as BadRequestException;
        const response = err.getResponse() as Record<string, Record<string, string>>;
        expect(response.error!.code).toBe('DUPLICATE_FIELD_KEYS');
      }
    });

    it('should reject invalid conditional_visibility ref', async () => {
      const fields = [
        buildFormField({
          field_key: 'field_a',
          display_order: 0,
          conditional_visibility_json: {
            depends_on_field_key: 'nonexistent_field',
            show_when_value: 'yes',
          },
        }),
      ];

      await expect(
        service.create(TENANT_ID, { name: 'Test', fields }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.create(TENANT_ID, { name: 'Test', fields });
      } catch (e) {
        const err = e as BadRequestException;
        const response = err.getResponse() as Record<string, Record<string, string>>;
        expect(response.error!.code).toBe('INVALID_CONDITIONAL_REFERENCE');
      }
    });

    it('should reject select fields without options', async () => {
      const fields = [
        buildFormField({
          field_key: 'dropdown',
          field_type: 'single_select',
          options_json: null,
          display_order: 0,
        }),
      ];

      await expect(
        service.create(TENANT_ID, { name: 'Test', fields }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.create(TENANT_ID, { name: 'Test', fields });
      } catch (e) {
        const err = e as BadRequestException;
        const response = err.getResponse() as Record<string, Record<string, string>>;
        expect(response.error!.code).toBe('SELECT_REQUIRES_OPTIONS');
      }
    });
  });

  // ─── Update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update draft form in-place', async () => {
      const existing = buildFormRecord({ status: 'draft' });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(existing) // first call: find existing
        .mockResolvedValueOnce({ ...existing, name: 'Updated' }); // second call: return updated
      mockPrisma.admissionFormField.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.admissionFormDefinition.update.mockResolvedValue({
        ...existing,
        name: 'Updated',
      });
      mockPrisma.admissionFormField.create.mockResolvedValue({});

      const result = await service.update(TENANT_ID, 'form-1', {
        name: 'Updated',
        fields: [buildFormField()],
        expected_updated_at: '2026-01-01T00:00:00.000Z',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.admissionFormField.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.admissionFormDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Updated' }),
        }),
      );
    });

    it('should create new version when editing published form', async () => {
      const existing = buildFormRecord({ status: 'published', version_number: 1 });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(existing) // find existing (published)
        .mockResolvedValueOnce(existing) // find latest version
        .mockResolvedValueOnce({ ...existing, id: 'form-2', version_number: 2, status: 'draft' }); // return new version
      mockPrisma.admissionFormDefinition.create.mockResolvedValue({
        id: 'form-2',
        version_number: 2,
        status: 'draft',
      });
      mockPrisma.admissionFormField.create.mockResolvedValue({});

      const result = await service.update(TENANT_ID, 'form-1', {
        name: 'Test Form v2',
        fields: [buildFormField()],
        expected_updated_at: '2026-01-01T00:00:00.000Z',
      });

      expect(result).toBeDefined();
      expect(mockPrisma.admissionFormDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'draft',
            base_form_id: 'form-1',
          }),
        }),
      );
    });

    it('should reject editing archived form', async () => {
      const existing = buildFormRecord({ status: 'archived' });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);

      await expect(
        service.update(TENANT_ID, 'form-1', {
          name: 'Test',
          fields: [buildFormField()],
          expected_updated_at: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: concurrent edit should fail', async () => {
      const existing = buildFormRecord({
        status: 'draft',
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);

      await expect(
        service.update(TENANT_ID, 'form-1', {
          name: 'Test',
          fields: [buildFormField()],
          expected_updated_at: '2026-01-01T12:00:00.000Z', // stale timestamp
        }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.update(TENANT_ID, 'form-1', {
          name: 'Test',
          fields: [buildFormField()],
          expected_updated_at: '2026-01-01T12:00:00.000Z',
        });
      } catch (e) {
        const err = e as BadRequestException;
        const response = err.getResponse() as Record<string, Record<string, string>>;
        expect(response.error!.code).toBe('CONCURRENT_MODIFICATION');
      }
    });
  });

  // ─── Publish ─────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('should publish draft form', async () => {
      const form = buildFormRecord({
        status: 'draft',
        fields: [{ id: 'f1' }],
      });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(form) // find form
        .mockResolvedValueOnce({ ...form, status: 'published' }); // return published
      mockPrisma.admissionFormDefinition.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.admissionFormDefinition.update.mockResolvedValue({
        ...form,
        status: 'published',
      });

      const result = await service.publish(TENANT_ID, 'form-1');

      expect(result).toBeDefined();
      expect(mockPrisma.admissionFormDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'published' },
        }),
      );
    });

    it('should archive other published in lineage', async () => {
      const form = buildFormRecord({
        status: 'draft',
        base_form_id: 'root-form',
        fields: [{ id: 'f1' }],
      });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(form)
        .mockResolvedValueOnce({ ...form, status: 'published' });
      mockPrisma.admissionFormDefinition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.admissionFormDefinition.update.mockResolvedValue({
        ...form,
        status: 'published',
      });

      await service.publish(TENANT_ID, 'form-1');

      expect(mockPrisma.admissionFormDefinition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            base_form_id: 'root-form',
            status: 'published',
            id: { not: 'form-1' },
          }),
          data: { status: 'archived' },
        }),
      );
    });

    it('should reject publishing non-draft', async () => {
      const form = buildFormRecord({ status: 'published', fields: [{ id: 'f1' }] });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);

      await expect(
        service.publish(TENANT_ID, 'form-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject publishing empty form', async () => {
      const form = buildFormRecord({ status: 'draft', fields: [] });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);

      await expect(
        service.publish(TENANT_ID, 'form-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Versioning ──────────────────────────────────────────────────────────

  describe('getVersions', () => {
    it('should return all versions of a form lineage', async () => {
      const form = buildFormRecord({ base_form_id: 'root-form' });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);
      mockPrisma.admissionFormDefinition.findMany.mockResolvedValue([
        buildFormRecord({ version_number: 1 }),
        buildFormRecord({ id: 'form-2', version_number: 2 }),
      ]);

      const result = await service.getVersions(TENANT_ID, 'form-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.admissionFormDefinition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ base_form_id: 'root-form' }),
        }),
      );
    });
  });

  // ─── Find One ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return form with fields', async () => {
      const form = buildFormRecord({ fields: [buildFormField()] });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);

      const result = await service.findOne(TENANT_ID, 'form-1');

      expect(result).toBeDefined();
      expect(result.fields).toBeDefined();
    });

    it('should throw NotFoundException for missing form', async () => {
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Archive ─────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('should archive a form', async () => {
      const form = buildFormRecord({ status: 'published' });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(form)
        .mockResolvedValueOnce({ ...form, status: 'archived' });
      mockPrisma.admissionFormDefinition.update.mockResolvedValue({
        ...form,
        status: 'archived',
      });

      const result = await service.archive(TENANT_ID, 'form-1');

      expect(result).toBeDefined();
    });

    it('should reject archiving already archived form', async () => {
      const form = buildFormRecord({ status: 'archived' });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);

      await expect(
        service.archive(TENANT_ID, 'form-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Get Published Form ──────────────────────────────────────────────────

  describe('getPublishedForm', () => {
    it('should return published form with parent-visible fields', async () => {
      const form = buildFormRecord({
        status: 'published',
        fields: [buildFormField({ visible_to_parent: true })],
      });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(form);

      const result = await service.getPublishedForm(TENANT_ID);

      expect(result).toBeDefined();
      expect(result.status).toBe('published');
    });

    it('should throw when no published form exists', async () => {
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedForm(TENANT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Data Minimisation ────────────────────────────────────────────────────

  describe('validateFieldsForDataMinimisation', () => {
    it('should detect health keyword in field label', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'field_1', label: 'Medical Conditions' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.matched_keyword).toBe('medical');
      expect(result[0]!.category).toBe('health');
    });

    it('should NOT flag non-special-category fields', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'student_name', label: 'Student Name' },
      ]);
      expect(result).toHaveLength(0);
    });

    it('should detect religion keyword', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'religion_field', label: 'Religion' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.category).toBe('religion');
    });

    it('should detect ethnicity keyword', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'ethnicity_field', label: 'Ethnicity' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.category).toBe('ethnicity');
    });

    it('should detect keyword in field_key as well as label', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'student_medical_notes', label: 'Additional Notes' },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]!.matched_keyword).toBe('medical');
    });

    it('should return one warning per field even if multiple keywords match', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'health_medical', label: 'Health and Medical' },
      ]);
      expect(result).toHaveLength(1);
    });

    it('should handle multiple fields with mixed results', () => {
      const result = service.validateFieldsForDataMinimisation([
        { field_key: 'student_name', label: 'Student Name' },
        { field_key: 'religion', label: 'Religion' },
        { field_key: 'student_dob', label: 'Date of Birth' },
        { field_key: 'medical_notes', label: 'Medical Conditions' },
      ]);
      expect(result).toHaveLength(2);
    });
  });
});
