import type { JwtPayload, TenantContext } from '@school/shared';

import { EventBudgetScenariosService } from './event-budget-scenarios.service';
import { EventBudgetsController } from './event-budgets.controller';
import { EventBudgetsService } from './event-budgets.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const SCENARIO_ID = '55555555-5555-5555-8555-555555555555';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'UTC',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  type: 'access',
  tenant_id: TENANT_ID,
} as unknown as JwtPayload;

/**
 * Direct instantiation rather than Test.createTestingModule because the
 * controller's @UseGuards triggers DI resolution for AuthGuard's deps.
 */
describe('EventBudgetsController', () => {
  let controller: EventBudgetsController;
  let events: jest.Mocked<EventBudgetsService>;
  let scenarios: jest.Mocked<EventBudgetScenariosService>;

  beforeEach(() => {
    events = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: EVENT_ID, status: 'draft' }),
      create: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      update: jest.fn().mockResolvedValue({ id: EVENT_ID, name: 'updated' }),
      confirm: jest.fn().mockResolvedValue({ id: EVENT_ID, status: 'confirmed' }),
      cancel: jest.fn().mockResolvedValue({ id: EVENT_ID, status: 'cancelled' }),
      complete: jest.fn().mockResolvedValue({ id: EVENT_ID, status: 'completed' }),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
    } as unknown as jest.Mocked<EventBudgetsService>;
    scenarios = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: SCENARIO_ID, name: 'Group rate' }),
      create: jest.fn().mockResolvedValue({ id: SCENARIO_ID }),
      update: jest.fn().mockResolvedValue({ id: SCENARIO_ID, name: 'updated' }),
      remove: jest.fn().mockResolvedValue({ deleted: true }),
    } as unknown as jest.Mocked<EventBudgetScenariosService>;

    controller = new EventBudgetsController(events, scenarios);
  });

  describe('event endpoints', () => {
    it('GET / delegates to EventBudgetsService.findAll', async () => {
      const query = { page: 1, pageSize: 20 } as Parameters<EventBudgetsController['findAll']>[1];
      await controller.findAll(TENANT, query);
      expect(events.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    });

    it('GET /:id delegates to EventBudgetsService.findOne', async () => {
      await controller.findOne(TENANT, EVENT_ID);
      expect(events.findOne).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
    });

    it('POST / delegates to EventBudgetsService.create with tenant + user + dto', async () => {
      const dto = {
        name: 'Smoke trip',
        event_type: 'trip' as const,
        event_date: '2026-12-01',
        participant_count: 20,
        household_share_pct: 100,
        payment_plan: 'one_off' as const,
        contingency_pct: 5,
      };
      await controller.create(TENANT, USER, dto);
      expect(events.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });

    it('PATCH /:id delegates to EventBudgetsService.update with tenant + user + id + dto', async () => {
      const dto = { name: 'updated' };
      await controller.update(TENANT, USER, EVENT_ID, dto);
      expect(events.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID, dto);
    });

    it('POST /:id/confirm transitions through EventBudgetsService.confirm', async () => {
      const result = await controller.confirm(TENANT, USER, EVENT_ID);
      expect(events.confirm).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID);
      expect(result.status).toBe('confirmed');
    });

    it('POST /:id/cancel transitions through EventBudgetsService.cancel', async () => {
      const result = await controller.cancel(TENANT, USER, EVENT_ID);
      expect(events.cancel).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID);
      expect(result.status).toBe('cancelled');
    });

    it('POST /:id/complete transitions through EventBudgetsService.complete', async () => {
      const result = await controller.complete(TENANT, USER, EVENT_ID);
      expect(events.complete).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID);
      expect(result.status).toBe('completed');
    });

    it('DELETE /:id delegates to EventBudgetsService.remove (drafts only)', async () => {
      await controller.remove(TENANT, USER, EVENT_ID);
      expect(events.remove).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID);
    });
  });

  describe('scenario endpoints', () => {
    it('GET /:id/scenarios delegates to EventBudgetScenariosService.findAll', async () => {
      await controller.listScenarios(TENANT, EVENT_ID);
      expect(scenarios.findAll).toHaveBeenCalledWith(TENANT_ID, EVENT_ID);
    });

    it('GET /:id/scenarios/:sid delegates to EventBudgetScenariosService.findOne', async () => {
      await controller.findScenario(TENANT, EVENT_ID, SCENARIO_ID);
      expect(scenarios.findOne).toHaveBeenCalledWith(TENANT_ID, EVENT_ID, SCENARIO_ID);
    });

    it('POST /:id/scenarios delegates to EventBudgetScenariosService.create', async () => {
      const dto = {
        name: 'Group rate',
        driver_overrides: {},
      };
      await controller.createScenario(TENANT, USER, EVENT_ID, dto);
      expect(scenarios.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID, dto);
    });

    it('PATCH /:id/scenarios/:sid delegates to EventBudgetScenariosService.update', async () => {
      const dto = { name: 'updated' };
      await controller.updateScenario(TENANT, USER, EVENT_ID, SCENARIO_ID, dto);
      expect(scenarios.update).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID, SCENARIO_ID, dto);
    });

    it('DELETE /:id/scenarios/:sid delegates to EventBudgetScenariosService.remove', async () => {
      await controller.removeScenario(TENANT, USER, EVENT_ID, SCENARIO_ID);
      expect(scenarios.remove).toHaveBeenCalledWith(TENANT_ID, USER_ID, EVENT_ID, SCENARIO_ID);
    });
  });
});
