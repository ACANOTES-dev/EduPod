/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AcademicReadFacade } from '../src/modules/academics/academic-read.facade';
import { FinancialModelsService } from '../src/modules/budgeting/financial-models/financial-models.service';
import { ScenariosService } from '../src/modules/budgeting/scenarios/scenarios.service';
import { FinanceReadFacade } from '../src/modules/finance/finance-read.facade';
import { HouseholdReadFacade } from '../src/modules/households/household-read.facade';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StaffProfileReadFacade } from '../src/modules/staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../src/modules/students/student-read.facade';
import { TenantReadFacade } from '../src/modules/tenants/tenant-read.facade';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// End-to-end RLS test for the financial-models + scenarios services.
// Tenant A creates a model + scenario. Tenant B tries to read / write
// against the same ids and gets 404 (NOT 403 — the service treats
// "not yours" identically to "doesn't exist").

const TENANT_A_ID = 'fb000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'fb000002-0002-4002-8002-000000000002';
const USER_A_ID = 'fb000003-0003-4003-8003-000000000003';
const USER_B_ID = 'fb000004-0004-4004-8004-000000000004';

jest.setTimeout(60_000);

describe('budgeting financial-models — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let modelsService: FinancialModelsService;
  let scenariosService: ScenariosService;
  let modelAId: string;
  let scenarioAId: string;

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
        name: 'RLS FM Tenant A',
        slug: 'rls-fm-a',
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
        name: 'RLS FM Tenant B',
        slug: 'rls-fm-b',
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
        email: 'rls-fm-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-fm-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'B',
        global_status: 'active',
      },
    });

    // ── Tenant A's financial model + scenario ──────────────────────────────
    const model = await prisma.financialModel.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'Tenant A — FY 2026/27',
        fiscal_year_start: new Date('2026-09-01'),
        fiscal_year_end: new Date('2027-09-01'),
        horizon_years: 1,
        drivers: {},
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

    const scenario = await prisma.scenario.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_model_id: modelAId,
        name: 'Cautious',
        position: 0,
        driver_overrides: {},
      },
    });
    scenarioAId = scenario.id;

    // ── Service wiring (skip Nest DI; instantiate directly) ────────────────
    const noOpReadFacade = {} as never;
    modelsService = new FinancialModelsService(
      prisma as unknown as PrismaService,
      noOpReadFacade as StudentReadFacade,
      noOpReadFacade as StaffProfileReadFacade,
      noOpReadFacade as HouseholdReadFacade,
      noOpReadFacade as AcademicReadFacade,
      noOpReadFacade as FinanceReadFacade,
      noOpReadFacade as TenantReadFacade,
    );
    scenariosService = new ScenariosService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  describe('financial-models', () => {
    it('Tenant B sees an empty list when Tenant A has the only model', async () => {
      const result = await modelsService.findAll(TENANT_B_ID, {
        page: 1,
        pageSize: 20,
        order: 'desc',
      });
      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it("Tenant B fetching Tenant A's model id returns 404 (NotFoundException)", async () => {
      await expect(modelsService.findOne(TENANT_B_ID, modelAId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("Tenant B archive of Tenant A's model returns 404 (NotFoundException)", async () => {
      await expect(modelsService.archive(TENANT_B_ID, modelAId, USER_B_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('scenarios', () => {
    it("Tenant B fetching Tenant A's scenario by id returns 404", async () => {
      await expect(
        scenariosService.findOne(TENANT_B_ID, modelAId, scenarioAId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("Tenant B listing scenarios under Tenant A's model id returns 404 (parent model lookup fails first)", async () => {
      await expect(scenariosService.findAll(TENANT_B_ID, modelAId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("Tenant B creating a scenario under Tenant A's model id returns 404", async () => {
      await expect(
        scenariosService.create(TENANT_B_ID, modelAId, USER_B_ID, {
          name: 'sneaky',
          driver_overrides: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── Sanity: Tenant A still sees its own data ─────────────────────────────

  it('Tenant A still sees its own model + scenario', async () => {
    const list = await modelsService.findAll(TENANT_A_ID, {
      page: 1,
      pageSize: 20,
      order: 'desc',
    });
    expect(list.data.length).toBeGreaterThanOrEqual(1);
    const found = await modelsService.findOne(TENANT_A_ID, modelAId);
    expect(found.model.id).toBe(modelAId);
    const scenarioFetch = await scenariosService.findOne(TENANT_A_ID, modelAId, scenarioAId);
    expect(scenarioFetch.scenario.id).toBe(scenarioAId);
  });
});
