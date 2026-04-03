import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { ApprovalRequestsService } from './approval-requests.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

const TENANT_ID = 'tenant-uuid-1';
const REQUEST_ID = 'request-uuid-1';
const REQUESTER_USER_ID = 'user-requester-1';
// Approver must be a different user to pass the self-approval check
const APPROVER_USER_ID = 'user-approver-2';

function buildMockRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REQUEST_ID,
    tenant_id: TENANT_ID,
    action_type: 'payroll.finalise_run',
    target_entity_type: 'payroll_run',
    target_entity_id: 'payroll-run-uuid-1',
    requester_user_id: REQUESTER_USER_ID,
    approver_user_id: null,
    status: 'pending_approval',
    decision_comment: null,
    decided_at: null,
    callback_status: null,
    callback_error: null,
    callback_attempts: 0,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('ApprovalRequestsService', () => {
  let service: ApprovalRequestsService;
  let mockPrisma: {
    approvalRequest: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
    approvalWorkflow: {
      findFirst: jest.Mock;
    };
  };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockFinanceQueue: { add: jest.Mock };
  let mockPayrollQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      approvalRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      approvalWorkflow: {
        findFirst: jest.fn(),
      },
    };

    mockNotificationsQueue = { add: jest.fn().mockResolvedValue({}) };
    mockFinanceQueue = { add: jest.fn().mockResolvedValue({}) };
    mockPayrollQueue = { add: jest.fn().mockResolvedValue({}) };
    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
          fn(mockPrisma),
        ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalRequestsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('finance'), useValue: mockFinanceQueue },
        { provide: getQueueToken('payroll'), useValue: mockPayrollQueue },
      ],
    }).compile();

    service = module.get<ApprovalRequestsService>(ApprovalRequestsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // approve
  // -------------------------------------------------------------------------

  describe('approve', () => {
    it('should transition pending_approval → approved and return updated request', async () => {
      const pendingRequest = buildMockRequest({ status: 'pending_approval' });
      const approvedRequest = {
        ...pendingRequest,
        status: 'approved',
        approver_user_id: APPROVER_USER_ID,
        decided_at: new Date(),
        decision_comment: 'Looks good',
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: {
          id: APPROVER_USER_ID,
          first_name: 'Bob',
          last_name: 'Jones',
          email: 'bob@school.test',
        },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(approvedRequest);
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID, 'Looks good');

      expect(result.status).toBe('approved');
      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID, status: 'pending_approval', tenant_id: TENANT_ID },
          data: expect.objectContaining({
            status: 'approved',
            approver_user_id: APPROVER_USER_ID,
            decision_comment: 'Looks good',
          }),
        }),
      );
    });

    it('should reject approving an already-approved request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject approving a cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should block self-approval with BadRequestException', async () => {
      // Approver is the same person as the requester
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', requester_user_id: APPROVER_USER_ID }),
      );

      await expect(service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should set callback_status to pending for action types with callbacks', async () => {
      const pendingRequest = buildMockRequest({
        status: 'pending_approval',
        action_type: 'payroll_finalise',
      });
      const approvedRequest = {
        ...pendingRequest,
        status: 'approved',
        callback_status: 'pending',
        callback_attempts: 0,
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: {
          id: APPROVER_USER_ID,
          first_name: 'Bob',
          last_name: 'Jones',
          email: 'bob@school.test',
        },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(approvedRequest);
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

      await service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID);

      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callback_status: 'pending',
            callback_attempts: 0,
          }),
        }),
      );
      expect(mockPayrollQueue.add).toHaveBeenCalledWith(
        'payroll:on-approval',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          approval_request_id: REQUEST_ID,
        }),
      );
    });

    it('should not set callback_status for action types without callbacks', async () => {
      const pendingRequest = buildMockRequest({
        status: 'pending_approval',
        action_type: 'application_accept', // No callback mapping for this type
      });
      const approvedRequest = {
        ...pendingRequest,
        status: 'approved',
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: {
          id: APPROVER_USER_ID,
          first_name: 'Bob',
          last_name: 'Jones',
          email: 'bob@school.test',
        },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(approvedRequest);
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

      await service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID);

      // Should not include callback_status in the update data
      const updateCall = mockPrisma.approvalRequest.updateMany.mock.calls[0][0];
      expect(updateCall.data.callback_status).toBeUndefined();
      expect(mockPayrollQueue.add).not.toHaveBeenCalled();
      expect(mockFinanceQueue.add).not.toHaveBeenCalled();
      expect(mockNotificationsQueue.add).not.toHaveBeenCalled();
    });

    it('should mark callback_status as failed when queue enqueue fails', async () => {
      const pendingRequest = buildMockRequest({
        status: 'pending_approval',
        action_type: 'invoice_issue',
      });
      const approvedRequest = {
        ...pendingRequest,
        status: 'approved',
        callback_status: 'pending',
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: {
          id: APPROVER_USER_ID,
          first_name: 'Bob',
          last_name: 'Jones',
          email: 'bob@school.test',
        },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce({
        ...approvedRequest,
        callback_status: 'failed',
        callback_error: 'Enqueue failed: Redis connection refused',
      });
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.approvalRequest.update.mockResolvedValue({});
      mockFinanceQueue.add.mockRejectedValue(new Error('Redis connection refused'));

      await service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID);

      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: {
          callback_status: 'failed',
          callback_error: expect.stringContaining('Redis connection refused'),
        },
      });
    });

    it('should reject a stale concurrent approval race with ConflictException', async () => {
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(buildMockRequest({ status: 'pending_approval' }))
        .mockResolvedValueOnce(buildMockRequest({ status: 'rejected' }));
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPayrollQueue.add).not.toHaveBeenCalled();
      expect(mockFinanceQueue.add).not.toHaveBeenCalled();
      expect(mockNotificationsQueue.add).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // reject
  // -------------------------------------------------------------------------

  describe('reject', () => {
    it('should transition pending_approval → rejected and return updated request', async () => {
      const pendingRequest = buildMockRequest({ status: 'pending_approval' });
      const rejectedRequest = {
        ...pendingRequest,
        status: 'rejected',
        approver_user_id: APPROVER_USER_ID,
        decided_at: new Date(),
        decision_comment: 'Not authorised',
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: {
          id: APPROVER_USER_ID,
          first_name: 'Bob',
          last_name: 'Jones',
          email: 'bob@school.test',
        },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(rejectedRequest);
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.reject(
        TENANT_ID,
        REQUEST_ID,
        APPROVER_USER_ID,
        'Not authorised',
      );

      expect(result.status).toBe('rejected');
      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID, status: 'pending_approval', tenant_id: TENANT_ID },
          data: expect.objectContaining({
            status: 'rejected',
            approver_user_id: APPROVER_USER_ID,
            decision_comment: 'Not authorised',
          }),
        }),
      );
    });

    it('should reject rejecting an already-approved request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject rejecting a cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should block self-rejection with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', requester_user_id: APPROVER_USER_ID }),
      );

      await expect(service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject a stale concurrent rejection race with ConflictException', async () => {
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(buildMockRequest({ status: 'pending_approval' }))
        .mockResolvedValueOnce(buildMockRequest({ status: 'approved' }));
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancel
  // -------------------------------------------------------------------------

  describe('cancel', () => {
    it('should transition pending_approval → cancelled and return updated request', async () => {
      const pendingRequest = buildMockRequest({ status: 'pending_approval' });
      const cancelledRequest = {
        ...pendingRequest,
        status: 'cancelled',
        decided_at: new Date(),
        decision_comment: 'Changed my mind',
        requester: {
          id: REQUESTER_USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@school.test',
        },
        approver: null,
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(pendingRequest);
      mockPrisma.approvalRequest.findFirst.mockResolvedValueOnce(cancelledRequest);
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.cancel(
        TENANT_ID,
        REQUEST_ID,
        REQUESTER_USER_ID,
        'Changed my mind',
      );

      expect(result.status).toBe('cancelled');
      expect(mockPrisma.approvalRequest.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID, status: 'pending_approval', tenant_id: TENANT_ID },
          data: expect.objectContaining({
            status: 'cancelled',
            decision_comment: 'Changed my mind',
          }),
        }),
      );
    });

    it('should throw ForbiddenException when a non-requester tries to cancel', async () => {
      // The request belongs to REQUESTER_USER_ID; APPROVER_USER_ID is attempting cancel
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', requester_user_id: REQUESTER_USER_ID }),
      );

      await expect(service.cancel(TENANT_ID, REQUEST_ID, APPROVER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject cancelling an already-approved request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject cancelling an already-cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject a stale concurrent cancellation race with ConflictException', async () => {
      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(buildMockRequest({ status: 'pending_approval' }))
        .mockResolvedValueOnce(buildMockRequest({ status: 'approved' }));
      mockPrisma.approvalRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // retryCallback
  // -------------------------------------------------------------------------

  describe('retryCallback', () => {
    it('should reset callback state and re-enqueue for failed callbacks', async () => {
      const failedRequest = buildMockRequest({
        status: 'approved',
        callback_status: 'failed',
        callback_attempts: 5,
        action_type: 'invoice_issue',
        target_entity_id: 'invoice-123',
        approver_user_id: 'user-456',
      });

      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(failedRequest) // retryCallback lookup
        .mockResolvedValueOnce(failedRequest); // getRequest lookup
      mockPrisma.approvalRequest.update.mockResolvedValue({});

      await service.retryCallback(TENANT_ID, REQUEST_ID);

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { callback_status: 'pending', callback_attempts: 0, callback_error: null },
      });
      expect(mockFinanceQueue.add).toHaveBeenCalledWith('finance:on-approval', {
        tenant_id: TENANT_ID,
        approval_request_id: REQUEST_ID,
        target_entity_id: 'invoice-123',
        approver_user_id: 'user-456',
      });
    });

    it('should return early with message when callback_status is already executed', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved', callback_status: 'executed' }),
      );

      const result = await service.retryCallback(TENANT_ID, REQUEST_ID);

      expect(result).toEqual({
        message: 'Callback already executed successfully — no retry needed',
        id: REQUEST_ID,
        callback_status: 'executed',
      });
      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
      expect(mockFinanceQueue.add).not.toHaveBeenCalled();
    });

    it('should allow retry for stale pending callbacks (> 30 minutes old)', async () => {
      const staleDate = new Date(Date.now() - 45 * 60 * 1000); // 45 minutes ago
      const stalePendingRequest = buildMockRequest({
        status: 'approved',
        callback_status: 'pending',
        action_type: 'invoice_issue',
        target_entity_id: 'invoice-123',
        approver_user_id: 'user-456',
        decided_at: staleDate,
      });

      mockPrisma.approvalRequest.findFirst
        .mockResolvedValueOnce(stalePendingRequest) // retryCallback lookup
        .mockResolvedValueOnce(stalePendingRequest); // getRequest lookup
      mockPrisma.approvalRequest.update.mockResolvedValue({});

      await service.retryCallback(TENANT_ID, REQUEST_ID);

      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
        where: { id: REQUEST_ID },
        data: { callback_status: 'pending', callback_attempts: 0, callback_error: null },
      });
      expect(mockFinanceQueue.add).toHaveBeenCalled();
    });

    it('should reject retry for fresh pending callbacks (< 30 minutes old)', async () => {
      const freshDate = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({
          status: 'approved',
          callback_status: 'pending',
          decided_at: freshDate,
        }),
      );

      await expect(service.retryCallback(TENANT_ID, REQUEST_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject retry for non-approved requests', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', callback_status: null }),
      );

      await expect(service.retryCallback(TENANT_ID, REQUEST_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(service.retryCallback(TENANT_ID, REQUEST_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // bulkRetryCallbacks
  // -------------------------------------------------------------------------

  describe('bulkRetryCallbacks', () => {
    it('should retry stuck callbacks and return summary', async () => {
      const stuckRequests = [
        {
          id: 'req-1',
          action_type: 'invoice_issue',
          target_entity_id: 'inv-1',
          approver_user_id: 'user-1',
          callback_status: 'failed',
        },
        {
          id: 'req-2',
          action_type: 'payroll_finalise',
          target_entity_id: 'pr-1',
          approver_user_id: 'user-2',
          callback_status: 'failed',
        },
      ];

      mockPrisma.approvalRequest.findMany.mockResolvedValue(stuckRequests);
      mockPrisma.approvalRequest.update.mockResolvedValue({});

      const result = await service.bulkRetryCallbacks(TENANT_ID);

      expect(result).toEqual({ retried: 2, skipped: 0 });
      expect(mockFinanceQueue.add).toHaveBeenCalledWith(
        'finance:on-approval',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          approval_request_id: 'req-1',
        }),
      );
      expect(mockPayrollQueue.add).toHaveBeenCalledWith(
        'payroll:on-approval',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          approval_request_id: 'req-2',
        }),
      );
    });

    it('should skip requests without callback mappings', async () => {
      const stuckRequests = [
        {
          id: 'req-1',
          action_type: 'application_accept', // No callback mapping
          target_entity_id: 'app-1',
          approver_user_id: 'user-1',
          callback_status: 'failed',
        },
      ];

      mockPrisma.approvalRequest.findMany.mockResolvedValue(stuckRequests);

      const result = await service.bulkRetryCallbacks(TENANT_ID);

      expect(result).toEqual({ retried: 0, skipped: 1 });
    });

    it('should count failed enqueue as skipped', async () => {
      const stuckRequests = [
        {
          id: 'req-1',
          action_type: 'invoice_issue',
          target_entity_id: 'inv-1',
          approver_user_id: 'user-1',
          callback_status: 'failed',
        },
      ];

      mockPrisma.approvalRequest.findMany.mockResolvedValue(stuckRequests);
      mockPrisma.approvalRequest.update.mockResolvedValue({});
      mockFinanceQueue.add.mockRejectedValue(new Error('Redis down'));

      const result = await service.bulkRetryCallbacks(TENANT_ID);

      expect(result).toEqual({ retried: 0, skipped: 1 });
    });

    it('should filter by status_filter when provided', async () => {
      mockPrisma.approvalRequest.findMany.mockResolvedValue([]);

      await service.bulkRetryCallbacks(TENANT_ID, 'failed', 25);

      expect(mockPrisma.approvalRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            callback_status: { in: ['failed'] },
          }),
          take: 25,
        }),
      );
    });

    it('should return zeroes when no stuck callbacks found', async () => {
      mockPrisma.approvalRequest.findMany.mockResolvedValue([]);

      const result = await service.bulkRetryCallbacks(TENANT_ID);

      expect(result).toEqual({ retried: 0, skipped: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // getCallbackHealth
  // -------------------------------------------------------------------------

  describe('getCallbackHealth', () => {
    it('should return counts for each callback status', async () => {
      mockPrisma.approvalRequest.count
        .mockResolvedValueOnce(3) // pending
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(10) // executed
        .mockResolvedValueOnce(15); // total

      const result = await service.getCallbackHealth(TENANT_ID);

      expect(result).toEqual({ pending: 3, failed: 2, executed: 10, total: 15 });
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledTimes(4);
    });

    it('should return all zeroes when no approved requests with callbacks exist', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(0);

      const result = await service.getCallbackHealth(TENANT_ID);

      expect(result).toEqual({ pending: 0, failed: 0, executed: 0, total: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // checkAndCreateIfNeeded
  // -------------------------------------------------------------------------

  describe('checkAndCreateIfNeeded', () => {
    it('should auto-approve when no active workflow exists for the action type', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue(null);

      const result = await service.checkAndCreateIfNeeded(
        TENANT_ID,
        'payroll.finalise_run',
        'payroll_run',
        'payroll-run-uuid-1',
        REQUESTER_USER_ID,
        false,
      );

      expect(result).toEqual({ approved: true });
      expect(mockPrisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('should auto-approve when user has direct authority even if workflow exists', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue({
        id: 'workflow-uuid-1',
        action_type: 'payroll.finalise_run',
        is_enabled: true,
      });

      const result = await service.checkAndCreateIfNeeded(
        TENANT_ID,
        'payroll.finalise_run',
        'payroll_run',
        'payroll-run-uuid-1',
        REQUESTER_USER_ID,
        true, // hasDirectAuthority
      );

      expect(result).toEqual({ approved: true });
      expect(mockPrisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('should create an approval request and return approved:false when workflow exists and no direct authority', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue({
        id: 'workflow-uuid-1',
        action_type: 'payroll.finalise_run',
        is_enabled: true,
      });
      // No existing open request (duplicate check passes)
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);
      mockPrisma.approvalRequest.create.mockResolvedValue({
        id: 'new-request-uuid-1',
        status: 'pending_approval',
      });

      const result = await service.checkAndCreateIfNeeded(
        TENANT_ID,
        'payroll.finalise_run',
        'payroll_run',
        'payroll-run-uuid-1',
        REQUESTER_USER_ID,
        false, // no direct authority
      );

      expect(result.approved).toBe(false);
      expect(result.request_id).toBe('new-request-uuid-1');
      expect(mockPrisma.approvalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            requester_user_id: REQUESTER_USER_ID,
            status: 'pending_approval',
          }),
        }),
      );
    });

    it('should throw ConflictException when a duplicate open approval request exists (R-22)', async () => {
      mockPrisma.approvalWorkflow.findFirst.mockResolvedValue({
        id: 'workflow-uuid-1',
        action_type: 'payroll.finalise_run',
        is_enabled: true,
      });
      // An open request already exists for this entity
      mockPrisma.approvalRequest.findFirst.mockResolvedValue({
        id: 'existing-request-uuid',
        status: 'pending_approval',
        target_entity_type: 'payroll_run',
        target_entity_id: 'payroll-run-uuid-1',
      });

      await expect(
        service.checkAndCreateIfNeeded(
          TENANT_ID,
          'payroll.finalise_run',
          'payroll_run',
          'payroll-run-uuid-1',
          REQUESTER_USER_ID,
          false,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.approvalRequest.create).not.toHaveBeenCalled();
    });

    it('should use the provided db client when passed (R-21 atomicity)', async () => {
      const mockDb = {
        approvalWorkflow: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'workflow-uuid-1',
            action_type: 'payroll.finalise_run',
            is_enabled: true,
          }),
        },
        approvalRequest: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({
            id: 'new-request-uuid-1',
            status: 'pending_approval',
          }),
        },
      } as unknown as typeof mockPrisma;

      const result = await service.checkAndCreateIfNeeded(
        TENANT_ID,
        'payroll.finalise_run',
        'payroll_run',
        'payroll-run-uuid-1',
        REQUESTER_USER_ID,
        false,
        mockDb as unknown as PrismaService,
      );

      expect(result.approved).toBe(false);
      // Should have used the passed db client, not this.prisma
      expect(mockPrisma.approvalWorkflow.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.approvalRequest.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.approvalRequest.create).not.toHaveBeenCalled();
      expect(mockDb.approvalWorkflow.findFirst).toHaveBeenCalled();
      expect(mockDb.approvalRequest.create).toHaveBeenCalled();
    });
  });
});
