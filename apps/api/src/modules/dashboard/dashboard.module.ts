import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ReportsModule } from '../reports/reports.module';
import { StudentsModule } from '../students/students.module';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, ReportsModule, StudentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
