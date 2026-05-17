import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { RedisService } from '../redis/redis.service';

const ACK_TOKEN_TTL_SECONDS = 10 * 60;

const ackTokenPayloadSchema = z.object({
  alert_history_id: z.string().uuid(),
  exp: z.number().int(),
  jti: z.string().uuid(),
  platform_user_id: z.string().uuid(),
  route_id: z.string().uuid().optional(),
});

export type AlertAckTokenPayload = z.infer<typeof ackTokenPayloadSchema>;

function base64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function unbase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

@Injectable()
export class AlertAckTokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  sign(input: { alert_history_id: string; platform_user_id: string; route_id?: string }): string {
    const payload: AlertAckTokenPayload = {
      alert_history_id: input.alert_history_id,
      exp: Math.floor(Date.now() / 1000) + ACK_TOKEN_TTL_SECONDS,
      jti: randomUUID(),
      platform_user_id: input.platform_user_id,
      route_id: input.route_id,
    };
    const encoded = base64Url(JSON.stringify(payload));
    return `${encoded}.${this.signature(encoded)}`;
  }

  async verify(token: string): Promise<AlertAckTokenPayload> {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) {
      throw new UnauthorizedException({
        code: 'INVALID_ACK_TOKEN',
        message: 'Acknowledgement token is invalid.',
      });
    }

    const expected = this.signature(encoded);
    const valid =
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_ACK_TOKEN',
        message: 'Acknowledgement token signature is invalid.',
      });
    }

    const payload = ackTokenPayloadSchema.parse(JSON.parse(unbase64Url(encoded)));
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new GoneException({
        code: 'ACK_TOKEN_EXPIRED',
        message: 'Acknowledgement token has expired.',
      });
    }

    const usedKey = `platform:alert-ack-token:${payload.jti}`;
    const inserted = await this.redis
      .getClient()
      .set(usedKey, 'used', 'EX', ACK_TOKEN_TTL_SECONDS, 'NX');
    if (inserted !== 'OK') {
      throw new GoneException({
        code: 'ACK_TOKEN_USED',
        message: 'Acknowledgement token has already been used.',
      });
    }

    return payload;
  }

  private signature(encodedPayload: string): string {
    const secret =
      this.configService.get<string>('PLATFORM_ALERT_ACK_SECRET') ??
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('PLATFORM_ALERT_ACK_SECRET or JWT_SECRET must be configured');
    }
    return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  }
}
