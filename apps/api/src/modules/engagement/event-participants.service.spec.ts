/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

jest.mock('../../common/middleware/rls.middleware');

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../common/tests/mock-facades';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { EventParticipantsService } from './event-participants.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const STUDENT_ID = '00000000-0000-0000-0000-000000000050';
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000060';
const PARENT_USER_ID = '00000000-0000-0000-0000-000000000070';

const mockEvent = {
  id: EVENT_ID,
  tenant_id: TENANT_ID,
  title: 'School Trip',
  event_type: 'school_trip',
  status: 'open',
  fee_amount: null,
  target_type: 'whole_school',
  target_config_json: null,
};

const mockParticipant = {
  id: PARTICIPANT_ID,
  tenant_id: TENANT_ID,
  event_id: EVENT_ID,
  student_id: STUDENT_ID,
  status: 'invited',
  consent_status: 'pending',
  payment_status: 'not_required',
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  student: { findMany: jest.fn() },
  engagementEvent: { findFirst: jest.fn() },
  engagementEventParticipant: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
};

const mockNotificationsQueue = { add: jest.fn() };

const mockTx = {
  engagementEventParticipant: {
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockRlsClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};

(createRlsClient as jest.Mock).mockReturnValue(mockRlsClient);

describe('EventParticipantsService', () => {
  let service: EventParticipantsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EventParticipantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        {
          provide: StudentReadFacade,
          useValue: {
            findActiveStudentIds: jest.fn().mockImplementation(async () => {
              const students = await mockPrisma.student.findMany();
              return (students as Array<{ id: string }>).map((s) => s.id);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EventParticipantsService>(EventParticipantsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── resolveTargetStudents ────────────────────────────────────────────────

  describe('resolveTargetStudents', () => {
    it('should resolve whole_school students', async () => {
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);

      const ids = await service.resolveTargetStudents(TENANT_ID, 'whole_school', null);

      expect(ids).toEqual([STUDENT_ID]);
    });

    it('should resolve year_group students', async () => {
      const yearGroupId = '00000000-0000-0000-0000-000000000080';
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);

      const ids = await service.resolveTargetStudents(TENANT_ID, 'year_group', {
        year_group_ids: [yearGroupId],
      });

      expect(ids).toEqual([STUDENT_ID]);
    });

    it('should resolve class_group students', async () => {
      const classId = '00000000-0000-0000-0000-000000000090';
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);

      const ids = await service.resolveTargetStudents(TENANT_ID, 'class_group', {
        class_ids: [classId],
      });

      expect(ids).toEqual([STUDENT_ID]);
    });

    it('should return custom student_ids directly', async () => {
      const ids = await service.resolveTargetStudents(TENANT_ID, 'custom', {
        student_ids: [STUDENT_ID],
      });

      expect(ids).toEqual([STUDENT_ID]);
    });

    it('should throw when year_group_ids missing', async () => {
      await expect(service.resolveTargetStudents(TENANT_ID, 'year_group', null)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── createParticipantsForEvent ───────────────────────────────────────────

  describe('createParticipantsForEvent', () => {
    it('should create participants with not_required payment for free events', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);
      mockTx.engagementEventParticipant.createMany.mockResolvedValue({ count: 1 });

      const result = await service.createParticipantsForEvent(TENANT_ID, EVENT_ID);

      expect((result as Record<string, unknown>).created).toBe(1);
      expect(mockTx.engagementEventParticipant.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ payment_status: 'not_required' }),
          ]),
          skipDuplicates: true,
        }),
      );
    });

    it('should create participants with pending payment for paid events', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue({
        ...mockEvent,
        fee_amount: 25.0,
      });
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);
      mockTx.engagementEventParticipant.createMany.mockResolvedValue({ count: 1 });

      await service.createParticipantsForEvent(TENANT_ID, EVENT_ID);

      expect(mockTx.engagementEventParticipant.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([expect.objectContaining({ payment_status: 'pending' })]),
        }),
      );
    });

    it('should throw when event not found', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(null);

      await expect(service.createParticipantsForEvent(TENANT_ID, EVENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAllForEvent ──────────────────────────────────────────────────────

  describe('findAllForEvent', () => {
    it('should return paginated participants', async () => {
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.engagementEventParticipant.count.mockResolvedValue(1);

      const result = await service.findAllForEvent(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('should apply status filter', async () => {
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.engagementEventParticipant.count.mockResolvedValue(0);

      await service.findAllForEvent(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
        status: 'registered',
      });

      expect(mockPrisma.engagementEventParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'registered' }),
        }),
      );
    });
  });

  // ─── updateParticipant ────────────────────────────────────────────────────

  describe('updateParticipant', () => {
    it('should update participant fields', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(mockParticipant);
      mockTx.engagementEventParticipant.update.mockResolvedValue({
        ...mockParticipant,
        consent_status: 'granted',
      });

      const result = await service.updateParticipant(TENANT_ID, EVENT_ID, PARTICIPANT_ID, {
        consent_status: 'granted',
      });

      expect((result as Record<string, unknown>).consent_status).toBe('granted');
    });

    it('should throw when participant not found', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(null);

      await expect(
        service.updateParticipant(TENANT_ID, EVENT_ID, PARTICIPANT_ID, { status: 'registered' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── register ─────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should register a new participant', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: 30, status: 'open' }]);
      (mockTx as Record<string, unknown>).engagementEventParticipant = {
        ...mockTx.engagementEventParticipant,
        count: jest.fn().mockResolvedValue(5),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          ...mockParticipant,
          status: 'registered',
          registered_at: new Date(),
        }),
      };

      const result = await service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id');

      expect((result as Record<string, unknown>).status).toBe('registered');
    });

    it('should throw when event is full', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: 5, status: 'open' }]);
      (mockTx as Record<string, unknown>).engagementEventParticipant = {
        ...mockTx.engagementEventParticipant,
        count: jest.fn().mockResolvedValue(5),
      };

      await expect(service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id')).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw when event not open', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: 30, status: 'draft' }]);

      await expect(service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('should withdraw a participant', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(mockParticipant);
      mockTx.engagementEventParticipant.update.mockResolvedValue({
        ...mockParticipant,
        status: 'withdrawn',
      });

      const result = await service.withdraw(TENANT_ID, EVENT_ID, STUDENT_ID);

      expect((result as Record<string, unknown>).status).toBe('withdrawn');
    });

    it('should throw when participant not found', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(null);

      await expect(service.withdraw(TENANT_ID, EVENT_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── remindOutstanding ────────────────────────────────────────────────────

  describe('remindOutstanding', () => {
    it('should enqueue reminders for pending participants', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          student: {
            student_parents: [{ parent: { user_id: PARENT_USER_ID } }],
          },
        },
      ]);

      const result = await service.remindOutstanding(TENANT_ID, EVENT_ID);

      expect(result.reminded).toBe(1);
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'notifications:dispatch',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          type: 'engagement_reminder',
          recipient_ids: [PARENT_USER_ID],
        }),
      );
    });

    it('should return 0 when no pending participants', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);

      const result = await service.remindOutstanding(TENANT_ID, EVENT_ID);

      expect(result.reminded).toBe(0);
      expect(mockNotificationsQueue.add).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(null);

      await expect(service.remindOutstanding(TENANT_ID, EVENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: skips parents with null user_id', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          student: {
            student_parents: [
              { parent: { user_id: null } },
              { parent: { user_id: PARENT_USER_ID } },
            ],
          },
        },
      ]);

      const result = await service.remindOutstanding(TENANT_ID, EVENT_ID);

      expect(result.reminded).toBe(1);
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'notifications:dispatch',
        expect.objectContaining({
          recipient_ids: [PARENT_USER_ID],
        }),
      );
    });
  });

  // ─── resolveTargetStudents — additional branch coverage ─────────────────────

  describe('resolveTargetStudents — additional branches', () => {
    it('should throw when class_ids is missing for class_group', async () => {
      await expect(service.resolveTargetStudents(TENANT_ID, 'class_group', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when class_ids is empty array for class_group', async () => {
      await expect(
        service.resolveTargetStudents(TENANT_ID, 'class_group', { class_ids: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when student_ids is missing for custom', async () => {
      await expect(service.resolveTargetStudents(TENANT_ID, 'custom', null)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when student_ids is empty for custom', async () => {
      await expect(
        service.resolveTargetStudents(TENANT_ID, 'custom', { student_ids: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when year_group_ids is empty array', async () => {
      await expect(
        service.resolveTargetStudents(TENANT_ID, 'year_group', { year_group_ids: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: throws for unknown target type', async () => {
      await expect(
        service.resolveTargetStudents(TENANT_ID, 'unknown_type' as 'whole_school', null),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── createParticipantsForEvent — additional branches ───────────────────────

  describe('createParticipantsForEvent — additional branches', () => {
    it('edge: returns { created: 0 } when no students resolved', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockEvent);
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.createParticipantsForEvent(TENANT_ID, EVENT_ID);

      expect((result as Record<string, unknown>).created).toBe(0);
    });

    it('edge: fee_amount of 0 results in not_required payment', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue({
        ...mockEvent,
        fee_amount: 0,
      });
      mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);
      mockTx.engagementEventParticipant.createMany.mockResolvedValue({ count: 1 });

      await service.createParticipantsForEvent(TENANT_ID, EVENT_ID);

      expect(mockTx.engagementEventParticipant.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ payment_status: 'not_required' }),
          ]),
        }),
      );
    });
  });

  // ─── register — additional branches ─────────────────────────────────────────

  describe('register — additional branches', () => {
    it('should throw when event not found', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: re-registers a withdrawn participant', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: null, status: 'open' }]);
      (mockTx as Record<string, unknown>).engagementEventParticipant = {
        ...mockTx.engagementEventParticipant,
        findFirst: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'withdrawn',
        }),
        update: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'registered',
        }),
      };

      const result = await service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id');

      expect((result as Record<string, unknown>).status).toBe('registered');
    });

    it('edge: updates existing invited participant to registered', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: null, status: 'open' }]);
      (mockTx as Record<string, unknown>).engagementEventParticipant = {
        ...mockTx.engagementEventParticipant,
        findFirst: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'invited',
        }),
        update: jest.fn().mockResolvedValue({
          id: PARTICIPANT_ID,
          status: 'registered',
        }),
      };

      const result = await service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id');

      expect((result as Record<string, unknown>).status).toBe('registered');
    });

    it('edge: null capacity allows unlimited registration', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ id: EVENT_ID, capacity: null, status: 'open' }]);
      (mockTx as Record<string, unknown>).engagementEventParticipant = {
        ...mockTx.engagementEventParticipant,
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-part', status: 'registered' }),
      };

      const result = await service.register(TENANT_ID, EVENT_ID, STUDENT_ID, 'user-id');

      expect((result as Record<string, unknown>).status).toBe('registered');
    });
  });

  // ─── findAllForEvent — additional filter branches ───────────────────────────

  describe('findAllForEvent — filter branches', () => {
    it('should apply consent_status filter', async () => {
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.engagementEventParticipant.count.mockResolvedValue(0);

      await service.findAllForEvent(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
        consent_status: 'granted',
      });

      expect(mockPrisma.engagementEventParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ consent_status: 'granted' }),
        }),
      );
    });

    it('should apply payment_status filter', async () => {
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.engagementEventParticipant.count.mockResolvedValue(0);

      await service.findAllForEvent(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
        payment_status: 'pending',
      });

      expect(mockPrisma.engagementEventParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ payment_status: 'pending' }),
        }),
      );
    });
  });

  // ─── updateParticipant — partial update branches ────────────────────────────

  describe('updateParticipant — partial update branches', () => {
    it('should update only status when only status provided', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(mockParticipant);
      mockTx.engagementEventParticipant.update.mockResolvedValue({
        ...mockParticipant,
        status: 'registered',
      });

      await service.updateParticipant(TENANT_ID, EVENT_ID, PARTICIPANT_ID, {
        status: 'registered',
      });

      expect(mockTx.engagementEventParticipant.update).toHaveBeenCalledWith({
        where: { id: PARTICIPANT_ID },
        data: { status: 'registered' },
      });
    });

    it('should update payment_status when provided', async () => {
      mockPrisma.engagementEventParticipant.findFirst.mockResolvedValue(mockParticipant);
      mockTx.engagementEventParticipant.update.mockResolvedValue({
        ...mockParticipant,
        payment_status: 'paid',
      });

      await service.updateParticipant(TENANT_ID, EVENT_ID, PARTICIPANT_ID, {
        payment_status: 'paid',
      });

      expect(mockTx.engagementEventParticipant.update).toHaveBeenCalledWith({
        where: { id: PARTICIPANT_ID },
        data: { payment_status: 'paid' },
      });
    });
  });
});
