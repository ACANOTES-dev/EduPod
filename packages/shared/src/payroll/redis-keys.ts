// ─── Payroll Overhaul (Wave 1) — Shared Redis key builders ──────────────────
//
// Single source of truth for the Redis keys used to coordinate payroll
// background work between the API (writer/reader) and the worker
// (writer). Both sides import the same builders so the formats cannot
// diverge. Every key is tenant-scoped to prevent collision and
// accidental cross-tenant reads.
//
// Imported by:
//   - apps/api/src/modules/payroll/* (status/PDF reads — Wave 3+)
//   - apps/worker/src/processors/payroll/* (status/PDF writes — Wave 3)

export const buildSessionGenStatusKey = (tenantId: string, runId: string): string =>
  `payroll:session-gen:${tenantId}:${runId}`;

export const buildMassExportStatusKey = (tenantId: string, runId: string): string =>
  `payroll:mass-export:${tenantId}:${runId}:status`;

export const buildMassExportPdfKey = (tenantId: string, runId: string): string =>
  `payroll:mass-export:${tenantId}:${runId}:pdf`;

// ─── Cache settings (used by both reader and writer) ──────────────────────
//
// 20-minute window on the PDF blob (extended from the legacy 5 minutes) gives
// the UI a fair download window even on slow connections. The status TTLs
// stay short because they're polled by the dashboard while the job runs.

export const SESSION_GEN_STATUS_TTL_SECONDS = 600;
export const MASS_EXPORT_STATUS_TTL_SECONDS = 600;
export const MASS_EXPORT_PDF_TTL_SECONDS = 1200;
