import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../audit-log/audit-log.service';
import { CpRecordService } from '../child-protection/services/cp-record.service';
import { ConcernVersionService } from '../pastoral/services/concern-version.service';
import { ConcernService } from '../pastoral/services/concern.service';
import { PastoralEventService } from '../pastoral/services/pastoral-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../tenants/sequence.service';

import { SafeguardingConcernsService } from './safeguarding-concerns.service';
import { SAFEGUARDING_CRITICAL_ESCALATION_JOB } from './safeguarding.constants';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const CONCERN_ID = 'concern-1';
const STUDENT_ID = 'student-1';

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
  ...overrides,
});

describe('SafeguardingConcernsService', () => {
  let service: SafeguardingConcernsService;
  let mockPrisma!: {
    safeguardingConcern: Record<string, jest.Mock>;
    tenantSetting: Record<string, jest.Mock>;
  };
  let mockSequence!: { nextNumber: jest.Mock };
  let mockAuditLog!: { write: jest.Mock };
  let mockBehaviourQueue!: { add: jest.Mock };
  let mockNotificationsQueue!: { add: jest.Mock };
  let mockConcernService!: { create: jest.Mock };
  let mockCpRecordService!: { create: jest.Mock };
  let mockConcernVersion!: { amendNarrative: jest.Mock };
  let mockPastoralEvent!: { write: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      safeguardingConcern: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
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
  });
});
