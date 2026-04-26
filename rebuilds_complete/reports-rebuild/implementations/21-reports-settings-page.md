# Implementation 21 — Reports Settings Page

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 10, 11, 12
> **Deploys:** web restart only

---

## Goal

Build the admin surface at `Settings → Reports` so tenants can manage AI flags, KPI visibility, default export formats, and sharing defaults. This is where the Owner / Principal toggles AI on or off and absorbs the cost decision.

## What to change

### 1. New page

New file: `apps/web/src/app/[locale]/(school)/settings/reports/page.tsx`.

**Route guard:** `reports.settings` permission required.

**Layout:**

- PageHeader: "Reports settings".
- Tabs: "AI Features" / "KPI Dashboard" / "Defaults".

### 2. AI Features tab

Renders three toggle cards, one per flag:

**AI Narration**

- Toggle: `tenant_ai_flags[reports_narration].enabled`.
- Description: "AI-written executive summaries on the dashboard, each report page, and saved reports. Powered by Claude. Cost: approx $0.01 per generation; cached 10 minutes."
- Monthly usage line: "{N} generations this month (≈ ${cost} estimated)."

**AI Ask-AI**

- Toggle: `reports_ask_ai.enabled`.
- Description: "Staff can ask natural-language questions to build reports. Powered by Claude. Cost: approx $0.02 per query; cached 24h."
- Monthly usage line.

**AI Predictions**

- Toggle: `reports_predictions.enabled`.
- Description: "AI-powered predictions — student risk, attendance forecast, cash-flow forecast. Cost: approx $0.04 per generation; cached 24h."
- Monthly usage line.

**Toggle behaviour:**

- `PUT /v1/tenant/ai-flags/:module_key { enabled: boolean }` (existing endpoint; reused).
- Optimistic update with revert-on-error.
- Confirmation modal on disable if there's active usage ("Disabling this hides AI narratives across all reports. Existing saved reports are unaffected. Continue?").
- Audit log entry written server-side (existing audit mechanism).

### 3. KPI Dashboard tab

For each of the 10 KPIs, a row:

- Icon + label + tooltip preview.
- "Show on dashboard" toggle.

On change, `PUT /v1/reports/kpi-preferences { hidden_kpi_keys: string[] }` which upserts the `reports_kpi_tenant_preferences` row.

### 4. Defaults tab

- **Default export format** — dropdown: PDF / Excel / Word. Used as the default when opening the export menu. Per-tenant.
- **Default timezone for scheduled reports** — dropdown. Defaults to tenant's primary timezone.
- **Default share visibility** — dropdown: Private / Shared with role groups. When creating a new saved report, this is the default.
- **Snapshot retention** — (read-only for now) "Shared snapshots are retained for 90 days." Info-only; future cleanup job isn't built yet.

Each setting persists to a `reports_tenant_settings` key-value table. If this table doesn't exist, add it in an impl-21 forward migration (small, one table):

```prisma
model ReportsTenantSettings {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id        String   @unique @db.Uuid
  default_export_format  String @default("pdf")
  default_schedule_timezone String @default("Europe/Dublin")
  default_share_visibility  SavedReportVisibility @default(private)
  updated_at       DateTime @default(now()) @updatedAt @db.Timestamptz()

  tenant           Tenant   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  @@map("reports_tenant_settings")
}
```

With the usual RLS policy.

Alternatively, add these fields to the existing `reports_kpi_tenant_preferences` table (rename it to `reports_tenant_settings` with an empty `hidden_kpi_keys` default). Decide at implementation time based on schema drift risk — the single-table approach is tidier.

### 5. API endpoints needed

- `GET /v1/reports/settings` — returns full tenant reports settings incl. AI flag states, KPI preferences, defaults.
- `PUT /v1/reports/settings` — upserts.
- (Reuse existing `GET/PUT /v1/tenant/ai-flags/:module_key` for AI flags.)

### 6. Link from AI panels

The "Disable AI" link on every AI summary / Ask AI / prediction panel deep-links to `/settings/reports?tab=ai-features#{module_key}` with smooth scroll to the right toggle.

## Testing requirements

- **Component tests** — settings page renders, toggles fire the right API calls.
- **Permission test** — user without `reports.settings` can't access the page (redirected).
- **Playwright e2e** — toggle AI narration off → return to dashboard → AI panel absent → toggle back on → panel returns.

## Post-deploy verification

1. Navigate as owner@nhqs.test to `/settings/reports`.
2. Toggle AI narration off → go to `/reports` → AI panel gone.
3. Hide `attendance_today` KPI → go to `/reports` → KPI grid has 9 cards.
4. Set default export format to Excel → new export dropdown shows Excel as first option.

## Follow-ups for subsequent waves

- **Impl 22 (Polish)** — translations (keys for all toggle descriptions).

## Rollback

`git revert <sha>` — settings page disappears. AI flags can still be managed via the existing admin endpoints directly. Safe.
