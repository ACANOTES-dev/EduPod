import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  createS3Client,
  getS3Bucket,
  downloadFromS3,
  downloadBufferFromS3,
  uploadToS3,
  deleteFromS3,
} from './s3.helpers';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
}));

describe('s3.helpers', () => {
  const originalEnv = process.env;
  let mockS3Client: { send: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockS3Client = { send: jest.fn() };
    (S3Client as jest.Mock).mockReturnValue(mockS3Client);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('createS3Client', () => {
    it('should create S3 client with default region', () => {
      delete process.env['S3_REGION'];
      delete process.env['S3_ENDPOINT'];
      delete process.env['S3_ACCESS_KEY_ID'];
      delete process.env['S3_SECRET_ACCESS_KEY'];

      createS3Client();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'us-east-1',
        }),
      );
    });

    it('should create S3 client with custom region', () => {
      process.env['S3_REGION'] = 'eu-west-1';

      createS3Client();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: 'eu-west-1',
        }),
      );
    });

    it('should create S3 client with credentials when provided', () => {
      process.env['S3_ACCESS_KEY_ID'] = 'test-access-key';
      process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret-key';

      createS3Client();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {
            accessKeyId: 'test-access-key',
            secretAccessKey: 'test-secret-key',
          },
        }),
      );
    });

    it('should create S3 client without credentials when not provided', () => {
      delete process.env['S3_ACCESS_KEY_ID'];
      delete process.env['S3_SECRET_ACCESS_KEY'];

      createS3Client();

      const callArgs = (S3Client as jest.Mock).mock.calls[0][0];
      expect(callArgs.credentials).toBeUndefined();
    });

    it('should create S3 client with endpoint for non-AWS providers', () => {
      process.env['S3_ENDPOINT'] = 'https://s3.hetzner.example.com';

      createS3Client();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://s3.hetzner.example.com',
          forcePathStyle: true,
        }),
      );
    });

    it('should create S3 client with endpoint and credentials', () => {
      process.env['S3_ENDPOINT'] = 'https://minio.example.com';
      process.env['S3_ACCESS_KEY_ID'] = 'minio-access';
      process.env['S3_SECRET_ACCESS_KEY'] = 'minio-secret';

      createS3Client();

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'https://minio.example.com',
          forcePathStyle: true,
          credentials: {
            accessKeyId: 'minio-access',
            secretAccessKey: 'minio-secret',
          },
        }),
      );
    });

    it('should create S3 client with only access key (no credentials)', () => {
      process.env['S3_ACCESS_KEY_ID'] = 'test-key';
      delete process.env['S3_SECRET_ACCESS_KEY'];

      createS3Client();

      const callArgs = (S3Client as jest.Mock).mock.calls[0][0];
      expect(callArgs.credentials).toBeUndefined();
    });

    it('should create S3 client with only secret key (no credentials)', () => {
      delete process.env['S3_ACCESS_KEY_ID'];
      process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret';

      createS3Client();

      const callArgs = (S3Client as jest.Mock).mock.calls[0][0];
      expect(callArgs.credentials).toBeUndefined();
    });
  });

  describe('getS3Bucket', () => {
    it('should return default bucket name when S3_BUCKET_NAME not set', () => {
      delete process.env['S3_BUCKET_NAME'];

      const bucket = getS3Bucket();

      expect(bucket).toBe('edupod-assets');
    });

    it('should return custom bucket name from environment', () => {
      process.env['S3_BUCKET_NAME'] = 'custom-bucket';

      const bucket = getS3Bucket();

      expect(bucket).toBe('custom-bucket');
    });

    it('should return empty string bucket when env var is empty', () => {
      process.env['S3_BUCKET_NAME'] = '';

      const bucket = getS3Bucket();

      expect(bucket).toBe('edupod-assets');
    });
  });

  describe('downloadBufferFromS3', () => {
    it('should download buffer from S3', async () => {
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('Hello ');
          yield Buffer.from('World');
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadBufferFromS3('test-file.txt');

      expect(result.toString()).toBe('Hello World');
      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'edupod-assets',
          Key: 'test-file.txt',
        }),
      );
    });

    it('should throw error when response body is empty', async () => {
      mockS3Client.send.mockResolvedValue({ Body: null });

      await expect(downloadBufferFromS3('empty-file.txt')).rejects.toThrow(
        'Empty response body from S3 for key empty-file.txt',
      );
    });

    it('should throw error when response body is undefined', async () => {
      mockS3Client.send.mockResolvedValue({});

      await expect(downloadBufferFromS3('undefined-file.txt')).rejects.toThrow(
        'Empty response body from S3 for key undefined-file.txt',
      );
    });

    it('should handle large files in multiple chunks', async () => {
      const chunks = ['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'];
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield Buffer.from(chunk);
          }
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadBufferFromS3('large-file.bin');

      expect(result.toString()).toBe('chunk1chunk2chunk3chunk4chunk5');
    });

    it('should handle binary data', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          yield binaryData;
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadBufferFromS3('binary.bin');

      expect(result).toEqual(binaryData);
    });

    it('should handle files with path separators', async () => {
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('content');
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      await downloadBufferFromS3('tenant-123/exports/2024/data.json');

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'tenant-123/exports/2024/data.json',
        }),
      );
    });

    it('should propagate S3 errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 access denied'));

      await expect(downloadBufferFromS3('restricted.txt')).rejects.toThrow('S3 access denied');
    });
  });

  describe('downloadFromS3', () => {
    it('should download and convert to UTF-8 string', async () => {
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from('Test content');
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadFromS3('test.json');

      expect(result).toBe('Test content');
    });

    it('should handle UTF-8 encoded content', async () => {
      const content = 'Hello 世界 🌍';
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(content, 'utf-8');
        },
      };
      mockS3Client.send.mockResolvedValue({ Body: mockBody });

      const result = await downloadFromS3('unicode.txt');

      expect(result).toBe(content);
    });

    it('should propagate download errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Network error'));

      await expect(downloadFromS3('error.txt')).rejects.toThrow('Network error');
    });

    it('should throw for empty body', async () => {
      mockS3Client.send.mockResolvedValue({ Body: null });

      await expect(downloadFromS3('empty.txt')).rejects.toThrow('Empty response body');
    });
  });

  describe('uploadToS3', () => {
    it('should upload content to S3 with default content type', async () => {
      mockS3Client.send.mockResolvedValue({});

      await uploadToS3('test.json', '{"key": "value"}');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'edupod-assets',
          Key: 'test.json',
          Body: '{"key": "value"}',
          ContentType: 'application/json',
        }),
      );
    });

    it('should upload content with custom content type', async () => {
      mockS3Client.send.mockResolvedValue({});

      await uploadToS3('image.png', 'binary-data', 'image/png');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'edupod-assets',
          Key: 'image.png',
          Body: 'binary-data',
          ContentType: 'image/png',
        }),
      );
    });

    it('should upload HTML content', async () => {
      mockS3Client.send.mockResolvedValue({});

      const html = '<html><body>Hello</body></html>';
      await uploadToS3('page.html', html, 'text/html');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ContentType: 'text/html',
        }),
      );
    });

    it('should upload empty content', async () => {
      mockS3Client.send.mockResolvedValue({});

      await uploadToS3('empty.txt', '');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Body: '',
        }),
      );
    });

    it('should handle nested paths', async () => {
      mockS3Client.send.mockResolvedValue({});

      await uploadToS3('exports/2024/01/report.pdf', 'content', 'application/pdf');

      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'exports/2024/01/report.pdf',
        }),
      );
    });

    it('should propagate upload errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Upload failed'));

      await expect(uploadToS3('test.txt', 'content')).rejects.toThrow('Upload failed');
    });
  });

  describe('deleteFromS3', () => {
    it('should delete object from S3', async () => {
      mockS3Client.send.mockResolvedValue({});

      await deleteFromS3('old-file.txt');

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'edupod-assets',
          Key: 'old-file.txt',
        }),
      );
    });

    it('should handle delete of nested path', async () => {
      mockS3Client.send.mockResolvedValue({});

      await deleteFromS3('exports/2024/01/file.json');

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'exports/2024/01/file.json',
        }),
      );
    });

    it('should handle delete of file with special characters', async () => {
      mockS3Client.send.mockResolvedValue({});

      await deleteFromS3('file_with-special.chars.txt');

      expect(DeleteObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Key: 'file_with-special.chars.txt',
        }),
      );
    });

    it('should propagate delete errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Delete failed'));

      await expect(deleteFromS3('error.txt')).rejects.toThrow('Delete failed');
    });

    it('should handle deleting non-existent file', async () => {
      mockS3Client.send.mockResolvedValue({});

      await expect(deleteFromS3('non-existent.txt')).resolves.not.toThrow();
    });
  });
});
