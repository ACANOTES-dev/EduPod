# Implementation 17 — Scheduled Reports + Alerts UI

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 08, 09
> **Deploys:** web restart only

---

## Goal

Build the admin UI for managing scheduled reports and report alerts. The backend services + worker are live (impls 08, 09); this phase exposes them as usable screens. Two pages:

- `/reports/scheduled` — list + CRUD + run history.
- `/reports/alerts` — list + CRUD + evaluation history.

## What to change

### 1. Scheduled reports page rewrite

Full rewrite of `apps/web/src/app/[locale]/(school)/reports/scheduled/page.tsx`.

**List view:**

- Table columns: Name, Source report, Cadence (cron → human: "Every Monday at 8 AM"), Delivery channels, Next run, Last run status, Enabled (toggle), Actions.
- Row actions: Edit, View history, Run now, Delete.
- Top-right: "+ New scheduled report" button.
- Empty state: "No scheduled reports yet. Schedule a report to receive it by email or in your inbox on a regular cadence." + "+ New" CTA.

**Create/Edit modal:**

- **Saved report** picker — dropdown of user's saved reports (GET `/v1/reports/builder`).
- **Name** (defaults to "{Report name} schedule").
- **Cadence** — two modes:
  - Simple: "Daily / Weekly on [day] / Monthly on [date] / Every N hours".
  - Advanced: raw cron expression.
- **Time** — time-of-day picker.
- **Timezone** — defaults to tenant default; overridable per schedule.
- **Formats** — checkbox group PDF / Excel / Word. At least one required.
- **Delivery channels** — checkboxes:
  - Email: multi-email input chip field.
  - Inbox: multi-user picker (reuse inbox's `InboxAudiencePicker`).
- **Enabled** — toggle, default on.

**Run history drawer:**

- Triggered by "View history" row action.
- Lists last 50 runs from `GET /v1/reports/scheduled/:id/runs`.
- Columns: Started at, Finished at, Status, Rows, Delivered via, Error (if any), Artifact download.

### 2. Report alerts page rewrite

Full rewrite of `apps/web/src/app/[locale]/(school)/reports/alerts/page.tsx`.

**List view:**

- Table columns: Name, Metric (human label), Condition ("greater than 5"), Current value, Recipients (count), Enabled, Last fired, Actions.
- Row actions: Edit, View history, Disable/Enable, Delete.
- Top-right: "+ New alert" button.

**Create/Edit modal:**

- **Name** (required).
- **Metric** — dropdown of the 8 metric keys from impl 09's registry, each with a human label.
- **Operator** — dropdown: greater than / greater than or equal / less than / less than or equal / equals / not equals.
- **Threshold** — number input, type-matched to the metric (percentage for attendance-rate metrics).
- **Evaluation schedule** — preset (Every 30 minutes / Every hour / Every day at 8 AM) or raw cron.
- **Recipients** — multi-user picker.
- **Also email** — boolean toggle (default off).
- **Enabled** — toggle, default on.

**Evaluation history drawer:**

- Last 50 evaluations.
- Columns: Evaluated at, Outcome (ok / threshold_crossed / error), Measured value, Threshold, Recipients notified, Error (if any).

### 3. Form conventions

Both forms use `react-hook-form` + `zodResolver` per repo conventions. Zod schemas live in `@school/shared/reports`.

All inputs follow the frontend.md mobile rules (font-size ≥ 16px, `w-full` on mobile).

### 4. Integration points

- Saved reports dropdown fetches from `GET /v1/reports/builder?visibility=mine` (paginated).
- Inbox audience picker — reuse the existing component from `new-inbox/`.
- User multi-picker — reuse the existing `PeoplePickerField` or equivalent.

### 5. "Schedule this report" shortcut

Wire the "Schedule" button on a saved report page (impl 16) to open the scheduled-reports modal with `saved_report_id` pre-selected. Deep-link via query param: `/reports/scheduled?new=true&report_id=<id>`.

### 6. Access control

- Only users with `reports.view` see these pages.
- Creating/editing scheduled reports or alerts requires owning the underlying saved report (or being Owner/Principal).
- Recipients must be reachable under the tenant's messaging policy (the backend enforces this at send time; the UI doesn't pre-validate).

## Testing requirements

- **Component tests** for each form.
- **Playwright e2e** — create a scheduled report with cadence "Every day 9 AM", verify it appears in the list, cadence renders human-readably.
- **Playwright e2e** — create an alert with threshold `overdue_invoices_count > 10`, verify it appears.
- **History drawer** — opens and displays run rows from the backend.

## Post-deploy verification

1. Create a test scheduled report via the UI; verify it appears; wait for the cron; verify "Last run status" updates to succeeded.
2. Create a test alert; verify it evaluates; if threshold crossed, verify inbox notification received.
3. Disable the alert; verify it no longer fires.
4. Delete the scheduled report; verify it's gone.

## Follow-ups for subsequent waves

- **Impl 22 (Polish)** — mobile pass on the modal layouts.

## Rollback

`git revert <sha>` — pages revert to stub. Not ideal; safe.
