import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { InterventionActionService } from '../services/intervention-action.service';
import { InterventionService } from '../services/intervention.service';

import { InterventionsController } from './interventions.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const INTERVENTION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CASE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ACTION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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

const mockInterventionService = {
  listInterventions: jest.fn(),
  getIntervention: jest.fn(),
  listInterventionsForCase: jest.fn(),
  listInterventionsForStudent: jest.fn(),
  createIntervention: jest.fn(),
  updateIntervention: jest.fn(),
  changeStatus: jest.fn(),
  recordReview: jest.fn(),
  listProgressNotes: jest.fn(),
  addProgressNote: jest.fn(),
  getInterventionTypes: jest.fn(),
};

const mockInterventionActionService = {
  listActionsForIntervention: jest.fn(),
  listAllActions: jest.fn(),
  listMyActions: jest.fn(),
  createAction: jest.fn(),
  updateAction: jest.fn(),
  completeAction: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('InterventionsController', () => {
  let controller: InterventionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterventionsController],
      providers: [
        { provide: InterventionService, useValue: mockInterventionService },
        { provide: InterventionActionService, useValue: mockInterventionActionService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<InterventionsController>(InterventionsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, InterventionsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', InterventionsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const allMethods: Array<keyof InterventionsController> = [
      'list',
      'getById',
      'listForCase',
      'listForStudent',
      'create',
      'update',
      'changeStatus',
      'recordReview',
      'listActionsForIntervention',
      'listAllActions',
      'myActions',
      'createAction',
      'updateAction',
      'completeAction',
      'listProgressNotes',
      'addProgressNote',
      'getInterventionTypes',
    ];

    it.each(allMethods)(
      'should have @RequiresPermission("pastoral.manage_interventions") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_interventions');
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERVENTION SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('list', () => {
    it('should delegate to interventionService.listInterventions', async () => {
      const query = { page: 1, pageSize: 20, sort: 'created_at' as const, order: 'desc' as const };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockInterventionService.listInterventions.mockResolvedValue(expected);

      const result = await controller.list(TENANT, query);

      expect(mockInterventionService.listInterventions).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getById', () => {
    it('should delegate to interventionService.getIntervention', async () => {
      const expected = { id: INTERVENTION_ID, title: 'Test' };
      mockInterventionService.getIntervention.mockResolvedValue(expected);

      const result = await controller.getById(TENANT, INTERVENTION_ID);

      expect(mockInterventionService.getIntervention).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('listForCase', () => {
    it('should delegate to interventionService.listInterventionsForCase', async () => {
      const expected = [{ id: INTERVENTION_ID }];
      mockInterventionService.listInterventionsForCase.mockResolvedValue(expected);

      const result = await controller.listForCase(TENANT, CASE_ID);

      expect(mockInterventionService.listInterventionsForCase).toHaveBeenCalledWith(
        TENANT_ID,
        CASE_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('listForStudent', () => {
    it('should delegate to interventionService.listInterventionsForStudent', async () => {
      const expected = [{ id: INTERVENTION_ID }];
      mockInterventionService.listInterventionsForStudent.mockResolvedValue(expected);

      const result = await controller.listForStudent(TENANT, STUDENT_ID);

      expect(mockInterventionService.listInterventionsForStudent).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('should delegate to interventionService.createIntervention', async () => {
      const dto = {
        student_id: STUDENT_ID,
        next_review_date: '2026-05-01',
        case_id: CASE_ID,
        intervention_type: 'cbt',
        continuum_level: 2 as const,
        target_outcomes: [{ description: 'Reduce anxiety', measurable_target: '50% reduction' }],
        review_cycle_weeks: 6,
        parent_informed: false,
      };
      const expected = { id: INTERVENTION_ID, ...dto };
      mockInterventionService.createIntervention.mockResolvedValue(expected);

      const result = await controller.create(TENANT, USER, dto);

      expect(mockInterventionService.createIntervention).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('should delegate to interventionService.updateIntervention', async () => {
      const dto = { outcome_notes: 'Progress noted' };
      const expected = { id: INTERVENTION_ID, ...dto };
      mockInterventionService.updateIntervention.mockResolvedValue(expected);

      const result = await controller.update(TENANT, USER, INTERVENTION_ID, dto);

      expect(mockInterventionService.updateIntervention).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('changeStatus', () => {
    it('should delegate to interventionService.changeStatus', async () => {
      const dto = { status: 'achieved' as const };
      const expected = { id: INTERVENTION_ID, status: 'achieved' };
      mockInterventionService.changeStatus.mockResolvedValue(expected);

      const result = await controller.changeStatus(TENANT, USER, INTERVENTION_ID, dto);

      expect(mockInterventionService.changeStatus).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('recordReview', () => {
    it('should delegate to interventionService.recordReview', async () => {
      const dto = { review_notes: 'Good progress observed' };
      const expected = { id: INTERVENTION_ID, last_reviewed: '2026-04-04' };
      mockInterventionService.recordReview.mockResolvedValue(expected);

      const result = await controller.recordReview(TENANT, USER, INTERVENTION_ID, dto);

      expect(mockInterventionService.recordReview).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTION SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listActionsForIntervention', () => {
    it('should delegate to interventionActionService.listActionsForIntervention', async () => {
      const expected = [{ id: ACTION_ID }];
      mockInterventionActionService.listActionsForIntervention.mockResolvedValue(expected);

      const result = await controller.listActionsForIntervention(TENANT, INTERVENTION_ID);

      expect(mockInterventionActionService.listActionsForIntervention).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('listAllActions', () => {
    it('should delegate to interventionActionService.listAllActions', async () => {
      const query = { page: 1, pageSize: 20, sort: 'created_at' as const, order: 'desc' as const };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockInterventionActionService.listAllActions.mockResolvedValue(expected);

      const result = await controller.listAllActions(TENANT, query);

      expect(mockInterventionActionService.listAllActions).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('myActions', () => {
    it('should delegate to interventionActionService.listMyActions', async () => {
      const expected = [{ id: ACTION_ID }];
      mockInterventionActionService.listMyActions.mockResolvedValue(expected);

      const result = await controller.myActions(TENANT, USER);

      expect(mockInterventionActionService.listMyActions).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('createAction', () => {
    it('should delegate to interventionActionService.createAction', async () => {
      const dto = {
        description: 'Daily check-in',
        start_date: '2026-04-01',
        intervention_id: INTERVENTION_ID,
        assigned_to_user_id: USER_ID,
      };
      const expected = { id: ACTION_ID, ...dto };
      mockInterventionActionService.createAction.mockResolvedValue(expected);

      const result = await controller.createAction(TENANT, USER, INTERVENTION_ID, dto);

      expect(mockInterventionActionService.createAction).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateAction', () => {
    it('should delegate to interventionActionService.updateAction', async () => {
      const dto = { description: 'Updated description' };
      const expected = { id: ACTION_ID, ...dto };
      mockInterventionActionService.updateAction.mockResolvedValue(expected);

      const result = await controller.updateAction(TENANT, USER, ACTION_ID, dto);

      expect(mockInterventionActionService.updateAction).toHaveBeenCalledWith(
        TENANT_ID,
        ACTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('completeAction', () => {
    it('should delegate to interventionActionService.completeAction', async () => {
      const expected = { id: ACTION_ID, status: 'completed' };
      mockInterventionActionService.completeAction.mockResolvedValue(expected);

      const result = await controller.completeAction(TENANT, USER, ACTION_ID);

      expect(mockInterventionActionService.completeAction).toHaveBeenCalledWith(
        TENANT_ID,
        ACTION_ID,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRESS NOTES
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listProgressNotes', () => {
    it('should delegate to interventionService.listProgressNotes', async () => {
      const expected = [{ id: '1', note: 'Good progress' }];
      mockInterventionService.listProgressNotes.mockResolvedValue(expected);

      const result = await controller.listProgressNotes(TENANT, INTERVENTION_ID);

      expect(mockInterventionService.listProgressNotes).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('addProgressNote', () => {
    it('should delegate to interventionService.addProgressNote', async () => {
      const dto = { note: 'Student showing improvement' };
      const expected = { id: '1', ...dto };
      mockInterventionService.addProgressNote.mockResolvedValue(expected);

      const result = await controller.addProgressNote(TENANT, USER, INTERVENTION_ID, dto);

      expect(mockInterventionService.addProgressNote).toHaveBeenCalledWith(
        TENANT_ID,
        INTERVENTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getInterventionTypes', () => {
    it('should delegate to interventionService.getInterventionTypes', async () => {
      const expected = [{ id: '1', name: 'Counselling' }];
      mockInterventionService.getInterventionTypes.mockResolvedValue(expected);

      const result = await controller.getInterventionTypes(TENANT);

      expect(mockInterventionService.getInterventionTypes).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });
});
