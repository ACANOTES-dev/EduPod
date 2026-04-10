/* eslint-disable @typescript-eslint/no-require-imports */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsService } from './applications.service';
import { ParentApplicationsController } from './parent-applications.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const APP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
  email: 'parent@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockApplicationsService = {
  findByParent: jest.fn(),
  findOne: jest.fn(),
  withdraw: jest.fn(),
};

const mockApplicationNotesService = {
  findByApplication: jest.fn(),
};

describe('ParentApplicationsController', () => {
  let controller: ParentApplicationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentApplicationsController],
      providers: [
        { provide: ApplicationsService, useValue: mockApplicationsService },
        { provide: ApplicationNotesService, useValue: mockApplicationNotesService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentApplicationsController>(ParentApplicationsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard verification ─────────────────────────────────────────────────────

  it('should have AuthGuard applied at class level (no PermissionGuard)', () => {
    const guards = Reflect.getMetadata('__guards__', ParentApplicationsController);
    expect(guards).toBeDefined();
    expect(guards).toHaveLength(1);
  });

  // ─── GET /v1/parent/applications ────────────────────────────────────────────

  describe('ParentApplicationsController -- findOwn', () => {
    it('should delegate to applicationsService.findByParent with tenant_id and user_id', async () => {
      mockApplicationsService.findByParent.mockResolvedValue([
        { id: APP_ID, status: 'ready_to_admit' },
      ]);

      const result = await controller.findOwn(TENANT, USER);

      expect(mockApplicationsService.findByParent).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toEqual([{ id: APP_ID, status: 'ready_to_admit' }]);
    });
  });

  // ─── GET /v1/parent/applications/:id ────────────────────────────────────────

  describe('ParentApplicationsController -- findOne', () => {
    it('should return application with non-internal notes when parent owns it', async () => {
      const application = { id: APP_ID, status: 'ready_to_admit', student_first_name: 'John' };
      mockApplicationsService.findOne.mockResolvedValue(application);
      mockApplicationsService.findByParent.mockResolvedValue([{ id: APP_ID }]);
      mockApplicationNotesService.findByApplication.mockResolvedValue({ data: [] });

      const result = await controller.findOne(TENANT, USER, APP_ID);

      expect(mockApplicationsService.findOne).toHaveBeenCalledWith(TENANT_ID, APP_ID);
      expect(mockApplicationsService.findByParent).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(mockApplicationNotesService.findByApplication).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        false, // excludeInternal
      );
      expect(result).toEqual({ ...application, notes: { data: [] } });
    });

    it('should throw ForbiddenException when parent does not own the application', async () => {
      mockApplicationsService.findOne.mockResolvedValue({ id: APP_ID });
      mockApplicationsService.findByParent.mockResolvedValue([{ id: 'other-app-id' }]);

      await expect(controller.findOne(TENANT, USER, APP_ID)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when parent has no applications', async () => {
      mockApplicationsService.findOne.mockResolvedValue({ id: APP_ID });
      mockApplicationsService.findByParent.mockResolvedValue([]);

      await expect(controller.findOne(TENANT, USER, APP_ID)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── POST /v1/parent/applications/:id/withdraw ─────────────────────────────

  describe('ParentApplicationsController -- withdraw', () => {
    it('should delegate to applicationsService.withdraw with tenant_id, id, user_id, and isParent=true', async () => {
      mockApplicationsService.withdraw.mockResolvedValue({ id: APP_ID, status: 'withdrawn' });

      const result = await controller.withdraw(TENANT, USER, APP_ID);

      expect(mockApplicationsService.withdraw).toHaveBeenCalledWith(
        TENANT_ID,
        APP_ID,
        USER_ID,
        true,
      );
      expect(result).toEqual({ id: APP_ID, status: 'withdrawn' });
    });
  });
});
