import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import type { InterventionRow } from './intervention.service';
import { InterventionService } from './intervention.service';
import { PastoralEventService } from './pastoral-event.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CASE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const INTERVENTION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PROGRESS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  pastoralIntervention: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralInterventionAction: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  pastoralInterventionProgress: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  pastoralCase: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  tenantSetting: {
    findUnique: jest.fn(),
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

const DEFAULT_INTERVENTION_TYPES = [
  { key: 'academic_support', label: 'Academic Support', active: true },
  { key: 'behavioural_support', label: 'Behavioural Support', active: true },
  { key: 'social_emotional', label: 'Social-Emotional Support', active: true },
];

const makeTenantSettings = (overrides: Record<string, unknown> = {}) => ({
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      intervention_types: DEFAULT_INTERVENTION_TYPES,
      ...overrides,
    },
  },
});

const makeCase = (overrides: Record<string, unknown> = {}) => ({
  id: CASE_ID,
  tenant_id: TENANT_ID,
  status: 'open',
  owner_user_id: ACTOR_USER_ID,
  student_id: STUDENT_ID,
  ...overrides,
});

const makeIntervention = (overrides: Record<string, unknown> = {}) => ({
  id: INTERVENTION_ID,
  tenant_id: TENANT_ID,
  case_id: CASE_ID,
  student_id: STUDENT_ID,
  intervention_type: 'academic_support',
  continuum_level: 2,
  target_outcomes: [{ description: 'Improve reading', measurable_target: 'Grade C to B' }],
  review_cycle_weeks: 6,
  next_review_date: new Date('2026-05-08T00:00:00Z'),
  parent_informed: false,
  parent_consented: null,
  parent_input: null,
  student_voice: null,
  status: 'pc_active',
  outcome_notes: null,
  created_by_user_id: ACTOR_USER_ID,
  created_at: new Date('2026-03-27T10:00:00Z'),
  updated_at: new Date('2026-03-27T10:00:00Z'),
  ...overrides,
});

const baseCreateDto = {
  case_id: CASE_ID,
  student_id: STUDENT_ID,
  intervention_type: 'academic_support',
  continuum_level: 2 as const,
  target_outcomes: [{ description: 'Improve reading', measurable_target: 'Grade C to B' }],
  review_cycle_weeks: 6,
  next_review_date: '2026-05-08',
  parent_informed: false,
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('InterventionService', () => {
  let service: InterventionService;
  let mockEventService: { write: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock; getJob: jest.Mock };
  let mockPrisma: {
    pastoralIntervention: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    mockPrisma = {
      pastoralIntervention: {
        findUnique: jest.fn().mockResolvedValue(null),
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
        InterventionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockEventService },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
      ],
    }).compile();

    service = module.get<InterventionService>(InterventionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createIntervention ─────────────────────────────────────────────────

  describe('createIntervention', () => {
    const setupCreateMocks = () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());
      const intervention = makeIntervention();
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(intervention);
      return intervention;
    };

    it('should create intervention when case exists and is open', async () => {
      setupCreateMocks();

      const result = await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);

      expect(result.id).toBe(INTERVENTION_ID);
      expect(mockRlsTx.pastoralCase.findFirst).toHaveBeenCalledWith({
        where: { id: CASE_ID, tenant_id: TENANT_ID },
        select: { id: true, status: true, owner_user_id: true },
      });
      expect(mockRlsTx.pastoralIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          case_id: CASE_ID,
          student_id: STUDENT_ID,
          intervention_type: 'academic_support',
          continuum_level: 2,
          status: 'pc_active',
        }),
      });
    });

    it('should validate case exists and is open/active', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(null);
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      await expect(
        service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject when case is in a closed status', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ status: 'closed' }));
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      await expect(
        service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject unknown intervention_type', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      await expect(
        service.createIntervention(
          TENANT_ID,
          { ...baseCreateDto, intervention_type: 'nonexistent_type' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate next_review_date correctly', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      const intervention = makeIntervention();
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(intervention);

      await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);

      const createCall = mockRlsTx.pastoralIntervention.create.mock.calls[0][0] as {
        data: { next_review_date: Date; review_cycle_weeks: number };
      };
      const nextReview = createCall.data.next_review_date;
      const now = new Date();
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 6 * 7);

      // Allow 5 second tolerance for test execution time
      expect(Math.abs(nextReview.getTime() - expectedDate.getTime())).toBeLessThan(5000);
    });

    it('should enqueue BullMQ review reminder job', async () => {
      setupCreateMocks();

      await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'pastoral:intervention-review-reminder',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          case_id: CASE_ID,
          student_id: STUDENT_ID,
        }),
        expect.objectContaining({
          jobId: expect.stringContaining(`intervention-review-${INTERVENTION_ID}`),
          delay: expect.any(Number),
          attempts: 2,
        }),
      );
    });

    it('should emit intervention_created event', async () => {
      setupCreateMocks();

      await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'intervention_created',
          entity_type: 'intervention',
          entity_id: INTERVENTION_ID,
          student_id: STUDENT_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            intervention_id: INTERVENTION_ID,
            case_id: CASE_ID,
            type: 'academic_support',
            continuum_level: 2,
          }),
        }),
      );
    });
  });

  // ─── updateIntervention ─────────────────────────────────────────────────

  describe('updateIntervention', () => {
    it('should update intervention when status is pc_active', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({ parent_informed: true });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      const result = await service.updateIntervention(
        TENANT_ID,
        INTERVENTION_ID,
        { parent_informed: true },
        ACTOR_USER_ID,
      );

      expect(result.parent_informed).toBe(true);
      expect(mockRlsTx.pastoralIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: { parent_informed: true },
      });
    });

    it('should throw ConflictException when status is achieved (terminal)', async () => {
      const existing = makeIntervention({ status: 'achieved' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateIntervention(
          TENANT_ID,
          INTERVENTION_ID,
          { parent_informed: true },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when status is escalated (terminal)', async () => {
      const existing = makeIntervention({ status: 'escalated' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateIntervention(
          TENANT_ID,
          INTERVENTION_ID,
          { parent_informed: true },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should emit intervention_updated with previous_snapshot and changed_fields', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        parent_informed: true,
        student_voice: 'I feel supported',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      await service.updateIntervention(
        TENANT_ID,
        INTERVENTION_ID,
        { parent_informed: true, student_voice: 'I feel supported' },
        ACTOR_USER_ID,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'intervention_updated',
          payload: expect.objectContaining({
            intervention_id: INTERVENTION_ID,
            previous_snapshot: expect.objectContaining({
              parent_informed: false,
              student_voice: null,
            }),
            changed_fields: expect.arrayContaining(['parent_informed', 'student_voice']),
          }),
        }),
      );
    });
  });

  // ─── listInterventions ───────────────────────────────────────────────────

  describe('listInterventions', () => {
    it('should include student_name and case_number in list results', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          ...makeIntervention(),
          student: { first_name: 'Sam', last_name: 'Learner' },
          case: { case_number: 'CASE-202603-0001' },
        },
      ]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(1);

      const result = await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc',
      });

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          student_name: 'Sam Learner',
          case_number: 'CASE-202603-0001',
        }),
      );
      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            student: {
              select: { first_name: true, last_name: true },
            },
            case: {
              select: { case_number: true },
            },
          },
        }),
      );
    });
  });

  // ─── changeStatus ───────────────────────────────────────────────────────

  describe('changeStatus', () => {
    it('should transition pc_active to achieved with outcome_notes', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        status: 'achieved',
        outcome_notes: 'All targets met.',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockPrisma.pastoralIntervention.findUnique.mockResolvedValue(updated);

      const result = await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'achieved', outcome_notes: 'All targets met.' },
        ACTOR_USER_ID,
      );

      expect(result.status).toBe('achieved');
      expect(mockRlsTx.pastoralIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: {
          status: 'achieved',
          outcome_notes: 'All targets met.',
        },
      });
    });

    it('should update case next_review_date to today when status is escalated', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        status: 'escalated',
        outcome_notes: 'Needs higher support',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockRlsTx.pastoralCase.update.mockResolvedValue({});
      mockPrisma.pastoralIntervention.findUnique.mockResolvedValue(updated);

      await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'escalated', outcome_notes: 'Needs higher support' },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralCase.update).toHaveBeenCalledWith({
        where: { id: CASE_ID },
        data: { next_review_date: expect.any(Date) },
      });
    });

    it('should reject transition from terminal status', async () => {
      const existing = makeIntervention({ status: 'achieved' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'withdrawn', outcome_notes: 'Testing' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject transition from partially_achieved (terminal)', async () => {
      const existing = makeIntervention({ status: 'partially_achieved' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'achieved', outcome_notes: 'Testing' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should require outcome_notes', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'achieved', outcome_notes: '' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cancel pending reminder job', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        status: 'achieved',
        outcome_notes: 'Done',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      const mockJob = { remove: jest.fn().mockResolvedValue(undefined) };
      mockNotificationsQueue.getJob.mockResolvedValue(mockJob);
      mockPrisma.pastoralIntervention.findUnique.mockResolvedValue(updated);

      await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'achieved', outcome_notes: 'Done' },
        ACTOR_USER_ID,
      );

      expect(mockNotificationsQueue.getJob).toHaveBeenCalled();
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('should emit intervention_status_changed event', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        status: 'not_achieved',
        outcome_notes: 'Targets not met',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockPrisma.pastoralIntervention.findUnique.mockResolvedValue(updated);

      await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'not_achieved', outcome_notes: 'Targets not met' },
        ACTOR_USER_ID,
      );

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'intervention_status_changed',
          entity_id: INTERVENTION_ID,
          payload: expect.objectContaining({
            intervention_id: INTERVENTION_ID,
            old_status: 'active',
            new_status: 'not_achieved',
            outcome_notes: 'Targets not met',
          }),
        }),
      );
    });
  });

  // ─── recordReview ───────────────────────────────────────────────────────

  describe('recordReview', () => {
    it('should advance next_review_date by review_cycle_weeks', async () => {
      const existing = makeIntervention({ review_cycle_weeks: 4 });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        review_cycle_weeks: 4,
        next_review_date: new Date(Date.now() + 4 * 7 * 24 * 60 * 60 * 1000),
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      await service.recordReview(TENANT_ID, INTERVENTION_ID, {}, ACTOR_USER_ID);

      const updateCall = mockRlsTx.pastoralIntervention.update.mock.calls[0][0] as {
        data: { next_review_date: Date };
      };
      const newDate = updateCall.data.next_review_date;
      const now = new Date();
      const expected = new Date(now);
      expected.setDate(expected.getDate() + 4 * 7);

      // Allow 5 second tolerance
      expect(Math.abs(newDate.getTime() - expected.getTime())).toBeLessThan(5000);
    });

    it('should enqueue new reminder job after review', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        next_review_date: new Date(Date.now() + 6 * 7 * 24 * 60 * 60 * 1000),
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      await service.recordReview(TENANT_ID, INTERVENTION_ID, {}, ACTOR_USER_ID);

      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'pastoral:intervention-review-reminder',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
        }),
        expect.objectContaining({
          jobId: expect.stringContaining(`intervention-review-${INTERVENTION_ID}`),
          delay: expect.any(Number),
          attempts: 2,
        }),
      );
    });

    it('should write progress note if review_notes provided', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention();
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockRlsTx.pastoralInterventionProgress.create.mockResolvedValue({
        id: PROGRESS_ID,
        note: 'Review notes here',
      });

      await service.recordReview(
        TENANT_ID,
        INTERVENTION_ID,
        { review_notes: 'Review notes here' },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralInterventionProgress.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          note: 'Review notes here',
          recorded_by_user_id: ACTOR_USER_ID,
        },
      });
    });

    it('should not write progress note if review_notes not provided', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention();
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      await service.recordReview(TENANT_ID, INTERVENTION_ID, {}, ACTOR_USER_ID);

      expect(mockRlsTx.pastoralInterventionProgress.create).not.toHaveBeenCalled();
    });

    it('should reject when status is not pc_active', async () => {
      const existing = makeIntervention({ status: 'achieved' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.recordReview(TENANT_ID, INTERVENTION_ID, {}, ACTOR_USER_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── getInterventionTypes ───────────────────────────────────────────────

  describe('getInterventionTypes', () => {
    it('should return intervention types from tenant settings', async () => {
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      const result = await service.getInterventionTypes(TENANT_ID);

      expect(result).toEqual(DEFAULT_INTERVENTION_TYPES);
      expect(result).toHaveLength(3);
    });

    it('should return defaults when no tenant settings exist', async () => {
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await service.getInterventionTypes(TENANT_ID);

      // Should return the default intervention types from the schema
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('key');
      expect(result[0]).toHaveProperty('label');
      expect(result[0]).toHaveProperty('active');
    });
  });

  // ─── assertInterventionEditable ─────────────────────────────────────────

  describe('assertInterventionEditable', () => {
    it('should not throw for pc_active status', () => {
      const intervention = makeIntervention({ status: 'pc_active' });

      expect(() =>
        service.assertInterventionEditable(intervention as InterventionRow),
      ).not.toThrow();
    });

    it('should throw ConflictException for achieved status', () => {
      const intervention = makeIntervention({ status: 'achieved' });

      expect(() => service.assertInterventionEditable(intervention as InterventionRow)).toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for partially_achieved status', () => {
      const intervention = makeIntervention({ status: 'partially_achieved' });

      expect(() => service.assertInterventionEditable(intervention as InterventionRow)).toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for not_achieved status', () => {
      const intervention = makeIntervention({ status: 'not_achieved' });

      expect(() => service.assertInterventionEditable(intervention as InterventionRow)).toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for escalated status', () => {
      const intervention = makeIntervention({ status: 'escalated' });

      expect(() => service.assertInterventionEditable(intervention as InterventionRow)).toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException for withdrawn status', () => {
      const intervention = makeIntervention({ status: 'withdrawn' });

      expect(() => service.assertInterventionEditable(intervention as InterventionRow)).toThrow(
        ConflictException,
      );
    });
  });

  // ─── addProgressNote ────────────────────────────────────────────────────

  describe('addProgressNote', () => {
    it('should create progress note successfully', async () => {
      const intervention = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(intervention);
      const progressNote = {
        id: PROGRESS_ID,
        tenant_id: TENANT_ID,
        intervention_id: INTERVENTION_ID,
        note: 'Student showing improvement',
        recorded_by_user_id: ACTOR_USER_ID,
        created_at: new Date(),
      };
      mockRlsTx.pastoralInterventionProgress.create.mockResolvedValue(progressNote);

      const result = await service.addProgressNote(
        TENANT_ID,
        INTERVENTION_ID,
        { note: 'Student showing improvement' },
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(PROGRESS_ID);
      expect(mockRlsTx.pastoralInterventionProgress.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          note: 'Student showing improvement',
          recorded_by_user_id: ACTOR_USER_ID,
        },
      });
    });

    it('should allow progress notes on terminal interventions', async () => {
      const intervention = makeIntervention({ status: 'achieved' });
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(intervention);
      mockRlsTx.pastoralInterventionProgress.create.mockResolvedValue({
        id: PROGRESS_ID,
        tenant_id: TENANT_ID,
        intervention_id: INTERVENTION_ID,
        note: 'Post-hoc note',
        recorded_by_user_id: ACTOR_USER_ID,
        created_at: new Date(),
      });

      // Should not throw even though status is terminal
      const result = await service.addProgressNote(
        TENANT_ID,
        INTERVENTION_ID,
        { note: 'Post-hoc note' },
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(PROGRESS_ID);
    });

    it('should emit intervention_progress_added event with note_preview', async () => {
      const intervention = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(intervention);
      const longNote = 'A'.repeat(200);
      mockRlsTx.pastoralInterventionProgress.create.mockResolvedValue({
        id: PROGRESS_ID,
        tenant_id: TENANT_ID,
        intervention_id: INTERVENTION_ID,
        note: longNote,
        recorded_by_user_id: ACTOR_USER_ID,
        created_at: new Date(),
      });

      await service.addProgressNote(TENANT_ID, INTERVENTION_ID, { note: longNote }, ACTOR_USER_ID);

      expect(mockEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'intervention_progress_added',
          payload: expect.objectContaining({
            intervention_id: INTERVENTION_ID,
            progress_id: PROGRESS_ID,
            note_preview: 'A'.repeat(100),
          }),
        }),
      );
    });
  });

  // ─── listProgressNotes ──────────────────────────────────────────────────

  describe('listProgressNotes', () => {
    it('should return notes in chronological order', async () => {
      const notes = [
        {
          id: 'note-1',
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          note: 'First note',
          recorded_by_user_id: ACTOR_USER_ID,
          created_at: new Date('2026-03-27T10:00:00Z'),
        },
        {
          id: 'note-2',
          tenant_id: TENANT_ID,
          intervention_id: INTERVENTION_ID,
          note: 'Second note',
          recorded_by_user_id: ACTOR_USER_ID,
          created_at: new Date('2026-03-28T10:00:00Z'),
        },
      ];
      mockRlsTx.pastoralInterventionProgress.findMany.mockResolvedValue(notes);

      const result = await service.listProgressNotes(TENANT_ID, INTERVENTION_ID);

      expect(result).toHaveLength(2);
      expect(mockRlsTx.pastoralInterventionProgress.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, intervention_id: INTERVENTION_ID },
        orderBy: { created_at: 'asc' },
      });
    });
  });

  // ─── listInterventions — additional branch coverage ────────────────────

  describe('listInterventions — branch coverage', () => {
    it('should apply case_id filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(0);

      await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        case_id: CASE_ID,
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            case_id: CASE_ID,
          }),
        }),
      );
    });

    it('should apply student_id filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(0);

      await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should apply status filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(0);

      await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'pc_active',
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pc_active',
          }),
        }),
      );
    });

    it('should apply continuum_level filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(0);

      await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        continuum_level: 3,
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            continuum_level: 3,
          }),
        }),
      );
    });

    it('should use default page and pageSize when not provided', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(0);

      const result = await service.listInterventions(TENANT_ID, {});

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
    });

    it('should handle null student and case in list results', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([
        {
          ...makeIntervention(),
          student: null,
          case: null,
        },
      ]);
      mockRlsTx.pastoralIntervention.count.mockResolvedValue(1);

      const result = await service.listInterventions(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]!.student_name).toBeNull();
      expect(result.data[0]!.case_number).toBeNull();
    });
  });

  // ─── listInterventionsForStudent — branch coverage ─────────────────────

  describe('listInterventionsForStudent — branch coverage', () => {
    it('should list without filters', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      const result = await service.listInterventionsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(1);
    });

    it('should apply status filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);

      await service.listInterventionsForStudent(TENANT_ID, STUDENT_ID, {
        status: 'pc_active',
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pc_active',
          }),
        }),
      );
    });

    it('should apply continuum_level filter', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([]);

      await service.listInterventionsForStudent(TENANT_ID, STUDENT_ID, {
        continuum_level: 2,
      });

      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            continuum_level: 2,
          }),
        }),
      );
    });
  });

  // ─── listInterventionsForCase — branch coverage ────────────────────────

  describe('listInterventionsForCase', () => {
    it('should list interventions for a given case', async () => {
      mockRlsTx.pastoralIntervention.findMany.mockResolvedValue([makeIntervention()]);

      const result = await service.listInterventionsForCase(TENANT_ID, CASE_ID);

      expect(result).toHaveLength(1);
      expect(mockRlsTx.pastoralIntervention.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, case_id: CASE_ID },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  // ─── getIntervention — branch coverage ─────────────────────────────────

  describe('getIntervention — branch coverage', () => {
    it('should throw NotFoundException when intervention does not exist', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(null);

      await expect(service.getIntervention(TENANT_ID, INTERVENTION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return intervention with mapped details', async () => {
      const interventionWithDetails = {
        ...makeIntervention(),
        actions: [],
        progress: [],
        case: { id: CASE_ID, case_number: 'PC-001', status: 'open' },
        student: { id: STUDENT_ID, first_name: 'Sam', last_name: 'Student' },
      };
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(interventionWithDetails);

      const result = await service.getIntervention(TENANT_ID, INTERVENTION_ID);

      expect(result.id).toBe(INTERVENTION_ID);
      expect(result.recent_progress).toEqual([]);
      expect(result.actions).toEqual([]);
      expect(result.case).toEqual({ id: CASE_ID, case_number: 'PC-001', status: 'open' });
      expect(result.student).toEqual({ id: STUDENT_ID, first_name: 'Sam', last_name: 'Student' });
    });
  });

  // ─── updateIntervention — additional branch coverage ───────────────────

  describe('updateIntervention — branch coverage', () => {
    it('should throw NotFoundException when intervention does not exist', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.updateIntervention(
          TENANT_ID,
          INTERVENTION_ID,
          { parent_informed: true },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update all individual fields', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({
        intervention_type: 'behavioural_support',
        continuum_level: 3,
        target_outcomes: [{ description: 'New goal' }],
        review_cycle_weeks: 4,
        parent_informed: true,
        parent_consented: true,
        parent_input: 'Parent agrees',
        student_voice: 'I understand',
      });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);

      await service.updateIntervention(
        TENANT_ID,
        INTERVENTION_ID,
        {
          intervention_type: 'behavioural_support',
          continuum_level: 3,
          target_outcomes: [{ description: 'New goal', measurable_target: 'Target' }],
          review_cycle_weeks: 4,
          parent_informed: true,
          parent_consented: true,
          parent_input: 'Parent agrees',
          student_voice: 'I understand',
        },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralIntervention.update).toHaveBeenCalledWith({
        where: { id: INTERVENTION_ID },
        data: expect.objectContaining({
          intervention_type: 'behavioural_support',
          continuum_level: 3,
          review_cycle_weeks: 4,
          parent_informed: true,
          parent_consented: true,
          parent_input: 'Parent agrees',
          student_voice: 'I understand',
        }),
      });
    });
  });

  // ─── changeStatus — additional branch coverage ─────────────────────────

  describe('changeStatus — branch coverage', () => {
    it('should throw NotFoundException when intervention does not exist', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'achieved', outcome_notes: 'Done' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid target status', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'invalid_status' as 'achieved', outcome_notes: 'Testing' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject whitespace-only outcome_notes', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);

      await expect(
        service.changeStatus(
          TENANT_ID,
          INTERVENTION_ID,
          { status: 'achieved', outcome_notes: '   ' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not update case when status is not escalated', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({ status: 'achieved', outcome_notes: 'Done' });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockPrisma.pastoralIntervention.findUnique.mockResolvedValue(updated);

      await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'achieved', outcome_notes: 'Done' },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralCase.update).not.toHaveBeenCalled();
    });

    it('edge: should handle cancellation failure of reminder job gracefully', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      const updated = makeIntervention({ status: 'achieved', outcome_notes: 'Done' });
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(updated);
      mockPrisma.pastoralIntervention.findUnique.mockRejectedValue(new Error('DB error'));

      // Should not throw — cancellation is best-effort
      const result = await service.changeStatus(
        TENANT_ID,
        INTERVENTION_ID,
        { status: 'achieved', outcome_notes: 'Done' },
        ACTOR_USER_ID,
      );

      expect(result.status).toBe('achieved');
    });
  });

  // ─── createIntervention — additional branch coverage ───────────────────

  describe('createIntervention — branch coverage', () => {
    it('should accept case with active status', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ status: 'active' }));
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(makeIntervention());

      const result = await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);

      expect(result.id).toBe(INTERVENTION_ID);
    });

    it('should default review_cycle_weeks to 6 when not provided', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(makeIntervention());

      const dtoWithoutReviewCycle = {
        ...baseCreateDto,
        review_cycle_weeks: undefined,
      };

      await service.createIntervention(TENANT_ID, dtoWithoutReviewCycle, ACTOR_USER_ID);

      expect(mockRlsTx.pastoralIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          review_cycle_weeks: 6,
        }),
      });
    });

    it('should pass optional fields when provided', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(makeIntervention());

      await service.createIntervention(
        TENANT_ID,
        {
          ...baseCreateDto,
          parent_informed: true,
          parent_consented: true,
          parent_input: 'Parent agrees',
          student_voice: 'I understand',
        },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralIntervention.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parent_informed: true,
          parent_consented: true,
          parent_input: 'Parent agrees',
          student_voice: 'I understand',
        }),
      });
    });

    it('edge: should handle enqueue review reminder failure gracefully', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase());
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());
      mockRlsTx.pastoralIntervention.create.mockResolvedValue(makeIntervention());
      mockNotificationsQueue.add.mockRejectedValue(new Error('Queue down'));

      // Should not throw — review reminder is best-effort
      const result = await service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID);
      expect(result.id).toBe(INTERVENTION_ID);
    });

    it('should reject monitoring case status', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ status: 'monitoring' }));
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      await expect(
        service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject resolved case status', async () => {
      mockRlsTx.pastoralCase.findFirst.mockResolvedValue(makeCase({ status: 'resolved' }));
      mockRlsTx.tenantSetting.findUnique.mockResolvedValue(makeTenantSettings());

      await expect(
        service.createIntervention(TENANT_ID, baseCreateDto, ACTOR_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── recordReview — additional branch coverage ─────────────────────────

  describe('recordReview — branch coverage', () => {
    it('should not write progress note if review_notes is empty string', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(existing);

      await service.recordReview(TENANT_ID, INTERVENTION_ID, { review_notes: '' }, ACTOR_USER_ID);

      expect(mockRlsTx.pastoralInterventionProgress.create).not.toHaveBeenCalled();
    });

    it('should not write progress note if review_notes is whitespace only', async () => {
      const existing = makeIntervention();
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(existing);
      mockRlsTx.pastoralIntervention.update.mockResolvedValue(existing);

      await service.recordReview(
        TENANT_ID,
        INTERVENTION_ID,
        { review_notes: '   ' },
        ACTOR_USER_ID,
      );

      expect(mockRlsTx.pastoralInterventionProgress.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when intervention does not exist', async () => {
      mockRlsTx.pastoralIntervention.findFirst.mockResolvedValue(null);

      await expect(
        service.recordReview(TENANT_ID, INTERVENTION_ID, {}, ACTOR_USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
