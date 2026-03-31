import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';


import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PrismaService } from '../prisma/prisma.service';

import { EventParticipantsService } from './event-participants.service';
import { EventsService } from './events.service';
import { ParentEventsController } from './parent-events.controller';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const USER_ID = '00000000-0000-0000-0000-000000000020';
const STUDENT_ID = '00000000-0000-0000-0000-000000000050';
const PARENT_ID = '00000000-0000-0000-0000-000000000070';

const tenantCtx = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'UTC',
};
const userCtx = {
  sub: USER_ID,
  email: 'parent@test.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  parent: { findFirst: jest.fn() },
  studentParent: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  engagementEvent: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  engagementEventParticipant: {
    findMany: jest.fn(),
  },
};

const mockEventsService = {
  findOne: jest.fn(),
};

const mockEventParticipantsService = {
  register: jest.fn(),
  withdraw: jest.fn(),
};

describe('ParentEventsController', () => {
  let controller: ParentEventsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ParentEventsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsService, useValue: mockEventsService },
        { provide: EventParticipantsService, useValue: mockEventParticipantsService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentEventsController>(ParentEventsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Helper setup ─────────────────────────────────────────────────────────

  function setupParent() {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, user_id: USER_ID });
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { student_id: STUDENT_ID, tenant_id: TENANT_ID },
    ]);
    mockPrisma.studentParent.findUnique.mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
    });
  }

  // ─── listEvents ───────────────────────────────────────────────────────────

  describe('listEvents', () => {
    it('should return events where parent children participate', async () => {
      setupParent();
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementEvent.count.mockResolvedValue(0);

      const result = await controller.listEvents(tenantCtx, userCtx);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should throw when parent not found', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(controller.listEvents(tenantCtx, userCtx)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getEvent ─────────────────────────────────────────────────────────────

  describe('getEvent', () => {
    it('should return event with parent children participants', async () => {
      setupParent();
      mockEventsService.findOne.mockResolvedValue({ id: EVENT_ID, title: 'Trip' });
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);

      const result = await controller.getEvent(tenantCtx, userCtx, EVENT_ID);

      expect(result.my_participants).toEqual([]);
      expect(mockEventsService.findOne).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
    });
  });

  // ─── registerStudent ──────────────────────────────────────────────────────

  describe('registerStudent', () => {
    it('should register student after verifying parent link', async () => {
      setupParent();
      mockEventParticipantsService.register.mockResolvedValue({ status: 'registered' });

      await controller.registerStudent(tenantCtx, userCtx, EVENT_ID, STUDENT_ID);

      expect(mockEventParticipantsService.register).toHaveBeenCalledWith(
        TENANT_ID,
        EVENT_ID,
        STUDENT_ID,
        USER_ID,
      );
    });

    it('should throw when parent not linked to student', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID, user_id: USER_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue(null);

      await expect(
        controller.registerStudent(tenantCtx, userCtx, EVENT_ID, STUDENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── withdrawStudent ──────────────────────────────────────────────────────

  describe('withdrawStudent', () => {
    it('should withdraw student after verifying parent link', async () => {
      setupParent();
      mockEventParticipantsService.withdraw.mockResolvedValue({ status: 'withdrawn' });

      await controller.withdrawStudent(tenantCtx, userCtx, EVENT_ID, STUDENT_ID);

      expect(mockEventParticipantsService.withdraw).toHaveBeenCalledWith(
        TENANT_ID,
        EVENT_ID,
        STUDENT_ID,
      );
    });
  });
});
