/* eslint-disable school/no-raw-sql-outside-rls -- RLS integration tests require direct SQL for setup/teardown */
import './setup-env';

import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { EventBudgetScenariosService } from '../src/modules/budgeting/event-budgets/event-budget-scenarios.service';
import { EventBudgetsService } from '../src/modules/budgeting/event-budgets/event-budgets.service';
import { ClassesReadFacade } from '../src/modules/classes/classes-read.facade';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { StudentReadFacade } from '../src/modules/students/student-read.facade';

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// Service-layer cross-tenant isolation for the event-budgets surface.
// Tenant A has an event budget + a scenario; Tenant B tries to read /
// update / cancel / list scenarios against the same id and gets 404
// every time (the parent lookup fails first).

const TENANT_A_ID = 'fe000011-0011-4011-8011-000000000011';
const TENANT_B_ID = 'fe000022-0022-4022-8022-000000000022';
const USER_A_ID = 'fe000033-0033-4033-8033-000000000033';
const USER_B_ID = 'fe000044-0044-4044-8044-000000000044';

jest.setTimeout(60_000);

describe('budgeting event-budgets — service-layer cross-tenant isolation', () => {
  let prisma: PrismaClient;
  let eventBudgetsService: EventBudgetsService;
  let scenariosService: EventBudgetScenariosService;
  let eventAId: string;
  let scenarioAId: string;

  async function cleanup(): Promise<void> {
    const tenants = [TENANT_A_ID, TENANT_B_ID];
    await prisma.$executeRawUnsafe(
      `DELETE FROM event_budget_scenarios WHERE tenant_id = ANY($1::uuid[])`,
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
        name: 'RLS EB Tenant A',
        slug: 'rls-eb-a',
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
        name: 'RLS EB Tenant B',
        slug: 'rls-eb-b',
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
        email: 'rls-eb-a@test.local',
        password_hash: '$2a$10$placeholder',
        first_name: 'RLS',
        last_name: 'A',
        global_status: 'active',
      },
    });
    await prisma.user.create({
      data: {
        id: USER_B_ID,
        email: 'rls-eb-b@test.local',
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
          entry_tickets: { per_student_cost: 12, count: 24 },
          food: { per_person_cost: 8, count: 24 },
          contingency_pct: 5,
          custom_lines: [],
        },
        status: 'draft',
        household_share_pct: 100,
        payment_plan: 'one_off',
        created_by: USER_A_ID,
      },
    });
    eventAId = eb.id;

    const scenario = await prisma.eventBudgetScenario.create({
      data: {
        tenant_id: TENANT_A_ID,
        parent_event_budget_id: eventAId,
        name: 'Cheaper transport',
        position: 0,
        driver_overrides: { transport: { unit_cost: 250, units: 1 } },
      },
    });
    scenarioAId = scenario.id;

    const studentFacade = new StudentReadFacade(prisma as unknown as PrismaService);
    const classesFacade = new ClassesReadFacade(prisma as unknown as PrismaService);
    eventBudgetsService = new EventBudgetsService(
      prisma as unknown as PrismaService,
      new EventBudgetScenariosService(prisma as unknown as PrismaService),
      studentFacade,
      classesFacade,
    );
    scenariosService = new EventBudgetScenariosService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // ─── Tests ─────────────────────────────────────────────────────────────────

  it("Tenant B reading Tenant A's event budget returns 404", async () => {
    await expect(eventBudgetsService.findOne(TENANT_B_ID, eventAId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("Tenant B updating Tenant A's event budget returns 404", async () => {
    await expect(
      eventBudgetsService.update(TENANT_B_ID, USER_B_ID, eventAId, { name: 'pwned' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B confirming Tenant A's event budget returns 404", async () => {
    await expect(
      eventBudgetsService.confirm(TENANT_B_ID, USER_B_ID, eventAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B cancelling Tenant A's event budget returns 404", async () => {
    await expect(
      eventBudgetsService.cancel(TENANT_B_ID, USER_B_ID, eventAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B listing scenarios on Tenant A's event budget returns 404", async () => {
    await expect(scenariosService.findAll(TENANT_B_ID, eventAId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("Tenant B reading Tenant A's scenario returns 404", async () => {
    await expect(
      scenariosService.findOne(TENANT_B_ID, eventAId, scenarioAId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("Tenant B creating a scenario on Tenant A's event budget returns 404", async () => {
    await expect(
      scenariosService.create(TENANT_B_ID, USER_B_ID, eventAId, { name: 'pwned' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ─── Sanity: Tenant A still works ──────────────────────────────────────────

  it('Tenant A still sees its own event budget with engine output', async () => {
    const result = await eventBudgetsService.findOne(TENANT_A_ID, eventAId);
    expect(result.name).toBe('Tenant A — Class 2A Trip');
    expect(result.output.total_cost).toBeGreaterThan(0);
    expect(result.scenarios).toHaveLength(1);
  });
});
