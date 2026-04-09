import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { reportCardTenantSettingsPayloadSchema } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

import { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const ROW_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCardTenantSettings: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_PAYLOAD = reportCardTenantSettingsPayloadSchema.parse({});

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROW_ID,
    tenant_id: TENANT_ID,
    settings_json: { ...DEFAULT_PAYLOAD, ...overrides },
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
}

function buildMockPrisma() {
  return {
    reportCardTenantSettings: {
      findFirst: jest.fn(),
    },
  };
}

function buildMockS3() {
  return {
    upload: jest.fn().mockResolvedValue(`${TENANT_ID}/report-cards/principal-signature.png`),
    delete: jest.fn().mockResolvedValue(undefined),
    getPresignedUrl: jest.fn(),
    download: jest.fn(),
  };
}

// ─── PNG header bytes ────────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function pngBuffer(size = 1024): Buffer {
  return Buffer.concat([PNG_MAGIC, Buffer.alloc(size - PNG_MAGIC.length)]);
}

function jpegBuffer(size = 1024): Buffer {
  return Buffer.concat([JPEG_MAGIC, Buffer.alloc(size - JPEG_MAGIC.length)]);
}

// ─── get ─────────────────────────────────────────────────────────────────────

describe('ReportCardTenantSettingsService — get', () => {
  let service: ReportCardTenantSettingsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    Object.values(mockRlsTx.reportCardTenantSettings).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTenantSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get(ReportCardTenantSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns the existing row when present', async () => {
    const row = buildRow({ matrix_display_mode: 'score' });
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(row);

    const result = await service.get(TENANT_ID);

    expect(result.settings.matrix_display_mode).toBe('score');
    expect(result.tenant_id).toBe(TENANT_ID);
    expect(mockRlsTx.reportCardTenantSettings.upsert).not.toHaveBeenCalled();
  });

  it('lazily bootstraps a default row when none exists', async () => {
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(null);
    mockRlsTx.reportCardTenantSettings.upsert.mockResolvedValue(buildRow());

    const result = await service.get(TENANT_ID);

    expect(mockRlsTx.reportCardTenantSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID },
        create: expect.objectContaining({ tenant_id: TENANT_ID }),
      }),
    );
    expect(result.settings.matrix_display_mode).toBe('grade');
    expect(result.settings.require_finalised_comments).toBe(true);
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('ReportCardTenantSettingsService — update', () => {
  let service: ReportCardTenantSettingsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    Object.values(mockRlsTx.reportCardTenantSettings).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTenantSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get(ReportCardTenantSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('merges partial changes into the current payload', async () => {
    const existing = buildRow({
      matrix_display_mode: 'grade',
      show_top_rank_badge: false,
    });
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(existing);
    mockRlsTx.reportCardTenantSettings.update.mockImplementation(
      async ({ data }: { data: { settings_json: unknown } }) => ({
        ...existing,
        settings_json: data.settings_json,
      }),
    );

    const result = await service.update(TENANT_ID, USER_ID, {
      show_top_rank_badge: true,
    });

    expect(result.settings.show_top_rank_badge).toBe(true);
    // Untouched fields stay as-is
    expect(result.settings.matrix_display_mode).toBe('grade');
    expect(result.settings.require_finalised_comments).toBe(true);
  });

  it('re-validates the merged payload and rejects invalid combinations', async () => {
    // Existing row has the signature name set — that's invalid by itself
    // per the refine, so the factory bypasses Zod by going directly.
    const existing = buildRow();
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(existing);

    await expect(
      service.update(TENANT_ID, USER_ID, {
        // Setting the storage key without setting the name would leave the
        // merged payload half-configured, which the full schema rejects.
        principal_signature_storage_key: 'tenant/x/report-cards/principal-signature.png',
      }),
    ).rejects.toThrow();
  });
});

// ─── uploadPrincipalSignature ────────────────────────────────────────────────

describe('ReportCardTenantSettingsService — uploadPrincipalSignature', () => {
  let service: ReportCardTenantSettingsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    Object.values(mockRlsTx.reportCardTenantSettings).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTenantSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get(ReportCardTenantSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('rejects disallowed mime types', async () => {
    await expect(
      service.uploadPrincipalSignature(
        TENANT_ID,
        USER_ID,
        {
          buffer: Buffer.from('pretend pdf'),
          mimetype: 'application/pdf',
          originalname: 'sig.pdf',
          size: 100,
        },
        { principalName: 'Dr Smith' },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects files over 2MB', async () => {
    const tooBig = Buffer.alloc(3 * 1024 * 1024);
    PNG_MAGIC.copy(tooBig, 0);

    await expect(
      service.uploadPrincipalSignature(
        TENANT_ID,
        USER_ID,
        {
          buffer: tooBig,
          mimetype: 'image/png',
          originalname: 'sig.png',
          size: tooBig.length,
        },
        { principalName: 'Dr Smith' },
      ),
    ).rejects.toThrow(PayloadTooLargeException);
  });

  it('rejects a file whose magic bytes do not match the declared mime', async () => {
    await expect(
      service.uploadPrincipalSignature(
        TENANT_ID,
        USER_ID,
        {
          buffer: jpegBuffer(256), // JPEG bytes
          mimetype: 'image/png', // claims PNG
          originalname: 'lie.png',
          size: 256,
        },
        { principalName: 'Dr Smith' },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_FILE_CONTENT' } });
  });

  it('rejects upload when no principal_name is present or supplied', async () => {
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(buildRow());

    await expect(
      service.uploadPrincipalSignature(TENANT_ID, USER_ID, {
        buffer: pngBuffer(),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 1024,
      }),
    ).rejects.toMatchObject({ response: { code: 'PRINCIPAL_NAME_REQUIRED' } });
  });

  it('uploads a valid PNG and writes the storage key back to settings', async () => {
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(buildRow());
    mockRlsTx.reportCardTenantSettings.update.mockImplementation(
      async ({ data }: { data: { settings_json: unknown } }) => ({
        ...buildRow(),
        settings_json: data.settings_json,
      }),
    );

    const result = await service.uploadPrincipalSignature(
      TENANT_ID,
      USER_ID,
      {
        buffer: pngBuffer(),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 1024,
      },
      { principalName: 'Dr Smith' },
    );

    expect(mockS3.upload).toHaveBeenCalledWith(
      TENANT_ID,
      'report-cards/principal-signature.png',
      expect.any(Buffer),
      'image/png',
    );
    expect(result.settings.principal_signature_storage_key).toBe(
      `${TENANT_ID}/report-cards/principal-signature.png`,
    );
    expect(result.settings.principal_name).toBe('Dr Smith');
  });

  it('deletes the previous key when re-uploading under a different extension', async () => {
    const existingKey = `${TENANT_ID}/report-cards/principal-signature.jpg`;
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(
      buildRow({
        principal_signature_storage_key: existingKey,
        principal_name: 'Dr Smith',
      }),
    );
    mockRlsTx.reportCardTenantSettings.update.mockImplementation(
      async ({ data }: { data: { settings_json: unknown } }) => ({
        ...buildRow(),
        settings_json: data.settings_json,
      }),
    );

    await service.uploadPrincipalSignature(TENANT_ID, USER_ID, {
      buffer: pngBuffer(),
      mimetype: 'image/png',
      originalname: 'sig.png',
      size: 1024,
    });

    expect(mockS3.delete).toHaveBeenCalledWith(existingKey);
  });
});

// ─── deletePrincipalSignature ────────────────────────────────────────────────

describe('ReportCardTenantSettingsService — deletePrincipalSignature', () => {
  let service: ReportCardTenantSettingsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockS3: ReturnType<typeof buildMockS3>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockS3 = buildMockS3();
    Object.values(mockRlsTx.reportCardTenantSettings).forEach((fn) => fn.mockReset());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCardTenantSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get(ReportCardTenantSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('removes the storage key and clears the settings when one was set', async () => {
    const key = `${TENANT_ID}/report-cards/principal-signature.png`;
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(
      buildRow({
        principal_signature_storage_key: key,
        principal_name: 'Dr Smith',
      }),
    );
    mockRlsTx.reportCardTenantSettings.update.mockImplementation(
      async ({ data }: { data: { settings_json: unknown } }) => ({
        ...buildRow(),
        settings_json: data.settings_json,
      }),
    );

    const result = await service.deletePrincipalSignature(TENANT_ID, USER_ID);

    expect(mockS3.delete).toHaveBeenCalledWith(key);
    expect(result.settings.principal_signature_storage_key).toBeNull();
    expect(result.settings.principal_name).toBeNull();
  });

  it('succeeds even when no signature was previously set', async () => {
    mockPrisma.reportCardTenantSettings.findFirst.mockResolvedValue(buildRow());
    mockRlsTx.reportCardTenantSettings.update.mockImplementation(
      async ({ data }: { data: { settings_json: unknown } }) => ({
        ...buildRow(),
        settings_json: data.settings_json,
      }),
    );

    await expect(service.deletePrincipalSignature(TENANT_ID, USER_ID)).resolves.toBeDefined();
    expect(mockS3.delete).not.toHaveBeenCalled();
  });
});
