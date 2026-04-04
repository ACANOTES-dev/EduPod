import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { CheckinService } from '../services/checkin.service';

import { CheckinsController } from './checkins.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';

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

const mockCheckinService = {
  submitCheckin: jest.fn(),
  getMyCheckins: jest.fn(),
  getCheckinStatus: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinsController', () => {
  let controller: CheckinsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckinsController],
      providers: [{ provide: CheckinService, useValue: mockCheckinService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CheckinsController>(CheckinsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, CheckinsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard) on the class — NO PermissionGuard', () => {
      const guards = Reflect.getMetadata('__guards__', CheckinsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      // PermissionGuard is intentionally NOT applied to this controller
      expect(guards).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('submit', () => {
    it('should delegate to checkinService.submitCheckin', async () => {
      const dto = { mood_score: 3, freeform_text: 'Feeling okay' };
      const expected = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' };
      mockCheckinService.submitCheckin.mockResolvedValue(expected);

      const result = await controller.submit(TENANT, USER, dto);

      expect(mockCheckinService.submitCheckin).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('myCheckins', () => {
    it('should delegate to checkinService.getMyCheckins', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockCheckinService.getMyCheckins.mockResolvedValue(expected);

      const result = await controller.myCheckins(TENANT, USER, query);

      expect(mockCheckinService.getMyCheckins).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 20);
      expect(result).toBe(expected);
    });
  });

  describe('status', () => {
    it('should delegate to checkinService.getCheckinStatus', async () => {
      const expected = { can_checkin: true, last_checkin: null };
      mockCheckinService.getCheckinStatus.mockResolvedValue(expected);

      const result = await controller.status(TENANT, USER);

      expect(mockCheckinService.getCheckinStatus).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });
});
