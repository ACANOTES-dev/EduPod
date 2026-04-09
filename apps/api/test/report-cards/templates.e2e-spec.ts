/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the Report Card template service refactor (impl 03).
 *
 * Boots the full Nest AppModule and drives the template service directly to
 * verify that `listContentScopes` and `resolveForGeneration` return the
 * correct shape against real Postgres data.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCardTemplateService } from '../../src/modules/gradebook/report-cards/report-card-template.service';

const TENANT_ID = 'c0de1001-0001-4001-8001-000000000001';
const USER_ID = 'c0de1003-0003-4003-8003-000000000003';
const TEMPLATE_EN_ID = 'c0de1004-0004-4004-8004-000000000004';
const TEMPLATE_AR_ID = 'c0de1005-0005-4005-8005-000000000005';

jest.setTimeout(60_000);

describe('Report Card Templates (e2e) — impl 03', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCardTemplateService;

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_card_templates WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'::uuid`);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${TENANT_ID}'::uuid`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCardTemplateService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'Impl03 Templates Tenant',
        slug: 'impl03-templates-tenant',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: 'impl03-templates-admin@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Impl03',
        last_name: 'Admin',
        global_status: 'active',
      },
    });

    await prisma.reportCardTemplate.createMany({
      data: [
        {
          id: TEMPLATE_EN_ID,
          tenant_id: TENANT_ID,
          name: 'Grades Only',
          locale: 'en',
          is_default: true,
          content_scope: 'grades_only',
          sections_json: {},
          created_by_user_id: USER_ID,
        },
        {
          id: TEMPLATE_AR_ID,
          tenant_id: TENANT_ID,
          name: 'Grades Only',
          locale: 'ar',
          is_default: false,
          content_scope: 'grades_only',
          sections_json: {},
          created_by_user_id: USER_ID,
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  // ─── listContentScopes ───────────────────────────────────────────────────

  it('listContentScopes returns the grouped list for the tenant', async () => {
    const scopes = await service.listContentScopes(TENANT_ID);

    const gradesOnly = scopes.find((s) => s.content_scope === 'grades_only');
    expect(gradesOnly).toBeDefined();
    expect(gradesOnly?.is_available).toBe(true);
    expect(gradesOnly?.locales.map((l) => l.locale).sort()).toEqual(['ar', 'en']);
    expect(gradesOnly?.is_default).toBe(true);
  });

  it('listContentScopes marks non-grades_only entries as is_available: false with empty locales', async () => {
    const scopes = await service.listContentScopes(TENANT_ID);
    const unavailable = scopes.filter((s) => !s.is_available);

    expect(unavailable.length).toBeGreaterThan(0);
    unavailable.forEach((row) => {
      expect(row.locales).toEqual([]);
    });
  });

  // ─── resolveForGeneration ────────────────────────────────────────────────

  it('resolveForGeneration returns the English template for (grades_only, en)', async () => {
    const template = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'en',
    });

    expect(template).not.toBeNull();
    expect(template?.id).toBe(TEMPLATE_EN_ID);
  });

  it('resolveForGeneration returns the Arabic template for (grades_only, ar)', async () => {
    const template = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'ar',
    });

    expect(template).not.toBeNull();
    expect(template?.id).toBe(TEMPLATE_AR_ID);
  });

  it('resolveForGeneration returns null for a locale that has no template', async () => {
    const template = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_only',
      locale: 'fr',
    });

    expect(template).toBeNull();
  });

  it('resolveForGeneration returns null for an unavailable content scope', async () => {
    const template = await service.resolveForGeneration(TENANT_ID, {
      contentScope: 'grades_homework',
      locale: 'en',
    });

    expect(template).toBeNull();
  });
});
