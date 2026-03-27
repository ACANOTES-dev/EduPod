import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { GdprTokenController } from './gdpr-token.controller';
import { GdprTokenService } from './gdpr-token.service';

@Module({
  imports: [AuthModule],
  controllers: [GdprTokenController],
  providers: [GdprTokenService],
  exports: [GdprTokenService],
})
export class GdprModule {}
