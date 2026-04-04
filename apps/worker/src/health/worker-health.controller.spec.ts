import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { WorkerHealthController } from './worker-health.controller';
import { WorkerHealthResult, WorkerHealthService } from './worker-health.service';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function buildMockResponse(): {
  status: jest.Mock;
  json: jest.Mock;
} {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function buildHealthResult(status: 'healthy' | 'degraded' | 'unhealthy'): WorkerHealthResult {
  return {
    status,
    service: 'worker',
    timestamp: new Date().toISOString(),
    uptime: 123,
    checks: {
      postgresql: { status: 'up', latency_ms: 1 },
      redis: {
        status: status === 'unhealthy' ? 'down' : 'up',
        latency_ms: 1,
      },
      bullmq: {
        status: status === 'degraded' ? 'down' : 'up',
        stuck_jobs: 0,
        queues: {},
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WorkerHealthController', () => {
  let controller: WorkerHealthController;
  let mockHealthService: {
    check: jest.Mock;
    getLiveness: jest.Mock;
  };

  beforeEach(async () => {
    mockHealthService = {
      check: jest.fn(),
      getLiveness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerHealthController],
      providers: [{ provide: WorkerHealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<WorkerHealthController>(WorkerHealthController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── GET /health ──────────────────────────────────────────────────────────

  describe('check', () => {
    it('should return 200 when service reports healthy', async () => {
      const healthResult = buildHealthResult('healthy');
      mockHealthService.check.mockResolvedValue(healthResult);
      const res = buildMockResponse();

      await controller.check(res as never);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 200 when service reports degraded', async () => {
      const healthResult = buildHealthResult('degraded');
      mockHealthService.check.mockResolvedValue(healthResult);
      const res = buildMockResponse();

      await controller.check(res as never);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 503 when service reports unhealthy', async () => {
      const healthResult = buildHealthResult('unhealthy');
      mockHealthService.check.mockResolvedValue(healthResult);
      const res = buildMockResponse();

      await controller.check(res as never);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should pass through the full health result body', async () => {
      const healthResult = buildHealthResult('healthy');
      mockHealthService.check.mockResolvedValue(healthResult);
      const res = buildMockResponse();

      await controller.check(res as never);

      const body = res.json.mock.calls[0][0] as WorkerHealthResult;
      expect(body.service).toBe('worker');
      expect(body.timestamp).toBeDefined();
      expect(body.uptime).toBe(123);
      expect(body.checks.postgresql.status).toBe('up');
      expect(body.checks.redis.status).toBe('up');
      expect(body.checks.bullmq.status).toBe('up');
    });
  });

  // ─── GET /health/live ─────────────────────────────────────────────────────

  describe('live', () => {
    it('should return 200 with alive status', () => {
      const livenessResult = {
        status: 'alive' as const,
        service: 'worker' as const,
        timestamp: new Date().toISOString(),
      };
      mockHealthService.getLiveness.mockReturnValue(livenessResult);
      const res = buildMockResponse();

      controller.live(res as never);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(livenessResult);
    });

    it('should always return 200 regardless of health state', () => {
      const livenessResult = {
        status: 'alive' as const,
        service: 'worker' as const,
        timestamp: new Date().toISOString(),
      };
      mockHealthService.getLiveness.mockReturnValue(livenessResult);
      const res = buildMockResponse();

      controller.live(res as never);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'alive', service: 'worker' }),
      );
    });
  });
});
