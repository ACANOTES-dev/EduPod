import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockService: {
    check: jest.Mock;
    getReadiness: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      check: jest.fn(),
      getReadiness: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  afterEach(() => jest.clearAllMocks());

  function createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    return res as unknown as import('express').Response;
  }

  describe('check()', () => {
    it('should return 200 when all services are ok', async () => {
      const result = { status: 'ok', checks: { postgres: 'up', redis: 'up' } };
      mockService.check.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return 503 when status is degraded', async () => {
      const result = { status: 'degraded', checks: { postgres: 'down', redis: 'up' } };
      mockService.check.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.check(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should call healthService.check exactly once', async () => {
      mockService.check.mockResolvedValue({ status: 'ok', checks: { postgres: 'up', redis: 'up' } });
      const res = createMockResponse();

      await controller.check(res);

      expect(mockService.check).toHaveBeenCalledTimes(1);
    });
  });

  describe('ready()', () => {
    it('should return 200 when readiness is ok', async () => {
      const result = {
        status: 'ok',
        checks: {
          postgres: { status: 'ok', latency_ms: 2 },
          redis: { status: 'ok', latency_ms: 1 },
          meilisearch: { status: 'ok', latency_ms: 5 },
        },
        version: '1.0.0',
        uptime_seconds: 120,
      };
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return 503 when readiness is unhealthy', async () => {
      const result = {
        status: 'unhealthy',
        checks: {
          postgres: { status: 'fail', latency_ms: 0 },
          redis: { status: 'ok', latency_ms: 1 },
          meilisearch: { status: 'ok', latency_ms: 5 },
        },
        version: '1.0.0',
        uptime_seconds: 120,
      };
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(res.json).toHaveBeenCalledWith(result);
    });

    it('should return 200 when readiness is degraded', async () => {
      const result = {
        status: 'degraded',
        checks: {
          postgres: { status: 'ok', latency_ms: 2 },
          redis: { status: 'ok', latency_ms: 1 },
          meilisearch: { status: 'fail', latency_ms: 0 },
        },
        version: '1.0.0',
        uptime_seconds: 60,
      };
      mockService.getReadiness.mockResolvedValue(result);
      const res = createMockResponse();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.json).toHaveBeenCalledWith(result);
    });
  });
});
