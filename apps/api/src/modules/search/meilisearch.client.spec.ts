import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { MeilisearchClient } from './meilisearch.client';

describe('MeilisearchClient', () => {
  let client: MeilisearchClient;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeilisearchClient, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    client = module.get<MeilisearchClient>(MeilisearchClient);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('constructor and availability getter', () => {
    it('should create instance and return false for availability before init', () => {
      expect(client).toBeDefined();
      expect(client.available).toBe(false);
    });
  });

  describe('onModuleInit()', () => {
    it('should skip initialization when MEILISEARCH_URL is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await client.onModuleInit();

      expect(client.available).toBe(false);
      expect(mockConfigService.get).toHaveBeenCalledWith('MEILISEARCH_URL');
    });

    it('should handle initialization when URL is set but meilisearch is not installed', async () => {
      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });

    it('should handle initialization with just URL (no API key)', async () => {
      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce(undefined);

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });
  });

  describe('onModuleDestroy()', () => {
    it('should handle destroy when timer is not set', () => {
      expect(() => client.onModuleDestroy()).not.toThrow();
    });

    it('should clear timer when it exists', async () => {
      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();
      expect(() => client.onModuleDestroy()).not.toThrow();
    });
  });

  describe('search()', () => {
    it('should return null when client is not available', async () => {
      const result = await client.search('students', 'test');
      expect(result).toBeNull();
    });

    it('should return null when client is not initialized', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const unavailableClient = new MeilisearchClient(mockConfigService as ConfigService);
      await unavailableClient.onModuleInit();

      const result = await unavailableClient.search('students', 'test');
      expect(result).toBeNull();
    });
  });

  describe('addDocuments()', () => {
    it('should return early when client is not available', async () => {
      const result = await client.addDocuments('students', [{ id: '1' }]);
      expect(result).toBeUndefined();
    });

    it('should return early when client is not initialized', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const unavailableClient = new MeilisearchClient(mockConfigService as ConfigService);
      await unavailableClient.onModuleInit();

      const result = await unavailableClient.addDocuments('students', [{ id: '1' }]);
      expect(result).toBeUndefined();
    });
  });

  describe('deleteDocument()', () => {
    it('should return early when client is not available', async () => {
      const result = await client.deleteDocument('students', 'doc-1');
      expect(result).toBeUndefined();
    });

    it('should return early when client is not initialized', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const unavailableClient = new MeilisearchClient(mockConfigService as ConfigService);
      await unavailableClient.onModuleInit();

      const result = await unavailableClient.deleteDocument('students', 'doc-1');
      expect(result).toBeUndefined();
    });
  });

  describe('config edge cases', () => {
    it('should handle null config values', async () => {
      mockConfigService.get.mockReturnValue(null);

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });

    it('should handle empty string URL', async () => {
      mockConfigService.get.mockReturnValueOnce('').mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });

    it('should handle whitespace-only URL', async () => {
      mockConfigService.get.mockReturnValueOnce('   ').mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle config service throwing errors', async () => {
      mockConfigService.get.mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(client.onModuleInit()).rejects.toThrow('Config error');
    });

    it('should handle non-Error config service exceptions', async () => {
      mockConfigService.get.mockImplementation(() => {
        throw 'string error';
      });

      await expect(client.onModuleInit()).rejects.toBe('string error');
    });
  });

  describe('availability state', () => {
    it('should maintain availability state across operations', async () => {
      expect(client.available).toBe(false);

      mockConfigService.get.mockReturnValue(undefined);
      await client.onModuleInit();
      expect(client.available).toBe(false);

      const searchResult = await client.search('students', 'test');
      expect(searchResult).toBeNull();

      const addResult = await client.addDocuments('students', [{ id: '1' }]);
      expect(addResult).toBeUndefined();

      const deleteResult = await client.deleteDocument('students', 'doc-1');
      expect(deleteResult).toBeUndefined();
    });
  });

  describe('search with available client', () => {
    it('should perform search when client is available', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          search: jest.fn().mockResolvedValue({
            hits: [{ id: '1', name: 'John' }],
            estimatedTotalHits: 1,
          }),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      // Manually set the client to simulate successful initialization
      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      const result = await client.search('students', 'John', { limit: 10 });

      expect(result).toEqual({
        hits: [{ id: '1', name: 'John' }],
        estimatedTotalHits: 1,
      });
      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
    });

    it('should handle search errors gracefully', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          search: jest.fn().mockRejectedValue(new Error('Search failed')),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      const result = await client.search('students', 'test');
      expect(result).toBeNull();
    });

    it('should handle non-Error search exceptions', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          search: jest.fn().mockRejectedValue('string error'),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      const result = await client.search('students', 'test');
      expect(result).toBeNull();
    });
  });

  describe('addDocuments with available client', () => {
    it('should add documents when client is available', async () => {
      const mockAddDocuments = jest.fn().mockResolvedValue({ updateId: 1 });
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          addDocuments: mockAddDocuments,
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      const documents = [
        { id: '1', name: 'John' },
        { id: '2', name: 'Jane' },
      ];
      await client.addDocuments('students', documents);

      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
      expect(mockAddDocuments).toHaveBeenCalledWith(documents);
    });

    it('should handle add documents errors', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          addDocuments: jest.fn().mockRejectedValue(new Error('Index not found')),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      const documents = [{ id: '1' }];
      await expect(client.addDocuments('students', documents)).resolves.toBeUndefined();
    });

    it('should handle non-Error add documents exceptions', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          addDocuments: jest.fn().mockRejectedValue('string error'),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      await expect(client.addDocuments('students', [{ id: '1' }])).resolves.toBeUndefined();
    });
  });

  describe('deleteDocument with available client', () => {
    it('should delete document when client is available', async () => {
      const mockDeleteDocument = jest.fn().mockResolvedValue({ updateId: 1 });
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          deleteDocument: mockDeleteDocument,
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      await client.deleteDocument('students', 'doc-1');

      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-1');
    });

    it('should handle delete document errors', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          deleteDocument: jest.fn().mockRejectedValue(new Error('Document not found')),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      await expect(client.deleteDocument('students', 'doc-1')).resolves.toBeUndefined();
    });

    it('should handle non-Error delete document exceptions', async () => {
      const mockMeiliClient = {
        index: jest.fn().mockReturnValue({
          deleteDocument: jest.fn().mockRejectedValue('string error'),
        }),
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = true;

      await expect(client.deleteDocument('students', 'doc-1')).resolves.toBeUndefined();
    });
  });

  describe('recheck timer', () => {
    it('should start recheck timer when initialization fails but client was created', async () => {
      const mockHealth = jest.fn().mockRejectedValue(new Error('Connection refused'));
      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      // Manually set up the client and trigger timer
      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;

      // Trigger startRecheckTimer
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      // Timer should be set via startRecheckTimer
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(mockHealth).toHaveBeenCalled();
    });

    it('should recover when health check succeeds during recheck', async () => {
      const mockHealth = jest.fn().mockResolvedValue({ status: 'available' });

      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      jest.advanceTimersByTime(60_000);
      // Wait for the async health check and the subsequent code
      await Promise.resolve();
      await Promise.resolve();

      expect(client.available).toBe(true);
    });

    it('should stop timer after successful recovery', async () => {
      const mockHealth = jest.fn().mockResolvedValue({ status: 'available' });

      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      // First recheck
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(client.available).toBe(true);

      // Verify timer was cleared by checking no more health calls
      const callCount = mockHealth.mock.calls.length;

      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(mockHealth).toHaveBeenCalledTimes(callCount); // No additional calls
    });

    it('should continue rechecking on repeated failures', async () => {
      const mockHealth = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      // Trigger multiple rechecks
      for (let i = 0; i < 3; i++) {
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
      }

      expect(mockHealth).toHaveBeenCalledTimes(3);
    });

    it('should not start multiple timers', async () => {
      const mockHealth = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;

      // Start timer twice
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      // Multiple timer triggers should not create multiple intervals
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(mockHealth).toHaveBeenCalledTimes(2);
    });

    it('should handle non-Error exceptions in recheck timer', async () => {
      const mockHealth = jest.fn().mockRejectedValue('string error');

      const mockMeiliClient = {
        health: mockHealth,
      };

      mockConfigService.get
        .mockReturnValueOnce('http://localhost:7700')
        .mockReturnValueOnce('test-api-key');

      await client.onModuleInit();

      (client as unknown as { client: unknown }).client = mockMeiliClient;
      (client as unknown as { _available: boolean })._available = false;
      (client as unknown as { startRecheckTimer(): void }).startRecheckTimer();

      // Should not throw when health check throws non-Error
      jest.advanceTimersByTime(60_000);
      await Promise.resolve();

      expect(client.available).toBe(false);
    });
  });
});
