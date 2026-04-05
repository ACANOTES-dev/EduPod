import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../communications/notifications.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendancePatternService } from './attendance-pattern.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ALERT_ID = 'alert-1';
const USER_ID = 'user-1';

// ─── Shared mock alert shapes ────────────────────────────────────────────────

const baseAlertOpen = {
  id: ALERT_ID,
  tenant_id: TENANT_ID,
  student_id: 'stu-1',
  alert_type: 'excessive_absences' as const,
  status: 'active',
  parent_notified: false,
  details_json: { count: 8, window_days: 30 },
  student: {
    id: 'stu-1',
    first_name: 'Ahmad',
    last_name: 'Hassan',
    student_number: 'STU001',
    class_homeroom_id: 'cls-1',
    student_parents: [{ parent: { user_id: 'parent-user-1' } }],
  },
};

describe('AttendancePatternService', () => {
  let service: AttendancePatternService;
  let mockPrisma: {
    attendancePatternAlert: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockNotifications: { createBatch: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendancePatternAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...baseAlertOpen }),
      },
    };

    mockNotifications = { createBatch: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendancePatternService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: { getSettings: jest.fn() } },
        { provide: NotificationsService, useValue: mockNotifications },
        {
          provide: AttendanceParentNotificationService,
          useValue: { triggerAbsenceNotification: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AttendancePatternService>(AttendancePatternService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAlerts ─────────────────────────────────────────────────────────

  it('should return paginated alerts with default page/pageSize', async () => {
    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([baseAlertOpen]);
    mockPrisma.attendancePatternAlert.count.mockResolvedValue(1);

    const result = await service.listAlerts(TENANT_ID, {});

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by status when provided', async () => {
    await service.listAlerts(TENANT_ID, { status: 'active' });

    expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should filter by alert_type when provided', async () => {
    await service.listAlerts(TENANT_ID, { alert_type: 'chronic_tardiness' });

    expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ alert_type: 'chronic_tardiness' }),
      }),
    );
  });

  // ─── acknowledgeAlert ───────────────────────────────────────────────────

  it('should throw NotFoundException when alert is not found', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(null);

    await expect(service.acknowledgeAlert(TENANT_ID, ALERT_ID, USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should set status to acknowledged with user and timestamp', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(baseAlertOpen);

    await service.acknowledgeAlert(TENANT_ID, ALERT_ID, USER_ID);

    expect(mockPrisma.attendancePatternAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALERT_ID },
        data: expect.objectContaining({
          status: 'acknowledged',
          acknowledged_by: USER_ID,
          acknowledged_at: expect.any(Date),
        }),
      }),
    );
  });

  // ─── resolveAlert ───────────────────────────────────────────────────────

  it('should throw NotFoundException when resolving a non-existent alert', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(null);

    await expect(service.resolveAlert(TENANT_ID, ALERT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should set status to resolved', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(baseAlertOpen);

    await service.resolveAlert(TENANT_ID, ALERT_ID);

    expect(mockPrisma.attendancePatternAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALERT_ID },
        data: { status: 'resolved' },
      }),
    );
  });

  // ─── notifyParentManual ─────────────────────────────────────────────────

  it('should throw NotFoundException when manually notifying for non-existent alert', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(null);

    await expect(service.notifyParentManual(TENANT_ID, ALERT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when parent was already notified', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue({
      ...baseAlertOpen,
      parent_notified: true,
    });

    await expect(service.notifyParentManual(TENANT_ID, ALERT_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should create in-app notifications for each parent user and mark alert as notified', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(baseAlertOpen);

    const result = await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: 'parent-user-1',
          template_key: `attendance.pattern.excessive_absences`,
          source_entity_type: 'attendance_pattern_alert',
          source_entity_id: ALERT_ID,
        }),
      ]),
    );

    expect(mockPrisma.attendancePatternAlert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ALERT_ID },
        data: expect.objectContaining({
          parent_notified: true,
          parent_notified_at: expect.any(Date),
        }),
      }),
    );

    expect(result).toEqual({ notified: 1 });
  });

  it('should return notified: 0 when no parent users have linked accounts', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue({
      ...baseAlertOpen,
      student: {
        ...baseAlertOpen.student,
        student_parents: [{ parent: { user_id: null } }],
      },
    });

    const result = await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).not.toHaveBeenCalled();
    expect(result).toEqual({ notified: 0 });
  });

  it('edge: should include count and window_days in the notification payload', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(baseAlertOpen);

    await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          payload_json: expect.objectContaining({
            count: 8,
            window_days: 30,
          }),
        }),
      ]),
    );
  });

  // ─── buildParentMessage — recurring_day ────────────────────────────────

  it('should build correct message for recurring_day alert type', async () => {
    const recurringAlert = {
      ...baseAlertOpen,
      alert_type: 'recurring_day' as const,
      details_json: { count: 5, window_days: 30, day_name: 'Monday' },
    };
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(recurringAlert);

    await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          payload_json: expect.objectContaining({
            message: expect.stringContaining('Mondays'),
          }),
        }),
      ]),
    );
  });

  it('edge: should handle recurring_day with missing day_name (fallback to "unknown")', async () => {
    const recurringAlertNoDayName = {
      ...baseAlertOpen,
      alert_type: 'recurring_day' as const,
      details_json: { count: 3, window_days: 14 },
    };
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(recurringAlertNoDayName);

    await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          payload_json: expect.objectContaining({
            message: expect.stringContaining('unknowns'),
          }),
        }),
      ]),
    );
  });

  // ─── buildParentMessage — chronic_tardiness ────────────────────────────

  it('should build correct message for chronic_tardiness alert type', async () => {
    const tardinessAlert = {
      ...baseAlertOpen,
      alert_type: 'chronic_tardiness' as const,
      details_json: { count: 10, window_days: 30 },
    };
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(tardinessAlert);

    await service.notifyParentManual(TENANT_ID, ALERT_ID);

    expect(mockNotifications.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          payload_json: expect.objectContaining({
            message: expect.stringContaining('late 10 times'),
          }),
        }),
      ]),
    );
  });

  // ─── listAlerts — pagination ───────────────────────────────────────────

  it('should respect custom page and pageSize', async () => {
    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([]);
    mockPrisma.attendancePatternAlert.count.mockResolvedValue(0);

    await service.listAlerts(TENANT_ID, { page: 3, pageSize: 5 });

    expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
      }),
    );
  });

  it('should filter by both status and alert_type when provided', async () => {
    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue([]);
    mockPrisma.attendancePatternAlert.count.mockResolvedValue(0);

    await service.listAlerts(TENANT_ID, {
      status: 'acknowledged',
      alert_type: 'excessive_absences',
    });

    expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'acknowledged',
          alert_type: 'excessive_absences',
        }),
      }),
    );
  });
});
