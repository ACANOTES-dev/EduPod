import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../communications/notifications.service';
import { AudienceResolutionService } from '../inbox/audience/audience-resolution.service';
import { PrismaService } from '../prisma/prisma.service';

import { HomeworkNotificationService } from './homework-notification.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEWORK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_USER_A = 'eeeeeeee-eeee-eeee-eeee-aaaaaaaaaaaa';
const PARENT_USER_B = 'eeeeeeee-eeee-eeee-eeee-bbbbbbbbbbbb';

// ─── Mock builders ───────────────────────────────────────────────────────────

interface PrismaMock {
  homeworkAssignment: { findFirst: jest.Mock };
}

interface AudienceMock {
  resolve: jest.Mock;
  previewCount: jest.Mock;
}

interface NotificationsMock {
  createBatch: jest.Mock;
}

function buildMockPrisma(): PrismaMock {
  return {
    homeworkAssignment: { findFirst: jest.fn() },
  };
}

function buildMockAudience(): AudienceMock {
  return {
    resolve: jest.fn(),
    previewCount: jest.fn(),
  };
}

function buildMockNotifications(): NotificationsMock {
  return {
    createBatch: jest.fn().mockResolvedValue(undefined),
  };
}

function buildAssignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: HOMEWORK_ID,
    class_id: CLASS_ID,
    subject_id: SUBJECT_ID,
    title: 'Algebra chapter 3',
    due_date: new Date('2026-04-22'),
    due_time: null,
    homework_type: 'written',
    class_entity: { id: CLASS_ID, name: 'Year 5A' },
    subject: { id: SUBJECT_ID, name: 'Maths' },
    assigned_by: {
      id: 'teacher-id',
      first_name: 'Sarah',
      last_name: 'Ahmad',
    },
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('HomeworkNotificationService — notifyOnPublish', () => {
  let module: TestingModule;
  let service: HomeworkNotificationService;
  let prisma: PrismaMock;
  let audience: AudienceMock;
  let notifications: NotificationsMock;

  beforeEach(async () => {
    prisma = buildMockPrisma();
    audience = buildMockAudience();
    notifications = buildMockNotifications();

    module = await Test.createTestingModule({
      providers: [
        HomeworkNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceResolutionService, useValue: audience },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(HomeworkNotificationService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('throws HOMEWORK_NOT_FOUND if the assignment does not exist', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(service.notifyOnPublish(TENANT_ID, HOMEWORK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolves class_parents audience and fans out in-app rows', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(buildAssignmentRow());
    audience.resolve.mockResolvedValue({
      user_ids: [PARENT_USER_A, PARENT_USER_B],
      resolved_at: new Date(),
      definition: {
        provider: 'class_parents',
        params: { class_ids: [CLASS_ID] },
      },
    });

    const result = await service.notifyOnPublish(TENANT_ID, HOMEWORK_ID);

    expect(audience.resolve).toHaveBeenCalledWith(TENANT_ID, {
      provider: 'class_parents',
      params: { class_ids: [CLASS_ID] },
    });

    expect(notifications.createBatch).toHaveBeenCalledTimes(1);
    const [tenantIdArg, batchArg] = notifications.createBatch.mock.calls[0] as [
      string,
      Array<Record<string, unknown>>,
    ];
    expect(tenantIdArg).toBe(TENANT_ID);
    expect(batchArg).toHaveLength(2);
    expect(batchArg[0]).toMatchObject({
      tenant_id: TENANT_ID,
      recipient_user_id: PARENT_USER_A,
      channel: 'in_app',
      template_key: 'homework_assigned',
      source_entity_type: 'homework_assignment',
      source_entity_id: HOMEWORK_ID,
    });

    expect(result).toEqual({
      homework_id: HOMEWORK_ID,
      recipients_count: 2,
      parents_count: 2,
      students_count: 0,
      already_notified: false,
    });
  });

  it('short-circuits when the class has no linked parents', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(buildAssignmentRow());
    audience.resolve.mockResolvedValue({
      user_ids: [],
      resolved_at: new Date(),
      definition: {
        provider: 'class_parents',
        params: { class_ids: [CLASS_ID] },
      },
    });

    const result = await service.notifyOnPublish(TENANT_ID, HOMEWORK_ID);

    expect(notifications.createBatch).not.toHaveBeenCalled();
    expect(result.recipients_count).toBe(0);
    expect(result.parents_count).toBe(0);
  });

  it('builds payload with subject, class, due_date, teacher_name', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(buildAssignmentRow());
    audience.resolve.mockResolvedValue({
      user_ids: [PARENT_USER_A],
      resolved_at: new Date(),
      definition: {
        provider: 'class_parents',
        params: { class_ids: [CLASS_ID] },
      },
    });

    await service.notifyOnPublish(TENANT_ID, HOMEWORK_ID);

    const [, batchArg] = notifications.createBatch.mock.calls[0] as [
      string,
      Array<{ payload_json: Record<string, unknown> }>,
    ];
    const payload = batchArg[0]?.payload_json;
    expect(payload).toMatchObject({
      homework_id: HOMEWORK_ID,
      title: 'Algebra chapter 3',
      class_name: 'Year 5A',
      subject_name: 'Maths',
      due_date: '2026-04-22',
      teacher_name: 'Sarah Ahmad',
    });
  });

  it('still returns students_count: 0 (students not yet wired)', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(buildAssignmentRow());
    audience.resolve.mockResolvedValue({
      user_ids: [PARENT_USER_A],
      resolved_at: new Date(),
      definition: {
        provider: 'class_parents',
        params: { class_ids: [CLASS_ID] },
      },
    });

    const result = await service.notifyOnPublish(TENANT_ID, HOMEWORK_ID);

    expect(result.students_count).toBe(0);
  });
});

describe('HomeworkNotificationService — previewRecipientCount', () => {
  let module: TestingModule;
  let service: HomeworkNotificationService;
  let prisma: PrismaMock;
  let audience: AudienceMock;
  let notifications: NotificationsMock;

  beforeEach(async () => {
    prisma = buildMockPrisma();
    audience = buildMockAudience();
    notifications = buildMockNotifications();

    module = await Test.createTestingModule({
      providers: [
        HomeworkNotificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceResolutionService, useValue: audience },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(HomeworkNotificationService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('returns the resolved parent count without sending', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
    audience.previewCount.mockResolvedValue({ count: 42, sample: [] });

    const result = await service.previewRecipientCount(TENANT_ID, HOMEWORK_ID);

    expect(result).toEqual({
      parents_count: 42,
      students_count: 0,
      recipients_count: 42,
    });
    expect(notifications.createBatch).not.toHaveBeenCalled();
  });

  it('throws HOMEWORK_NOT_FOUND for missing assignment', async () => {
    prisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(service.previewRecipientCount(TENANT_ID, HOMEWORK_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
