/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { LineItemsService } from '../src/modules/budgeting/line-items/line-items.service';
import { ScenariosService } from '../src/modules/budgeting/scenarios/scenarios.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the line-items mutation surface.
// Tenant A creates a model + custom line. Tenant B tries to mutate them —
// every call must throw NotFoundException (404), never leak Tenant A's row.

const TENANT_A_ID = 'fc000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'fc000002-0002-4002-8002-000000000002';
const USER_A_ID = 'fc000003-0003-4003-8003-000000000003';
const USER_B_ID = 'fc000004-0004-4004-8004-000000000004';

jest.setTimeout(60_000);

describe('budgeting line-items — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let scenariosService: ScenariosService;
  let lineItemsService: LineItemsService;
  let modelAId: string;
  let customLineAId: string;
  let derivedLineAId: string;

  async function cleanup(): Promise<void> {
    const ids = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(`DELETE FROM scenarios WHERE tenant_id = ANY($1::uuid[])`, ids);
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_model_line_items WHERE tenant_id = ANY($1::uuid[])`,
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

    // ── Tenants + users ────────────────────────────────────────────────────
    await prisma.tenant.create({
      data: {
        id: TENANT_A_ID,
        name: 'RLS LI Tenant A',
        slug: 'rls-li-a',
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
        name: 'RLS LI Tenant B',
        slug: 'rls-li-b',
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
        email: 'rls-li-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-li-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'B',
        global_status: 'active',
      },
    });

    // ── Tenant A's financial model ──────────────────────────────────────────
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

    // ── Tenant A's custom + derived line items ──────────────────────────────
    const customLine = await prisma.financialModelLineItem.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: modelAId,
        scenario_id: null,
        category: 'operations',
        subcategory: 'maintenance',
        name: 'Roof repairs',
        fiscal_year: 1,
        source: 'custom',
        amount: 12_000,
        is_locked: false,
      },
    });
    customLineAId = customLine.id;

    const derivedLine = await prisma.financialModelLineItem.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: modelAId,
        scenario_id: null,
        category: 'income',
        subcategory: 'donations',
        name: 'Donations forecast',
        fiscal_year: 1,
        source: 'driver_derived',
        amount: 0,
        is_locked: false,
      },
    });
    derivedLineAId = derivedLine.id;

    // ── Service wiring ────────────────────────────────────────────────────
    scenariosService = new ScenariosService(prisma as unknown as PrismaService);
    lineItemsService = new LineItemsService(prisma as unknown as PrismaService, scenariosService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B creating a custom line under Tenant A's model returns 404", async () => {
    await expect(
      lineItemsService.createCustom(TENANT_B_ID, modelAId, USER_B_ID, {
        category: 'operations',
        subcategory: 'maintenance',
        name: 'sneaky',
        fiscal_year: 1,
        amount: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B updating Tenant A's line returns 404", async () => {
    await expect(
      lineItemsService.update(TENANT_B_ID, modelAId, customLineAId, USER_B_ID, {
        amount: 1,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B deleting Tenant A's line returns 404", async () => {
    await expect(
      lineItemsService.delete(TENANT_B_ID, modelAId, customLineAId, USER_B_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B resetting Tenant A's override returns 404", async () => {
    await expect(
      lineItemsService.resetToDerived(TENANT_B_ID, modelAId, customLineAId, USER_B_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity: Tenant A's contract still works ─────────────────────────────

  it('Tenant A can mutate its own custom line', async () => {
    const updated = await lineItemsService.update(TENANT_A_ID, modelAId, customLineAId, USER_A_ID, {
      amount: 14_000,
    });
    expect(updated.amount).toBe(14_000);
    // Custom rows stay 'custom'.
    expect(updated.source).toBe('custom');
  });

  it('Tenant A cannot delete a driver_derived line on its own model', async () => {
    await expect(
      lineItemsService.delete(TENANT_A_ID, modelAId, derivedLineAId, USER_A_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
