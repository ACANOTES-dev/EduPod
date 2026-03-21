import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { MeilisearchClient } from './meilisearch.client';
import { SearchIndexService } from './search-index.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexService, MeilisearchClient],
  exports: [SearchService, SearchIndexService, MeilisearchClient],
})
export class SearchModule {}
