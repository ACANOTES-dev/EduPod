/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AdmissionsPaymentService } from './admissions-payment.service';
import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const APP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NOTE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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

const mockApplicationsService = {
  findAll: jest.fn(),
  getAnalytics: jest.fn(),
  findOne: jest.fn(),
  preview: jest.fn(),
  review: jest.fn(),
  withdraw: jest.fn(),
};

const mockApplicationNotesService = {
  findByApplication: jest.fn(),
  create: jest.fn(),
};

const mockAdmissionsPaymentService = {
  markPaymentReceived: jest.fn(),
  setupPaymentPlan: jest.fn(),
  waiveFees: jest.fn(),
};

describe('ApplicationsController', () => {
  let controller: ApplicationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        { provide: ApplicationsService, useValue: mockApplicationsService },
        { provide: ApplicationNotesService, useValue: mockApplicationNotesService },
        { provide: AdmissionsPaymentService, useValue: mockAdmissionsPaymentService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ApplicationsController>(ApplicationsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard verification ─────────────────────────────────────────────────────

  it('should have AuthGuard and PermissionGuard applied at class level', () => {
    const guards = Reflect.getMetadata('__guards__', ApplicationsController);
    expect(guards).toBeDefined();
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  // ─── GET /v1/applications ───────────────────────────────────────────────────

  describe('ApplicationsController -- findAll', () => {
    it('should delegate to applicationsService.findAll with tenant_id and query', async () => {
      const query = { page: 1, pageSize: 20 };
      mockApplicationsService.findAll.mockResolvedValue({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });

      const result = await controller.findAll(TENANT, query as never);

      expect(mockApplicationsService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    });
  });

  // ─── GET /v1/applications/analytics ─────────────────────────────────────────

  describe('ApplicationsController -- getAnalytics', () => {
    it('should delegate to applicationsService.getAnalytics with tenant_id and query', async () => {
      const query = { academic_year_id: 'ay-1' };
      mockApplicationsService.getAnalytics.mockResolvedValue({ total: 50, by_status: {} });

      const result = await controller.getAnalytics(TENANT, query as never);

      expect(mockApplicationsService.getAnalytics).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual({ total: 50, by_status: {} });
    });
  });

  // ─── GET /v1/applications/:id ───────────────────────────────────────────────

  describe('ApplicationsController -- findOne', () => {
    it('should delegate to applicationsService.findOne with tenant_id and id', async () => {
      mockApplicationsService.findOne.mockResolvedValue({ id: APP_ID, status: 'submitted' });

      const result = await controller.findOne(TENANT, APP_ID);

      expect(mockApplicationsService.findOne).toHaveBeenCalledWith(TENANT_ID, APP_ID);
      expect(result).toEqual({ id: APP_ID, status: 'submitted' });
    });
  });

  // ─── GET /v1/applications/:id/preview ───────────────────────────────────────

  describe('ApplicationsController -- preview', () => {
    it('should delegate to applicationsService.preview with tenant_id and id', async () => {
      mockApplicationsService.preview.mockResolvedValue({ id: APP_ID, payload_json: {} });

      const result = await controller.preview(TENANT, APP_ID);

      expect(mockApplicationsService.preview).toHaveBeenCalledWith(TENANT_ID, APP_ID);
      expect(result).toEqual({ id: APP_ID, payload_json: {} });
    });
  });

  // ─── POST /v1/applications/:id/review ───────────────────────────────────────

  describe('ApplicationsController -- review', () => {
    it('should delegate to applicationsService.review with tenant_id, id, dto, and user_id', async () => {
      const dto = { decision: 'approved', notes: 'Approved' };
      mockApplicationsService.review.mockResolvedValue({ id: APP_ID, status: 'approved' });

      const result = await controller.review(TENANT, USER, APP_ID, dto as never);

      expect(mockApplicationsService.review).toHaveBeenCalledWith(TENANT_ID, APP_ID, dto, USER_ID);
      expect(result).toEqual({ id: APP_ID, status: 'approved' });
    });
  });

  // ─── POST /v1/applications/:id/withdraw ─────────────────────────────────────

  describe('ApplicationsController -- withdraw', () => {
    it('should delegate to applicationsService.withdraw with tenant_id, id, user_id, and isParent=false', async () => {
      mockApplicationsService.withdraw.mockResolvedValue({ id: APP_ID, status: 'withdrawn' });

      const result = await controller.withdraw(TENANT, USER, APP_ID);

      expect(mockApplicationsService.withdraw).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
        false,
      );
      expect(result).toEqual({ id: APP_ID, status: 'withdrawn' });
    });
  });

  // ─── GET /v1/applications/:applicationId/notes ──────────────────────────────

  describe('ApplicationsController -- getNotes', () => {
    it('should delegate to applicationNotesService.findByApplication with includeInternal=true', async () => {
      mockApplicationNotesService.findByApplication.mockResolvedValue({ data: [] });

      const result = await controller.getNotes(TENANT, APP_ID);

      expect(mockApplicationNotesService.findByApplication).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        true,
      );
      expect(result).toEqual({ data: [] });
    });
  });

  // ─── POST /v1/applications/:applicationId/notes ────────────────────────────

  describe('ApplicationsController -- createNote', () => {
    it('should delegate to applicationNotesService.create with tenant_id, applicationId, user_id, and dto', async () => {
      const dto = { note: 'Internal review note', is_internal: true };
      mockApplicationNotesService.create.mockResolvedValue({ id: NOTE_ID });

      const result = await controller.createNote(TENANT, USER, APP_ID, dto as never);

      expect(mockApplicationNotesService.create).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
        dto,
      );
      expect(result).toEqual({ id: NOTE_ID });
    });
  });

  // ─── POST /v1/applications/:id/mark-payment-received ───────────────────────

  describe('ApplicationsController -- markPaymentReceived', () => {
    it('should delegate to admissionsPaymentService.markPaymentReceived with tenant_id, id, and user_id', async () => {
      mockAdmissionsPaymentService.markPaymentReceived.mockResolvedValue({ success: true });

      const result = await controller.markPaymentReceived(TENANT, USER, APP_ID);

      expect(mockAdmissionsPaymentService.markPaymentReceived).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
      );
      expect(result).toEqual({ success: true });
    });
  });

  // ─── POST /v1/applications/:id/setup-payment-plan ──────────────────────────

  describe('ApplicationsController -- setupPaymentPlan', () => {
    it('should delegate to admissionsPaymentService.setupPaymentPlan with tenant_id, id, and user_id', async () => {
      mockAdmissionsPaymentService.setupPaymentPlan.mockResolvedValue({ success: true });

      const result = await controller.setupPaymentPlan(TENANT, USER, APP_ID);

      expect(mockAdmissionsPaymentService.setupPaymentPlan).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
      );
      expect(result).toEqual({ success: true });
    });
  });

  // ─── POST /v1/applications/:id/waive-fees ──────────────────────────────────

  describe('ApplicationsController -- waiveFees', () => {
    it('should delegate to admissionsPaymentService.waiveFees with tenant_id, id, and user_id', async () => {
      mockAdmissionsPaymentService.waiveFees.mockResolvedValue({ success: true });

      const result = await controller.waiveFees(TENANT, USER, APP_ID);

      expect(mockAdmissionsPaymentService.waiveFees).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
      );
      expect(result).toEqual({ success: true });
    });
  });

  // ─── Permission verification ────────────────────────────────────────────────

  it('should require admissions.view for findAll', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.findAll,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.view for getAnalytics', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.getAnalytics,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.view for findOne', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.findOne,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.view for preview', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.preview,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.manage for review', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.review,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for withdraw', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.withdraw,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.view for getNotes', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.getNotes,
    );
    expect(permission).toBe('admissions.view');
  });

  it('should require admissions.manage for createNote', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.createNote,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for markPaymentReceived', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.markPaymentReceived,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for setupPaymentPlan', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.setupPaymentPlan,
    );
    expect(permission).toBe('admissions.manage');
  });

  it('should require admissions.manage for waiveFees', () => {
    const permission = Reflect.getMetadata(
      'requires_permission',
      ApplicationsController.prototype.waiveFees,
    );
    expect(permission).toBe('admissions.manage');
  });
});
