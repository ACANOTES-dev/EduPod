/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Job } from 'bullmq';

import {
  RETENTION_ENFORCEMENT_JOB,
  RetentionEnforcementProcessor,
} from './retention-enforcement.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const SYSTEM_USER_SENTINEL = '00000000-0000-0000-0000-000000000000';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    retentionPolicy: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    retentionHold: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    contactFormSubmission: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    nlQueryHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    gdprTokenUsageLog: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    complianceRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    application: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    parentInquiryMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
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

describe('RetentionEnforcementProcessor', () => {
  let processor: RetentionEnforcementProcessor;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();

    // Default $transaction: execute the callback, passing a mock tx that mirrors mockPrisma
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: MockPrisma) => Promise<unknown>) => {
      // Create a tx that mimics the top-level mockPrisma but with $executeRaw stubbed
      const txProxy: MockPrisma = {
        ...mockPrisma,
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      return fn(txProxy);
    });

    processor = new RetentionEnforcementProcessor(mockPrisma as never);
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
      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true, name: true },
      });
    });
  });

  // ─── Tenant iteration ──────────────────────────────────────────────────

  describe('process — tenant iteration', () => {
    it('should iterate all active tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
        { id: TENANT_B_ID, name: 'School B' },
      ]);

      // No policies => quick return per tenant
      mockPrisma.retentionPolicy.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      expect(mockPrisma.retentionPolicy.findMany).toHaveBeenCalledTimes(2);
    });

    it('should handle tenant processing errors gracefully and continue', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
        { id: TENANT_B_ID, name: 'School B' },
      ]);

      // First tenant throws, second is fine
      let callCount = 0;
      mockPrisma.retentionPolicy.findMany.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Database connection lost');
        }
        return [];
      });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      // Should not throw — error is caught and logged
      await processor.process(job);

      // Both tenants were attempted
      expect(mockPrisma.retentionPolicy.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Indefinite retention ─────────────────────────────────────────────

  describe('enforceForTenant — indefinite retention', () => {
    it('should skip policies with retention_months = 0 (e.g. child protection)', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'child_protection_safeguarding',
          retention_months: 0,
          action_on_expiry: 'anonymise',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // No delete or find operations for actual records
      expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.deleteMany).not.toHaveBeenCalled();

      // Audit log should record the skip
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_A_ID,
          actor_user_id: SYSTEM_USER_SENTINEL,
          action: 'retention_enforcement',
          entity_type: 'child_protection_safeguarding',
          metadata_json: expect.objectContaining({
            skipped_reason: 'indefinite_retention',
            records_affected: 0,
          }),
        }),
      });
    });
  });

  // ─── Delete-action categories ─────────────────────────────────────────

  describe('enforceForTenant — delete action', () => {
    const EXPIRED_NOTIFICATION_IDS = [
      'aaaa0001-0000-0000-0000-000000000001',
      'aaaa0002-0000-0000-0000-000000000002',
      'aaaa0003-0000-0000-0000-000000000003',
    ];

    beforeEach(() => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      mockPrisma.notification.findMany.mockResolvedValue(
        EXPIRED_NOTIFICATION_IDS.map((id) => ({ id })),
      );

      mockPrisma.notification.deleteMany.mockResolvedValue({
        count: EXPIRED_NOTIFICATION_IDS.length,
      });
    });

    it('should delete expired records for delete-action categories', async () => {
      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Should find expired records
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          created_at: { lt: expect.any(Date) },
        },
        select: { id: true },
      });

      // Should delete in a transaction (via $transaction)
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Audit log for actual deletion
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_A_ID,
          action: 'retention_enforcement',
          entity_type: 'communications_notifications',
          metadata_json: expect.objectContaining({
            records_affected: EXPIRED_NOTIFICATION_IDS.length,
            dry_run: false,
          }),
        }),
      });
    });

    it('should not delete when no expired records are found', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 0,
          }),
        }),
      });
    });
  });

  // ─── Dry run ──────────────────────────────────────────────────────────

  describe('enforceForTenant — dry run', () => {
    it('should not delete records when dry_run is true', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const expiredIds = [
        { id: 'bbbb0001-0000-0000-0000-000000000001' },
        { id: 'bbbb0002-0000-0000-0000-000000000002' },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(expiredIds);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB, { dry_run: true });
      await processor.process(job);

      // Should NOT call $transaction (no actual deletions)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Audit entry should reflect dry_run
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            dry_run: true,
            records_affected: 2,
          }),
        }),
      });
    });
  });

  // ─── Retention holds ──────────────────────────────────────────────────

  describe('enforceForTenant — retention holds', () => {
    it('should skip subjects with active retention holds', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      // Active hold on one notification
      const heldNotificationId = 'cccc0001-0000-0000-0000-000000000001';
      mockPrisma.retentionHold.findMany.mockResolvedValue([
        {
          subject_type: 'communications_notifications',
          subject_id: heldNotificationId,
        },
      ]);

      const unheldId = 'cccc0002-0000-0000-0000-000000000002';
      mockPrisma.notification.findMany.mockResolvedValue([
        { id: heldNotificationId },
        { id: unheldId },
      ]);

      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Transaction called for deletion — only the non-held record
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Audit log should show 1 record affected (the non-held one)
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 1,
          }),
        }),
      });
    });
  });

  // ─── Audit logging ────────────────────────────────────────────────────

  describe('audit logging', () => {
    it('should create an audit log entry for each enforcement action', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'audit_logs',
          retention_months: 24,
          action_on_expiry: 'delete',
        },
        {
          tenant_id: null,
          data_category: 'child_protection_safeguarding',
          retention_months: 0,
          action_on_expiry: 'anonymise',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      // auditLog model for deletion — add findMany mock
      (mockPrisma.auditLog as Record<string, jest.Mock>).findMany =
        jest.fn().mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Two audit entries: one per policy
      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Policy merging ───────────────────────────────────────────────────

  describe('policy merging', () => {
    it('should use tenant override over platform default', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      // Platform default: 24 months, Tenant override: 36 months
      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 24,
          action_on_expiry: 'delete',
        },
        {
          tenant_id: TENANT_A_ID,
          data_category: 'communications_notifications',
          retention_months: 36,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // The cutoff date should use 36 months (tenant override)
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          created_at: { lt: expect.any(Date) },
        },
        select: { id: true },
      });

      // Verify the cutoff date corresponds to ~36 months ago (within 1 month tolerance)
      const call = mockPrisma.notification.findMany.mock.calls[0][0] as {
        where: { created_at: { lt: Date } };
      };
      const cutoff = call.where.created_at.lt;
      const expectedCutoff = new Date();
      expectedCutoff.setMonth(expectedCutoff.getMonth() - 36);

      // Allow 2-day tolerance for month calculation edge cases
      const diffMs = Math.abs(cutoff.getTime() - expectedCutoff.getTime());
      expect(diffMs).toBeLessThan(2 * 24 * 60 * 60 * 1000);

      // Audit log should reflect the tenant override's retention_months
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            retention_months: 36,
          }),
        }),
      });
    });
  });

  // ─── Batch processing ─────────────────────────────────────────────────

  describe('batch processing', () => {
    it('should process deletions in chunks of 100', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      // Generate 250 expired IDs
      const expiredIds = Array.from({ length: 250 }, (_, i) => ({
        id: `dddd${String(i).padStart(4, '0')}-0000-0000-0000-000000000001`,
      }));
      mockPrisma.notification.findMany.mockResolvedValue(expiredIds);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 100 });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Should call $transaction 3 times (chunks of 100, 100, 50)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Anonymise categories ─────────────────────────────────────────────

  describe('enforceForTenant — anonymise categories', () => {
    it('should log anonymisation intent without executing for complex categories', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'student_records',
          retention_months: 84,
          action_on_expiry: 'anonymise',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // No actual record operations
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Audit log should reflect deferred anonymisation
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            data_category: 'student_records',
            records_affected: 0,
            skipped_reason: 'anonymisation_deferred',
          }),
        }),
      });
    });
  });

  // ─── Rejected admissions (special case) ──────────────────────────────

  describe('enforceForTenant — rejected admissions', () => {
    it('should delete rejected application records past retention cutoff', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'rejected_admissions',
          retention_months: 6,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const expiredAppIds = [
        { id: 'eeee0001-0000-0000-0000-000000000001' },
        { id: 'eeee0002-0000-0000-0000-000000000002' },
      ];
      mockPrisma.application.findMany.mockResolvedValue(expiredAppIds);
      mockPrisma.application.deleteMany.mockResolvedValue({ count: 2 });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Should query with status: 'rejected' and updated_at filter
      expect(mockPrisma.application.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          status: 'rejected',
          updated_at: { lt: expect.any(Date) },
        },
        select: { id: true },
      });

      // Should delete via transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // Audit log records deletion
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'rejected_admissions',
          metadata_json: expect.objectContaining({
            records_affected: 2,
            dry_run: false,
          }),
        }),
      });
    });

    it('should skip rejected admissions with active holds', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'rejected_admissions',
          retention_months: 6,
          action_on_expiry: 'delete',
        },
      ]);

      const heldId = 'eeee0001-0000-0000-0000-000000000001';
      mockPrisma.retentionHold.findMany.mockResolvedValue([
        { subject_type: 'rejected_admissions', subject_id: heldId },
      ]);

      mockPrisma.application.findMany.mockResolvedValue([
        { id: heldId },
      ]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // All records held — no transaction
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 0,
          }),
        }),
      });
    });
  });

  // ─── Parent inquiry messages ─────────────────────────────────────────

  describe('enforceForTenant — parent inquiry messages', () => {
    it('should delete expired parent inquiry message records', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'parent_inquiry_messages',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const expiredIds = [
        { id: 'ffff0001-0000-0000-0000-000000000001' },
      ];
      mockPrisma.parentInquiryMessage.findMany.mockResolvedValue(expiredIds);
      mockPrisma.parentInquiryMessage.deleteMany.mockResolvedValue({ count: 1 });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Should query with standard created_at filter (no extra status filter)
      expect(mockPrisma.parentInquiryMessage.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A_ID,
          created_at: { lt: expect.any(Date) },
        },
        select: { id: true },
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'parent_inquiry_messages',
          metadata_json: expect.objectContaining({
            records_affected: 1,
            dry_run: false,
          }),
        }),
      });
    });
  });

  // ─── Archive action ──────────────────────────────────────────────────

  describe('enforceForTenant — archive action', () => {
    it('should log archive intent and skip without executing', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'some_archivable_category',
          retention_months: 60,
          action_on_expiry: 'archive',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // No actual record operations
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Audit log should reflect deferred archiving
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            data_category: 'some_archivable_category',
            action_on_expiry: 'archive',
            records_affected: 0,
            skipped_reason: 'archive_deferred',
          }),
        }),
      });
    });
  });

  // ─── Idempotency ─────────────────────────────────────────────────────

  describe('enforceForTenant — idempotency', () => {
    it('should find nothing to delete on second run after records were already removed', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      const expiredIds = [
        { id: 'idem0001-0000-0000-0000-000000000001' },
        { id: 'idem0002-0000-0000-0000-000000000002' },
      ];

      // First run: records exist and are deleted
      mockPrisma.notification.findMany.mockResolvedValue(expiredIds);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 2 });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 2,
          }),
        }),
      });

      // Reset mocks for second run
      jest.clearAllMocks();

      // Re-stub tenant and policy queries (cleared by clearAllMocks)
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);
      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);
      mockPrisma.retentionHold.findMany.mockResolvedValue([]);

      // Second run: records already deleted — findMany returns empty
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await processor.process(job);

      // No transaction needed — nothing to delete
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();

      // Audit log records 0 affected
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 0,
          }),
        }),
      });
    });
  });

  // ─── Hold release then enforce ────────────────────────────────────────

  describe('enforceForTenant — hold release then enforce', () => {
    it('should skip held subjects, then enforce after hold is released', async () => {
      const heldId = 'hold0001-0000-0000-0000-000000000001';
      const unheldId = 'hold0002-0000-0000-0000-000000000002';

      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);

      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);

      // First run: hold active on heldId
      mockPrisma.retentionHold.findMany.mockResolvedValue([
        { subject_type: 'communications_notifications', subject_id: heldId },
      ]);

      mockPrisma.notification.findMany.mockResolvedValue([
        { id: heldId },
        { id: unheldId },
      ]);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      // Re-wire $transaction for this describe block
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: MockPrisma) => Promise<unknown>) => {
        const txProxy: MockPrisma = {
          ...mockPrisma,
          $executeRaw: jest.fn().mockResolvedValue(undefined),
        };
        return fn(txProxy);
      });

      const job = buildMockJob(RETENTION_ENFORCEMENT_JOB);
      await processor.process(job);

      // Only the unheld record should be deleted
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 1,
          }),
        }),
      });

      // Reset for second run
      jest.clearAllMocks();

      // Re-wire $transaction again after clearAllMocks
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: MockPrisma) => Promise<unknown>) => {
        const txProxy: MockPrisma = {
          ...mockPrisma,
          $executeRaw: jest.fn().mockResolvedValue(undefined),
        };
        return fn(txProxy);
      });

      // Second run: hold released — heldId is now eligible
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_A_ID, name: 'School A' },
      ]);
      mockPrisma.retentionPolicy.findMany.mockResolvedValue([
        {
          tenant_id: null,
          data_category: 'communications_notifications',
          retention_months: 12,
          action_on_expiry: 'delete',
        },
      ]);
      mockPrisma.retentionHold.findMany.mockResolvedValue([]); // No holds

      // Only the previously-held record remains
      mockPrisma.notification.findMany.mockResolvedValue([{ id: heldId }]);
      mockPrisma.notification.deleteMany.mockResolvedValue({ count: 1 });

      await processor.process(job);

      // Now the previously held record is deleted
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata_json: expect.objectContaining({
            records_affected: 1,
          }),
        }),
      });
    });
  });
});
