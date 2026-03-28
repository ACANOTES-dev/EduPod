import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { SecurityIncidentsController } from './security-incidents.controller';
import { SecurityIncidentsService } from './security-incidents.service';

@Module({
  imports: [AuthModule, TenantsModule],
  controllers: [SecurityIncidentsController],
  providers: [SecurityIncidentsService],
  exports: [SecurityIncidentsService],
})
export class SecurityIncidentsModule {}
