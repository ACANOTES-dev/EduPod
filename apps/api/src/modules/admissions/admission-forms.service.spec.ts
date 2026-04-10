import { Test, TestingModule } from '@nestjs/testing';

import { SYSTEM_FORM_FIELDS, SYSTEM_FORM_NAME } from '@school/shared/admissions';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AdmissionFormsService } from './admission-forms.service';

// Mock createRlsClient to bypass RLS for unit tests
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildStoredFields() {
  return SYSTEM_FORM_FIELDS.map((field, index) => ({
    id: `field-${index}`,
    tenant_id: TENANT_A,
    form_definition_id: 'form-1',
    field_key: field.field_key,
    label: field.label,
    help_text: field.help_text ?? null,
    field_type: field.field_type,
    required: field.required,
    visible_to_parent: true,
    visible_to_staff: true,
    searchable: field.searchable ?? false,
    reportable: field.reportable ?? false,
    options_json: field.options_json ?? null,
    validation_rules_json: null,
    conditional_visibility_json: null,
    display_order: field.display_order,
    active: true,
  }));
}

function buildForm(overrides: Record<string, unknown> = {}) {
  return {
    id: 'form-1',
    tenant_id: TENANT_A,
    name: SYSTEM_FORM_NAME,
    base_form_id: 'form-1',
    version_number: 1,
    status: 'published',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    fields: buildStoredFields(),
    ...overrides,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('AdmissionFormsService', () => {
  let service: AdmissionFormsService;
  let mockPrisma: {
    admissionFormDefinition: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findFirstOrThrow: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    admissionFormField: {
      create: jest.Mock;
    };
    auditLog: {
      create: jest.Mock;
    };
  };
  let mockSettings: { getModuleSettings: jest.Mock };
  let mockFacade: {
    findAcademicYearsWithinHorizon: jest.Mock;
    findAllYearGroupsWithOrder: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      admissionFormDefinition: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findFirstOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      admissionFormField: {
        create: jest.fn().mockResolvedValue({}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    mockFacade = {
      findAcademicYearsWithinHorizon: jest.fn().mockResolvedValue([]),
      findAllYearGroupsWithOrder: jest.fn().mockResolvedValue([]),
    };

    mockSettings = {
      getModuleSettings: jest.fn().mockResolvedValue({
        requireApprovalForAcceptance: true,
        upfront_percentage: 100,
        payment_window_days: 7,
        max_application_horizon_years: 2,
        allow_cash: true,
        allow_bank_transfer: false,
        bank_iban: null,
        require_override_approval_role: 'school_principal',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdmissionFormsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: AcademicReadFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get<AdmissionFormsService>(AdmissionFormsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── ensureSystemForm ─────────────────────────────────────────────────────

  describe('ensureSystemForm', () => {
    it('returns the existing published system form without rebuilding', async () => {
      const existing = buildForm();
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);

      const result = await service.ensureSystemForm(TENANT_A);

      expect(result.id).toBe('form-1');
      expect(mockPrisma.admissionFormDefinition.create).not.toHaveBeenCalled();
    });

    it('rebuilds when the stored field set has drifted from the canonical list', async () => {
      // Stale form missing the first canonical field — triggers fieldsMatchCanonical = false.
      const stale = buildForm({ fields: buildStoredFields().slice(1) });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(stale) // ensureSystemForm pre-check
        .mockResolvedValueOnce(stale) // rebuildSystemForm existing lookup
        .mockResolvedValueOnce({ ...stale, version_number: 1 }); // latestVersion
      mockPrisma.admissionFormDefinition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.admissionFormDefinition.create.mockResolvedValue({
        id: 'form-migrated',
        base_form_id: 'form-1',
        version_number: 2,
        status: 'published',
      });
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(
        buildForm({ id: 'form-migrated', version_number: 2 }),
      );

      const result = await service.ensureSystemForm(TENANT_A);

      expect(result.id).toBe('form-migrated');
      expect(mockPrisma.admissionFormDefinition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'archived' } }),
      );
    });

    it('creates a new published form when none exists', async () => {
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(null) // ensureSystemForm pre-check
        .mockResolvedValueOnce(null) // rebuildSystemForm existing published lookup
        .mockResolvedValueOnce(null); // rebuildSystemForm latestVersion lookup (not called)
      mockPrisma.admissionFormDefinition.create.mockResolvedValue({
        id: 'new-form',
        tenant_id: TENANT_A,
        base_form_id: null,
        version_number: 1,
        status: 'published',
      });
      mockPrisma.admissionFormDefinition.update.mockResolvedValue({});
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(
        buildForm({ id: 'new-form', base_form_id: 'new-form' }),
      );

      const result = await service.ensureSystemForm(TENANT_A);

      expect(result.id).toBe('new-form');
      expect(mockPrisma.admissionFormDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_A,
            name: SYSTEM_FORM_NAME,
            version_number: 1,
            status: 'published',
          }),
        }),
      );
      expect(mockPrisma.admissionFormField.create).toHaveBeenCalledTimes(SYSTEM_FORM_FIELDS.length);
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  // ─── rebuildSystemForm ────────────────────────────────────────────────────

  describe('rebuildSystemForm', () => {
    it('returns the existing form unchanged when fields match canonical set', async () => {
      const existing = buildForm();
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);

      const result = await service.rebuildSystemForm(TENANT_A, USER_ID);

      expect(result.id).toBe('form-1');
      expect(mockPrisma.admissionFormDefinition.create).not.toHaveBeenCalled();
      expect(mockPrisma.admissionFormField.create).not.toHaveBeenCalled();
    });

    it('archives the old form and creates a new version when fields differ', async () => {
      // Existing form has stored fields but the first one is missing — triggers diff.
      const existing = buildForm({
        id: 'form-1',
        base_form_id: 'root-form',
        version_number: 3,
        fields: buildStoredFields().slice(1),
      });
      mockPrisma.admissionFormDefinition.findFirst
        .mockResolvedValueOnce(existing) // existing system form
        .mockResolvedValueOnce({ ...existing, version_number: 3 }); // latestVersion
      mockPrisma.admissionFormDefinition.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.admissionFormDefinition.create.mockResolvedValue({
        id: 'form-2',
        base_form_id: 'root-form',
        version_number: 4,
        status: 'published',
      });
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(
        buildForm({ id: 'form-2', base_form_id: 'root-form', version_number: 4 }),
      );

      const result = await service.rebuildSystemForm(TENANT_A, USER_ID);

      expect(result.id).toBe('form-2');
      expect(mockPrisma.admissionFormDefinition.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'archived' },
        }),
      );
      expect(mockPrisma.admissionFormDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            base_form_id: 'root-form',
            version_number: 4,
            status: 'published',
          }),
        }),
      );
      expect(mockPrisma.admissionFormField.create).toHaveBeenCalledTimes(SYSTEM_FORM_FIELDS.length);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actor_user_id: USER_ID,
            action: 'admission_form_rebuilt',
          }),
        }),
      );
    });

    it('treats dynamic option fields (target_academic_year_id) as matching even if stored options differ', async () => {
      // Simulate a stored form where the dynamic option field was persisted
      // with stale options_json from a previous fetch. It should still match.
      const storedFields = buildStoredFields().map((field) => {
        if (field.field_key === 'target_academic_year_id') {
          return {
            ...field,
            options_json: [{ value: 'stale', label: 'Stale' }],
          };
        }
        return field;
      });
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(
        buildForm({ fields: storedFields }),
      );

      const result = await service.rebuildSystemForm(TENANT_A, USER_ID);

      expect(result.id).toBe('form-1');
      expect(mockPrisma.admissionFormDefinition.create).not.toHaveBeenCalled();
    });
  });

  // ─── getPublishedForm ─────────────────────────────────────────────────────

  describe('getPublishedForm', () => {
    it('returns the form with dynamic academic year and year group options populated', async () => {
      const existing = buildForm();
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(existing);
      mockFacade.findAcademicYearsWithinHorizon.mockResolvedValue([
        { id: 'ay-1', name: '2026-2027' },
        { id: 'ay-2', name: '2027-2028' },
      ]);
      mockFacade.findAllYearGroupsWithOrder.mockResolvedValue([
        { id: 'yg-1', name: 'First Class', display_order: 0 },
        { id: 'yg-2', name: 'Second Class', display_order: 1 },
      ]);

      const result = await service.getPublishedForm(TENANT_A);

      const academicYearField = result.fields.find(
        (f) => f.field_key === 'target_academic_year_id',
      );
      const yearGroupField = result.fields.find((f) => f.field_key === 'target_year_group_id');

      expect(academicYearField?.options_json).toEqual([
        { value: 'ay-1', label: '2026-2027' },
        { value: 'ay-2', label: '2027-2028' },
      ]);
      expect(yearGroupField?.options_json).toEqual([
        { value: 'yg-1', label: 'First Class' },
        { value: 'yg-2', label: 'Second Class' },
      ]);
    });

    it('respects the tenant horizon when loading academic year options', async () => {
      const existing = buildForm();
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(existing);
      mockSettings.getModuleSettings.mockResolvedValue({
        requireApprovalForAcceptance: true,
        upfront_percentage: 100,
        payment_window_days: 7,
        max_application_horizon_years: 5,
        allow_cash: true,
        allow_bank_transfer: false,
        bank_iban: null,
        require_override_approval_role: 'school_principal',
      });

      await service.getPublishedForm(TENANT_A);

      expect(mockFacade.findAcademicYearsWithinHorizon).toHaveBeenCalledWith(
        TENANT_A,
        expect.any(Date),
      );
      const cutoff = mockFacade.findAcademicYearsWithinHorizon.mock.calls[0]![1] as Date;
      const now = new Date();
      expect(cutoff.getFullYear()).toBe(now.getFullYear() + 5);
    });

    it('calls ensureSystemForm before loading the published form', async () => {
      const existing = buildForm();
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(existing);
      mockPrisma.admissionFormDefinition.findFirstOrThrow.mockResolvedValue(existing);

      await service.getPublishedForm(TENANT_A);

      // findFirst is called at least twice: once by ensureSystemForm, once
      // by loadPublishedSystemForm (via findFirstOrThrow chain in real code).
      expect(mockPrisma.admissionFormDefinition.findFirst).toHaveBeenCalled();
      expect(mockPrisma.admissionFormDefinition.findFirstOrThrow).toHaveBeenCalled();
    });
  });

  // ─── getSystemFormDefinitionId ────────────────────────────────────────────

  describe('getSystemFormDefinitionId', () => {
    it('returns the id of the ensured system form', async () => {
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(buildForm({ id: 'form-xyz' }));

      const id = await service.getSystemFormDefinitionId(TENANT_A);

      expect(id).toBe('form-xyz');
    });
  });

  // ─── RLS leakage ─────────────────────────────────────────────────────────

  describe('tenant isolation', () => {
    it('passes tenant_id through to every lookup', async () => {
      mockPrisma.admissionFormDefinition.findFirst.mockResolvedValue(buildForm({ id: 'form-b' }));

      await service.ensureSystemForm(TENANT_B);

      const whereArgs = mockPrisma.admissionFormDefinition.findFirst.mock.calls.map(
        (call) => (call[0] as { where: { tenant_id: string } }).where.tenant_id,
      );
      expect(whereArgs.every((t) => t === TENANT_B)).toBe(true);
    });
  });
});
