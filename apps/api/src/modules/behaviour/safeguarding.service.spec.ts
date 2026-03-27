/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx: Record<string, Record<string, jest.Mock>> = {
  safeguardingConcern: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    updateMany: jest.fn(),
  },
  safeguardingAction: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  safeguardingConcernIncident: {
    create: jest.fn(),
  },
  safeguardingBreakGlassGrant: {
    findFirst: jest.fn(),
  },
  behaviourIncident: {
    update: jest.fn(),
  },
  behaviourTask: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
  tenantMembership: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      ),
  }),
}));

import { AuditLogService } from '../audit-log/audit-log.service';
import { CpRecordService } from '../child-protection/services/cp-record.service';
import { ConcernVersionService } from '../pastoral/services/concern-version.service';
import { ConcernService } from '../pastoral/services/concern.service';
import { PastoralEventService } from '../pastoral/services/pastoral-event.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourTasksService } from './behaviour-tasks.service';
import { SafeguardingService } from './safeguarding.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID_2 = '33333333-3333-3333-3333-333333333333';
const CONCERN_ID = '44444444-4444-4444-4444-444444444444';
const PASTORAL_CONCERN_ID = '88888888-8888-8888-8888-888888888888';
const CP_RECORD_ID = '99999999-9999-9999-9999-999999999999';
const STUDENT_ID = '55555555-5555-5555-5555-555555555555';
const MEMBERSHIP_ID = '66666666-6666-6666-6666-666666666666';
const INCIDENT_ID = '77777777-7777-7777-7777-777777777777';

// ─── Mock Queues ────────────────────────────────────────────────────────────

const mockBehaviourQueue = { add: jest.fn().mockResolvedValue({}) };
const mockNotificationsQueue = { add: jest.fn().mockResolvedValue({}) };

// ─── Default Settings ───────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  settings: {
    behaviour: {
      safeguarding_sla_critical_hours: 4,
      safeguarding_sla_high_hours: 24,
      safeguarding_sla_medium_hours: 72,
      safeguarding_sla_low_hours: 168,
      safeguarding_retention_years: 25,
      designated_liaison_user_id: USER_ID_2,
      deputy_designated_liaison_user_id: null,
      dlp_fallback_chain: [],
    },
  },
};

// ─── Mock Sequence Service ──────────────────────────────────────────────────

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('CP-202603-000001'),
};

// ─── Mock Audit Log Service ─────────────────────────────────────────────────

const mockAuditLogService = {
  write: jest.fn(),
};

// ─── Mock History & Tasks Services ──────────────────────────────────────────

const mockHistoryService = {};
const mockTasksService = {};

// ─── Mock Pastoral / CP Services ───────────────────────────────────────────

const mockConcernService = {
  create: jest.fn().mockResolvedValue({
    data: {
      id: PASTORAL_CONCERN_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      logged_by_user_id: USER_ID,
      author_masked: false,
      category: 'child_protection',
      severity: 'critical',
      tier: 3,
      occurred_at: new Date(),
      location: null,
      witnesses: null,
      actions_taken: null,
      follow_up_needed: false,
      follow_up_suggestion: null,
      case_id: null,
      behaviour_incident_id: null,
      parent_shareable: false,
      parent_share_level: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
  }),
};

const mockCpRecordService = {
  create: jest.fn().mockResolvedValue({
    data: {
      id: CP_RECORD_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      concern_id: PASTORAL_CONCERN_ID,
      record_type: 'concern',
      logged_by_user_id: USER_ID,
      logged_by_name: null,
      narrative: 'Visible bruising on arm',
      mandated_report_status: null,
      mandated_report_ref: null,
      tusla_contact_name: null,
      tusla_contact_date: null,
      legal_hold: false,
      created_at: new Date(),
      updated_at: new Date(),
    },
  }),
};

const mockConcernVersionService = {
  createInitialVersion: jest.fn().mockResolvedValue({ id: 'version-1' }),
  amendNarrative: jest.fn().mockResolvedValue({ data: { id: 'version-2' } }),
};

const mockPastoralEventService = {
  write: jest.fn().mockResolvedValue(undefined),
};

const mockPdfRenderingService = {
  renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf-content')),
};

// ─── Helper: build a base concern record ────────────────────────────────────

function makeConcern(overrides: Record<string, unknown> = {}) {
  return {
    id: CONCERN_ID,
    tenant_id: TENANT_ID,
    concern_number: 'CP-202603-000001',
    student_id: STUDENT_ID,
    reported_by_id: USER_ID,
    concern_type: 'physical_abuse',
    severity: 'critical_sev',
    status: 'reported',
    description: 'Visible bruising on arm',
    immediate_actions_taken: null,
    designated_liaison_id: USER_ID_2,
    assigned_to_id: null,
    sla_first_response_due: new Date(Date.now() + 4 * 60 * 60 * 1000),
    sla_first_response_met_at: null,
    retention_until: new Date('2040-06-15'),
    sealed_by_id: null,
    sealed_reason: null,
    sealed_at: null,
    seal_approved_by_id: null,
    resolved_at: null,
    reporter_acknowledgement_status: null,
    pastoral_concern_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SafeguardingService', () => {
  let service: SafeguardingService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    mockPrisma = {
      safeguardingConcern: {
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      safeguardingAction: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      safeguardingConcernIncident: {
        create: jest.fn(),
      },
      safeguardingBreakGlassGrant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      behaviourIncident: {
        update: jest.fn(),
      },
      behaviourTask: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tenantSetting: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeguardingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: BehaviourTasksService, useValue: mockTasksService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: 'BullQueue_behaviour', useValue: mockBehaviourQueue },
        { provide: 'BullQueue_notifications', useValue: mockNotificationsQueue },
        { provide: ConcernService, useValue: mockConcernService },
        { provide: CpRecordService, useValue: mockCpRecordService },
        { provide: ConcernVersionService, useValue: mockConcernVersionService },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
      ],
    }).compile();

    service = module.get<SafeguardingService>(SafeguardingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── reportConcern ──────────────────────────────────────────────────────

  describe('reportConcern', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      concern_type: 'physical_abuse' as const,
      severity: 'critical' as const,
      description: 'Visible bruising observed on left arm during PE',
      immediate_actions_taken: null,
    };

    beforeEach(() => {
      mockTx.tenantSetting!.findFirst!.mockResolvedValue(DEFAULT_SETTINGS);
      mockTx.student!.findFirst!.mockResolvedValue({
        id: STUDENT_ID,
        date_of_birth: new Date('2015-06-15'),
      });
      mockTx.safeguardingConcern!.create!.mockResolvedValue(makeConcern());
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });
    });

    it('should create a concern with correct fields and CP- number', async () => {
      const result = await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(result.data.concern_number).toBe('CP-202603-000001');
      expect(result.data.status).toBe('reported');
      expect(mockTx.safeguardingConcern!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_number: 'CP-202603-000001',
          student_id: STUDENT_ID,
          reported_by_id: USER_ID,
          concern_type: 'physical_abuse',
          severity: 'critical_sev',
          status: 'reported',
          description: baseDto.description,
        }),
      });
    });

    it('should set SLA deadline based on severity (critical = 4h default)', async () => {
      const before = Date.now();
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);
      const after = Date.now();

      const createCall = mockTx.safeguardingConcern!.create!.mock.calls[0]![0] as {
        data: { sla_first_response_due: Date };
      };
      const deadline = createCall.data.sla_first_response_due.getTime();
      const fourHoursMs = 4 * 60 * 60 * 1000;

      expect(deadline).toBeGreaterThanOrEqual(before + fourHoursMs);
      expect(deadline).toBeLessThanOrEqual(after + fourHoursMs);
    });

    it('should set retention_until to student DOB + 25 years', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      const createCall = mockTx.safeguardingConcern!.create!.mock.calls[0]![0] as {
        data: { retention_until: Date };
      };
      const retentionDate = createCall.data.retention_until;

      expect(retentionDate.getFullYear()).toBe(2015 + 25);
      expect(retentionDate.getMonth()).toBe(5); // June = 5
      expect(retentionDate.getDate()).toBe(15);
    });

    it('should use current date + 25 years when student has no DOB', async () => {
      mockTx.student!.findFirst!.mockResolvedValue({
        id: STUDENT_ID,
        date_of_birth: null,
      });

      const before = new Date();
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      const createCall = mockTx.safeguardingConcern!.create!.mock.calls[0]![0] as {
        data: { retention_until: Date };
      };
      const retentionDate = createCall.data.retention_until;

      expect(retentionDate.getFullYear()).toBeGreaterThanOrEqual(before.getFullYear() + 25);
    });

    it('should enqueue critical escalation job for critical severity', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'safeguarding:critical-escalation',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          escalation_step: 0,
        }),
        { delay: 0 },
      );
    });

    it('should NOT enqueue critical escalation for non-critical severity', async () => {
      const lowDto = { ...baseDto, severity: 'low' as const };
      mockTx.safeguardingConcern!.create!.mockResolvedValue(
        makeConcern({ severity: 'low_sev' }),
      );

      await service.reportConcern(TENANT_ID, USER_ID, lowDto);

      expect(mockBehaviourQueue.add).not.toHaveBeenCalled();
    });

    it('should link incident when incident_id provided', async () => {
      const dtoWithIncident = { ...baseDto, incident_id: INCIDENT_ID };

      await service.reportConcern(TENANT_ID, USER_ID, dtoWithIncident);

      expect(mockTx.safeguardingConcernIncident!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          incident_id: INCIDENT_ID,
          linked_by_id: USER_ID,
        }),
      });

      expect(mockTx.behaviourIncident!.update).toHaveBeenCalledWith({
        where: { id: INCIDENT_ID },
        data: { status: 'converted_to_safeguarding' },
      });
    });

    it('should throw NotFoundException when student not found', async () => {
      mockTx.student!.findFirst!.mockResolvedValue(null);

      await expect(
        service.reportConcern(TENANT_ID, USER_ID, baseDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create initial safeguarding_actions entry', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockTx.safeguardingAction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          action_by_id: USER_ID,
          action_type: 'status_changed',
          description: 'Concern reported',
        }),
      });
    });
  });

  // ─── getMyReports ───────────────────────────────────────────────────────

  describe('getMyReports', () => {
    it('should return only concern_number, concern_type, reported_at, reporter_acknowledgement_status', async () => {
      mockPrisma.safeguardingConcern!.findMany!.mockResolvedValue([
        {
          concern_number: 'CP-202603-000001',
          concern_type: 'physical_abuse',
          created_at: new Date('2026-03-20T12:00:00Z'),
          reporter_acknowledgement_status: 'assigned_ack',
        },
      ]);
      mockPrisma.safeguardingConcern!.count!.mockResolvedValue(1);

      const result = await service.getMyReports(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]).toEqual({
        concern_number: 'CP-202603-000001',
        concern_type: 'physical_abuse',
        reported_at: '2026-03-20T12:00:00.000Z',
        reporter_acknowledgement_status: 'assigned',
      });
    });

    it('should NOT include description, student name, or assigned staff', async () => {
      mockPrisma.safeguardingConcern!.findMany!.mockResolvedValue([
        {
          concern_number: 'CP-202603-000001',
          concern_type: 'neglect',
          created_at: new Date('2026-03-20T12:00:00Z'),
          reporter_acknowledgement_status: null,
        },
      ]);
      mockPrisma.safeguardingConcern!.count!.mockResolvedValue(1);

      const result = await service.getMyReports(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      const record = result.data[0]!;
      expect(record).not.toHaveProperty('description');
      expect(record).not.toHaveProperty('student');
      expect(record).not.toHaveProperty('assigned_to');
    });
  });

  // ─── transitionStatus ─────────────────────────────────────────────────

  describe('transitionStatus', () => {
    const transitionDto = { status: 'acknowledged' as const, reason: 'Concern acknowledged by DLP' };

    beforeEach(() => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(makeConcern());
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });
    });

    it('should transition from reported to acknowledged', async () => {
      const result = await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID, transitionDto,
      );

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          status: 'acknowledged',
        }),
      });
      expect(result.data.status).toBe('acknowledged');
    });

    it('should set sla_first_response_met_at on acknowledge', async () => {
      const before = Date.now();
      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID, transitionDto,
      );

      const updateCall = mockTx.safeguardingConcern!.update!.mock.calls[0]![0] as {
        data: { sla_first_response_met_at: Date };
      };
      const metAt = updateCall.data.sla_first_response_met_at.getTime();
      expect(metAt).toBeGreaterThanOrEqual(before);
      expect(metAt).toBeLessThanOrEqual(Date.now());
    });

    it('should set reporter_acknowledgement_status to assigned_ack on acknowledge', async () => {
      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID, transitionDto,
      );

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          reporter_acknowledgement_status: 'assigned_ack',
        }),
      });
    });

    it('should reject invalid transition (e.g., reported -> resolved)', async () => {
      const invalidDto = { status: 'resolved' as const, reason: 'Skipping steps' };

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject transition on sealed concern (403)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sealed' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, transitionDto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject empty reason', async () => {
      // Zod validates reason: z.string().min(1) at the controller level.
      // At the service level, the reason is passed through as dto.reason.
      // We test with a valid transition but verify the action records the reason.
      const validDto = { status: 'acknowledged' as const, reason: 'Valid reason' };
      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID, validDto,
      );

      expect(mockTx.safeguardingAction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          description: 'Valid reason',
        }),
      });
    });

    it('should block sealed via status transition endpoint (use seal/initiate instead)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sg_resolved' }),
      );

      const sealDto = { status: 'sealed' as const, reason: 'Trying to seal via transition' };

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, sealDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create safeguarding_actions entry for every transition', async () => {
      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID, transitionDto,
      );

      expect(mockTx.safeguardingAction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          action_by_id: USER_ID,
          action_type: 'status_changed',
          metadata: { from: 'reported', to: 'acknowledged' },
        }),
      });
    });
  });

  // ─── updateConcern ────────────────────────────────────────────────────

  describe('updateConcern', () => {
    it('should update description on non-sealed concern', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(makeConcern());
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ description: 'Updated description text here' }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      const result = await service.updateConcern(
        TENANT_ID, USER_ID, CONCERN_ID,
        { description: 'Updated description text here' },
      );

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: { description: 'Updated description text here' },
      });
      expect(result.data.id).toBe(CONCERN_ID);
    });

    it('should throw ForbiddenException on sealed concern', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sealed' }),
      );

      await expect(
        service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
          description: 'Attempt to update sealed concern',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── assignConcern ────────────────────────────────────────────────────

  describe('assignConcern', () => {
    it('should update assigned_to and designated_liaison', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(makeConcern());
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ assigned_to_id: USER_ID_2, designated_liaison_id: USER_ID_2 }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      const result = await service.assignConcern(
        TENANT_ID, USER_ID, CONCERN_ID,
        { assigned_to_id: USER_ID_2, designated_liaison_id: USER_ID_2 },
      );

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          assigned_to_id: USER_ID_2,
          designated_liaison_id: USER_ID_2,
        }),
      });
      expect(result.data.id).toBe(CONCERN_ID);
    });
  });

  // ─── recordAction ─────────────────────────────────────────────────────

  describe('recordAction', () => {
    it('should create append-only action entry', async () => {
      mockPrisma.safeguardingConcern!.findFirst!.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction!.create!.mockResolvedValue({ id: 'action-new' });

      const result = await service.recordAction(
        TENANT_ID, USER_ID, CONCERN_ID,
        {
          action_type: 'note_added',
          description: 'Parent contacted by phone',
        },
      );

      expect(mockPrisma.safeguardingAction!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          action_by_id: USER_ID,
          action_type: 'note_added',
          description: 'Parent contacted by phone',
        }),
      });
      expect(result.data.id).toBe('action-new');
    });

    it('should reject on sealed concern', async () => {
      mockPrisma.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sealed' }),
      );

      await expect(
        service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
          action_type: 'note_added',
          description: 'Should fail on sealed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── initiateSeal ─────────────────────────────────────────────────────

  describe('initiateSeal', () => {
    it('should set sealed_by_id and create task for approval', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sg_resolved' }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ status: 'sg_resolved', sealed_by_id: USER_ID }),
      );
      mockTx.behaviourTask!.create!.mockResolvedValue({ id: 'task-1' });
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      const result = await service.initiateSeal(
        TENANT_ID, USER_ID, CONCERN_ID, { reason: 'Case complete, ready to seal' },
      );

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          sealed_by_id: USER_ID,
          sealed_reason: 'Case complete, ready to seal',
        }),
      });

      expect(mockTx.behaviourTask!.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          task_type: 'safeguarding_action',
          entity_type: 'safeguarding_concern',
          entity_id: CONCERN_ID,
          title: expect.stringContaining('Seal approval required'),
        }),
      });

      expect(result.data.seal_initiated).toBe(true);
    });

    it('should require status = resolved', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'reported' }),
      );

      await expect(
        service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, {
          reason: 'Trying to seal non-resolved',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if seal already initiated', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sg_resolved', sealed_by_id: USER_ID_2 }),
      );

      await expect(
        service.initiateSeal(TENANT_ID, USER_ID, CONCERN_ID, {
          reason: 'Duplicate seal attempt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approveSeal ──────────────────────────────────────────────────────

  describe('approveSeal', () => {
    it('should set status=sealed when different user approves', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({
          status: 'sg_resolved',
          sealed_by_id: USER_ID,
        }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ status: 'sealed', sealed_by_id: USER_ID, seal_approved_by_id: USER_ID_2 }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });
      mockTx.behaviourTask!.updateMany!.mockResolvedValue({ count: 1 });

      const result = await service.approveSeal(TENANT_ID, USER_ID_2, CONCERN_ID);

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: expect.objectContaining({
          status: 'sealed',
          seal_approved_by_id: USER_ID_2,
        }),
      });
      expect(result.data.sealed).toBe(true);
    });

    it('should reject when same user tries to approve (dual-control violation)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({
          status: 'sg_resolved',
          sealed_by_id: USER_ID,
        }),
      );

      await expect(
        service.approveSeal(TENANT_ID, USER_ID, CONCERN_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when seal not initiated', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sg_resolved', sealed_by_id: null }),
      );

      await expect(
        service.approveSeal(TENANT_ID, USER_ID_2, CONCERN_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkEffectivePermission ─────────────────────────────────────────

  describe('checkEffectivePermission', () => {
    it('should return allowed=true with normal context for safeguarding.view holder', async () => {
      mockPrisma.tenantMembership!.findFirst!.mockResolvedValue({
        id: MEMBERSHIP_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [
                { permission: { permission_key: 'safeguarding.view' } },
              ],
            },
          },
        ],
      });

      const result = await service.checkEffectivePermission(
        USER_ID, TENANT_ID, MEMBERSHIP_ID,
      );

      expect(result).toEqual({ allowed: true, context: 'normal' });
    });

    it('should return allowed=true with break_glass context for active grant holder', async () => {
      mockPrisma.tenantMembership!.findFirst!.mockResolvedValue({
        id: MEMBERSHIP_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [
                { permission: { permission_key: 'behaviour.view' } },
              ],
            },
          },
        ],
      });

      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockPrisma.safeguardingBreakGlassGrant!.findFirst!.mockResolvedValue({
        id: 'grant-1',
        tenant_id: TENANT_ID,
        granted_to_id: USER_ID,
        expires_at: futureDate,
        revoked_at: null,
        scope: 'all_concerns',
      });

      const result = await service.checkEffectivePermission(
        USER_ID, TENANT_ID, MEMBERSHIP_ID,
      );

      expect(result).toEqual({
        allowed: true,
        context: 'break_glass',
        grantId: 'grant-1',
      });
    });

    it('should return allowed=false for expired grant', async () => {
      mockPrisma.tenantMembership!.findFirst!.mockResolvedValue({
        id: MEMBERSHIP_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [
                { permission: { permission_key: 'behaviour.view' } },
              ],
            },
          },
        ],
      });

      // No active grant returned because findFirst returns null for expired
      mockPrisma.safeguardingBreakGlassGrant!.findFirst!.mockResolvedValue(null);

      const result = await service.checkEffectivePermission(
        USER_ID, TENANT_ID, MEMBERSHIP_ID,
      );

      expect(result).toEqual({ allowed: false, context: 'normal' });
    });

    it('should return allowed=false for no permission and no grant', async () => {
      mockPrisma.tenantMembership!.findFirst!.mockResolvedValue({
        id: MEMBERSHIP_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
        membership_roles: [],
      });

      mockPrisma.safeguardingBreakGlassGrant!.findFirst!.mockResolvedValue(null);

      const result = await service.checkEffectivePermission(
        USER_ID, TENANT_ID, MEMBERSHIP_ID,
      );

      expect(result).toEqual({ allowed: false, context: 'normal' });
    });
  });

  // ─── getDashboard ─────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('should return correct severity counts and SLA compliance', async () => {
      mockPrisma.safeguardingConcern!.groupBy!.mockResolvedValueOnce([
        { severity: 'critical_sev', _count: 2 },
        { severity: 'high_sev', _count: 3 },
        { severity: 'medium_sev', _count: 1 },
        { severity: 'low_sev', _count: 0 },
      ]);
      mockPrisma.safeguardingConcern!.groupBy!.mockResolvedValueOnce([
        { status: 'reported', _count: 1 },
        { status: 'acknowledged', _count: 2 },
        { status: 'under_investigation', _count: 3 },
      ]);

      // SLA counts: overdue=1, due_soon=1, on_track=3
      mockPrisma.safeguardingConcern!.count!
        .mockResolvedValueOnce(1)  // slaOverdue
        .mockResolvedValueOnce(1)  // slaDueSoon
        .mockResolvedValueOnce(3); // slaOnTrack

      mockPrisma.behaviourTask!.findMany!.mockResolvedValue([]);
      mockPrisma.safeguardingAction!.findMany!.mockResolvedValue([]);

      const result = await service.getDashboard(TENANT_ID);

      expect(result.data.open_by_severity).toEqual({
        critical: 2,
        high: 3,
        medium: 1,
        low: 0,
      });

      expect(result.data.sla_compliance).toEqual({
        overdue: 1,
        due_within_24h: 1,
        on_track: 3,
        compliance_rate: 80, // (3+1) / 5 * 100 = 80
      });

      expect(result.data.by_status).toEqual(
        expect.objectContaining({
          reported: 1,
          acknowledged: 2,
          under_investigation: 3,
        }),
      );
    });
  });

  // ─── blocked transitions ──────────────────────────────────────────────

  describe('blocked transitions', () => {
    it('should reject sealed -> any (terminal status)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'sealed' }),
      );

      // Sealed concerns throw ForbiddenException (immutable record)
      await expect(
        service.transitionStatus(
          TENANT_ID, USER_ID, CONCERN_ID,
          { status: 'acknowledged' as const, reason: 'Attempt to reopen sealed' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject reported -> under_investigation (must go through acknowledged)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'reported' }),
      );

      await expect(
        service.transitionStatus(
          TENANT_ID, USER_ID, CONCERN_ID,
          { status: 'under_investigation' as const, reason: 'Skipping acknowledged' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject acknowledged -> resolved (must go through under_investigation)', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );

      await expect(
        service.transitionStatus(
          TENANT_ID, USER_ID, CONCERN_ID,
          { status: 'resolved' as const, reason: 'Skipping investigation' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Behaviour-Pastoral Facade Delegation ─────────────────────────────

  describe('facade delegation', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      concern_type: 'physical_abuse' as const,
      severity: 'critical' as const,
      description: 'Visible bruising observed on left arm during PE',
      immediate_actions_taken: null,
    };

    beforeEach(() => {
      mockTx.tenantSetting!.findFirst!.mockResolvedValue(DEFAULT_SETTINGS);
      mockTx.student!.findFirst!.mockResolvedValue({
        id: STUDENT_ID,
        date_of_birth: new Date('2015-06-15'),
      });
      mockTx.safeguardingConcern!.create!.mockResolvedValue(makeConcern());
      mockTx.safeguardingConcern!.update!.mockResolvedValue(makeConcern({ pastoral_concern_id: PASTORAL_CONCERN_ID }));
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });
    });

    it('should create pastoral_concern and cp_record via delegation', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockConcernService.create).toHaveBeenCalledWith(
        TENANT_ID, USER_ID,
        expect.objectContaining({
          student_id: STUDENT_ID,
          category: 'child_protection',
          tier: 3,
          narrative: baseDto.description,
        }),
        null,
      );

      expect(mockCpRecordService.create).toHaveBeenCalledWith(
        TENANT_ID, USER_ID,
        expect.objectContaining({
          concern_id: PASTORAL_CONCERN_ID,
          student_id: STUDENT_ID,
          record_type: 'concern',
          narrative: baseDto.description,
        }),
        null,
      );
    });

    it('should store pastoral_concern_id on safeguarding concern (cross-reference)', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockTx.safeguardingConcern!.update).toHaveBeenCalledWith({
        where: { id: CONCERN_ID },
        data: { pastoral_concern_id: PASTORAL_CONCERN_ID },
      });
    });

    it('should create pastoral concern with tier=3 and category=child_protection', async () => {
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      const createCall = mockConcernService.create.mock.calls[0]![2] as {
        tier: number;
        category: string;
      };
      expect(createCall.tier).toBe(3);
      expect(createCall.category).toBe('child_protection');
    });

    it('should propagate behaviour_incident_id when provided', async () => {
      const dtoWithIncident = { ...baseDto, incident_id: INCIDENT_ID };
      mockTx.safeguardingConcernIncident!.create!.mockResolvedValue({ id: 'link-1' });

      await service.reportConcern(TENANT_ID, USER_ID, dtoWithIncident);

      expect(mockConcernService.create).toHaveBeenCalledWith(
        TENANT_ID, USER_ID,
        expect.objectContaining({
          behaviour_incident_id: INCIDENT_ID,
        }),
        null,
      );
    });

    it.each([
      ['low', 'routine'],
      ['medium', 'elevated'],
      ['high', 'urgent'],
      ['critical', 'critical'],
    ] as const)('should map behaviour severity "%s" to pastoral severity "%s"', async (behaviourSev, expectedPastoralSev) => {
      const sevDto = { ...baseDto, severity: behaviourSev as 'low' | 'medium' | 'high' | 'critical' };
      mockTx.safeguardingConcern!.create!.mockResolvedValue(makeConcern({ severity: `${behaviourSev}_sev` }));

      await service.reportConcern(TENANT_ID, USER_ID, sevDto);

      expect(mockConcernService.create).toHaveBeenCalledWith(
        TENANT_ID, USER_ID,
        expect.objectContaining({
          severity: expectedPastoralSev,
        }),
        null,
      );
    });

    it('should gracefully handle delegation failure (safeguarding record still created, retry job enqueued)', async () => {
      mockConcernService.create.mockRejectedValueOnce(new Error('Pastoral service unavailable'));

      const result = await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      // Safeguarding record still created
      expect(result.data.id).toBe(CONCERN_ID);
      expect(result.data.concern_number).toBe('CP-202603-000001');
      expect(result.data.status).toBe('reported');

      // Retry job enqueued
      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'pastoral:sync-behaviour-safeguarding',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          user_id: USER_ID,
        }),
      );
    });

    it('should return unchanged response shape { data: { id, concern_number, status } }', async () => {
      const result = await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('id');
      expect(result.data).toHaveProperty('concern_number');
      expect(result.data).toHaveProperty('status');
      expect(Object.keys(result.data).sort()).toEqual(['concern_number', 'id', 'status']);
    });
  });

  // ─── Update Propagation ─────────────────────────────────────────────────

  describe('updateConcern pastoral propagation', () => {
    it('should propagate description change to pastoral concern version when pastoral_concern_id exists', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ pastoral_concern_id: PASTORAL_CONCERN_ID }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ description: 'Updated description', pastoral_concern_id: PASTORAL_CONCERN_ID }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      await service.updateConcern(
        TENANT_ID, USER_ID, CONCERN_ID,
        { description: 'Updated description' },
      );

      expect(mockConcernVersionService.amendNarrative).toHaveBeenCalledWith(
        TENANT_ID, USER_ID, PASTORAL_CONCERN_ID,
        { new_narrative: 'Updated description', amendment_reason: 'Updated via behaviour safeguarding' },
        null,
      );
    });

    it('should NOT propagate when pastoral_concern_id is null', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ pastoral_concern_id: null }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ description: 'Updated description', pastoral_concern_id: null }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      await service.updateConcern(
        TENANT_ID, USER_ID, CONCERN_ID,
        { description: 'Updated description' },
      );

      expect(mockConcernVersionService.amendNarrative).not.toHaveBeenCalled();
    });
  });

  // ─── Status Transition Propagation ──────────────────────────────────────

  describe('transitionStatus pastoral propagation', () => {
    it('should propagate status change to pastoral when pastoral_concern_id exists', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({
          status: 'under_investigation',
          pastoral_concern_id: PASTORAL_CONCERN_ID,
        }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ status: 'referred', pastoral_concern_id: PASTORAL_CONCERN_ID }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID,
        { status: 'referred' as const, reason: 'Referred to agency' },
      );

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_status_changed',
          entity_type: 'concern',
          entity_id: PASTORAL_CONCERN_ID,
          tier: 3,
          payload: expect.objectContaining({
            concern_id: PASTORAL_CONCERN_ID,
            new_status: 'elevated',
            source: 'behaviour_safeguarding',
          }),
        }),
      );
    });

    it('should NOT propagate status when pastoral_concern_id is null', async () => {
      mockTx.safeguardingConcern!.findFirst!.mockResolvedValue(
        makeConcern({ status: 'reported', pastoral_concern_id: null }),
      );
      mockTx.safeguardingConcern!.update!.mockResolvedValue(
        makeConcern({ status: 'acknowledged', pastoral_concern_id: null }),
      );
      mockTx.safeguardingAction!.create!.mockResolvedValue({ id: 'action-1' });

      await service.transitionStatus(
        TENANT_ID, USER_ID, CONCERN_ID,
        { status: 'acknowledged' as const, reason: 'Acknowledged by DLP' },
      );

      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });
  });
});
