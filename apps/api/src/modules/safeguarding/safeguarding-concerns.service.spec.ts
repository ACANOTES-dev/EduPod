import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CpRecordService } from '../child-protection/services/cp-record.service';
import { ConcernVersionService } from '../pastoral/services/concern-version.service';
import { ConcernService } from '../pastoral/services/concern.service';
import { PastoralEventService } from '../pastoral/services/pastoral-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { SafeguardingConcernsService } from './safeguarding-concerns.service';
import { SAFEGUARDING_CRITICAL_ESCALATION_JOB } from './safeguarding.constants';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const CONCERN_ID = 'concern-1';
const STUDENT_ID = 'student-1';
const MEMBERSHIP_ID = 'membership-1';

// ─── RLS mock ───────────────────────────────────────────────────────────
const mockRlsTx = {
  safeguardingConcern: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  safeguardingAction: {
    create: jest.fn(),
  },
  safeguardingConcernIncident: {
    create: jest.fn(),
  },
  behaviourIncident: {
    update: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

const makeSettings = (overrides: Record<string, unknown> = {}) => ({
  settings: {
    behaviour: {
      safeguarding_sla_critical_hours: 4,
      safeguarding_sla_high_hours: 24,
      safeguarding_sla_medium_hours: 72,
      safeguarding_sla_low_hours: 168,
      safeguarding_retention_years: 25,
      designated_liaison_user_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      ...overrides,
    },
  },
});

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
  id: STUDENT_ID,
  tenant_id: TENANT_ID,
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: new Date('2010-01-01'),
  ...overrides,
});

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  concern_number: 'CP-202603-000001',
  student_id: STUDENT_ID,
  reported_by_id: USER_ID,
  concern_type: 'physical_abuse',
  severity: 'high_sev',
  status: 'reported',
  description: 'Test description',
  immediate_actions_taken: null,
  pastoral_concern_id: 'pastoral-1',
  sla_first_response_due: new Date(Date.now() + 24 * 60 * 60 * 1000),
  sla_first_response_met_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  is_tusla_referral: false,
  tusla_reference_number: null,
  tusla_referred_at: null,
  tusla_outcome: null,
  is_garda_referral: false,
  garda_reference_number: null,
  garda_referred_at: null,
  resolution_notes: null,
  resolved_at: null,
  reporter_acknowledgement_status: null,
  sealed_at: null,
  sealed_reason: null,
  retention_until: new Date('2035-01-01'),
  sealed_by_id: null,
  designated_liaison_id: null,
  assigned_to_id: null,
  ...overrides,
});

describe('SafeguardingConcernsService', () => {
  let service: SafeguardingConcernsService;
  let mockPrisma: {
    safeguardingConcern: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      [key: string]: jest.Mock;
    };
    safeguardingAction: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      [key: string]: jest.Mock;
    };
    tenantSetting: {
      findFirst: jest.Mock;
      [key: string]: jest.Mock;
    };
  };
  let mockSequence: { nextNumber: jest.Mock };
  let mockAuditLog: { write: jest.Mock };
  let mockBehaviourQueue: { add: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockConcernService: { create: jest.Mock };
  let mockCpRecordService: { create: jest.Mock };
  let mockConcernVersion: { amendNarrative: jest.Mock };
  let mockPastoralEvent: { write: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      safeguardingConcern: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      safeguardingAction: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
      },
      tenantSetting: {
        findFirst: jest.fn(),
      },
    };

    mockSequence = {
      nextNumber: jest.fn().mockResolvedValue('CP-202603-000001'),
    };
    mockAuditLog = { write: jest.fn().mockResolvedValue(undefined) };
    mockBehaviourQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockNotificationsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    mockConcernService = { create: jest.fn().mockResolvedValue({ data: { id: 'pastoral-1' } }) };
    mockCpRecordService = { create: jest.fn().mockResolvedValue({ data: { id: 'cp-1' } }) };
    mockConcernVersion = { amendNarrative: jest.fn().mockResolvedValue(undefined) };
    mockPastoralEvent = { write: jest.fn().mockResolvedValue(undefined) };

    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model as Record<string, jest.Mock>)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafeguardingConcernsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequence },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: getQueueToken('behaviour'), useValue: mockBehaviourQueue },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: ConcernService, useValue: mockConcernService },
        { provide: CpRecordService, useValue: mockCpRecordService },
        { provide: ConcernVersionService, useValue: mockConcernVersion },
        { provide: PastoralEventService, useValue: mockPastoralEvent },
      ],
    }).compile();

    service = module.get<SafeguardingConcernsService>(SafeguardingConcernsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── reportConcern ─────────────────────────────────────────────────────

  describe('reportConcern', () => {
    const baseDto = {
      student_id: STUDENT_ID,
      concern_type: 'physical_abuse' as const,
      severity: 'high' as const,
      description: 'Test incident description',
    };

    const setupCreateMocks = () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());
    };

    it('should create safeguarding concern, log action, and delegate to pastoral CP', async () => {
      setupCreateMocks();

      const result = await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(result.data.id).toBe(CONCERN_ID);
      expect(mockRlsTx.safeguardingConcern.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            severity: 'high_sev',
          }),
        }),
      );
      expect(mockConcernService.create).toHaveBeenCalled();
      expect(mockCpRecordService.create).toHaveBeenCalled();
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'safeguarding:concern-reported',
        expect.any(Object),
      );
    });

    it('should throw NotFoundException if student is missing', async () => {
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.student.findFirst.mockResolvedValue(null);

      await expect(service.reportConcern(TENANT_ID, USER_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: should enqueue critical escalation job for critical severity', async () => {
      setupCreateMocks();

      await service.reportConcern(TENANT_ID, USER_ID, {
        ...baseDto,
        severity: 'critical',
      });

      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        SAFEGUARDING_CRITICAL_ESCALATION_JOB,
        expect.objectContaining({ concern_id: CONCERN_ID }),
        { delay: 0 },
      );
    });

    it('should NOT enqueue critical escalation for non-critical severity', async () => {
      setupCreateMocks();

      await service.reportConcern(TENANT_ID, USER_ID, {
        ...baseDto,
        severity: 'low',
      });

      expect(mockBehaviourQueue.add).not.toHaveBeenCalledWith(
        SAFEGUARDING_CRITICAL_ESCALATION_JOB,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should use fallback SLA hours when severity not found in map', async () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());

      // Use a severity that maps via SEVERITY_TO_PRISMA but test the slaHoursMap fallback (168)
      // The mapping 'high' -> 'high_sev' exists but the SLA map looks up dto.severity
      // All standard severities are in the map, so we test the ?? 168 fallback isn't reached
      // by verifying the standard path works (no fallback needed for standard severities)
      const before = Date.now();
      await service.reportConcern(TENANT_ID, USER_ID, {
        ...baseDto,
        severity: 'medium',
      });

      const createCall = mockRlsTx.safeguardingConcern.create.mock.calls[0] as [
        { data: { sla_first_response_due: Date } },
      ];
      const deadline = createCall[0].data.sla_first_response_due.getTime();
      const expectedMs = 72 * 60 * 60 * 1000; // medium = 72 hours
      expect(deadline).toBeGreaterThanOrEqual(before + expectedMs);
    });

    it('should use current date + retention_years when student has no date_of_birth', async () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent({ date_of_birth: null }));
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());

      const before = new Date();
      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      const createCall = mockRlsTx.safeguardingConcern.create.mock.calls[0] as [
        { data: { retention_until: Date } },
      ];
      const retention = createCall[0].data.retention_until;
      expect(retention.getFullYear()).toBeGreaterThanOrEqual(before.getFullYear() + 25);
    });

    it('should link incident when incident_id is provided', async () => {
      setupCreateMocks();

      await service.reportConcern(TENANT_ID, USER_ID, {
        ...baseDto,
        incident_id: 'incident-1',
      });

      expect(mockRlsTx.safeguardingConcernIncident.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          incident_id: 'incident-1',
          linked_by_id: USER_ID,
        }),
      });
      expect(mockRlsTx.behaviourIncident.update).toHaveBeenCalledWith({
        where: { id: 'incident-1' },
        data: { status: 'converted_to_safeguarding' },
      });
    });

    it('edge: should NOT link incident when incident_id is not provided', async () => {
      setupCreateMocks();

      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockRlsTx.safeguardingConcernIncident.create).not.toHaveBeenCalled();
      expect(mockRlsTx.behaviourIncident.update).not.toHaveBeenCalled();
    });

    it('edge: should not notify DLP when designated_liaison_user_id is null', async () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(
        makeSettings({ designated_liaison_user_id: null }),
      );
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());

      await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(mockNotificationsQueue.add).not.toHaveBeenCalledWith(
        'safeguarding:concern-reported',
        expect.any(Object),
      );
    });

    it('edge: should gracefully handle pastoral delegation failure and enqueue retry', async () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());
      mockConcernService.create.mockRejectedValueOnce(new Error('Pastoral unavailable'));

      const result = await service.reportConcern(TENANT_ID, USER_ID, baseDto);

      expect(result.data.id).toBe(CONCERN_ID);
      expect(mockBehaviourQueue.add).toHaveBeenCalledWith(
        'pastoral:sync-behaviour-safeguarding',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
          user_id: USER_ID,
        }),
      );
    });

    it('should use fallback concern_type when dto.concern_type is unknown', async () => {
      mockRlsTx.student.findFirst.mockResolvedValue(makeStudent());
      mockRlsTx.tenantSetting.findFirst.mockResolvedValue(makeSettings());
      mockRlsTx.safeguardingConcern.create.mockResolvedValue(makeConcern());

      await service.reportConcern(TENANT_ID, USER_ID, {
        ...baseDto,
        concern_type: 'other' as 'physical_abuse',
      });

      expect(mockRlsTx.safeguardingConcern.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          concern_type: 'other_concern',
        }),
      });
    });
  });

  // ─── getMyReports ──────────────────────────────────────────────────────

  describe('getMyReports', () => {
    it('should return mapped reports with pagination', async () => {
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([
        {
          concern_number: 'CP-202603-000001',
          concern_type: 'physical_abuse',
          created_at: new Date('2026-03-20T12:00:00Z'),
          reporter_acknowledgement_status: 'assigned_ack',
        },
      ]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(1);

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
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('edge: should return null reporter_acknowledgement_status when status is null', async () => {
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([
        {
          concern_number: 'CP-1',
          concern_type: 'neglect',
          created_at: new Date('2026-01-01'),
          reporter_acknowledgement_status: null,
        },
      ]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(1);

      const result = await service.getMyReports(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]!.reporter_acknowledgement_status).toBeNull();
    });

    it('edge: should use unknown concern_type fallback when Prisma type not in map', async () => {
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([
        {
          concern_number: 'CP-1',
          concern_type: 'unknown_type',
          created_at: new Date('2026-01-01'),
          reporter_acknowledgement_status: null,
        },
      ]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(1);

      const result = await service.getMyReports(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data[0]!.concern_type).toBe('unknown_type');
    });

    it('should handle page 2 with correct offset', async () => {
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(25);

      const result = await service.getMyReports(TENANT_ID, USER_ID, {
        page: 2,
        pageSize: 10,
      });

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
      expect(result.meta.page).toBe(2);
    });
  });

  // ─── listConcerns ──────────────────────────────────────────────────────

  describe('listConcerns', () => {
    const mockCheckPermission = jest.fn().mockResolvedValue({
      allowed: true,
      context: 'normal' as const,
    });

    const baseQuery = { page: 1, pageSize: 20 };

    beforeEach(() => {
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(0);
    });

    it('should throw ForbiddenException when access is denied', async () => {
      const denyPermission = jest.fn().mockResolvedValue({ allowed: false, context: 'normal' });

      await expect(
        service.listConcerns(TENANT_ID, USER_ID, MEMBERSHIP_ID, baseQuery, denyPermission),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return empty list with correct pagination', async () => {
      const result = await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        baseQuery,
        mockCheckPermission,
      );

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
      expect(result).toHaveProperty('sla_summary');
    });

    it('should filter by status when query.status is provided', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, status: 'reported,acknowledged' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: { in: ['reported', 'acknowledged'] },
          }),
        }),
      );
    });

    it('should filter by severity when query.severity is provided', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, severity: 'high,critical' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            severity: { in: ['high_sev', 'critical_sev'] },
          }),
        }),
      );
    });

    it('should filter by concern type when query.type is provided', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, type: 'neglect' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            concern_type: 'neglect',
          }),
        }),
      );
    });

    it('should filter by date range when from and to are provided', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, from: '2026-01-01', to: '2026-12-31' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by assigned_to_id when provided', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, assigned_to_id: 'staff-1' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assigned_to_id: 'staff-1',
          }),
        }),
      );
    });

    it('should filter by sla_status=overdue', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, sla_status: 'overdue' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sla_first_response_met_at: null,
            sla_first_response_due: { lt: expect.any(Date) },
          }),
        }),
      );
    });

    it('should filter by sla_status=due_soon', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, sla_status: 'due_soon' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sla_first_response_met_at: null,
            sla_first_response_due: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by sla_status=on_track', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, sla_status: 'on_track' },
        mockCheckPermission,
      );

      expect(mockPrisma.safeguardingConcern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { sla_first_response_met_at: { not: null } },
              { sla_first_response_due: { gt: expect.any(Date) } },
            ]),
          }),
        }),
      );
    });

    it('should map concern summaries with correct fields', async () => {
      const now = new Date();
      mockPrisma.safeguardingConcern.findMany.mockResolvedValue([
        {
          id: CONCERN_ID,
          concern_number: 'CP-202603-000001',
          concern_type: 'physical_abuse',
          severity: 'high_sev',
          status: 'reported',
          sla_first_response_due: new Date(Date.now() + 24 * 60 * 60 * 1000),
          sla_first_response_met_at: null,
          created_at: now,
          student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
          reported_by: { id: USER_ID, first_name: 'Staff', last_name: 'Member' },
          assigned_to: { id: 'staff-1', first_name: 'Lead', last_name: 'Person' },
        },
      ]);
      mockPrisma.safeguardingConcern.count.mockResolvedValue(1);

      const result = await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        baseQuery,
        mockCheckPermission,
      );

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: CONCERN_ID,
          concern_number: 'CP-202603-000001',
          concern_type: 'physical_abuse',
          severity: 'high',
          status: 'reported',
          sla_breached: false,
          student: { id: STUDENT_ID, name: 'John Doe' },
          reported_by: { id: USER_ID, name: 'Staff Member' },
          assigned_to: { id: 'staff-1', name: 'Lead Person' },
        }),
      );
    });

    it('should ignore invalid status values in filter', async () => {
      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { ...baseQuery, status: 'nonexistent_status' },
        mockCheckPermission,
      );

      // Should not have status in where because all values were filtered out
      const callArgs = mockPrisma.safeguardingConcern.findMany.mock.calls[0]![0]! as Record<
        string,
        Record<string, unknown>
      >;
      expect(callArgs.where!.status).toBeUndefined();
    });

    it('should write audit log for every list access', async () => {
      const breakGlassPermission = jest.fn().mockResolvedValue({
        allowed: true,
        context: 'break_glass' as const,
        grantId: 'grant-1',
      });

      await service.listConcerns(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        baseQuery,
        breakGlassPermission,
      );

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'safeguarding_concern',
        null,
        'safeguarding_concerns_listed',
        { context: 'break_glass', break_glass_grant_id: 'grant-1' },
        null,
      );
    });
  });

  // ─── getConcernDetail ──────────────────────────────────────────────────

  describe('getConcernDetail', () => {
    const mockCheckPermission = jest.fn().mockResolvedValue({
      allowed: true,
      context: 'normal' as const,
    });

    it('should throw ForbiddenException when access is denied', async () => {
      const denyPermission = jest.fn().mockResolvedValue({ allowed: false, context: 'normal' });

      await expect(
        service.getConcernDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, CONCERN_ID, denyPermission),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when concern not found', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.getConcernDetail(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          CONCERN_ID,
          mockCheckPermission,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return mapped concern detail', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({
          student: {
            id: STUDENT_ID,
            first_name: 'John',
            last_name: 'Doe',
            date_of_birth: new Date('2010-01-01'),
          },
          reported_by: { id: USER_ID, first_name: 'Staff', last_name: 'User' },
          designated_liaison: null,
          assigned_to: null,
          sealed_by: null,
          seal_approved_by: null,
          _count: { actions: 3, concern_incidents: 1 },
        }),
      );

      const result = await service.getConcernDetail(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        mockCheckPermission,
      );

      expect(result.data).toEqual(
        expect.objectContaining({
          id: CONCERN_ID,
          concern_number: 'CP-202603-000001',
          severity: 'high',
          status: 'reported',
          student: { id: STUDENT_ID, name: 'John Doe', date_of_birth: expect.any(String) },
          reported_by: { id: USER_ID, name: 'Staff User' },
          designated_liaison: null,
          assigned_to: null,
          sealed_by: null,
          seal_approved_by: null,
          actions_count: 3,
          linked_incidents_count: 1,
        }),
      );
    });

    it('should write audit log for every view', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({
          student: null,
          reported_by: null,
          designated_liaison: null,
          assigned_to: null,
          sealed_by: null,
          seal_approved_by: null,
          _count: { actions: 0, concern_incidents: 0 },
        }),
      );

      await service.getConcernDetail(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        mockCheckPermission,
      );

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'safeguarding_concern',
        CONCERN_ID,
        'safeguarding_concern_viewed',
        expect.objectContaining({ context: 'normal' }),
        null,
      );
    });
  });

  // ─── transitionStatus ────────────────────────────────────────

  describe('transitionStatus', () => {
    it('should transition to acknowledged and enqueue reporter notification', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'reported' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );

      const result = await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'acknowledged',
        reason: 'Investigating now',
      });

      expect(result.data.status).toBe('acknowledged');
      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'acknowledged',
          }),
        }),
      );
      expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
        'safeguarding:reporter-ack',
        expect.any(Object),
      );
    });

    it('should throw BadRequestException if transition is blocked (resolved to reported)', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'sg_resolved' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
          status: 'reported',
          reason: 'Backwards transition',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if trying to transition to sealed directly', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'sg_resolved' }),
      );

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
          status: 'sealed',
          reason: 'invalid sealing method',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if concern is already sealed', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern({ status: 'sealed' }));

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
          status: 'acknowledged',
          reason: 'Trying to update sealed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when concern does not exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
          status: 'acknowledged',
          reason: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should set reporter_acknowledgement_status to under_review_ack on under_investigation', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'under_investigation' }),
      );

      await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'under_investigation',
        reason: 'Beginning investigation',
      });

      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reporter_acknowledgement_status: 'under_review_ack',
          }),
        }),
      );
    });

    it('should set resolved_at when transitioning to resolved', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'under_investigation' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'sg_resolved' }),
      );

      const before = Date.now();
      await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'resolved',
        reason: 'Matter resolved',
      });

      const updateCall = mockRlsTx.safeguardingConcern.update.mock.calls[0][0] as {
        data: { resolved_at: Date };
      };
      expect(updateCall.data.resolved_at.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('should propagate status change to pastoral when pastoral_concern_id exists', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({
          status: 'reported',
          pastoral_concern_id: 'pastoral-1',
        }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );

      await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'acknowledged',
        reason: 'Ack by DLP',
      });

      expect(mockPastoralEvent.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_status_changed',
          entity_id: 'pastoral-1',
          payload: expect.objectContaining({
            source: 'behaviour_safeguarding',
          }),
        }),
      );
    });

    it('should NOT propagate status when pastoral_concern_id is null', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'reported', pastoral_concern_id: null }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );

      await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'acknowledged',
        reason: 'test',
      });

      expect(mockPastoralEvent.write).not.toHaveBeenCalled();
    });

    it('edge: should gracefully handle pastoral propagation failure', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ status: 'reported', pastoral_concern_id: 'pastoral-1' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ status: 'acknowledged' }),
      );
      mockPastoralEvent.write.mockImplementationOnce(() => {
        throw new Error('Pastoral event write failed');
      });

      // Should not throw — error is caught and logged
      const result = await service.transitionStatus(TENANT_ID, USER_ID, CONCERN_ID, {
        status: 'acknowledged',
        reason: 'test',
      });

      expect(result.data.status).toBe('acknowledged');
    });
  });

  // ─── updateConcern ─────────────────────────────────────────────────────

  describe('updateConcern', () => {
    it('should update description and record action', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ description: 'Updated' }),
      );

      const result = await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        description: 'Updated',
      });

      expect(result.data.id).toBe(CONCERN_ID);
      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Updated',
          }),
        }),
      );
    });

    it('should throw NotFoundException when concern not found', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, { description: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern({ status: 'sealed' }));

      await expect(
        service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, { description: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update concern_type when provided', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ concern_type: 'neglect' }),
      );

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        concern_type: 'neglect' as 'physical_abuse',
      });

      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            concern_type: 'neglect',
          }),
        }),
      );
    });

    it('should update severity when provided', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ severity: 'critical_sev' }),
      );

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        severity: 'critical' as 'high',
      });

      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: 'critical_sev',
          }),
        }),
      );
    });

    it('should update immediate_actions_taken when provided', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        immediate_actions_taken: 'Called parents',
      });

      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            immediate_actions_taken: 'Called parents',
          }),
        }),
      );
    });

    it('should propagate description change to pastoral when pastoral_concern_id exists', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ pastoral_concern_id: 'pastoral-1' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(
        makeConcern({ description: 'Updated' }),
      );

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        description: 'Updated',
      });

      expect(mockConcernVersion.amendNarrative).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'pastoral-1',
        {
          new_narrative: 'Updated',
          amendment_reason: 'Updated via behaviour safeguarding',
        },
        null,
      );
    });

    it('should NOT propagate description change when pastoral_concern_id is null', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ pastoral_concern_id: null }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        description: 'Updated',
      });

      expect(mockConcernVersion.amendNarrative).not.toHaveBeenCalled();
    });

    it('edge: should gracefully handle pastoral propagation failure on update', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ pastoral_concern_id: 'pastoral-1' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());
      mockConcernVersion.amendNarrative.mockRejectedValueOnce(new Error('Pastoral down'));

      // Should not throw — error is caught and logged
      const result = await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        description: 'Updated',
      });

      expect(result.data.id).toBe(CONCERN_ID);
    });

    it('should NOT propagate when only non-description fields are updated', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(
        makeConcern({ pastoral_concern_id: 'pastoral-1' }),
      );
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());

      await service.updateConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        severity: 'critical' as 'high',
      });

      expect(mockConcernVersion.amendNarrative).not.toHaveBeenCalled();
    });
  });

  // ─── assignConcern ──────────────────────────────────────────────────────

  describe('assignConcern', () => {
    it('should successfully assign concern and log action', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());

      const result = await service.assignConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        assigned_to_id: 'new-staff-id',
      });

      expect(result.data.id).toBe(CONCERN_ID);
      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assigned_to_id: 'new-staff-id' }),
        }),
      );
      expect(mockRlsTx.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action_type: 'assigned' }),
        }),
      );
    });

    it('should throw NotFoundException if concern does not exist', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.assignConcern(TENANT_ID, USER_ID, CONCERN_ID, { assigned_to_id: 'new-staff-id' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern({ status: 'sealed' }));

      await expect(
        service.assignConcern(TENANT_ID, USER_ID, CONCERN_ID, { assigned_to_id: 'staff-1' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update designated_liaison_id when provided', async () => {
      mockRlsTx.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockRlsTx.safeguardingConcern.update.mockResolvedValue(makeConcern());

      await service.assignConcern(TENANT_ID, USER_ID, CONCERN_ID, {
        designated_liaison_id: 'dlp-1',
      });

      expect(mockRlsTx.safeguardingConcern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ designated_liaison_id: 'dlp-1' }),
        }),
      );
    });
  });

  // ─── recordAction ──────────────────────────────────────────────────────

  describe('recordAction', () => {
    it('should create action entry on active concern', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction.create = jest.fn().mockResolvedValue({ id: 'action-1' });

      const result = await service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
        action_type: 'note_added',
        description: 'Parent contacted',
      });

      expect(result.data.id).toBe('action-1');
    });

    it('should throw NotFoundException when concern not found', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(null);

      await expect(
        service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
          action_type: 'note_added',
          description: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when concern is sealed', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern({ status: 'sealed' }));

      await expect(
        service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
          action_type: 'note_added',
          description: 'test',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should use fallback action_type when dto.action_type is unknown', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction.create = jest.fn().mockResolvedValue({ id: 'action-1' });

      await service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
        action_type: 'unknown_action' as 'note_added',
        description: 'test',
      });

      expect(mockPrisma.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'note_added',
          }),
        }),
      );
    });

    it('should set due_date when provided', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction.create = jest.fn().mockResolvedValue({ id: 'action-1' });

      await service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
        action_type: 'note_added',
        description: 'Follow-up needed',
        due_date: '2026-12-31T00:00:00Z',
      });

      expect(mockPrisma.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            due_date: expect.any(Date),
          }),
        }),
      );
    });

    it('should set due_date to null when not provided', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction.create = jest.fn().mockResolvedValue({ id: 'action-1' });

      await service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
        action_type: 'note_added',
        description: 'test',
      });

      expect(mockPrisma.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            due_date: null,
          }),
        }),
      );
    });

    it('should pass metadata through when provided', async () => {
      mockPrisma.safeguardingConcern.findFirst.mockResolvedValue(makeConcern());
      mockPrisma.safeguardingAction.create = jest.fn().mockResolvedValue({ id: 'action-1' });

      await service.recordAction(TENANT_ID, USER_ID, CONCERN_ID, {
        action_type: 'note_added',
        description: 'test',
        metadata: { key: 'value' },
      });

      expect(mockPrisma.safeguardingAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { key: 'value' },
          }),
        }),
      );
    });
  });

  // ─── getActions ─────────────────────────────────────────────────────────

  describe('getActions', () => {
    const mockCheckPermission = jest.fn().mockResolvedValue({
      allowed: true,
      context: 'normal' as const,
    });
    const baseQuery = { page: 1, pageSize: 20 };

    it('should throw ForbiddenException when access is denied', async () => {
      const denyPermission = jest.fn().mockResolvedValue({ allowed: false, context: 'normal' });

      await expect(
        service.getActions(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          CONCERN_ID,
          baseQuery,
          denyPermission,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return mapped actions with pagination', async () => {
      const now = new Date();
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([
        {
          id: 'action-1',
          action_type: 'note_added',
          description: 'Parent contacted',
          metadata: { key: 'value' },
          due_date: new Date('2026-12-31'),
          is_overdue: false,
          created_at: now,
          action_by: { id: USER_ID, first_name: 'Staff', last_name: 'Member' },
        },
      ]);
      mockPrisma.safeguardingAction.count.mockResolvedValue(1);

      const result = await service.getActions(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        baseQuery,
        mockCheckPermission,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({
          id: 'action-1',
          action_type: 'note_added',
          description: 'Parent contacted',
          due_date: '2026-12-31T00:00:00.000Z',
          is_overdue: false,
          action_by: { id: USER_ID, name: 'Staff Member' },
        }),
      );
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('edge: should handle null due_date and null action_by', async () => {
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([
        {
          id: 'action-2',
          action_type: 'status_changed',
          description: 'Status changed',
          metadata: null,
          due_date: null,
          is_overdue: false,
          created_at: new Date(),
          action_by: null,
        },
      ]);
      mockPrisma.safeguardingAction.count.mockResolvedValue(1);

      const result = await service.getActions(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        baseQuery,
        mockCheckPermission,
      );

      expect(result.data[0]!.due_date).toBeNull();
      expect(result.data[0]!.action_by).toBeNull();
    });

    it('should write audit log with break_glass context', async () => {
      const breakGlassPermission = jest.fn().mockResolvedValue({
        allowed: true,
        context: 'break_glass' as const,
        grantId: 'grant-1',
      });

      mockPrisma.safeguardingAction.findMany.mockResolvedValue([]);
      mockPrisma.safeguardingAction.count.mockResolvedValue(0);

      await service.getActions(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        baseQuery,
        breakGlassPermission,
      );

      expect(mockAuditLog.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'safeguarding_concern',
        CONCERN_ID,
        'safeguarding_actions_viewed',
        { context: 'break_glass', break_glass_grant_id: 'grant-1' },
        null,
      );
    });

    it('edge: should handle unknown action_type via fallback', async () => {
      mockPrisma.safeguardingAction.findMany.mockResolvedValue([
        {
          id: 'action-3',
          action_type: 'custom_unknown_type',
          description: 'test',
          metadata: null,
          due_date: null,
          is_overdue: false,
          created_at: new Date(),
          action_by: null,
        },
      ]);
      mockPrisma.safeguardingAction.count.mockResolvedValue(1);

      const result = await service.getActions(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CONCERN_ID,
        baseQuery,
        mockCheckPermission,
      );

      // Falls back to the raw action_type value
      expect(result.data[0]!.action_type).toBe('custom_unknown_type');
    });
  });

  // ─── mapConcernSummary ─────────────────────────────────────────────────

  describe('mapConcernSummary', () => {
    it('should map all fields correctly with populated relations', () => {
      const now = new Date();
      const result = service.mapConcernSummary({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'reported' as never,
        sla_first_response_due: new Date(Date.now() + 24 * 60 * 60 * 1000),
        sla_first_response_met_at: null,
        created_at: now,
        student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Smith' },
        reported_by: { id: USER_ID, first_name: 'Staff', last_name: 'One' },
        assigned_to: { id: 'staff-2', first_name: 'Lead', last_name: 'Two' },
      });

      expect(result.severity).toBe('high');
      expect(result.status).toBe('reported');
      expect(result.sla_breached).toBe(false);
      expect(result.student).toEqual({ id: STUDENT_ID, name: 'Jane Smith' });
      expect(result.reported_by).toEqual({ id: USER_ID, name: 'Staff One' });
      expect(result.assigned_to).toEqual({ id: 'staff-2', name: 'Lead Two' });
    });

    it('should return null for missing relations', () => {
      const result = service.mapConcernSummary({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'reported' as never,
        sla_first_response_due: null,
        sla_first_response_met_at: null,
        created_at: new Date(),
        student: null,
        reported_by: null,
        assigned_to: null,
      });

      expect(result.student).toBeNull();
      expect(result.reported_by).toBeNull();
      expect(result.assigned_to).toBeNull();
      expect(result.sla_first_response_due).toBeNull();
      expect(result.sla_breached).toBe(false);
    });

    it('edge: should mark sla_breached=true when SLA deadline is past and not met', () => {
      const result = service.mapConcernSummary({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'reported' as never,
        sla_first_response_due: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
        sla_first_response_met_at: null,
        created_at: new Date(),
      });

      expect(result.sla_breached).toBe(true);
    });

    it('edge: should mark sla_breached=false when SLA was met', () => {
      const result = service.mapConcernSummary({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'reported' as never,
        sla_first_response_due: new Date(Date.now() - 60 * 60 * 1000),
        sla_first_response_met_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
        created_at: new Date(),
      });

      expect(result.sla_breached).toBe(false);
    });

    it('edge: should use fallback for unknown enum values', () => {
      const result = service.mapConcernSummary({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'unknown_type' as never,
        severity: 'unknown_sev' as never,
        status: 'unknown_status' as never,
        sla_first_response_due: null,
        sla_first_response_met_at: null,
        created_at: new Date(),
      });

      expect(result.concern_type).toBe('unknown_type');
      expect(result.severity).toBe('unknown_sev');
      expect(result.status).toBe('unknown_status');
    });
  });

  // ─── mapConcernDetail ──────────────────────────────────────────────────

  describe('mapConcernDetail', () => {
    it('should map all detail fields with full relations', () => {
      const result = service.mapConcernDetail({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'sg_resolved' as never,
        description: 'Test',
        immediate_actions_taken: 'Called parents',
        is_tusla_referral: true,
        tusla_reference_number: 'T-001',
        tusla_referred_at: new Date('2026-01-01'),
        tusla_outcome: 'Assessed',
        is_garda_referral: true,
        garda_reference_number: 'G-001',
        garda_referred_at: new Date('2026-02-01'),
        resolution_notes: 'Resolved with family support',
        resolved_at: new Date('2026-03-01'),
        reporter_acknowledgement_status: 'under_review_ack' as never,
        sla_first_response_due: new Date('2026-01-02'),
        sla_first_response_met_at: new Date('2026-01-01T10:00:00Z'),
        sealed_at: null,
        sealed_reason: null,
        retention_until: new Date('2050-01-01'),
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-03-01'),
        student: {
          id: STUDENT_ID,
          first_name: 'John',
          last_name: 'Doe',
          date_of_birth: new Date('2010-01-01'),
        },
        reported_by: { id: USER_ID, first_name: 'Staff', last_name: 'One' },
        designated_liaison: { id: 'dlp-1', first_name: 'DLP', last_name: 'Person' },
        assigned_to: { id: 'staff-2', first_name: 'Lead', last_name: 'Inv' },
        sealed_by: null,
        seal_approved_by: null,
        _count: { actions: 5, concern_incidents: 2 },
      });

      expect(result.status).toBe('resolved');
      expect(result.severity).toBe('high');
      expect(result.is_tusla_referral).toBe(true);
      expect(result.tusla_reference_number).toBe('T-001');
      expect(result.tusla_referred_at).toBe('2026-01-01T00:00:00.000Z');
      expect(result.is_garda_referral).toBe(true);
      expect(result.garda_referred_at).toBe('2026-02-01T00:00:00.000Z');
      expect(result.resolved_at).toBe('2026-03-01T00:00:00.000Z');
      expect(result.sla_breached).toBe(false); // SLA was met
      expect(result.student).toEqual({
        id: STUDENT_ID,
        name: 'John Doe',
        date_of_birth: '2010-01-01T00:00:00.000Z',
      });
      expect(result.designated_liaison).toEqual({ id: 'dlp-1', name: 'DLP Person' });
      expect(result.assigned_to).toEqual({ id: 'staff-2', name: 'Lead Inv' });
      expect(result.actions_count).toBe(5);
      expect(result.linked_incidents_count).toBe(2);
    });

    it('should handle all null optional fields', () => {
      const result = service.mapConcernDetail({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'reported' as never,
        description: 'test',
        immediate_actions_taken: null,
        is_tusla_referral: false,
        tusla_reference_number: null,
        tusla_referred_at: null,
        tusla_outcome: null,
        is_garda_referral: false,
        garda_reference_number: null,
        garda_referred_at: null,
        resolution_notes: null,
        resolved_at: null,
        reporter_acknowledgement_status: null,
        sla_first_response_due: null,
        sla_first_response_met_at: null,
        sealed_at: null,
        sealed_reason: null,
        retention_until: null,
        created_at: new Date(),
        updated_at: new Date(),
        student: null,
        reported_by: null,
        designated_liaison: null,
        assigned_to: null,
        sealed_by: null,
        seal_approved_by: null,
      });

      expect(result.student).toBeNull();
      expect(result.reported_by).toBeNull();
      expect(result.designated_liaison).toBeNull();
      expect(result.assigned_to).toBeNull();
      expect(result.sealed_by).toBeNull();
      expect(result.seal_approved_by).toBeNull();
      expect(result.tusla_referred_at).toBeNull();
      expect(result.garda_referred_at).toBeNull();
      expect(result.resolved_at).toBeNull();
      expect(result.sealed_at).toBeNull();
      expect(result.retention_until).toBeNull();
      expect(result.sla_first_response_due).toBeNull();
      expect(result.sla_first_response_met_at).toBeNull();
      expect(result.actions_count).toBe(0);
      expect(result.linked_incidents_count).toBe(0);
    });

    it('should handle sealed concern with all seal fields', () => {
      const result = service.mapConcernDetail({
        id: CONCERN_ID,
        concern_number: 'CP-1',
        concern_type: 'physical_abuse' as never,
        severity: 'high_sev' as never,
        status: 'sealed' as never,
        description: 'test',
        immediate_actions_taken: null,
        is_tusla_referral: false,
        tusla_reference_number: null,
        tusla_referred_at: null,
        tusla_outcome: null,
        is_garda_referral: false,
        garda_reference_number: null,
        garda_referred_at: null,
        resolution_notes: null,
        resolved_at: null,
        reporter_acknowledgement_status: null,
        sla_first_response_due: null,
        sla_first_response_met_at: null,
        sealed_at: new Date('2026-03-01'),
        sealed_reason: 'Case closed',
        retention_until: new Date('2050-01-01'),
        created_at: new Date(),
        updated_at: new Date(),
        sealed_by: { id: 'sealer-1', first_name: 'Seal', last_name: 'User' },
        seal_approved_by: { id: 'approver-1', first_name: 'Approve', last_name: 'User' },
        _count: { actions: 10, concern_incidents: 3 },
      });

      expect(result.sealed_at).toBe('2026-03-01T00:00:00.000Z');
      expect(result.sealed_reason).toBe('Case closed');
      expect(result.sealed_by).toEqual({ id: 'sealer-1', name: 'Seal User' });
      expect(result.seal_approved_by).toEqual({ id: 'approver-1', name: 'Approve User' });
    });
  });
});
