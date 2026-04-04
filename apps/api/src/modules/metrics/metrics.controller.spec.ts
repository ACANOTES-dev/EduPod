import { Test, TestingModule } from '@nestjs/testing';

import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockResponse() {
  const res = {
    set: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res as unknown as import('express').Response;
}

// ─── Describe ────────────────────────────────────────────────────────────────

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockService: {
    getMetrics: jest.Mock;
    getContentType: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getMetrics: jest.fn(),
      getContentType: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [{ provide: MetricsService, useValue: mockService }],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMetrics ────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('should return metrics with correct content type', async () => {
      const metricsText = '# HELP http_requests_total Total\nhttp_requests_total 42\n';
      const contentType = 'text/plain; version=0.0.4; charset=utf-8';
      mockService.getMetrics.mockResolvedValue(metricsText);
      mockService.getContentType.mockReturnValue(contentType);
      const res = createMockResponse();

      await controller.getMetrics(res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', contentType);
      expect(res.send).toHaveBeenCalledWith(metricsText);
    });

    it('should call service getMetrics and getContentType', async () => {
      mockService.getMetrics.mockResolvedValue('');
      mockService.getContentType.mockReturnValue('text/plain');
      const res = createMockResponse();

      await controller.getMetrics(res);

      expect(mockService.getMetrics).toHaveBeenCalledTimes(1);
      expect(mockService.getContentType).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Decorator checks ─────────────────────────────────────────────────

  describe('decorators', () => {
    it('should have @SkipThrottle() decorator on the controller', () => {
      // SkipThrottle sets metadata with key "THROTTLER:SKIP" + throttler name suffix
      const metadataKeys = Reflect.getMetadataKeys(MetricsController);
      const hasSkipThrottle = metadataKeys.some(
        (key: string) => typeof key === 'string' && key.startsWith('THROTTLER:SKIP'),
      );
      expect(hasSkipThrottle).toBe(true);
    });
  });
});
