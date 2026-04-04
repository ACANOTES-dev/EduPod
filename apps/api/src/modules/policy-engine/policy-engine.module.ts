import { Module, forwardRef } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { BehaviourModule } from '../behaviour/behaviour.module';

import { PolicyEvaluationEngine } from './policy-evaluation-engine';
import { PolicyReplayService } from './policy-replay.service';
import { PolicyRulesService } from './policy-rules.service';

@Module({
  imports: [forwardRef(() => BehaviourModule), AcademicsModule],
  providers: [PolicyEvaluationEngine, PolicyReplayService, PolicyRulesService],
  exports: [PolicyEvaluationEngine, PolicyRulesService, PolicyReplayService],
})
export class PolicyEngineModule {}
