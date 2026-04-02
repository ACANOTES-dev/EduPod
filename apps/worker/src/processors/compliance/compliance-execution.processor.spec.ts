jest.mock('../../base/search.helpers', () => ({
  deleteSearchDocument: jest.fn(),
}));

jest.mock('../../base/s3.helpers', () => ({
  deleteFromS3: jest.fn(),
  uploadToS3: jest.fn(),
}));

jest.mock('../../base/redis.helpers', () => ({
  getRedisClient: jest.fn(),
}));

import type { PrismaClient } from '@prisma/client';

import { getRedisClient } from '../../base/redis.helpers';
import { deleteFromS3, uploadToS3 } from '../../base/s3.helpers';
import { deleteSearchDocument } from '../../base/search.helpers';

import { ComplianceExecutionJob } from './compliance-execution.processor';

// ─── Helper: invoke processJob via cast ─────────────────────────────────────

type ProcessJobFn = (
  data: { tenant_id: string; compliance_request_id: string },
  tx: PrismaClient,
) => Promise<void>;

function callProcessJob(
  job: ComplianceExecutionJob,
  data: { tenant_id: string; compliance_request_id: string },
  tx: unknown,
): Promise<void> {
  return (job as unknown as { processJob: ProcessJobFn }).processJob(
    data,
    tx as PrismaClient,
  );
}

describe('ComplianceExecutionJob', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
  const SUBJECT_ID = '33333333-3333-3333-3333-333333333333';
  const SUBJECT_ID_2 = '33333333-3333-3333-3333-333333333334';
  const USER_ID = '44444444-4444-4444-4444-444444444444';
  const MEMBERSHIP_ID = '55555555-5555-5555-5555-555555555555';

  const mockCore = {
    anonymiseSubject: jest.fn(),
  };

  const mockPipeline = {
    del: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockRedis = {
    pipeline: jest.fn(),
    scan: jest.fn(),
    smembers: jest.fn(),
    del: jest.fn(),
  };

  interface MockTx {
    complianceRequest: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    searchIndexStatus: { deleteMany: jest.Mock };
    student: { findFirst: jest.Mock };
    parent: { findFirst: jest.Mock };
    household: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
  }

  const mockTx: MockTx = {
    complianceRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    searchIndexStatus: {
      deleteMany: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    parent: {
      findFirst: jest.fn(),
    },
    household: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTx.complianceRequest.findFirst.mockResolvedValue({
      id: REQUEST_ID,
      tenant_id: TENANT_ID,
      request_type: 'erasure',
      subject_type: 'student',
      subject_id: SUBJECT_ID,
      classification: 'erase',
      status: 'approved',
    });
    mockTx.complianceRequest.update.mockResolvedValue({});
    mockTx.complianceRequest.updateMany.mockResolvedValue({ count: 1 });
    mockTx.searchIndexStatus.deleteMany.mockResolvedValue({ count: 1 });
    mockTx.student.findFirst.mockResolvedValue({
      id: SUBJECT_ID,
      tenant_id: TENANT_ID,
      first_name: 'John',
      last_name: 'Doe',
      student_parents: [],
      attendance_records: [],
      grades: [],
    });
    mockTx.parent.findFirst.mockResolvedValue({
      id: SUBJECT_ID,
      tenant_id: TENANT_ID,
      first_name: 'Jane',
      last_name: 'Doe',
      student_parents: [],
    });
    mockTx.household.findFirst.mockResolvedValue({
      id: SUBJECT_ID,
      tenant_id: TENANT_ID,
      students: [],
      household_parents: [],
    });
    mockTx.user.findUnique.mockResolvedValue({
      id: SUBJECT_ID,
      first_name: 'Admin',
      last_name: 'User',
      email: 'admin@example.com',
      created_at: new Date().toISOString(),
    });

    mockCore.anonymiseSubject.mockResolvedValue({
      anonymised_entities: ['student'],
      cleanup: {
        searchRemovals: [{ entityType: 'students', entityId: SUBJECT_ID }],
        previewKeys: [`preview:student:${SUBJECT_ID}`],
        cachePatterns: [],
        unreadNotificationUserIds: [USER_ID],
        sessionUserIds: [USER_ID],
        permissionMembershipIds: [MEMBERSHIP_ID],
        s3ObjectKeys: [`${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`],
        complianceRequestIdsToClear: [REQUEST_ID],
      },
    });

    mockPipeline.exec.mockResolvedValue([]);
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockRedis.scan.mockResolvedValue(['0', []]);
    mockRedis.smembers.mockResolvedValue(['session-1']);
    mockRedis.del.mockResolvedValue(0);
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    (deleteSearchDocument as jest.Mock).mockResolvedValue(undefined);
    (deleteFromS3 as jest.Mock).mockResolvedValue(undefined);
    (uploadToS3 as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Erasure path ───────────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — erasure path', () => {
    it('delegates erasure to the shared anonymisation core and runs cleanup', async () => {
      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockCore.anonymiseSubject).toHaveBeenCalledWith(
        TENANT_ID,
        'student',
        SUBJECT_ID,
        mockTx,
      );
      expect(deleteSearchDocument).toHaveBeenCalledWith('students', SUBJECT_ID);
      expect(mockTx.searchIndexStatus.deleteMany).toHaveBeenCalledWith({
        where: {
          entity_type: 'students',
          entity_id: SUBJECT_ID,
        },
      });
      expect(deleteFromS3).toHaveBeenCalledWith(
        `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`,
      );
      expect(mockPipeline.del).toHaveBeenCalledWith(`preview:student:${SUBJECT_ID}`);
      expect(mockPipeline.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
      );
      expect(mockPipeline.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-1');
      expect(mockRedis.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
      expect(mockTx.complianceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [REQUEST_ID] } },
        data: { export_file_key: null },
      });
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });

    it('nullifies all personal data fields returned in the anonymisation cleanup', async () => {
      // Verify that after erasure, search entries, S3 objects, Redis keys, and
      // compliance export references are all cleaned up — i.e. the full chain runs
      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      // Search entries removed
      expect(deleteSearchDocument).toHaveBeenCalledTimes(1);
      expect(mockTx.searchIndexStatus.deleteMany).toHaveBeenCalledTimes(1);

      // S3 objects deleted
      expect(deleteFromS3).toHaveBeenCalledTimes(1);

      // Redis pipeline ran for preview keys, notification keys, permission keys
      expect(mockPipeline.del).toHaveBeenCalledWith(`preview:student:${SUBJECT_ID}`);
      expect(mockPipeline.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
      );
      expect(mockPipeline.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
      expect(mockPipeline.exec).toHaveBeenCalledTimes(1);

      // Sessions cleared
      expect(mockRedis.smembers).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
      expect(mockRedis.del).toHaveBeenCalledWith('session:session-1');
      expect(mockRedis.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);

      // Compliance export_file_key nullified
      expect(mockTx.complianceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [REQUEST_ID] } },
        data: { export_file_key: null },
      });
    });

    it('clears Redis cache patterns when cleanup includes them', async () => {
      mockCore.anonymiseSubject.mockResolvedValue({
        anonymised_entities: ['student'],
        cleanup: {
          searchRemovals: [],
          previewKeys: [],
          cachePatterns: ['cache:student:*'],
          unreadNotificationUserIds: [],
          sessionUserIds: [],
          permissionMembershipIds: [],
          s3ObjectKeys: [],
          complianceRequestIdsToClear: [],
        },
      });
      mockRedis.scan.mockResolvedValue(['0', ['cache:student:abc', 'cache:student:def']]);

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockRedis.scan).toHaveBeenCalled();
      expect(mockPipeline.del).toHaveBeenCalledWith('cache:student:abc');
      expect(mockPipeline.del).toHaveBeenCalledWith('cache:student:def');
    });

    it('handles erasure with multiple search removals and S3 keys', async () => {
      const SECOND_REQUEST_ID = '22222222-2222-2222-2222-222222222223';
      mockCore.anonymiseSubject.mockResolvedValue({
        anonymised_entities: ['student', 'parent'],
        cleanup: {
          searchRemovals: [
            { entityType: 'students', entityId: SUBJECT_ID },
            { entityType: 'parents', entityId: SUBJECT_ID_2 },
          ],
          previewKeys: [],
          cachePatterns: [],
          unreadNotificationUserIds: [],
          sessionUserIds: [],
          permissionMembershipIds: [],
          s3ObjectKeys: [
            `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`,
            `${TENANT_ID}/compliance-exports/${SECOND_REQUEST_ID}.json`,
          ],
          complianceRequestIdsToClear: [REQUEST_ID, SECOND_REQUEST_ID],
        },
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(deleteSearchDocument).toHaveBeenCalledTimes(2);
      expect(deleteSearchDocument).toHaveBeenCalledWith('students', SUBJECT_ID);
      expect(deleteSearchDocument).toHaveBeenCalledWith('parents', SUBJECT_ID_2);

      expect(deleteFromS3).toHaveBeenCalledTimes(2);
      expect(deleteFromS3).toHaveBeenCalledWith(
        `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`,
      );
      expect(deleteFromS3).toHaveBeenCalledWith(
        `${TENANT_ID}/compliance-exports/${SECOND_REQUEST_ID}.json`,
      );

      expect(mockTx.complianceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [REQUEST_ID, SECOND_REQUEST_ID] } },
        data: { export_file_key: null },
      });
    });
  });

  // ─── Retain legal basis path ────────────────────────────────────────────────

  describe('ComplianceExecutionJob — retain_legal_basis', () => {
    it('skips the shared anonymisation core for retain_legal_basis requests', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'erasure',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: 'retain_legal_basis',
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });

    it('does not delete any search entries or S3 objects for retain_legal_basis', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'erasure',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: 'retain_legal_basis',
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(deleteSearchDocument).not.toHaveBeenCalled();
      expect(deleteFromS3).not.toHaveBeenCalled();
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });
  });

  // ─── Export path ────────────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — access_export path', () => {
    it('collects subject data and uploads JSON export to S3', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      // Should fetch student data
      expect(mockTx.student.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        include: {
          student_parents: { include: { parent: true } },
          attendance_records: { take: 100, orderBy: { created_at: 'desc' } },
          grades: { take: 100, orderBy: { created_at: 'desc' } },
        },
      });

      // Should upload to S3
      expect(uploadToS3).toHaveBeenCalledTimes(1);
      const uploadCall = (uploadToS3 as jest.Mock).mock.calls[0];
      expect(uploadCall[0]).toMatch(
        new RegExp(`^compliance-exports/${TENANT_ID}/${REQUEST_ID}-\\d+\\.json$`),
      );
      const parsed = JSON.parse(uploadCall[1] as string) as Record<string, unknown>;
      expect(parsed['tenant_id']).toBe(TENANT_ID);
      expect(parsed['subject_type']).toBe('student');
      expect(parsed['subject_id']).toBe(SUBJECT_ID);
      expect(parsed['student']).toBeDefined();

      // Should update the request with the export file key
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            export_file_key: expect.stringMatching(
              new RegExp(`^compliance-exports/${TENANT_ID}/${REQUEST_ID}-\\d+\\.json$`),
            ),
          }),
        }),
      );

      // Should mark request completed
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });

    it('exports parent subject data when subject_type is parent', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'parent',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockTx.parent.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        include: {
          student_parents: { include: { student: true } },
        },
      });

      expect(uploadToS3).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(
        (uploadToS3 as jest.Mock).mock.calls[0][1] as string,
      ) as Record<string, unknown>;
      expect(parsed['parent']).toBeDefined();
      expect(parsed['subject_type']).toBe('parent');
    });

    it('exports household subject data when subject_type is household', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'household',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockTx.household.findFirst).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID, tenant_id: TENANT_ID },
        include: {
          students: true,
          household_parents: { include: { parent: true } },
        },
      });

      expect(uploadToS3).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(
        (uploadToS3 as jest.Mock).mock.calls[0][1] as string,
      ) as Record<string, unknown>;
      expect(parsed['household']).toBeDefined();
    });

    it('exports user subject data without tenant_id filter', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'user',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockTx.user.findUnique).toHaveBeenCalledWith({
        where: { id: SUBJECT_ID },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          created_at: true,
        },
      });

      expect(uploadToS3).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(
        (uploadToS3 as jest.Mock).mock.calls[0][1] as string,
      ) as Record<string, unknown>;
      expect(parsed['user']).toBeDefined();
    });
  });

  // ─── Failure accounting ─────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — failure accounting', () => {
    it('still marks request completed when S3 upload fails during export', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });
      (uploadToS3 as jest.Mock).mockRejectedValue(new Error('S3 connection timeout'));

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      // The export path catches S3 errors gracefully — the file key is still recorded
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            export_file_key: expect.any(String),
          }),
        }),
      );

      // Request still marked completed
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });

    it('continues cleanup when S3 delete fails during erasure', async () => {
      (deleteFromS3 as jest.Mock).mockRejectedValue(new Error('S3 delete error'));

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      // S3 delete failure is caught — cleanup continues
      expect(deleteFromS3).toHaveBeenCalled();

      // Compliance request references are still nullified
      expect(mockTx.complianceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [REQUEST_ID] } },
        data: { export_file_key: null },
      });

      // Request still marked completed
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });
  });

  // ─── Request not found ──────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — request not found', () => {
    it('throws an error when the compliance request does not exist', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue(null);

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await expect(
        callProcessJob(
          job,
          { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
          mockTx,
        ),
      ).rejects.toThrow(
        `ComplianceRequest ${REQUEST_ID} not found for tenant ${TENANT_ID}`,
      );

      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockTx.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ─── Replay / idempotency ──────────────────────────────────────────────────

  describe('ComplianceExecutionJob — replay/idempotency', () => {
    it('skips processing when the request is already completed', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'erasure',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: 'erase',
        status: 'completed',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(deleteSearchDocument).not.toHaveBeenCalled();
      expect(deleteFromS3).not.toHaveBeenCalled();
      // No status update — already completed
      expect(mockTx.complianceRequest.update).not.toHaveBeenCalled();
    });

    it('produces the same result when run twice on an approved erasure request', async () => {
      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      // First execution
      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockCore.anonymiseSubject).toHaveBeenCalledTimes(1);
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });

      jest.clearAllMocks();

      // Reset mocks for second execution — request is now completed
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'erasure',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: 'erase',
        status: 'completed',
      });
      (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      // Second execution — should be a no-op
      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockTx.complianceRequest.update).not.toHaveBeenCalled();
    });
  });

  // ─── Missing tenant_id ─────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — missing tenant_id', () => {
    it('rejects execution via TenantAwareJob.execute when tenant_id is empty', async () => {
      const mockPrisma = {
        $transaction: jest.fn(),
      } as unknown as PrismaClient;

      const job = new ComplianceExecutionJob(mockPrisma, mockCore as never);

      await expect(
        job.execute({
          tenant_id: '',
          compliance_request_id: REQUEST_ID,
        }),
      ).rejects.toThrow('missing tenant_id');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects execution via TenantAwareJob.execute when tenant_id is malformed', async () => {
      const mockPrisma = {
        $transaction: jest.fn(),
      } as unknown as PrismaClient;

      const job = new ComplianceExecutionJob(mockPrisma, mockCore as never);

      await expect(
        job.execute({
          tenant_id: 'not-a-uuid',
          compliance_request_id: REQUEST_ID,
        }),
      ).rejects.toThrow('invalid tenant_id format');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ─── Rectification path ─────────────────────────────────────────────────────

  describe('ComplianceExecutionJob — rectification path', () => {
    it('marks rectification requests as completed without any data modification', async () => {
      mockTx.complianceRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'rectification',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      // No anonymisation or export actions
      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(uploadToS3).not.toHaveBeenCalled();
      expect(deleteFromS3).not.toHaveBeenCalled();
      expect(deleteSearchDocument).not.toHaveBeenCalled();

      // Status marked completed
      expect(mockTx['complianceRequest']!['update']!).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });
  });

  // ─── Unknown request type ───────────────────────────────────────────────────

  describe('ComplianceExecutionJob — unknown request type', () => {
    it('throws an error for an unrecognised request_type', async () => {
      mockTx['complianceRequest']!['findFirst']!.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'invalid_type',
        subject_type: 'student',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await expect(
        callProcessJob(
          job,
          { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
          mockTx,
        ),
      ).rejects.toThrow('Unknown compliance request type: invalid_type');
    });
  });

  // ─── Export with unknown subject type ───────────────────────────────────────

  describe('ComplianceExecutionJob — export unknown subject type', () => {
    it('includes an error field in export data for unknown subject_type', async () => {
      mockTx['complianceRequest']!['findFirst']!.mockResolvedValue({
        id: REQUEST_ID,
        tenant_id: TENANT_ID,
        request_type: 'access_export',
        subject_type: 'unknown_entity',
        subject_id: SUBJECT_ID,
        classification: null,
        status: 'approved',
      });

      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await callProcessJob(
        job,
        { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
        mockTx,
      );

      expect(uploadToS3).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(
        (uploadToS3 as jest.Mock).mock.calls[0][1] as string,
      ) as Record<string, unknown>;
      expect(parsed['error']).toBe('Unknown subject type: unknown_entity');
    });
  });
});
