/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { AttendancePatternService } from '../../../modules/attendance/attendance-pattern.service';
import { AttendanceParentNotificationService } from '../../../modules/attendance/attendance-parent-notification.service';
import { NotificationsService } from '../../../modules/communications/notifications.service';
import { SettingsService } from '../../../modules/configuration/settings.service';
import { EarlyWarningTriggerService } from '../../../modules/early-warning/early-warning-trigger.service';
import { PrismaService } from '../../../modules/prisma/prisma.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-4000-a000-000000000003';
const STUDENT_ID = '00000000-0000-4000-a000-000000000103';
const ALERT_ID = '00000000-0000-4000-a000-000000000203';

// ─── Mock factories ──────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  attendancePatternAlert: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  earlyWarningConfig: {
    findFirst: jest.fn(),
  },
  notification: {
    create: jest.fn(),
    createMany: jest.fn(),
  },
});

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Attendance -> Pattern Detection -> Early Warning flow', () => {
  let patternService: AttendancePatternService;
  let earlyWarningTriggerService: EarlyWarningTriggerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  const mockNotificationsService = {
    createBatch: jest.fn(),
  };

  const mockParentNotificationService = {
    notifyAbsence: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        AttendancePatternService,
        EarlyWarningTriggerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AttendanceParentNotificationService, useValue: mockParentNotificationService },
        { provide: getQueueToken('early-warning'), useValue: mockQueue },
      ],
    }).compile();

    patternService = module.get(AttendancePatternService);
    earlyWarningTriggerService = module.get(EarlyWarningTriggerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should list pattern alerts with pagination', async () => {
    const alerts = [
      {
        id: ALERT_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        alert_type: 'excessive_absences',
        status: 'new',
        details_json: { count: 5, window_days: 20 },
        parent_notified: false,
        student: {
          id: STUDENT_ID,
          first_name: 'Test',
          last_name: 'Student',
          student_number: 'STU-001',
          class_homeroom_id: null,
        },
        created_at: new Date(),
      },
    ];

    mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);
    mockPrisma.attendancePatternAlert.count.mockResolvedValue(1);

    const result = await patternService.listAlerts(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(result.data[0]!.alert_type).toBe('excessive_absences');
  });

  it('should manually notify parents about a pattern alert and mark it as notified', async () => {
    const alert = {
      id: ALERT_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      alert_type: 'excessive_absences' as const,
      status: 'new',
      details_json: { count: 5, window_days: 20 },
      parent_notified: false,
      parent_notified_at: null,
      student: {
        id: STUDENT_ID,
        first_name: 'Jane',
        last_name: 'Doe',
        student_parents: [{ parent: { user_id: 'parent-user-1' } }],
      },
    };

    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue(alert);
    mockPrisma.attendancePatternAlert.update.mockResolvedValue({
      ...alert,
      parent_notified: true,
      parent_notified_at: new Date(),
    });

    const result = await patternService.notifyParentManual(TENANT_ID, ALERT_ID);

    // Parent notification batch was created
    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: 'parent-user-1',
          template_key: 'attendance.pattern.excessive_absences',
          payload_json: expect.objectContaining({
            student_name: 'Jane Doe',
            student_id: STUDENT_ID,
            alert_type: 'excessive_absences',
          }),
        }),
      ]),
    );

    // Alert marked as notified
    expect(mockPrisma.attendancePatternAlert.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: expect.objectContaining({
        parent_notified: true,
      }),
    });

    expect(result.notified).toBe(1);
  });

  it('should enqueue early warning recompute when trigger event matches config', async () => {
    mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
      is_enabled: true,
      high_severity_events_json: ['attendance:absence_threshold'],
    });

    await earlyWarningTriggerService.triggerStudentRecompute(
      TENANT_ID,
      STUDENT_ID,
      'attendance:absence_threshold',
    );

    expect(mockQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        trigger_event: 'attendance:absence_threshold',
      }),
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('should not enqueue early warning when module is disabled', async () => {
    mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
      is_enabled: false,
      high_severity_events_json: ['attendance:absence_threshold'],
    });

    await earlyWarningTriggerService.triggerStudentRecompute(
      TENANT_ID,
      STUDENT_ID,
      'attendance:absence_threshold',
    );

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should reject duplicate parent notification on already-notified alert', async () => {
    mockPrisma.attendancePatternAlert.findFirst.mockResolvedValue({
      id: ALERT_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      alert_type: 'excessive_absences',
      parent_notified: true,
      parent_notified_at: new Date(),
      student: {
        id: STUDENT_ID,
        first_name: 'Jane',
        last_name: 'Doe',
        student_parents: [],
      },
    });

    await expect(patternService.notifyParentManual(TENANT_ID, ALERT_ID)).rejects.toThrow(
      ConflictException,
    );
  });
});
