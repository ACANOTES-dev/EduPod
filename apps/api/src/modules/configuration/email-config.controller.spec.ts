import { HttpException, HttpStatus } from '@nestjs/common';

import { EmailConfigController } from './email-config.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function build({ allowed = true } = {}) {
  const svc = {
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
    deleteConfig: jest.fn(),
    verifyConfig: jest.fn().mockResolvedValue({
      success: true,
      provider_message_id: 'msg_1',
      message: 'Sent via Resend',
      recipient_mask: 'a***z@example.com',
    }),
  };
  const limit = {
    checkAndIncrement: jest.fn().mockResolvedValue({
      allowed,
      retry_after_seconds: allowed ? undefined : 1234,
      limit: 3,
    }),
  };
  const ctrl = new EmailConfigController(svc as never, limit as never);
  return { ctrl, svc, limit };
}

describe('EmailConfigController.test (verify)', () => {
  it('delegates to verifyConfig when rate limit allows', async () => {
    const { ctrl, svc, limit } = build({ allowed: true });
    const result = await ctrl.test({ tenant_id: TENANT_ID } as never, {
      recipient_email: 'a@b.test',
    });
    expect(limit.checkAndIncrement).toHaveBeenCalledWith(TENANT_ID, 'email');
    expect(svc.verifyConfig).toHaveBeenCalledWith(TENANT_ID, 'a@b.test');
    expect(result.success).toBe(true);
  });

  it('throws 429 when rate limit denies', async () => {
    const { ctrl, svc } = build({ allowed: false });
    let caught: HttpException | null = null;
    try {
      await ctrl.test({ tenant_id: TENANT_ID } as never, { recipient_email: 'a@b.test' });
    } catch (e) {
      caught = e as HttpException;
    }
    expect(caught).toBeInstanceOf(HttpException);
    expect(caught?.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    const body = caught?.getResponse() as {
      code: string;
      retry_after_seconds: number;
      message: string;
    };
    expect(body.code).toBe('VERIFY_RATE_LIMIT_EXCEEDED');
    expect(body.retry_after_seconds).toBe(1234);
    expect(svc.verifyConfig).not.toHaveBeenCalled();
  });
});
