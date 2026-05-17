import { readFileSync } from 'fs';
import { join } from 'path';

import { AlertRouteDeadManCronService } from './alert-route-dead-man-cron.service';

const ROUTE_ID = '11111111-1111-1111-1111-111111111111';

function buildRoute(operatorDestination: unknown, healthCheckDestination: unknown) {
  return {
    channel: {
      config: { recipients: ['sink@example.test'] },
      is_enabled: true,
      type: 'email',
    },
    channel_id: '22222222-2222-2222-2222-222222222222',
    dead_man_interval_minutes: 15,
    enabled: true,
    health_check_destination: healthCheckDestination,
    id: ROUTE_ID,
    last_health_check_at: null,
    operator_destination: operatorDestination,
  };
}

describe('AlertRouteDeadManCronService', () => {
  it('runs checks only for due enabled routes', async () => {
    const dueRoute = buildRoute({ email: 'ops@example.test' }, { email: 'sink@example.test' });
    const freshRoute = {
      ...buildRoute({ email: 'ops-2@example.test' }, { email: 'sink-2@example.test' }),
      id: '33333333-3333-3333-3333-333333333333',
      last_health_check_at: new Date('2026-05-17T11:55:00.000Z'),
    };
    const prisma = {
      platformAlertRoute: {
        findMany: jest.fn().mockResolvedValue([dueRoute, freshRoute]),
      },
    };
    const service = new AlertRouteDeadManCronService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runRouteCheck = jest.spyOn(service, 'runRouteCheck').mockResolvedValue(undefined);

    await service.tick(new Date('2026-05-17T12:00:00.000Z'));

    expect(runRouteCheck).toHaveBeenCalledTimes(1);
    expect(runRouteCheck).toHaveBeenCalledWith(ROUTE_ID);
  });

  it('uses the sink destination and records failure when sink equals operator destination', async () => {
    const destination = { email: 'operator@example.test' };
    const prisma = {
      platformAlertChannel: { update: jest.fn().mockResolvedValue({}) },
      platformAlertRoute: {
        findUnique: jest.fn().mockResolvedValue(buildRoute(destination, destination)),
        update: jest.fn().mockResolvedValue({}),
      },
      platformAlertRouteHealthCheck: {
        create: jest.fn().mockResolvedValue({ id: 'check-1', ran_at: new Date() }),
      },
    };
    const dispatch = { sendSyntheticAlert: jest.fn() };
    const routes = {
      routeToDispatchChannel: jest.fn(),
    };
    const routing = { emitRouteHealthFailure: jest.fn().mockResolvedValue(undefined) };
    const service = new AlertRouteDeadManCronService(
      prisma as never,
      dispatch as never,
      routes as never,
      routing as never,
    );

    await service.runRouteCheck(ROUTE_ID);

    expect(dispatch.sendSyntheticAlert).not.toHaveBeenCalled();
    expect(prisma.platformAlertRouteHealthCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failure_detail: { message: 'sink_destination_equals_operator' },
          success: false,
        }),
      }),
    );
    expect(routing.emitRouteHealthFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_ID }),
    );
  });

  it('records successful dead-man checks without emitting route-health failures', async () => {
    const route = buildRoute({ email: 'operator@example.test' }, { email: 'sink@example.test' });
    const prisma = {
      platformAlertChannel: { update: jest.fn().mockResolvedValue({}) },
      platformAlertRoute: {
        findUnique: jest.fn().mockResolvedValue(route),
        update: jest.fn().mockResolvedValue({}),
      },
      platformAlertRouteHealthCheck: {
        create: jest.fn().mockResolvedValue({
          id: 'check-ok',
          ran_at: new Date('2026-05-17T12:00:00.000Z'),
        }),
      },
    };
    const dispatch = {
      sendSyntheticAlert: jest.fn().mockResolvedValue({ message: 'sent', success: true }),
    };
    const routes = {
      routeToDispatchChannel: jest.fn().mockReturnValue({ id: ROUTE_ID, type: 'email' }),
    };
    const routing = { emitRouteHealthFailure: jest.fn() };
    const service = new AlertRouteDeadManCronService(
      prisma as never,
      dispatch as never,
      routes as never,
      routing as never,
    );

    await service.runRouteCheck(ROUTE_ID);

    expect(routes.routeToDispatchChannel).toHaveBeenCalledWith(route, 'health_check');
    expect(dispatch.sendSyntheticAlert).toHaveBeenCalledWith(
      { id: ROUTE_ID, type: 'email' },
      expect.objectContaining({
        is_dead_man_check: true,
        is_test: true,
        message: '[SYNTHETIC TEST] Synthetic monitoring ping - discard.',
      }),
    );
    expect(prisma.platformAlertRoute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ last_health_check_status: 'ok' }),
      }),
    );
    expect(routing.emitRouteHealthFailure).not.toHaveBeenCalled();
  });

  it('dispatches dead-man failures through surviving routes only', () => {
    const source = readFileSync(join(__dirname, 'alert-routing.service.ts'), 'utf8');

    expect(source).toContain('dispatchInitial(alert.id, new Set([route.id]))');
  });
});
