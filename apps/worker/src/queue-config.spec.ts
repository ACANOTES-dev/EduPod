import * as fs from 'fs';
import * as path from 'path';

import { QUEUE_NAMES } from './base/queue.constants';

// ─── Expected queue configurations ────────────────────────────────────────────
// Single source of truth. If a queue's retry/backoff/cleanup settings change in
// worker.module.ts, this map must be updated — and the test will fail until it is.

interface ExpectedQueueConfig {
  attempts: number;
  backoffType: 'exponential';
  backoffDelay: number;
  removeOnComplete: number;
  removeOnFail: number;
}

type QueueKey = keyof typeof QUEUE_NAMES;

const EXPECTED_QUEUE_CONFIGS: Record<QueueKey, ExpectedQueueConfig> = {
  AUDIT_LOG: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 2000,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  APPROVALS: {
    attempts: 2,
    backoffType: 'exponential',
    backoffDelay: 10000,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  PAYROLL: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  NOTIFICATIONS: {
    attempts: 5,
    backoffType: 'exponential',
    backoffDelay: 3000,
    removeOnComplete: 200,
    removeOnFail: 1000,
  },
  SEARCH_SYNC: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 2000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  REPORTS: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  ATTENDANCE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  SCHEDULING: {
    attempts: 2,
    backoffType: 'exponential',
    backoffDelay: 10000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  GRADEBOOK: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  HOMEWORK: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  FINANCE: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  IMPORTS: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  ADMISSIONS: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  BEHAVIOUR: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  PASTORAL: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  PDF_RENDERING: {
    attempts: 2,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  SECURITY: {
    attempts: 2,
    backoffType: 'exponential',
    backoffDelay: 10000,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  WELLBEING: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  COMPLIANCE: {
    attempts: 2,
    backoffType: 'exponential',
    backoffDelay: 10000,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
  REGULATORY: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 50,
    removeOnFail: 200,
  },
  SAFEGUARDING: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 2000,
    removeOnComplete: 200,
    removeOnFail: 500,
  },
  EARLY_WARNING: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
  ENGAGEMENT: {
    attempts: 3,
    backoffType: 'exponential',
    backoffDelay: 5000,
    removeOnComplete: 100,
    removeOnFail: 500,
  },
};

// ─── Source parser ─────────────────────────────────────────────────────────────
// Reads worker.module.ts and extracts the BullModule.registerQueue block so we
// can verify the actual source matches the expected truth table above.

interface ParsedQueueConfig {
  attempts: number;
  backoffType: string;
  backoffDelay: number;
  removeOnComplete: number;
  removeOnFail: number;
}

function parseQueueConfigsFromSource(): Record<string, ParsedQueueConfig> {
  const modulePath = path.resolve(__dirname, 'worker.module.ts');
  const source = fs.readFileSync(modulePath, 'utf-8');

  // Extract the BullModule.registerQueue(...) block
  const registerQueueStart = source.indexOf('BullModule.registerQueue(');
  if (registerQueueStart === -1) {
    throw new Error('Could not find BullModule.registerQueue( in worker.module.ts');
  }

  // Find the matching closing paren by counting braces/parens
  let depth = 0;
  let registerQueueEnd = -1;
  for (let i = registerQueueStart; i < source.length; i++) {
    if (source[i] === '(') depth++;
    if (source[i] === ')') {
      depth--;
      if (depth === 0) {
        registerQueueEnd = i + 1;
        break;
      }
    }
  }

  if (registerQueueEnd === -1) {
    throw new Error('Could not find matching closing paren for BullModule.registerQueue(');
  }

  const registerBlock = source.slice(registerQueueStart, registerQueueEnd);

  // Match each queue config block: name: QUEUE_NAMES.XXX + defaultJobOptions
  const queuePattern =
    /name:\s*QUEUE_NAMES\.(\w+),\s*defaultJobOptions:\s*\{[^}]*attempts:\s*(\d+),\s*backoff:\s*\{\s*type:\s*'(\w+)',\s*delay:\s*(\d+)\s*\},\s*removeOnComplete:\s*(\d+),\s*removeOnFail:\s*(\d+)/g;

  const configs: Record<string, ParsedQueueConfig> = {};
  let match: RegExpExecArray | null;

  while ((match = queuePattern.exec(registerBlock)) !== null) {
    const queueKey = match[1];
    const attempts = match[2];
    const backoffType = match[3];
    const backoffDelay = match[4];
    const removeOnComplete = match[5];
    const removeOnFail = match[6];

    if (
      !queueKey ||
      !attempts ||
      !backoffType ||
      !backoffDelay ||
      !removeOnComplete ||
      !removeOnFail
    ) {
      throw new Error(`Incomplete regex match for queue entry near index ${match.index}`);
    }

    configs[queueKey] = {
      attempts: parseInt(attempts, 10),
      backoffType,
      backoffDelay: parseInt(backoffDelay, 10),
      removeOnComplete: parseInt(removeOnComplete, 10),
      removeOnFail: parseInt(removeOnFail, 10),
    };
  }

  return configs;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('BullMQ queue configuration — drift detection', () => {
  const allQueueKeys = Object.keys(QUEUE_NAMES) as QueueKey[];
  const expectedKeys = Object.keys(EXPECTED_QUEUE_CONFIGS) as QueueKey[];
  let parsedConfigs: Record<string, ParsedQueueConfig>;

  beforeAll(() => {
    parsedConfigs = parseQueueConfigsFromSource();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Completeness checks ──────────────────────────────────────────────────

  it('should have an expected config entry for every QUEUE_NAMES key', () => {
    const missingFromExpected = allQueueKeys.filter((k) => !(k in EXPECTED_QUEUE_CONFIGS));
    expect(missingFromExpected).toEqual([]);
  });

  it('should not have expected config entries for non-existent queue names', () => {
    const extraInExpected = expectedKeys.filter((k) => !(k in QUEUE_NAMES));
    expect(extraInExpected).toEqual([]);
  });

  it('should register exactly 23 queues in worker.module.ts', () => {
    const parsedCount = Object.keys(parsedConfigs).length;
    expect(parsedCount).toBe(23);
  });

  it('should have a parsed config for every QUEUE_NAMES key', () => {
    const missingFromSource = allQueueKeys.filter((k) => !(k in parsedConfigs));
    expect(missingFromSource).toEqual([]);
  });

  // ─── Global invariants ────────────────────────────────────────────────────

  it('should use exponential backoff for all queues', () => {
    for (const [key, config] of Object.entries(parsedConfigs)) {
      expect(config.backoffType).toBe('exponential');
      if (config.backoffType !== 'exponential') {
        // Extra context for test failure output
        throw new Error(
          `Queue ${key} uses backoff type '${config.backoffType}', expected 'exponential'`,
        );
      }
    }
  });

  it('should have at least 2 retry attempts for every queue', () => {
    for (const [key, config] of Object.entries(parsedConfigs)) {
      expect(config.attempts).toBeGreaterThanOrEqual(2);
      if (config.attempts < 2) {
        throw new Error(`Queue ${key} has ${config.attempts} attempts, minimum is 2`);
      }
    }
  });

  it('should retain at least 10 completed jobs for every queue', () => {
    for (const [key, config] of Object.entries(parsedConfigs)) {
      expect(config.removeOnComplete).toBeGreaterThanOrEqual(10);
      if (config.removeOnComplete < 10) {
        throw new Error(`Queue ${key} removeOnComplete=${config.removeOnComplete}, minimum is 10`);
      }
    }
  });

  it('should retain at least 50 failed jobs for every queue', () => {
    for (const [key, config] of Object.entries(parsedConfigs)) {
      expect(config.removeOnFail).toBeGreaterThanOrEqual(50);
      if (config.removeOnFail < 50) {
        throw new Error(`Queue ${key} removeOnFail=${config.removeOnFail}, minimum is 50`);
      }
    }
  });

  // ─── Per-queue configuration verification ─────────────────────────────────

  it.each(allQueueKeys)('should match expected config for queue %s', (queueKey) => {
    const expected = EXPECTED_QUEUE_CONFIGS[queueKey];
    const actual = parsedConfigs[queueKey];

    expect(actual).toBeDefined();
    if (!actual) return;

    expect(actual.attempts).toBe(expected.attempts);
    expect(actual.backoffType).toBe(expected.backoffType);
    expect(actual.backoffDelay).toBe(expected.backoffDelay);
    expect(actual.removeOnComplete).toBe(expected.removeOnComplete);
    expect(actual.removeOnFail).toBe(expected.removeOnFail);
  });

  // ─── Structural safety checks ─────────────────────────────────────────────

  it('should not have any queue registered without defaultJobOptions', () => {
    const modulePath = path.resolve(__dirname, 'worker.module.ts');
    const source = fs.readFileSync(modulePath, 'utf-8');

    // Find all QUEUE_NAMES.XXX references in the registerQueue block
    const registerQueueStart = source.indexOf('BullModule.registerQueue(');
    const registerBlock = source.slice(registerQueueStart);
    const nameRefs = registerBlock.match(/QUEUE_NAMES\.\w+/g) ?? [];

    // Each should have a corresponding defaultJobOptions in the same block
    for (const nameRef of nameRefs) {
      const queueKey = nameRef.replace('QUEUE_NAMES.', '');
      expect(parsedConfigs[queueKey]).toBeDefined();
    }
  });
});
