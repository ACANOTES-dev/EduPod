/* eslint-disable @typescript-eslint/no-explicit-any, import/order -- testing internal implementation */
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

jest.mock('@school/prisma', () => ({
  ComplianceAnonymisationCore: jest.fn().mockImplementation(() => ({
    anonymiseSubject: jest.fn(),
  })),
}));

import type { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { getRedisClient } from '../../base/redis.helpers';
import { deleteFromS3, uploadToS3 } from '../../base/s3.helpers';
import { deleteSearchDocument } from '../../base/search.helpers';

import {
  COMPLIANCE_EXECUTION_JOB,
  ComplianceExecutionJob,
  ComplianceExecutionProcessor,
} from './compliance-execution.processor';

describe('ComplianceExecutionProcessor', () => {
  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const REQUEST_ID = '22222222-2222-2222-2222-222222222222';
  const SUBJECT_ID = '33333333-3333-3333-3333-333333333333';
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

  const mockTx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
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
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    earlyWarningTierTransition: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    $transaction: jest.fn(),
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
      first_name: 'Test',
      last_name: 'Student',
      student_parents: [],
      attendance_records: [],
      grades: [],
    });

    mockTx.parent.findFirst.mockResolvedValue({
      id: SUBJECT_ID,
      first_name: 'Test',
      last_name: 'Parent',
      student_parents: [],
    });

    mockTx.household.findFirst.mockResolvedValue({
      id: SUBJECT_ID,
      name: 'Test Household',
      students: [],
      household_parents: [],
    });

    mockTx.user.findUnique.mockResolvedValue({
      id: SUBJECT_ID,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      created_at: new Date(),
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

    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        return callback(mockTx);
      },
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ComplianceExecutionProcessor', () => {
    let processor: ComplianceExecutionProcessor;

    beforeEach(() => {
      processor = new ComplianceExecutionProcessor(mockPrisma as unknown as PrismaClient);
    });

    it('should skip jobs with wrong name', async () => {
      const job = { name: 'wrong-job', data: {} } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should throw when tenant_id is missing', async () => {
      const job = {
        name: COMPLIANCE_EXECUTION_JOB,
        data: { compliance_request_id: REQUEST_ID },
      } as unknown as Job;

      await expect(processor.process(job)).rejects.toThrow('missing tenant_id');
    });

    it('should process erasure job successfully', async () => {
      const job = {
        name: COMPLIANCE_EXECUTION_JOB,
        data: { tenant_id: TENANT_ID, compliance_request_id: REQUEST_ID },
      } as unknown as Job;

      await processor.process(job);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('ComplianceExecutionJob', () => {
    let job: ComplianceExecutionJob;

    beforeEach(() => {
      job = new ComplianceExecutionJob(mockPrisma as unknown as PrismaClient, mockCore as any);
    });

    describe('processJob', () => {
      it('should throw when compliance request not found', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue(null);

        await expect(
          job.execute({
            tenant_id: TENANT_ID,
            compliance_request_id: REQUEST_ID,
          }),
        ).rejects.toThrow('ComplianceRequest');
      });

      it('should skip when request already completed', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'completed',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.update).not.toHaveBeenCalled();
      });

      it('should handle access_export request type', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
          where: { id: REQUEST_ID },
          data: { status: 'completed' },
        });
      });

      it('should handle rectification request type', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'rectification',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.update).toHaveBeenCalled();
      });

      it('should throw on unknown request type', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'unknown_type',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        await expect(
          job.execute({
            tenant_id: TENANT_ID,
            compliance_request_id: REQUEST_ID,
          }),
        ).rejects.toThrow('Unknown compliance request type');
      });
    });

    describe('handleAccessExport', () => {
      it('should export student data', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.student.findFirst.mockResolvedValue({
          id: SUBJECT_ID,
          first_name: 'John',
          last_name: 'Doe',
          student_parents: [{ parent: { id: 'parent-1', first_name: 'Jane' } }],
          attendance_records: [{ id: 'att-1', status: 'present' }],
          grades: [{ id: 'grade-1', score: 85 }],
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
        expect(mockTx.complianceRequest.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: REQUEST_ID },
            data: expect.objectContaining({
              export_file_key: expect.stringContaining('compliance-exports'),
            }),
          }),
        );
      });

      it('should export parent data', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'parent',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.parent.findFirst.mockResolvedValue({
          id: SUBJECT_ID,
          first_name: 'Jane',
          last_name: 'Doe',
          student_parents: [{ student: { id: 'student-1', first_name: 'John' } }],
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should export household data', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'household',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.household.findFirst.mockResolvedValue({
          id: SUBJECT_ID,
          name: 'Test Household',
          students: [{ id: 'student-1', first_name: 'John' }],
          household_parents: [{ parent: { id: 'parent-1', first_name: 'Jane' } }],
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should export user data', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.user.findUnique.mockResolvedValue({
          id: SUBJECT_ID,
          first_name: 'Admin',
          last_name: 'User',
          email: 'admin@example.com',
          created_at: new Date(),
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should handle unknown subject type gracefully', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'unknown',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should continue even if S3 upload fails', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        (uploadToS3 as jest.Mock).mockRejectedValue(new Error('S3 Error'));

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.update).toHaveBeenCalled();
      });
    });

    describe('handleErasure', () => {
      it('should skip when classification is retain_legal_basis', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: 'retain_legal_basis',
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      });

      it('should run anonymisation and cleanup', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: 'erase',
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockCore.anonymiseSubject).toHaveBeenCalledWith(
          TENANT_ID,
          'student',
          SUBJECT_ID,
          expect.anything(),
        );
      });

      it('should run cleanup when no classification specified', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: null,
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockCore.anonymiseSubject).toHaveBeenCalled();
      });
    });

    describe('cleanup operations', () => {
      beforeEach(() => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: 'erase',
          status: 'approved',
        });
      });

      it('should remove search entries during cleanup', async () => {
        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(deleteSearchDocument).toHaveBeenCalledWith('students', SUBJECT_ID);
      });

      it('should delete S3 objects during cleanup', async () => {
        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(deleteFromS3).toHaveBeenCalledWith(
          `${TENANT_ID}/compliance-exports/${REQUEST_ID}.json`,
        );
      });

      it('should clear compliance request file keys', async () => {
        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.updateMany).toHaveBeenCalledWith({
          where: { id: { in: [REQUEST_ID] } },
          data: { export_file_key: null },
        });
      });

      it('should clear Redis keys during cleanup', async () => {
        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockPipeline.del).toHaveBeenCalledWith(`preview:student:${SUBJECT_ID}`);
        expect(mockPipeline.del).toHaveBeenCalledWith(
          `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
        );
        expect(mockPipeline.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
        expect(mockPipeline.exec).toHaveBeenCalled();
      });

      it('should delete user sessions', async () => {
        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockRedis.smembers).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
        expect(mockRedis.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
      });

      it('should scan for cache patterns', async () => {
        mockCore.anonymiseSubject.mockResolvedValue({
          anonymised_entities: ['student'],
          cleanup: {
            searchRemovals: [],
            previewKeys: [],
            cachePatterns: [`tenant:${TENANT_ID}:student:*`],
            unreadNotificationUserIds: [],
            sessionUserIds: [],
            permissionMembershipIds: [],
            s3ObjectKeys: [],
            complianceRequestIdsToClear: [],
          },
        });

        mockRedis.scan.mockResolvedValueOnce(['0', [`tenant:${TENANT_ID}:student:123`]]);

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockRedis.scan).toHaveBeenCalledWith(
          '0',
          'MATCH',
          `tenant:${TENANT_ID}:student:*`,
          'COUNT',
          '100',
        );
      });

      it('should handle S3 deletion errors gracefully', async () => {
        mockCore.anonymiseSubject.mockResolvedValue({
          anonymised_entities: ['student'],
          cleanup: {
            searchRemovals: [],
            previewKeys: [],
            cachePatterns: [],
            unreadNotificationUserIds: [],
            sessionUserIds: [],
            permissionMembershipIds: [],
            s3ObjectKeys: ['corrupted-key'],
            complianceRequestIdsToClear: [],
          },
        });

        (deleteFromS3 as jest.Mock).mockRejectedValue(new Error('S3 Error'));

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        // Should continue despite error
        expect(mockTx.complianceRequest.update).toHaveBeenCalled();
      });

      it('should handle empty cleanup lists', async () => {
        mockCore.anonymiseSubject.mockResolvedValue({
          anonymised_entities: ['student'],
          cleanup: {
            searchRemovals: [],
            previewKeys: [],
            cachePatterns: [],
            unreadNotificationUserIds: [],
            sessionUserIds: [],
            permissionMembershipIds: [],
            s3ObjectKeys: [],
            complianceRequestIdsToClear: [],
          },
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.complianceRequest.update).toHaveBeenCalled();
      });

      it('should iterate through scan cursor', async () => {
        mockCore.anonymiseSubject.mockResolvedValue({
          anonymised_entities: ['student'],
          cleanup: {
            searchRemovals: [],
            previewKeys: [],
            cachePatterns: [`tenant:${TENANT_ID}:*`],
            unreadNotificationUserIds: [],
            sessionUserIds: [],
            permissionMembershipIds: [],
            s3ObjectKeys: [],
            complianceRequestIdsToClear: [],
          },
        });

        mockRedis.scan
          .mockResolvedValueOnce(['100', ['key-1']])
          .mockResolvedValueOnce(['0', ['key-2']]);

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      });

      it('should deduplicate Redis keys', async () => {
        mockCore.anonymiseSubject.mockResolvedValue({
          anonymised_entities: ['student'],
          cleanup: {
            searchRemovals: [],
            previewKeys: ['same-key'],
            cachePatterns: [],
            unreadNotificationUserIds: [],
            sessionUserIds: [],
            permissionMembershipIds: ['same-key'],
            s3ObjectKeys: [],
            complianceRequestIdsToClear: [],
          },
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        // Should dedupe keys, but still call both
        expect(mockPipeline.del).toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle missing student data', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.student.findFirst.mockResolvedValue(null);

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should handle null user email', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'access_export',
          subject_type: 'user',
          subject_id: SUBJECT_ID,
          status: 'approved',
        });

        mockTx.user.findUnique.mockResolvedValue({
          id: SUBJECT_ID,
          first_name: 'Test',
          last_name: 'User',
          email: null,
          created_at: new Date(),
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(uploadToS3).toHaveBeenCalled();
      });

      it('should handle multiple sessions', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: 'erase',
          status: 'approved',
        });

        mockRedis.smembers.mockResolvedValue(['session-1', 'session-2', 'session-3']);

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockRedis.del).toHaveBeenCalledWith(
          'session:session-1',
          'session:session-2',
          'session:session-3',
        );
      });

      it('should handle search index status deletion', async () => {
        mockTx.complianceRequest.findFirst.mockResolvedValue({
          id: REQUEST_ID,
          tenant_id: TENANT_ID,
          request_type: 'erasure',
          subject_type: 'student',
          subject_id: SUBJECT_ID,
          classification: 'erase',
          status: 'approved',
        });

        await job.execute({
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        });

        expect(mockTx.searchIndexStatus.deleteMany).toHaveBeenCalledWith({
          where: {
            entity_type: 'students',
            entity_id: SUBJECT_ID,
          },
        });
      });
    });
  });
});
