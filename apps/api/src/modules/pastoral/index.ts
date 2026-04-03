/**
 * Public API for the PastoralModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 * Only services consumed by external modules are re-exported here.
 */
export { PastoralModule } from './pastoral.module';
export { ConcernService } from './services/concern.service';
export { ConcernVersionService } from './services/concern-version.service';
export { PastoralDsarService } from './services/pastoral-dsar.service';
export { PastoralEventService } from './services/pastoral-event.service';
