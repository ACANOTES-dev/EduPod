/* eslint-disable import/order -- jest.mock must precede mocked imports */
import type { RequestContext } from '../middleware/correlation.middleware';

let mockContext: RequestContext | undefined;

jest.mock('../middleware/correlation.middleware', () => ({
  getRequestContext: () => mockContext,
}));

// eslint-disable-next-line import/order
import { StructuredLoggerService } from './logger.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function captureStdout(fn: () => void): string {
  let captured = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    captured += chunk;
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }

  return captured;
}

function captureStderr(fn: () => void): string {
  let captured = '';
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: string) => {
    captured += chunk;
    return true;
  }) as typeof process.stderr.write;

  try {
    fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return captured;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('StructuredLoggerService', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let logger: StructuredLoggerService;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    logger = new StructuredLoggerService();
    mockContext = undefined;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  // ─── Production JSON output ───────────────────────────────────────────

  describe('production mode — structured JSON', () => {
    it('should output valid JSON for log()', () => {
      const output = captureStdout(() => {
        logger.log('Test message', 'TestContext');
      });

      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe('log');
      expect(parsed.message).toBe('Test message');
      expect(parsed.context).toBe('TestContext');
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.requestId).toBeNull();
      expect(parsed.tenantId).toBeNull();
      expect(parsed.userId).toBeNull();
    });

    it('should output valid JSON for warn()', () => {
      const output = captureStdout(() => {
        logger.warn('Warning message', 'WarnContext');
      });

      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe('warn');
      expect(parsed.message).toBe('Warning message');
    });

    it('should output error to stderr', () => {
      const output = captureStderr(() => {
        logger.error('Error message', 'stack trace here', 'ErrorContext');
      });

      const parsed = JSON.parse(output.trim());
      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('Error message');
      expect(parsed.context).toBe('ErrorContext');
      expect((parsed as Record<string, unknown>).trace).toBe('stack trace here');
    });

    it('should include request context when available', () => {
      mockContext = {
        requestId: 'req-123',
        tenantId: 'tenant-abc',
        userId: 'user-xyz',
      };

      const output = captureStdout(() => {
        logger.log('Contextual message', 'SomeService');
      });

      const parsed = JSON.parse(output.trim());
      expect(parsed.requestId).toBe('req-123');
      expect(parsed.tenantId).toBe('tenant-abc');
      expect(parsed.userId).toBe('user-xyz');
    });

    it('should use null for missing context fields', () => {
      mockContext = {
        requestId: 'req-456',
      };

      const output = captureStdout(() => {
        logger.log('Partial context', 'SomeService');
      });

      const parsed = JSON.parse(output.trim());
      expect(parsed.requestId).toBe('req-456');
      expect(parsed.tenantId).toBeNull();
      expect(parsed.userId).toBeNull();
    });

    it('should have ISO timestamp', () => {
      const output = captureStdout(() => {
        logger.log('Timestamp test');
      });

      const parsed = JSON.parse(output.trim());
      // Verify it's a valid ISO string
      const date = new Date(parsed.timestamp as string);
      expect(date.toISOString()).toBe(parsed.timestamp);
    });
  });

  // ─── Log levels ───────────────────────────────────────────────────────

  describe('getLogLevels', () => {
    it('should return limited levels in production', () => {
      process.env.NODE_ENV = 'production';
      const levels = StructuredLoggerService.getLogLevels();
      expect(levels).toContain('log');
      expect(levels).toContain('error');
      expect(levels).toContain('warn');
      expect(levels).not.toContain('debug');
      expect(levels).not.toContain('verbose');
    });

    it('should return all levels in development', () => {
      process.env.NODE_ENV = 'development';
      const levels = StructuredLoggerService.getLogLevels();
      expect(levels).toContain('log');
      expect(levels).toContain('error');
      expect(levels).toContain('warn');
      expect(levels).toContain('debug');
      expect(levels).toContain('verbose');
    });
  });

  // ─── Development mode ─────────────────────────────────────────────────

  describe('development mode — default NestJS output', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      logger = new StructuredLoggerService();
    });

    it('should not produce JSON output for log()', () => {
      // In dev mode, it delegates to ConsoleLogger which uses coloured output.
      // We verify by checking it doesn't write raw JSON to stdout.
      const output = captureStdout(() => {
        logger.log('Dev message', 'DevContext');
      });

      // ConsoleLogger may or may not write to stdout directly (it may use
      // console.log which writes to stdout differently). The key assertion is
      // that if there is output, it's not JSON.
      if (output.trim().length > 0) {
        expect(() => JSON.parse(output.trim())).toThrow();
      }
    });
  });
});
