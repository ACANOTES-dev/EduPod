import { Test, TestingModule } from '@nestjs/testing';

import { MetricsService } from './metrics.service';

// ─── Describe ────────────────────────────────────────────────────────────────

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
    // Trigger OnModuleInit to register metrics
    service.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── onModuleInit ──────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('should create registry with default metrics', async () => {
      const metrics = await service.getMetrics();
      // Default Node.js metrics include process_cpu_seconds_total
      expect(metrics).toContain('process_cpu_seconds_total');
    });
  });

  // ─── getMetrics ────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('should return Prometheus text format', async () => {
      const metrics = await service.getMetrics();
      expect(typeof metrics).toBe('string');
      // Prometheus text format starts with # HELP or # TYPE
      expect(metrics).toMatch(/# (HELP|TYPE)/);
    });

    it('should include custom http_requests_total metric definition', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('# HELP http_requests_total');
      expect(metrics).toContain('# TYPE http_requests_total counter');
    });
  });

  // ─── getContentType ────────────────────────────────────────────────────

  describe('getContentType', () => {
    it('should return correct Prometheus content type', () => {
      const contentType = service.getContentType();
      expect(contentType).toContain('text/plain');
    });
  });

  // ─── recordRequest ─────────────────────────────────────────────────────

  describe('recordRequest', () => {
    it('should increment counter and observe histogram', async () => {
      service.recordRequest('GET', '/api/v1/students', 200, 0.123);

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'http_requests_total{method="GET",path="/api/v1/students",status_code="200"} 1',
      );
      expect(metrics).toContain('http_request_duration_seconds_bucket');
    });

    it('should strip UUIDs from path labels', async () => {
      service.recordRequest(
        'GET',
        '/api/v1/students/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        200,
        0.05,
      );

      const metrics = await service.getMetrics();
      expect(metrics).toContain('path="/api/v1/students/:id"');
      expect(metrics).not.toContain('a1b2c3d4');
    });

    it('should accumulate multiple requests correctly', async () => {
      service.recordRequest('GET', '/api/v1/students', 200, 0.1);
      service.recordRequest('GET', '/api/v1/students', 200, 0.2);
      service.recordRequest('GET', '/api/v1/students', 200, 0.3);

      const metrics = await service.getMetrics();
      expect(metrics).toContain(
        'http_requests_total{method="GET",path="/api/v1/students",status_code="200"} 3',
      );
    });

    it('should track different status codes separately', async () => {
      service.recordRequest('GET', '/api/v1/students', 200, 0.1);
      service.recordRequest('GET', '/api/v1/students', 404, 0.05);

      const metrics = await service.getMetrics();
      expect(metrics).toContain('status_code="200"} 1');
      expect(metrics).toContain('status_code="404"} 1');
    });
  });

  // ─── incrementInFlight / decrementInFlight ─────────────────────────────

  describe('incrementInFlight / decrementInFlight', () => {
    it('should adjust gauge on increment', async () => {
      service.incrementInFlight('GET');
      service.incrementInFlight('GET');

      const metrics = await service.getMetrics();
      expect(metrics).toContain('http_requests_in_flight{method="GET"} 2');
    });

    it('should adjust gauge on decrement', async () => {
      service.incrementInFlight('POST');
      service.incrementInFlight('POST');
      service.decrementInFlight('POST');

      const metrics = await service.getMetrics();
      expect(metrics).toContain('http_requests_in_flight{method="POST"} 1');
    });
  });
});
