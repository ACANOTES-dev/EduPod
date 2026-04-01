import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CasesController } from './controllers/cases.controller';
import { InterventionsController } from './controllers/interventions.controller';
import { ParentContactsController } from './controllers/parent-contacts.controller';
import { ReferralsController } from './controllers/referrals.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { CaseService } from './services/case.service';
import { InterventionActionService } from './services/intervention-action.service';
import { InterventionService } from './services/intervention.service';
import { NepsVisitService } from './services/neps-visit.service';
import { ParentContactService } from './services/parent-contact.service';
import { ReferralPrepopulateService } from './services/referral-prepopulate.service';
import { ReferralRecommendationService } from './services/referral-recommendation.service';
import { ReferralService } from './services/referral.service';

// ─── PastoralCasesModule ───────────────────────────────────────────────────────
// Cases, referrals, interventions, parent contacts.

@Module({
  imports: [
    AuthModule,
    PastoralCoreModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    CasesController,
    InterventionsController,
    ParentContactsController,
    ReferralsController,
  ],
  providers: [
    CaseService,
    InterventionActionService,
    InterventionService,
    NepsVisitService,
    ParentContactService,
    ReferralPrepopulateService,
    ReferralRecommendationService,
    ReferralService,
  ],
  exports: [
    CaseService,
    InterventionService,
    NepsVisitService,
    ParentContactService,
    ReferralService,
  ],
})
export class PastoralCasesModule {}
