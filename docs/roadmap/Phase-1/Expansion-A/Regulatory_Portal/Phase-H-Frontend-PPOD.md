# Phase H — Frontend: P-POD/POD, CBA, Transfers

**Wave**: 5
**Deploy Order**: d8
**Depends On**: F, D

## Scope

Builds all frontend pages and components for the P-POD/POD sync dashboard (sync status overview, student mapping management, CSV import wizard, CSV export wizard, sync audit log), the CBA result sync page, and the inter-school transfer management pages. Each page consumes the API endpoints built in Phase D.

## Deliverables

### PPOD Pages

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/page.tsx` — P-POD/POD sync status dashboard
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/students/page.tsx` — student mapping list with sync status
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/import/page.tsx` — import from PPOD CSV export (PULL)
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/export/page.tsx` — export for PPOD manual upload (PUSH)
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/sync-log/page.tsx` — sync history audit log

### PPOD Components

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/sync-status-overview.tsx` — pending/synced/error counts
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/student-mapping-table.tsx` — student list with sync status badges
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/sync-diff-preview.tsx` — preview what would change on next push
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/sync-log-table.tsx` — sync history table
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/csv-import-wizard.tsx` — upload → preview field mapping → confirm import
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/csv-export-wizard.tsx` — select scope → preview → generate → download

### CBA Sync

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/cba/page.tsx` — CBA sync status + trigger sync
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/cba-sync-table.tsx` — CBA results pending sync with status

### Transfer Management

- `apps/web/src/app/[locale]/(school)/regulatory/ppod/transfers/page.tsx` — inter-school transfer list (inbound + outbound)
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/transfers/new/page.tsx` — create transfer (outbound early leaver)
- `apps/web/src/app/[locale]/(school)/regulatory/ppod/_components/transfer-form.tsx` — create/edit transfer form

### i18n

- `apps/web/messages/en.json` — **add** PPOD, CBA, transfers keys to `regulatory` namespace
- `apps/web/messages/ar.json` — **add** Arabic translations for same

## Out of Scope

- Tusla, DES, October Returns, anti-bullying pages (Phase G)
- Dashboard and calendar pages (Phase F)
- Backend API services (already built in Phase D)
- Worker processors (Phase E)
- Automated esinet web integration UI (v2 future)

## Dependencies

**Phase F** provides:

- Regulatory section routing structure and layout
- `regulatory-nav.tsx` sub-navigation component
- Sidebar navigation with all child links (including PPOD, CBA, transfers links)
- Core i18n namespace and shared component patterns

**Phase D** provides:

- PPOD API endpoints: sync status, student mappings, sync/import/export, diff preview, sync log
- CBA API endpoints: status, pending results, sync trigger
- Transfer API endpoints: list, create, update, get detail

## Implementation Notes

- **PPOD status dashboard**: Shows sync status counts (pending/synced/changed/error) as summary cards. Recent sync log entries. Quick-action buttons for "Export for PPOD" and "Import from PPOD".
- **Student mapping table**: Sortable/filterable table showing student name, PPSN, PPOD external ID, sync status badge, last synced date. Action column for single-student sync.
- **CSV import wizard**: Multi-step — (1) upload CSV file, (2) preview parsed records with field mapping validation, (3) show create/update/skip counts, (4) confirm import. Uses `react-hook-form` for file upload. Displays validation errors per-record before confirmation.
- **CSV export wizard**: (1) select database type (PPOD/POD) and scope (full/incremental), (2) preview diff (what would be exported), (3) generate CSV, (4) download. Shows record counts and validation warnings.
- **Sync diff preview**: Side-by-side view of current EduPod data vs last-synced snapshot. Highlights changed fields. Grouped by new/updated/unchanged.
- **CBA sync page**: Table of subjects with pending/synced/error counts per subject. Expand to see individual student CBA results. Bulk "Sync All" button + per-student sync. Shows CBA grade descriptors.
- **Transfer form**: `react-hook-form` with `zodResolver(createTransferSchema)`. Fields: direction (outbound/inbound), student (searchable select), other school roll number, school name, transfer date, leaving reason (PPOD codes dropdown), notes.
- **Transfer list**: Filterable by direction (inbound/outbound) and status. Shows student name, other school, date, status badge. Action to update status (accept/reject inbound, mark PPOD confirmed).
- **RTL compliance**: All new components use logical CSS properties. No physical `left`/`right`.
- **Mobile**: Import/export wizards stack steps vertically. Tables in `overflow-x-auto`. Transfer form single-column on mobile.
