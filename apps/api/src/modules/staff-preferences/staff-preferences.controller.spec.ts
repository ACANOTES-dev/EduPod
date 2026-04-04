import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { StaffPreferencesController } from './staff-preferences.controller';
import { StaffPreferencesService } from './staff-preferences.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACADEMIC_YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PREF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('StaffPreferencesController', () => {
  let controller: StaffPreferencesController;
  let mockService: {
    findAll: jest.Mock;
    findOwnPreferences: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let mockPermissionCache: { getPermissions: jest.Mock };

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn().mockResolvedValue({ data: [] }),
      findOwnPreferences: jest.fn().mockResolvedValue({ data: [] }),
      create: jest.fn().mockResolvedValue({ id: PREF_ID }),
      update: jest.fn().mockResolvedValue({ id: PREF_ID }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    mockPermissionCache = {
      getPermissions: jest.fn().mockResolvedValue(['schedule.manage_preferences']),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffPreferencesController],
      providers: [
        { provide: StaffPreferencesService, useValue: mockService },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StaffPreferencesController>(StaffPreferencesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call findAll with tenant and query parameters', async () => {
    const query = { academic_year_id: ACADEMIC_YEAR_ID };

    await controller.findAll(mockTenant, query);

    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID, undefined);
  });

  it('should call findOwnPreferences with tenant, user sub, and academic year', async () => {
    const mockJwtPayload: JwtPayload = {
      sub: USER_ID,
      email: 'user@school.test',
      tenant_id: TENANT_ID,
      membership_id: MEMBERSHIP_ID,
      type: 'access',
      iat: 0,
      exp: 0,
    };
    const query = { academic_year_id: ACADEMIC_YEAR_ID };

    await controller.findOwn(mockTenant, mockJwtPayload, query);

    expect(mockService.findOwnPreferences).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      ACADEMIC_YEAR_ID,
    );
  });

  it('should call create with resolved permissions from cache', async () => {
    const mockJwtPayload: JwtPayload = {
      sub: USER_ID,
      email: 'user@school.test',
      tenant_id: TENANT_ID,
      membership_id: MEMBERSHIP_ID,
      type: 'access',
      iat: 0,
      exp: 0,
    };
    const dto = {
      staff_profile_id: 'sp-1',
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
      priority: 'medium' as const,
    };

    await controller.create(mockTenant, mockJwtPayload, dto);

    expect(mockPermissionCache.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto, [
      'schedule.manage_preferences',
    ]);
  });

  it('should pass empty permissions when user has no membership_id', async () => {
    const mockJwtPayload: JwtPayload = {
      sub: USER_ID,
      email: 'user@school.test',
      tenant_id: TENANT_ID,
      membership_id: null,
      type: 'access',
      iat: 0,
      exp: 0,
    };
    const dto = {
      staff_profile_id: 'sp-1',
      academic_year_id: ACADEMIC_YEAR_ID,
      preference_payload: {
        type: 'subject' as const,
        subject_ids: ['sub-1'],
        mode: 'prefer' as const,
      },
      priority: 'medium' as const,
    };

    await controller.create(mockTenant, mockJwtPayload, dto);

    expect(mockPermissionCache.getPermissions).not.toHaveBeenCalled();
    expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto, []);
  });

  it('should call delete with resolved permissions', async () => {
    const mockJwtPayload: JwtPayload = {
      sub: USER_ID,
      email: 'user@school.test',
      tenant_id: TENANT_ID,
      membership_id: MEMBERSHIP_ID,
      type: 'access',
      iat: 0,
      exp: 0,
    };

    await controller.remove(mockTenant, mockJwtPayload, PREF_ID);

    expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, USER_ID, PREF_ID, [
      'schedule.manage_preferences',
    ]);
  });
});
