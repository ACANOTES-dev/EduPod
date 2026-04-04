import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ParentsModule } from '../parents/parents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StudentsModule } from '../students/students.module';

import { ParentInquiriesReadFacade } from './parent-inquiries-read.facade';
import { ParentInquiriesController } from './parent-inquiries.controller';
import { ParentInquiriesService } from './parent-inquiries.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'notifications' }),
    ParentsModule,
    StudentsModule,
  ],
  controllers: [ParentInquiriesController],
  providers: [ParentInquiriesService, ParentInquiriesReadFacade],
  exports: [ParentInquiriesService, ParentInquiriesReadFacade],
})
export class ParentInquiriesModule {}
