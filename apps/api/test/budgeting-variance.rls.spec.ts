/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { VarianceService } from '../src/modules/budgeting/variance/variance.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the variance read surface.
// Tenant A has a model + variance cache row; Tenant B tries to read /
// refresh / write manual actuals against the same model id and gets
// 404 every time (the parent-model lookup fails first).

const TENANT_A_ID = 'fe000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'fe000002-0002-4002-8002-000000000002';
const USER_A_ID = 'fe000003-0003-4003-8003-000000000003';
const USER_B_ID = 'fe000004-0004-4004-8004-000000000004';

jest.setTimeout(60_000);

describe('budgeting variance — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let varianceService: VarianceService;
  let modelAId: string;

  async function cleanup(): Promise<void> {
    const ids = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(
      `DELETE FROM variance_cache WHERE tenant_id = ANY($1::uuid[])`,
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
        name: 'RLS Var Tenant A',
        slug: 'rls-var-a',
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
        name: 'RLS Var Tenant B',
        slug: 'rls-var-b',
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
        email: 'rls-var-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-var-b@test.local',
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
        status: 'draft',
        created_by: USER_A_ID,
      },
    });
    modelAId = model.id;

    // Tenant A has a variance row.
    await prisma.varianceCache.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: modelAId,
        snapshot_id: null,
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'operations.maintenance',
        planned: 1000,
        actual: 1100,
        variance: 100,
        variance_pct: 10,
        drivers_json: { manual: true },
        refreshed_at: new Date(),
      },
    });

    // Service wiring: the VarianceService constructor only needs prisma
    // + a queue stub. We don't exercise the queue here.
    const noopQueue = {
      add: async () => ({ id: 'job-1' }),
    };
    varianceService = new VarianceService(
      prisma as unknown as PrismaService,
      noopQueue as unknown as ConstructorParameters<typeof VarianceService>[1],
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B reading variance under Tenant A's model returns 404", async () => {
    await expect(
      varianceService.getVariance(TENANT_B_ID, modelAId, 'month'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B refresh on Tenant A's model returns 404", async () => {
    await expect(varianceService.enqueueRefresh(TENANT_B_ID, modelAId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("Tenant B writing manual actual on Tenant A's model returns 404", async () => {
    await expect(
      varianceService.upsertManualActual(TENANT_B_ID, modelAId, USER_B_ID, {
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'operations.maintenance',
        amount: 9999,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity ───────────────────────────────────────────────────────────

  it('Tenant A still sees its own variance row', async () => {
    const result = await varianceService.getVariance(TENANT_A_ID, modelAId, 'month');
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.line_item_key).toBe('operations.maintenance');
  });
});
