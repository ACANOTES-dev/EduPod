import { Test, type TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

import { WorkerHealthController } from './worker-health.controller';
import { WorkerHealthService, type WorkerHealthResult } from './worker-health.service';

describe('WorkerHealthController', () => {
  let controller: WorkerHealthController;
  let mockHealthService: jest.Mocked<WorkerHealthService>;

  const mockResponse = (): Partial<Response> => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  beforeEach(async () => {
    mockHealthService = {
      check: jest.fn(),
      getLiveness: jest.fn(),
    } as unknown as jest.Mocked<WorkerHealthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkerHealthController],
      providers: [{ provide: WorkerHealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<WorkerHealthController>(WorkerHealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── GET /health ───────────────────────────────────────────────────────────────

  describe('check', () => {
    it('should return 200 OK when service is healthy', async () => {
      const res = mockResponse() as Response;
      const healthResult: WorkerHealthResult = {
        status: 'healthy',
        service: 'worker',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        checks: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
          bullmq: { status: 'up', stuck_jobs: 0 },
        },
      };

      mockHealthService.check.mockResolvedValue(healthResult);

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 200 OK when service is degraded', async () => {
      const res = mockResponse() as Response;
      const healthResult: WorkerHealthResult = {
        status: 'degraded',
        service: 'worker',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        checks: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
          bullmq: { status: 'down', stuck_jobs: 0 },
        },
      };

      mockHealthService.check.mockResolvedValue(healthResult);

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 503 Service Unavailable when service is unhealthy', async () => {
      const res = mockResponse() as Response;
      const healthResult: WorkerHealthResult = {
        status: 'unhealthy',
        service: 'worker',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        checks: {
          postgresql: { status: 'down', latency_ms: 5000 },
          redis: { status: 'up', latency_ms: 2 },
          bullmq: { status: 'up', stuck_jobs: 0 },
        },
      };

      mockHealthService.check.mockResolvedValue(healthResult);

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should call health service check method', async () => {
      const res = mockResponse() as Response;
      const healthResult: WorkerHealthResult = {
        status: 'healthy',
        service: 'worker',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        checks: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
          bullmq: { status: 'up', stuck_jobs: 0 },
        },
      };

      mockHealthService.check.mockResolvedValue(healthResult);

      await controller.check(res);

      expect(mockHealthService.check).toHaveBeenCalledTimes(1);
    });

    it('should handle errors thrown by health service', async () => {
      const res = mockResponse() as Response;
      mockHealthService.check.mockRejectedValue(new Error('Health check failed'));

      await expect(controller.check(res)).rejects.toThrow('Health check failed');
    });
  });

  // ─── GET /health/live ─────────────────────────────────────────────────────────

  describe('live', () => {
    it('should return 200 OK with liveness status', () => {
      const res = mockResponse() as Response;
      const livenessResult = {
        status: 'alive' as const,
        service: 'worker' as const,
        timestamp: new Date().toISOString(),
      };

      mockHealthService.getLiveness.mockReturnValue(livenessResult);

      controller.live(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(livenessResult);
    });

    it('should call health service getLiveness method', () => {
      const res = mockResponse() as Response;
      const livenessResult = {
        status: 'alive' as const,
        service: 'worker' as const,
        timestamp: new Date().toISOString(),
      };

      mockHealthService.getLiveness.mockReturnValue(livenessResult);

      controller.live(res);

      expect(mockHealthService.getLiveness).toHaveBeenCalledTimes(1);
    });
  });
});
