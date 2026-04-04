import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';

import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'user@school.test',
  tenant_id: TENANT_ID,
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let mockService: {
    getPreferences: jest.Mock;
    updatePreferences: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getPreferences: jest.fn().mockResolvedValue({ theme: 'dark' }),
      updatePreferences: jest.fn().mockResolvedValue({ theme: 'light' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [{ provide: PreferencesService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PreferencesController>(PreferencesController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── GET /v1/me/preferences ───────────────────────────────────────────────

  describe('PreferencesController — getPreferences', () => {
    it('should return preferences from the service', async () => {
      const result = await controller.getPreferences(mockTenant, mockUser);

      expect(result).toEqual({ theme: 'dark' });
      expect(mockService.getPreferences).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    });

    it('should delegate with correct tenant_id and user sub', async () => {
      const differentUser: JwtPayload = {
        ...mockUser,
        sub: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      };

      await controller.getPreferences(mockTenant, differentUser);

      expect(mockService.getPreferences).toHaveBeenCalledWith(
        TENANT_ID,
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
      );
    });
  });

  // ─── PATCH /v1/me/preferences ─────────────────────────────────────────────

  describe('PreferencesController — updatePreferences', () => {
    it('should call service with correct arguments', async () => {
      const dto = { theme: 'light', sidebar: { collapsed: true } };

      const result = await controller.updatePreferences(mockTenant, mockUser, dto);

      expect(result).toEqual({ theme: 'light' });
      expect(mockService.updatePreferences).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('should pass the dto through without modification', async () => {
      const dto = { locale: 'ar', notifications: { email: false } };
      mockService.updatePreferences.mockResolvedValue(dto);

      await controller.updatePreferences(mockTenant, mockUser, dto);

      expect(mockService.updatePreferences).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });

  // ─── Guard metadata ──────────────────────────────────────────────────────

  describe('PreferencesController — guard metadata', () => {
    it('should have AuthGuard applied at the controller level', () => {
      const guards = Reflect.getMetadata('__guards__', PreferencesController);

      expect(guards).toBeDefined();
      expect(guards).toHaveLength(1);
      expect(guards[0]).toBe(AuthGuard);
    });
  });
});
