import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { HealthService, type FullHealthResult } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertDispatchService } from './alert-dispatch.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import { AlertSilenceService } from './alert-silence.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { RedisPubSubService } from './redis-pubsub.service';

const RULE_ID = '11111111-1111-4111-8111-111111111111';
const ALERT_ID = '22222222-2222-4222-8222-222222222222';

const HEALTH_RESULT: FullHealthResult = {
  status: 'healthy',
  timestamp: '2026-05-15T10:00:00.000Z',
  uptime: 120,
  checks: {
    postgresql: { status: 'up', latency_ms: 600 },
    redis: { status: 'up', latency_ms: 2 },
    meilisearch: { status: 'up', latency_ms: 8 },
    bullmq: {
      status: 'up',
      stuck_jobs: 0,
      alerts: [],
      queues: {
        notifications: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        behaviour: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        finance: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        payroll: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
        pastoral: { waiting: 0, active: 0, delayed: 0, failed: 0, stuck_jobs: 0 },
      },
    },
    disk: { status: 'up', free_gb: 25, total_gb: 80 },
    pgbouncer: {
      status: 'not_configured',
      latency_ms: 0,
      active_client_connections: null,
      waiting_client_connections: null,
      max_client_connections: null,
      utilization_percent: null,
      alert: null,
    },
    redis_memory: {
      status: 'up',
      used_memory_bytes: 1024,
      maxmemory_bytes: 2048,
      utilization_percent: 50,
      alert: null,
    },
  },
};

const BASE_RULE = {
  id: RULE_ID,
  name: 'PostgreSQL latency',
  metric: 'component_latency',
  condition_config: { component: 'postgresql', operator: 'gt', threshold: 500 },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  is_security_critical: false,
  notify_emails: ['ops@example.com'],
  created_at: new Date('2026-05-15T09:00:00.000Z'),
  updated_at: new Date('2026-05-15T09:00:00.000Z'),
};

const FIRED_ALERT = {
  id: ALERT_ID,
  rule_id: RULE_ID,
  severity: 'critical',
  message: 'Latency breached',
  metric_value: new Prisma.Decimal(600),
  channels_notified: [],
  status: 'fired',
  fired_at: new Date('2026-05-15T10:00:00.000Z'),
  acknowledged_at: null,
  resolved_at: null,
  acknowledged_by: null,
  suppressed_by_silence_id: null,
  suppressed_by_maintenance_window_id: null,
};

function buildMockPrisma() {
  return {
    platformAlertHistory: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    platformAlertRule: {
      findMany: jest.fn(),
    },
  };
}

describe('AlertEvaluationService', () => {
  let service: AlertEvaluationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockHealthService: { check: jest.Mock<Promise<FullHealthResult>, []> };
  let mockRedisPubSub: { publish: jest.Mock<Promise<void>, [string, Record<string, unknown>]> };
  let mockDispatch: {
    sendEmail: jest.Mock<Promise<string[]>, [typeof BASE_RULE, typeof FIRED_ALERT, number]>;
  };
  let mockAlertSilenceService: { findActiveSilenceForRule: jest.Mock };
  let mockMaintenanceWindowService: { findActiveWindowForRule: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-15T10:00:00.000Z'));

    mockPrisma = buildMockPrisma();
    mockPrisma.platformAlertRule.findMany.mockResolvedValue([BASE_RULE]);
    mockPrisma.platformAlertHistory.findFirst.mockResolvedValue(null);
    mockPrisma.platformAlertHistory.create.mockResolvedValue(FIRED_ALERT);
    mockPrisma.platformAlertHistory.update.mockResolvedValue(FIRED_ALERT);
    mockHealthService = {
      check: jest.fn<Promise<FullHealthResult>, []>().mockResolvedValue(HEALTH_RESULT),
    };
    mockRedisPubSub = {
      publish: jest.fn<Promise<void>, [string, Record<string, unknown>]>().mockResolvedValue(),
    };
    mockDispatch = {
      sendEmail: jest.fn().mockResolvedValue(['email']),
    };
    mockAlertSilenceService = {
      findActiveSilenceForRule: jest.fn().mockResolvedValue(null),
    };
    mockMaintenanceWindowService = {
      findActiveWindowForRule: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertEvaluationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HealthService, useValue: mockHealthService },
        { provide: RedisPubSubService, useValue: mockRedisPubSub },
        { provide: AlertDispatchService, useValue: mockDispatch },
        { provide: AlertSilenceService, useValue: mockAlertSilenceService },
        { provide: MaintenanceWindowService, useValue: mockMaintenanceWindowService },
      ],
    }).compile();

    service = module.get<AlertEvaluationService>(AlertEvaluationService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('evaluates all supported operators', () => {
    expect(service.checkCondition(2, 'gt', 1)).toBe(true);
    expect(service.checkCondition(2, 'lt', 3)).toBe(true);
    expect(service.checkCondition(2, 'eq', 2)).toBe(true);
    expect(service.checkCondition(2, 'gte', 2)).toBe(true);
    expect(service.checkCondition(2, 'lte', 2)).toBe(true);
    expect(service.checkCondition(2, 'neq', 3)).toBe(true);
  });

  it('fires alerts when a rule condition is met', async () => {
    await service.evaluate();

    expect(mockPrisma.platformAlertHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        rule_id: RULE_ID,
        severity: 'critical',
        status: 'fired',
      }),
    });
    expect(mockDispatch.sendEmail).toHaveBeenCalledWith(BASE_RULE, FIRED_ALERT, 600);
    expect(mockPrisma.platformAlertHistory.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: { channels_notified: ['email'] },
    });
    expect(mockRedisPubSub.publish).toHaveBeenCalledWith(
      'platform:alerts',
      expect.objectContaining({ type: 'alert_fired', alert_id: ALERT_ID }),
    );
  });

  it('respects cooldown periods', async () => {
    mockPrisma.platformAlertHistory.findFirst.mockResolvedValueOnce({
      ...FIRED_ALERT,
      fired_at: new Date('2026-05-15T09:55:00.000Z'),
    });

    await service.evaluate();

    expect(mockPrisma.platformAlertHistory.create).not.toHaveBeenCalled();
  });

  it('tracks sustained duration conditions across evaluation cycles', async () => {
    mockPrisma.platformAlertRule.findMany.mockResolvedValue([
      {
        ...BASE_RULE,
        condition_config: {
          component: 'postgresql',
          operator: 'gt',
          threshold: 500,
          duration_minutes: 2,
        },
      },
    ]);

    await service.evaluate();
    jest.setSystemTime(new Date('2026-05-15T10:01:00.000Z'));
    await service.evaluate();
    jest.setSystemTime(new Date('2026-05-15T10:02:00.000Z'));
    await service.evaluate();

    expect(mockPrisma.platformAlertHistory.create).toHaveBeenCalledTimes(1);
  });

  it('auto-resolves open alerts when the condition clears', async () => {
    mockHealthService.check.mockResolvedValueOnce({
      ...HEALTH_RESULT,
      checks: {
        ...HEALTH_RESULT.checks,
        postgresql: { status: 'up', latency_ms: 100 },
      },
    });
    mockPrisma.platformAlertHistory.findFirst.mockResolvedValueOnce(FIRED_ALERT);

    await service.evaluate();

    expect(mockPrisma.platformAlertHistory.update).toHaveBeenCalledWith({
      where: { id: ALERT_ID },
      data: { status: 'resolved', resolved_at: new Date('2026-05-15T10:00:00.000Z') },
    });
    expect(mockRedisPubSub.publish).toHaveBeenCalledWith(
      'platform:alerts',
      expect.objectContaining({ type: 'alert_resolved', alert_id: ALERT_ID }),
    );
  });

  it('extracts Layer 1 health metrics', () => {
    const metrics = service.extractMetrics(HEALTH_RESULT);

    expect(metrics.get('health_status')).toBe(0);
    expect(metrics.get('component_latency:postgresql')).toBe(600);
    expect(metrics.get('component_status:postgresql')).toBe(0);
    expect(metrics.get('bullmq_stuck_jobs')).toBe(0);
    expect(metrics.get('disk_free_gb')).toBe(25);
  });
});
