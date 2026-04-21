import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { GuardianRestrictionInterceptor } from './guardian-restriction.interceptor';

/**
 * WB-C-02 — Registers the {@link GuardianRestrictionInterceptor} globally.
 *
 * No `imports` because the consumed dependencies (`ParentReadFacade`,
 * `BehaviourReadFacade`) are provided by the global `ReadFacadesModule`,
 * already loaded by AppModule. Adding `imports` here triggered a
 * cross-module DI cycle on AppModule boot — see the interceptor file's
 * docblock for the rationale.
 */
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: GuardianRestrictionInterceptor,
    },
  ],
})
export class GuardianRestrictionInterceptorModule {}
