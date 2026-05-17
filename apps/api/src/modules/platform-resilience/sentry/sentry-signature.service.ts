import { createHmac, timingSafeEqual } from 'crypto';

import { Injectable } from '@nestjs/common';

@Injectable()
export class SentrySignatureService {
  verify(input: { body: Buffer; secret: string; signature?: string }): boolean {
    if (!input.signature) return false;
    const expected = createHmac('sha256', input.secret).update(input.body).digest('hex');
    const actualBuffer = Buffer.from(input.signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (actualBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
