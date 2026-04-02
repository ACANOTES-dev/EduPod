type MockMethodNames = readonly string[];
type MockModuleMap = Record<string, MockMethodNames>;
type MockMethods<T extends MockMethodNames> = {
  [K in T[number]]: jest.Mock;
};

export type MockPrisma<T extends MockModuleMap> = {
  [K in keyof T]: MockMethods<T[K]>;
};

export interface MockQueue {
  add: jest.Mock;
  getJob: jest.Mock;
  [key: string]: jest.Mock;
}

export interface MockRedisClient {
  del: jest.Mock;
  get: jest.Mock;
  incr: jest.Mock;
  publish: jest.Mock;
  quit: jest.Mock;
  sadd: jest.Mock;
  set: jest.Mock;
  [key: string]: jest.Mock;
}

export interface MockRedisService {
  _client: MockRedisClient;
  getClient: jest.Mock;
}

export interface MockLogger {
  debug: jest.Mock;
  error: jest.Mock;
  log: jest.Mock;
  verbose: jest.Mock;
  warn: jest.Mock;
}

function buildMockMethods<T extends MockMethodNames>(methodNames: T): MockMethods<T> {
  return Object.fromEntries(
    methodNames.map((methodName) => [methodName, jest.fn()]),
  ) as MockMethods<T>;
}

export function buildMockPrisma<T extends MockModuleMap>(modelMethods: T): MockPrisma<T> {
  return Object.fromEntries(
    Object.entries(modelMethods).map(([modelName, methodNames]) => [
      modelName,
      buildMockMethods(methodNames),
    ]),
  ) as MockPrisma<T>;
}

export function buildMockRedis(clientOverrides: Partial<MockRedisClient> = {}): MockRedisService {
  const client: MockRedisClient = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    sadd: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
    ...clientOverrides,
  };

  return {
    _client: client,
    getClient: jest.fn().mockReturnValue(client),
  };
}

export function buildMockLogger(overrides: Partial<MockLogger> = {}): MockLogger {
  return {
    debug: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    verbose: jest.fn(),
    warn: jest.fn(),
    ...overrides,
  };
}

export function buildMockQueue(overrides: Partial<MockQueue> = {}): MockQueue {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

// ─── RLS Transaction Helpers ─────────────────────────────────────────────────

export interface MockRlsTransaction {
  $executeRaw: jest.Mock;
  $executeRawUnsafe: jest.Mock;
  $queryRaw: jest.Mock;
  $queryRawUnsafe: jest.Mock;
}

export function buildMockRlsTransaction(): MockRlsTransaction {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $queryRawUnsafe: jest.fn().mockResolvedValue([]),
  };
}

export function buildMockPrismaWithRls<T extends MockModuleMap>(
  modelMethods: T,
): MockPrisma<T> & { $transaction: jest.Mock } {
  const mockTx = buildMockRlsTransaction();
  const basePrisma = buildMockPrisma(modelMethods);

  return {
    ...basePrisma,
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: MockRlsTransaction) => Promise<unknown>) => {
        return fn(mockTx);
      }),
  } as MockPrisma<T> & { $transaction: jest.Mock };
}

// ─── Error Path Fixtures ─────────────────────────────────────────────────────

export const ERROR_SCENARIOS = {
  prisma: {
    uniqueConstraint: (field: string) =>
      new Error(`Unique constraint failed on the fields: (${field})`),
    foreignKey: (field: string) =>
      new Error(`Foreign key constraint failed on the field: ${field}`),
    notFound: () => new Error('Record not found'),
  },
  validation: {
    invalidDate: () => new Error('Invalid date format'),
    invalidEmail: () => new Error('Invalid email format'),
    requiredField: (field: string) => new Error(`${field} is required`),
    invalidUuid: () => new Error('Invalid UUID format'),
  },
  permission: {
    denied: (action: string) => new Error(`Permission denied: ${action}`),
    moduleDisabled: (module: string) => new Error(`Module ${module} is disabled`),
  },
} as const;

// ─── Test Constants ───────────────────────────────────────────────────────────

export const TEST_CONSTANTS = {
  TENANT_ID: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  USER_ID: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  MEMBERSHIP_ID: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  STUDENT_ID: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  STAFF_ID: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  CLASS_ID: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  YEAR_GROUP_ID: '11111111-1111-1111-1111-111111111111',
} as const;
