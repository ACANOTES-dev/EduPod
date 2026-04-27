/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { ResendWebhookHandlerService } from './resend-webhook-handler.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function build({
  notification = null,
  recentSoftBounces = 0,
}: { notification?: unknown; recentSoftBounces?: number } = {}) {
  const prisma = {
    notification: {
      findFirst: jest.fn().mockResolvedValue(notification),
      update: jest.fn().mockResolvedValue({}),
    },
    notificationWebhookEvent: {
      count: jest.fn().mockResolvedValue(recentSoftBounces),
    },
  };
  const suppression = { addSuppression: jest.fn().mockResolvedValue(undefined) };
  const svc = new ResendWebhookHandlerService(prisma as never, suppression as never);
  return { svc, prisma, suppression };
}

const NOTIFICATION = {
  id: 'notif_1',
  tenant_id: TENANT_A,
  channel: 'email',
  provider_message_id: 'msg_1',
};

describe('ResendWebhookHandlerService', () => {
  it('email.sent → notification.status="sent"', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.sent',
      data: { message_id: 'msg_1', to: 'parent@x.com' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('email.delivered → notification.status="delivered" + delivered_at', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.delivered',
      data: { message_id: 'msg_1', to: 'p@x.com' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered', delivered_at: expect.any(Date) }),
      }),
    );
  });

  it('email.bounced (hard) → status=failed + permanent suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: {
        message_id: 'msg_1',
        to: 'parent@x.com',
        bounce: { type: 'hard', message: 'no such mailbox' },
      },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        channel: 'email',
        recipient: 'parent@x.com',
        reason: 'hard_bounce',
        expiresAt: null,
      }),
    );
  });

  it('email.bounced (soft, 1st) → status=failed, NO suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION, recentSoftBounces: 0 });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: { message_id: 'msg_1', to: 'parent@x.com', bounce: { type: 'soft' } },
    });
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('email.bounced (soft, 3rd in 30d) → suppression with 30-day expiry', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION, recentSoftBounces: 2 });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: { message_id: 'msg_1', to: 'parent@x.com', bounce: { type: 'soft' } },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'soft_bounce_threshold',
        expiresAt: expect.any(Date),
      }),
    );
    const call = suppression.addSuppression.mock.calls[0][0];
    const ageDays = (call.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(ageDays).toBeCloseTo(30, 0);
  });

  it('email.complained → status=failed + permanent suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.complained',
      data: { message_id: 'msg_1', to: 'parent@x.com' },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'complaint',
        expiresAt: null,
      }),
    );
  });

  it('alternate spelling email.complaint also handled', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.complaint',
      data: { message_id: 'msg_1', to: 'parent@x.com' },
    });
    expect(suppression.addSuppression).toHaveBeenCalled();
  });

  it('email.delivery_delayed → no status change (logged only)', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, { type: 'email.delivery_delayed', data: { message_id: 'msg_1' } });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('logs and returns when notification not found', async () => {
    const { svc, suppression, prisma } = build({ notification: null });
    await svc.handle(TENANT_A, { type: 'email.bounced', data: { message_id: 'unknown' } });
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('returns early when message_id missing', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, { type: 'email.delivered', data: {} });
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('handles single-string `to` field', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: {
        message_id: 'msg_1',
        to: 'single@x.com',
        bounce: { type: 'hard' },
      },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: 'single@x.com' }),
    );
  });

  it('handles missing recipient (no suppression added)', async () => {
    const { svc, suppression, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: { message_id: 'msg_1', bounce: { type: 'hard' } },
    });
    expect(prisma.notification.update).toHaveBeenCalled(); // status update happens
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('unknown event type is logged and ignored', async () => {
    const { svc, prisma, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.weird',
      data: { message_id: 'msg_1' },
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });
});
