import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import {
  JWT_EXPIRY,
  REFRESH_EXPIRY,
} from '@school/shared';
import type { JwtPayload, RefreshTokenPayload } from '@school/shared';

// ─── TokenService ───────────────────────────────────────────────────────────

@Injectable()
export class TokenService {
  constructor(private readonly configService: ConfigService) {}

  signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'type'>): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.sign({ ...payload, type: 'access' }, secret, {
      expiresIn: JWT_EXPIRY,
    });
  }

  signRefreshToken(payload: Omit<RefreshTokenPayload, 'iat' | 'exp' | 'type'>): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

    return jwt.sign({ ...payload, type: 'refresh' }, secret, {
      expiresIn: REFRESH_EXPIRY,
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET not configured');

    return jwt.verify(token, secret) as JwtPayload;
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');

    return jwt.verify(token, secret) as RefreshTokenPayload;
  }
}
