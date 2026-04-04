import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';

import { MfaService } from './auth-mfa.service';
import { PasswordResetService } from './auth-password-reset.service';
import { RateLimitService } from './auth-rate-limit.service';
import { AuthReadFacade } from './auth-read.facade';
import { SessionService } from './auth-session.service';
import { TokenService } from './auth-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [ConfigurationModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    SessionService,
    RateLimitService,
    PasswordResetService,
    MfaService,
    AuthReadFacade,
  ],
  exports: [AuthService, TokenService, AuthReadFacade],
})
export class AuthModule {}
