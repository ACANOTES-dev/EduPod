import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ParentInquiriesController } from './parent-inquiries.controller';
import { ParentInquiriesService } from './parent-inquiries.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [ParentInquiriesController],
  providers: [ParentInquiriesService],
  exports: [ParentInquiriesService],
})
export class ParentInquiriesModule {}
