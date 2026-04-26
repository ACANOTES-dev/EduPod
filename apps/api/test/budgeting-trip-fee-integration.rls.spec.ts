/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { EventBudgetScenariosService } from '../src/modules/budgeting/event-budgets/event-budget-scenarios.service';
import { EventBudgetsService } from '../src/modules/budgeting/event-budgets/event-budgets.service';
import { TripFeeIntegrationService } from '../src/modules/budgeting/trip-fee-integration/trip-fee-integration.service';
import { ClassesReadFacade } from '../src/modules/classes/classes-read.facade';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StudentReadFacade } from '../src/modules/students/student-read.facade';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the trip → fee integration
// surface. Tenant A confirms an event budget; Tenant B tries to preview /
// generate / mark-school-funded against the same id and gets 404 every
// time (the parent-event lookup fails first inside EventBudgetsService).

const TENANT_A_ID = 'fe000111-0111-4011-8011-000000000111';
const TENANT_B_ID = 'fe000222-0222-4022-8022-000000000222';
const USER_A_ID = 'fe000333-0333-4033-8033-000000000333';
const USER_B_ID = 'fe000444-0444-4044-8044-000000000444';

jest.setTimeout(60_000);

describe('budgeting trip-fee-integration — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let tripFeeService: TripFeeIntegrationService;
  let eventAId: string;

  async function cleanup(): Promise<void> {
    const tenants = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(
      `DELETE FROM household_fee_assignments WHERE tenant_id = ANY($1::uuid[])`,
      tenants,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM fee_structures WHERE tenant_id = ANY($1::uuid[])`,
      tenants,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM event_budgets WHERE tenant_id = ANY($1::uuid[])`,
      tenants,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      USER_A_ID,
      USER_B_ID,
    ]);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, tenants);
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
        name: 'RLS Trip Tenant A',
        slug: 'rls-trip-a',
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
        name: 'RLS Trip Tenant B',
        slug: 'rls-trip-b',
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
        email: 'rls-trip-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-trip-b@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'B',
        global_status: 'active',
      },
    });

    const eb = await prisma.eventBudget.create({
      data: {
        tenant_id: TENANT_A_ID,
        name: 'Tenant A — Class 2A Trip',
        event_type: 'trip',
        event_date: new Date('2026-05-12'),
        participant_count: 24,
        drivers: {
          transport: { unit_cost: 380, units: 1 },
          contingency_pct: 5,
          custom_lines: [],
        },
        status: 'confirmed',
        household_share_pct: 100,
        payment_plan: 'one_off',
        created_by: USER_A_ID,
      },
    });
    eventAId = eb.id;

    const studentFacade = new StudentReadFacade(prisma as unknown as PrismaService);
    const classesFacade = new ClassesReadFacade(prisma as unknown as PrismaService);
    const eventScenariosService = new EventBudgetScenariosService(
      prisma as unknown as PrismaService,
    );
    const eventBudgetsService = new EventBudgetsService(
      prisma as unknown as PrismaService,
      eventScenariosService,
      studentFacade,
      classesFacade,
    );

    // Stubs — we only exercise cross-tenant rejection at the event-budgets
    // lookup layer; the integration service short-circuits before touching
    // Finance, so passing minimal stubs is fine.
    const feeStructuresService = {} as never;
    const feeAssignmentsService = { bulkCreate: jest.fn() } as never;
    const permissionCacheService = {
      isOwner: jest.fn().mockResolvedValue(true),
      getPermissions: jest.fn().mockResolvedValue([]),
    } as never;

    tripFeeService = new TripFeeIntegrationService(
      prisma as unknown as PrismaService,
      eventBudgetsService,
      feeStructuresService,
      feeAssignmentsService,
      studentFacade,
      permissionCacheService,
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B previewing Tenant A's event returns 404", async () => {
    await expect(tripFeeService.previewGenerateFees(TENANT_B_ID, eventAId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("Tenant B generating fees on Tenant A's event returns 404", async () => {
    await expect(
      tripFeeService.generateFees(TENANT_B_ID, USER_B_ID, USER_B_ID, eventAId, {
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B mark-school-funded on Tenant A's event returns 404", async () => {
    await expect(
      tripFeeService.markSchoolFunded(TENANT_B_ID, USER_B_ID, USER_B_ID, eventAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity ──────────────────────────────────────────────────────────────

  it('Tenant A can preview its own event', async () => {
    const result = await tripFeeService.previewGenerateFees(TENANT_A_ID, eventAId);
    expect(result.event_budget_id).toBe(eventAId);
    expect(result.mode).toBe('cost_recovery');
  });

  it('Tenant A confirmed-status branch rejects when free trip', async () => {
    // Flip share to 0 and re-confirm preview/generate semantics.
    await prisma.eventBudget.update({
      where: { id: eventAId },
      data: { household_share_pct: 0 },
    });
    await expect(
      tripFeeService.generateFees(TENANT_A_ID, USER_A_ID, USER_A_ID, eventAId, {
        confirm: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    // Reset for next test.
    await prisma.eventBudget.update({
      where: { id: eventAId },
      data: { household_share_pct: 100 },
    });
  });
});
