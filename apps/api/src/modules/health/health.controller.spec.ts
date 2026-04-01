import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import type { FullHealthResult } from './health.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHealthResult(status: FullHealthResult['status']): FullHealthResult {
  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: 120,
    checks: {
      postgresql: { status: 'up', latency_ms: 2 },
      redis: { status: 'up', latency_ms: 1 },
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
      disk: { status: 'up', free_gb: 45.2, total_gb: 100 },
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
  };
}

function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response;
}

// ─── Describe ─────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  let controller: HealthController;
  let mockService: {
    check: jest.Mock;
    getReadiness: jest.Mock;
    getLiveness: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      check: jest.fn(),
      getReadiness: jest.fn(),
      getLiveness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── check() ────────────────────────────────────────────────────────────

  describe('check()', () => {
    it('should return 200 when status is healthy', async () => {
      const result = buildHealthResult('healthy');
      mockService.check.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return 200 when status is degraded', async () => {
      const result = buildHealthResult('degraded');
      mockService.check.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should return 503 when status is unhealthy', async () => {
      const result = buildHealthResult('unhealthy');
      mockService.check.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should call healthService.check exactly once', async () => {
      mockService.check.mockResolvedValue(buildHealthResult('healthy'));
      const res = createMockResponse();

      await controller.check(res);

      expect(mockService.check).toHaveBeenCalledTimes(1);
    });
  });

  // ─── ready() ────────────────────────────────────────────────────────────

  describe('ready()', () => {
    it('should return 200 when readiness is healthy', async () => {
      const result = buildHealthResult('healthy');
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return 200 when readiness is degraded', async () => {
      const result = buildHealthResult('degraded');
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('should return 503 when readiness is unhealthy', async () => {
      const result = buildHealthResult('unhealthy');
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });

  // ─── live() ─────────────────────────────────────────────────────────────

  describe('live()', () => {
    it('should always return 200 with alive status', () => {
      const livenessResult = { status: 'alive' as const, timestamp: new Date().toISOString() };
      mockService.getLiveness.mockReturnValue(livenessResult);
      const res = createMockResponse();

      controller.live(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(livenessResult);
    });

    it('should call getLiveness exactly once', () => {
      mockService.getLiveness.mockReturnValue({
        status: 'alive',
        timestamp: new Date().toISOString(),
      });
      const res = createMockResponse();

      controller.live(res);

      expect(mockService.getLiveness).toHaveBeenCalledTimes(1);
    });
  });
});
