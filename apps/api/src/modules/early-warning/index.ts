/**
 * Public API for the EarlyWarningModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 */
export { EarlyWarningModule } from './early-warning.module';
export { EarlyWarningConfigService } from './early-warning-config.service';
export { EarlyWarningService } from './early-warning.service';
export { EarlyWarningTriggerService } from './early-warning-trigger.service';
