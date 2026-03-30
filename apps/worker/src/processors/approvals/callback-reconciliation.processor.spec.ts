import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  APPROVAL_CALLBACK_RECONCILIATION_JOB,
  ApprovalCallbackReconciliationProcessor,
} from './callback-reconciliation.processor';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const REQUEST_ID_1 = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID_2 = '22222222-2222-2222-2222-222222222222';
const REQUEST_ID_3 = '33333333-3333-3333-3333-333333333333';
const APPROVER_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET_ENTITY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function buildStuckRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REQUEST_ID_1,
    tenant_id: TENANT_ID,
    action_type: 'invoice_issue',
    target_entity_id: TARGET_ENTITY_ID,
    approver_user_id: APPROVER_USER_ID,
    callback_status: 'pending',
    callback_attempts: 0,
    decided_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    ...overrides,
  };
}

describe('ApprovalCallbackReconciliationProcessor', () => {
  let processor: ApprovalCallbackReconciliationProcessor;
  let mockPrisma: {
    approvalRequest: {
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockFinanceQueue: { add: jest.Mock };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockPayrollQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      approvalRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    mockFinanceQueue = { add: jest.fn().mockResolvedValue({}) };
    mockNotificationsQueue = { add: jest.fn().mockResolvedValue({}) };
    mockPayrollQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalCallbackReconciliationProcessor,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.FINANCE), useValue: mockFinanceQueue },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: mockNotificationsQueue },
        { provide: getQueueToken(QUEUE_NAMES.PAYROLL), useValue: mockPayrollQueue },
      ],
    }).compile();

    processor = module.get<ApprovalCallbackReconciliationProcessor>(
      ApprovalCallbackReconciliationProcessor,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip jobs with a different name', async () => {
    const job = { name: 'some-other-job', data: {} } as Job;
    await processor.process(job);

    expect(mockPrisma.approvalRequest.findMany).not.toHaveBeenCalled();
  });

  it('should do nothing when no stuck requests are found', async () => {
    mockPrisma.approvalRequest.findMany.mockResolvedValue([]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    expect(mockPrisma.approvalRequest.findMany).toHaveBeenCalledTimes(1);
    expect(mockFinanceQueue.add).not.toHaveBeenCalled();
    expect(mockNotificationsQueue.add).not.toHaveBeenCalled();
    expect(mockPayrollQueue.add).not.toHaveBeenCalled();
  });

  it('should re-enqueue stuck invoice_issue callback to finance queue', async () => {
    const stuckRequest = buildStuckRequest({
      action_type: 'invoice_issue',
      callback_status: 'pending',
      callback_attempts: 0,
    });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    expect(mockFinanceQueue.add).toHaveBeenCalledWith(
      'finance:on-approval',
      {
        tenant_id: TENANT_ID,
        approval_request_id: REQUEST_ID_1,
        target_entity_id: TARGET_ENTITY_ID,
        approver_user_id: APPROVER_USER_ID,
      },
    );

    expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID_1 },
      data: {
        callback_status: 'pending',
        callback_attempts: 1,
        callback_error: null,
      },
    });
  });

  it('should re-enqueue stuck announcement_publish callback to notifications queue', async () => {
    const stuckRequest = buildStuckRequest({
      action_type: 'announcement_publish',
      callback_status: 'failed',
      callback_attempts: 1,
    });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    expect(mockNotificationsQueue.add).toHaveBeenCalledWith(
      'communications:on-approval',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        approval_request_id: REQUEST_ID_1,
      }),
    );
  });

  it('should re-enqueue stuck payroll_finalise callback to payroll queue', async () => {
    const stuckRequest = buildStuckRequest({
      action_type: 'payroll_finalise',
      callback_status: 'pending',
      callback_attempts: 2,
    });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    expect(mockPayrollQueue.add).toHaveBeenCalledWith(
      'payroll:on-approval',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        approval_request_id: REQUEST_ID_1,
      }),
    );
  });

  it('should mark as permanently failed when max attempts exceeded', async () => {
    const stuckRequest = buildStuckRequest({
      callback_attempts: 4, // One more attempt will hit limit of 5
    });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    // Should NOT re-enqueue — should mark permanently failed
    expect(mockFinanceQueue.add).not.toHaveBeenCalled();

    expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID_1 },
      data: {
        callback_status: 'failed',
        callback_error: expect.stringContaining('Reconciliation exhausted'),
        callback_attempts: 5,
      },
    });
  });

  it('should handle queue enqueue failure gracefully', async () => {
    const stuckRequest = buildStuckRequest({ callback_attempts: 0 });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);
    mockFinanceQueue.add.mockRejectedValue(new Error('Redis unavailable'));

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    // Should mark as failed with the error message
    expect(mockPrisma.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: REQUEST_ID_1 },
      data: {
        callback_status: 'failed',
        callback_error: expect.stringContaining('Redis unavailable'),
        callback_attempts: 1,
      },
    });
  });

  it('should process multiple stuck requests in a single run', async () => {
    const requests = [
      buildStuckRequest({ id: REQUEST_ID_1, action_type: 'invoice_issue', callback_attempts: 0 }),
      buildStuckRequest({ id: REQUEST_ID_2, action_type: 'announcement_publish', callback_attempts: 1 }),
      buildStuckRequest({ id: REQUEST_ID_3, action_type: 'payroll_finalise', callback_attempts: 2 }),
    ];
    mockPrisma.approvalRequest.findMany.mockResolvedValue(requests);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    expect(mockFinanceQueue.add).toHaveBeenCalledTimes(1);
    expect(mockNotificationsQueue.add).toHaveBeenCalledTimes(1);
    expect(mockPayrollQueue.add).toHaveBeenCalledTimes(1);
    // 3 update calls: one per request for incrementing attempts
    expect(mockPrisma.approvalRequest.update).toHaveBeenCalledTimes(3);
  });

  it('should skip requests with unknown action_type', async () => {
    const stuckRequest = buildStuckRequest({
      action_type: 'unknown_action',
      callback_attempts: 0,
    });
    mockPrisma.approvalRequest.findMany.mockResolvedValue([stuckRequest]);

    const job = {
      name: APPROVAL_CALLBACK_RECONCILIATION_JOB,
      data: {},
    } as Job;

    await processor.process(job);

    // Should not enqueue to any queue
    expect(mockFinanceQueue.add).not.toHaveBeenCalled();
    expect(mockNotificationsQueue.add).not.toHaveBeenCalled();
    expect(mockPayrollQueue.add).not.toHaveBeenCalled();
    // Should not update the request either
    expect(mockPrisma.approvalRequest.update).not.toHaveBeenCalled();
  });
});
