import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { NepsVisitService } from '../services/neps-visit.service';
import { ReferralPrepopulateService } from '../services/referral-prepopulate.service';
import { ReferralRecommendationService } from '../services/referral-recommendation.service';
import { ReferralService } from '../services/referral.service';

import { ReferralsController } from './referrals.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const REFERRAL_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const RECOMMENDATION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const VISIT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const VISIT_STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER = {
  sub: USER_ID,
  email: 'test@example.com',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mock Services ──────────────────────────────────────────────────────────

const mockReferralService = {
  create: jest.fn(),
  list: jest.fn(),
  getWaitlist: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  submit: jest.fn(),
  acknowledge: jest.fn(),
  scheduleAssessment: jest.fn(),
  completeAssessment: jest.fn(),
  receiveReport: jest.fn(),
  markRecommendationsImplemented: jest.fn(),
  withdraw: jest.fn(),
};

const mockPrepopulateService = {
  generateSnapshot: jest.fn(),
};

const mockRecommendationService = {
  create: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
};

const mockNepsVisitService = {
  create: jest.fn(),
  list: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addStudent: jest.fn(),
  updateStudentOutcome: jest.fn(),
  removeStudent: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ReferralsController', () => {
  let controller: ReferralsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReferralsController],
      providers: [
        { provide: ReferralService, useValue: mockReferralService },
        { provide: ReferralPrepopulateService, useValue: mockPrepopulateService },
        { provide: ReferralRecommendationService, useValue: mockRecommendationService },
        { provide: NepsVisitService, useValue: mockNepsVisitService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReferralsController>(ReferralsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, ReferralsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', ReferralsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('referral endpoint permissions', () => {
    const referralMethods: Array<keyof ReferralsController> = [
      'create',
      'list',
      'getWaitlist',
      'getById',
      'update',
      'submit',
      'acknowledge',
      'scheduleAssessment',
      'completeAssessment',
      'receiveReport',
      'markComplete',
      'withdraw',
      'prePopulate',
    ];

    it.each(referralMethods)(
      'should have @RequiresPermission("pastoral.manage_referrals") on %s',
      (method) => {
        const permission = Reflect.getMetadata(
          REQUIRES_PERMISSION_KEY,
          controller[method],
        );
        expect(permission).toBe('pastoral.manage_referrals');
      },
    );
  });

  describe('recommendation endpoint permissions', () => {
    const recommendationMethods: Array<keyof ReferralsController> = [
      'createRecommendation',
      'listRecommendations',
      'updateRecommendation',
    ];

    it.each(recommendationMethods)(
      'should have @RequiresPermission("pastoral.manage_referrals") on %s',
      (method) => {
        const permission = Reflect.getMetadata(
          REQUIRES_PERMISSION_KEY,
          controller[method],
        );
        expect(permission).toBe('pastoral.manage_referrals');
      },
    );
  });

  describe('NEPS visit endpoint permissions', () => {
    const nepsVisitMethods: Array<keyof ReferralsController> = [
      'createVisit',
      'listVisits',
      'getVisit',
      'updateVisit',
      'removeVisit',
      'addVisitStudent',
      'updateVisitStudent',
      'removeVisitStudent',
    ];

    it.each(nepsVisitMethods)(
      'should have @RequiresPermission("pastoral.manage_referrals") on %s',
      (method) => {
        const permission = Reflect.getMetadata(
          REQUIRES_PERMISSION_KEY,
          controller[method],
        );
        expect(permission).toBe('pastoral.manage_referrals');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERRAL SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should delegate to referralService.create', async () => {
      const dto = {
        student_id: STUDENT_ID,
        referral_type: 'neps' as const,
      };
      const expected = { id: REFERRAL_ID, ...dto };
      mockReferralService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT, USER, dto);

      expect(mockReferralService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('list', () => {
    it('should delegate to referralService.list', async () => {
      const query = { page: 1, pageSize: 20, sort: 'created_at' as const, order: 'desc' as const };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReferralService.list.mockResolvedValue(expected);

      const result = await controller.list(TENANT, query);

      expect(mockReferralService.list).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getWaitlist', () => {
    it('should delegate to referralService.getWaitlist', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockReferralService.getWaitlist.mockResolvedValue(expected);

      const result = await controller.getWaitlist(TENANT, query);

      expect(mockReferralService.getWaitlist).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getById', () => {
    it('should delegate to referralService.get', async () => {
      const expected = { id: REFERRAL_ID, student_id: STUDENT_ID };
      mockReferralService.get.mockResolvedValue(expected);

      const result = await controller.getById(TENANT, REFERRAL_ID);

      expect(mockReferralService.get).toHaveBeenCalledWith(TENANT_ID, REFERRAL_ID);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('should delegate to referralService.update', async () => {
      const dto = { referral_body_name: 'NEPS Dublin' };
      const expected = { id: REFERRAL_ID, ...dto };
      mockReferralService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT, REFERRAL_ID, dto);

      expect(mockReferralService.update).toHaveBeenCalledWith(
        TENANT_ID,
        REFERRAL_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('submit', () => {
    it('should delegate to referralService.submit', async () => {
      const expected = { id: REFERRAL_ID, status: 'submitted' };
      mockReferralService.submit.mockResolvedValue(expected);

      const result = await controller.submit(TENANT, USER, REFERRAL_ID);

      expect(mockReferralService.submit).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('acknowledge', () => {
    it('should delegate to referralService.acknowledge', async () => {
      const expected = { id: REFERRAL_ID, status: 'acknowledged' };
      mockReferralService.acknowledge.mockResolvedValue(expected);

      const result = await controller.acknowledge(TENANT, USER, REFERRAL_ID);

      expect(mockReferralService.acknowledge).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('scheduleAssessment', () => {
    it('should delegate to referralService.scheduleAssessment', async () => {
      const dto = { assessment_scheduled_date: '2026-04-15' };
      const expected = { id: REFERRAL_ID, status: 'assessment_scheduled' };
      mockReferralService.scheduleAssessment.mockResolvedValue(expected);

      const result = await controller.scheduleAssessment(
        TENANT,
        USER,
        REFERRAL_ID,
        dto,
      );

      expect(mockReferralService.scheduleAssessment).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('completeAssessment', () => {
    it('should delegate to referralService.completeAssessment', async () => {
      const expected = { id: REFERRAL_ID, status: 'assessment_complete' };
      mockReferralService.completeAssessment.mockResolvedValue(expected);

      const result = await controller.completeAssessment(TENANT, USER, REFERRAL_ID);

      expect(mockReferralService.completeAssessment).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('receiveReport', () => {
    it('should delegate to referralService.receiveReport', async () => {
      const dto = { report_summary: 'Assessment complete with recommendations' };
      const expected = { id: REFERRAL_ID, status: 'report_received' };
      mockReferralService.receiveReport.mockResolvedValue(expected);

      const result = await controller.receiveReport(TENANT, USER, REFERRAL_ID, dto);

      expect(mockReferralService.receiveReport).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('markComplete', () => {
    it('should delegate to referralService.markRecommendationsImplemented', async () => {
      const expected = { id: REFERRAL_ID, status: 'recommendations_implemented' };
      mockReferralService.markRecommendationsImplemented.mockResolvedValue(expected);

      const result = await controller.markComplete(TENANT, USER, REFERRAL_ID);

      expect(mockReferralService.markRecommendationsImplemented).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('withdraw', () => {
    it('should delegate to referralService.withdraw', async () => {
      const dto = { reason: 'No longer required after student transfer' };
      const expected = { id: REFERRAL_ID, status: 'withdrawn' };
      mockReferralService.withdraw.mockResolvedValue(expected);

      const result = await controller.withdraw(TENANT, USER, REFERRAL_ID, dto);

      expect(mockReferralService.withdraw).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  // ─── Pre-Populate ───────────────────────────────────────────────────────

  describe('prePopulate', () => {
    it('should call referralService.get first to obtain studentId, then prepopulateService.generateSnapshot', async () => {
      const referral = { id: REFERRAL_ID, student_id: STUDENT_ID };
      const snapshot = { attendance: {}, grades: {}, concerns: [] };

      mockReferralService.get.mockResolvedValue(referral);
      mockPrepopulateService.generateSnapshot.mockResolvedValue(snapshot);

      const result = await controller.prePopulate(TENANT, REFERRAL_ID);

      expect(mockReferralService.get).toHaveBeenCalledWith(TENANT_ID, REFERRAL_ID);
      expect(mockPrepopulateService.generateSnapshot).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(result).toBe(snapshot);
    });

    it('should propagate error if referralService.get throws', async () => {
      mockReferralService.get.mockRejectedValue(new Error('Not found'));

      await expect(
        controller.prePopulate(TENANT, REFERRAL_ID),
      ).rejects.toThrow('Not found');

      expect(mockPrepopulateService.generateSnapshot).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATION SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createRecommendation', () => {
    it('should delegate to recommendationService.create', async () => {
      const dto = {
        referral_id: REFERRAL_ID,
        recommendation: 'Weekly counselling sessions',
      };
      const expected = { id: RECOMMENDATION_ID, ...dto };
      mockRecommendationService.create.mockResolvedValue(expected);

      const result = await controller.createRecommendation(
        TENANT,
        USER,
        REFERRAL_ID,
        dto,
      );

      expect(mockRecommendationService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        REFERRAL_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('listRecommendations', () => {
    it('should delegate to recommendationService.list', async () => {
      const expected = [{ id: RECOMMENDATION_ID, recommendation: 'Test' }];
      mockRecommendationService.list.mockResolvedValue(expected);

      const result = await controller.listRecommendations(TENANT, REFERRAL_ID);

      expect(mockRecommendationService.list).toHaveBeenCalledWith(
        TENANT_ID,
        REFERRAL_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateRecommendation', () => {
    it('should delegate to recommendationService.update', async () => {
      const dto = { status_note: 'In progress' };
      const expected = { id: RECOMMENDATION_ID, ...dto };
      mockRecommendationService.update.mockResolvedValue(expected);

      const result = await controller.updateRecommendation(
        TENANT,
        USER,
        REFERRAL_ID,
        RECOMMENDATION_ID,
        dto,
      );

      expect(mockRecommendationService.update).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        RECOMMENDATION_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEPS VISIT SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createVisit', () => {
    it('should delegate to nepsVisitService.create', async () => {
      const dto = {
        visit_date: '2026-04-10',
        psychologist_name: 'Dr. Smith',
      };
      const expected = { id: VISIT_ID, ...dto };
      mockNepsVisitService.create.mockResolvedValue(expected);

      const result = await controller.createVisit(TENANT, USER, dto);

      expect(mockNepsVisitService.create).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('listVisits', () => {
    it('should delegate to nepsVisitService.list', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockNepsVisitService.list.mockResolvedValue(expected);

      const result = await controller.listVisits(TENANT, query);

      expect(mockNepsVisitService.list).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getVisit', () => {
    it('should delegate to nepsVisitService.get', async () => {
      const expected = { id: VISIT_ID, visit_date: '2026-04-10' };
      mockNepsVisitService.get.mockResolvedValue(expected);

      const result = await controller.getVisit(TENANT, VISIT_ID);

      expect(mockNepsVisitService.get).toHaveBeenCalledWith(TENANT_ID, VISIT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('updateVisit', () => {
    it('should delegate to nepsVisitService.update', async () => {
      const dto = { psychologist_name: 'Dr. Jones' };
      const expected = { id: VISIT_ID, ...dto };
      mockNepsVisitService.update.mockResolvedValue(expected);

      const result = await controller.updateVisit(TENANT, VISIT_ID, dto);

      expect(mockNepsVisitService.update).toHaveBeenCalledWith(
        TENANT_ID,
        VISIT_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('removeVisit', () => {
    it('should delegate to nepsVisitService.remove', async () => {
      mockNepsVisitService.remove.mockResolvedValue(undefined);

      await controller.removeVisit(TENANT, VISIT_ID);

      expect(mockNepsVisitService.remove).toHaveBeenCalledWith(TENANT_ID, VISIT_ID);
    });
  });

  describe('addVisitStudent', () => {
    it('should delegate to nepsVisitService.addStudent', async () => {
      const dto = { student_id: STUDENT_ID };
      const expected = { id: VISIT_STUDENT_ID, ...dto };
      mockNepsVisitService.addStudent.mockResolvedValue(expected);

      const result = await controller.addVisitStudent(TENANT, VISIT_ID, dto);

      expect(mockNepsVisitService.addStudent).toHaveBeenCalledWith(
        TENANT_ID,
        VISIT_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateVisitStudent', () => {
    it('should delegate to nepsVisitService.updateStudentOutcome', async () => {
      const dto = { outcome: 'Referred for further assessment' };
      const expected = { id: VISIT_STUDENT_ID, ...dto };
      mockNepsVisitService.updateStudentOutcome.mockResolvedValue(expected);

      const result = await controller.updateVisitStudent(
        TENANT,
        VISIT_ID,
        VISIT_STUDENT_ID,
        dto,
      );

      expect(mockNepsVisitService.updateStudentOutcome).toHaveBeenCalledWith(
        TENANT_ID,
        VISIT_STUDENT_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('removeVisitStudent', () => {
    it('should delegate to nepsVisitService.removeStudent', async () => {
      mockNepsVisitService.removeStudent.mockResolvedValue(undefined);

      await controller.removeVisitStudent(TENANT, VISIT_ID, VISIT_STUDENT_ID);

      expect(mockNepsVisitService.removeStudent).toHaveBeenCalledWith(
        TENANT_ID,
        VISIT_STUDENT_ID,
      );
    });
  });
});
