import { Test, type TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaClient } from '@prisma/client';
import type { Queue, Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';
import { WorkerHealthService, type WorkerHealthResult } from './worker-health.service';

describe('WorkerHealthService', () => {
  let service: WorkerHealthService;
  let mockPrisma: PrismaClient;
  let mockQueue: jest.Mocked<Queue>;

  const STUCK_JOB_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  beforeEach(async () => {
    // Mock Prisma client
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    } as unknown as PrismaClient;

    // Mock BullMQ queue
    mockQueue = {
      client: Promise.resolve({
        ping: jest.fn().mockResolvedValue('PONG'),
      }),
      getActive: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerHealthService,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
        { provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<WorkerHealthService>(WorkerHealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── check() ─────────────────────────────────────────────────────────────────

  describe('check', () => {
    it('should return healthy status when all dependencies are up', async () => {
      const result = await service.check();

      expect(result.status).toBe('healthy');
      expect(result.service).toBe('worker');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('up');
    });

    it('should return degraded status when BullMQ is down but PostgreSQL and Redis are up', async () => {
      // Mock BullMQ failure
      mockQueue.getActive = jest.fn().mockRejectedValue(new Error('BullMQ error'));

      const result = await service.check();

      expect(result.status).toBe('degraded');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(result.checks.bullmq.status).toBe('down');
    });

    it('should return unhealthy status when PostgreSQL is down', async () => {
      // Mock PostgreSQL failure
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection refused'));

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
      expect(result.checks.redis.status).toBe('up');
    });

    it('should return unhealthy status when Redis is down', async () => {
      // Mock Redis failure
      mockQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(new Error('Redis error')),
      });

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('up');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should return unhealthy status when both PostgreSQL and Redis are down', async () => {
      // Mock both failures
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
      mockQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(new Error('Redis error')),
      });

      const result = await service.check();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.postgresql.status).toBe('down');
      expect(result.checks.redis.status).toBe('down');
    });

    it('should include timestamp and uptime in the result', async () => {
      const beforeCheck = Date.now();
      const result = await service.check();
      const afterCheck = Date.now();

      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(result.timestamp).getTime()).toBeGreaterThanOrEqual(beforeCheck);
      expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(afterCheck);
    });

    it('should report latency for PostgreSQL and Redis checks', async () => {
      const result = await service.check();

      expect(result.checks.postgresql.latency_ms).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.latency_ms).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── getLiveness() ─────────────────────────────────────────────────────────────

  describe('getLiveness', () => {
    it('should return alive status with service name', () => {
      const result = service.getLiveness();

      expect(result.status).toBe('alive');
      expect(result.service).toBe('worker');
    });

    it('should include ISO timestamp', () => {
      const beforeCheck = new Date().toISOString();
      const result = service.getLiveness();
      const afterCheck = new Date().toISOString();

      expect(result.timestamp).toBeDefined();
      expect(result.timestamp >= beforeCheck && result.timestamp <= afterCheck).toBe(true);
    });
  });

  // ─── checkBullMQ() ─────────────────────────────────────────────────────────────

  describe('checkBullMQ - stuck job detection', () => {
    it('should report 0 stuck jobs when queue is empty', async () => {
      mockQueue.getActive = jest.fn().mockResolvedValue([]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(0);
      expect(result.checks.bullmq.status).toBe('up');
    });

    it('should report 0 stuck jobs when jobs are recent', async () => {
      const now = Date.now();
      const recentJob = {
        processedOn: now - 1000, // 1 second ago
        timestamp: now - 2000,
      } as Job;

      mockQueue.getActive = jest.fn().mockResolvedValue([recentJob]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(0);
    });

    it('should detect stuck jobs older than threshold', async () => {
      const now = Date.now();
      const stuckJob = {
        processedOn: now - (STUCK_JOB_THRESHOLD_MS + 1000), // 5+ minutes ago
        timestamp: now - (STUCK_JOB_THRESHOLD_MS + 5000),
      } as Job;

      mockQueue.getActive = jest.fn().mockResolvedValue([stuckJob]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(1);
    });

    it('should detect multiple stuck jobs', async () => {
      const now = Date.now();
      const stuckJob1 = {
        processedOn: now - (STUCK_JOB_THRESHOLD_MS + 1000),
        timestamp: now - (STUCK_JOB_THRESHOLD_MS + 5000),
      } as Job;
      const stuckJob2 = {
        processedOn: now - (STUCK_JOB_THRESHOLD_MS + 2000),
        timestamp: now - (STUCK_JOB_THRESHOLD_MS + 6000),
      } as Job;
      const recentJob = {
        processedOn: now - 1000,
        timestamp: now - 2000,
      } as Job;

      mockQueue.getActive = jest.fn().mockResolvedValue([stuckJob1, recentJob, stuckJob2]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(2);
    });

    it('should use timestamp when processedOn is not available', async () => {
      const now = Date.now();
      const stuckJob = {
        processedOn: null,
        timestamp: now - (STUCK_JOB_THRESHOLD_MS + 1000),
      } as Job;

      mockQueue.getActive = jest.fn().mockResolvedValue([stuckJob]);

      const result = await service.check();

      expect(result.checks.bullmq.stuck_jobs).toBe(1);
    });

    it('should handle errors in BullMQ check gracefully', async () => {
      mockQueue.getActive = jest.fn().mockRejectedValue(new Error('Connection lost'));

      const result = await service.check();

      expect(result.checks.bullmq.status).toBe('down');
      expect(result.checks.bullmq.stuck_jobs).toBe(0);
    });
  });

  // ─── Error Logging ───────────────────────────────────────────────────────────

  describe('error logging', () => {
    it('should log PostgreSQL errors', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
      (mockPrisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      await service.check();

      expect(loggerSpy).toHaveBeenCalledWith('[checkPostgresql]', expect.any(Error));
    });

    it('should log Redis errors', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
      mockQueue.client = Promise.resolve({
        ping: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      });

      await service.check();

      expect(loggerSpy).toHaveBeenCalledWith('[checkRedis]', expect.any(Error));
    });

    it('should log BullMQ errors', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
      mockQueue.getActive = jest.fn().mockRejectedValue(new Error('BullMQ timeout'));

      await service.check();

      expect(loggerSpy).toHaveBeenCalledWith('[checkBullMQ]', expect.any(Error));
    });
  });
});
