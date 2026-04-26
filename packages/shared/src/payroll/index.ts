// ─── Payroll subpath barrel ───────────────────────────────────────────────
//
// Subpath import: `@school/shared/payroll`. The root `packages/shared/src/
// index.ts` is FROZEN to shared-kernel primitives; payroll-domain consumers
// must import from this subpath. See packages/shared/package.json `exports`
// and `typesVersions` for the resolution map.
//
// State machine continues to also be re-exported from the root barrel for
// backwards compatibility with existing finance/payroll callers; everything
// else (job-names, redis-keys, payslip-number, schemas) is subpath-only.

export * from './state-machine';
export * from './job-names';
export * from './redis-keys';
export * from './payslip-number';
export * from './schemas/payslip-snapshot.schema';
export * from './schemas/calc-input.schema';
