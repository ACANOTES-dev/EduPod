# Reports Rebuild — Master Plan

> **Status:** Plan locked. Implementation split into 22 tasks across 5 waves. See `IMPLEMENTATION_LOG.md` for execution rules, wave ordering, and completion records.

---

## 1. Why we're building this

The Reports module is the oldest part of the product and the most architecturally complete — there are 20 pages, 64 API endpoints, 20 services, a `SavedReport` table, AI narration, scheduled reports, report alerts, PDF/Excel export, and a working morph-shell sub-strip. Structurally it is further along than any other module in the codebase.

**But almost all of it is wired to mock data.** Verified in audit:

- The 10 KPI cards on `/reports` all render from a hardcoded fallback object in `apps/web/src/app/[locale]/(school)/reports/page.tsx:331-347` that fires on any backend error — we cannot tell if a number is real or the mock.
- `/reports/grades`, `/reports/demographics`, `/reports/insights`, `/reports/compliance` each hardcode their chart data (`MOCK_PASS_FAIL`, `NATIONALITY_DATA`, `MOCK_SCATTER`, etc.) even though the backend endpoints exist.
- `custom-report-builder.service.ts:261-342` (`executeReport`) handles only `students`, `staff`, `admissions` with hardcoded column selects; `dimensions_json`, `measures_json`, and `filters_json` are not read at all.
- `ScheduledReportsService.execute()` and `ReportAlertsService.checkAndTrigger()` exist but no BullMQ processor triggers them on a cron.
- `BoardReportService.generateBoardReport()` returns stubbed aggregates; `ComplianceReportService` marks compliance fields `hasGap: true` with no data source.
- The export service (`report-export.service.ts`) covers PDF (Puppeteer) and Excel (`xlsx`) but has no Word implementation despite a DOCX button in the UI.
- Report titles use inconsistent translation-key namespaces (`reports.analytics.*` vs `reports.*`), and `en.json:233` has a stub `"gradeAnalytics": "Analytics"` that renders as the wrong title on at least one page.

The rebuild takes every one of those gaps and closes it end-to-end. It also **reshapes the product** in three specific ways the audit surfaced:

1. **The KPI dashboard moves from roster-count metrics (total students, active staff) to movable daily/weekly metrics** that give school admins something they can act on this week. Each KPI gets an info-icon tooltip explaining what it means and how it's calculated.
2. **The custom report builder becomes a real first-class feature.** Admins can build cross-module reports — "list of students with their grades, latest behaviour incident, emergency contact, and outstanding fees" — through a curated subject-and-field-tree UI (no SQL, no join drawing). Every saved report is named and auto-persisted; deletable; optionally shareable into the inbox.
3. **AI becomes the flagship capability of this module.** Reports is the single most impactful surface for AI in the product. Three AI features — narration, ask-AI, predictions — ship behind tenant-level `tenant_ai_flags` toggles (off by default; tenants opt in and absorb the cost). Every AI output is cached, traceable, and permission-scoped.

This rebuild is intentionally large because a half-finished reports module compounds: every KPI a principal distrusts, every broken title, every mock chart, every stub report the board receives — all erode confidence in the product as a reporting system. Either we ship a reporting module that is a genuine differentiator, or we don't ship one.

---

## 2. Scope

### In scope

- **KPI dashboard rebuild** — new 10-KPI set, info-icon tooltips, real data wired, 5-minute cache, error states (not silent mock fallback), sparklines on real historical data.
- **All individual report pages** finished end-to-end — attendance, grades, demographics, admissions, staff, student progress, cross-module insights. Kill every `MOCK_*` constant.
- **Custom Report Builder** — Option A structure (primary subject + joined facets). 11 report subjects. Field trees curated per subject, grouped by domain, respecting field-level permissions. Real query execution engine replacing the current stub. Auto-save with mandatory name. Delete. Page + chart visualisation. Paginated preview.
- **Scheduled reports** — BullMQ cron worker that actually executes scheduled reports and emails recipients the export artifact.
- **Report alerts** — BullMQ cron worker that evaluates alert rules and drops notifications when thresholds are crossed.
- **Board Report** aggregation — implement the section-by-section data layer so the board packet is real.
- **Compliance Report** aggregation — source every compliance field from its domain model.
- **Export pipeline completion** — PDF (improve branding), Excel (improve formatting), **Word (new implementation via `docx` npm package)**.
- **AI — three features, three tenant flags.** `reports_narration`, `reports_ask_ai`, `reports_predictions`. Each off by default. Each gated at API controller level and hidden at the UI level when off. All go through the existing `AnthropicClientService`. Response caching keyed by data hash + prompt. Full audit log via existing `ai_logs` table.
- **Share a saved report into the inbox** — share button → audience picker (reuses inbox's picker) → format selection → export generated → inbox broadcast created with the export as attachment + deep-link snapshot. Snapshot-only: recipient sees the file, not a live re-query.
- **Reports Settings admin page** — `Settings → Reports` covering AI flag toggles, default export format, default scheduled-report timezone, sharing visibility rules.
- **Translation sweep** — every report title normalised to `reports.analytics.<name>`; stubs removed; Arabic parity.
- **Mobile + a11y pass** — every new surface usable at 375px; keyboard navigation and screen-reader labels on the builder's field tree; tooltips accessible.
- **Smoke tests** — Playwright pass covering the reports hub, each report page, the builder round-trip (create → run → save → share → delete), and scheduled-report firing.
- **Feature map + architecture docs** — update `docs/architecture/feature-map.md` §19, `module-blast-radius.md`, `event-job-catalog.md` (new BullMQ jobs), `state-machines.md` (scheduled-report lifecycle).

### Out of scope for this rebuild

- **No student-facing or parent-facing reports surface.** Reports remains admin-only (Owner / Principal / Vice Principal / plus role-scoped access to specific reports like Accounting → Finance reports, Teacher → gradebook analytics).
- **No cross-tenant reporting.** Platform admin metrics are a separate surface under `(platform)/` routes.
- **No data warehouse / denormalised analytics store.** All queries run real-time against operational tables with the curated subject registry sizing them down. If this becomes a performance problem, we add a materialised-view layer in a later cycle — but we do not pre-optimise.
- **No report versioning or audit of report content changes.** The saved report definition is mutable; the only audit trail is `ai_logs` (for AI outputs) and `report_share_log` (for shares). If a tenant needs historical snapshots, they export to Word/PDF.
- **No new charting library.** Recharts stays. No D3, no ECharts.
- **No scheduled-report SMS/WhatsApp channel.** Scheduled reports email the artifact. Inbox also gets the artifact (via the share mechanism, opt-in). Expanding channels is a later cycle.
- **No multi-tenant shared report templates.** A saved report is one-tenant-one-report. Templates across tenants (a curated "starter set") is a later cycle.

---

## 3. The KPI set

The current dashboard has 10 stale, roster-style KPIs (Total Students, Active Staff, Schedule Coverage, …). These move once or twice a year and give admins nothing to act on. The rebuilt dashboard replaces all 10 with movable, actionable KPIs spanning every domain, each with a plain-English tooltip.

Every KPI card has:

- **Icon** and short **label** (translated).
- **Primary value** (the number).
- **Delta indicator** — percentage or absolute change vs the relevant prior period, with colour (green improving / amber flat / red worsening).
- **Sparkline** — last 8 data points on the same metric.
- **Info icon** — on hover/focus shows a 1–3 sentence tooltip with: what the metric means, how it's calculated, why it matters.
- **Drill-down link** — clicking navigates to the authoritative page for that metric.

### The 10 KPIs

| # | KPI | Primary value | Delta | Drill-down | Tooltip |
| --- | --- | --- | --- | --- | --- |
| 1 | **Attendance today** | Today's session-marked attendance rate | vs 7-school-day rolling average | `/reports/attendance` | `present_sessions / expected_sessions` across all classes whose first session has occurred today. Updates as teachers mark rolls. |
| 2 | **Teacher submission compliance** | % of this week's expected attendance sessions that have been marked | vs last week | `/reports/attendance#compliance` | How many attendance rolls teachers have filed vs how many they were supposed to file this week. Surfaces non-compliant teachers before the week ends. |
| 3 | **At-risk students** | Count newly flagged this week | absolute change vs last week | `/reports/student-progress` | New entries in `student_academic_risk_alert` this week. Combines attendance + grades + behaviour + safeguarding signals. |
| 4 | **Behaviour incidents this week** | Count | vs 7-day rolling average | `/behaviour` | New `behaviour_incident` records created this week, excluding reversed/appealed. |
| 5 | **Open safeguarding concerns** | Count + age of oldest | —  (age is the signal) | `/safeguarding` | `safeguarding_concern` rows with status != resolved. If age > 14 days, card turns red. |
| 6 | **Overdue invoices** | Count | week-on-week delta | `/finance/invoices?status=overdue` | Invoices past their due date with outstanding amount > 0. |
| 7 | **Grades submission lag** | Count of assessments where grades are overdue | vs last week | `/gradebook` | Assessments past their `grades_due_at` date with unsubmitted grades. |
| 8 | **New applications this week** | Count | vs last week | `/admissions` | `application` rows created this week. |
| 9 | **Parent escalations** | Unread parent-initiated inbox messages > 48h | — | `/inbox` | Inbox threads where a parent sent the last message, it's unread by any staff, and it's older than 48h. |
| 10 | **Cover gaps this week** | Count of unassigned teacher-absence cover slots | — | `/schedules/cover` | `teacher_absence` rows this week where no cover assignment exists. |

### KPI card behaviour

- **Data staleness:** dashboard refreshes every 5 minutes (existing interval is fine). Last-refresh timestamp is shown and there's a manual refresh button.
- **Error state:** if the KPI endpoint fails, show a red banner "Unable to load live data" and **do not** fall back to mock numbers. The current silent mock fallback is deleted.
- **Permission gating:** only users with `reports.view` see the dashboard; drill-down links respect the existing per-module permission (e.g. "Open safeguarding concerns" card drill-down requires `safeguarding.view`).
- **Tenant hiding:** a settings toggle lets a tenant hide individual KPIs they don't care about. Default: all 10 visible.

---

## 4. Report subjects (the custom builder backbone)

The custom report builder uses **Option A — primary subject + joined facets**. Each report has one row subject (what each row of the report represents). The author picks fields from a curated tree grouped by domain; every tree leaf is a reachable field from that subject via a predefined join graph. No free-form joins. No SQL.

### 4.1 The 11 report subjects

| Subject | Row represents | Primary key | Joinable domains (curated) |
| --- | --- | --- | --- |
| **Student** | One student | `student.id` | Identity, Enrolment, Household, Parents & Emergency Contacts, Year Group, Class, SEN Profile, Attendance Summary, Behaviour Summary, Grade Summary, Finance Summary, Safeguarding Flags |
| **Staff** | One staff member | `staff_profile.id` | Identity, Employment, Department, Classes Taught, Payroll Summary, Attendance Summary, Leave Summary, Vetting & Qualifications, Compensation |
| **Household** | One household | `household.id` | Household, Parents, Children (Students), Finance Summary (balance, payment plan, last payment), Communication Preferences |
| **Class** | One class | `class.id` | Class, Subject, Teacher, Year Group, Academic Year, Students Enrolled (count + list), Attendance Summary, Grade Summary, Scheduled Periods |
| **Invoice** | One invoice | `invoice.id` | Invoice, Household, Student, Fee Structure, Payments, Status, Aging |
| **Application** | One admissions application | `application.id` | Application, Candidate, Requested Year Group, Status, Processing Steps, Notes, Timing |
| **Behaviour Incident** | One incident | `behaviour_incident.id` | Incident, Students Involved, Reporter, Sanctions, Appeals, Interventions, Review State |
| **Safeguarding Concern** | One concern | `safeguarding_concern.id` | Concern, Subject Student, Reporter, Assigned Staff, Actions, Reviews, State |
| **Attendance Record** | One session attendance | `attendance_record.id` | Record, Student, Class, Session, Teacher, Reason, Status |
| **Grade** | One grade entry | `grade.id` | Grade, Student, Assessment, Subject, Class, Teacher, Rubric, Published Status |
| **Payroll Entry** | One payroll entry | `payroll_entry.id` | Entry, Staff, Payroll Run, Period, Gross, Net, Allowances, Deductions, Adjustments |

### 4.2 Field tree structure (example: Student)

When a user picks "Student" as the subject, they see a field tree grouped by domain. Each leaf is selectable as a column or filter or groupable. Permission-gated — a Teacher user building a Student report does not see Finance Summary; an Office user without finance permissions does not see Outstanding Balance.

```
Student (11 subjects)
 ├─ Identity
 │   ├─ Student code
 │   ├─ First name
 │   ├─ Last name
 │   ├─ Preferred name
 │   ├─ Date of birth
 │   ├─ Age (computed)
 │   ├─ Gender
 │   ├─ Nationality
 │   └─ Status (active / inactive / …)
 ├─ Enrolment
 │   ├─ Year group
 │   ├─ Class (current)
 │   ├─ Academic year
 │   ├─ Enrolment date
 │   └─ Enrolment status
 ├─ Household
 │   ├─ Household name
 │   ├─ Household code
 │   ├─ Household size (children count)
 │   └─ Address (city / postcode)
 ├─ Parents & Emergency Contacts
 │   ├─ Primary parent name
 │   ├─ Primary parent phone
 │   ├─ Primary parent email
 │   ├─ Emergency contact name
 │   ├─ Emergency contact phone
 │   └─ Relationship to student
 ├─ Attendance Summary (this term)
 │   ├─ Attendance rate (%)
 │   ├─ Sessions present
 │   ├─ Sessions absent (excused)
 │   ├─ Sessions absent (unexcused)
 │   └─ Days late
 ├─ Behaviour Summary (this term)
 │   ├─ Incident count
 │   ├─ Most recent incident date
 │   ├─ Sanctions active
 │   └─ Behaviour risk flag
 ├─ Grade Summary (this term)
 │   ├─ Overall GPA / average grade
 │   ├─ Subjects passing
 │   ├─ Subjects failing
 │   └─ Most recent assessment grade
 ├─ SEN
 │   ├─ On SEN register? (Y/N)
 │   ├─ Support plan active
 │   └─ SNA assigned name
 ├─ Safeguarding
 │   ├─ Open concerns count
 │   └─ Risk level
 ├─ Finance Summary [gated: finance.view]
 │   ├─ Outstanding balance
 │   ├─ Overdue amount
 │   ├─ Last payment date
 │   └─ Payment plan active
 └─ Custom fields (tenant-defined, if any)
```

The example the owner gave — "a student's grades, their emergency contact, and what fees are still due, plus behaviour and attendance" — is served by this tree directly: subject = Student, columns = (Identity → First name, Identity → Last name, Parents → Emergency contact name, Parents → Emergency contact phone, Grade Summary → Overall GPA, Finance Summary → Overdue amount, Behaviour Summary → Incident count, Attendance Summary → Attendance rate). Nothing else needed.

### 4.3 Field tree contract

Every field declares:

- `id` — stable identifier (`student.enrolment.year_group`)
- `label_key` — translation key (`reports.fields.student.enrolment.year_group`)
- `domain` — groups in the tree (`enrolment`, `parents`, `finance_summary`, …)
- `type` — `string | number | date | boolean | enum | currency`
- `aggregations` — allowed aggregations when used as a measure (`count, sum, avg, min, max, percent`)
- `filterable` — boolean
- `groupable` — boolean
- `permission` — optional permission string that gates visibility (`finance.view`, `safeguarding.view`, …)
- `resolver` — server-side function (identified by string) that produces the value when the query runs

The field tree is **curated**, not auto-generated from Prisma. The `reports-subject-registry.ts` file is the single source of truth and every subject's tree is written by hand, signed-off by the schema owner, and reviewed when schemas change. This is the discipline that keeps the builder safe.

---

## 5. Custom builder UX

Above all it must be **user-friendly**. A school admin with no technical background should be able to build their first cross-module report in under 3 minutes.

### 5.1 Flow

1. **Entry** — `/reports/builder`. Two modes: "New report" and "Open saved report". A saved-reports list is in the sidebar of the page, grouped by Mine / Shared with me.
2. **Pick subject** — a 3-column grid of subject cards (icon + name + short description). Clicking selects it. Below: "What will each row of your report be? Pick the thing you want a list of."
3. **Pick columns** — left column: the curated field tree for the subject, collapsed by domain. Checkbox-per-field. A top search bar filters the tree. On check, the field appears in the right-column preview as a new column. Drag to reorder columns. Unchecking removes it.
4. **Add filters (optional)** — a button "Add a filter" opens an inline filter row: field picker → operator (equals / contains / greater than / before / after / in list) → value input. Multiple filters combine with AND by default; users can switch a filter group to OR. Stock filters for common cases are suggested ("This year", "This term", "This month", "Active students only").
5. **Group / aggregate (optional)** — a toggle "Summarise this report" converts the table from detail rows to grouped rows. The user picks a group-by field (year group, class, status, month) and any measure columns switch to aggregations (count / sum / average).
6. **Preview** — always visible on the right. Top 50 rows, live. Updates as the author makes changes. Shows a row count above.
7. **Visualise** — toggle in the top-right to switch between Table / Bar / Line / Pie / KPI (single-number). For non-table modes, the user picks which column is the x-axis and which is the y-axis (measures only on y).
8. **Save** — a prominent Save button. On save, a modal prompts for the name (required). The user can mark the report shared with role groups at save time or leave private. On Save, the report becomes visible in the "Mine" list and is accessible via `/reports/builder/:id`.
9. **Auto-save** — as the author edits, the draft is persisted to a `SavedReportDraft` row keyed on (tenant + user). On page reload, the draft is restored. When the author saves formally, the draft is cleared.
10. **Export** — on a saved report, three buttons in the header: Export PDF / Export Excel / Export Word. Each fires the export pipeline; artifact downloads via signed URL.
11. **Share** — on a saved report, a Share button opens the share modal (see §7).
12. **Delete** — on a saved report owned by the user, a Delete button. Hard delete after confirm. Shared reports can be deleted by the owner or by an Owner/Principal.

### 5.2 Guardrails

- **Row cap** — a report that would return > 50 000 rows (at row-count estimate time) blocks the preview and only permits export. This prevents accidental denial-of-service on the browser.
- **Query timeout** — every query has a 30-second budget. Server-side. If exceeded, return a friendly error with the suggestion "narrow your filters."
- **Permission-scoped tree** — at tree-build time (server side), the author's permissions are passed in and the tree strips any `permission`-gated fields they don't have. This means two users building a report from the same Student subject may see different available fields. At save time, the saved report only references fields the author had access to; at execute time, the fields are re-checked against the executing user's permissions (which is usually the same user, but re-checked when a shared report is opened by someone else).
- **Every executed query is RLS-scoped** via `createRlsClient`. The curated subject → query translator refuses to emit a query without the RLS context set.
- **No raw SQL allowed in the translator.** Every query goes through Prisma. Complex aggregations use Prisma's groupBy/aggregate; anything that can't be expressed in Prisma is not in the field tree.

### 5.3 Auto-save + mandatory naming

Per owner instruction:

- Every builder session auto-saves a **draft** on every change, debounced 500 ms.
- A report becomes a saved, listable report only after the user clicks **Save** and provides a **name**. No report is ever "saved" without a name.
- Name is unique per tenant (enforced at save). Renaming is allowed.
- Delete is hard delete. A soft-delete or recycle bin is not in scope.

---

## 6. AI — the flagship capability

AI is the single most impactful feature of this module. Three features, each behind its own tenant flag. All off by default; tenants opt in and absorb the cost. All go through the existing `AnthropicClientService`; all emit to the existing `ai_logs` audit table; all respect a 10-minute response cache keyed by `(tenant_id + feature + data_hash + prompt_hash)`.

### 6.1 Feature: `reports_narration`

**What it does:** Every report page, every KPI card, and every saved report gets an AI-written executive summary paragraph. For the dashboard, it's a 3-sentence "what changed this week" summary. For an individual report, it's a 1-paragraph contextual explanation of what the chart is showing. For a saved report, it's a 1-paragraph summary of the result set.

**UX:**
- A "Summarise" panel appears at the top of the dashboard / report / saved-report view.
- Panel has a "Generate with AI" button (if not yet generated) or the cached narrative + a refresh button (if cached).
- Narrative updates when the underlying data changes (cache invalidates on data-hash change).
- A "Copy" button. A "Regenerate" button. A "Disable AI" link to settings.

**Tenant flag:** `tenant_ai_flags[module_key='reports_narration']`. Default: `false`. When `false`, the Summarise panel is hidden entirely and the endpoint returns 403.

### 6.2 Feature: `reports_ask_ai`

**What it does:** Natural-language report building. The user types "How many Year 10 students have attendance below 85% this term?" and the system translates that into a structured builder query over the curated subject registry. The user reviews the translated query in the builder UI, refines if needed, runs it, saves it.

**UX:**
- A prominent "Ask AI" input at the top of `/reports/builder` and on the `/reports/ask-ai` page.
- Suggestions surfaced below the input (the existing `askAiSuggestion1..5` keys in `en.json`).
- On submit: a loading state → the builder populates with the AI-proposed subject, fields, filters, and the preview runs. The user can tweak or save-as-is.
- Every successful translation is logged in `ai_query_history` for audit.

**Guardrails:**
- The AI is asked to **produce only a JSON builder query**, never raw SQL. A strict Zod schema validates the response; on schema mismatch, we show "AI couldn't interpret that, please try rephrasing" and log the failure.
- The translated query is executed through the same safe query engine as hand-built reports (same RLS, permission, row cap, timeout guardrails).

**Tenant flag:** `tenant_ai_flags[module_key='reports_ask_ai']`. Default: `false`. When `false`, the Ask AI input is hidden and the endpoint returns 403.

### 6.3 Feature: `reports_predictions`

**What it does:** Predictive analytics. Three concrete predictions shipped:

- **Student risk prediction** — given a student's attendance + behaviour + grade history, produce a 0-100 risk score and a 2-sentence narrative explanation. Shown on the Student Progress report per student, and as a "predicted new at-risk students" KPI drill-down.
- **Attendance forecast** — given last N weeks of attendance, produce a 2-week forward forecast per year group.
- **Cash-flow forecast** — given invoice + payment history, produce a 30-day forward forecast of expected receipts. Shown on the Finance report.

**UX:**
- Each prediction has a dedicated panel on its report page, hidden when the flag is off.
- Every prediction has a plain-English explanation of the inputs + confidence level + "regenerate" button.
- Predictions are cached 24 hours per subject (per student, per year group, per tenant) to keep costs down. Manual refresh allowed.

**Tenant flag:** `tenant_ai_flags[module_key='reports_predictions']`. Default: `false`. When `false`, prediction panels are hidden and the endpoints return 403.

### 6.4 AI infrastructure reuse

The AI infrastructure **already exists** and will not be rebuilt:

- `tenant_ai_flags` table (`packages/prisma/schema.prisma:1045`) — we add three `module_key` values: `reports_narration`, `reports_ask_ai`, `reports_predictions`, via the existing seeding flow.
- `apps/api/src/modules/ai-flags/ai-flags.service.ts` — the CRUD service is reused; we only need to extend the `reportsAiModuleKeySchema` Zod enum (mirror of the existing `wellbeingAiModuleKeySchema`).
- `AnthropicClientService` — the existing wrapper around Anthropic's SDK. No changes.
- `ai_logs` table — every AI call is audit-logged via the existing service. No changes.

The flag model is **per-feature, not per-module**. This is intentional: narration is cheap (small prompts, common), predictions are expensive (large context, less common). Tenants should be able to enable the cheap stuff without paying for the expensive stuff.

---

## 7. Share a saved report into the inbox

Per owner approval: include this, snapshot-only, ~3-5 days of work by reusing the inbox's attachments and audience picker.

### 7.1 Flow

1. On a saved report, click **Share**.
2. Modal opens with:
   - **Format picker** — PDF / Excel / Word (or "all three"). Default: PDF.
   - **Audience picker** — the existing `InboxAudiencePicker` component. Pick individuals or role groups (Principal / Vice Principal / Board / Owners).
   - **Message** — optional message body (auto-prefilled with "{AuthorName} shared a report: {ReportName}").
3. On submit, the pipeline fires:
   - Generate the chosen export artifact via the export service.
   - Upload the artifact to object storage (existing `InboxAttachmentsService`).
   - Create a `broadcast` conversation via `ConversationsService.create` with the attachment attached.
   - Message body is the user's message + a deep-link back to the read-only report snapshot.
   - Audit entry written to `report_share_log` (new table).
4. Recipients see it in their inbox like any other message.

### 7.2 Snapshot semantics

The shared artifact is the artifact at the moment of share. The recipient sees the file. If they want live data, they open the source report themselves (if they have permission).

The **deep-link** goes to a read-only view of the report at `/reports/shared/:share_id`. This view:

- Loads the artifact, not a live query.
- Displays metadata — author, shared at, report name, filter summary.
- No edit / save-as / delete controls. Only "Download again" and "Open in builder" (the latter gated on the recipient having `reports.builder` permission AND the report being `is_shared=true`).

### 7.3 Permissions

- **Sharing** requires `reports.share` permission. Default assigned to Owner, Principal, Vice Principal. Admin-tier roles get it; teachers / front-office / finance do not (they may still share their own reports via the built-in inbox flow manually, but the in-report Share button is gated).
- **Receiving** is governed by the inbox's existing permission matrix — sharing into a role group means the sender must be allowed to broadcast to that role group by the tenant's messaging policy.

---

## 8. Exports — finish what's started

### 8.1 Current state

- **PDF** via Puppeteer (`report-export.service.ts:84-97`) — works but output quality is uneven and branding is partial.
- **Excel** via `xlsx` (dynamic require, lines 38-46) — works; formatting is minimal.
- **Word** — no implementation. The button exists; clicking it currently errors or returns empty.

### 8.2 Target state

- **PDF** — Puppeteer pipeline with a single branded HTML template per report type. Header (tenant logo, report name, generated timestamp), footer (page number, confidentiality notice), body (table / chart). Portrait by default, landscape for wide tables. Localised LTR/RTL based on locale.
- **Excel** — `exceljs` (upgrade from `xlsx`; `exceljs` supports styling, merged cells, formulas). Per-sheet: one "Info" sheet with metadata + filter summary, one or more "Data" sheets. Column-type-aware formatting (dates as dates, currency with tenant currency symbol).
- **Word** — `docx` npm package. Template-driven. Header + footer parity with PDF. Tables rendered natively. Charts rendered as images (Puppeteer-snapshot the Recharts component then embed).

Every export is generated by the **same pipeline**: the saved report query runs, returns `{ rows, columns, meta }`, and a single dispatcher picks the format-specific renderer.

### 8.3 Delivery

- Synchronous small exports (< 5 000 rows) — generated in the request lifecycle and streamed to the client.
- Large exports (≥ 5 000 rows) — enqueued to a new BullMQ job `reports:export-batch`; the user sees a "Your export is being prepared, we'll notify you" state; on completion, an inbox message drops the artifact (reusing the share pipeline).

---

## 9. Scheduled reports + alerts (finish)

### 9.1 Scheduled reports

The `ScheduledReport` table and CRUD service already exist. What's missing is the worker that fires them.

New job `reports:scheduled-run`, cron-registered in `CronSchedulerService`, fires every 15 minutes. On each tick:

1. Query `scheduled_reports` for rows where `next_run_at <= now()` and `enabled = true`.
2. For each, run the saved report's query via the query engine.
3. Generate the configured export format(s).
4. Deliver — email the configured recipients (existing mail infra), and/or drop into the inbox of the configured recipients (existing inbox flow).
5. Update `next_run_at` based on the cron expression.
6. Log the run to a new `scheduled_report_run` table.

State machine for a scheduled report: `active → paused → active → ...`. Admin can pause, resume, delete. All transitions audited.

### 9.2 Report alerts

The `ReportAlert` table and CRUD service already exist. What's missing is the worker.

New job `reports:alert-evaluate`, cron every 30 minutes. On each tick:

1. Query `report_alerts` where `enabled = true`.
2. For each: run the underlying metric query; compare to the threshold; if crossed, drop an inbox notification to the configured recipients with a link to the report.
3. Prevent spam: an alert that fired within the last 24h for the same threshold won't re-fire unless the underlying metric returned to safe and crossed again.
4. Log each evaluation to `report_alert_run` (new table).

---

## 10. Component map

### 10.1 Backend — new/changed files

```
apps/api/src/modules/reports/
├── reports.module.ts                              [updated: register new services + subject registry]
├── reports.controller.ts                          [updated: KPI endpoint real data]
├── reports-enhanced.controller.ts                 [updated: builder execute, AI endpoints, share endpoint]
├── subject-registry/
│   ├── reports-subject-registry.service.ts        [NEW: curated subject + field tree]
│   ├── fields/
│   │   ├── student-fields.ts                      [NEW: Student field tree]
│   │   ├── staff-fields.ts                        [NEW: Staff field tree]
│   │   ├── household-fields.ts                    [NEW]
│   │   ├── class-fields.ts                        [NEW]
│   │   ├── invoice-fields.ts                      [NEW]
│   │   ├── application-fields.ts                  [NEW]
│   │   ├── behaviour-incident-fields.ts           [NEW]
│   │   ├── safeguarding-concern-fields.ts         [NEW]
│   │   ├── attendance-record-fields.ts            [NEW]
│   │   ├── grade-fields.ts                        [NEW]
│   │   └── payroll-entry-fields.ts                [NEW]
│   └── reports-subject-registry.service.spec.ts   [NEW]
├── query-engine/
│   ├── query-engine.service.ts                    [NEW: translator from saved query → Prisma]
│   ├── query-engine.service.spec.ts               [NEW]
│   └── query-engine.types.ts                      [NEW]
├── custom-report-builder.service.ts               [REWRITE: executeReport delegates to query-engine]
├── unified-dashboard.service.ts                   [REWRITE: real 10 KPIs + tooltip metadata]
├── attendance-analytics.service.ts                [untouched — already real]
├── grade-analytics.service.ts                     [untouched — already real]
├── demographics.service.ts                        [untouched — already real]
├── admissions-analytics.service.ts                [untouched — already real]
├── staff-analytics.service.ts                     [untouched — already real]
├── student-progress.service.ts                    [may extend for predictions]
├── cross-module-insights.service.ts               [untouched — already real]
├── board-report.service.ts                        [REWRITE: section-by-section aggregation]
├── compliance-report.service.ts                   [REWRITE: source real data]
├── report-export.service.ts                       [REWRITE: PDF polish + exceljs + docx]
├── report-sharing/
│   ├── report-sharing.service.ts                  [NEW]
│   ├── report-sharing.controller.ts               [NEW]
│   └── report-sharing.service.spec.ts             [NEW]
├── ai-report-narrator.service.ts                  [updated: flag check for reports_narration]
├── ai-report-narrator.controller.ts               [updated]
├── ai-ask-ai/
│   ├── ai-ask-ai.service.ts                       [NEW: NL → builder query]
│   ├── ai-ask-ai.controller.ts                    [NEW]
│   └── ai-ask-ai.service.spec.ts                  [NEW]
├── ai-predictions.service.ts                      [updated: flag check + caching]
├── ai-predictions.controller.ts                   [updated]
└── scheduled-reports.service.ts                   [updated: integrate with worker]

apps/worker/src/processors/reports/
├── scheduled-reports.processor.ts                 [NEW]
├── report-alerts.processor.ts                     [NEW]
└── reports-export-batch.processor.ts              [NEW]

apps/worker/src/base/
└── cron-scheduler.service.ts                      [updated: register reports:scheduled-run and reports:alert-evaluate]

apps/web/src/app/[locale]/(school)/reports/
├── page.tsx                                       [REWRITE: real 10 KPIs + tooltips + error states]
├── attendance/page.tsx                            [updated: kill MOCK_*, wire real]
├── grades/page.tsx                                [updated: kill MOCK_*]
├── demographics/page.tsx                          [updated: kill MOCK_*]
├── admissions/page.tsx                            [updated: kill MOCK_*]
├── staff/page.tsx                                 [updated]
├── student-progress/page.tsx                      [updated]
├── insights/page.tsx                              [updated]
├── board/page.tsx                                 [REWRITE: real aggregation display]
├── compliance/page.tsx                            [REWRITE]
├── builder/page.tsx                               [REWRITE: Option A UX]
├── builder/[id]/page.tsx                          [NEW: open saved report]
├── builder/_components/
│   ├── subject-picker.tsx                         [NEW]
│   ├── field-tree.tsx                             [NEW]
│   ├── filter-builder.tsx                         [NEW]
│   ├── group-by-toggle.tsx                        [NEW]
│   ├── preview-table.tsx                          [NEW]
│   ├── chart-switcher.tsx                         [NEW]
│   ├── save-dialog.tsx                            [NEW]
│   └── ask-ai-input.tsx                           [NEW]
├── scheduled/page.tsx                             [updated: full CRUD UI]
├── alerts/page.tsx                                [updated: full CRUD UI]
├── ask-ai/page.tsx                                [REWRITE: real AI pipeline]
├── shared/[share_id]/page.tsx                     [NEW: read-only shared view]
└── _components/
    ├── kpi-card.tsx                               [REWRITE: info-icon tooltip + drill-down]
    ├── kpi-tooltip.tsx                            [NEW]
    ├── ai-summary-panel.tsx                       [updated: flag-aware]
    ├── prediction-panel.tsx                       [NEW]
    └── share-dialog.tsx                           [NEW]

apps/web/src/app/[locale]/(school)/settings/reports/
├── page.tsx                                       [NEW: admin settings]
└── _components/
    ├── ai-flag-toggles.tsx                        [NEW]
    ├── default-export-format.tsx                  [NEW]
    └── kpi-visibility.tsx                         [NEW]
```

### 10.2 Schema — new tables / columns

- `saved_reports` — add columns: `description`, `visibility` (enum: `private | shared`), `is_favorite`, `last_executed_at`, `last_executed_by`.
- `saved_report_drafts` — NEW. Keyed `(tenant_id, user_id)` unique. Holds the in-progress builder state.
- `scheduled_report_run` — NEW. Log of each scheduled-report firing.
- `report_alert_run` — NEW. Log of each alert evaluation.
- `report_share_log` — NEW. Every share action: who, to whom, which report, which format, timestamp, resulting conversation_id.
- `reports_kpi_tenant_preferences` — NEW. Per-tenant visibility toggles for each of the 10 KPIs.

No changes to `tenant_ai_flags` shape (reuse as-is; add new `module_key` values by enum extension).

### 10.3 Permissions — new

- `reports.view` — existing, kept.
- `reports.builder` — NEW. View + use the custom builder.
- `reports.share` — NEW. Share reports into inbox.
- `reports.settings` — NEW. Change tenant reports settings (AI flags, KPI visibility).
- `reports.ai.narration` — NEW. See / regenerate AI narrations.
- `reports.ai.ask_ai` — NEW. Use Ask AI.
- `reports.ai.predictions` — NEW. See AI predictions.

Each permission gets a role default: Owner/Principal/VP get all; Accounting gets `reports.view` + `reports.builder` + `reports.share`; Teacher gets `reports.view` (limited to their classes via existing data-scoping).

### 10.4 BullMQ — new jobs

| Queue | Job name | Schedule | Payload |
| --- | --- | --- | --- |
| `reports` | `reports:scheduled-run` | cron */15 min | `{}` (iterates all tenants) |
| `reports` | `reports:alert-evaluate` | cron */30 min | `{}` |
| `reports` | `reports:export-batch` | on-demand | `{ tenant_id, user_id, saved_report_id, format }` |
| `reports` | `reports:share-fanout` | on-demand | `{ tenant_id, share_id }` |

---

## 11. Phase breakdown

Each phase is one session's work, committed locally, deployed to production, verified, then logged.

| Wave | # | Title |
| --- | --- | --- |
| **1** | 01 | Schema foundation (all migrations) |
| **2** | 02 | Report Subject Registry + Query Engine |
| **2** | 03 | KPI Dashboard Service |
| **2** | 04 | Export Service (PDF/Excel/Word) |
| **2** | 05 | Domain Report Services (finish aggregation) |
| **2** | 06 | Board Report aggregation |
| **2** | 07 | Compliance Report aggregation |
| **3** | 08 | Scheduled Reports Worker |
| **3** | 09 | Report Alerts Worker |
| **3** | 10 | AI Flag registration + AI Narration service |
| **3** | 11 | AI Ask-AI service |
| **3** | 12 | AI Predictions service |
| **3** | 13 | Report Sharing service |
| **4** | 14 | Reports Hub + KPI Dashboard UI |
| **4** | 15 | Individual Report Pages UI (kill mocks + title fixes) |
| **4** | 16 | Custom Report Builder UI |
| **4** | 17 | Scheduled Reports + Alerts UI |
| **4** | 18 | AI Panel UI (Ask-AI, Narration, Predictions) |
| **4** | 19 | Share-to-Inbox Dialog + Saved Reports management |
| **4** | 20 | Board Report + Compliance Report UI |
| **4** | 21 | Reports Settings Page |
| **5** | 22 | Translations, mobile, a11y, smoke tests, docs |

See `implementations/NN-*.md` for each phase's spec.
See `IMPLEMENTATION_LOG.md` for execution rules and completion records.
