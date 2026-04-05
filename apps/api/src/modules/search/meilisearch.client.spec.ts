import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { MeilisearchClient } from './meilisearch.client';

describe('MeilisearchClient', () => {
  let client: MeilisearchClient;
  let mockConfigService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeilisearchClient, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    client = module.get<MeilisearchClient>(MeilisearchClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Ensure any recheck timers are cleaned up
    client.onModuleDestroy();
  });

  describe('available', () => {
    it('should return false by default', () => {
      expect(client.available).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('should skip initialization when MEILISEARCH_URL is not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await client.onModuleInit();

      expect(client.available).toBe(false);
    });

    it('should set available=false when meilisearch package import fails', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'MEILISEARCH_URL') return 'http://localhost:7700';
        if (key === 'MEILISEARCH_API_KEY') return 'test-key';
        return undefined;
      });

      // The dynamic import will fail because meilisearch isn't installed in test env
      await client.onModuleInit();

      // Available stays false since the import/health check fails
      expect(client.available).toBe(false);
    });
  });

  describe('onModuleDestroy', () => {
    it('should not throw when no recheck timer exists', () => {
      expect(() => client.onModuleDestroy()).not.toThrow();
    });

    it('should clear recheck timer when it exists', () => {
      // Simulate a recheck timer being set
      const timer = setInterval(() => {
        /* noop */
      }, 100_000);
      (client as Record<string, unknown>)['recheckTimer'] = timer;

      client.onModuleDestroy();

      expect((client as Record<string, unknown>)['recheckTimer']).toBeNull();
    });
  });

  describe('search', () => {
    it('should return null when not available', async () => {
      const result = await client.search('students', 'test');

      expect(result).toBeNull();
    });

    it('should return null when client is not set', async () => {
      // available is false and client is null by default
      const result = await client.search('students', 'query', { limit: 10 });

      expect(result).toBeNull();
    });
  });

  describe('addDocuments', () => {
    it('should return immediately when not available', async () => {
      await expect(
        client.addDocuments('students', [{ id: '1', name: 'test' }]),
      ).resolves.toBeUndefined();
    });

    it('should return immediately when client is null', async () => {
      // available is false and client is null
      await expect(client.addDocuments('students', [{ id: '1' }])).resolves.toBeUndefined();
    });
  });

  describe('deleteDocument', () => {
    it('should return immediately when not available', async () => {
      await expect(client.deleteDocument('students', 'doc-1')).resolves.toBeUndefined();
    });

    it('should return immediately when client is null', async () => {
      // available is false and client is null
      await expect(client.deleteDocument('students', 'doc-1')).resolves.toBeUndefined();
    });
  });

  // ─── Tests with forced internal state to cover additional branches ────────

  describe('startRecheckTimer and onModuleInit branches', () => {
    it('should start recheck timer when client exists but is not available (line 47-48)', () => {
      // Simulate: client is set (not null) but _available is false
      // This triggers startRecheckTimer
      (client as Record<string, unknown>)['_available'] = false;
      (client as Record<string, unknown>)['client'] = { health: jest.fn() };

      // Access the private method indirectly by calling onModuleInit-like scenario
      // Actually, let's call startRecheckTimer directly via bracket access
      const startRecheckTimer = (client as unknown as Record<string, () => void>)[
        'startRecheckTimer'
      ].bind(client);
      startRecheckTimer();

      // Timer should have been set
      expect((client as Record<string, unknown>)['recheckTimer']).not.toBeNull();

      // Cleanup
      client.onModuleDestroy();
    });

    it('should not start a second recheck timer if one already exists', () => {
      const existingTimer = setInterval(() => {
        /* noop */
      }, 100_000);
      (client as Record<string, unknown>)['recheckTimer'] = existingTimer;
      (client as Record<string, unknown>)['_available'] = false;
      (client as Record<string, unknown>)['client'] = { health: jest.fn() };

      const startRecheckTimer = (client as unknown as Record<string, () => void>)[
        'startRecheckTimer'
      ].bind(client);
      startRecheckTimer();

      // Timer should still be the same one (not replaced)
      expect((client as Record<string, unknown>)['recheckTimer']).toBe(existingTimer);

      // Cleanup
      clearInterval(existingTimer);
      (client as Record<string, unknown>)['recheckTimer'] = null;
    });

    it('should recover and clear timer when health check succeeds in recheck', async () => {
      jest.useFakeTimers();

      const mockHealth = jest.fn().mockResolvedValue({});
      (client as Record<string, unknown>)['_available'] = false;
      (client as Record<string, unknown>)['client'] = { health: mockHealth };

      const startRecheckTimer = (client as unknown as Record<string, () => void>)[
        'startRecheckTimer'
      ].bind(client);
      startRecheckTimer();

      expect(client.available).toBe(false);

      // Advance timer by 60 seconds
      jest.advanceTimersByTime(60_000);

      // Let the async callback resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(mockHealth).toHaveBeenCalled();
      expect(client.available).toBe(true);
      expect((client as Record<string, unknown>)['recheckTimer']).toBeNull();

      jest.useRealTimers();
    });

    it('should keep retrying when health check fails in recheck', async () => {
      jest.useFakeTimers();

      const mockHealth = jest.fn().mockRejectedValue(new Error('still down'));
      (client as Record<string, unknown>)['_available'] = false;
      (client as Record<string, unknown>)['client'] = { health: mockHealth };

      const startRecheckTimer = (client as unknown as Record<string, () => void>)[
        'startRecheckTimer'
      ].bind(client);
      startRecheckTimer();

      // Advance timer by 60 seconds
      jest.advanceTimersByTime(60_000);

      // Let the async callback resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(mockHealth).toHaveBeenCalled();
      expect(client.available).toBe(false);
      // Timer should still be running
      expect((client as Record<string, unknown>)['recheckTimer']).not.toBeNull();

      // Cleanup
      client.onModuleDestroy();
      jest.useRealTimers();
    });
  });

  describe('search — with available=true and mock client', () => {
    let mockMeiliClient: {
      index: jest.Mock;
      health: jest.Mock;
    };

    beforeEach(() => {
      mockMeiliClient = {
        index: jest.fn(),
        health: jest.fn().mockResolvedValue({}),
      };
      // Force internal state to simulate connected Meilisearch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as Record<string, unknown>)['_available'] = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as Record<string, unknown>)['client'] = mockMeiliClient;
    });

    it('should delegate search to the internal meili client', async () => {
      const mockHits = { hits: [{ id: '1', name: 'John' }] };
      mockMeiliClient.index.mockReturnValue({
        search: jest.fn().mockResolvedValue(mockHits),
      });

      const result = await client.search('students', 'John', { limit: 10 });

      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
      expect(result).toEqual(mockHits);
    });

    it('should return null and log error when search throws', async () => {
      mockMeiliClient.index.mockReturnValue({
        search: jest.fn().mockRejectedValue(new Error('Search failed')),
      });

      const result = await client.search('students', 'John');

      expect(result).toBeNull();
    });

    it('should return null when search throws a non-Error value', async () => {
      mockMeiliClient.index.mockReturnValue({
        search: jest.fn().mockRejectedValue('string error'),
      });

      const result = await client.search('students', 'John');

      expect(result).toBeNull();
    });
  });

  describe('addDocuments — with available=true and mock client', () => {
    let mockMeiliClient: {
      index: jest.Mock;
    };

    beforeEach(() => {
      mockMeiliClient = {
        index: jest.fn(),
      };
      (client as Record<string, unknown>)['_available'] = true;
      (client as Record<string, unknown>)['client'] = mockMeiliClient;
    });

    it('should add documents via the internal client', async () => {
      const mockAddDocs = jest.fn().mockResolvedValue({});
      mockMeiliClient.index.mockReturnValue({ addDocuments: mockAddDocs });

      await client.addDocuments('students', [{ id: '1' }]);

      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
      expect(mockAddDocs).toHaveBeenCalledWith([{ id: '1' }]);
    });

    it('should log error when addDocuments throws', async () => {
      mockMeiliClient.index.mockReturnValue({
        addDocuments: jest.fn().mockRejectedValue(new Error('Index error')),
      });

      // Should not throw — error is caught and logged
      await expect(client.addDocuments('students', [{ id: '1' }])).resolves.toBeUndefined();
    });
  });

  describe('deleteDocument — with available=true and mock client', () => {
    let mockMeiliClient: {
      index: jest.Mock;
    };

    beforeEach(() => {
      mockMeiliClient = {
        index: jest.fn(),
      };
      (client as Record<string, unknown>)['_available'] = true;
      (client as Record<string, unknown>)['client'] = mockMeiliClient;
    });

    it('should delete a document via the internal client', async () => {
      const mockDeleteDoc = jest.fn().mockResolvedValue({});
      mockMeiliClient.index.mockReturnValue({ deleteDocument: mockDeleteDoc });

      await client.deleteDocument('students', 'doc-1');

      expect(mockMeiliClient.index).toHaveBeenCalledWith('students');
      expect(mockDeleteDoc).toHaveBeenCalledWith('doc-1');
    });

    it('should log error when deleteDocument throws', async () => {
      mockMeiliClient.index.mockReturnValue({
        deleteDocument: jest.fn().mockRejectedValue(new Error('Delete failed')),
      });

      // Should not throw — error is caught and logged
      await expect(client.deleteDocument('students', 'doc-1')).resolves.toBeUndefined();
    });
  });
});
