import { getQueueToken } from '@nestjs/bullmq';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { SstMeetingService } from './sst-meeting.service';
import { SstService } from './sst.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID_C = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MEETING_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  sstMeeting: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  sstMeetingAgendaItem: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  sstMeetingAction: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeMeeting = (overrides: Record<string, unknown> = {}) => ({
  id: MEETING_ID,
  tenant_id: TENANT_ID,
  scheduled_at: new Date('2026-04-15T10:00:00Z'),
  status: 'scheduled',
  attendees: [
    { user_id: ACTOR_USER_ID, name: ACTOR_USER_ID, present: null },
    { user_id: USER_ID_B, name: USER_ID_B, present: null },
  ],
  general_notes: null,
  agenda_precomputed_at: null,
  created_by_user_id: ACTOR_USER_ID,
  created_at: new Date('2026-04-01T10:00:00Z'),
  updated_at: new Date('2026-04-01T10:00:00Z'),
  ...overrides,
});

const makeMeetingWithDetails = (overrides: Record<string, unknown> = {}) => ({
  ...makeMeeting(overrides),
  agenda_items: [],
  actions: [],
  ...(overrides.agenda_items ? { agenda_items: overrides.agenda_items } : {}),
  ...(overrides.actions ? { actions: overrides.actions } : {}),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SstMeetingService', () => {
  let service: SstMeetingService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockSstService: { getActiveMembers: jest.Mock; getActiveMemberUserIds: jest.Mock };
  let mockPastoralQueue: { add: jest.Mock };
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockSstService = {
      getActiveMembers: jest.fn().mockResolvedValue([
        { user_id: ACTOR_USER_ID, name: 'Amina Lead' },
        { user_id: USER_ID_B, name: 'John Smith' },
      ]),
      getActiveMemberUserIds: jest.fn().mockResolvedValue([ACTOR_USER_ID, USER_ID_B]),
    };

    mockPastoralQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue({
          tenant_id: TENANT_ID,
          settings: {
            pastoral: {
              sst: {
                meeting_frequency: 'fortnightly',
                auto_agenda_sources: ['new_concerns', 'case_reviews'],
                precompute_minutes_before: 30,
              },
            },
          },
        }),
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
        SstMeetingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: SstService, useValue: mockSstService },
        { provide: getQueueToken('pastoral'), useValue: mockPastoralQueue },
      ],
    }).compile();

    service = module.get<SstMeetingService>(SstMeetingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createMeeting ──────────────────────────────────────────────────────────

  describe('createMeeting', () => {
    it('should create meeting with auto-populated attendees from active SST members', async () => {
      const createdMeeting = makeMeeting();
      mockRlsTx.sstMeeting.create.mockResolvedValue(createdMeeting);

      const result = await service.createMeeting(
        TENANT_ID,
        { scheduled_at: '2026-04-15T10:00:00Z' },
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(MEETING_ID);
      expect(mockSstService.getActiveMembers).toHaveBeenCalledWith(TENANT_ID);
      expect(mockRlsTx.sstMeeting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'scheduled',
          created_by_user_id: ACTOR_USER_ID,
          attendees: expect.arrayContaining([
            expect.objectContaining({
              user_id: ACTOR_USER_ID,
              name: 'Amina Lead',
              present: null,
            }),
            expect.objectContaining({
              user_id: USER_ID_B,
              name: 'John Smith',
              present: null,
            }),
          ]),
        }),
      });
    });

    it('should enqueue BullMQ pastoral:precompute-agenda job on creation', async () => {
      mockRlsTx.sstMeeting.create.mockResolvedValue(makeMeeting());

      await service.createMeeting(
        TENANT_ID,
        { scheduled_at: '2026-04-15T10:00:00Z' },
        ACTOR_USER_ID,
      );

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:precompute-agenda',
        {
          tenant_id: TENANT_ID,
          user_id: ACTOR_USER_ID,
          meeting_id: MEETING_ID,
        },
        expect.objectContaining({
          delay: expect.any(Number),
          jobId: `pastoral:precompute-agenda:${TENANT_ID}:${MEETING_ID}`,
        }),
      );
    });

    it('should enqueue job with correct delay based on tenant precompute_minutes_before', async () => {
      // Schedule 60 minutes from now
      const now = Date.now();
      const scheduledAt = new Date(now + 60 * 60 * 1000);
      const createdMeeting = makeMeeting({ scheduled_at: scheduledAt });
      mockRlsTx.sstMeeting.create.mockResolvedValue(createdMeeting);

      await service.createMeeting(
        TENANT_ID,
        { scheduled_at: scheduledAt.toISOString() },
        ACTOR_USER_ID,
      );

      // precompute_minutes_before = 30, so delay should be ~30 minutes
      const addCall = mockPastoralQueue.add.mock.calls[0];
      const options = addCall?.[2] as { delay: number } | undefined;
      const delay = options?.delay ?? 0;
      // Allow 5s tolerance for test execution time
      const expectedDelay = 30 * 60 * 1000;
      expect(delay).toBeGreaterThan(expectedDelay - 5000);
      expect(delay).toBeLessThan(expectedDelay + 5000);
    });

    it('should set delay to 0 when meeting is in the past or within precompute window', async () => {
      const pastDate = new Date('2020-01-01T10:00:00Z');
      const createdMeeting = makeMeeting({ scheduled_at: pastDate });
      mockRlsTx.sstMeeting.create.mockResolvedValue(createdMeeting);

      await service.createMeeting(
        TENANT_ID,
        { scheduled_at: pastDate.toISOString() },
        ACTOR_USER_ID,
      );

      const addCall = mockPastoralQueue.add.mock.calls[0];
      const options = addCall?.[2] as { delay: number } | undefined;
      expect(options?.delay).toBe(0);
    });

    it('should record meeting_created audit event', async () => {
      mockRlsTx.sstMeeting.create.mockResolvedValue(makeMeeting());

      await service.createMeeting(
        TENANT_ID,
        { scheduled_at: '2026-04-15T10:00:00Z' },
        ACTOR_USER_ID,
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'meeting_created',
          entity_type: 'meeting',
          entity_id: MEETING_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            meeting_id: MEETING_ID,
            scheduled_at: '2026-04-15T10:00:00Z',
            created_by_user_id: ACTOR_USER_ID,
            attendee_count: 2,
          }),
        }),
      );
    });
  });

  // ─── getMeeting ─────────────────────────────────────────────────────────────

  describe('getMeeting', () => {
    it('should return meeting with agenda items and actions', async () => {
      const meetingWithDetails = makeMeetingWithDetails({
        agenda_items: [
          {
            id: 'agenda-1',
            meeting_id: MEETING_ID,
            source: 'manual',
            student_id: null,
            case_id: null,
            concern_id: null,
            description: 'Review student progress',
            discussion_notes: null,
            decisions: null,
            display_order: 0,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(meetingWithDetails);

      const result = await service.getMeeting(TENANT_ID, MEETING_ID);

      expect(result.id).toBe(MEETING_ID);
      expect(result.agenda_items).toHaveLength(1);
      expect(result.agenda_items[0]!.description).toBe('Review student progress');
    });

    it('should throw NotFoundException for non-existent meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(null);

      await expect(service.getMeeting(TENANT_ID, 'nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── listMeetings ──────────────────────────────────────────────────────────

  describe('listMeetings', () => {
    it('should return paginated meetings', async () => {
      const meetings = [makeMeeting(), makeMeeting({ id: '22222222-2222-2222-2222-222222222222' })];
      mockRlsTx.sstMeeting.findMany.mockResolvedValue(meetings);
      mockRlsTx.sstMeeting.count.mockResolvedValue(2);

      const result = await service.listMeetings(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('should filter by status when provided', async () => {
      mockRlsTx.sstMeeting.findMany.mockResolvedValue([makeMeeting()]);
      mockRlsTx.sstMeeting.count.mockResolvedValue(1);

      await service.listMeetings(TENANT_ID, {
        status: 'scheduled',
        page: 1,
        pageSize: 20,
      });

      expect(mockRlsTx.sstMeeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'scheduled',
          }),
        }),
      );
    });

    it('should respect page and pageSize parameters', async () => {
      mockRlsTx.sstMeeting.findMany.mockResolvedValue([]);
      mockRlsTx.sstMeeting.count.mockResolvedValue(0);

      await service.listMeetings(TENANT_ID, {
        page: 3,
        pageSize: 10,
      });

      expect(mockRlsTx.sstMeeting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ─── State machine transitions ────────────────────────────────────────────

  describe('startMeeting', () => {
    it('should transition scheduled -> in_progress', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'scheduled' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));

      const result = await service.startMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(result.status).toBe('sst_in_progress');
      expect(mockRlsTx.sstMeeting.update).toHaveBeenCalledWith({
        where: { id: MEETING_ID },
        data: { status: 'sst_in_progress' },
      });
    });

    it('should record meeting_status_changed audit event on start', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'scheduled' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));

      await service.startMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'meeting_status_changed',
          entity_type: 'meeting',
          entity_id: MEETING_ID,
          payload: expect.objectContaining({
            meeting_id: MEETING_ID,
            old_status: 'scheduled',
            new_status: 'in_progress',
            changed_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });
  });

  describe('completeMeeting', () => {
    it('should transition in_progress -> completed', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      const result = await service.completeMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(result.status).toBe('sst_completed');
      expect(mockRlsTx.sstMeeting.update).toHaveBeenCalledWith({
        where: { id: MEETING_ID },
        data: { status: 'sst_completed' },
      });
    });

    it('should record meeting_status_changed audit event on complete', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      await service.completeMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'meeting_status_changed',
          payload: expect.objectContaining({
            old_status: 'in_progress',
            new_status: 'completed',
          }),
        }),
      );
    });
  });

  describe('cancelMeeting', () => {
    it('should transition scheduled -> cancelled', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'scheduled' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_cancelled' }));

      const result = await service.cancelMeeting(
        TENANT_ID,
        MEETING_ID,
        ACTOR_USER_ID,
        'No quorum available',
      );

      expect(result.status).toBe('sst_cancelled');
    });

    it('should transition in_progress -> cancelled', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_cancelled' }));

      const result = await service.cancelMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID);

      expect(result.status).toBe('sst_cancelled');
    });

    it('should include reason in audit event payload when cancelling', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'scheduled' }));
      mockRlsTx.sstMeeting.update.mockResolvedValue(makeMeeting({ status: 'sst_cancelled' }));

      await service.cancelMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID, 'Insufficient attendance');

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'meeting_status_changed',
          payload: expect.objectContaining({
            old_status: 'scheduled',
            new_status: 'cancelled',
            reason: 'Insufficient attendance',
          }),
        }),
      );
    });
  });

  // ─── Blocked invalid transitions ──────────────────────────────────────────

  describe('invalid transitions', () => {
    it('should reject completed -> in_progress (terminal state)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      await expect(service.startMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject completed -> cancelled (terminal state)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      await expect(service.cancelMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject cancelled -> in_progress (terminal state)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_cancelled' }));

      await expect(service.startMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject cancelled -> completed (terminal state)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_cancelled' }));

      await expect(service.completeMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject scheduled -> completed (must go through in_progress)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'scheduled' }));

      await expect(service.completeMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should reject in_progress -> scheduled (backward transition)', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));

      // No direct method for transitioning to "scheduled",
      // but calling startMeeting on an in_progress meeting should fail
      // since in_progress -> in_progress is not valid
      await expect(service.startMeeting(TENANT_ID, MEETING_ID, ACTOR_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for transition on non-existent meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(null);

      await expect(
        service.startMeeting(TENANT_ID, 'nonexistent-id', ACTOR_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Edit lockout on completed meetings ─────────────────────────────────────

  describe('edit lockout', () => {
    it('should throw ConflictException when updating attendees on completed meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      await expect(
        service.updateAttendees(
          TENANT_ID,
          MEETING_ID,
          [{ user_id: ACTOR_USER_ID, name: 'Test', present: true }],
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when updating general notes on completed meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_completed' }));

      await expect(
        service.updateGeneralNotes(TENANT_ID, MEETING_ID, 'Updated notes', ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow updating attendees on scheduled meeting', async () => {
      const meeting = makeMeeting({ status: 'scheduled' });
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(meeting);

      const updatedAttendees = [
        { user_id: ACTOR_USER_ID, name: 'Actor', present: true },
        { user_id: USER_ID_B, name: 'User B', present: false },
      ];
      mockRlsTx.sstMeeting.update.mockResolvedValue({
        ...meeting,
        attendees: updatedAttendees,
      });

      const result = await service.updateAttendees(
        TENANT_ID,
        MEETING_ID,
        updatedAttendees,
        ACTOR_USER_ID,
      );

      expect(result).toBeDefined();
      expect(mockRlsTx.sstMeeting.update).toHaveBeenCalledWith({
        where: { id: MEETING_ID },
        data: {
          attendees: updatedAttendees,
        },
      });
    });

    it('should allow updating attendees on in_progress meeting', async () => {
      const meeting = makeMeeting({ status: 'sst_in_progress' });
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(meeting);
      mockRlsTx.sstMeeting.update.mockResolvedValue({
        ...meeting,
        attendees: [{ user_id: ACTOR_USER_ID, name: 'Actor', present: true }],
      });

      await expect(
        service.updateAttendees(
          TENANT_ID,
          MEETING_ID,
          [{ user_id: ACTOR_USER_ID, name: 'Actor', present: true }],
          ACTOR_USER_ID,
        ),
      ).resolves.not.toThrow();
    });

    it('should allow updating general notes on in_progress meeting', async () => {
      const meeting = makeMeeting({ status: 'sst_in_progress' });
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(meeting);
      mockRlsTx.sstMeeting.update.mockResolvedValue({
        ...meeting,
        general_notes: 'Updated notes',
      });

      const result = await service.updateGeneralNotes(
        TENANT_ID,
        MEETING_ID,
        'Updated notes',
        ACTOR_USER_ID,
      );

      expect(result.general_notes).toBe('Updated notes');
    });
  });

  // ─── updateAttendees ──────────────────────────────────────────────────────

  describe('updateAttendees', () => {
    it('should update attendees JSONB and write audit event', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(makeMeeting({ status: 'sst_in_progress' }));

      const updatedAttendees = [
        { user_id: ACTOR_USER_ID, name: 'Actor User', present: true },
        { user_id: USER_ID_B, name: 'User B', present: false },
        { user_id: USER_ID_C, name: 'User C', present: true },
      ];

      mockRlsTx.sstMeeting.update.mockResolvedValue(
        makeMeeting({
          status: 'sst_in_progress',
          attendees: updatedAttendees,
        }),
      );

      await service.updateAttendees(TENANT_ID, MEETING_ID, updatedAttendees, ACTOR_USER_ID);

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'meeting_attendees_updated',
          entity_type: 'meeting',
          entity_id: MEETING_ID,
          payload: expect.objectContaining({
            meeting_id: MEETING_ID,
            attendees_present: 2,
            attendees_absent: 1,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateAttendees(
          TENANT_ID,
          'nonexistent-id',
          [{ user_id: ACTOR_USER_ID, name: 'Test', present: true }],
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateGeneralNotes ─────────────────────────────────────────────────────

  describe('updateGeneralNotes', () => {
    it('should update general notes on editable meeting', async () => {
      const meeting = makeMeeting({ status: 'sst_in_progress' });
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(meeting);
      mockRlsTx.sstMeeting.update.mockResolvedValue({
        ...meeting,
        general_notes: 'Meeting went well. Follow-up needed.',
      });

      const result = await service.updateGeneralNotes(
        TENANT_ID,
        MEETING_ID,
        'Meeting went well. Follow-up needed.',
        ACTOR_USER_ID,
      );

      expect(result.general_notes).toBe('Meeting went well. Follow-up needed.');
      expect(mockRlsTx.sstMeeting.update).toHaveBeenCalledWith({
        where: { id: MEETING_ID },
        data: { general_notes: 'Meeting went well. Follow-up needed.' },
      });
    });

    it('should throw NotFoundException for non-existent meeting', async () => {
      mockRlsTx.sstMeeting.findUnique.mockResolvedValue(null);

      await expect(
        service.updateGeneralNotes(TENANT_ID, 'nonexistent-id', 'Some notes', ACTOR_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assertMeetingEditable ──────────────────────────────────────────────────

  describe('assertMeetingEditable', () => {
    it('should not throw for scheduled meeting', () => {
      const meeting = makeMeeting({ status: 'scheduled' }) as Parameters<
        typeof service.assertMeetingEditable
      >[0];
      expect(() => service.assertMeetingEditable(meeting)).not.toThrow();
    });

    it('should not throw for in_progress meeting', () => {
      const meeting = makeMeeting({ status: 'sst_in_progress' }) as Parameters<
        typeof service.assertMeetingEditable
      >[0];
      expect(() => service.assertMeetingEditable(meeting)).not.toThrow();
    });

    it('should throw ConflictException for completed meeting', () => {
      const meeting = makeMeeting({ status: 'sst_completed' }) as Parameters<
        typeof service.assertMeetingEditable
      >[0];
      expect(() => service.assertMeetingEditable(meeting)).toThrow(ConflictException);
    });

    it('should not throw for cancelled meeting (editable for administrative purposes)', () => {
      const meeting = makeMeeting({ status: 'sst_cancelled' }) as Parameters<
        typeof service.assertMeetingEditable
      >[0];
      expect(() => service.assertMeetingEditable(meeting)).not.toThrow();
    });
  });

  // ─── enqueueAgendaPrecompute ──────────────────────────────────────────────

  describe('enqueueAgendaPrecompute', () => {
    it('should enqueue with correct job name and payload', async () => {
      const scheduledAt = new Date('2026-04-15T10:00:00Z');

      await service.enqueueAgendaPrecompute(TENANT_ID, MEETING_ID, scheduledAt, ACTOR_USER_ID);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:precompute-agenda',
        {
          tenant_id: TENANT_ID,
          user_id: ACTOR_USER_ID,
          meeting_id: MEETING_ID,
        },
        expect.objectContaining({
          jobId: `pastoral:precompute-agenda:${TENANT_ID}:${MEETING_ID}`,
        }),
      );
    });

    it('should not throw when queue add fails (best-effort)', async () => {
      mockPastoralQueue.add.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        service.enqueueAgendaPrecompute(
          TENANT_ID,
          MEETING_ID,
          new Date('2026-04-15T10:00:00Z'),
          ACTOR_USER_ID,
        ),
      ).resolves.not.toThrow();
    });
  });
});
