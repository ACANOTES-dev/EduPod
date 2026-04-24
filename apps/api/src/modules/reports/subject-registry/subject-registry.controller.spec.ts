/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';

import {
  OWNER_SENTINEL_PERMISSION,
  ReportsSubjectRegistryService,
} from './reports-subject-registry.service';
import { SubjectRegistryController } from './subject-registry.controller';

describe('SubjectRegistryController', () => {
  let controller: SubjectRegistryController;
  let registry: ReportsSubjectRegistryService;
  const permissionCache = {
    getPermissions: jest.fn<Promise<string[]>, [string]>(),
    isOwner: jest.fn<Promise<boolean>, [string]>(),
  };

  beforeEach(async () => {
    permissionCache.getPermissions.mockReset();
    permissionCache.isOwner.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubjectRegistryController],
      providers: [
        ReportsSubjectRegistryService,
        { provide: PermissionCacheService, useValue: permissionCache },
      ],
    })
      .overrideGuard(require('../../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SubjectRegistryController);
    registry = module.get(ReportsSubjectRegistryService);
  });

  it('list returns all subjects scoped to the caller', async () => {
    permissionCache.getPermissions.mockResolvedValue(['finance.view']);
    permissionCache.isOwner.mockResolvedValue(false);

    const result = await controller.list({
      sub: 'u-1',
      email: 'a@b.c',
      tenant_id: 't-1',
      membership_id: 'm-1',
      type: 'access',
      iat: 0,
      exp: 1,
    });

    expect(result.subjects.length).toBeGreaterThan(0);
  });

  it('list returns empty permissions when membership_id is null', async () => {
    const result = await controller.list({
      sub: 'u-1',
      email: 'a@b.c',
      tenant_id: 't-1',
      membership_id: null,
      type: 'access',
      iat: 0,
      exp: 1,
    });

    expect(result.subjects.length).toBeGreaterThan(0);
    expect(permissionCache.getPermissions).not.toHaveBeenCalled();
  });

  it('list passes the owner sentinel when isOwner returns true', async () => {
    permissionCache.getPermissions.mockResolvedValue([]);
    permissionCache.isOwner.mockResolvedValue(true);

    const spy = jest.spyOn(registry, 'getAllSubjects');

    await controller.list({
      sub: 'u-1',
      email: 'a@b.c',
      tenant_id: 't-1',
      membership_id: 'm-1',
      type: 'access',
      iat: 0,
      exp: 1,
    });

    expect(spy).toHaveBeenCalledWith([OWNER_SENTINEL_PERMISSION]);
  });

  it('get returns a single subject for a valid key', async () => {
    permissionCache.getPermissions.mockResolvedValue([]);
    permissionCache.isOwner.mockResolvedValue(false);

    const result = await controller.get(
      {
        sub: 'u-1',
        email: 'a@b.c',
        tenant_id: 't-1',
        membership_id: 'm-1',
        type: 'access',
        iat: 0,
        exp: 1,
      },
      'student',
    );

    expect(result.key).toBe('student');
  });

  it('get rejects unknown subject keys with a BadRequestException', async () => {
    await expect(
      controller.get(
        {
          sub: 'u-1',
          email: 'a@b.c',
          tenant_id: 't-1',
          membership_id: null,
          type: 'access',
          iat: 0,
          exp: 1,
        },
        'not_a_subject',
      ),
    ).rejects.toThrow();
  });
});
