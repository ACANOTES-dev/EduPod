import { Module } from '@nestjs/common';

import { AdmissionsModule } from '../admissions/admissions.module';
import { AuthModule } from '../auth/auth.module';
import { HouseholdsModule } from '../households/households.module';
import { ParentsModule } from '../parents/parents.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { MeilisearchClient } from './meilisearch.client';
import { SearchIndexService } from './search-index.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    AuthModule,
    StudentsModule,
    ParentsModule,
    StaffProfilesModule,
    HouseholdsModule,
    AdmissionsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexService, MeilisearchClient],
  exports: [SearchService, SearchIndexService, MeilisearchClient],
})
export class SearchModule {}
