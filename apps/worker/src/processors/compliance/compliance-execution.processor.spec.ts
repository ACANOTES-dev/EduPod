/* eslint-disable import/order -- jest.mock must precede mocked imports */
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
/* eslint-enable import/order */

import type { PrismaClient } from '@prisma/client';

import { getRedisClient } from '../../base/redis.helpers';
import { deleteFromS3 } from '../../base/s3.helpers';
import { deleteSearchDocument } from '../../base/search.helpers';

import { ComplianceExecutionJob } from './compliance-execution.processor';

describe('ComplianceExecutionJob', () => {
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
    complianceRequest: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    searchIndexStatus: {
      deleteMany: jest.fn(),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ComplianceExecutionJob — processJob', () => {
    it('delegates erasure to the shared anonymisation core and runs cleanup', async () => {
      const job = new ComplianceExecutionJob({} as PrismaClient, mockCore as never);

      await (
        job as unknown as {
          processJob: (
            data: { tenant_id: string; compliance_request_id: string },
            tx: PrismaClient,
          ) => Promise<void>;
        }
      ).processJob(
        {
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        },
        mockTx as unknown as PrismaClient,
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

      await (
        job as unknown as {
          processJob: (
            data: { tenant_id: string; compliance_request_id: string },
            tx: PrismaClient,
          ) => Promise<void>;
        }
      ).processJob(
        {
          tenant_id: TENANT_ID,
          compliance_request_id: REQUEST_ID,
        },
        mockTx as unknown as PrismaClient,
      );

      expect(mockCore.anonymiseSubject).not.toHaveBeenCalled();
      expect(mockTx.complianceRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { status: 'completed' },
      });
    });
  });
});
