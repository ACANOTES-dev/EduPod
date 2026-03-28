import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';

import {
  DEADLINE_CHECK_JOB,
  DeadlineCheckProcessor,
} from './deadline-check.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const REQUEST_ID = 'aaaa0001-0000-0000-0000-000000000001';
const USER_ID = 'bbbb0001-0000-0000-0000-000000000001';

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    tenant_id: TENANT_A_ID,
    request_type: 'access',
    subject_type: 'student',
    subject_id: 'cccc0001-0000-0000-0000-000000000001',
    requested_by_user_id: USER_ID,
    status: 'submitted',
    classification: null,
    decision_notes: null,
    export_file_key: null,
    deadline_at: daysFromNow(5),
    extension_granted: false,
    extension_reason: null,
    extension_deadline_at: null,
    deadline_exceeded: false,
    rectification_note: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    complianceRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

type MockPrisma = ReturnType<typeof buildMockPrisma>;

function buildMockJob(
  name: string,
  data: Record<string, unknown> = {},
): Job {
  return { name, data } as unknown as Job;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('DeadlineCheckProcessor', () => {
  let processor: DeadlineCheckProcessor;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        DeadlineCheckProcessor,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<DeadlineCheckProcessor>(DeadlineCheckProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip non-matching job names', async () => {
      const job = buildMockJob('some-other-job');
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should process matching job name', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });
  });

  // ─── 7-day warning ────────────────────────────────────────────────────

  describe('checkTenantDeadlines — 7-day warning', () => {
    it('should send 7-day notification for requests with deadline 4-7 days away', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(5) }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_A_ID,
          recipient_user_id: USER_ID,
          template_key: 'compliance_deadline_7day',
          source_entity_type: 'compliance_request',
          source_entity_id: REQUEST_ID,
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });

    it('should send 7-day notification at exactly 7 days remaining', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(7) }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_7day',
        }),
      });
    });

    it('should NOT send notification for requests more than 7 days away', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(10) }),
      ]);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── 3-day warning ────────────────────────────────────────────────────

  describe('checkTenantDeadlines — 3-day warning', () => {
    it('should send 3-day notification for requests with deadline 1-3 days away', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(2) }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_3day',
          source_entity_id: REQUEST_ID,
        }),
      });
    });

    it('should send 3-day notification at exactly 3 days remaining', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(3) }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_3day',
        }),
      });
    });
  });

  // ─── Deadline exceeded ────────────────────────────────────────────────

  describe('checkTenantDeadlines — deadline exceeded', () => {
    it('should set deadline_exceeded=true and notify when past deadline', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: daysFromNow(-1),
          deadline_exceeded: false,
        }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { deadline_exceeded: true },
      });

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_exceeded',
          source_entity_id: REQUEST_ID,
        }),
      });
    });

    it('should flag deadline exceeded when deadline is exactly now (0 days remaining)', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      // Use a deadline slightly in the past to ensure daysRemaining <= 0
      const justPast = new Date();
      justPast.setMinutes(justPast.getMinutes() - 5);

      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: justPast,
          deadline_exceeded: false,
        }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { deadline_exceeded: true },
      });
    });
  });

  // ─── Already exceeded ─────────────────────────────────────────────────

  describe('checkTenantDeadlines — already exceeded', () => {
    it('should NOT update or notify when deadline_exceeded is already true', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: daysFromNow(-3),
          deadline_exceeded: true,
        }),
      ]);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Extension-aware deadline ─────────────────────────────────────────

  describe('checkTenantDeadlines — extension-aware deadline', () => {
    it('should use extension_deadline_at when extension_granted is true', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);

      // Original deadline was 2 days away (would trigger 3-day),
      // but extension pushes it to 6 days (should trigger 7-day instead)
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: daysFromNow(2),
          extension_granted: true,
          extension_deadline_at: daysFromNow(6),
        }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      // Should send 7-day (not 3-day) because effective deadline is 6 days away
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_7day',
        }),
      });
    });

    it('should use original deadline_at when extension_granted is false', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);

      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: daysFromNow(2),
          extension_granted: false,
          extension_deadline_at: daysFromNow(15),
        }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      // Should send 3-day (using original deadline_at, ignoring extension_deadline_at)
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_3day',
        }),
      });
    });

    it('should flag exceeded based on extension deadline when extension is granted', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);

      // Original deadline passed, but extension is still in the future
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({
          deadline_at: daysFromNow(-2),
          extension_granted: true,
          extension_deadline_at: daysFromNow(5),
          deadline_exceeded: false,
        }),
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      // Should NOT flag as exceeded — extension deadline is still 5 days away
      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();

      // Should send 7-day warning based on extension deadline
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          template_key: 'compliance_deadline_7day',
        }),
      });
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe('checkTenantDeadlines — deduplication', () => {
    it('should NOT create notification if one already exists with same template and source', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(5) }),
      ]);

      // Existing notification found
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'existing-notif-id',
        template_key: 'compliance_deadline_7day',
      });

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          recipient_user_id: USER_ID,
          template_key: 'compliance_deadline_7day',
          source_entity_type: 'compliance_request',
          source_entity_id: REQUEST_ID,
        },
      });

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should create notification when no duplicate exists', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);
      mockPrisma.complianceRequest.findMany.mockResolvedValue([
        buildRequest({ deadline_at: daysFromNow(5) }),
      ]);

      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Skips completed/rejected ─────────────────────────────────────────

  describe('checkTenantDeadlines — terminal statuses', () => {
    it('should not check requests in completed or rejected status', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_A_ID }]);

      // The findMany is called with notIn filter — verify the query shape
      mockPrisma.complianceRequest.findMany.mockResolvedValue([]);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          status: { notIn: ['completed', 'rejected'] },
          deadline_at: { not: null },
        },
      });

      // No notifications or updates
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ─── Multiple tenants ─────────────────────────────────────────────────

  describe('process — multiple tenants', () => {
    it('should iterate all active tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID },
        { id: TENANT_B_ID },
      ]);

      mockPrisma.complianceRequest.findMany.mockResolvedValue([]);

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      await processor.process(job);

      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledTimes(2);

      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_A_ID }),
        }),
      );

      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_B_ID }),
        }),
      );
    });

    it('should handle tenant processing errors gracefully and continue', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID },
        { id: TENANT_B_ID },
      ]);

      let callCount = 0;
      mockPrisma.complianceRequest.findMany.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Database connection lost');
        }
        return [];
      });

      const job = buildMockJob(DEADLINE_CHECK_JOB);
      // Should not throw — error is caught and logged
      await processor.process(job);

      // Both tenants were attempted
      expect(mockPrisma.complianceRequest.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
