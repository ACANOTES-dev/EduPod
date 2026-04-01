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
