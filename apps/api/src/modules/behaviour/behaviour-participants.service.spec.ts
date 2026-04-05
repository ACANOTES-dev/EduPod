import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourParticipantsService } from './behaviour-participants.service';
import { BehaviourSideEffectsService } from './behaviour-side-effects.service';

// ─── Constants ───────────────────────────────────────────────────��────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const INCIDENT_ID = 'incident-1';
const STUDENT_ID = 'student-1';
const PARTICIPANT_ID = 'participant-1';

// ─── RLS mock ─────────────────────────────────────────────────��───────────────

const mockRlsTx = {
  behaviourIncident: {
    findFirst: jest.fn(),
  },
  behaviourIncidentParticipant: {
    create: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  behaviourEntityHistory: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Factories ──────────────────────────────────��─────────────────────────────

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  tenant_id: TENANT_ID,
  status: 'active',
  category: {
    id: 'category-1',
    point_value: -5,
    parent_visible: true,
  },
  ...overrides,
});

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  first_name: 'Jane',
  last_name: 'Doe',
  year_group: { id: 'yg-1', name: 'Year 5' },
  class_enrolments: [{ class_entity: { name: 'Class 5A' } }],
  ...overrides,
});

const makeParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: PARTICIPANT_ID,
  tenant_id: TENANT_ID,
  incident_id: INCIDENT_ID,
  participant_type: 'student',
  student_id: STUDENT_ID,
  ...overrides,
});

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourParticipantsService', () => {
  let service: BehaviourParticipantsService;
  let mockHistory: { recordHistory: jest.Mock };
  let mockSideEffects: { emitPolicyEvaluation: jest.Mock };

  beforeEach(async () => {
    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };
    mockSideEffects = {
      emitPolicyEvaluation: jest.fn().mockResolvedValue(true),
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourParticipantsService,
        { provide: PrismaService, useValue: {} },
        { provide: BehaviourHistoryService, useValue: mockHistory },
        { provide: BehaviourSideEffectsService, useValue: mockSideEffects },
      ],
    }).compile();

    service = module.get<BehaviourParticipantsService>(BehaviourParticipantsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── addParticipant ───────────��────────────────────────────────────────────

  describe('BehaviourParticipantsService — addParticipant', () => {
    const baseDto = {
      participant_type: 'student' as const,
      student_id: STUDENT_ID,
      role: 'subject' as const,
    };

    it('should throw NotFoundException when incident not found', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(null);

      await expect(
        service.addParticipant(
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          baseDto as Parameters<typeof service.addParticipant>[3],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when student not found', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.student.findFirst.mockResolvedValue(null);

      await expect(
        service.addParticipant(
          TENANT_ID,
          INCIDENT_ID,
          USER_ID,
          baseDto as Parameters<typeof service.addParticipant>[3],
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create participant with student snapshot', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue(makeParticipant());

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.addParticipant>[3],
      );

      expect(mockRlsTx.behaviourIncidentParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          incident_id: INCIDENT_ID,
          participant_type: 'student',
          student_id: STUDENT_ID,
          points_awarded: -5,
          parent_visible: true,
          student_snapshot: expect.objectContaining({
            student_name: 'Jane Doe',
            year_group_name: 'Year 5',
            class_name: 'Class 5A',
          }),
        }),
      });
    });

    it('should set points_awarded to 0 for non-student participant', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue({
        id: 'p-2',
        participant_type: 'staff',
      });

      const staffDto = {
        participant_type: 'staff' as const,
        staff_id: 'staff-1',
        role: 'witness' as const,
      };

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        staffDto as Parameters<typeof service.addParticipant>[3],
      );

      expect(mockRlsTx.behaviourIncidentParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          points_awarded: 0,
        }),
      });
    });

    it('should NOT build student snapshot for non-student participant', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue({
        id: 'p-2',
        participant_type: 'staff',
      });

      const staffDto = {
        participant_type: 'staff' as const,
        staff_id: 'staff-1',
      };

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        staffDto as Parameters<typeof service.addParticipant>[3],
      );

      // Student lookup should not be called
      expect(mockRlsTx.student.findFirst).not.toHaveBeenCalled();
    });

    it('should emit policy evaluation for student participant', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue(makeParticipant());

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.addParticipant>[3],
      );

      expect(mockSideEffects.emitPolicyEvaluation).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: 'participant_added',
        }),
      );
    });

    it('should NOT emit policy evaluation for non-student participant', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue({
        id: 'p-2',
        participant_type: 'staff',
      });

      const staffDto = {
        participant_type: 'staff' as const,
        staff_id: 'staff-1',
      };

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        staffDto as Parameters<typeof service.addParticipant>[3],
      );

      expect(mockSideEffects.emitPolicyEvaluation).not.toHaveBeenCalled();
    });

    it('should handle student with no year_group and no class_enrolments', async () => {
      mockRlsTx.behaviourIncident.findFirst.mockResolvedValue(makeIncident());
      mockRlsTx.student.findFirst.mockResolvedValue(
        makeStudent({ year_group: null, class_enrolments: [] }),
      );
      mockRlsTx.behaviourIncidentParticipant.create.mockResolvedValue(makeParticipant());

      await service.addParticipant(
        TENANT_ID,
        INCIDENT_ID,
        USER_ID,
        baseDto as Parameters<typeof service.addParticipant>[3],
      );

      expect(mockRlsTx.behaviourIncidentParticipant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          student_snapshot: expect.objectContaining({
            year_group_id: null,
            year_group_name: null,
            class_name: null,
          }),
        }),
      });
    });
  });

  // ─── removeParticipant ───���─────────────────────────────────────────────────

  describe('BehaviourParticipantsService — removeParticipant', () => {
    it('should throw NotFoundException when participant not found', async () => {
      mockRlsTx.behaviourIncidentParticipant.findFirst.mockResolvedValue(null);

      await expect(
        service.removeParticipant(TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when removing last student participant', async () => {
      mockRlsTx.behaviourIncidentParticipant.findFirst.mockResolvedValue(
        makeParticipant({ participant_type: 'student' }),
      );
      mockRlsTx.behaviourIncidentParticipant.count.mockResolvedValue(1);

      await expect(
        service.removeParticipant(TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow removing student when more than one exists', async () => {
      mockRlsTx.behaviourIncidentParticipant.findFirst.mockResolvedValue(
        makeParticipant({ participant_type: 'student' }),
      );
      mockRlsTx.behaviourIncidentParticipant.count.mockResolvedValue(2);
      mockRlsTx.behaviourIncidentParticipant.delete.mockResolvedValue({});

      const result = await service.removeParticipant(
        TENANT_ID,
        INCIDENT_ID,
        PARTICIPANT_ID,
        USER_ID,
      );

      expect(result).toEqual({ success: true });
      expect(mockRlsTx.behaviourIncidentParticipant.delete).toHaveBeenCalledWith({
        where: { id: PARTICIPANT_ID },
      });
    });

    it('should allow removing non-student participant without count check', async () => {
      mockRlsTx.behaviourIncidentParticipant.findFirst.mockResolvedValue(
        makeParticipant({ participant_type: 'staff' }),
      );
      mockRlsTx.behaviourIncidentParticipant.delete.mockResolvedValue({});

      const result = await service.removeParticipant(
        TENANT_ID,
        INCIDENT_ID,
        PARTICIPANT_ID,
        USER_ID,
      );

      expect(result).toEqual({ success: true });
      // Count should NOT be called for non-student participants
      expect(mockRlsTx.behaviourIncidentParticipant.count).not.toHaveBeenCalled();
    });

    it('should record history with participant details', async () => {
      mockRlsTx.behaviourIncidentParticipant.findFirst.mockResolvedValue(
        makeParticipant({ participant_type: 'staff', student_id: null }),
      );
      mockRlsTx.behaviourIncidentParticipant.delete.mockResolvedValue({});

      await service.removeParticipant(TENANT_ID, INCIDENT_ID, PARTICIPANT_ID, USER_ID);

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'incident',
        INCIDENT_ID,
        USER_ID,
        'participant_removed',
        expect.objectContaining({
          participant_id: PARTICIPANT_ID,
          participant_type: 'staff',
        }),
        {},
      );
    });
  });
});
