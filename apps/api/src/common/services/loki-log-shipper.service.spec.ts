import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import type { StructuredLogEntry } from './loki-log-shipper.service';
import { LokiLogShipper } from './loki-log-shipper.service';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const LOKI_URL = 'https://loki.example.com/loki/api/v1/push';

function buildEntry(overrides: Partial<StructuredLogEntry> = {}): StructuredLogEntry {
  return {
    timestamp: '2026-04-04T12:00:00.000Z',
    level: 'log',
    message: 'test message',
    requestId: 'req-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    context: 'TestContext',
    ...overrides,
  };
}

function buildConfigService(envOverrides: Record<string, string | undefined> = {}): ConfigService {
  const env: Record<string, string | undefined> = {
    LOKI_PUSH_URL: LOKI_URL,
    LOKI_SERVICE_LABEL: undefined,
    LOKI_ENVIRONMENT: undefined,
    ...envOverrides,
  };

  return {
    get: jest.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('LokiLogShipper', () => {
  let shipper: LokiLogShipper;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  // ─── Disabled when not configured ──────────────────────────────────────

  describe('when LOKI_PUSH_URL is not configured', () => {
    beforeEach(async () => {
      const configService = buildConfigService({ LOKI_PUSH_URL: undefined });

      const module = await Test.createTestingModule({
        providers: [LokiLogShipper, { provide: ConfigService, useValue: configService }],
      }).compile();

      shipper = module.get(LokiLogShipper);
    });

    it('should log that shipping is disabled on init', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      shipper.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith('Loki not configured, log shipping disabled');
    });

    it('should not call fetch when shipping entries', async () => {
      shipper.onModuleInit();
      shipper.ship(buildEntry());

      // Even at the threshold, should not flush
      for (let i = 0; i < 150; i++) {
        shipper.ship(buildEntry());
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Enabled and configured ────────────────────────────────────────────

  describe('when LOKI_PUSH_URL is configured', () => {
    beforeEach(async () => {
      jest.useFakeTimers();
      const configService = buildConfigService();

      const module = await Test.createTestingModule({
        providers: [LokiLogShipper, { provide: ConfigService, useValue: configService }],
      }).compile();

      shipper = module.get(LokiLogShipper);
      shipper.onModuleInit();
    });

    afterEach(async () => {
      await shipper.onModuleDestroy();
    });

    it('should log configuration status on init', () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();

      // Create a new instance to test the init message
      const configService = buildConfigService({
        LOKI_SERVICE_LABEL: 'worker',
        LOKI_ENVIRONMENT: 'staging',
      });
      const freshShipper = new LokiLogShipper(configService);
      freshShipper.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Log shipping enabled'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('service=worker'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('env=staging'));

      // Clean up the timer started by freshShipper
      freshShipper.onModuleDestroy();
    });

    // ─── Buffer and batch threshold ──────────────────────────────────────

    it('should buffer entries without flushing below threshold', () => {
      for (let i = 0; i < 99; i++) {
        shipper.ship(buildEntry({ message: `msg-${i}` }));
      }

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should flush when buffer reaches 100 entries', () => {
      for (let i = 0; i < 100; i++) {
        shipper.ship(buildEntry({ message: `msg-${i}` }));
      }

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        LOKI_URL,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    // ─── Timer-based flush ───────────────────────────────────────────────

    it('should flush on timer interval', () => {
      shipper.ship(buildEntry());
      expect(global.fetch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(5_000);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should not call fetch when buffer is empty on timer tick', () => {
      jest.advanceTimersByTime(5_000);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    // ─── Payload format ──────────────────────────────────────────────────

    it('should correctly format the Loki push payload with labels and log line', () => {
      const entry = buildEntry({
        level: 'error',
        message: 'something failed',
        tenantId: 'tenant-abc',
        userId: 'user-xyz',
        requestId: 'req-999',
        context: 'PayrollService',
        trace: 'Error: boom\n  at line 1',
      });

      shipper.ship(entry);
      jest.advanceTimersByTime(5_000);

      expect(global.fetch).toHaveBeenCalledTimes(1);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        streams: Array<{
          stream: Record<string, string>;
          values: [string, string][];
        }>;
      };

      // Verify stream labels (low-cardinality)
      expect(body.streams).toHaveLength(1);
      const stream = body.streams[0];
      if (!stream) throw new Error('Expected stream at index 0');
      expect(stream.stream).toEqual({
        service: 'api',
        level: 'error',
        environment: 'development',
      });

      // Verify values tuple: [nanosTimestamp, jsonLogLine]
      expect(stream.values).toHaveLength(1);
      const valueTuple = stream.values[0];
      if (!valueTuple) throw new Error('Expected value tuple at index 0');
      const [nanosTs, logLine] = valueTuple;

      // Nanosecond timestamp
      const expectedMs = new Date('2026-04-04T12:00:00.000Z').getTime();
      expect(nanosTs).toBe(`${expectedMs}000000`);

      // Log line contains high-cardinality metadata
      const parsed = JSON.parse(logLine) as Record<string, unknown>;
      expect(parsed.message).toBe('something failed');
      expect(parsed.tenant_id).toBe('tenant-abc');
      expect(parsed.user_id).toBe('user-xyz');
      expect(parsed.request_id).toBe('req-999');
      expect(parsed.context).toBe('PayrollService');
      expect(parsed.trace).toBe('Error: boom\n  at line 1');
    });

    it('should group entries by level into separate streams', () => {
      shipper.ship(buildEntry({ level: 'log', message: 'info msg' }));
      shipper.ship(buildEntry({ level: 'error', message: 'error msg' }));
      shipper.ship(buildEntry({ level: 'log', message: 'another info' }));

      jest.advanceTimersByTime(5_000);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        streams: Array<{
          stream: Record<string, string>;
          values: [string, string][];
        }>;
      };

      expect(body.streams).toHaveLength(2);

      const logStream = body.streams.find((s) => s.stream.level === 'log');
      const errorStream = body.streams.find((s) => s.stream.level === 'error');

      expect(logStream).toBeDefined();
      if (!logStream) throw new Error('logStream not found');
      expect(logStream.values).toHaveLength(2);

      expect(errorStream).toBeDefined();
      if (!errorStream) throw new Error('errorStream not found');
      expect(errorStream.values).toHaveLength(1);
    });

    // ─── Error handling ──────────────────────────────────────────────────

    it('should handle push failure gracefully without throwing', async () => {
      const error = new Error('Network error');
      (global.fetch as jest.Mock).mockRejectedValueOnce(error);

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      shipper.ship(buildEntry());
      jest.advanceTimersByTime(5_000);

      // Let the promise rejection settle
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleSpy).toHaveBeenCalledWith('[LokiLogShipper]', error);
    });

    it('should log an error when Loki returns a non-OK status', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      shipper.ship(buildEntry());
      jest.advanceTimersByTime(5_000);

      // Let the .then chain settle
      await Promise.resolve();
      await Promise.resolve();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[LokiLogShipper] Push failed with status 500: Internal Server Error',
      );
    });

    // ─── Module destroy ──────────────────────────────────────────────────

    it('should flush remaining buffer on module destroy', async () => {
      shipper.ship(buildEntry({ message: 'final entry' }));
      expect(global.fetch).not.toHaveBeenCalled();

      await shipper.onModuleDestroy();

      expect(global.fetch).toHaveBeenCalledTimes(1);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        streams: Array<{
          values: [string, string][];
        }>;
      };

      // Verify the final entry was included
      const stream = body.streams[0];
      if (!stream) throw new Error('Expected stream at index 0');
      const valueTuple = stream.values[0];
      if (!valueTuple) throw new Error('Expected value tuple at index 0');
      const logLine = valueTuple[1];
      const parsed = JSON.parse(logLine) as Record<string, unknown>;
      expect(parsed.message).toBe('final entry');
    });

    it('should clear the flush timer on module destroy', async () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      await shipper.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  // ─── Custom service label ──────────────────────────────────────────────

  describe('custom configuration', () => {
    it('should use LOKI_SERVICE_LABEL when provided', () => {
      jest.useFakeTimers();
      const configService = buildConfigService({
        LOKI_SERVICE_LABEL: 'worker',
        LOKI_ENVIRONMENT: 'staging',
      });
      const customShipper = new LokiLogShipper(configService);
      customShipper.onModuleInit();

      customShipper.ship(buildEntry());
      jest.advanceTimersByTime(5_000);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(callArgs[1].body as string) as {
        streams: Array<{
          stream: Record<string, string>;
        }>;
      };

      const stream = body.streams[0];
      if (!stream) throw new Error('Expected stream at index 0');
      expect(stream.stream.service).toBe('worker');
      expect(stream.stream.environment).toBe('staging');

      customShipper.onModuleDestroy();
    });
  });
});
