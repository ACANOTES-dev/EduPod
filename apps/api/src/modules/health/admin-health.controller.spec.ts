import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { AdminHealthController } from './admin-health.controller';
import { HealthService } from './health.service';
import type { AdminHealthResult } from './health.service';

function buildAdminHealthResult(status: AdminHealthResult['status']): AdminHealthResult {
  return {
    status,
    timestamp: new Date().toISOString(),
    alerts: [],
    api: {
      status,
      timestamp: new Date().toISOString(),
      uptime: 120,
      checks: {
        postgresql: { status: 'up', latency_ms: 2 },
        redis: { status: 'up', latency_ms: 2 },
        meilisearch: { status: 'up', latency_ms: 5 },
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
        disk: { status: 'up', free_gb: 12, total_gb: 64 },
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
          used_memory_bytes: 1_048_576,
          maxmemory_bytes: 2_097_152,
          utilization_percent: 50,
          alert: null,
        },
      },
    },
    worker: {
      status: 'up',
      latency_ms: 5,
      url: 'http://127.0.0.1:5556/health',
    },
    delivery_providers: {
      resend_email: {
        status: 'configured',
        details: 'Resend email delivery is configured.',
      },
      twilio_sms: {
        status: 'configured',
        details: 'Twilio SMS delivery is configured.',
      },
      twilio_whatsapp: {
        status: 'configured',
        details: 'Twilio WhatsApp delivery is configured.',
      },
    },
  };
}

describe('AdminHealthController', () => {
  let controller: AdminHealthController;
  let mockService: { getAdminDashboard: jest.Mock };

  beforeEach(async () => {
    mockService = {
      getAdminDashboard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminHealthController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: HealthService, useValue: mockService },
        { provide: RedisService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminHealthController>(AdminHealthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the admin health dashboard payload', async () => {
    const result = buildAdminHealthResult('healthy');
    mockService.getAdminDashboard.mockResolvedValue(result);

    await expect(controller.getDashboard()).resolves.toEqual(result);
  });

  it('should call healthService.getAdminDashboard exactly once', async () => {
    mockService.getAdminDashboard.mockResolvedValue(buildAdminHealthResult('degraded'));

    await controller.getDashboard();

    expect(mockService.getAdminDashboard).toHaveBeenCalledTimes(1);
  });
});
