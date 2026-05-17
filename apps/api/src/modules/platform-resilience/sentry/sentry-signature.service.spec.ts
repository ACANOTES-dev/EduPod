import { createHmac } from 'crypto';

import { SentrySignatureService } from './sentry-signature.service';

describe('SentrySignatureService', () => {
  it('accepts a matching HMAC signature and rejects mismatches', () => {
    const service = new SentrySignatureService();
    const body = Buffer.from(JSON.stringify({ action: 'created' }));
    const secret = 'super-secret';
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    expect(service.verify({ body, secret, signature })).toBe(true);
    expect(service.verify({ body, secret, signature: `${signature.slice(0, -1)}0` })).toBe(false);
    expect(service.verify({ body, secret })).toBe(false);
  });
});
