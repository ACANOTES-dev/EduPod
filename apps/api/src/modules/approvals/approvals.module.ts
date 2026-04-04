import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module';

import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalWorkflowsController } from './approval-workflows.controller';
import { ApprovalWorkflowsService } from './approval-workflows.service';
import { ApprovalsReadFacade } from './approvals-read.facade';

@Module({
  imports: [
    RbacModule,
    BullModule.registerQueue({ name: 'notifications' }, { name: 'finance' }, { name: 'payroll' }),
  ],
  controllers: [ApprovalWorkflowsController, ApprovalRequestsController],
  providers: [ApprovalWorkflowsService, ApprovalRequestsService, ApprovalsReadFacade],
  exports: [ApprovalRequestsService, ApprovalsReadFacade],
})
export class ApprovalsModule {}
