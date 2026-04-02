import { deleteSearchDocument } from './search.helpers';

// Mock logger - define mocks before jest.mock
const mockLoggerWarn = jest.fn();
const mockLoggerLog = jest.fn();

jest.mock('@nestjs/common', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    warn: mockLoggerWarn,
    log: mockLoggerLog,
  })),
}));

// Mock meilisearch module
const mockDeleteDocument = jest.fn();
const mockHealth = jest.fn();
const mockIndex = jest.fn().mockReturnValue({
  deleteDocument: mockDeleteDocument,
});

const mockMeiliSearch = jest.fn().mockImplementation(() => ({
  health: mockHealth,
  index: mockIndex,
}));

jest.mock('meilisearch', () => ({
  MeiliSearch: mockMeiliSearch,
}));

describe('search.helpers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('deleteSearchDocument', () => {
    it('should do nothing when MEILISEARCH_URL is not set', async () => {
      delete process.env['MEILISEARCH_URL'];

      await deleteSearchDocument('students', 'doc-1');

      expect(mockMeiliSearch).not.toHaveBeenCalled();
    });

    it('should delete document from Meilisearch', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      process.env['MEILISEARCH_API_KEY'] = 'test-api-key';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'doc-1');

      expect(mockMeiliSearch).toHaveBeenCalledWith({
        host: 'http://localhost:7700',
        apiKey: 'test-api-key',
      });
      expect(mockIndex).toHaveBeenCalledWith('students');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-1');
    });

    it('should delete document without API key', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      delete process.env['MEILISEARCH_API_KEY'];
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('teachers', 'teacher-1');

      expect(mockMeiliSearch).toHaveBeenCalledWith({
        host: 'http://localhost:7700',
        apiKey: undefined,
      });
      expect(mockDeleteDocument).toHaveBeenCalledWith('teacher-1');
    });

    it('should handle Meilisearch errors gracefully', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockRejectedValue(new Error('Connection refused'));

      await deleteSearchDocument('students', 'doc-1');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Meilisearch unavailable'),
      );
    });

    it('should handle delete document errors gracefully', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockRejectedValue(new Error('Document not found'));

      await deleteSearchDocument('students', 'non-existent-doc');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete Meilisearch document'),
      );
    });

    it('should use cached client on subsequent calls', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'doc-1');
      await deleteSearchDocument('students', 'doc-2');
      await deleteSearchDocument('teachers', 'teacher-1');

      expect(mockMeiliSearch).toHaveBeenCalledTimes(1);
      expect(mockDeleteDocument).toHaveBeenCalledTimes(3);
    });

    it('should handle different index names', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'student-1');
      await deleteSearchDocument('staff', 'staff-1');
      await deleteSearchDocument('parents', 'parent-1');
      await deleteSearchDocument('classes', 'class-1');

      expect(mockIndex).toHaveBeenCalledWith('students');
      expect(mockIndex).toHaveBeenCalledWith('staff');
      expect(mockIndex).toHaveBeenCalledWith('parents');
      expect(mockIndex).toHaveBeenCalledWith('classes');
    });

    it('should handle errors with non-Error objects', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockRejectedValue('String error');

      await deleteSearchDocument('students', 'doc-1');

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('String error'));
    });

    it('should handle empty document ID', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', '');

      expect(mockDeleteDocument).toHaveBeenCalledWith('');
    });

    it('should handle empty index name', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('', 'doc-1');

      expect(mockIndex).toHaveBeenCalledWith('');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-1');
    });

    it('should handle HTTPS URLs', async () => {
      process.env['MEILISEARCH_URL'] = 'https://meilisearch.example.com';
      process.env['MEILISEARCH_API_KEY'] = 'secure-key';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'doc-1');

      expect(mockMeiliSearch).toHaveBeenCalledWith({
        host: 'https://meilisearch.example.com',
        apiKey: 'secure-key',
      });
    });

    it('should handle document IDs with special characters', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'uuid-123-456');
      await deleteSearchDocument('students', 'doc_with_underscores');
      await deleteSearchDocument('students', 'doc.with.dots');
      await deleteSearchDocument('students', 'doc:colon');

      expect(mockDeleteDocument).toHaveBeenCalledWith('uuid-123-456');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc_with_underscores');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc.with.dots');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc:colon');
    });

    it('should handle document ID with spaces', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'doc with spaces');

      expect(mockDeleteDocument).toHaveBeenCalledWith('doc with spaces');
    });

    it('should handle URL with trailing slash', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700/';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      await deleteSearchDocument('students', 'doc-1');

      expect(mockMeiliSearch).toHaveBeenCalledWith({
        host: 'http://localhost:7700/',
        apiKey: undefined,
      });
    });

    it('should handle multiple concurrent delete calls', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockResolvedValue({});

      const promises: Array<Promise<void>> = [];
      for (let i = 0; i < 5; i++) {
        promises.push(deleteSearchDocument('students', `doc-${i}`));
      }

      await Promise.all(promises);

      expect(mockMeiliSearch).toHaveBeenCalledTimes(1);
      expect(mockDeleteDocument).toHaveBeenCalledTimes(5);
    });

    it('should handle delete errors with object error messages', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockResolvedValue({});
      mockDeleteDocument.mockRejectedValue({ message: 'Custom error object' });

      await deleteSearchDocument('students', 'doc-1');

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete Meilisearch document'),
      );
    });

    it('should handle non-Error objects in health check errors', async () => {
      process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
      mockHealth.mockRejectedValue({ custom: 'error' });

      await deleteSearchDocument('students', 'doc-1');

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('[object Object]'));
    });
  });
});
