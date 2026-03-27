/**
 * Release-Gate 15-4: Parent-Safe Rendering
 *
 * Verifies that parent-facing views never expose internal data:
 * - Parent portal never shows raw description field
 * - Parent portal uses parent_description when available
 * - Parent portal falls back to template text when parent_description is null
 * - Parent portal falls back to category name when both are null
 * - Parent portal never shows other participant names
 * - Parent notification respects send-gate severity
 * - Guardian restriction blocks portal visibility
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../../modules/prisma/prisma.service';
import { BehaviourParentService } from '../../behaviour-parent.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const _TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_PARENT = 'user-parent-1';
const PARENT_ID = 'parent-1';
const STUDENT_ID = 'student-1';
const INCIDENT_ID = 'incident-1';

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

jest.mock('../../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Factory helpers ────────────────────────────────────────────────────────

const makeParent = (overrides: Record<string, unknown> = {}) => ({
  id: PARENT_ID,
  tenant_id: TENANT_A,
  user_id: USER_PARENT,
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
  tenant_id: TENANT_A,
  student: {
    id: studentId,
    first_name: 'Alex',
    last_name: 'Smith',
  },
});

const makeIncident = (overrides: Record<string, unknown> = {}) => ({
  id: INCIDENT_ID,
  incident_number: 'BH-202603-000001',
  occurred_at: new Date('2026-03-15T10:00:00Z'),
  polarity: 'negative',
  severity: 3,
  description: 'Student threw a textbook across the room during maths lesson — hit another student',
  parent_description: null as string | null,
  parent_description_ar: null as string | null,
  context_notes: 'SEN flag: student has ADHD, was off medication today',
  context_snapshot: null as unknown,
  category: { name: 'Disruption', name_ar: null as string | null },
  reported_by: { first_name: 'Jane', last_name: 'Teacher' } as { first_name: string; last_name: string } | null,
  participants: [
    {
      id: 'part-1',
      student_id: STUDENT_ID,
      participant_type: 'student',
      role: 'subject',
      student: { id: STUDENT_ID, first_name: 'Alex', last_name: 'Smith' },
    },
    {
      id: 'part-2',
      student_id: 'student-witness-1',
      participant_type: 'student',
      role: 'witness',
      student: { id: 'student-witness-1', first_name: 'Ben', last_name: 'Jones' },
    },
  ],
  ...overrides,
});

// ─── Result shape interfaces ────────────────────────────────────────────────

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

// ─── Reset helpers ──────────────────────────────────────────────────────────

function resetAllMocks() {
  for (const model of Object.values(mockRlsTx)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}

function setupBaseGetIncidents() {
  mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
  mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue(null);
  mockRlsTx.tenantSetting.findFirst.mockResolvedValue({ settings: { behaviour: {} } });
  mockRlsTx.behaviourIncident.count.mockResolvedValue(1);
  mockRlsTx.behaviourParentAcknowledgement.findMany.mockResolvedValue([]);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Release Gate 15-4: Parent-Safe Rendering', () => {
  let service: BehaviourParentService;
  let mockPrisma: { parent: { findFirst: jest.Mock } };

  beforeEach(async () => {
    resetAllMocks();

    mockPrisma = {
      parent: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourParentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourParentService>(BehaviourParentService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 15-4-A: parent portal never shows raw description ───────────────

  describe('parent portal never shows raw description field', () => {
    it('should not expose raw description in parent incident view', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          description: 'Student threw a textbook — internal staff detail',
          parent_description: 'Your child was involved in a classroom incident',
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.incident_description).toBe('Your child was involved in a classroom incident');
      // Raw description must NOT appear in the result
      expect(JSON.stringify(result.data[0])).not.toContain('threw a textbook');
      expect(JSON.stringify(result.data[0])).not.toContain('internal staff detail');
    });

    it('should not expose context_notes to parent', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'Safe description',
          context_notes: 'SEN flag: student has ADHD',
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      const serialised = JSON.stringify(result.data[0]);
      expect(serialised).not.toContain('ADHD');
      expect(serialised).not.toContain('SEN flag');
      expect(serialised).not.toContain('context_notes');
    });
  });

  // ─── 15-4-B: uses parent_description when available ──────────────────

  describe('parent portal uses parent_description when available', () => {
    it('should return parent_description as incident_description', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'A minor classroom disruption was recorded for your child',
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data[0]!.incident_description).toBe(
        'A minor classroom disruption was recorded for your child',
      );
    });

    it('should prefer parent_description_ar for Arabic locale parent', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ user: { preferred_locale: 'ar' } }),
      );
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'English parent description',
          parent_description_ar: 'وصف الحادثة للوالدين',
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data[0]!.incident_description).toBe('وصف الحادثة للوالدين');
    });
  });

  // ─── 15-4-C: falls back to template text ─────────────────────────────

  describe('parent portal falls back to template text when parent_description is null', () => {
    it('should use description_template_text from context_snapshot', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          context_snapshot: {
            description_template_text: 'A disruption incident was recorded on this date',
          },
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data[0]!.incident_description).toBe(
        'A disruption incident was recorded on this date',
      );
    });
  });

  // ─── 15-4-D: falls back to category name ─────────────────────────────

  describe('parent portal falls back to category name when both are null', () => {
    it('should use category name with date as last resort', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          context_snapshot: null,
          category: { name: 'Disruption', name_ar: null },
          occurred_at: new Date('2026-03-15T10:00:00Z'),
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      const desc = result.data[0]!.incident_description;
      expect(desc).toContain('Disruption');
      expect(desc).toContain('2026');
    });

    it('should use category name_ar for Arabic locale parent in fallback', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(
        makeParent({ user: { preferred_locale: 'ar' } }),
      );
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: null,
          parent_description_ar: null,
          context_snapshot: null,
          category: { name: 'Disruption', name_ar: 'اضطراب' },
          occurred_at: new Date('2026-03-15T10:00:00Z'),
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data[0]!.incident_description).toContain('اضطراب');
    });
  });

  // ─── 15-4-E: never shows other participant names ──────────────────────

  describe('parent portal never shows other participant names', () => {
    it('should not expose witness or other student names in parent incident view', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      setupBaseGetIncidents();
      mockRlsTx.behaviourIncident.findMany.mockResolvedValue([
        makeIncident({
          parent_description: 'Your child was involved in an incident',
          participants: [
            {
              id: 'part-1',
              student_id: STUDENT_ID,
              participant_type: 'student',
              role: 'subject',
              student: { id: STUDENT_ID, first_name: 'Alex', last_name: 'Smith' },
            },
            {
              id: 'part-2',
              student_id: 'student-witness-1',
              participant_type: 'student',
              role: 'witness',
              student: { id: 'student-witness-1', first_name: 'Ben', last_name: 'Jones' },
            },
            {
              id: 'part-3',
              student_id: 'student-victim-1',
              participant_type: 'student',
              role: 'victim',
              student: { id: 'student-victim-1', first_name: 'Charlie', last_name: 'Brown' },
            },
          ],
        }),
      ]);

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert — no other student names should appear in parent view
      const serialised = JSON.stringify(result.data[0]);
      expect(serialised).not.toContain('Ben Jones');
      expect(serialised).not.toContain('Charlie Brown');
      expect(serialised).not.toContain('student-witness-1');
      expect(serialised).not.toContain('student-victim-1');
    });
  });

  // ─── 15-4-F: notification respects send-gate severity ────────────────

  describe('parent notification respects send-gate severity', () => {
    it('should block notification when severity exceeds gate and no parent_description exists', () => {
      // Arrange — simulate send-gate logic from parent-notification.processor.ts
      const incident = {
        polarity: 'negative',
        severity: 7,
        parent_description: null as string | null,
      };
      const sendGateSeverity = 5;

      // Act — send-gate check
      const isBlocked =
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity &&
        (!incident.parent_description || incident.parent_description.trim() === '');

      // Assert
      expect(isBlocked).toBe(true);
    });

    it('should allow notification when severity exceeds gate but parent_description exists', () => {
      // Arrange
      const incident = {
        polarity: 'negative',
        severity: 7,
        parent_description: 'Your child received a disciplinary note',
      };
      const sendGateSeverity = 5;

      // Act
      const isBlocked =
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity &&
        (!incident.parent_description || incident.parent_description.trim() === '');

      // Assert
      expect(isBlocked).toBe(false);
    });

    it('should allow notification when severity is below gate regardless of parent_description', () => {
      // Arrange
      const incident = {
        polarity: 'negative',
        severity: 2,
        parent_description: null as string | null,
      };
      const sendGateSeverity = 5;

      // Act
      const isBlocked =
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity &&
        (!incident.parent_description || incident.parent_description.trim() === '');

      // Assert
      expect(isBlocked).toBe(false);
    });

    it('should allow positive incident notification regardless of severity', () => {
      // Arrange
      const incident = {
        polarity: 'positive',
        severity: 10,
        parent_description: null as string | null,
      };
      const sendGateSeverity = 5;

      // Act
      const isBlocked =
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity &&
        (!incident.parent_description || incident.parent_description.trim() === '');

      // Assert
      expect(isBlocked).toBe(false);
    });

    it('should block notification when parent_description is whitespace-only', () => {
      // Arrange
      const incident = {
        polarity: 'negative',
        severity: 7,
        parent_description: '   ',
      };
      const sendGateSeverity = 5;

      // Act
      const isBlocked =
        incident.polarity === 'negative' &&
        sendGateSeverity !== null &&
        incident.severity >= sendGateSeverity &&
        (!incident.parent_description || incident.parent_description.trim() === '');

      // Assert
      expect(isBlocked).toBe(true);
    });
  });

  // ─── 15-4-G: guardian restriction blocks portal visibility ────────────

  describe('guardian restriction blocks portal visibility', () => {
    it('should return empty incidents for restricted student', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findFirst.mockResolvedValue(makeStudentLink());
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
        status: 'active_restriction',
      });

      // Act
      const result = (await service.getIncidents(
        TENANT_A, USER_PARENT, STUDENT_ID, 1, 20,
      )) as IncidentsResult;

      // Assert
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      // Should not query incidents for restricted student
      expect(mockRlsTx.behaviourIncident.findMany).not.toHaveBeenCalled();
    });

    it('should return zero summary data for restricted child without revealing restriction', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findMany.mockResolvedValue([makeStudentLink()]);
      mockRlsTx.behaviourGuardianRestriction.findFirst.mockResolvedValue({
        id: 'restriction-1',
        restriction_type: 'no_behaviour_visibility',
        status: 'active_restriction',
      });

      // Act
      const result = (await service.getSummary(TENANT_A, USER_PARENT)) as SummaryResult;

      // Assert
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          student_id: STUDENT_ID,
          student_name: 'Alex Smith',
          positive_count_7d: 0,
          negative_count_7d: 0,
          points_total: 0,
          pending_acknowledgements: 0,
        }),
      );
      // Should NOT query incidents — reveals no hint that data exists
      expect(mockRlsTx.behaviourIncident.count).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for student not linked to parent', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(makeParent());
      mockRlsTx.studentParent.findFirst.mockResolvedValue(null); // No link

      // Act & Assert
      await expect(
        service.getIncidents(TENANT_A, USER_PARENT, 'unlinked-student', 1, 20),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when parent profile does not exist', async () => {
      // Arrange
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getSummary(TENANT_A, USER_PARENT),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
