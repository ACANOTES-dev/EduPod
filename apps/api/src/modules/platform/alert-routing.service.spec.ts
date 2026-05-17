import { AlertRoutingService } from './alert-routing.service';

const ALERT_ID = '11111111-1111-4111-8111-111111111111';
const RULE_ID = '22222222-2222-4222-8222-222222222222';
const BLOCKED_ROUTE_ID = '33333333-3333-4333-8333-333333333333';
const SURVIVING_ROUTE_ID = '44444444-4444-4444-8444-444444444444';
const OWNER_PLATFORM_USER_ID = '55555555-5555-4555-8555-555555555555';

function buildRoute(id: string, displayName: string) {
  return {
    channel: {
      id: `channel-${id}`,
      is_enabled: true,
      type: 'email',
    },
    critical_override_quiet: true,
    display_name: displayName,
    enabled: true,
    health_checks: [],
    id,
    quiet_hours_end: null,
    quiet_hours_start: null,
    quiet_hours_timezone: 'Europe/Dublin',
  };
}

describe('AlertRoutingService — dispatchInitial', () => {
  it('skips excluded dead-man route steps and immediately dispatches through a surviving route', async () => {
    const prisma = {
      platformAlertEscalationPolicy: {
        findFirst: jest.fn().mockResolvedValue({
          steps: [
            { ack_window_minutes: 10, route_id: BLOCKED_ROUTE_ID },
            { ack_window_minutes: 10, route_id: SURVIVING_ROUTE_ID },
          ],
        }),
      },
      platformAlertHistory: {
        findUnique: jest.fn().mockResolvedValue({
          current_escalation_step: 0,
          id: ALERT_ID,
          message: 'Route failed',
          metric_value: 1,
          rule: { id: RULE_ID, metric: 'alerts.route.dead_man_failed', name: 'Route health' },
          rule_id: RULE_ID,
          severity: 'critical',
          status: 'fired',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      platformAlertRoute: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(buildRoute(BLOCKED_ROUTE_ID, 'Email route'))
          .mockResolvedValueOnce(buildRoute(SURVIVING_ROUTE_ID, 'WhatsApp route')),
      },
      platformUser: {
        findFirst: jest.fn().mockResolvedValue({ id: OWNER_PLATFORM_USER_ID }),
      },
    };
    const channelDispatch = {
      sendSyntheticAlert: jest.fn().mockResolvedValue({ message: 'ok', success: true }),
    };
    const routesService = {
      routeToDispatchChannel: jest.fn().mockReturnValue({
        config: { recipients: ['ops@example.test'] },
        id: SURVIVING_ROUTE_ID,
        is_enabled: true,
        name: 'WhatsApp route',
        type: 'email',
      }),
    };
    const service = new AlertRoutingService(
      prisma as never,
      channelDispatch as never,
      {} as never,
      routesService as never,
      { sign: jest.fn().mockReturnValue('signed-token') } as never,
      {} as never,
      {} as never,
    );

    const notified = await service.dispatchInitial(ALERT_ID, new Set([BLOCKED_ROUTE_ID]));

    expect(notified).toEqual(['WhatsApp route']);
    expect(channelDispatch.sendSyntheticAlert).toHaveBeenCalledTimes(1);
    expect(routesService.routeToDispatchChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: SURVIVING_ROUTE_ID }),
      'operator',
    );
    expect(prisma.platformAlertHistory.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channels_notified: ['WhatsApp route'],
          current_escalation_step: 1,
          escalation_state: 'awaiting_ack',
        }),
      }),
    );
  });
});
