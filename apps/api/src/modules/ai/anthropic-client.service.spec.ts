/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import type Anthropic from '@anthropic-ai/sdk';

// ─── SDK Mock ──────────────────────────────────────────────────────────────────

const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  }));
  return { __esModule: true, default: MockAnthropic };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MockAnthropic = require('@anthropic-ai/sdk').default as jest.Mock;

import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';
import { TenantModuleService } from '../../common/services/tenant-module.service';
import { ModuleDisabledException } from '../../common/exceptions/module-disabled.exception';

import { AnthropicClientService } from './anthropic-client.service';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const API_KEY = 'sk-ant-test-key-1234567890';
const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildMockMessage(): Anthropic.Message {
  return {
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello from Claude' }],
    model: 'claude-sonnet-4-6-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    container: null,
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as Anthropic.Message;
}

function buildMockConfigService(options: { apiKey: string | undefined } = { apiKey: API_KEY }) {
  const { apiKey } = options;
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'ANTHROPIC_API_KEY') return apiKey;
      return undefined;
    }),
  };
}

function buildMockCircuitBreakerRegistry() {
  return {
    exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
    getBreaker: jest.fn(),
  };
}

function buildMockTenantModuleService(enabled = true) {
  return {
    isEnabled: jest.fn().mockResolvedValue(enabled),
  };
}

/** Create a fresh TestingModule with the given config and breaker mocks. */
async function buildTestModule(
  mockConfig: ReturnType<typeof buildMockConfigService>,
  mockBreaker: ReturnType<typeof buildMockCircuitBreakerRegistry>,
  mockTenantModuleService: ReturnType<
    typeof buildMockTenantModuleService
  > = buildMockTenantModuleService(),
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      AnthropicClientService,
      { provide: ConfigService, useValue: mockConfig },
      { provide: CircuitBreakerRegistry, useValue: mockBreaker },
      { provide: TenantModuleService, useValue: mockTenantModuleService },
    ],
  }).compile();
}

// ─── isConfigured Tests ────────────────────────────────────────────────────────

describe('AnthropicClientService — isConfigured', () => {
  afterEach(() => jest.restoreAllMocks());

  it('should return true when ANTHROPIC_API_KEY is set', async () => {
    const mockConfig = buildMockConfigService({ apiKey: API_KEY });
    const module = await buildTestModule(mockConfig, buildMockCircuitBreakerRegistry());
    const service = module.get<AnthropicClientService>(AnthropicClientService);

    expect(service.isConfigured).toBe(true);
    expect(mockConfig.get).toHaveBeenCalledWith('ANTHROPIC_API_KEY');
  });

  it('should return false when ANTHROPIC_API_KEY is undefined', async () => {
    const mockConfig = buildMockConfigService({ apiKey: undefined });
    const module = await buildTestModule(mockConfig, buildMockCircuitBreakerRegistry());
    const service = module.get<AnthropicClientService>(AnthropicClientService);

    expect(service.isConfigured).toBe(false);
  });

  it('should return false when ANTHROPIC_API_KEY is empty string', async () => {
    const mockConfig = buildMockConfigService({ apiKey: '' });
    const module = await buildTestModule(mockConfig, buildMockCircuitBreakerRegistry());
    const service = module.get<AnthropicClientService>(AnthropicClientService);

    expect(service.isConfigured).toBe(false);
  });
});

// ─── createMessage Tests ───────────────────────────────────────────────────────

describe('AnthropicClientService — createMessage', () => {
  let service: AnthropicClientService;
  let mockBreaker: ReturnType<typeof buildMockCircuitBreakerRegistry>;

  const baseParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
  };

  beforeEach(async () => {
    // Reset the SDK mock before each test so that client is re-created
    MockAnthropic.mockClear();
    mockMessagesCreate.mockReset();
    mockMessagesCreate.mockResolvedValue(buildMockMessage());

    mockBreaker = buildMockCircuitBreakerRegistry();
    const mockConfig = buildMockConfigService({ apiKey: API_KEY });
    const module = await buildTestModule(mockConfig, mockBreaker);
    service = module.get<AnthropicClientService>(AnthropicClientService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('should call Anthropic SDK and return message on happy path', async () => {
    const expectedMessage = buildMockMessage();
    mockMessagesCreate.mockResolvedValue(expectedMessage);

    const result = await service.createMessage(baseParams, { tenantId: TENANT_ID });

    expect(result).toEqual(expectedMessage);
    expect(mockBreaker.exec).toHaveBeenCalledWith('anthropic', expect.any(Function));
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      baseParams,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should pass params through to the SDK create method', async () => {
    const customParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: 'Summarize this document' }],
      temperature: 0.5,
    };

    await service.createMessage(customParams, { tenantId: TENANT_ID });

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      customParams,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('should throw when ai_functions is disabled for the tenant', async () => {
    const mockConfig = buildMockConfigService({ apiKey: API_KEY });
    const mockTenantModuleService = buildMockTenantModuleService(false);
    const module = await buildTestModule(
      mockConfig,
      buildMockCircuitBreakerRegistry(),
      mockTenantModuleService,
    );
    const disabledService = module.get<AnthropicClientService>(AnthropicClientService);

    await expect(
      disabledService.createMessage(baseParams, { tenantId: TENANT_ID }),
    ).rejects.toBeInstanceOf(ModuleDisabledException);
    expect(mockTenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'ai_functions');
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('should use default 30s timeout when no timeoutMs provided', async () => {
    jest.useFakeTimers();

    mockMessagesCreate.mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new Error('Request was aborted'));
          });
        }),
    );

    const promise = service.createMessage(baseParams, { tenantId: TENANT_ID });
    await Promise.resolve();

    jest.advanceTimersByTime(30_000);

    await expect(promise).rejects.toThrow('Request was aborted');
  });

  it('should abort request when custom timeoutMs is exceeded', async () => {
    jest.useFakeTimers();

    mockMessagesCreate.mockImplementation(
      (_params: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new Error('Request was aborted'));
          });
        }),
    );

    const promise = service.createMessage(baseParams, { tenantId: TENANT_ID, timeoutMs: 5_000 });
    await Promise.resolve();

    jest.advanceTimersByTime(5_000);

    await expect(promise).rejects.toThrow('Request was aborted');
  });

  it('should not abort before timeout expires', async () => {
    jest.useFakeTimers();

    const expectedMessage = buildMockMessage();
    mockMessagesCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(expectedMessage), 2_000);
        }),
    );

    const promise = service.createMessage(baseParams, { tenantId: TENANT_ID, timeoutMs: 10_000 });
    await Promise.resolve();

    jest.advanceTimersByTime(2_000);

    const result = await promise;
    expect(result).toEqual(expectedMessage);
  });

  it('should propagate circuit breaker errors', async () => {
    const breakerError = new Error('Breaker is open');
    breakerError.name = 'BrokenCircuitError';
    mockBreaker.exec.mockRejectedValue(breakerError);

    await expect(service.createMessage(baseParams, { tenantId: TENANT_ID })).rejects.toThrow(
      'Breaker is open',
    );
  });

  it('should propagate SDK errors from messages.create', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('Anthropic API rate limit exceeded'));

    await expect(service.createMessage(baseParams, { tenantId: TENANT_ID })).rejects.toThrow(
      'Anthropic API rate limit exceeded',
    );
  });

  it('should clear timeout after successful response', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    await service.createMessage(baseParams, { tenantId: TENANT_ID });

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('should clear timeout after failed response', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    mockMessagesCreate.mockRejectedValue(new Error('API failure'));

    await expect(service.createMessage(baseParams, { tenantId: TENANT_ID })).rejects.toThrow(
      'API failure',
    );

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

// ─── getClient (via createMessage) Tests ───────────────────────────────────────

describe('AnthropicClientService — getClient', () => {
  const baseParams: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello' }],
  };

  beforeEach(() => {
    MockAnthropic.mockClear();
    mockMessagesCreate.mockReset();
    mockMessagesCreate.mockResolvedValue(buildMockMessage());
  });

  afterEach(() => jest.restoreAllMocks());

  it('should throw error when ANTHROPIC_API_KEY is not configured', async () => {
    const mockConfig = buildMockConfigService({ apiKey: undefined });
    const mockBreaker = buildMockCircuitBreakerRegistry();
    const module = await buildTestModule(mockConfig, mockBreaker);
    const service = module.get<AnthropicClientService>(AnthropicClientService);

    await expect(service.createMessage(baseParams, { tenantId: TENANT_ID })).rejects.toThrow(
      'ANTHROPIC_API_KEY is not configured',
    );
  });

  it('should cache client instance across multiple calls (lazy init)', async () => {
    const mockConfig = buildMockConfigService({ apiKey: API_KEY });
    const mockBreaker = buildMockCircuitBreakerRegistry();
    const module = await buildTestModule(mockConfig, mockBreaker);
    const service = module.get<AnthropicClientService>(AnthropicClientService);

    await service.createMessage(baseParams, { tenantId: TENANT_ID });
    await service.createMessage(baseParams, { tenantId: TENANT_ID });

    // Anthropic constructor should only have been called once (lazy init + cache)
    expect(MockAnthropic).toHaveBeenCalledTimes(1);
    expect(MockAnthropic).toHaveBeenCalledWith({ apiKey: API_KEY });
  });
});
