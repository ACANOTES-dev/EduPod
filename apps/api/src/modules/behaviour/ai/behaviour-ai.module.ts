import { Module } from '@nestjs/common';

import { AiModule } from '../../ai/ai.module';
import { AiFlagsModule } from '../../ai-flags/ai-flags.module';
import { AuthModule } from '../../auth/auth.module';
import { ConfigurationModule } from '../../configuration/configuration.module';
import { GdprModule } from '../../gdpr/gdpr.module';
import { StudentsModule } from '../../students/students.module';
import { BehaviourAnalyticsModule } from '../behaviour-analytics.module';
import { BehaviourCoreModule } from '../behaviour-core.module';

import { BehaviourAiParseService } from './behaviour-ai-parse.service';
import { BehaviourAiRateLimiterService } from './behaviour-ai-rate-limiter.service';
import { BehaviourAiSummaryService } from './behaviour-ai-summary.service';
import { BehaviourAIController } from './behaviour-ai.controller';
import { BehaviourAIService } from './behaviour-ai.service';

/**
 * BehaviourAIModule — owns the four behaviour AI endpoints:
 *   POST /v1/behaviour/incidents/ai-parse
 *   GET  /v1/behaviour/students/:studentId/ai-summary
 *   POST /v1/behaviour/analytics/ai-query
 *   GET  /v1/behaviour/analytics/ai-query/history
 *
 * Every route is gated by `@RequiresAiFlag('behaviour')` + per-endpoint
 * `@RequiresPermission`. The existing `BehaviourAIService` (NL query
 * pipeline) is imported from `BehaviourAnalyticsModule` so it stays the
 * single source of truth for NL query processing — this module just
 * surfaces it alongside the new parse and summary services.
 *
 * `BehaviourAiRateLimiterService` is exported in case other callers need
 * to reuse the rate limit for shared AI endpoints in later waves.
 */
@Module({
  imports: [
    AiModule,
    AiFlagsModule,
    AuthModule,
    ConfigurationModule,
    GdprModule,
    StudentsModule,
    BehaviourCoreModule,
    BehaviourAnalyticsModule,
  ],
  controllers: [BehaviourAIController],
  providers: [
    BehaviourAIService,
    BehaviourAiParseService,
    BehaviourAiSummaryService,
    BehaviourAiRateLimiterService,
  ],
  exports: [BehaviourAIService, BehaviourAiRateLimiterService],
})
export class BehaviourAIModule {}
