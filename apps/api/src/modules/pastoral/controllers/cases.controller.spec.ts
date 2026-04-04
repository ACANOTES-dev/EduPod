import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { CaseQueriesService } from '../services/case-queries.service';
import { CaseService } from '../services/case.service';

import { CasesController } from './cases.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CASE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONCERN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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

const mockCaseService = {
  create: jest.fn(),
  update: jest.fn(),
  transition: jest.fn(),
  transferOwnership: jest.fn(),
  linkConcern: jest.fn(),
  unlinkConcern: jest.fn(),
  addStudent: jest.fn(),
  removeStudent: jest.fn(),
};

const mockCaseQueriesService = {
  findAll: jest.fn(),
  findMyCases: jest.fn(),
  findOrphans: jest.fn(),
  findById: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CasesController', () => {
  let controller: CasesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CasesController],
      providers: [
        { provide: CaseService, useValue: mockCaseService },
        { provide: CaseQueriesService, useValue: mockCaseQueriesService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CasesController>(CasesController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, CasesController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', CasesController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const allMethods: Array<keyof CasesController> = [
      'create',
      'list',
      'myCases',
      'orphans',
      'getById',
      'update',
      'transitionStatus',
      'transferOwnership',
      'linkConcern',
      'unlinkConcern',
      'addStudent',
      'removeStudent',
    ];

    it.each(allMethods)(
      'should have @RequiresPermission("pastoral.manage_cases") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_cases');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CASE SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should delegate to caseService.create', async () => {
      const dto = {
        student_id: STUDENT_ID,
        concern_ids: [CONCERN_ID],
        owner_user_id: USER_ID,
        opened_reason: 'Multiple concerns',
        tier: 2 as const,
      };
      const expected = { id: CASE_ID, ...dto };
      mockCaseService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT, USER, dto);

      expect(mockCaseService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('list', () => {
    it('should delegate to caseQueriesService.findAll', async () => {
      const query = { sort: 'created_at' as const, order: 'desc' as const, page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockCaseQueriesService.findAll.mockResolvedValue(expected);

      const result = await controller.list(TENANT, USER, query);

      expect(mockCaseQueriesService.findAll).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('myCases', () => {
    it('should delegate to caseQueriesService.findMyCases', async () => {
      const expected = [{ id: CASE_ID }];
      mockCaseQueriesService.findMyCases.mockResolvedValue(expected);

      const result = await controller.myCases(TENANT, USER);

      expect(mockCaseQueriesService.findMyCases).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('orphans', () => {
    it('should delegate to caseQueriesService.findOrphans', async () => {
      const expected = [{ id: CASE_ID }];
      mockCaseQueriesService.findOrphans.mockResolvedValue(expected);

      const result = await controller.orphans(TENANT);

      expect(mockCaseQueriesService.findOrphans).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('getById', () => {
    it('should delegate to caseQueriesService.findById', async () => {
      const expected = { id: CASE_ID, title: 'Test case' };
      mockCaseQueriesService.findById.mockResolvedValue(expected);

      const result = await controller.getById(TENANT, USER, CASE_ID);

      expect(mockCaseQueriesService.findById).toHaveBeenCalledWith(TENANT_ID, USER_ID, CASE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('should delegate to caseService.update', async () => {
      const dto = { tier: 2 as const };
      const expected = { id: CASE_ID, ...dto };
      mockCaseService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT, USER, CASE_ID, dto);

      expect(mockCaseService.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, CASE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('transitionStatus', () => {
    it('should delegate to caseService.transition', async () => {
      const dto = { status: 'closed' as const, reason: 'Case resolved' };
      const expected = { id: CASE_ID, status: 'closed' };
      mockCaseService.transition.mockResolvedValue(expected);

      const result = await controller.transitionStatus(TENANT, USER, CASE_ID, dto);

      expect(mockCaseService.transition).toHaveBeenCalledWith(TENANT_ID, USER_ID, CASE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('transferOwnership', () => {
    it('should delegate to caseService.transferOwnership', async () => {
      const dto = { new_owner_user_id: USER_ID_B, reason: 'Reassigning ownership' };
      const expected = { id: CASE_ID, owner_id: dto.new_owner_user_id };
      mockCaseService.transferOwnership.mockResolvedValue(expected);

      const result = await controller.transferOwnership(TENANT, USER, CASE_ID, dto);

      expect(mockCaseService.transferOwnership).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CASE_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('linkConcern', () => {
    it('should delegate to caseService.linkConcern', async () => {
      const dto = { concern_id: CONCERN_ID };
      const expected = { id: CASE_ID };
      mockCaseService.linkConcern.mockResolvedValue(expected);

      const result = await controller.linkConcern(TENANT, USER, CASE_ID, dto);

      expect(mockCaseService.linkConcern).toHaveBeenCalledWith(TENANT_ID, USER_ID, CASE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('unlinkConcern', () => {
    it('should delegate to caseService.unlinkConcern', async () => {
      mockCaseService.unlinkConcern.mockResolvedValue(undefined);

      await controller.unlinkConcern(TENANT, USER, CASE_ID, CONCERN_ID);

      expect(mockCaseService.unlinkConcern).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CASE_ID,
        CONCERN_ID,
      );
    });
  });

  describe('addStudent', () => {
    it('should delegate to caseService.addStudent', async () => {
      const dto = { student_id: STUDENT_ID };
      const expected = { id: CASE_ID };
      mockCaseService.addStudent.mockResolvedValue(expected);

      const result = await controller.addStudent(TENANT, USER, CASE_ID, dto);

      expect(mockCaseService.addStudent).toHaveBeenCalledWith(TENANT_ID, USER_ID, CASE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('removeStudent', () => {
    it('should delegate to caseService.removeStudent', async () => {
      mockCaseService.removeStudent.mockResolvedValue(undefined);

      await controller.removeStudent(TENANT, USER, CASE_ID, STUDENT_ID);

      expect(mockCaseService.removeStudent).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        CASE_ID,
        STUDENT_ID,
      );
    });
  });
});
