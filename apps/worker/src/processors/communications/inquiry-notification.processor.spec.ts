import { Job } from 'bullmq';

import {
  INQUIRY_NOTIFICATION_JOB,
  type InquiryNotificationPayload,
  InquiryNotificationProcessor,
} from './inquiry-notification.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INQUIRY_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_USER_ID = '44444444-4444-4444-4444-444444444444';
const ADMIN_USER_A = '55555555-5555-5555-5555-555555555555';
const ADMIN_USER_B = '66666666-6666-6666-6666-666666666666';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    membershipRole: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { membership: { user_id: ADMIN_USER_A } },
          { membership: { user_id: ADMIN_USER_B } },
        ]),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    parentInquiry: {
      findFirst: jest.fn().mockResolvedValue({
        id: INQUIRY_ID,
        parent: {
          preferred_contact_channels: ['in_app', 'email'],
          user_id: PARENT_USER_ID,
        },
      }),
    },
    permission: {
      findUnique: jest.fn().mockResolvedValue({ id: 'permission-id' }),
    },
    rolePermission: {
      findMany: jest.fn().mockResolvedValue([{ role_id: 'role-1' }, { role_id: 'role-2' }]),
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
  name: string = INQUIRY_NOTIFICATION_JOB,
  data: Partial<InquiryNotificationPayload> = {},
): Job<InquiryNotificationPayload> {
  return {
    data: {
      inquiry_id: INQUIRY_ID,
      message_id: MESSAGE_ID,
      notify_type: 'admin_notify',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<InquiryNotificationPayload>;
}

describe('InquiryNotificationProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new InquiryNotificationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('communications:other-job'));

    expect(mockTx.parentInquiry.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new InquiryNotificationProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(INQUIRY_NOTIFICATION_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should create admin notifications for users with inquiries.view permission', async () => {
    const mockTx = buildMockTx();
    const processor = new InquiryNotificationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipient_user_id: ADMIN_USER_A,
          source_entity_id: INQUIRY_ID,
          source_entity_type: 'parent_inquiry',
          template_key: 'inquiry.new_message',
          tenant_id: TENANT_ID,
        }),
        expect.objectContaining({
          recipient_user_id: ADMIN_USER_B,
          source_entity_id: INQUIRY_ID,
          source_entity_type: 'parent_inquiry',
          template_key: 'inquiry.new_message',
          tenant_id: TENANT_ID,
        }),
      ],
    });
  });

  it('should create parent notifications for each preferred channel', async () => {
    const mockTx = buildMockTx();
    const processor = new InquiryNotificationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob(INQUIRY_NOTIFICATION_JOB, { notify_type: 'parent_notify' }));

    expect(mockTx.notification.create).toHaveBeenCalledTimes(2);
    expect(mockTx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'in_app',
        delivered_at: expect.any(Date),
        recipient_user_id: PARENT_USER_ID,
        status: 'delivered',
        template_key: 'inquiry.admin_replied',
      }),
    });
    expect(mockTx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: 'email',
        recipient_user_id: PARENT_USER_ID,
        status: 'queued',
        template_key: 'inquiry.admin_replied',
      }),
    });
  });

  it('should skip parent notifications when the parent has no user account', async () => {
    const mockTx = buildMockTx();
    mockTx.parentInquiry.findFirst.mockResolvedValue({
      id: INQUIRY_ID,
      parent: {
        preferred_contact_channels: ['in_app'],
        user_id: null,
      },
    });
    const processor = new InquiryNotificationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob(INQUIRY_NOTIFICATION_JOB, { notify_type: 'parent_notify' }));

    expect(mockTx.notification.create).not.toHaveBeenCalled();
  });
});
