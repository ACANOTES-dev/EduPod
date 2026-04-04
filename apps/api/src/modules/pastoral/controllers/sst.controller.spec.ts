import { Test, TestingModule } from '@nestjs/testing';

import type { TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { REQUIRES_PERMISSION_KEY } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { SstAgendaGeneratorService } from '../services/sst-agenda-generator.service';
import { SstMeetingService } from '../services/sst-meeting.service';
import { SstService } from '../services/sst.service';

import { SstController } from './sst.controller';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const MEMBER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEETING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ITEM_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
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

const mockSstService = {
  listMembers: jest.fn(),
  addMember: jest.fn(),
  updateMember: jest.fn(),
  removeMember: jest.fn(),
};

const mockMeetingService = {
  listMeetings: jest.fn(),
  getMeeting: jest.fn(),
  createMeeting: jest.fn(),
  assertMeetingEditable: jest.fn(),
  updateAttendees: jest.fn(),
  updateGeneralNotes: jest.fn(),
  startMeeting: jest.fn(),
  completeMeeting: jest.fn(),
  cancelMeeting: jest.fn(),
  listActionsForMeeting: jest.fn(),
  listAllActions: jest.fn(),
  listMyActions: jest.fn(),
  createAction: jest.fn(),
  updateAction: jest.fn(),
  completeAction: jest.fn(),
};

const mockAgendaService = {
  addManualItem: jest.fn(),
  updateItem: jest.fn(),
  removeManualItem: jest.fn(),
  generateAgenda: jest.fn(),
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_MEETING = {
  id: MEETING_ID,
  status: 'scheduled',
  agenda_items: [{ id: ITEM_ID, title: 'Test item' }],
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SstController', () => {
  let controller: SstController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SstController],
      providers: [
        { provide: SstService, useValue: mockSstService },
        { provide: SstMeetingService, useValue: mockMeetingService },
        { provide: SstAgendaGeneratorService, useValue: mockAgendaService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SstController>(SstController);

    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("pastoral") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(MODULE_ENABLED_KEY, SstController);
      expect(moduleKey).toBe('pastoral');
    });

    it('should have @UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard) on the class', () => {
      const guards = Reflect.getMetadata('__guards__', SstController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
      expect(guards).toContain(PermissionGuard);
    });
  });

  describe('roster endpoint permissions — view_tier2', () => {
    const viewMethods: Array<keyof SstController> = ['listMembers', 'listActiveMembers'];

    it.each(viewMethods)(
      'should have @RequiresPermission("pastoral.view_tier2") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_tier2');
      },
    );
  });

  describe('roster endpoint permissions — manage_sst', () => {
    const manageMethods: Array<keyof SstController> = ['addMember', 'updateMember', 'removeMember'];

    it.each(manageMethods)(
      'should have @RequiresPermission("pastoral.manage_sst") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_sst');
      },
    );
  });

  describe('meeting endpoint permissions — view_tier2', () => {
    const viewMethods: Array<keyof SstController> = ['listMeetings', 'getMeeting'];

    it.each(viewMethods)(
      'should have @RequiresPermission("pastoral.view_tier2") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_tier2');
      },
    );
  });

  describe('meeting endpoint permissions — manage_sst', () => {
    const manageMethods: Array<keyof SstController> = [
      'createMeeting',
      'updateMeeting',
      'startMeeting',
      'completeMeeting',
      'cancelMeeting',
    ];

    it.each(manageMethods)(
      'should have @RequiresPermission("pastoral.manage_sst") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_sst');
      },
    );
  });

  describe('agenda endpoint permissions — view_tier2', () => {
    it('should have @RequiresPermission("pastoral.view_tier2") on getAgenda', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.getAgenda);
      expect(permission).toBe('pastoral.view_tier2');
    });
  });

  describe('agenda endpoint permissions — manage_sst', () => {
    const manageMethods: Array<keyof SstController> = [
      'addAgendaItem',
      'updateAgendaItem',
      'deleteAgendaItem',
      'refreshAgenda',
    ];

    it.each(manageMethods)(
      'should have @RequiresPermission("pastoral.manage_sst") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.manage_sst');
      },
    );
  });

  describe('action endpoint permissions — view_tier2', () => {
    const viewMethods: Array<keyof SstController> = [
      'listMeetingActions',
      'listAllActions',
      'listMyActions',
      'updateAction',
      'completeAction',
    ];

    it.each(viewMethods)(
      'should have @RequiresPermission("pastoral.view_tier2") on %s',
      (method) => {
        const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller[method]);
        expect(permission).toBe('pastoral.view_tier2');
      },
    );
  });

  describe('action endpoint permissions — manage_sst', () => {
    it('should have @RequiresPermission("pastoral.manage_sst") on createAction', () => {
      const permission = Reflect.getMetadata(REQUIRES_PERMISSION_KEY, controller.createAction);
      expect(permission).toBe('pastoral.manage_sst');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROSTER SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listMembers', () => {
    it('should delegate to sstService.listMembers', async () => {
      const expected = [{ id: MEMBER_ID, user_id: USER_ID }];
      mockSstService.listMembers.mockResolvedValue(expected);

      const result = await controller.listMembers(TENANT);

      expect(mockSstService.listMembers).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('listActiveMembers', () => {
    it('should delegate to sstService.listMembers with active filter', async () => {
      const expected = [{ id: MEMBER_ID, user_id: USER_ID, active: true }];
      mockSstService.listMembers.mockResolvedValue(expected);

      const result = await controller.listActiveMembers(TENANT);

      expect(mockSstService.listMembers).toHaveBeenCalledWith(TENANT_ID, { active: true });
      expect(result).toBe(expected);
    });
  });

  describe('addMember', () => {
    it('should delegate to sstService.addMember', async () => {
      const dto = { user_id: USER_ID, role: 'coordinator' };
      const expected = { id: MEMBER_ID, ...dto };
      mockSstService.addMember.mockResolvedValue(expected);

      const result = await controller.addMember(TENANT, USER, dto as never);

      expect(mockSstService.addMember).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('updateMember', () => {
    it('should delegate to sstService.updateMember', async () => {
      const dto = { role: 'member' };
      const expected = { id: MEMBER_ID, ...dto };
      mockSstService.updateMember.mockResolvedValue(expected);

      const result = await controller.updateMember(TENANT, USER, MEMBER_ID, dto as never);

      expect(mockSstService.updateMember).toHaveBeenCalledWith(TENANT_ID, MEMBER_ID, dto, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('removeMember', () => {
    it('should delegate to sstService.removeMember', async () => {
      mockSstService.removeMember.mockResolvedValue(undefined);

      await controller.removeMember(TENANT, USER, MEMBER_ID);

      expect(mockSstService.removeMember).toHaveBeenCalledWith(TENANT_ID, MEMBER_ID, USER_ID);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  MEETING SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listMeetings', () => {
    it('should delegate to meetingService.listMeetings', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockMeetingService.listMeetings.mockResolvedValue(expected);

      const result = await controller.listMeetings(TENANT, query as never);

      expect(mockMeetingService.listMeetings).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('getMeeting', () => {
    it('should delegate to meetingService.getMeeting', async () => {
      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);

      const result = await controller.getMeeting(TENANT, MEETING_ID);

      expect(mockMeetingService.getMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);
      expect(result).toBe(MOCK_MEETING);
    });
  });

  describe('createMeeting', () => {
    it('should delegate to meetingService.createMeeting', async () => {
      const dto = { title: 'Weekly SST', scheduled_date: '2026-04-10' };
      const expected = { id: MEETING_ID, ...dto };
      mockMeetingService.createMeeting.mockResolvedValue(expected);

      const result = await controller.createMeeting(TENANT, USER, dto as never);

      expect(mockMeetingService.createMeeting).toHaveBeenCalledWith(TENANT_ID, dto, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('updateMeeting', () => {
    it('should assert meeting is editable, update attendees and notes, then return refreshed meeting', async () => {
      const dto = {
        attendees: [{ user_id: USER_ID, present: true }],
        general_notes: 'Updated notes',
      };
      const refreshedMeeting = { ...MOCK_MEETING, general_notes: 'Updated notes' };

      mockMeetingService.getMeeting
        .mockResolvedValueOnce(MOCK_MEETING) // first call: assertMeetingEditable
        .mockResolvedValueOnce(refreshedMeeting); // second call: return after updates
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockMeetingService.updateAttendees.mockResolvedValue(undefined);
      mockMeetingService.updateGeneralNotes.mockResolvedValue(undefined);

      const result = await controller.updateMeeting(TENANT, USER, MEETING_ID, dto as never);

      expect(mockMeetingService.getMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);
      expect(mockMeetingService.assertMeetingEditable).toHaveBeenCalledWith(MOCK_MEETING);
      expect(mockMeetingService.updateAttendees).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        dto.attendees,
        USER_ID,
      );
      expect(mockMeetingService.updateGeneralNotes).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        dto.general_notes,
        USER_ID,
      );
      expect(result).toBe(refreshedMeeting);
    });

    it('should not call updateAttendees when attendees is undefined', async () => {
      const dto = { general_notes: 'Only notes' };

      mockMeetingService.getMeeting
        .mockResolvedValueOnce(MOCK_MEETING)
        .mockResolvedValueOnce(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockMeetingService.updateGeneralNotes.mockResolvedValue(undefined);

      await controller.updateMeeting(TENANT, USER, MEETING_ID, dto as never);

      expect(mockMeetingService.updateAttendees).not.toHaveBeenCalled();
      expect(mockMeetingService.updateGeneralNotes).toHaveBeenCalled();
    });

    it('should not call updateGeneralNotes when general_notes is undefined', async () => {
      const dto = { attendees: [{ user_id: USER_ID, present: true }] };

      mockMeetingService.getMeeting
        .mockResolvedValueOnce(MOCK_MEETING)
        .mockResolvedValueOnce(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockMeetingService.updateAttendees.mockResolvedValue(undefined);

      await controller.updateMeeting(TENANT, USER, MEETING_ID, dto as never);

      expect(mockMeetingService.updateAttendees).toHaveBeenCalled();
      expect(mockMeetingService.updateGeneralNotes).not.toHaveBeenCalled();
    });

    it('should propagate error if assertMeetingEditable throws', async () => {
      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockImplementation(() => {
        throw new Error('Meeting is not editable');
      });

      await expect(controller.updateMeeting(TENANT, USER, MEETING_ID, {} as never)).rejects.toThrow(
        'Meeting is not editable',
      );

      expect(mockMeetingService.updateAttendees).not.toHaveBeenCalled();
      expect(mockMeetingService.updateGeneralNotes).not.toHaveBeenCalled();
    });
  });

  describe('startMeeting', () => {
    it('should delegate to meetingService.startMeeting', async () => {
      const expected = { id: MEETING_ID, status: 'in_progress' };
      mockMeetingService.startMeeting.mockResolvedValue(expected);

      const result = await controller.startMeeting(TENANT, USER, MEETING_ID);

      expect(mockMeetingService.startMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  describe('completeMeeting', () => {
    it('should delegate to meetingService.completeMeeting', async () => {
      const expected = { id: MEETING_ID, status: 'completed' };
      mockMeetingService.completeMeeting.mockResolvedValue(expected);

      const result = await controller.completeMeeting(TENANT, USER, MEETING_ID);

      expect(mockMeetingService.completeMeeting).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('cancelMeeting', () => {
    it('should delegate to meetingService.cancelMeeting', async () => {
      const expected = { id: MEETING_ID, status: 'cancelled' };
      mockMeetingService.cancelMeeting.mockResolvedValue(expected);

      const result = await controller.cancelMeeting(TENANT, USER, MEETING_ID);

      expect(mockMeetingService.cancelMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  AGENDA SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getAgenda', () => {
    it('should return agenda_items from the meeting', async () => {
      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);

      const result = await controller.getAgenda(TENANT, MEETING_ID);

      expect(mockMeetingService.getMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);
      expect(result).toEqual(MOCK_MEETING.agenda_items);
    });
  });

  describe('addAgendaItem', () => {
    it('should assert meeting is editable then delegate to agendaService.addManualItem', async () => {
      const dto = { title: 'New item', description: 'Details' };
      const expected = { id: ITEM_ID, ...dto };

      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockAgendaService.addManualItem.mockResolvedValue(expected);

      const result = await controller.addAgendaItem(TENANT, USER, MEETING_ID, dto as never);

      expect(mockMeetingService.getMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);
      expect(mockMeetingService.assertMeetingEditable).toHaveBeenCalledWith(MOCK_MEETING);
      expect(mockAgendaService.addManualItem).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });

    it('should propagate error if assertMeetingEditable throws', async () => {
      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockImplementation(() => {
        throw new Error('Meeting is not editable');
      });

      await expect(controller.addAgendaItem(TENANT, USER, MEETING_ID, {} as never)).rejects.toThrow(
        'Meeting is not editable',
      );

      expect(mockAgendaService.addManualItem).not.toHaveBeenCalled();
    });
  });

  describe('updateAgendaItem', () => {
    it('should assert meeting is editable then delegate to agendaService.updateItem', async () => {
      const dto = { title: 'Updated item' };
      const expected = { id: ITEM_ID, ...dto };

      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockAgendaService.updateItem.mockResolvedValue(expected);

      const result = await controller.updateAgendaItem(
        TENANT,
        USER,
        MEETING_ID,
        ITEM_ID,
        dto as never,
      );

      expect(mockMeetingService.assertMeetingEditable).toHaveBeenCalledWith(MOCK_MEETING);
      expect(mockAgendaService.updateItem).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        ITEM_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('deleteAgendaItem', () => {
    it('should assert meeting is editable then delegate to agendaService.removeManualItem', async () => {
      mockMeetingService.getMeeting.mockResolvedValue(MOCK_MEETING);
      mockMeetingService.assertMeetingEditable.mockReturnValue(undefined);
      mockAgendaService.removeManualItem.mockResolvedValue(undefined);

      await controller.deleteAgendaItem(TENANT, USER, MEETING_ID, ITEM_ID);

      expect(mockMeetingService.assertMeetingEditable).toHaveBeenCalledWith(MOCK_MEETING);
      expect(mockAgendaService.removeManualItem).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        ITEM_ID,
        USER_ID,
      );
    });
  });

  describe('refreshAgenda', () => {
    it('should delegate to agendaService.generateAgenda', async () => {
      const expected = { items: [] };
      mockAgendaService.generateAgenda.mockResolvedValue(expected);

      const result = await controller.refreshAgenda(TENANT, USER, MEETING_ID);

      expect(mockAgendaService.generateAgenda).toHaveBeenCalledWith(TENANT_ID, MEETING_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ACTION SERVICE DELEGATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listMeetingActions', () => {
    it('should delegate to meetingService.listActionsForMeeting', async () => {
      const expected = [{ id: ACTION_ID, description: 'Follow up' }];
      mockMeetingService.listActionsForMeeting.mockResolvedValue(expected);

      const result = await controller.listMeetingActions(TENANT, MEETING_ID);

      expect(mockMeetingService.listActionsForMeeting).toHaveBeenCalledWith(TENANT_ID, MEETING_ID);
      expect(result).toBe(expected);
    });
  });

  describe('listAllActions', () => {
    it('should delegate to meetingService.listAllActions', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockMeetingService.listAllActions.mockResolvedValue(expected);

      const result = await controller.listAllActions(TENANT, query as never);

      expect(mockMeetingService.listAllActions).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('listMyActions', () => {
    it('should delegate to meetingService.listMyActions', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockMeetingService.listMyActions.mockResolvedValue(expected);

      const result = await controller.listMyActions(TENANT, USER, query as never);

      expect(mockMeetingService.listMyActions).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('createAction', () => {
    it('should delegate to meetingService.createAction', async () => {
      const dto = { description: 'Follow up with parent', assignee_id: USER_ID };
      const expected = { id: ACTION_ID, ...dto };
      mockMeetingService.createAction.mockResolvedValue(expected);

      const result = await controller.createAction(TENANT, USER, MEETING_ID, dto as never);

      expect(mockMeetingService.createAction).toHaveBeenCalledWith(
        TENANT_ID,
        MEETING_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateAction', () => {
    it('should delegate to meetingService.updateAction', async () => {
      const dto = { description: 'Updated action' };
      const expected = { id: ACTION_ID, ...dto };
      mockMeetingService.updateAction.mockResolvedValue(expected);

      const result = await controller.updateAction(TENANT, USER, ACTION_ID, dto as never);

      expect(mockMeetingService.updateAction).toHaveBeenCalledWith(
        TENANT_ID,
        ACTION_ID,
        dto,
        USER_ID,
      );
      expect(result).toBe(expected);
    });
  });

  describe('completeAction', () => {
    it('should delegate to meetingService.completeAction', async () => {
      const expected = { id: ACTION_ID, status: 'completed' };
      mockMeetingService.completeAction.mockResolvedValue(expected);

      const result = await controller.completeAction(TENANT, USER, ACTION_ID);

      expect(mockMeetingService.completeAction).toHaveBeenCalledWith(TENANT_ID, ACTION_ID, USER_ID);
      expect(result).toBe(expected);
    });
  });
});
