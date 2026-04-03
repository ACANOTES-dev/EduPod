/**
 * Public API for the BehaviourModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 * Only services in the module's `exports` array are re-exported here.
 */
export { BehaviourModule } from './behaviour.module';
export { BehaviourReadFacade } from './behaviour-read.facade';
export { BehaviourAnalyticsService } from './behaviour-analytics.service';
export { BehaviourConfigService } from './behaviour-config.service';
export { BehaviourExportService } from './behaviour-export.service';
export { BehaviourHistoryService } from './behaviour-history.service';
export { BehaviourSanctionsService } from './behaviour-sanctions.service';
export { BehaviourScopeService } from './behaviour-scope.service';
export { BehaviourService } from './behaviour.service';
export { BehaviourStudentsService } from './behaviour-students.service';
export { SafeguardingConcernsService } from './safeguarding-concerns.service';
export { SafeguardingService } from './safeguarding.service';
