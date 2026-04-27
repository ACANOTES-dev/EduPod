import { createHmac } from 'crypto';

import { WebhookSignatureVerifierService, safeEquals } from './webhook-signature-verifier.service';

const VALID_SVIX_SECRET =
  'whsec_' + Buffer.from('test-secret-bytes-here-32-bytes-').toString('base64');

function signResend(secret: string, id: string, ts: string, body: string): string {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const sig = createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

function signTwilio(token: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const dataStr = url + sortedKeys.map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(dataStr).digest('base64');
}

describe('WebhookSignatureVerifierService — verifyResend', () => {
  const svc = new WebhookSignatureVerifierService();
  const now = () => Math.floor(Date.now() / 1000).toString();

  it('returns true for a valid signature', () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_123';
    const ts = now();
    const sig = signResend(VALID_SVIX_SECRET, id, ts, body);
    const ok = svc.verifyResend(
      Buffer.from(body),
      {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      },
      VALID_SVIX_SECRET,
    );
    expect(ok).toBe(true);
  });

  it('returns false when signature is wrong', () => {
    const body = JSON.stringify({ type: 'email.delivered' });
    const ts = now();
    const ok = svc.verifyResend(
      Buffer.from(body),
      {
        'svix-id': 'msg_123',
        'svix-timestamp': ts,
        'svix-signature': 'v1,wrong_signature',
      },
      VALID_SVIX_SECRET,
    );
    expect(ok).toBe(false);
  });

  it('returns false when timestamp is older than 5 minutes', () => {
    const body = JSON.stringify({ type: 'email.delivered' });
    const ts = (Math.floor(Date.now() / 1000) - 600).toString();
    const sig = signResend(VALID_SVIX_SECRET, 'msg_123', ts, body);
    expect(
      svc.verifyResend(
        Buffer.from(body),
        { 'svix-id': 'msg_123', 'svix-timestamp': ts, 'svix-signature': sig },
        VALID_SVIX_SECRET,
      ),
    ).toBe(false);
  });

  it('returns false when any header is missing', () => {
    const body = Buffer.from('{}');
    expect(svc.verifyResend(body, {}, VALID_SVIX_SECRET)).toBe(false);
    expect(svc.verifyResend(body, { 'svix-id': 'x' }, VALID_SVIX_SECRET)).toBe(false);
  });

  it('returns false when secret is empty', () => {
    const body = Buffer.from('{}');
    expect(
      svc.verifyResend(
        body,
        { 'svix-id': 'x', 'svix-timestamp': now(), 'svix-signature': 'v1,x' },
        '',
      ),
    ).toBe(false);
  });

  it('handles multi-signature header by accepting any valid one', () => {
    const body = '{"type":"email.delivered"}';
    const id = 'msg_123';
    const ts = now();
    const goodSig = signResend(VALID_SVIX_SECRET, id, ts, body);
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': `v1,bogus_signature ${goodSig}`,
    };
    expect(svc.verifyResend(Buffer.from(body), headers, VALID_SVIX_SECRET)).toBe(true);
  });
});

describe('WebhookSignatureVerifierService — verifyTwilio', () => {
  const svc = new WebhookSignatureVerifierService();
  const TOKEN = 'test-twilio-auth-token';

  it('returns true for a valid signature', () => {
    const url = 'https://api.example.com/v1/webhooks/communications/sms/abc';
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });

  it('returns false for wrong signature', () => {
    const url = 'https://api.example.com/v1/webhooks/communications/sms/abc';
    const params = { MessageSid: 'SM1' };
    expect(svc.verifyTwilio(url, params, 'wrong', TOKEN)).toBe(false);
  });

  it('returns false on missing inputs', () => {
    expect(svc.verifyTwilio('', {}, 'sig', TOKEN)).toBe(false);
    expect(svc.verifyTwilio('url', {}, '', TOKEN)).toBe(false);
    expect(svc.verifyTwilio('url', {}, 'sig', '')).toBe(false);
  });

  it('rejects when ts query param is older than 5 minutes', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600;
    const url = `https://api.example.com/v1/webhooks/sms/abc?ts=${oldTs}`;
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(false);
  });

  it('accepts when ts query param is fresh', () => {
    const ts = Math.floor(Date.now() / 1000);
    const url = `https://api.example.com/v1/webhooks/sms/abc?ts=${ts}`;
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });

  it('skips replay protection when ts is absent', () => {
    const url = 'https://api.example.com/v1/webhooks/sms/abc';
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });
});

describe('safeEquals', () => {
  it('returns true for identical strings', () => {
    expect(safeEquals('hello', 'hello')).toBe(true);
  });
  it('returns false for different strings', () => {
    expect(safeEquals('hello', 'world')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(safeEquals('hello', 'hello!')).toBe(false);
  });
});
