import { Module } from '@nestjs/common';

import { WellbeingAggregateController } from './wellbeing-aggregate.controller';
import { WellbeingAggregateService } from './wellbeing-aggregate.service';

/**
 * WellbeingAggregateModule — owns `GET /v1/wellbeing/dashboard-summary`.
 *
 * The service composes the super-hub's KPIs, pending-attention banner,
 * hub counters, and recent-activity feed by reading through the global
 * read-facades (`ReadFacadesModule`). No feature-module imports are needed
 * here — facades are registered globally by `ReadFacadesModule` in
 * `app.module.ts`, which is why this module can stay lean and avoid the
 * circular-dependency risk that would come with importing BehaviourModule,
 * PastoralModule, etc. directly.
 */
@Module({
  controllers: [WellbeingAggregateController],
  providers: [WellbeingAggregateService],
})
export class WellbeingAggregateModule {}
