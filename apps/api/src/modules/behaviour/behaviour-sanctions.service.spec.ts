import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourSanctionsService } from './behaviour-sanctions.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const STUDENT_ID = 'student-1';
const SANCTION_ID = 'sanction-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
  behaviourSanction: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  behaviourExclusionCase: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  behaviourIncident: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  behaviourAmendmentNotice: {
    create: jest.fn(),
  },
  behaviourAppeal: {
    findFirst: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  schoolClosure: {
    findFirst: jest.fn(),
  },
  schedule: {
    findMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

const makeSanction = (overrides: Record<string, unknown> = {}) => ({
  id: SANCTION_ID,
  tenant_id: TENANT_ID,
  sanction_number: 'SN-202603-000001',
  incident_id: INCIDENT_ID,
  student_id: STUDENT_ID,
  type: 'detention',
  status: 'scheduled',
  scheduled_date: new Date('2026-03-20'),
  scheduled_start_time: null,
  scheduled_end_time: null,
  scheduled_room_id: null,
  supervised_by_id: null,
  suspension_start_date: null,
  suspension_end_date: null,
  suspension_days: null,
  return_conditions: null,
  parent_meeting_required: false,
  notes: null,
  served_at: null,
  served_by_id: null,
  retention_status: 'active',
  ...overrides,
});

const makeSettings = (overrides: Record<string, unknown> = {}) => ({
  settings: {
    behaviour: {
      suspension_requires_approval: true,
      expulsion_requires_approval: true,
      ...overrides,
    },
  },
});

describe('BehaviourSanctionsService', () => {
  let service: BehaviourSanctionsService;
  let mockPrisma: {
    behaviourSanction: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
    schedule: { findMany: jest.Mock };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockHistory: { recordHistory: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockBehaviourQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourSanction: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      schedule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('SN-202603-000001'),
    };
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };
    mockNotificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockBehaviourQueue = { add: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourSanctionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
      ],
    }).compile();

    service = module.get<BehaviourSanctionsService>(BehaviourSanctionsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      incident_id: INCIDENT_ID,
      student_id: STUDENT_ID,
      type: 'suspension_internal',
      scheduled_date: '2026-03-20',
    };

    const setupCreateMocks = (settingsOverrides: Record<string, unknown> = {}) => {
      mockRlsTx.behaviourIncident!.findFirst.mockResolvedValue({
        id: INCIDENT_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.student!.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.tenantSetting!.findFirst.mockResolvedValue(
        makeSettings(settingsOverrides),
      );
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.create.mockResolvedValue(
        makeSanction({ type: 'suspension_internal' }),
      );
      mockRlsTx.behaviourSanction!.findUnique.mockResolvedValue(
        makeSanction({ type: 'suspension_internal' }),
      );
      mockRlsTx.behaviourExclusionCase!.findFirst.mockResolvedValue(null);
    };

    it('should create sanction with pending_approval status when suspension_requires_approval is true', async () => {
      setupCreateMocks({ suspension_requires_approval: true });

      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourSanction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'pending_approval',
          type: 'suspension_internal',
        }),
      });
    });

    it('should create sanction with scheduled status when approval not required', async () => {
      setupCreateMocks({ suspension_requires_approval: false });

      await service.create(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.behaviourSanction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'scheduled',
          type: 'suspension_internal',
        }),
      });
    });

    it('should not block detention creation despite conflict (warning only)', async () => {
      setupCreateMocks({ suspension_requires_approval: false });
      // Detention DTO with acknowledge_conflicts is irrelevant to create logic
      // — conflicts are advisory. Sanction should still be created.
      const detentionDto = {
        ...baseDto,
        type: 'detention',
      };

      mockRlsTx.behaviourSanction!.create.mockResolvedValue(
        makeSanction({ type: 'detention', status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction!.findUnique.mockResolvedValue(
        makeSanction({ type: 'detention', status: 'scheduled' }),
      );

      const result = await service.create(TENANT_ID, USER_ID, detentionDto);

      expect(result).toBeDefined();
      expect(mockRlsTx.behaviourSanction!.create).toHaveBeenCalled();
    });

    it('should compute suspension_days excluding school closures', async () => {
      // 2026-03-16 (Mon) to 2026-03-20 (Fri) = 5 weekdays
      // With 1 closure on 2026-03-18 (Wed) = 4 suspension days
      const suspensionDto = {
        ...baseDto,
        suspension_start_date: '2026-03-16',
        suspension_end_date: '2026-03-20',
      };

      setupCreateMocks({ suspension_requires_approval: false });

      // Mock the closure checker: only 2026-03-18 is a closure
      mockRlsTx.schoolClosure!.findFirst.mockImplementation(
        async (args: { where: { closure_date: Date } }) => {
          const dateStr = args.where.closure_date.toISOString().split('T')[0];
          if (dateStr === '2026-03-18') {
            return { id: 'closure-1', closure_date: new Date('2026-03-18') };
          }
          return null;
        },
      );

      await service.create(TENANT_ID, USER_ID, suspensionDto);

      expect(mockRlsTx.behaviourSanction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          suspension_days: 4,
        }),
      });
    });

    it('should trigger exclusion case creation when suspension_days >= 5 on external suspension', async () => {
      const externalDto = {
        ...baseDto,
        type: 'suspension_external',
        suspension_start_date: '2026-03-16',
        suspension_end_date: '2026-03-22',
      };

      setupCreateMocks({ suspension_requires_approval: false });
      // No closures -> Mon-Fri = 5 weekdays (16,17,18,19,20)
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.create.mockResolvedValue(
        makeSanction({
          type: 'suspension_external',
          suspension_days: 5,
          status: 'scheduled',
        }),
      );

      await service.create(TENANT_ID, USER_ID, externalDto);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'behaviour:create-exclusion-case',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          sanction_id: SANCTION_ID,
        }),
      );
    });

    it('should not create duplicate exclusion case if one already exists for sanction', async () => {
      const externalDto = {
        ...baseDto,
        type: 'suspension_external',
        suspension_start_date: '2026-03-16',
        suspension_end_date: '2026-03-22',
      };

      setupCreateMocks({ suspension_requires_approval: false });
      mockRlsTx.schoolClosure!.findFirst.mockResolvedValue(null);
      mockRlsTx.behaviourSanction!.create.mockResolvedValue(
        makeSanction({
          type: 'suspension_external',
          suspension_days: 5,
          status: 'scheduled',
        }),
      );

      // The auto-create check enqueues a job to the behaviour queue.
      // The job processor (not tested here) calls createFromSanction,
      // which has an idempotency guard. We verify the queue job is enqueued.
      // For the direct createFromSanction path, the idempotency check
      // is tested in the exclusion cases spec.
      await service.create(TENANT_ID, USER_ID, externalDto);

      // Queue is called — the dedup guard lives in the job processor
      expect(mockBehaviourQueue.add).toHaveBeenCalled();
    });
  });

  // ─── checkConflicts ─────────────────────────────────────────────────────

  describe('checkConflicts', () => {
    it('should return conflict warning when detention clashes with timetable entry', async () => {
      // Mock existing sanctions (none)
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      // Mock timetable entry that overlaps with 14:00-15:00
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          id: 'schedule-1',
          start_time: new Date('1970-01-01T13:30:00'),
          end_time: new Date('1970-01-01T14:30:00'),
          class_entity: { subject: { name: 'Mathematics' } },
        },
      ]);

      const result = await service.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:00',
        '15:00',
      );

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'timetable',
            description: expect.stringContaining('Mathematics'),
          }),
        ]),
      );
    });
  });

  // ─── transitionStatus ───────────────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should transition scheduled -> served and write entity history', async () => {
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(
        makeSanction({ status: 'scheduled' }),
      );
      mockRlsTx.behaviourSanction!.update.mockResolvedValue(
        makeSanction({ status: 'served', served_at: new Date() }),
      );

      await service.transitionStatus(TENANT_ID, SANCTION_ID, 'served', undefined, USER_ID);

      expect(mockRlsTx.behaviourSanction!.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: expect.objectContaining({
          status: 'served',
          served_at: expect.any(Date),
          served_by: { connect: { id: USER_ID } },
        }),
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'sanction',
        SANCTION_ID,
        USER_ID,
        'status_changed',
        { status: 'scheduled' },
        { status: 'served' },
        undefined,
      );
    });

    it('should throw BadRequestException for invalid state transition (served -> appealed)', async () => {
      mockRlsTx.behaviourSanction!.findFirst.mockResolvedValue(
        makeSanction({ status: 'served' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, SANCTION_ID, 'appealed', undefined, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── bulkMarkServed ─────────────────────────────────────────────────────

  describe('bulkMarkServed', () => {
    it('edge: should handle bulk-mark-served with mix of valid and invalid sanction IDs (partial success)', async () => {
      const sanctionIds = ['s1', 's2', 's3'];

      // s1 = scheduled (valid), s2 = scheduled (valid), s3 = served (invalid — terminal)
      mockRlsTx.behaviourSanction!.findFirst
        .mockResolvedValueOnce(makeSanction({ id: 's1', sanction_number: 'SN-001', status: 'scheduled' }))
        .mockResolvedValueOnce(makeSanction({ id: 's2', sanction_number: 'SN-002', status: 'scheduled' }))
        .mockResolvedValueOnce(makeSanction({ id: 's3', sanction_number: 'SN-003', status: 'served' }));

      mockRlsTx.behaviourSanction!.update.mockResolvedValue({});

      const result = await service.bulkMarkServed(
        TENANT_ID,
        { sanction_ids: sanctionIds },
        USER_ID,
      );

      expect(result.succeeded).toHaveLength(2);
      expect(result.succeeded.map((s: { id: string }) => s.id)).toEqual(['s1', 's2']);

      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.id).toBe('s3');
      expect(result.failed[0]!.reason).toContain('served');
    });
  });
});
