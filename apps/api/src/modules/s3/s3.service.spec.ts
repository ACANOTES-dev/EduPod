import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned.example.com/file'),
}));

import { S3Service } from './s3.service';

const S3_CONFIG: Record<string, string> = {
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  S3_BUCKET_NAME: 'test-bucket',
  S3_ENDPOINT: '',
};

describe('S3Service', () => {
  let service: S3Service;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockSend.mockReset();

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => S3_CONFIG[key] ?? undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should not create client when credentials are missing', () => {
    mockConfigService.get.mockReturnValue(undefined);

    const svc = new S3Service(mockConfigService as unknown as ConfigService);
    svc.onModuleInit();

    expect(() =>
      // Access the private ensureClient via upload which calls it
      svc.upload('tenant-1', 'file.txt', Buffer.from('hi'), 'text/plain'),
    ).rejects.toThrow('S3 client not configured');
  });

  it('should upload a file with tenant-namespaced key', async () => {
    service.onModuleInit();
    mockSend.mockResolvedValueOnce({});

    const result = await service.upload('tenant-1', 'docs/file.pdf', Buffer.from('data'), 'application/pdf');
    expect(result).toBe('tenant-1/docs/file.pdf');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should download a file and return a Buffer', async () => {
    service.onModuleInit();

    const chunks = [Buffer.from('hello'), Buffer.from(' world')];
    async function* generateChunks() {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    mockSend.mockResolvedValueOnce({ Body: generateChunks() });

    const result = await service.download('tenant-1/docs/file.pdf');
    expect(result.toString()).toBe('hello world');
  });

  it('should throw when download response body is empty', async () => {
    service.onModuleInit();
    mockSend.mockResolvedValueOnce({ Body: null });

    await expect(service.download('tenant-1/file.txt')).rejects.toThrow('Empty response body');
  });

  it('should generate a presigned URL', async () => {
    service.onModuleInit();

    const url = await service.getPresignedUrl('tenant-1/file.txt', 900);
    expect(url).toBe('https://presigned.example.com/file');
  });

  it('should delete a file', async () => {
    service.onModuleInit();
    mockSend.mockResolvedValueOnce({});

    await expect(service.delete('tenant-1/file.txt')).resolves.not.toThrow();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('should throw ensureClient error if client not initialised', async () => {
    // Do NOT call onModuleInit so client stays null
    mockConfigService.get.mockReturnValue(undefined);

    const svc = new S3Service(mockConfigService as unknown as ConfigService);
    svc.onModuleInit();

    await expect(svc.delete('key')).rejects.toThrow('S3 client not configured');
  });
});
