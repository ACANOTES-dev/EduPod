/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { ScenariosService } from '../src/modules/budgeting/scenarios/scenarios.service';
import { SnapshotsService } from '../src/modules/budgeting/snapshots/snapshots.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { S3Service } from '../src/modules/s3/s3.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the snapshots surface.
// Tenant A publishes a snapshot; Tenant B tries to read / publish /
// restore it and gets 404 every time.

const TENANT_A_ID = 'fd000001-0001-4001-8001-000000000001';
const TENANT_B_ID = 'fd000002-0002-4002-8002-000000000002';
const USER_A_ID = 'fd000003-0003-4003-8003-000000000003';
const USER_B_ID = 'fd000004-0004-4004-8004-000000000004';

jest.setTimeout(60_000);

describe('budgeting snapshots — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let snapshotsService: SnapshotsService;
  let modelAId: string;
  let snapshotAId: string;

  async function cleanup(): Promise<void> {
    const ids = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(
      `DELETE FROM financial_model_snapshots WHERE tenant_id = ANY($1::uuid[])`,
      ids,
    );
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

    // Tenants + users
    await prisma.tenant.create({
      data: {
        id: TENANT_A_ID,
        name: 'RLS Snap Tenant A',
        slug: 'rls-snap-a',
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
        name: 'RLS Snap Tenant B',
        slug: 'rls-snap-b',
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
        email: 'rls-snap-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-snap-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'B',
        global_status: 'active',
      },
    });

    // Tenant A's model + minimal published snapshot.
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
          model: {
            id: modelAId,
            name: 'Tenant A — FY 2026/27',
            description: null,
            fiscal_year_start: '2026-09-01',
            fiscal_year_end: '2027-09-01',
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
          },
          scenarios: [],
          base_case: {
            line_items: [],
            totals_by_year: [{ fiscal_year: 1, revenue: 0, expenditure: 0, net_result: 0 }],
            per_pupil_unit_economics: [
              {
                fiscal_year: 1,
                revenue_per_student: 0,
                expenditure_per_student: 0,
                net_per_student: 0,
                revenue_per_household: 0,
                breakeven_students: null,
              },
            ],
          },
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
    await prisma.financialModel.update({
      where: { id: modelAId },
      data: { current_snapshot_id: snapshotAId },
    });

    // Service wiring (skip Nest DI; instantiate directly).
    const scenariosService = new ScenariosService(prisma as unknown as PrismaService);
    const noopS3: Pick<S3Service, 'getPresignedUrl'> = {
      getPresignedUrl: async () => 'https://noop',
    };
    const noopQueue = {
      add: async () => ({ id: 'job-1' }),
    };
    snapshotsService = new SnapshotsService(
      prisma as unknown as PrismaService,
      scenariosService,
      noopS3 as S3Service,
      noopQueue as unknown as ConstructorParameters<typeof SnapshotsService>[3],
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B listing snapshots under Tenant A's model returns 404", async () => {
    await expect(
      snapshotsService.findAll(TENANT_B_ID, modelAId, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B fetching Tenant A's snapshot by id returns 404", async () => {
    await expect(
      snapshotsService.findOne(TENANT_B_ID, modelAId, snapshotAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B publishing under Tenant A's model returns 404", async () => {
    await expect(
      snapshotsService.publish(TENANT_B_ID, USER_B_ID, modelAId, {
        executive_summary: 'sneaky',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B restoring Tenant A's snapshot returns 404", async () => {
    await expect(
      snapshotsService.restore(TENANT_B_ID, USER_B_ID, modelAId, snapshotAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity ───────────────────────────────────────────────────────────

  it('Tenant A still sees its own snapshot', async () => {
    const list = await snapshotsService.findAll(TENANT_A_ID, modelAId, {
      page: 1,
      pageSize: 20,
    });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]!.id).toBe(snapshotAId);
  });
});
