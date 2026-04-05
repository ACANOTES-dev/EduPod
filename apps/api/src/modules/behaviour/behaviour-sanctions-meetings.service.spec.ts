import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, SchedulesReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourSanctionsMeetingsService } from './behaviour-sanctions-meetings.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const SANCTION_ID = 'sanction-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourSanction: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourSanctionsMeetingsService', () => {
  let service: BehaviourSanctionsMeetingsService;
  let mockPrisma: {
    behaviourSanction: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourSanction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourSanctionsMeetingsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: SchedulesReadFacade,
          useValue: {
            findByStudentWeekday: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<BehaviourSanctionsMeetingsService>(BehaviourSanctionsMeetingsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── recordParentMeeting ───────────────────────────────────────────────────

  describe('BehaviourSanctionsMeetingsService — recordParentMeeting', () => {
    it('should throw NotFoundException when sanction not found', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue(null);

      await expect(
        service.recordParentMeeting(TENANT_ID, SANCTION_ID, {
          parent_meeting_date: '2026-03-20',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should record parent meeting date and notes', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue({
        id: SANCTION_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.behaviourSanction.update.mockResolvedValue({
        id: SANCTION_ID,
        parent_meeting_date: new Date('2026-03-20'),
        parent_meeting_notes: 'Meeting went well',
      });

      const result = await service.recordParentMeeting(TENANT_ID, SANCTION_ID, {
        parent_meeting_date: '2026-03-20',
        parent_meeting_notes: 'Meeting went well',
      });

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: {
          parent_meeting_date: expect.any(Date),
          parent_meeting_notes: 'Meeting went well',
        },
      });
      expect(result).toBeDefined();
    });

    it('should set parent_meeting_notes to null when not provided', async () => {
      mockRlsTx.behaviourSanction.findFirst.mockResolvedValue({
        id: SANCTION_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.behaviourSanction.update.mockResolvedValue({});

      await service.recordParentMeeting(TENANT_ID, SANCTION_ID, {
        parent_meeting_date: '2026-03-20',
      });

      expect(mockRlsTx.behaviourSanction.update).toHaveBeenCalledWith({
        where: { id: SANCTION_ID },
        data: {
          parent_meeting_date: expect.any(Date),
          parent_meeting_notes: null,
        },
      });
    });
  });

  // ─── checkConflicts ────────────────────────────────────────────────────────

  describe('BehaviourSanctionsMeetingsService — checkConflicts', () => {
    it('should return no conflicts when no existing sanctions and no timetable entries', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      const result = await service.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:00:00',
        '15:00:00',
      );

      expect(result.has_conflicts).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should detect same-day sanction conflict when no times specified', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        {
          id: 's1',
          type: 'detention',
          sanction_number: 'SN-001',
          scheduled_start_time: null,
          scheduled_end_time: null,
        },
      ]);

      const result = await service.checkConflicts(TENANT_ID, STUDENT_ID, '2026-03-20', null, null);

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0]!.type).toBe('sanction');
    });

    it('should detect time overlap conflict with existing sanction', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        {
          id: 's1',
          type: 'detention',
          sanction_number: 'SN-001',
          scheduled_start_time: new Date('1970-01-01T14:00:00'),
          scheduled_end_time: new Date('1970-01-01T15:00:00'),
        },
      ]);

      const result = await service.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:30:00',
        '15:30:00',
      );

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'sanction',
            description: expect.stringContaining('Overlapping'),
          }),
        ]),
      );
    });

    it('should NOT detect conflict for non-overlapping times', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        {
          id: 's1',
          type: 'detention',
          sanction_number: 'SN-001',
          scheduled_start_time: new Date('1970-01-01T10:00:00'),
          scheduled_end_time: new Date('1970-01-01T11:00:00'),
        },
      ]);

      const result = await service.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:00:00',
        '15:00:00',
      );

      expect(result.has_conflicts).toBe(false);
    });

    it('should detect timetable conflict with overlapping schedule entry', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      const module = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          BehaviourSanctionsMeetingsService,
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: SchedulesReadFacade,
            useValue: {
              findByStudentWeekday: jest.fn().mockResolvedValue([
                {
                  id: 'schedule-1',
                  start_time: new Date('1970-01-01T14:00:00'),
                  end_time: new Date('1970-01-01T15:00:00'),
                  class_entity: { subject: { name: 'Mathematics' } },
                },
              ]),
            },
          },
        ],
      }).compile();

      const localService = module.get<BehaviourSanctionsMeetingsService>(
        BehaviourSanctionsMeetingsService,
      );

      const result = await localService.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:30:00',
        '15:30:00',
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

    it('should NOT check timetable overlap when startTime or endTime is null', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      const module = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          BehaviourSanctionsMeetingsService,
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: SchedulesReadFacade,
            useValue: {
              findByStudentWeekday: jest.fn().mockResolvedValue([
                {
                  id: 'schedule-1',
                  start_time: new Date('1970-01-01T14:00:00'),
                  end_time: new Date('1970-01-01T15:00:00'),
                  class_entity: { subject: { name: 'Mathematics' } },
                },
              ]),
            },
          },
        ],
      }).compile();

      const localService = module.get<BehaviourSanctionsMeetingsService>(
        BehaviourSanctionsMeetingsService,
      );

      // No times specified — should not do timetable overlap check
      const result = await localService.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        null,
        null,
      );

      // Only sanction conflicts should be possible, not timetable
      const timetableConflicts = result.conflicts.filter((c) => c.type === 'timetable');
      expect(timetableConflicts).toHaveLength(0);
    });

    it('should detect same-day conflict for existing sanction without times when request has no times', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        {
          id: 's1',
          type: 'detention',
          sanction_number: 'SN-001',
          scheduled_start_time: null,
          scheduled_end_time: null,
        },
      ]);

      const result = await service.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:00:00',
        '15:00:00',
      );

      // When existing sanction has no times, any same-day request is a conflict
      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0]!.description).toContain('same date');
    });

    it('should handle timetable entry with no subject gracefully', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      const module = await Test.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          BehaviourSanctionsMeetingsService,
          { provide: PrismaService, useValue: mockPrisma },
          {
            provide: SchedulesReadFacade,
            useValue: {
              findByStudentWeekday: jest.fn().mockResolvedValue([
                {
                  id: 'schedule-1',
                  start_time: new Date('1970-01-01T14:00:00'),
                  end_time: new Date('1970-01-01T15:00:00'),
                  class_entity: { subject: null },
                },
              ]),
            },
          },
        ],
      }).compile();

      const localService = module.get<BehaviourSanctionsMeetingsService>(
        BehaviourSanctionsMeetingsService,
      );

      const result = await localService.checkConflicts(
        TENANT_ID,
        STUDENT_ID,
        '2026-03-20',
        '14:00:00',
        '15:00:00',
      );

      expect(result.has_conflicts).toBe(true);
      expect(result.conflicts[0]!.description).toContain('class');
    });
  });
});
