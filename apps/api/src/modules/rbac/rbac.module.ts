import { Module } from '@nestjs/common';

import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController, MembershipsController, InvitationsController],
  providers: [RolesService, MembershipsService, InvitationsService],
  exports: [RolesService, MembershipsService, InvitationsService],
})
export class RbacModule {}
