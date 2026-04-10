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
  getPublishedForm: jest.fn(),
  rebuildSystemForm: jest.fn(),
  ensureSystemForm: jest.fn(),
  getSystemFormDefinitionId: jest.fn(),
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

  // ─── GET /v1/admission-forms/system ────────────────────────────────────────

  describe('getSystemForm', () => {
    it('should delegate to service.getPublishedForm with tenant_id', async () => {
      mockAdmissionFormsService.getPublishedForm.mockResolvedValue({ id: FORM_ID });

      const result = await controller.getSystemForm(TENANT);

      expect(mockAdmissionFormsService.getPublishedForm).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ id: FORM_ID });
    });
  });

  // ─── POST /v1/admission-forms/system/rebuild ───────────────────────────────

  describe('rebuildSystemForm', () => {
    it('should delegate to service.rebuildSystemForm with tenant_id and acting user id', async () => {
      mockAdmissionFormsService.rebuildSystemForm.mockResolvedValue({ id: FORM_ID });

      const result = await controller.rebuildSystemForm(TENANT, USER);

      expect(mockAdmissionFormsService.rebuildSystemForm).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toEqual({ id: FORM_ID });
    });
  });

  // ─── Permission verification ────────────────────────────────────────────────

  it('should require admissions.view for getSystemForm', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.getSystemForm,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.manage for rebuildSystemForm', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      AdmissionFormsController.prototype.rebuildSystemForm,
    );
    expect(permission).toBe('admissions.manage');
  });
});
