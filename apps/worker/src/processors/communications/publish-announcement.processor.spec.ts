import { Job } from 'bullmq';

import {
  PUBLISH_ANNOUNCEMENT_JOB,
  type PublishAnnouncementPayload,
  PublishAnnouncementProcessor,
} from './publish-announcement.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ANNOUNCEMENT_ID = '22222222-2222-2222-2222-222222222222';
const USER_A = '33333333-3333-3333-3333-333333333333';
const USER_B = '44444444-4444-4444-4444-444444444444';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    announcement: {
      findFirst: jest.fn().mockResolvedValue({
        id: ANNOUNCEMENT_ID,
        scope: 'school',
        status: 'scheduled',
        target_payload: {},
        title: 'Sports Day',
      }),
      update: jest.fn().mockResolvedValue({ id: ANNOUNCEMENT_ID }),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    householdParent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    parent: {
      findMany: jest.fn().mockResolvedValue([{ user_id: USER_A }, { user_id: USER_B }]),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue([]),
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
  name: string = PUBLISH_ANNOUNCEMENT_JOB,
  data: Partial<PublishAnnouncementPayload> = {},
): Job<PublishAnnouncementPayload> {
  return {
    data: {
      announcement_id: ANNOUNCEMENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<PublishAnnouncementPayload>;
}

describe('PublishAnnouncementProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new PublishAnnouncementProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('communications:other-job'));

    expect(mockTx.announcement.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new PublishAnnouncementProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(PUBLISH_ANNOUNCEMENT_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should publish school-wide announcements and create notifications for the resolved audience', async () => {
    const mockTx = buildMockTx();
    const processor = new PublishAnnouncementProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.announcement.update).toHaveBeenCalledWith({
      where: { id: ANNOUNCEMENT_ID },
      data: { status: 'published', published_at: expect.any(Date) },
    });
    expect(mockTx.parent.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        user_id: { not: null },
        status: 'active',
      },
      select: { user_id: true },
    });
    expect(mockTx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipient_user_id: USER_A,
          source_entity_id: ANNOUNCEMENT_ID,
          source_entity_type: 'announcement',
          template_key: 'announcement.published',
          tenant_id: TENANT_ID,
        }),
        expect.objectContaining({
          recipient_user_id: USER_B,
          source_entity_id: ANNOUNCEMENT_ID,
          source_entity_type: 'announcement',
          template_key: 'announcement.published',
          tenant_id: TENANT_ID,
        }),
      ],
    });
  });

  it('should be idempotent when the announcement is already published', async () => {
    const mockTx = buildMockTx();
    mockTx.announcement.findFirst.mockResolvedValue({
      id: ANNOUNCEMENT_ID,
      scope: 'school',
      status: 'published',
      target_payload: {},
      title: 'Sports Day',
    });
    const processor = new PublishAnnouncementProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.announcement.update).not.toHaveBeenCalled();
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });

  it('should not re-publish or duplicate notifications when the same job payload is run twice', async () => {
    const mockTx = buildMockTx();
    let announcementStatus: 'published' | 'scheduled' = 'scheduled';
    mockTx.announcement.findFirst.mockImplementation(async () => ({
      id: ANNOUNCEMENT_ID,
      scope: 'school',
      status: announcementStatus,
      target_payload: {},
      title: 'Sports Day',
    }));
    mockTx.announcement.update.mockImplementation(async () => {
      announcementStatus = 'published';
      return { id: ANNOUNCEMENT_ID };
    });
    const processor = new PublishAnnouncementProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());
    await processor.process(buildJob());

    expect(mockTx.announcement.update).toHaveBeenCalledTimes(1);
    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1);
  });
});
