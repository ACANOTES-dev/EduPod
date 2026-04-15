import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { RoomsModule } from '../rooms/rooms.module';

import { ClassSubjectRequirementsController } from './class-subject-requirements.controller';
import { ClassSubjectRequirementsService } from './class-subject-requirements.service';

@Module({
  imports: [AuthModule, ClassesModule, RoomsModule],
  controllers: [ClassSubjectRequirementsController],
  providers: [ClassSubjectRequirementsService],
  exports: [ClassSubjectRequirementsService],
})
export class ClassSubjectRequirementsModule {}
