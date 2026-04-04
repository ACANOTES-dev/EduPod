import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { AffectedTrackingService } from '../services/affected-tracking.service';
import { CriticalIncidentService } from '../services/critical-incident.service';

import { CriticalIncidentsController } from './critical-incidents.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const INCIDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERSON_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ITEM_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ENTRY_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

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

const mockIncidentService = {
  declare: jest.fn(),
  list: jest.fn(),
  getById: jest.fn(),
  update: jest.fn(),
  transitionStatus: jest.fn(),
  getResponsePlanProgress: jest.fn(),
  updateResponsePlanItem: jest.fn(),
  addResponsePlanItem: jest.fn(),
  listExternalSupport: jest.fn(),
  addExternalSupport: jest.fn(),
  updateExternalSupport: jest.fn(),
};

const mockAffectedService = {
  listAffectedPersons: jest.fn(),
  addAffectedPerson: jest.fn(),
  bulkAddAffected: jest.fn(),
  updateAffectedPerson: jest.fn(),
  removeAffectedPerson: jest.fn(),
  recordSupportOffered: jest.fn(),
  getAffectedSummary: jest.fn(),
  getStudentWellbeingFlags: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CriticalIncidentsController', () => {
  let controller: CriticalIncidentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CriticalIncidentsController],
      providers: [
        { provide: CriticalIncidentService, useValue: mockIncidentService },
        { provide: AffectedTrackingService, useValue: mockAffectedService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CriticalIncidentsController>(CriticalIncidentsController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, CriticalIncidentsController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', CriticalIncidentsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('endpoint permissions', () => {
    const manageCriticalIncidentsMethods: Array<keyof CriticalIncidentsController> = [
      'declare',
      'list',
      'getById',
      'update',
      'transitionStatus',
      'getResponsePlan',
      'updateResponsePlanItem',
      'addResponsePlanItem',
      'listAffected',
      'addAffected',
      'bulkAddAffected',
      'updateAffected',
      'removeAffected',
      'recordSupport',
      'affectedSummary',
      'listExternalSupport',
      'addExternalSupport',
      'updateExternalSupport',
    ];

    it.each(manageCriticalIncidentsMethods)(
      'should have @RequiresPermission("pastoral.manage_critical_incidents") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_critical_incidents');
      },
    );

    it('should have @RequiresPermission("pastoral.view") on getStudentWellbeingFlags', () => {
      const permission = Reflect.getMetadata(
        REQUIRES_PERMISSION_KEY,
        controller.getStudentWellbeingFlags,
      );
      expect(permission).toBe('pastoral.view');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INCIDENT SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('declare', () => {
    it('should delegate to incidentService.declare', async () => {
      const dto = { title: 'Bus accident', severity: 'high' as const };
      const expected = { id: INCIDENT_ID, ...dto };
      mockIncidentService.declare.mockResolvedValue(expected);

      const result = await controller.declare(TENANT, USER, dto as never);

      expect(mockIncidentService.declare).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('list', () => {
    it('should delegate to incidentService.list with destructured filters', async () => {
      const query = {
        page: 1,
        pageSize: 20,
        status: 'active' as const,
        sort: 'created_at' as const,
        order: 'desc' as const,
      };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockIncidentService.list.mockResolvedValue(expected);

      const result = await controller.list(TENANT, query);

      const { page, pageSize, ...filters } = query;
      expect(mockIncidentService.list).toHaveBeenCalledWith(TENANT_ID, filters, page, pageSize);
      expect(result).toBe(expected);
    });
  });

  describe('getById', () => {
    it('should delegate to incidentService.getById', async () => {
      const expected = { id: INCIDENT_ID, title: 'Bus accident' };
      mockIncidentService.getById.mockResolvedValue(expected);

      const result = await controller.getById(TENANT, INCIDENT_ID);

      expect(mockIncidentService.getById).toHaveBeenCalledWith(TENANT_ID, INCIDENT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('should delegate to incidentService.update', async () => {
      const dto = { description: 'Updated description' };
      const expected = { id: INCIDENT_ID, ...dto };
      mockIncidentService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT, USER, INCIDENT_ID, dto);

      expect(mockIncidentService.update).toHaveBeenCalledWith(TENANT_ID, INCIDENT_ID, USER_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('transitionStatus', () => {
    it('should delegate to incidentService.transitionStatus', async () => {
      const dto = { new_status: 'closed' as const, reason: 'Incident resolved' };
      const expected = { id: INCIDENT_ID, status: 'closed' };
      mockIncidentService.transitionStatus.mockResolvedValue(expected);

      const result = await controller.transitionStatus(TENANT, USER, INCIDENT_ID, dto);

      expect(mockIncidentService.transitionStatus).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getResponsePlan', () => {
    it('should delegate to incidentService.getResponsePlanProgress', async () => {
      const expected = { items: [], progress: 0 };
      mockIncidentService.getResponsePlanProgress.mockResolvedValue(expected);

      const result = await controller.getResponsePlan(TENANT, INCIDENT_ID);

      expect(mockIncidentService.getResponsePlanProgress).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateResponsePlanItem', () => {
    it('should delegate to incidentService.updateResponsePlanItem', async () => {
      const dto = { phase: 'immediate' as const, item_id: ITEM_ID, is_done: true };
      const expected = { id: ITEM_ID, ...dto };
      mockIncidentService.updateResponsePlanItem.mockResolvedValue(expected);

      const result = await controller.updateResponsePlanItem(
        TENANT,
        USER,
        INCIDENT_ID,
        ITEM_ID,
        dto,
      );

      expect(mockIncidentService.updateResponsePlanItem).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('addResponsePlanItem', () => {
    it('should delegate to incidentService.addResponsePlanItem', async () => {
      const dto = { label: 'New action item', phase: 'immediate' as const };
      const expected = { id: ITEM_ID, ...dto };
      mockIncidentService.addResponsePlanItem.mockResolvedValue(expected);

      const result = await controller.addResponsePlanItem(TENANT, USER, INCIDENT_ID, dto);

      expect(mockIncidentService.addResponsePlanItem).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AFFECTED TRACKING SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listAffected', () => {
    it('should delegate to affectedService.listAffectedPersons', async () => {
      const filters = {};
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockAffectedService.listAffectedPersons.mockResolvedValue(expected);

      const result = await controller.listAffected(TENANT, INCIDENT_ID, filters);

      expect(mockAffectedService.listAffectedPersons).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        filters,
      );
      expect(result).toBe(expected);
    });
  });

  describe('addAffected', () => {
    it('should delegate to affectedService.addAffectedPerson', async () => {
      const dto = {
        student_id: STUDENT_ID,
        person_type: 'student' as const,
        impact_level: 'directly_affected' as const,
      };
      const expected = { id: PERSON_ID, ...dto };
      mockAffectedService.addAffectedPerson.mockResolvedValue(expected);

      const result = await controller.addAffected(TENANT, USER, INCIDENT_ID, dto);

      expect(mockAffectedService.addAffectedPerson).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('bulkAddAffected', () => {
    it('should delegate to affectedService.bulkAddAffected with dto.persons', async () => {
      const persons = [
        {
          student_id: STUDENT_ID,
          person_type: 'student' as const,
          impact_level: 'directly_affected' as const,
        },
      ];
      const dto = { persons };
      const expected = { count: 1 };
      mockAffectedService.bulkAddAffected.mockResolvedValue(expected);

      const result = await controller.bulkAddAffected(TENANT, USER, INCIDENT_ID, dto);

      expect(mockAffectedService.bulkAddAffected).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        persons,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateAffected', () => {
    it('should delegate to affectedService.updateAffectedPerson', async () => {
      const dto = { notes: 'Updated notes' };
      const expected = { id: PERSON_ID, ...dto };
      mockAffectedService.updateAffectedPerson.mockResolvedValue(expected);

      const result = await controller.updateAffected(TENANT, USER, INCIDENT_ID, PERSON_ID, dto);

      expect(mockAffectedService.updateAffectedPerson).toHaveBeenCalledWith(
        TENANT_ID,
        PERSON_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('removeAffected', () => {
    it('should delegate to affectedService.removeAffectedPerson with dto.reason', async () => {
      const dto = { reason: 'Added in error' };
      mockAffectedService.removeAffectedPerson.mockResolvedValue(undefined);

      await controller.removeAffected(TENANT, USER, INCIDENT_ID, PERSON_ID, dto);

      expect(mockAffectedService.removeAffectedPerson).toHaveBeenCalledWith(
        TENANT_ID,
        PERSON_ID,
        USER_ID,
        'Added in error',
      );
    });
  });

  describe('recordSupport', () => {
    it('should delegate to affectedService.recordSupportOffered with dto.notes', async () => {
      const dto = { notes: 'Counselling offered' };
      const expected = { id: PERSON_ID, support_offered: true };
      mockAffectedService.recordSupportOffered.mockResolvedValue(expected);

      const result = await controller.recordSupport(TENANT, USER, INCIDENT_ID, PERSON_ID, dto);

      expect(mockAffectedService.recordSupportOffered).toHaveBeenCalledWith(
        TENANT_ID,
        PERSON_ID,
        USER_ID,
        'Counselling offered',
      );
      expect(result).toBe(expected);
    });
  });

  describe('affectedSummary', () => {
    it('should delegate to affectedService.getAffectedSummary', async () => {
      const expected = { total: 5, by_role: {} };
      mockAffectedService.getAffectedSummary.mockResolvedValue(expected);

      const result = await controller.affectedSummary(TENANT, INCIDENT_ID);

      expect(mockAffectedService.getAffectedSummary).toHaveBeenCalledWith(TENANT_ID, INCIDENT_ID);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTERNAL SUPPORT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listExternalSupport', () => {
    it('should delegate to incidentService.listExternalSupport', async () => {
      const expected = [{ id: ENTRY_ID, agency: 'HSE' }];
      mockIncidentService.listExternalSupport.mockResolvedValue(expected);

      const result = await controller.listExternalSupport(TENANT, INCIDENT_ID);

      expect(mockIncidentService.listExternalSupport).toHaveBeenCalledWith(TENANT_ID, INCIDENT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('addExternalSupport', () => {
    it('should delegate to incidentService.addExternalSupport', async () => {
      const dto = { provider_type: 'external_counsellor' as const, provider_name: 'CAMHS' };
      const expected = { id: ENTRY_ID, ...dto };
      mockIncidentService.addExternalSupport.mockResolvedValue(expected);

      const result = await controller.addExternalSupport(TENANT, USER, INCIDENT_ID, dto);

      expect(mockIncidentService.addExternalSupport).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateExternalSupport', () => {
    it('should delegate to incidentService.updateExternalSupport', async () => {
      const dto = { provider_type: 'external_counsellor' as const, provider_name: 'CAMHS Updated' };
      const expected = { id: ENTRY_ID, ...dto };
      mockIncidentService.updateExternalSupport.mockResolvedValue(expected);

      const result = await controller.updateExternalSupport(
        TENANT,
        USER,
        INCIDENT_ID,
        ENTRY_ID,
        dto,
      );

      expect(mockIncidentService.updateExternalSupport).toHaveBeenCalledWith(
        TENANT_ID,
        INCIDENT_ID,
        ENTRY_ID,
        USER_ID,
        dto,
      );
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STUDENT WELLBEING FLAGS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getStudentWellbeingFlags', () => {
    it('should delegate to affectedService.getStudentWellbeingFlags', async () => {
      const expected = { flags: [] };
      mockAffectedService.getStudentWellbeingFlags.mockResolvedValue(expected);

      const result = await controller.getStudentWellbeingFlags(TENANT, STUDENT_ID);

      expect(mockAffectedService.getStudentWellbeingFlags).toHaveBeenCalledWith(
        TENANT_ID,
        STUDENT_ID,
      );
      expect(result).toBe(expected);
    });
  });
});
