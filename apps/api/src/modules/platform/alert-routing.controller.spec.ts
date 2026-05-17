import { HttpStatus } from '@nestjs/common';

import { AlertMagicAckController } from './alert-magic-ack.controller';
import { AlertRoutingController } from './alert-routing.controller';
import { EmergencyContactController } from './emergency-contact.controller';

const USER = {
  email: 'ops@example.com',
  role: 'platform_admin',
  sub: '11111111-1111-4111-8111-111111111111',
};
const REQUEST = {
  headers: { 'user-agent': 'jest' },
  ip: '127.0.0.1',
};
const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
const POLICY_ID = '33333333-3333-4333-8333-333333333333';

function buildAlertController() {
  const routes = {
    create: jest.fn().mockResolvedValue({ id: ROUTE_ID }),
    list: jest.fn().mockResolvedValue([{ enabled: true, id: ROUTE_ID }]),
    remove: jest.fn().mockResolvedValue(undefined),
    routeHealth: jest.fn().mockResolvedValue([{ id: 'check-1' }]),
    test: jest.fn().mockResolvedValue({ message: 'sent', success: true }),
    update: jest.fn().mockResolvedValue({ id: ROUTE_ID }),
  };
  const policies = {
    create: jest.fn().mockResolvedValue({ id: POLICY_ID }),
    list: jest.fn().mockResolvedValue([{ id: POLICY_ID }]),
    remove: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue({ id: POLICY_ID }),
  };
  const rateLimit = {
    assertCanTestAll: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new AlertRoutingController(routes as never, policies as never, rateLimit as never),
    policies,
    rateLimit,
    routes,
  };
}

describe('AlertRoutingController', () => {
  afterEach(() => jest.clearAllMocks());

  it('delegates route CRUD and route health actions with audit context', async () => {
    const { controller, routes } = buildAlertController();
    const dto = {
      channel_id: ROUTE_ID,
      display_name: 'Primary ops',
      health_check_destination: { email: 'sink@example.com' },
      operator_destination: { email: 'ops@example.com' },
      urgency_tier: 'urgent' as const,
    };

    await expect(controller.listRoutes()).resolves.toEqual([{ enabled: true, id: ROUTE_ID }]);
    await expect(controller.createRoute(dto, USER as never, REQUEST as never)).resolves.toEqual({
      id: ROUTE_ID,
    });
    await expect(
      controller.updateRoute(ROUTE_ID, { enabled: false }, USER as never, REQUEST as never),
    ).resolves.toEqual({ id: ROUTE_ID });
    await expect(controller.deleteRoute(ROUTE_ID, USER as never, REQUEST as never)).resolves.toBe(
      undefined,
    );
    await expect(controller.routeHealth()).resolves.toEqual([{ id: 'check-1' }]);

    expect(routes.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(routes.update).toHaveBeenCalledWith(
      ROUTE_ID,
      { enabled: false },
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(routes.remove).toHaveBeenCalledWith(
      ROUTE_ID,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
  });

  it('rate-limits test-all and only tests enabled routes', async () => {
    const { controller, rateLimit, routes } = buildAlertController();
    routes.list.mockResolvedValueOnce([
      { enabled: true, id: ROUTE_ID },
      { enabled: false, id: 'disabled-route' },
    ]);

    await expect(
      controller.testRoute(ROUTE_ID, { comment: 'manual' }, USER as never, REQUEST as never),
    ).resolves.toEqual({
      message: 'sent',
      success: true,
    });
    await expect(controller.testAll(USER as never, REQUEST as never)).resolves.toEqual({
      results: [{ message: 'sent', success: true }],
    });

    expect(routes.test).toHaveBeenCalledWith(
      ROUTE_ID,
      USER.sub,
      { comment: 'manual' },
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(rateLimit.assertCanTestAll).toHaveBeenCalledWith(
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(routes.test).toHaveBeenLastCalledWith(ROUTE_ID, USER.sub, {}, undefined);
  });

  it('delegates escalation policy CRUD with audit context', async () => {
    const { controller, policies } = buildAlertController();
    const dto = {
      enabled: true,
      name: 'Urgent policy',
      severity: 'warning' as const,
      steps: [{ ack_window_minutes: 10, route_id: ROUTE_ID }],
    };

    await expect(controller.listPolicies()).resolves.toEqual([{ id: POLICY_ID }]);
    await expect(controller.createPolicy(dto, USER as never, REQUEST as never)).resolves.toEqual({
      id: POLICY_ID,
    });
    await expect(
      controller.updatePolicy(POLICY_ID, { enabled: false }, USER as never, REQUEST as never),
    ).resolves.toEqual({ id: POLICY_ID });
    await expect(controller.deletePolicy(POLICY_ID, USER as never, REQUEST as never)).resolves.toBe(
      undefined,
    );

    expect(policies.create).toHaveBeenCalledWith(
      dto,
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(policies.update).toHaveBeenCalledWith(
      POLICY_ID,
      { enabled: false },
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(policies.remove).toHaveBeenCalledWith(
      POLICY_ID,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
  });
});

describe('AlertMagicAckController', () => {
  it('acknowledges a magic token and renders a minimal confirmation page', async () => {
    const routing = { acknowledgeMagicToken: jest.fn().mockResolvedValue(undefined) };
    const status = jest.fn().mockReturnThis();
    const send = jest.fn().mockReturnThis();
    const controller = new AlertMagicAckController(routing as never);

    await controller.acknowledge('signed-token', { send, status } as never);

    expect(routing.acknowledgeMagicToken).toHaveBeenCalledWith('signed-token');
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(send).toHaveBeenCalledWith(expect.stringContaining('Alert acknowledged'));
  });
});

describe('EmergencyContactController', () => {
  it('delegates current-user emergency contact reads and updates', async () => {
    const contacts = {
      getMe: jest.fn().mockResolvedValue({ display_name: 'Ops Lead' }),
      updateMe: jest.fn().mockResolvedValue({ display_name: 'Ops Lead' }),
    };
    const controller = new EmergencyContactController(contacts as never);
    const dto = { display_name: 'Ops Lead', email: 'ops@example.com' };

    await expect(controller.getMe(USER as never)).resolves.toEqual({ display_name: 'Ops Lead' });
    await expect(controller.updateMe(dto, USER as never, REQUEST as never)).resolves.toEqual({
      display_name: 'Ops Lead',
    });

    expect(contacts.getMe).toHaveBeenCalledWith(USER.sub);
    expect(contacts.updateMe).toHaveBeenCalledWith(
      USER.sub,
      dto,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
  });
});
