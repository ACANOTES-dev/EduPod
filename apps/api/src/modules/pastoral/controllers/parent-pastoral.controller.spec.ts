import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ParentPastoralService } from '../services/parent-pastoral.service';

import { ParentPastoralController } from './parent-pastoral.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

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

const mockParentPastoralService = {
  getSharedConcerns: jest.fn(),
  submitSelfReferral: jest.fn(),
  getInterventionSummaries: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentPastoralController', () => {
  let controller: ParentPastoralController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentPastoralController],
      providers: [{ provide: ParentPastoralService, useValue: mockParentPastoralService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentPastoralController>(ParentPastoralController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, ParentPastoralController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', ParentPastoralController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const allMethods: Array<keyof ParentPastoralController> = [
      'getSharedConcerns',
      'submitSelfReferral',
      'getInterventionSummaries',
    ];

    it.each(allMethods)(
      'should have @RequiresPermission("pastoral.parent_self_referral") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.parent_self_referral');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSharedConcerns', () => {
    it('should delegate to parentPastoralService.getSharedConcerns', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockParentPastoralService.getSharedConcerns.mockResolvedValue(expected);

      const result = await controller.getSharedConcerns(TENANT, USER, query as never);

      expect(mockParentPastoralService.getSharedConcerns).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        query,
      );
      expect(result).toBe(expected);
    });
  });

  describe('submitSelfReferral', () => {
    it('should delegate to parentPastoralService.submitSelfReferral', async () => {
      const dto = {
        student_id: STUDENT_ID,
        description: 'Child seems withdrawn and anxious at home after school.',
        category: 'emotional',
      };
      const expected = { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', ...dto };
      mockParentPastoralService.submitSelfReferral.mockResolvedValue(expected);

      const result = await controller.submitSelfReferral(TENANT, USER, dto as never);

      expect(mockParentPastoralService.submitSelfReferral).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getInterventionSummaries', () => {
    it('should delegate to parentPastoralService.getInterventionSummaries with student_id', async () => {
      const query = { student_id: STUDENT_ID, page: 1, pageSize: 20 };
      const expected = { data: [] };
      mockParentPastoralService.getInterventionSummaries.mockResolvedValue(expected);

      const result = await controller.getInterventionSummaries(TENANT, USER, query as never);

      expect(mockParentPastoralService.getInterventionSummaries).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
      );
      expect(result).toBe(expected);
    });

    it('should pass undefined when student_id is absent', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [] };
      mockParentPastoralService.getInterventionSummaries.mockResolvedValue(expected);

      const result = await controller.getInterventionSummaries(TENANT, USER, query as never);

      expect(mockParentPastoralService.getInterventionSummaries).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        undefined,
      );
      expect(result).toBe(expected);
    });
  });
});
