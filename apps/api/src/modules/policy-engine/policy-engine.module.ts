import { Module, forwardRef } from '@nestjs/common';

import { BehaviourModule } from '../behaviour/behaviour.module';

import { PolicyEvaluationEngine } from './policy-evaluation-engine';
import { PolicyReplayService } from './policy-replay.service';
import { PolicyRulesService } from './policy-rules.service';

@Module({
  imports: [forwardRef(() => BehaviourModule)],
  providers: [PolicyEvaluationEngine, PolicyReplayService, PolicyRulesService],
  exports: [PolicyEvaluationEngine, PolicyRulesService, PolicyReplayService],
})
export class PolicyEngineModule {}
