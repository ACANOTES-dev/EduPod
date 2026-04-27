/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { TwilioWebhookHandlerService, stripWhatsAppPrefix } from './twilio-webhook-handler.service';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function build(notification: unknown = null) {
  const prisma = {
    notification: {
      findFirst: jest.fn().mockResolvedValue(notification),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const suppression = { addSuppression: jest.fn().mockResolvedValue(undefined) };
  const serviceWindow = { recordInbound: jest.fn().mockResolvedValue(undefined) };
  const svc = new TwilioWebhookHandlerService(
    prisma as never,
    suppression as never,
    serviceWindow as never,
  );
  return { svc, prisma, suppression, serviceWindow };
}

const SMS_NOTIFICATION = {
  id: 'n1',
  tenant_id: TENANT_A,
  channel: 'sms',
  provider_message_id: 'SM1',
};

describe('TwilioWebhookHandlerService — SMS', () => {
  it('MessageStatus=delivered → status=delivered + delivered_at', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
      To: '+15551234567',
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered' }),
      }),
    );
  });

  it('MessageStatus=sent → status=sent + sent_at', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'sent',
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('failed with hard-bounce error code → suppression', async () => {
    const { svc, suppression } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30005',
      To: '+15551234567',
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'hard_bounce',
        recipient: '+15551234567',
      }),
    );
  });

  it('undelivered with hard-bounce error code → suppression', async () => {
    const { svc, suppression } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'undelivered',
      ErrorCode: '21610',
      To: '+15551234567',
    });
    expect(suppression.addSuppression).toHaveBeenCalled();
  });

  it('failed with non-hard error code → no suppression', async () => {
    const { svc, suppression } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30007',
      To: '+15551234567',
    });
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('queued status is a no-op', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, { MessageSid: 'SM1', MessageStatus: 'queued' });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('accepted status is a no-op', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, { MessageSid: 'SM1', MessageStatus: 'accepted' });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('logs and returns when MessageSid missing', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, { MessageStatus: 'delivered' });
    expect(prisma.notification.findFirst).not.toHaveBeenCalled();
  });

  it('logs and returns when notification not found', async () => {
    const { svc, prisma } = build(null);
    await svc.handleSms(TENANT_A, { MessageSid: 'unknown', MessageStatus: 'delivered' });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('unhandled status logs and returns', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, { MessageSid: 'SM1', MessageStatus: 'received' });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});

describe('TwilioWebhookHandlerService — WhatsApp', () => {
  it('inbound message (no MessageStatus, has From) opens the service window and returns', async () => {
    const { svc, prisma, serviceWindow } = build(null);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      From: 'whatsapp:+15550000',
      To: 'whatsapp:+15551111',
    });
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(serviceWindow.recordInbound).toHaveBeenCalledWith(TENANT_A, 'whatsapp:+15550000');
  });

  it('outbound status callback for WhatsApp follows SMS path', async () => {
    const wa = { ...SMS_NOTIFICATION, channel: 'whatsapp' };
    const { svc, prisma } = build(wa);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
      To: 'whatsapp:+15551234567',
    });
    expect(prisma.notification.update).toHaveBeenCalled();
  });

  it('strips whatsapp: prefix when adding suppression', async () => {
    const wa = { ...SMS_NOTIFICATION, channel: 'whatsapp' };
    const { svc, suppression } = build(wa);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30005',
      To: 'whatsapp:+15551234567',
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: '+15551234567',
        channel: 'whatsapp',
      }),
    );
  });
});

describe('stripWhatsAppPrefix', () => {
  it('strips the whatsapp: prefix', () => {
    expect(stripWhatsAppPrefix('whatsapp:+15550000')).toBe('+15550000');
  });
  it('passes through plain numbers', () => {
    expect(stripWhatsAppPrefix('+15550000')).toBe('+15550000');
  });
  it('handles empty string', () => {
    expect(stripWhatsAppPrefix('')).toBe('');
  });
});
