# Implementation 22 — Polish: Translations, Mobile, A11y, Smoke, Docs

> **Wave:** 5 (single implementation)
> **Depends on:** 14, 15, 16, 17, 18, 19, 20, 21
> **Deploys:** web restart only

---

## Goal

Close the rebuild with the cross-cutting polish work: complete English + Arabic translations, mobile-responsive pass, a11y audit, Playwright smoke pack, and the final docs updates (architecture + feature map). This is the phase that takes the rebuild from "it works" to "it ships."

## What to change

### 1. Translation sweep — English

Single coherent pass over `apps/web/messages/en.json`. All new translation keys from impls 01–21 land here with proper values.

**Keys declared across prior phases:**

- `reports.analytics.dashboardTitle`, `reports.analytics.dashboardDescription` — already exist; verify.
- `reports.analytics.kpi.*` — 10 KPI label keys (already exist) + 10 new `kpiTooltip.*` keys.
- `reports.analytics.loadErrorTitle`, `loadErrorBody` — new.
- `reports.analytics.<reportKey>Desc` — one per domain report page.
- `reports.analytics.studentExport`, `writeOffs`, `notificationDelivery` — renamed from `reports.studentExport` etc.
- `reports.analytics.share.*` — dialog labels (~20 keys).
- `reports.analytics.settings.*` — settings page labels (~30 keys).
- `reports.analytics.builder.*` — builder UI labels (~50 keys).
- `reports.analytics.scheduled.*` — scheduled reports page (~25 keys).
- `reports.analytics.alerts.*` — alerts page (~20 keys).
- `reports.analytics.askAi.*` — Ask AI page (~15 keys) + 5 additional suggested-queries.
- `reports.analytics.predictions.*` — prediction panels (~15 keys).
- `reports.analytics.board.*` — board report (~30 keys including all 8 sections).
- `reports.analytics.compliance.*` — compliance report (~30 keys for all fields).
- `reports.analytics.ai.enabled`, `ai.disabled`, `ai.unavailable`, `ai.rateLimited` — AI states.
- `reports.analytics.fields.<subject>.<domain>.<field>` — subject registry field labels. Hundreds of keys; structure them hierarchically.

**Delete stub keys:**

- Line 233: `"gradeAnalytics": "Analytics"` — delete.
- Any leftover `MOCK_*`-style keys.

### 2. Translation sweep — Arabic

Full parity in `apps/web/messages/ar.json`. Every key added to `en.json` gets an Arabic translation.

For subject registry field labels — there are hundreds. Use consistent translation patterns (e.g. "Attendance rate" = "معدل الحضور" — reuse existing phrases where possible to stay consistent with the rest of the app).

Verify RTL rendering on the builder's three-pane layout, the tooltip positioning, the KPI cards, the prediction panels, and the share dialog.

### 3. Mobile responsiveness pass

Sweep every new/changed page at 375px viewport. Reference `.claude/rules/frontend.md` "Mobile Responsiveness — Mandatory" section.

**Pages to verify:**

- `/reports` — KPI grid collapses to 2 cols; tooltips positioned inside viewport; quick-link grid 1 col.
- `/reports/attendance`, `/grades`, `/demographics`, `/admissions`, `/staff`, `/student-progress`, `/insights` — filter controls stack; tables scroll horizontally.
- `/reports/builder` — three-pane collapses to single pane with bottom sheet for preview on mobile.
- `/reports/scheduled`, `/reports/alerts` — list uses card layout instead of table on mobile.
- `/reports/ask-ai` — input + suggestions stay usable at 375px.
- `/reports/board`, `/reports/compliance` — sections stack cleanly; generation controls responsive.
- `/reports/shared/:share_id` — download buttons stay tappable (≥ 44×44px).
- `/settings/reports` — tab bar scrollable; toggles full-width.

Any violations: fix inline. Common pattern: `min-w-0` on flex children, `overflow-x-auto` on table wrappers, `w-full` on inputs, ≥ `text-base` (16px) on input fields.

### 4. Accessibility pass

- **Keyboard navigation** — every interactive element reachable via Tab. The field tree in the builder navigable via arrow keys + Space to toggle.
- **ARIA labels** — info-icon tooltips use `aria-label`; sparkline charts have `aria-hidden` (they're decorative); the KPI cards have meaningful `aria-label` including value.
- **Focus rings** — visible on all controls.
- **Screen reader** — test with VoiceOver on the dashboard and builder: KPI values announced, tooltip content accessible, filter builder semantics clear.
- **Color contrast** — every colour used for severity (amber / red warning states) passes WCAG AA against the background.
- **Error states** — announced via `aria-live="polite"` where appropriate.

### 5. Playwright smoke pack

New suite: `apps/web/e2e/reports-rebuild.spec.ts`.

**Smoke scenarios:**

1. Dashboard loads with real data for owner@nhqs.test.
2. Drill down into attendance report, verify charts render.
3. Create a custom report: subject=Student, add First Name + Year Group + Attendance Rate, add filter Attendance < 85%, save as "Test Attendance Report", verify in sidebar, export PDF (verify download).
4. Ask-AI (if flag-enabled): type "list Year 10 students with overdue fees", verify translation populates builder, run preview, verify rows.
5. Schedule the saved report to run daily, verify it appears in scheduled list.
6. Create an alert on overdue_invoices_count > 10, verify it appears.
7. Share the saved report with vice-principal role group, log in as VP, verify inbox message with attachment.
8. Generate board report for current term with all sections, verify each section renders, export PDF.
9. Generate compliance report for current academic year, verify fields render, handle gaps gracefully.
10. Settings page: toggle AI narration off, verify dashboard loses AI panel.

Target runtime: < 10 minutes total. If longer, split or selectively skip.

### 6. Feature map update

Update `docs/architecture/feature-map.md` §19 (Reports & Analytics) as a single coherent rewrite:

- Update "What it does" to reflect the rebuilt scope.
- Add the custom builder as a first-class feature.
- Update backend endpoint count.
- Add new worker jobs.
- Add the new permission keys.
- Add cross-module dependency on `inbox` (for sharing).
- Update the "Depends on" list.

Also update the Quick Reference table at the top of the file (endpoint counts, pages counts).

### 7. Architecture docs

Per `.claude/rules/architecture-policing.md`:

- `docs/architecture/module-blast-radius.md` — add Reports' new dependencies (inbox, ai-flags, mailer) and what breaks if they change.
- `docs/architecture/event-job-catalog.md` — ensure all four new BullMQ jobs from impls 04/08/09/13 are documented.
- `docs/architecture/state-machines.md` — add the scheduled-report lifecycle (enabled/paused/deleted) and alert lifecycle.
- `docs/architecture/danger-zones.md` — add a zone for "AI cost spiralling" (explaining the flag-gating + per-call audit + 10-min cache strategy).

### 8. Session-visible rollout notes

Update `docs/plans/ux-redesign-final-spec.md` if it references the old reports flow (small; verify).

Leave a one-paragraph note in `docs/operations/` capturing the rollout decisions (default-off AI flags, 90-day snapshot retention deferred, cleanup cron deferred).

### 9. Final deploy verification

After all the above are deployed:

1. Run the full smoke pack against production NHQS.
2. Manual walkthrough as a principal would: hub → tooltips → drill-down → builder → save → export → schedule → share.
3. Check prod logs for warnings — AI-flag-disabled 403s are expected; any 500s are bugs.
4. Confirm `scheduled_report_runs`, `report_alert_runs`, `report_share_log`, `ai_logs` are receiving rows.
5. Post the final completion record to IMPLEMENTATION_LOG.md §5 summarising the rebuild.

## Testing requirements

- **Every translation key** has a corresponding value in both `en.json` and `ar.json`. Script this as a test: `node scripts/check-translations.js reports`.
- **A11y violations** scanned via `axe-core` on each page — zero serious violations.
- **Smoke pack** green.

## Post-deploy verification

Full manual walkthrough per §9 above.

## Follow-ups

None in scope. This is the final phase.

Deferred items (documented in the completion record but not blocking this rebuild):

- Snapshot lifecycle cleanup cron.
- Scheduled board reports via the scheduled-reports worker (small adaptation).
- State-KPI historical snapshots for longer sparklines.
- Chart embedding in Word exports.
- Cross-tenant report templates.

## Rollback

`git revert <sha>` — polish-only phase. Reverting loses the translation fixes, mobile tweaks, a11y improvements, and smoke tests. Safe; functional regressions are small.
