/**
 * Public API for the TenantsModule.
 * Import from this barrel (or via NestJS DI) — do NOT import internal files directly.
 */
export { TenantsModule } from './tenants.module';
export { SequenceService } from '../sequence/sequence.service';
export { TenantsService } from './tenants.service';
