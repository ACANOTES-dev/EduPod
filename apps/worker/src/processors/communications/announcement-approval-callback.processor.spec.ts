import { Job } from 'bullmq';

import {
  ANNOUNCEMENT_APPROVAL_CALLBACK_JOB,
  type AnnouncementApprovalCallbackPayload,
  AnnouncementApprovalCallbackProcessor,
} from './announcement-approval-callback.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const APPROVAL_REQUEST_ID = '22222222-2222-2222-2222-222222222222';
const ANNOUNCEMENT_ID = '33333333-3333-3333-3333-333333333333';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    announcement: {
      findFirst: jest.fn().mockResolvedValue({
        id: ANNOUNCEMENT_ID,
        status: 'pending_approval',
        title: 'School Closure',
      }),
      update: jest.fn().mockResolvedValue({ id: ANNOUNCEMENT_ID }),
    },
    approvalRequest: {
      update: jest.fn().mockResolvedValue({ id: APPROVAL_REQUEST_ID }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = ANNOUNCEMENT_APPROVAL_CALLBACK_JOB,
  data: Partial<AnnouncementApprovalCallbackPayload> = {},
): Job<AnnouncementApprovalCallbackPayload> {
  return {
    data: {
      approval_request_id: APPROVAL_REQUEST_ID,
      approver_user_id: '44444444-4444-4444-4444-444444444444',
      target_entity_id: ANNOUNCEMENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<AnnouncementApprovalCallbackPayload>;
}

describe('AnnouncementApprovalCallbackProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new AnnouncementApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('communications:other-job'));

    expect(mockTx.announcement.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new AnnouncementApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(ANNOUNCEMENT_APPROVAL_CALLBACK_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should publish pending announcements and mark approval callbacks executed', async () => {
    const mockTx = buildMockTx();
    const processor = new AnnouncementApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.announcement.update).toHaveBeenCalledWith({
      where: { id: ANNOUNCEMENT_ID },
      data: {
        status: 'published',
        published_at: expect.any(Date),
      },
    });
    expect(mockTx.approvalRequest.update).toHaveBeenCalledWith({
      where: { id: APPROVAL_REQUEST_ID },
      data: {
        status: 'executed',
        executed_at: expect.any(Date),
        callback_status: 'executed',
        callback_error: null,
      },
    });
  });

  it('should skip announcements that are already published', async () => {
    const mockTx = buildMockTx();
    mockTx.announcement.findFirst.mockResolvedValue({
      id: ANNOUNCEMENT_ID,
      status: 'published',
      title: 'School Closure',
    });
    const processor = new AnnouncementApprovalCallbackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.announcement.update).not.toHaveBeenCalled();
    expect(mockTx.approvalRequest.update).not.toHaveBeenCalled();
  });
});
