import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourParentService } from './behaviour-parent.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-parent-1';
const PARENT_ID = 'parent-1';
const STUDENT_ID = 'student-1';
const INCIDENT_ID = 'incident-1';
const ACK_ID = 'ack-1';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentParent: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  behaviourIncident: {
    count: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  behaviourIncidentParticipant: {
    aggregate: jest.fn(),
  },
  behaviourParentAcknowledgement: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  behaviourGuardianRestriction: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  behaviourAmendmentNotice: {
    update: jest.fn(),
  },
  behaviourSanction: {
    findMany: jest.fn(),
  },
  behaviourRecognitionAward: {
    findMany: jest.fn(),
  },
  behaviourPublicationApproval: {
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

// ─── Factory helpers ─────────────────────────────────────────────────────────

const makeParent = (overrides: Record<string, unknown> = {}) => ({
  id: PARENT_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  status: 'active',
  first_name: 'Jane',
  last_name: 'Smith',
  is_primary_contact: true,
  user: { preferred_locale: 'en' },
  ...overrides,
});

const makeStudentLink = (studentId = STUDENT_ID) => ({
  parent_id: PARENT_ID,
  student_id: studentId,
  tenant_id: TENANT_ID,
  student: {
    id: studentId,
    first_name: 'Alice',
    last_name: 'Smith',
  },
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  incident_number: 'INC-202603-000001',
  occurred_at: new Date('2026-03-15T10:00:00Z'),
  polarity: 'negative',
  severity: 'low',
  parent_description: null as string | null,
  parent_description_ar: null as string | null,
  context_snapshot: null as unknown,
  category: { name: 'Disruption', name_ar: null as string | null },
  reported_by: null as { first_name: string; last_name: string } | null,
  ...overrides,
});

// ─── Result shape helpers ─────────────────────────────────────────────────────

interface SummaryResult {
  data: Array<{
    student_id: string;
    student_name: string;
    positive_count_7d: number;
    negative_count_7d: number;
    points_total: number;
    pending_acknowledgements: number;
  }>;
}

interface IncidentsResult {
  data: Array<{
    id: string;
    incident_number: string;
    incident_description: string;
    reported_by_name: string | null;
    pending_acknowledgement_id: string | null;
  }>;
  meta: { page: number; pageSize: number; total: number };
}

interface AcknowledgeResult {
  data: { acknowledged: boolean; already_acknowledged?: boolean };
}

describe('BehaviourParentService', () => {
  let service: BehaviourParentService;
  let mockPrisma: {
    parent: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      parent: { findFirst: jest.fn() },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourParentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourParentService>(BehaviourParentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getSummary ──────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('should return per-child summary with counts for authenticated parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      // No restriction
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      // Incident counts
      mockRlsTx.behaviourIncident.count
        .mockResolvedValueOnce(3) // positive
        .mockResolvedValueOnce(1); // negative
      // Points aggregate
      mockRlsTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 15 },
      });
      // Pending acknowledgements
      mockRlsTx.behaviourParentAcknowledgement.count.mockResolvedValue(2);

      const result = (await service.getSummary(TENANT_ID, USER_ID)) as SummaryResult;

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          student_id: STUDENT_ID,
          student_name: 'Alice Smith',
          positive_count_7d: 3,
          negative_count_7d: 1,
          points_total: 15,
          pending_acknowledgements: 2,
        }),
      );
    });

    it('should return zero data for restricted children without revealing restriction', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      // Restriction is active
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
        status: 'active_restriction',
      });

      const result = (await service.getSummary(TENANT_ID, USER_ID)) as SummaryResult;

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          student_id: STUDENT_ID,
          student_name: 'Alice Smith',
          positive_count_7d: 0,
          negative_count_7d: 0,
          points_total: 0,
          pending_acknowledgements: 0,
        }),
      );
      // Incident count should NOT be called for restricted student
      expect(mockRlsTx.behaviourIncident.count).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when parent profile is not found', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(service.getSummary(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getIncidents ────────────────────────────────────────────────────────

  describe('getIncidents', () => {
    it('should return parent-safe incidents with no raw description exposed', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      // Link exists
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      // No restriction
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      // Tenant settings — teacher name hidden by default
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });

      const incident = makeIncident({ parent_description: 'Safe parent text' });
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([incident]);
      mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
      mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.incident_description).toBe('Safe parent text');
      // Teacher name must be hidden (showTeacherName is false by default)
      expect(result.data[0]!.reported_by_name).toBeNull();
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should return empty array for restricted students', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
      });

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      // Should not query incidents for restricted student
      expect(mockRlsTx.behaviourIncident.findMany).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when student is not linked to parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      // No link found
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null);

      await expect(
        service.getIncidents(TENANT_ID, USER_ID, 'unlinked-student', 1, 20),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── renderIncidentForParent (via getIncidents integration) ─────────────

  describe('renderIncidentForParent priority chain', () => {
    const setupBaseGetIncidents = () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });
      mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
      mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);
    };

    it('priority 1: returns parent_description when set', async () => {
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'Explicit parent description',
          context_snapshot: { description_template_text: 'Template text' },
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data[0]!.incident_description).toBe('Explicit parent description');
    });

    it('priority 2: returns template text from context_snapshot when parent_description is absent', async () => {
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          context_snapshot: { description_template_text: 'Category template text' },
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data[0]!.incident_description).toBe('Category template text');
    });

    it('priority 3: returns category + date fallback when neither parent_description nor template text exist', async () => {
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          context_snapshot: null,
          category: { name: 'Disruption', name_ar: null },
          occurred_at: new Date('2026-03-15T10:00:00Z'),
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      const desc = result.data[0]!.incident_description;
      expect(desc).toContain('Disruption');
      expect(desc).toContain('2026');
    });

    it('priority 1 (ar): returns parent_description_ar for Arabic locale parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ user: { preferred_locale: 'ar' } }),
      );
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });
      mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
      mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'English description',
          parent_description_ar: 'الوصف بالعربية',
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data[0]!.incident_description).toBe('الوصف بالعربية');
    });

    it('priority 1 (ar fallback): returns parent_description when parent_description_ar is null for Arabic locale', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ user: { preferred_locale: 'ar' } }),
      );
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });
      mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
      mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'English description',
          parent_description_ar: null,
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data[0]!.incident_description).toBe('English description');
    });

    it('priority 3 (ar): returns category name_ar for Arabic locale in fallback', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ user: { preferred_locale: 'ar' } }),
      );
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });
      mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
      mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          parent_description_ar: null,
          context_snapshot: null,
          category: { name: 'Disruption', name_ar: 'اضطراب' },
          occurred_at: new Date('2026-03-15T10:00:00Z'),
        }),
      ]);

      const result = (await service.getIncidents(
        TENANT_ID,
        USER_ID,
        STUDENT_ID,
        1,
        20,
      )) as IncidentsResult;

      expect(result.data[0]!.incident_description).toContain('اضطراب');
    });
  });

  // ─── acknowledge ────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should set acknowledged_at and method on the acknowledgement', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        acknowledged_at: null,
        amendment_notice_id: null,
        incident_id: INCIDENT_ID,
      });
      mockRlsTx.behaviourParentAcknowledgement.update.mockResolvedValue({});
      // After update, no remaining unacknowledged acks
      mockRlsTx.behaviourParentAcknowledgement.count.mockResolvedValue(0);
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});

      const result = (await service.acknowledge(
        TENANT_ID,
        USER_ID,
        ACK_ID,
      )) as AcknowledgeResult;

      expect(mockRlsTx.behaviourParentAcknowledgement.update).toHaveBeenCalledWith({
        where: { id: ACK_ID },
        data: expect.objectContaining({
          acknowledgement_method: 'in_app_button',
        }),
      });
      expect(result.data.acknowledged).toBe(true);
    });

    it('should update amendment notice parent_reacknowledged_at when amendment_notice_id is present', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        acknowledged_at: null,
        amendment_notice_id: 'amendment-1',
        incident_id: null,
      });
      mockRlsTx.behaviourParentAcknowledgement.update.mockResolvedValue({});
      mockRlsTx.behaviourAmendmentNotice.update.mockResolvedValue({});

      await service.acknowledge(TENANT_ID, USER_ID, ACK_ID);

      expect(mockRlsTx.behaviourAmendmentNotice.update).toHaveBeenCalledWith({
        where: { id: 'amendment-1' },
        data: expect.objectContaining({
          parent_reacknowledged_at: expect.any(Date),
        }),
      });
    });

    it('should return already_acknowledged when acknowledgement was already done', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        acknowledged_at: new Date('2026-03-10'),
        amendment_notice_id: null,
        incident_id: null,
      });

      const result = (await service.acknowledge(
        TENANT_ID,
        USER_ID,
        ACK_ID,
      )) as AcknowledgeResult;

      expect(result.data).toEqual({ acknowledged: true, already_acknowledged: true });
      expect(mockRlsTx.behaviourParentAcknowledgement.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when acknowledgement is not found or does not belong to parent', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(TENANT_ID, USER_ID, 'no-such-ack')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update incident parent_notification_status to acknowledged when all acks are done', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        acknowledged_at: null,
        amendment_notice_id: null,
        incident_id: INCIDENT_ID,
      });
      mockRlsTx.behaviourParentAcknowledgement.update.mockResolvedValue({});
      // Zero remaining unacknowledged
      mockRlsTx.behaviourParentAcknowledgement.count.mockResolvedValue(0);
      mockRlsTx.behaviourIncident.update.mockResolvedValue({});

      await service.acknowledge(TENANT_ID, USER_ID, ACK_ID);

      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { parent_notification_status: 'acknowledged' },
      });
    });

    it('should NOT update incident status when unacknowledged acks remain', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        tenant_id: TENANT_ID,
        parent_id: PARENT_ID,
        acknowledged_at: null,
        amendment_notice_id: null,
        incident_id: INCIDENT_ID,
      });
      mockRlsTx.behaviourParentAcknowledgement.update.mockResolvedValue({});
      // One remaining unacknowledged
      mockRlsTx.behaviourParentAcknowledgement.count.mockResolvedValue(1);

      await service.acknowledge(TENANT_ID, USER_ID, ACK_ID);

      expect(mockRlsTx.behaviourIncident.update).not.toHaveBeenCalled();
    });
  });

  // ─── getRecognitionWall ───────────────────────────────────────────────────

  describe('getRecognitionWall', () => {
    const makeWallAward = (id: string) => ({
      id,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      superseded_by_id: null,
      awarded_at: new Date('2026-03-20T12:00:00Z'),
      student: { first_name: 'Alice', last_name: 'Smith' },
      award_type: { name: 'Star Student', icon: 'star' },
    });

    it('should filter awards by consent when recognition_wall_requires_consent is true', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { behaviour: { recognition_wall_requires_consent: true } },
      });
      mockRlsTx.behaviourRecognitionAward.findMany.mockResolvedValue([
        makeWallAward('award-1'),
        makeWallAward('award-2'),
      ]);
      // Only award-1 has consent granted
      mockRlsTx.behaviourPublicationApproval.findMany.mockResolvedValue([
        { entity_id: 'award-1' },
      ]);

      const result = await service.getRecognitionWall(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.award_type_name).toBe('Star Student');
    });

    it('should return all awards when recognition_wall_requires_consent is false', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { behaviour: { recognition_wall_requires_consent: false } },
      });
      mockRlsTx.behaviourRecognitionAward.findMany.mockResolvedValue([
        makeWallAward('award-1'),
        makeWallAward('award-2'),
      ]);

      const result = await service.getRecognitionWall(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(2);
      // Should NOT query publication approvals when consent is not required
      expect(mockRlsTx.behaviourPublicationApproval.findMany).not.toHaveBeenCalled();
    });

    it('should return empty when consent is required and no awards are approved', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue({
        settings: { behaviour: { recognition_wall_requires_consent: true } },
      });
      mockRlsTx.behaviourRecognitionAward.findMany.mockResolvedValue([
        makeWallAward('award-1'),
      ]);
      // No approvals
      mockRlsTx.behaviourPublicationApproval.findMany.mockResolvedValue([]);

      const result = await service.getRecognitionWall(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(0);
    });
  });
});
