import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';

import { AlertRoutesService, routeDestinationConfig } from './alert-routes.service';

const ROUTE_ID = '11111111-1111-4111-8111-111111111111';
const CHANNEL_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

function buildEmailRoute(overrides: Record<string, unknown> = {}) {
  return {
    channel: {
      config: {},
      id: CHANNEL_ID,
      is_enabled: true,
      name: 'Email',
      type: 'email',
    },
    channel_id: CHANNEL_ID,
    created_at: new Date('2026-05-17T10:00:00.000Z'),
    critical_override_quiet: true,
    dead_man_interval_minutes: 60,
    display_name: 'Primary ops',
    enabled: true,
    health_check_destination: { email: 'sink@example.com' },
    health_checks: [],
    id: ROUTE_ID,
    last_health_check_at: null,
    last_health_check_status: null,
    operator_destination: { email: 'ops@example.com' },
    quiet_hours_end: null,
    quiet_hours_start: null,
    quiet_hours_timezone: 'Europe/Dublin',
    updated_at: new Date('2026-05-17T10:00:00.000Z'),
    urgency_tier: 'critical_only',
    ...overrides,
  };
}

function buildService() {
  const route = buildEmailRoute();
  const prisma = {
    platformAlertChannel: {
      findUnique: jest.fn().mockResolvedValue({ id: CHANNEL_ID }),
    },
    platformAlertRoute: {
      create: jest.fn().mockResolvedValue(route),
      delete: jest.fn().mockResolvedValue(route),
      findMany: jest.fn().mockResolvedValue([route]),
      findUnique: jest.fn().mockResolvedValue(route),
      update: jest.fn().mockResolvedValue(route),
    },
    platformAlertRouteHealthCheck: {
      create: jest.fn().mockResolvedValue({
        id: '44444444-4444-4444-8444-444444444444',
        ran_at: new Date('2026-05-17T10:01:00.000Z'),
        success: true,
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  const dispatch = {
    sendSyntheticAlert: jest.fn().mockResolvedValue({ message: 'sent', success: true }),
  };

  return {
    audit,
    dispatch,
    prisma,
    route,
    service: new AlertRoutesService(prisma as never, audit as never, dispatch as never),
  };
}

describe('AlertRoutesService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns enabled routes with channel and latest health check', async () => {
      const { prisma, route, service } = buildService();

      await expect(service.list()).resolves.toEqual([route]);

      expect(prisma.platformAlertRoute.findMany).toHaveBeenCalledWith({
        include: {
          channel: true,
          health_checks: { orderBy: { ran_at: 'desc' }, take: 1 },
        },
        orderBy: [{ enabled: 'desc' }, { display_name: 'asc' }],
      });
    });
  });

  describe('create', () => {
    it('creates a route after validating the channel and sink separation', async () => {
      const { audit, prisma, service } = buildService();

      const created = await service.create(
        {
          channel_id: CHANNEL_ID,
          critical_override_quiet: true,
          dead_man_interval_minutes: 45,
          display_name: 'Primary ops',
          enabled: true,
          health_check_destination: { email: 'sink@example.com' },
          operator_destination: { email: 'ops@example.com' },
          quiet_hours_timezone: 'Europe/Dublin',
          urgency_tier: 'critical_only',
        },
        { actor_user_id: ACTOR_ID, ip_address: '127.0.0.1' },
      );

      expect(created.id).toBe(ROUTE_ID);
      expect(prisma.platformAlertChannel.findUnique).toHaveBeenCalledWith({
        select: { id: true },
        where: { id: CHANNEL_ID },
      });
      expect(prisma.platformAlertRoute.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            display_name: 'Primary ops',
            health_check_destination: { email: 'sink@example.com' },
            operator_destination: { email: 'ops@example.com' },
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert_route_created',
          target_resource_id: ROUTE_ID,
        }),
      );
    });

    it('rejects a missing channel and matching sink/operator destinations', async () => {
      const { prisma, service } = buildService();
      prisma.platformAlertChannel.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create({
          channel_id: CHANNEL_ID,
          display_name: 'Missing channel',
          health_check_destination: { email: 'sink@example.com' },
          operator_destination: { email: 'ops@example.com' },
          urgency_tier: 'urgent',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      await expect(
        service.create({
          channel_id: CHANNEL_ID,
          display_name: 'Bad sink',
          health_check_destination: { email: 'same@example.com' },
          operator_destination: { email: 'same@example.com' },
          urgency_tier: 'urgent',
        }),
      ).rejects.toBeInstanceOf(z.ZodError);
    });
  });

  describe('update', () => {
    it('updates only provided fields and audits the before/after values', async () => {
      const { audit, prisma, service } = buildService();

      await service.update(
        ROUTE_ID,
        {
          enabled: false,
          quiet_hours_end: '07:30',
          quiet_hours_start: '22:00',
        },
        { actor_user_id: ACTOR_ID },
      );

      expect(prisma.platformAlertRoute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            enabled: false,
            quiet_hours_end: '07:30',
            quiet_hours_start: '22:00',
          },
          where: { id: ROUTE_ID },
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert_route_updated',
          payload: expect.objectContaining({
            before: expect.any(Object),
            after: expect.any(Object),
          }),
        }),
      );
    });

    it('throws when the route is absent', async () => {
      const { prisma, service } = buildService();
      prisma.platformAlertRoute.findUnique.mockResolvedValueOnce(null);

      await expect(service.update(ROUTE_ID, { enabled: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes an existing route and records the audit event', async () => {
      const { audit, prisma, service } = buildService();

      await service.remove(ROUTE_ID, { actor_user_id: ACTOR_ID });

      expect(prisma.platformAlertRoute.delete).toHaveBeenCalledWith({ where: { id: ROUTE_ID } });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert_route_deleted',
          target_resource_type: 'alert_route',
        }),
      );
    });
  });

  describe('test', () => {
    it('sends a clearly synthetic route test and stores route health', async () => {
      const { dispatch, prisma, service } = buildService();

      await expect(
        service.test(ROUTE_ID, ACTOR_ID, { comment: 'handoff check' }, { actor_user_id: ACTOR_ID }),
      ).resolves.toEqual({ message: 'sent', success: true });

      expect(dispatch.sendSyntheticAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          config: { recipients: ['ops@example.com'] },
          type: 'email',
        }),
        expect.objectContaining({
          is_test: true,
          message: '[SYNTHETIC TEST] handoff check',
        }),
      );
      expect(prisma.platformAlertRouteHealthCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            route_id: ROUTE_ID,
            success: true,
            triggered_by: 'manual',
            triggered_by_user_id: ACTOR_ID,
          }),
        }),
      );
      expect(prisma.platformAlertRoute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ last_health_check_status: 'ok' }),
        }),
      );
    });

    it('records failed test health with the failure detail', async () => {
      const { dispatch, prisma, service } = buildService();
      dispatch.sendSyntheticAlert.mockResolvedValueOnce({
        message: 'provider down',
        success: false,
      });

      await service.test(ROUTE_ID, ACTOR_ID, {}, { actor_user_id: ACTOR_ID });

      expect(prisma.platformAlertRouteHealthCheck.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failure_detail: { message: 'provider down' },
            success: false,
          }),
        }),
      );
      expect(prisma.platformAlertRoute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ last_health_check_status: 'failed' }),
        }),
      );
    });
  });

  describe('routeHealth', () => {
    it('returns recent health checks with route and channel context', async () => {
      const { prisma, service } = buildService();

      await service.routeHealth();

      expect(prisma.platformAlertRouteHealthCheck.findMany).toHaveBeenCalledWith({
        include: { route: { include: { channel: true } } },
        orderBy: { ran_at: 'desc' },
        take: 100,
      });
    });
  });

  describe('routeDestinationConfig', () => {
    it('maps channel-specific route destinations for email, telegram, whatsapp, and push', () => {
      expect(routeDestinationConfig(buildEmailRoute(), 'operator')).toEqual({
        recipients: ['ops@example.com'],
      });
      expect(
        routeDestinationConfig(
          buildEmailRoute({
            channel: {
              config: {
                bot_token_encrypted: 'encrypted',
                bot_token_key_ref: 'key-ref',
                chat_id: 'default-chat',
              },
              id: CHANNEL_ID,
              is_enabled: true,
              name: 'Telegram',
              type: 'telegram',
            },
            operator_destination: { telegram_chat_id: 'ops-chat' },
          }),
          'operator',
        ),
      ).toEqual({
        bot_token_encrypted: 'encrypted',
        bot_token_key_ref: 'key-ref',
        chat_id: 'ops-chat',
      });
      expect(
        routeDestinationConfig(
          buildEmailRoute({
            channel: {
              config: {},
              id: CHANNEL_ID,
              is_enabled: true,
              name: 'WhatsApp',
              type: 'whatsapp',
            },
            operator_destination: { phone_e164: '+35315550100' },
          }),
          'operator',
        ),
      ).toEqual({ to_number: '+35315550100' });
      expect(
        routeDestinationConfig(
          buildEmailRoute({
            channel: {
              config: {},
              id: CHANNEL_ID,
              is_enabled: true,
              name: 'Push',
              type: 'push',
            },
            operator_destination: { endpoint: 'https://push.example.test' },
          }),
          'operator',
        ),
      ).toEqual({ endpoint: 'https://push.example.test' });
    });
  });
});
