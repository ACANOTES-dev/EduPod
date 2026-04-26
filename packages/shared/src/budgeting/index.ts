/**
 * Shared types and Zod schemas for the budgeting & analysis ("modeling")
 * rebuild. Consumed by the API, worker, and web layers via the
 * `@school/shared/budgeting` subpath export.
 *
 * Surface as of Impl 02 (driver engine):
 *   - Foundation enums + DTOs from impl 01: status / category / type /
 *     period enums + shareable-link create / list / revoke schemas.
 *   - Canonical driver shape (`Drivers`, `PartialDrivers`, `capexItemSchema`,
 *     `buildDefaultDrivers`).
 *   - Source-data snapshot shape captured at model creation
 *     (`SourceDataSnapshot`).
 *   - Pure scenario-merge helpers (`mergeDriverOverrides`,
 *     `resolveDriversForYear`).
 *   - Pure annual-model engine (`runEngine`) and event-budget engine
 *     (`runEventEngine`). Same code runs on backend services, the
 *     board-pack worker, and the frontend workspace's live recompute.
 *
 * The engines are dependency-free pure functions: no IO, no async, no
 * hidden state. Drift between front and back is impossible by construction.
 */
export * from './drivers';
export * from './scenarios';
export * from './line-items';
export * from './snapshots';
export * from './event-budgets';
export * from './trip-fee-integration';
export * from './variance';
export * from './shareable-links';
export * from './source-data';
export * from './scenario-merge';
export * from './engine';
export * from './event-engine';
export * from './financial-models';
export * from './tenant-preferences';
