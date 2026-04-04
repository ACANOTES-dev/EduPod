/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AdmissionFormsController } from './admission-forms.controller';
import { AdmissionFormsService } from './admission-forms.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const FORM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockAdmissionFormsService = {
  createSystemForm: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  validateFieldsForDataMinimisation: jest.fn(),
  logDataMinimisationOverrides: jest.fn(),
  publish: jest.fn(),
  archive: jest.fn(),
  getVersions: jest.fn(),
};

describe('AdmissionFormsController', () => {
  let controller: AdmissionFormsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdmissionFormsController],
      providers: [{ provide: AdmissionFormsService, useValue: mockAdmissionFormsService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdmissionFormsController>(AdmissionFormsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard verification ─────────────────────────────────────────────────────

  it('should have AuthGuard and PermissionGuard applied at class level', () => {
    const guards = Reflect.getMetadata('__guards__', AdmissionFormsController);
    expect(guards).toBeDefined();
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  // ─── POST /v1/admission-forms/system ────────────────────────────────────────

  describe('AdmissionFormsController -- createSystemForm', () => {
    it('should delegate to admissionFormsService.createSystemForm with tenant_id', async () => {
      mockAdmissionFormsService.createSystemForm.mockResolvedValue({ id: FORM_ID });

      const result = await controller.createSystemForm(TENANT);

      expect(mockAdmissionFormsService.createSystemForm).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ id: FORM_ID });
    });
  });

  // ─── POST /v1/admission-forms ───────────────────────────────────────────────

  describe('AdmissionFormsController -- create', () => {
    it('should delegate to admissionFormsService.create with tenant_id and dto', async () => {
      const dto = { name: 'New Form', fields: [] };
      mockAdmissionFormsService.create.mockResolvedValue({ id: FORM_ID });

      const result = await controller.create(TENANT, dto as never);

      expect(mockAdmissionFormsService.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual({ id: FORM_ID });
    });
  });

  // ─── GET /v1/admission-forms ────────────────────────────────────────────────

  describe('AdmissionFormsController -- findAll', () => {
    it('should delegate to admissionFormsService.findAll with tenant_id and query', async () => {
      const query = { page: 1, pageSize: 20 };
      mockAdmissionFormsService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });

      const result = await controller.findAll(TENANT, query as never);

      expect(mockAdmissionFormsService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual({ data: [], meta: { total: 0 } });
    });
  });

  // ─── GET /v1/admission-forms/:id ────────────────────────────────────────────

  describe('AdmissionFormsController -- findOne', () => {
    it('should delegate to admissionFormsService.findOne with tenant_id and id', async () => {
      mockAdmissionFormsService.findOne.mockResolvedValue({ id: FORM_ID, name: 'Test Form' });

      const result = await controller.findOne(TENANT, FORM_ID);

      expect(mockAdmissionFormsService.findOne).toHaveBeenCalledWith(TENANT_ID, FORM_ID);
      expect(result).toEqual({ id: FORM_ID, name: 'Test Form' });
    });
  });

  // ─── PUT /v1/admission-forms/:id ────────────────────────────────────────────

  describe('AdmissionFormsController -- update', () => {
    it('should delegate to admissionFormsService.update with tenant_id, id, and dto', async () => {
      const dto = { name: 'Updated Form' };
      mockAdmissionFormsService.update.mockResolvedValue({ id: FORM_ID, name: 'Updated Form' });

      const result = await controller.update(TENANT, FORM_ID, dto as never);

      expect(mockAdmissionFormsService.update).toHaveBeenCalledWith(TENANT_ID, FORM_ID, dto);
      expect(result).toEqual({ id: FORM_ID, name: 'Updated Form' });
    });
  });

  // ─── POST /v1/admission-forms/:id/validate-fields ──────────────────────────

  describe('AdmissionFormsController -- validateFieldsForDataMinimisation', () => {
    it('should verify form exists and return warnings from service', async () => {
      const body = {
        fields: [{ field_key: 'religion', label: 'Religion' }],
      };
      const warnings = [
        { field_key: 'religion', field_label: 'Religion', matched_keyword: 'religion' },
      ];
      mockAdmissionFormsService.findOne.mockResolvedValue({ id: FORM_ID });
      mockAdmissionFormsService.validateFieldsForDataMinimisation.mockReturnValue(warnings);

      const result = await controller.validateFieldsForDataMinimisation(
        TENANT,
        USER,
        FORM_ID,
        body,
      );

      expect(mockAdmissionFormsService.findOne).toHaveBeenCalledWith(TENANT_ID, FORM_ID);
      expect(mockAdmissionFormsService.validateFieldsForDataMinimisation).toHaveBeenCalledWith(
        body.fields,
      );
      expect(result).toEqual({ warnings });
    });

    it('should log overrides when justifications are provided for flagged fields', async () => {
      const warnings = [
        { field_key: 'religion', field_label: 'Religion', matched_keyword: 'religion' },
      ];
      const body = {
        fields: [{ field_key: 'religion', label: 'Religion' }],
        justifications: { religion: 'Required for dietary accommodations' },
      };
      mockAdmissionFormsService.findOne.mockResolvedValue({ id: FORM_ID });
      mockAdmissionFormsService.validateFieldsForDataMinimisation.mockReturnValue(warnings);
      mockAdmissionFormsService.logDataMinimisationOverrides.mockResolvedValue(undefined);

      await controller.validateFieldsForDataMinimisation(TENANT, USER, FORM_ID, body);

      expect(mockAdmissionFormsService.logDataMinimisationOverrides).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        FORM_ID,
        [
          {
            field_key: 'religion',
            field_label: 'Religion',
            matched_keyword: 'religion',
            justification: 'Required for dietary accommodations',
          },
        ],
      );
    });

    it('should not log overrides when no justifications are provided', async () => {
      const body = {
        fields: [{ field_key: 'first_name', label: 'First Name' }],
      };
      mockAdmissionFormsService.findOne.mockResolvedValue({ id: FORM_ID });
      mockAdmissionFormsService.validateFieldsForDataMinimisation.mockReturnValue([]);

      await controller.validateFieldsForDataMinimisation(TENANT, USER, FORM_ID, body);

      expect(mockAdmissionFormsService.logDataMinimisationOverrides).not.toHaveBeenCalled();
    });
  });

  // ─── POST /v1/admission-forms/:id/publish ───────────────────────────────────

  describe('AdmissionFormsController -- publish', () => {
    it('should delegate to admissionFormsService.publish with tenant_id and id', async () => {
      mockAdmissionFormsService.publish.mockResolvedValue({ id: FORM_ID, status: 'published' });

      const result = await controller.publish(TENANT, FORM_ID);

      expect(mockAdmissionFormsService.publish).toHaveBeenCalledWith(TENANT_ID, FORM_ID);
      expect(result).toEqual({ id: FORM_ID, status: 'published' });
    });
  });

  // ─── POST /v1/admission-forms/:id/archive ───────────────────────────────────

  describe('AdmissionFormsController -- archive', () => {
    it('should delegate to admissionFormsService.archive with tenant_id and id', async () => {
      mockAdmissionFormsService.archive.mockResolvedValue({ id: FORM_ID, status: 'archived' });

      const result = await controller.archive(TENANT, FORM_ID);

      expect(mockAdmissionFormsService.archive).toHaveBeenCalledWith(TENANT_ID, FORM_ID);
      expect(result).toEqual({ id: FORM_ID, status: 'archived' });
    });
  });

  // ─── GET /v1/admission-forms/:id/versions ───────────────────────────────────

  describe('AdmissionFormsController -- getVersions', () => {
    it('should delegate to admissionFormsService.getVersions with tenant_id and id', async () => {
      mockAdmissionFormsService.getVersions.mockResolvedValue({ data: [] });

      const result = await controller.getVersions(TENANT, FORM_ID);

      expect(mockAdmissionFormsService.getVersions).toHaveBeenCalledWith(TENANT_ID, FORM_ID);
      expect(result).toEqual({ data: [] });
    });
  });

  // ─── Permission verification ────────────────────────────────────────────────

  it('should require admissions.manage for createSystemForm', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.createSystemForm,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.view for findAll', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.findAll,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.view for findOne', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.findOne,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.manage for create', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.create,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for update', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.update,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for publish', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.publish,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for archive', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.archive,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.view for getVersions', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.getVersions,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.manage for validateFieldsForDataMinimisation', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.validateFieldsForDataMinimisation,
    );
    expect(permission).toBe('admissions.manage');
  });
});
