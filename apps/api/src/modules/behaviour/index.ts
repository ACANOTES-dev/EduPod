/**
 * Public API for the BehaviourModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 * Only services consumed by external modules are re-exported here.
 */
export { BehaviourModule } from './behaviour.module';
export { BehaviourReadFacade } from './behaviour-read.facade';
export { BehaviourHistoryService } from './behaviour-history.service';
