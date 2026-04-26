/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ShareableLinksService } from '../src/modules/budgeting/shareable-links/shareable-links.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the shareable-links surface.
// Tenant A publishes a snapshot and issues a link; Tenant B tries to
// list / revoke that link by ID and gets 404 every time. The public
// resolver is exercised separately at the unit level (mocked Prisma)
// — at the integration level we focus on the authenticated paths
// since the open route deliberately bypasses tenant context.

const TENANT_A_ID = 'fc000001-0001-4001-8001-000000000111';
const TENANT_B_ID = 'fc000002-0002-4002-8002-000000000222';
const USER_A_ID = 'fc000003-0003-4003-8003-000000000333';
const USER_B_ID = 'fc000004-0004-4004-8004-000000000444';

jest.setTimeout(60_000);

describe('budgeting shareable-links — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let service: ShareableLinksService;
  let modelAId: string;
  let snapshotAId: string;
  let linkAId: string;

  async function cleanup(): Promise<void> {
    const ids = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(
      `DELETE FROM shareable_links WHERE tenant_id = ANY($1::uuid[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_model_snapshots WHERE tenant_id = ANY($1::uuid[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_models WHERE tenant_id = ANY($1::uuid[])`,
      ids,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      USER_A_ID,
      USER_B_ID,
    ]);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, ids);
  }

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    await prisma.$connect();
    await cleanup();

    await prisma.tenant.create({
      data: {
        id: TENANT_A_ID,
        name: 'RLS Share Tenant A',
        slug: 'rls-share-a',
        default_locale: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        currency_code: 'USD',
        academic_year_start_month: 9,
        status: 'active',
      },
    });
    await prisma.tenant.create({
      data: {
        id: TENANT_B_ID,
        name: 'RLS Share Tenant B',
        slug: 'rls-share-b',
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
        id: USER_A_ID,
        email: 'rls-share-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-share-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'B',
        global_status: 'active',
      },
    });

    const model = await prisma.financialModel.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'Tenant A — FY 2026/27',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-09-01'),
        horizon_years: 1,
        drivers: {
          enrollment_growth_pct_by_year_group: {},
          fee_uplift_pct_by_year_group: {},
          staff_headcount_delta_by_department: {},
          salary_uplift_pct: 0,
          discount_capture_pct: 0,
          scholarship_capture_pct: 0,
          utilities_inflation_pct: 0,
          materials_inflation_pct: 0,
          capex_items: [],
          donations_forecast: 0,
          grants_forecast: 0,
          custom: {},
        },
        source_snapshot_json: {
          captured_at: '2026-04-26T00:00:00.000Z',
          tenant_id: TENANT_A_ID,
          fiscal_year_start: '2026-09-01',
          fiscal_year_end: '2027-09-01',
          currency_code: 'USD',
          total_active_students: 0,
          total_active_households: 0,
          students_by_year_group: [],
          fees_by_year_group: [],
          staff_by_department: [],
        },
        status: 'published',
        created_by: USER_A_ID,
      },
    });
    modelAId = model.id;

    const snapshot = await prisma.financialModelSnapshot.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: modelAId,
        version_number: 1,
        payload: {
          schema_version: 1,
          model: { id: modelAId, name: 'Tenant A — FY 2026/27' },
          scenarios: [],
          base_case: { line_items: [], totals_by_year: [], per_pupil_unit_economics: [] },
          source_snapshot: {
            captured_at: '2026-04-26T00:00:00.000Z',
            tenant_id: TENANT_A_ID,
            fiscal_year_start: '2026-09-01',
            fiscal_year_end: '2027-09-01',
            currency_code: 'USD',
            total_active_students: 0,
            total_active_households: 0,
            students_by_year_group: [],
            fees_by_year_group: [],
            staff_by_department: [],
          },
          executive_summary: 'Initial publish',
          published_at: '2026-04-26T00:00:00.000Z',
          published_by: { user_id: USER_A_ID, name: 'RLS A' },
        },
        executive_summary: 'Initial publish',
        published_by: USER_A_ID,
      },
    });
    snapshotAId = snapshot.id;

    service = new ShareableLinksService(prisma as unknown as PrismaService);

    // Issue a link as Tenant A so Tenant B has something to try to fetch.
    const created = await service.create(TENANT_A_ID, USER_A_ID, modelAId, snapshotAId, {
      expires_in_days: 30,
      scenarios_visible: ['base'],
    });
    linkAId = created.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B listing links on Tenant A's snapshot returns 404", async () => {
    await expect(
      service.listForSnapshot(TENANT_B_ID, modelAId, snapshotAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B creating a link on Tenant A's snapshot returns 404", async () => {
    await expect(
      service.create(TENANT_B_ID, USER_B_ID, modelAId, snapshotAId, {
        expires_in_days: 7,
        scenarios_visible: ['base'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B revoking Tenant A's link returns 404", async () => {
    await expect(
      service.revoke(TENANT_B_ID, USER_B_ID, modelAId, snapshotAId, linkAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity: Tenant A's own access still works ──────────────────────────

  it('Tenant A can list its own links', async () => {
    const out = await service.listForSnapshot(TENANT_A_ID, modelAId, snapshotAId);
    expect(out.data.length).toBeGreaterThanOrEqual(1);
    expect(out.data[0]!.id).toBe(linkAId);
  });

  it('Tenant A revoke is idempotent', async () => {
    await service.revoke(TENANT_A_ID, USER_A_ID, modelAId, snapshotAId, linkAId);
    // Second call must not throw — already revoked.
    await service.revoke(TENANT_A_ID, USER_A_ID, modelAId, snapshotAId, linkAId);
  });
});
