import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAlertsService } from './behaviour-alerts.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const ALERT_ID = 'alert-1';
const RECIPIENT_ID = 'recipient-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  behaviourAlert: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  behaviourAlertRecipient: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('BehaviourAlertsService', () => {
  let service: BehaviourAlertsService;
  let mockPrisma: {
    behaviourAlertRecipient: {
      count: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    behaviourAlert: {
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourAlertRecipient: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      behaviourAlert: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BehaviourAlertsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<BehaviourAlertsService>(BehaviourAlertsService);

    // Reset RLS tx mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getBadgeCount ──────────────────────────────────────────────────────

  describe('getBadgeCount', () => {
    it('should return badge count for unseen and seen alerts', async () => {
      mockPrisma.behaviourAlertRecipient.count.mockResolvedValue(5);

      const result = await service.getBadgeCount(TENANT_ID, USER_ID);

      expect(result).toBe(5);
      expect(mockPrisma.behaviourAlertRecipient.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          recipient_id: USER_ID,
          status: {
            in: ['unseen', 'seen'],
          },
        },
      });
    });
  });

  // ─── acknowledge ────────────────────────────────────────────────────────

  describe('acknowledge', () => {
    it('should acknowledge an alert recipient', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'acknowledged',
      });

      await service.acknowledge(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          alert_id: ALERT_ID,
          recipient_id: USER_ID,
        },
      });
      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          status: 'acknowledged',
        }),
      });
    });

    it('should throw NotFoundException when recipient not found', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue(null);

      await expect(service.acknowledge(TENANT_ID, USER_ID, ALERT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── auto-resolve ───────────────────────────────────────────────────────

  describe('checkAndAutoResolve (via resolve)', () => {
    it('should auto-resolve alert when all recipients are resolved or dismissed', async () => {
      // The recipient lookup succeeds
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'resolved_recipient',
      });
      // No unresolved recipients remain
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlert.update.mockResolvedValue({
        id: ALERT_ID,
        status: 'resolved_alert',
      });

      await service.resolve(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          alert_id: ALERT_ID,
          status: {
            notIn: ['resolved_recipient', 'dismissed'],
          },
        },
      });
      expect(mockRlsTx.behaviourAlert.update).toHaveBeenCalledWith({
        where: { id: ALERT_ID },
        data: expect.objectContaining({
          status: 'resolved_alert',
        }),
      });
    });

    it('should not auto-resolve alert when some recipients are still active', async () => {
      // The recipient lookup succeeds
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({
        id: RECIPIENT_ID,
        status: 'resolved_recipient',
      });
      // 1 unresolved recipient remains
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);

      await service.resolve(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlert.update).not.toHaveBeenCalled();
    });
  });

  // ─── listAlerts — branch coverage ─────────────────────────────────────────

  describe('listAlerts — branch coverage', () => {
    const baseQuery: Parameters<typeof service.listAlerts>[2] = {
      page: 1,
      pageSize: 20,
      status: 'all',
    };

    const makeRecipient = (overrides: Record<string, unknown> = {}) => ({
      alert_id: ALERT_ID,
      status: 'unseen',
      created_at: new Date('2026-03-20'),
      alert: {
        alert_type: 'pattern_detected',
        severity: 'high',
        title: 'Test Alert',
        description: 'A test alert',
        student: { first_name: 'Alice', last_name: 'Smith' },
        subject: { name: 'Maths' },
        staff: null,
        created_at: new Date('2026-03-20'),
        data_snapshot: {},
      },
      ...overrides,
    });

    it('should list alerts with default (all) status', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([makeRecipient()]);

      const result = await service.listAlerts(TENANT_ID, USER_ID, baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student_name).toBe('Alice Smith');
      expect(result.data[0]!.subject_name).toBe('Maths');
      expect(result.meta.total).toBe(1);
    });

    it('should filter unseen status (includes seen)', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, { ...baseQuery, status: 'unseen' });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['unseen', 'seen'] },
          }),
        }),
      );
    });

    it('should filter acknowledged status', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, { ...baseQuery, status: 'acknowledged' });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'acknowledged',
          }),
        }),
      );
    });

    it('should filter snoozed status', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, { ...baseQuery, status: 'snoozed' });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'snoozed',
          }),
        }),
      );
    });

    it('should filter resolved status (includes dismissed)', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, { ...baseQuery, status: 'resolved' });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['resolved_recipient', 'dismissed'] },
          }),
        }),
      );
    });

    it('should filter by alertType', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, {
        ...baseQuery,
        alertType: 'hotspot',
      });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            alert: expect.objectContaining({
              alert_type: 'hotspot',
            }),
          }),
        }),
      );
    });

    it('should filter by severity', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([]);

      await service.listAlerts(TENANT_ID, USER_ID, {
        ...baseQuery,
        severity: 'critical',
      });

      expect(mockRlsTx.behaviourAlertRecipient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            alert: expect.objectContaining({
              severity: 'critical',
            }),
          }),
        }),
      );
    });

    it('should handle alert with null student/subject/staff', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([
        makeRecipient({
          alert: {
            alert_type: 'pattern_detected',
            severity: 'low',
            title: 'No student',
            description: 'Test',
            student: null,
            subject: null,
            staff: null,
            created_at: new Date(),
            data_snapshot: {},
          },
        }),
      ]);

      const result = await service.listAlerts(TENANT_ID, USER_ID, baseQuery);

      expect(result.data[0]!.student_name).toBeNull();
      expect(result.data[0]!.subject_name).toBeNull();
      expect(result.data[0]!.staff_name).toBeNull();
    });

    it('should handle alert with staff user info', async () => {
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);
      mockRlsTx.behaviourAlertRecipient.findMany.mockResolvedValue([
        makeRecipient({
          alert: {
            alert_type: 'pattern_detected',
            severity: 'medium',
            title: 'Staff alert',
            description: 'Test',
            student: null,
            subject: null,
            staff: { user: { first_name: 'Bob', last_name: 'Teacher' } },
            created_at: new Date(),
            data_snapshot: {},
          },
        }),
      ]);

      const result = await service.listAlerts(TENANT_ID, USER_ID, baseQuery);

      expect(result.data[0]!.staff_name).toBe('Bob Teacher');
    });
  });

  // ─── getAlert — branch coverage ───────────────────────────────────────────

  describe('getAlert — branch coverage', () => {
    const makeAlert = (overrides: Record<string, unknown> = {}) => ({
      id: ALERT_ID,
      alert_type: 'pattern_detected',
      severity: 'high',
      title: 'Test Alert',
      description: 'Description',
      student: { first_name: 'Alice', last_name: 'Smith' },
      subject: { name: 'Maths' },
      staff: null,
      created_at: new Date('2026-03-20'),
      data_snapshot: {},
      resolved_at: null,
      recipients: [
        {
          id: RECIPIENT_ID,
          recipient_id: USER_ID,
          recipient_role: 'form_tutor',
          status: 'unseen',
          seen_at: null,
          acknowledged_at: null,
          snoozed_until: null,
          resolved_at: null,
          dismissed_at: null,
          dismissed_reason: null,
          recipient: { first_name: 'User', last_name: 'One' },
        },
      ],
      ...overrides,
    });

    it('should throw NotFoundException when alert does not exist', async () => {
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(null);

      await expect(service.getAlert(TENANT_ID, USER_ID, 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should auto-mark recipient as seen when status is unseen', async () => {
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(makeAlert());
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});

      const result = await service.getAlert(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          status: 'seen',
        }),
      });
      expect(result.my_status).toBe('unseen');
    });

    it('should NOT auto-mark recipient when already seen', async () => {
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(
        makeAlert({
          recipients: [
            {
              id: RECIPIENT_ID,
              recipient_id: USER_ID,
              recipient_role: 'form_tutor',
              status: 'seen',
              seen_at: new Date(),
              acknowledged_at: null,
              snoozed_until: null,
              resolved_at: null,
              dismissed_at: null,
              dismissed_reason: null,
              recipient: { first_name: 'User', last_name: 'One' },
            },
          ],
        }),
      );

      await service.getAlert(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.update).not.toHaveBeenCalled();
    });

    it('should handle alert with no matching recipient (user is not a recipient)', async () => {
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(
        makeAlert({
          recipients: [
            {
              id: RECIPIENT_ID,
              recipient_id: 'other-user',
              recipient_role: 'form_tutor',
              status: 'unseen',
              seen_at: null,
              acknowledged_at: null,
              snoozed_until: null,
              resolved_at: null,
              dismissed_at: null,
              dismissed_reason: null,
              recipient: { first_name: 'Other', last_name: 'User' },
            },
          ],
        }),
      );

      const result = await service.getAlert(TENANT_ID, USER_ID, ALERT_ID);

      expect(result.my_status).toBe('unseen');
      expect(mockRlsTx.behaviourAlertRecipient.update).not.toHaveBeenCalled();
    });

    it('should include resolved_at when alert is resolved', async () => {
      const resolvedDate = new Date('2026-03-25');
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(
        makeAlert({
          resolved_at: resolvedDate,
          recipients: [],
        }),
      );

      const result = await service.getAlert(TENANT_ID, USER_ID, ALERT_ID);

      expect(result.resolved_at).toBe(resolvedDate.toISOString());
    });

    it('should handle recipient with all optional date fields populated', async () => {
      const now = new Date('2026-03-25T12:00:00Z');
      mockRlsTx.behaviourAlert.findFirst.mockResolvedValue(
        makeAlert({
          recipients: [
            {
              id: RECIPIENT_ID,
              recipient_id: 'other-user',
              recipient_role: 'admin',
              status: 'dismissed',
              seen_at: now,
              acknowledged_at: now,
              snoozed_until: now,
              resolved_at: now,
              dismissed_at: now,
              dismissed_reason: 'Not relevant',
              recipient: { first_name: 'Other', last_name: 'Admin' },
            },
          ],
        }),
      );

      const result = await service.getAlert(TENANT_ID, USER_ID, ALERT_ID);

      expect(result.recipients[0]!.dismissed_reason).toBe('Not relevant');
      expect(result.recipients[0]!.snoozed_until).toBe(now.toISOString());
      expect(result.recipients[0]!.seen_at).toBe(now.toISOString());
      expect(result.recipients[0]!.acknowledged_at).toBe(now.toISOString());
    });
  });

  // ─── markSeen ──────────────────────────────────────────────────────────────

  describe('markSeen', () => {
    it('should mark recipient status as seen', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'unseen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});

      await service.markSeen(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({ status: 'seen' }),
      });
    });
  });

  // ─── snooze ──────────────────────────────────────────────────────────────

  describe('snooze', () => {
    it('should snooze an alert until the given date', async () => {
      const until = new Date('2026-04-01');
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});

      await service.snooze(TENANT_ID, USER_ID, ALERT_ID, until);

      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          status: 'snoozed',
          snoozed_until: until,
        }),
      });
    });

    it('should throw NotFoundException when recipient not found', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue(null);

      await expect(service.snooze(TENANT_ID, USER_ID, ALERT_ID, new Date())).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── dismiss ────────────────────────────────────────────────────────────

  describe('dismiss', () => {
    it('should dismiss an alert with a reason', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);

      await service.dismiss(TENANT_ID, USER_ID, ALERT_ID, 'Not relevant');

      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          status: 'dismissed',
          dismissed_reason: 'Not relevant',
        }),
      });
    });

    it('should dismiss without reason', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(1);

      await service.dismiss(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlertRecipient.update).toHaveBeenCalledWith({
        where: { id: RECIPIENT_ID },
        data: expect.objectContaining({
          dismissed_reason: null,
        }),
      });
    });

    it('should auto-resolve alert after dismiss when all recipients resolved', async () => {
      mockRlsTx.behaviourAlertRecipient.findFirst.mockResolvedValue({
        id: RECIPIENT_ID,
        tenant_id: TENANT_ID,
        alert_id: ALERT_ID,
        recipient_id: USER_ID,
        status: 'seen',
      });
      mockRlsTx.behaviourAlertRecipient.update.mockResolvedValue({});
      mockRlsTx.behaviourAlertRecipient.count.mockResolvedValue(0);
      mockRlsTx.behaviourAlert.update.mockResolvedValue({});

      await service.dismiss(TENANT_ID, USER_ID, ALERT_ID);

      expect(mockRlsTx.behaviourAlert.update).toHaveBeenCalledWith({
        where: { id: ALERT_ID },
        data: expect.objectContaining({ status: 'resolved_alert' }),
      });
    });
  });

  // ─── createAlert ──────────────────────────────────────────────────────────

  describe('createAlert', () => {
    it('should create an alert with recipients', async () => {
      mockRlsTx.behaviourAlert.create.mockResolvedValue({ id: 'new-alert' });
      mockRlsTx.behaviourAlertRecipient.createMany.mockResolvedValue({ count: 2 });

      const alertId = await service.createAlert(
        TENANT_ID,
        {
          alert_type: 'pattern_detected' as Parameters<typeof service.createAlert>[1]['alert_type'],
          severity: 'high' as Parameters<typeof service.createAlert>[1]['severity'],
          title: 'Test',
          description: 'Desc',
          data_snapshot: {},
          student_id: 'student-1',
        },
        [{ userId: 'u1', role: 'teacher' }, { userId: 'u2' }],
        mockRlsTx as unknown as PrismaService,
      );

      expect(alertId).toBe('new-alert');
      expect(mockRlsTx.behaviourAlertRecipient.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ recipient_id: 'u1', recipient_role: 'teacher' }),
          expect.objectContaining({ recipient_id: 'u2', recipient_role: null }),
        ],
      });
    });

    it('should create alert without recipients (empty array)', async () => {
      mockRlsTx.behaviourAlert.create.mockResolvedValue({ id: 'new-alert' });

      const alertId = await service.createAlert(
        TENANT_ID,
        {
          alert_type: 'pattern_detected' as Parameters<typeof service.createAlert>[1]['alert_type'],
          severity: 'low' as Parameters<typeof service.createAlert>[1]['severity'],
          title: 'Test',
          description: 'Desc',
          data_snapshot: {},
        },
        [],
        mockRlsTx as unknown as PrismaService,
      );

      expect(alertId).toBe('new-alert');
      expect(mockRlsTx.behaviourAlertRecipient.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── updateAlertSnapshot ──────────────────────────────────────────────────

  describe('updateAlertSnapshot', () => {
    it('should update alert data snapshot', async () => {
      mockRlsTx.behaviourAlert.update.mockResolvedValue({});

      await service.updateAlertSnapshot(
        TENANT_ID,
        ALERT_ID,
        { count: 5 },
        mockRlsTx as unknown as PrismaService,
      );

      expect(mockRlsTx.behaviourAlert.update).toHaveBeenCalledWith({
        where: { id: ALERT_ID },
        data: expect.objectContaining({
          data_snapshot: { count: 5 },
        }),
      });
    });
  });
});
