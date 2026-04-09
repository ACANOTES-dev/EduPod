/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the Report Card tenant settings subsystem (impl 03).
 *
 * Boots the full Nest AppModule so the real DI graph and real PostgreSQL
 * are exercised, then drives the service layer directly. S3Service is
 * stubbed because these tests don't need a live bucket. The RLS leakage
 * test for `report_card_tenant_settings` lives in impl 01's
 * `rls-leakage.e2e-spec.ts`; this suite focuses on impl 03 behaviour.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardTenantSettingsService } from '../../src/modules/gradebook/report-cards/report-card-tenant-settings.service';
import { S3Service } from '../../src/modules/s3/s3.service';

const TENANT_ID = 'c0de0001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'c0de0002-0002-4002-8002-000000000002';
const USER_ID = 'c0de0003-0003-4003-8003-000000000003';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function buildPngBuffer(payloadSize = 128): Buffer {
  return Buffer.concat([PNG_HEADER, Buffer.alloc(payloadSize)]);
}

jest.setTimeout(60_000);

describe('Report Card Tenant Settings (e2e) — impl 03', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardTenantSettingsService;

  const stubS3: Partial<S3Service> = {
    upload: jest.fn(async (tenantId: string, key: string) => `${tenantId}/${key}`),
    delete: jest.fn(async () => undefined),
    getPresignedUrl: jest.fn(async () => 'https://stub.local/signed'),
    download: jest.fn(async () => Buffer.alloc(0)),
  };

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_tenant_settings WHERE tenant_id IN ('${TENANT_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'::uuid`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM tenants WHERE id IN ('${TENANT_ID}'::uuid, '${TENANT_B_ID}'::uuid)`,
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(S3Service)
      .useValue(stubS3)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCardTenantSettingsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.createMany({
      data: [
        {
          id: TENANT_ID,
          name: 'Impl03 Settings Tenant A',
          slug: 'impl03-settings-tenant-a',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
        {
          id: TENANT_B_ID,
          name: 'Impl03 Settings Tenant B',
          slug: 'impl03-settings-tenant-b',
          default_locale: 'en',
          timezone: 'UTC',
          date_format: 'YYYY-MM-DD',
          currency_code: 'USD',
          academic_year_start_month: 9,
          status: 'active',
        },
      ],
    });
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'impl03-settings-admin@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Impl03',
        last_name: 'Admin',
        global_status: 'active',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    // Reset to a clean row between tests so defaults are observable.
    await prisma.reportCardTenantSettings.deleteMany({
      where: { tenant_id: { in: [TENANT_ID, TENANT_B_ID] } },
    });
  });

  // ─── get ─────────────────────────────────────────────────────────────────

  it('get() lazily bootstraps a default row when none exists', async () => {
    const result = await service.get(TENANT_ID);

    expect(result.tenant_id).toBe(TENANT_ID);
    expect(result.settings.matrix_display_mode).toBe('grade');
    expect(result.settings.require_finalised_comments).toBe(true);
    expect(result.settings.principal_signature_storage_key).toBeNull();

    // A second call returns the same row without creating a new one
    const row = await prisma.reportCardTenantSettings.findUnique({
      where: { tenant_id: TENANT_ID },
    });
    expect(row).not.toBeNull();
    expect(row?.id).toBe(result.id);
  });

  // ─── update ──────────────────────────────────────────────────────────────

  it('update() merges a partial payload into the current settings', async () => {
    await service.get(TENANT_ID); // ensure row exists

    const updated = await service.update(TENANT_ID, USER_ID, {
      matrix_display_mode: 'score',
      show_top_rank_badge: true,
    });

    expect(updated.settings.matrix_display_mode).toBe('score');
    expect(updated.settings.show_top_rank_badge).toBe(true);
    // Untouched fields keep their defaults
    expect(updated.settings.require_finalised_comments).toBe(true);
    expect(updated.settings.allow_admin_force_generate).toBe(true);
  });

  it('update() rejects an invalid merged payload', async () => {
    await service.get(TENANT_ID);

    await expect(
      service.update(TENANT_ID, USER_ID, {
        // Setting the key without a matching name would leave the merged
        // payload half-configured, which the full schema forbids.
        principal_signature_storage_key: `${TENANT_ID}/report-cards/principal-signature.png`,
      }),
    ).rejects.toThrow();
  });

  // ─── Signature upload ────────────────────────────────────────────────────

  it('uploadPrincipalSignature() persists the key and delegates to S3', async () => {
    const uploadSpy = stubS3.upload as jest.Mock;

    const result = await service.uploadPrincipalSignature(
      TENANT_ID,
      USER_ID,
      {
        buffer: buildPngBuffer(),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 128 + PNG_HEADER.length,
      },
      { principalName: 'Dr Jane Smith' },
    );

    expect(uploadSpy).toHaveBeenCalledWith(
      TENANT_ID,
      'report-cards/principal-signature.png',
      expect.any(Buffer),
      'image/png',
    );
    expect(result.settings.principal_signature_storage_key).toBe(
      `${TENANT_ID}/report-cards/principal-signature.png`,
    );
    expect(result.settings.principal_name).toBe('Dr Jane Smith');
  });

  it('uploadPrincipalSignature() rejects a file whose magic bytes mismatch the declared mime', async () => {
    await expect(
      service.uploadPrincipalSignature(
        TENANT_ID,
        USER_ID,
        {
          buffer: Buffer.from('not a real image'),
          mimetype: 'image/png',
          originalname: 'sig.png',
          size: 16,
        },
        { principalName: 'Dr Jane Smith' },
      ),
    ).rejects.toMatchObject({ response: { code: 'INVALID_FILE_CONTENT' } });
  });

  it('uploadPrincipalSignature() rejects when no principal_name is available', async () => {
    await service.get(TENANT_ID); // default row — no principal_name

    await expect(
      service.uploadPrincipalSignature(TENANT_ID, USER_ID, {
        buffer: buildPngBuffer(),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 128 + PNG_HEADER.length,
      }),
    ).rejects.toMatchObject({ response: { code: 'PRINCIPAL_NAME_REQUIRED' } });
  });

  it('deletePrincipalSignature() clears both the storage key and the principal_name', async () => {
    await service.uploadPrincipalSignature(
      TENANT_ID,
      USER_ID,
      {
        buffer: buildPngBuffer(),
        mimetype: 'image/png',
        originalname: 'sig.png',
        size: 128 + PNG_HEADER.length,
      },
      { principalName: 'Dr Jane Smith' },
    );

    const deleteSpy = stubS3.delete as jest.Mock;
    deleteSpy.mockClear();

    const result = await service.deletePrincipalSignature(TENANT_ID, USER_ID);

    expect(deleteSpy).toHaveBeenCalledWith(`${TENANT_ID}/report-cards/principal-signature.png`);
    expect(result.settings.principal_signature_storage_key).toBeNull();
    expect(result.settings.principal_name).toBeNull();
  });

  // ─── Tenant isolation via service layer ──────────────────────────────────

  it('each tenant only reads its own row', async () => {
    const a = await service.update(TENANT_ID, USER_ID, { matrix_display_mode: 'score' });
    const b = await service.update(TENANT_B_ID, USER_ID, { matrix_display_mode: 'grade' });

    expect(a.tenant_id).toBe(TENANT_ID);
    expect(b.tenant_id).toBe(TENANT_B_ID);
    expect(a.id).not.toBe(b.id);
    expect(a.settings.matrix_display_mode).toBe('score');
    expect(b.settings.matrix_display_mode).toBe('grade');
  });
});
