import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { PermissionsController } from './permissions.controller';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'notifications' })],
  controllers: [RolesController, PermissionsController, MembershipsController, InvitationsController],
  providers: [RolesService, MembershipsService, InvitationsService],
  exports: [RolesService, MembershipsService, InvitationsService],
})
export class RbacModule {}
