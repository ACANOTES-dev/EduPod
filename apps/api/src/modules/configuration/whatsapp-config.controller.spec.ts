import { HttpException, HttpStatus } from '@nestjs/common';

import { WhatsAppConfigController } from './whatsapp-config.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function build({ allowed = true } = {}) {
  const svc = {
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
    deleteConfig: jest.fn(),
    verifyConfig: jest.fn().mockResolvedValue({
      success: true,
      provider_message_id: 'SM_1',
      message: 'Sent via Twilio WhatsApp',
      recipient_mask: '+1555****5555',
    }),
  };
  const limit = {
    checkAndIncrement: jest.fn().mockResolvedValue({
      allowed,
      retry_after_seconds: allowed ? undefined : 600,
      limit: 3,
    }),
  };
  const ctrl = new WhatsAppConfigController(svc as never, limit as never);
  return { ctrl, svc, limit };
}

describe('WhatsAppConfigController.test (verify)', () => {
  it('delegates when rate limit allows', async () => {
    const { ctrl, svc, limit } = build();
    await ctrl.test(
      { tenant_id: TENANT_ID } as never,
      {
        recipient_phone: '+15551234567',
        template_key: 'comms.verify',
      } as never,
    );
    expect(limit.checkAndIncrement).toHaveBeenCalledWith(TENANT_ID, 'whatsapp');
    expect(svc.verifyConfig).toHaveBeenCalledWith(TENANT_ID, '+15551234567');
  });

  it('throws 429 when rate limit denies', async () => {
    const { ctrl } = build({ allowed: false });
    let caught: HttpException | null = null;
    try {
      await ctrl.test(
        { tenant_id: TENANT_ID } as never,
        {
          recipient_phone: '+15551234567',
          template_key: 'comms.verify',
        } as never,
      );
    } catch (e) {
      caught = e as HttpException;
    }
    expect(caught?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});
