import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { PermissionsController } from './permissions.controller';
import { RbacReadFacade } from './rbac-read.facade';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: 'notifications' })],
  controllers: [
    RolesController,
    PermissionsController,
    MembershipsController,
    InvitationsController,
  ],
  providers: [RolesService, MembershipsService, InvitationsService, RbacReadFacade],
  exports: [RolesService, MembershipsService, InvitationsService, RbacReadFacade],
})
export class RbacModule {}
