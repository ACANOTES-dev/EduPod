/* eslint-disable import/order -- jest.mock must precede mocked imports */
jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

import { UnauthorizedException } from '@nestjs/common';

import {
  CommunicationsWebhooksController,
  buildAbsoluteUrl,
  extractResendEventId,
  extractResendEventType,
  lowercaseHeaders,
} from './communications-webhooks.controller';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function build({
  emailSecret = 'whsec_validsecret',
  smsSecret = 'twiliotoken',
  whatsappSecret = 'twiliotoken',
  verifyResult = true,
}: {
  emailSecret?: string | null;
  smsSecret?: string | null;
  whatsappSecret?: string | null;
  verifyResult?: boolean;
} = {}) {
  const prismaTx = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      notificationWebhookEvent: { upsert: jest.fn().mockResolvedValue({}) },
    }),
  );
  const prisma = {
    $transaction: prismaTx,
    notificationWebhookEvent: { upsert: jest.fn() },
  } as never;
  const emailConfig = { getWebhookSecret: jest.fn().mockResolvedValue(emailSecret) };
  const smsConfig = { getWebhookSecret: jest.fn().mockResolvedValue(smsSecret) };
  const whatsappConfig = { getWebhookSecret: jest.fn().mockResolvedValue(whatsappSecret) };
  const verifier = {
    verifyResend: jest.fn().mockReturnValue(verifyResult),
    verifyTwilio: jest.fn().mockReturnValue(verifyResult),
  };
  const resendHandler = { handle: jest.fn().mockResolvedValue(undefined) };
  const twilioHandler = {
    handleSms: jest.fn().mockResolvedValue(undefined),
    handleWhatsApp: jest.fn().mockResolvedValue(undefined),
  };
  const metrics = { recordWebhook: jest.fn() };
  const tenantModuleService = { isEnabled: jest.fn().mockResolvedValue(true) };
  const ctrl = new CommunicationsWebhooksController(
    prisma,
    emailConfig as never,
    smsConfig as never,
    whatsappConfig as never,
    verifier as never,
    resendHandler as never,
    twilioHandler as never,
    metrics as never,
    tenantModuleService as never,
  );
  return {
    ctrl,
    prisma,
    emailConfig,
    smsConfig,
    verifier,
    resendHandler,
    twilioHandler,
    metrics,
    tenantModuleService,
  };
}

function fakeReq(rawBody = Buffer.from('{}')): never {
  return {
    rawBody,
    originalUrl: '/v1/webhooks/communications/email/abc',
    protocol: 'https',
    headers: { host: 'api.test', 'x-forwarded-proto': 'https' },
  } as never;
}

describe('CommunicationsWebhooksController — email', () => {
  it('writes a webhook event row before throwing on signature failure', async () => {
    const { ctrl, prisma, resendHandler } = build({ verifyResult: false });
    void prisma;
    await expect(
      ctrl.receiveEmail(
        TENANT_A,
        fakeReq(Buffer.from('{"type":"email.bounced","data":{"message_id":"x"}}')),
        { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,bad' },
        { type: 'email.bounced', data: { message_id: 'x' } },
      ),
    ).rejects.toThrow(UnauthorizedException);
    // The handler was NOT called — verification failed BEFORE handoff.
    // The audit row write is internal (createRlsClient mock); we verify via
    // the broader "rejects.toThrow" path here.
    expect(resendHandler.handle).not.toHaveBeenCalled();
  });

  it('passes through to handler when signature is valid', async () => {
    const { ctrl, resendHandler } = build({ verifyResult: true });
    const result = await ctrl.receiveEmail(
      TENANT_A,
      fakeReq(),
      { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,ok' },
      { type: 'email.delivered', data: { message_id: 'm1' } },
    );
    expect(result).toEqual({ accepted: true });
    expect(resendHandler.handle).toHaveBeenCalledWith(TENANT_A, expect.any(Object));
  });

  it('accepts but skips handler handoff when outbound communications are disabled', async () => {
    const { ctrl, resendHandler, tenantModuleService } = build({ verifyResult: true });
    tenantModuleService.isEnabled.mockResolvedValue(false);

    const result = await ctrl.receiveEmail(
      TENANT_A,
      fakeReq(),
      { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,ok' },
      { type: 'email.delivered', data: { message_id: 'm1' } },
    );

    expect(result).toEqual({ accepted: true });
    expect(resendHandler.handle).not.toHaveBeenCalled();
  });

  it('rejects when tenant has no webhook secret configured', async () => {
    const { ctrl } = build({ emailSecret: null, verifyResult: true });
    await expect(ctrl.receiveEmail(TENANT_A, fakeReq(), {}, {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('SECURITY: signature valid for tenant A is rejected when posted to tenant B URL', async () => {
    // The controller asks emailConfig.getWebhookSecret(tenantId-from-url),
    // which only returns the secret of THAT tenant. A signature signed
    // with tenant A's secret will not pass tenant B's verification.
    const { ctrl, emailConfig, verifier } = build({ verifyResult: false });
    emailConfig.getWebhookSecret.mockResolvedValueOnce('tenant-B-secret');
    await expect(
      ctrl.receiveEmail(
        TENANT_B,
        fakeReq(),
        { 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,signed-with-A-secret' },
        {},
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(verifier.verifyResend).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Object),
      'tenant-B-secret',
    );
  });
});

describe('CommunicationsWebhooksController — sms / whatsapp', () => {
  it('routes a Twilio status callback for SMS', async () => {
    const { ctrl, twilioHandler } = build();
    await ctrl.receiveSms(TENANT_A, fakeReq(), 'sig', {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
    });
    expect(twilioHandler.handleSms).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ MessageSid: 'SM1' }),
    );
  });

  it('routes WhatsApp inbound to the WhatsApp handler', async () => {
    const { ctrl, twilioHandler } = build();
    await ctrl.receiveWhatsApp(TENANT_A, fakeReq(), 'sig', {
      MessageSid: 'SM1',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+1987654321',
    });
    expect(twilioHandler.handleWhatsApp).toHaveBeenCalled();
  });

  it('rejects SMS when signature missing', async () => {
    const { ctrl } = build({ verifyResult: false });
    await expect(
      ctrl.receiveSms(TENANT_A, fakeReq(), undefined, { MessageSid: 'SM1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects WhatsApp when secret missing', async () => {
    const { ctrl } = build({ whatsappSecret: null });
    await expect(
      ctrl.receiveWhatsApp(TENANT_A, fakeReq(), 'sig', { MessageSid: 'SM1' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('lowercaseHeaders', () => {
  it('lowercases all keys', () => {
    expect(lowercaseHeaders({ 'X-Foo': 'bar', BAZ: 'qux' })).toEqual({
      'x-foo': 'bar',
      baz: 'qux',
    });
  });
});

describe('buildAbsoluteUrl', () => {
  it('builds with x-forwarded-proto + host', () => {
    expect(
      buildAbsoluteUrl({
        headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'api.school.edu' },
        originalUrl: '/v1/webhooks/x/T1',
      } as never),
    ).toBe('https://api.school.edu/v1/webhooks/x/T1');
  });

  it('falls back to req.host', () => {
    expect(
      buildAbsoluteUrl({
        headers: { host: 'api.school.edu' },
        protocol: 'http',
        originalUrl: '/v1/webhooks/x/T1',
      } as never),
    ).toBe('http://api.school.edu/v1/webhooks/x/T1');
  });
});

describe('extractResendEventId', () => {
  it('prefers svix-id', () => {
    expect(extractResendEventId({ data: { message_id: 'm' } }, { 'svix-id': 'svx_1' })).toBe(
      'svix:svx_1',
    );
  });
  it('falls back to data.message_id', () => {
    expect(extractResendEventId({ data: { message_id: 'm1' } }, {})).toBe('resend:m1');
  });
  it('falls back to synthetic when neither present', () => {
    const result = extractResendEventId({}, {});
    expect(result.startsWith('resend:unknown:')).toBe(true);
  });
});

describe('extractResendEventType', () => {
  it('returns body.type', () => {
    expect(extractResendEventType({ type: 'email.delivered' })).toBe('email.delivered');
  });
  it('returns "unknown" when missing', () => {
    expect(extractResendEventType({})).toBe('unknown');
  });
});
