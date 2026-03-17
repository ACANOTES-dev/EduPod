import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalWorkflowsController } from './approval-workflows.controller';
import { ApprovalWorkflowsService } from './approval-workflows.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'notifications' },
      { name: 'finance' },
      { name: 'payroll' },
    ),
  ],
  controllers: [ApprovalWorkflowsController, ApprovalRequestsController],
  providers: [ApprovalWorkflowsService, ApprovalRequestsService],
  exports: [ApprovalRequestsService],
})
export class ApprovalsModule {}
