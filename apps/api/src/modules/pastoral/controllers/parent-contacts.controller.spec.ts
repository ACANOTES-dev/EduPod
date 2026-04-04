import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ParentContactService } from '../services/parent-contact.service';

import { ParentContactsController } from './parent-contacts.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CONTACT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

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

const mockParentContactService = {
  logContact: jest.fn(),
  listContacts: jest.fn(),
  getContact: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentContactsController', () => {
  let controller: ParentContactsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentContactsController],
      providers: [{ provide: ParentContactService, useValue: mockParentContactService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentContactsController>(ParentContactsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, ParentContactsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', ParentContactsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const allMethods: Array<keyof ParentContactsController> = [
      'logContact',
      'listContacts',
      'getContact',
    ];

    it.each(allMethods)(
      'should have @RequiresPermission("pastoral.view_tier1") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_tier1');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('logContact', () => {
    it('should delegate to parentContactService.logContact', async () => {
      const dto = {
        student_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        contact_type: 'phone_call',
        summary: 'Discussed attendance concerns',
      };
      const expected = { id: CONTACT_ID, ...dto };
      mockParentContactService.logContact.mockResolvedValue(expected);

      const result = await controller.logContact(TENANT, USER, dto as never);

      expect(mockParentContactService.logContact).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('listContacts', () => {
    it('should delegate to parentContactService.listContacts', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockParentContactService.listContacts.mockResolvedValue(expected);

      const result = await controller.listContacts(TENANT, query as never);

      expect(mockParentContactService.listContacts).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getContact', () => {
    it('should delegate to parentContactService.getContact', async () => {
      const expected = { id: CONTACT_ID, summary: 'Test contact' };
      mockParentContactService.getContact.mockResolvedValue(expected);

      const result = await controller.getContact(TENANT, CONTACT_ID);

      expect(mockParentContactService.getContact).toHaveBeenCalledWith(TENANT_ID, CONTACT_ID);
      expect(result).toBe(expected);
    });
  });
});
