import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { MeilisearchClient } from './meilisearch.client';
import { SearchController } from './search.controller';
import { SearchIndexService } from './search-index.service';
import { SearchService } from './search.service';

@Module({
  imports: [AuthModule],
  controllers: [SearchController],
  providers: [SearchService, SearchIndexService, MeilisearchClient],
  exports: [SearchService, SearchIndexService, MeilisearchClient],
})
export class SearchModule {}
