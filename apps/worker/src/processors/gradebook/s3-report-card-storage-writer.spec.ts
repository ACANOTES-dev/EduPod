import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockSend,
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

// eslint-disable-next-line import/order -- jest.mock must precede mocked imports
import { S3ReportCardStorageWriter } from './s3-report-card-storage-writer';

const S3_CONFIG: Record<string, string> = {
  S3_REGION: 'eu-central',
  S3_ACCESS_KEY_ID: 'test-key',
  S3_SECRET_ACCESS_KEY: 'test-secret',
  S3_BUCKET_NAME: 'test-bucket',
  S3_ENDPOINT: 'https://object.example.com',
};

const TENANT_ID = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
const REPORT_CARD_KEY =
  'report-cards/f2b78ca9-864b-4c7e-b6aa-849abb71e709/periods/6e821d84-d963-45d1-840d-91e32b684296/603aaf52-ac16-4cf9-a82a-c13b8eb4c8bd/en.pdf';

describe('S3ReportCardStorageWriter', () => {
  let writer: S3ReportCardStorageWriter;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockSend.mockReset();
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => S3_CONFIG[key] ?? undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3ReportCardStorageWriter,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    writer = module.get<S3ReportCardStorageWriter>(S3ReportCardStorageWriter);
    writer.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  it('prepends the tenant id to the storage key and returns the full key', async () => {
    mockSend.mockResolvedValueOnce({});

    const returned = await writer.upload(
      TENANT_ID,
      REPORT_CARD_KEY,
      Buffer.from('pdf-bytes'),
      'application/pdf',
    );

    expect(returned).toBe(`${TENANT_ID}/${REPORT_CARD_KEY}`);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const commandArg = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(commandArg.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: `${TENANT_ID}/${REPORT_CARD_KEY}`,
      ContentType: 'application/pdf',
    });
  });

  it('passes the raw key through to delete without mutation', async () => {
    mockSend.mockResolvedValueOnce({});

    await writer.delete(`${TENANT_ID}/${REPORT_CARD_KEY}`);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const commandArg = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(commandArg.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: `${TENANT_ID}/${REPORT_CARD_KEY}`,
    });
  });

  it('throws a clear error when S3 env vars are missing', async () => {
    mockConfigService.get.mockReturnValue(undefined);
    const fresh = new S3ReportCardStorageWriter(mockConfigService as unknown as ConfigService);
    fresh.onModuleInit();

    await expect(
      fresh.upload(TENANT_ID, REPORT_CARD_KEY, Buffer.from(''), 'application/pdf'),
    ).rejects.toThrow('S3ReportCardStorageWriter not configured');
  });
});
