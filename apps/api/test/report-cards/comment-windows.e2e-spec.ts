/* eslint-disable school/no-raw-sql-outside-rls -- integration tests require direct SQL for setup/teardown */
/**
 * E2E tests for the comment-window subsystem.
 *
 * Boots the full Nest AppModule so we exercise the real DI graph and real
 * PostgreSQL, then drives the service layer directly. The RLS leakage test
 * for `report_comment_windows` lives alongside impl 01's
 * `rls-leakage.e2e-spec.ts`; this suite focuses on the behavioural
 * guarantees introduced by impl 02.
 */
import '../setup-env';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { ReportCommentWindowsService } from '../../src/modules/gradebook/report-cards/report-comment-windows.service';

const TENANT_ID = 'cafe0001-0001-4001-8001-000000000001';
const USER_ID = 'cafe0003-0003-4003-8003-000000000003';
const YEAR_ID = 'cafe0004-0004-4004-8004-000000000004';
const PERIOD_ID = 'cafe0005-0005-4005-8005-000000000005';
const PERIOD_B_ID = 'cafe0006-0006-4006-8006-000000000006';

jest.setTimeout(60_000);

describe('Comment Windows (e2e) — impl 02', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: ReportCommentWindowsService;

  async function cleanup() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM report_comment_windows WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_periods WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM academic_years WHERE tenant_id = '${TENANT_ID}'::uuid`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = '${USER_ID}'::uuid`);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = '${TENANT_ID}'::uuid`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    service = app.get(ReportCommentWindowsService);

    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_ID,
        name: 'Impl02 Windows Tenant',
        slug: 'impl02-windows-tenant',
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
        email: 'impl02-windows-admin@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'Impl02',
        last_name: 'Admin',
        global_status: 'active',
      },
    });
    await prisma.academicYear.create({
      data: {
        id: YEAR_ID,
        tenant_id: TENANT_ID,
        name: '2025-2026',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2026-06-30'),
        status: 'active',
      },
    });
    await prisma.academicPeriod.create({
      data: {
        id: PERIOD_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        name: 'Term 1',
        period_type: 'term',
        start_date: new Date('2025-09-01'),
        end_date: new Date('2025-12-20'),
        status: 'active',
      },
    });
    await prisma.academicPeriod.create({
      data: {
        id: PERIOD_B_ID,
        tenant_id: TENANT_ID,
        academic_year_id: YEAR_ID,
        name: 'Term 2',
        period_type: 'term',
        start_date: new Date('2026-01-08'),
        end_date: new Date('2026-03-30'),
        status: 'active',
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    await prisma.reportCommentWindow.deleteMany({ where: { tenant_id: TENANT_ID } });
  });

  it('opens a window in "open" state when opens_at is in the past', async () => {
    const row = await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
      instructions: 'test',
    });
    expect(row.status).toBe('open');
    expect(row.opened_by_user_id).toBe(USER_ID);
  });

  it('opens a window in "scheduled" state when opens_at is in the future', async () => {
    const row = await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2099-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-02-01T00:00:00Z').toISOString(),
    });
    expect(row.status).toBe('scheduled');
  });

  it('rejects opening a second window while one is already open', async () => {
    await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });
    await expect(
      service.open(TENANT_ID, USER_ID, {
        academic_period_id: PERIOD_B_ID,
        opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
        closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_WINDOW_ALREADY_OPEN' } });
  });

  it('close now, extend, and reopen transitions work', async () => {
    const opened = await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });

    const extended = await service.extend(
      TENANT_ID,
      USER_ID,
      opened.id,
      new Date('2099-06-01T00:00:00Z'),
    );
    expect(extended.closes_at.getTime()).toBe(new Date('2099-06-01T00:00:00Z').getTime());

    const closed = await service.closeNow(TENANT_ID, USER_ID, opened.id);
    expect(closed.status).toBe('closed');
    expect(closed.closed_by_user_id).toBe(USER_ID);

    const reopened = await service.reopen(TENANT_ID, USER_ID, opened.id);
    expect(reopened.status).toBe('open');
    expect(reopened.closed_at).toBeNull();
  });

  it('assertWindowOpenForPeriod throws COMMENT_WINDOW_CLOSED when no window exists', async () => {
    await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).rejects.toMatchObject({
      response: { code: 'COMMENT_WINDOW_CLOSED' },
    });
  });

  it('assertWindowOpenForPeriod resolves when an open window exists for the period', async () => {
    await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });
    await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).resolves.toBeUndefined();
  });

  it('assertWindowOpenForPeriod throws when the period does not match the open window', async () => {
    await service.open(TENANT_ID, USER_ID, {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2020-01-01T00:00:00Z').toISOString(),
      closes_at: new Date('2099-01-01T00:00:00Z').toISOString(),
    });
    await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_B_ID)).rejects.toMatchObject({
      response: { code: 'COMMENT_WINDOW_CLOSED' },
    });
  });
});
