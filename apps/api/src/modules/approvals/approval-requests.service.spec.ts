import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ApprovalRequestsService } from './approval-requests.service';

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
      count: jest.Mock;
    };
    approvalWorkflow: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      approvalRequest: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      approvalWorkflow: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalRequestsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        { provide: getQueueToken('notifications'), useValue: { add: jest.fn() } },
        { provide: getQueueToken('finance'), useValue: { add: jest.fn() } },
        { provide: getQueueToken('payroll'), useValue: { add: jest.fn() } },
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
        requester: { id: REQUESTER_USER_ID, first_name: 'Alice', last_name: 'Smith', email: 'alice@school.test' },
        approver: { id: APPROVER_USER_ID, first_name: 'Bob', last_name: 'Jones', email: 'bob@school.test' },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.update.mockResolvedValue(approvedRequest);

      const result = await service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID, 'Looks good');

      expect(result.status).toBe('approved');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
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

      await expect(
        service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject approving a cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(
        service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should block self-approval with BadRequestException', async () => {
      // Approver is the same person as the requester
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', requester_user_id: APPROVER_USER_ID }),
      );

      await expect(
        service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.approve(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(NotFoundException);
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
        requester: { id: REQUESTER_USER_ID, first_name: 'Alice', last_name: 'Smith', email: 'alice@school.test' },
        approver: { id: APPROVER_USER_ID, first_name: 'Bob', last_name: 'Jones', email: 'bob@school.test' },
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.update.mockResolvedValue(rejectedRequest);

      const result = await service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID, 'Not authorised');

      expect(result.status).toBe('rejected');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
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

      await expect(
        service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject rejecting a cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(
        service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should block self-rejection with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'pending_approval', requester_user_id: APPROVER_USER_ID }),
      );

      await expect(
        service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.reject(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(NotFoundException);
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
        requester: { id: REQUESTER_USER_ID, first_name: 'Alice', last_name: 'Smith', email: 'alice@school.test' },
        approver: null,
      };

      mockPrisma.approvalRequest.findFirst.mockResolvedValue(pendingRequest);
      mockPrisma.approvalRequest.update.mockResolvedValue(cancelledRequest);

      const result = await service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID, 'Changed my mind');

      expect(result.status).toBe('cancelled');
      expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
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

      await expect(
        service.cancel(TENANT_ID, REQUEST_ID, APPROVER_USER_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject cancelling an already-approved request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'approved' }),
      );

      await expect(
        service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should reject cancelling an already-cancelled request with BadRequestException', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(
        buildMockRequest({ status: 'cancelled' }),
      );

      await expect(
        service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when request does not exist', async () => {
      mockPrisma.approvalRequest.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel(TENANT_ID, REQUEST_ID, REQUESTER_USER_ID),
      ).rejects.toThrow(NotFoundException);
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
  });
});
