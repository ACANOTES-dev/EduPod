import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AlertEscalationPoliciesService } from './alert-escalation-policies.service';

const POLICY_ID = '11111111-1111-4111-8111-111111111111';
const ROUTE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

const auditContext = {
  actor_user_id: USER_ID,
  actor_user_role: 'platform_owner',
  request_id: 'req-1',
};

function buildPrisma(routeCount = 1) {
  return {
    platformAlertEscalationPolicy: {
      create: jest.fn().mockResolvedValue({ id: POLICY_ID }),
      delete: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ id: POLICY_ID }]),
      findUnique: jest.fn().mockResolvedValue({
        applies_to_alert_keys: [],
        applies_to_severity: 'critical',
        display_name: 'Critical escalation',
        enabled: true,
        id: POLICY_ID,
        steps: [{ ack_window_minutes: 10, route_id: ROUTE_ID }],
      }),
      update: jest.fn().mockResolvedValue({ id: POLICY_ID, enabled: false }),
    },
    platformAlertRoute: {
      count: jest.fn().mockResolvedValue(routeCount),
    },
  };
}

describe('AlertEscalationPoliciesService', () => {
  it('creates, lists, updates, and deletes escalation policies with audit entries', async () => {
    const prisma = buildPrisma();
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new AlertEscalationPoliciesService(prisma as never, audit as never);

    await expect(service.list()).resolves.toEqual([{ id: POLICY_ID }]);
    await service.create(
      {
        applies_to_alert_keys: [],
        applies_to_severity: 'critical',
        display_name: 'Critical escalation',
        enabled: true,
        steps: [{ ack_window_minutes: 10, route_id: ROUTE_ID }],
      },
      USER_ID,
      auditContext,
    );
    await service.update(POLICY_ID, { enabled: false }, auditContext);
    await service.remove(POLICY_ID, auditContext);

    expect(prisma.platformAlertRoute.count).toHaveBeenCalledWith({
      where: { id: { in: [ROUTE_ID] } },
    });
    expect(prisma.platformAlertEscalationPolicy.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          applies_to_severity: 'critical',
          created_by_user_id: USER_ID,
          steps: [{ ack_window_minutes: 10, route_id: ROUTE_ID }],
        }),
      }),
    );
    expect(audit.log).toHaveBeenCalledTimes(3);
  });

  it('rejects policies that reference missing routes', async () => {
    const service = new AlertEscalationPoliciesService(
      buildPrisma(0) as never,
      { log: jest.fn() } as never,
    );

    await expect(
      service.create(
        {
          applies_to_alert_keys: [],
          applies_to_severity: 'critical',
          display_name: 'Critical escalation',
          enabled: true,
          steps: [{ ack_window_minutes: 10, route_id: ROUTE_ID }],
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when updating or deleting an unknown policy', async () => {
    const prisma = buildPrisma();
    prisma.platformAlertEscalationPolicy.findUnique.mockResolvedValue(null);
    const service = new AlertEscalationPoliciesService(
      prisma as never,
      { log: jest.fn() } as never,
    );

    await expect(service.update(POLICY_ID, { enabled: false })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(POLICY_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
