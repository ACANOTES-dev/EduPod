import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../communications/notifications.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const RECORD_ID = 'record-1';
const SESSION_DATE = '2026-03-10';

// ─── Shared mocks ───────────────────────────────────────────────────────────

const enabledSettings = {
  attendance: { notifyParentOnAbsence: true },
  general: { attendanceVisibleToParents: true },
};

const disabledNotifySettings = {
  attendance: { notifyParentOnAbsence: false },
  general: { attendanceVisibleToParents: true },
};

const hiddenFromParentsSettings = {
  attendance: { notifyParentOnAbsence: true },
  general: { attendanceVisibleToParents: false },
};

const studentRecord = { first_name: 'Ahmad', last_name: 'Hassan' };

const parentWithUser = {
  parent: {
    user_id: 'parent-user-1',
    whatsapp_phone: null,
    phone: null,
    preferred_contact_channels: [],
  },
};

const parentWithWhatsApp = {
  parent: {
    user_id: 'parent-user-2',
    whatsapp_phone: '+966501234567',
    phone: null,
    preferred_contact_channels: ['whatsapp'],
  },
};

describe('AttendanceParentNotificationService', () => {
  let service: AttendanceParentNotificationService;
  let mockPrisma: {
    notification: { findFirst: jest.Mock };
    studentParent: { findMany: jest.Mock };
    student: { findFirst: jest.Mock };
  };
  let mockSettings: { getSettings: jest.Mock };
  let mockNotifications: { createBatch: jest.Mock };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      notification: { findFirst: jest.fn().mockResolvedValue(null) },
      studentParent: { findMany: jest.fn() },
      student: { findFirst: jest.fn().mockResolvedValue(studentRecord) },
    };

    mockSettings = { getSettings: jest.fn().mockResolvedValue(enabledSettings) };
    mockNotifications = { createBatch: jest.fn().mockResolvedValue([]) };
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceParentNotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<AttendanceParentNotificationService>(
      AttendanceParentNotificationService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. Settings gate: notifyParentOnAbsence disabled ───────────────────
  it('should return early when notifyParentOnAbsence setting is disabled', async () => {
    mockSettings.getSettings.mockResolvedValue(disabledNotifySettings);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'absent_unexcused',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });

  // ─── 2. Settings gate: attendanceVisibleToParents disabled ──────────────
  it('should return early when attendance is not visible to parents', async () => {
    mockSettings.getSettings.mockResolvedValue(hiddenFromParentsSettings);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'absent_unexcused',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });

  // ─── 3. Skips notification for present status ────────────────────────────
  it('should return early for status "present" without creating any notification', async () => {
    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'present',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });

  // ─── 4. Deduplication: notification already exists ──────────────────────
  it('should skip notification when one already exists for the same record', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'notif-existing' });
    mockPrisma.studentParent.findMany.mockResolvedValue([parentWithUser]);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'absent_unexcused',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });

  // ─── 5. No parent users — skips silently ────────────────────────────────
  it('should skip notification when no parent users are found', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { parent: { user_id: null, whatsapp_phone: null, phone: null, preferred_contact_channels: [] } },
    ]);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'absent_unexcused',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
  });

  // ─── 6. Happy path: in-app notification created ─────────────────────────
  it('should create an in-app notification for each parent user', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([parentWithUser]);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'absent_unexcused',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: 'parent-user-1',
          channel: 'in_app',
          template_key: 'attendance.absent',
          source_entity_type: 'attendance_record',
          source_entity_id: RECORD_ID,
        }),
      ]),
    );
  });

  // ─── 7. External queue job enqueued when parent has WhatsApp ────────────
  it('should enqueue an external notification job when parent has WhatsApp', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([parentWithWhatsApp]);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'late',
      SESSION_DATE,
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      'communications:attendance-parent-notify',
      expect.objectContaining({
        tenant_id: TENANT_ID,
        template_key: 'attendance.late',
        whatsapp_phone: '+966501234567',
      }),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  // ─── 8. left_early maps to attendance.left_early template ───────────────
  it('should use the attendance.left_early template for left_early status', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([parentWithUser]);

    await service.triggerAbsenceNotification(
      TENANT_ID,
      STUDENT_ID,
      RECORD_ID,
      'left_early',
      SESSION_DATE,
    );

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({ template_key: 'attendance.left_early' }),
      ]),
    );
  });
});
