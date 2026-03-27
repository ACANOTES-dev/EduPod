# Phase F: Frontend — Principal/Board Experience + Reports

**Module:** Staff Wellbeing & Workload Intelligence
**Master Spec:** `Next_Feature/Staff_Wellbeing/staff-wellbeing-spec-v1-master.md`
**Identity:** The admin-facing pages where operational intelligence becomes actionable.
**Dependencies:** Phase C (survey results + threshold endpoints), Phase D (workload data endpoints), Phase E (shared layout, components, i18n keys)
**Blocks:** Phase G (full module must be assembled for cross-cutting tests)
**Design reference:** `Plans/ui-design-brief.md`

---

## Prerequisites

- Phases C, D, and E complete
- All backend endpoints functional: survey results (C), workload aggregates (D), board report (D6)
- Shared components from Phase E available (anonymity panels, framing language patterns, small school logic)
- Read master spec Sections 8 (Frontend Pages — V1 admin/board pages), 8.1 (UI Requirements — correlation accumulation, framing language), 10 (Audit & Trust — all principal actions logged)

---

## Non-Negotiable UI Rules (carried from Phase E, plus admin-specific)

1. **Framing language:** "workload pressure", "cover burden", "timetable strain", "substitution pressure", "operational wellbeing" — NEVER "burnout risk", "at-risk staff", "high-risk", "underperforming", "resilience"
2. **Aggregate only:** No individual staff data visible on ANY admin page. Counts without names.
3. **Correlation disclaimer:** Permanent, non-dismissable: "This shows patterns that occurred together. It does not prove that one caused the other."
4. **Raw comments are never the default view** — principal must explicitly choose to open them
5. **Anonymity explanation panel** on results page (different text from staff panel)
6. **All principal actions are audit-logged** (dashboard views, results views, raw comments opens, report generation)

---

## Deliverables

### F1. Aggregate Dashboard — `/wellbeing/dashboard`

**Route:** `apps/web/app/(tenant)/wellbeing/dashboard/page.tsx`
**Role:** Principal, Deputy Principal (`wellbeing.view_aggregate`)
**Data source:** Phase D aggregate endpoints

**Layout:**

#### Summary Strip (top)
- 4 key metrics as cards:
  - Average teaching load (periods/week) with trend arrow
  - Cover fairness index (Gini label: "Well distributed" / "Moderate" / "Significant concentration")
  - Timetable quality average (score + label)
  - Substitution pressure (label: "Low" / "Moderate" / "High" / "Critical")

#### Workload Distribution Section
- Histogram/bar chart: distribution of teaching periods per staff member (x = period count, y = number of staff)
- Horizontal line at tenant threshold (`workload_high_threshold_periods`)
- Over-allocated count badge: "X staff above threshold" (count only, no names)
- Trend comparison: this term vs last term (side-by-side bars or overlay)

#### Cover Fairness Section
- Distribution curve: cover duties per staff (histogram)
- Gini coefficient displayed with assessment text
- Range indicator: min/max/median
- "If this shows significant concentration, consider reviewing how cover duties are assigned." (action-oriented framing)

#### Timetable Quality Section
- School-wide averages for:
  - Consecutive teaching periods
  - Free period distribution
  - Split timetable percentage
  - Room changes per day
- Each as a gauge or compact metric with "Good" / "Moderate" / "Needs attention" label
- "These metrics reflect timetable structure. Improvements typically require timetable restructuring at the planning stage." (framing: structural, not individual)

#### Substitution Pressure Section
- Composite pressure score with trend line (monthly data points)
- Component breakdown: absence rate, internal cover ratio, unfilled substitution rate
- "High substitution pressure often correlates with increased staff absence in following months." (careful language — correlation, not causation)

#### Correlation Section
- **If < 12 data points (data accumulation state):**
  - Progress bar: "Building your school's picture: N of 12 months collected"
  - Projected date: "Trend analysis available from [month/year]"
  - Clean, encouraging UX — not an error state, not a broken feature
  - Brief explanation: "This analysis needs at least 12 months of data to show meaningful patterns."
- **If >= 12 data points:**
  - Dual-axis line chart: cover pressure (left axis) vs absence rate (right axis) over time
  - Narrative: "Months with higher cover duty loads were followed by higher staff absence the following month." (or whatever the data shows)
  - **Permanent, non-dismissable disclaimer:** "This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion."
  - No confidence scores, no p-values, no R-squared visible

**Audit logging:** Every dashboard page load triggers an audit log entry (via API — the GET requests are logged server-side).

**Mobile (375px):**
- Summary strip: 2x2 grid → 1 column stack
- Charts: full width, simplified (fewer labels, larger touch targets)
- Sections stack vertically with clear headers

### F2. Survey Management — `/wellbeing/surveys`

**Route:** `apps/web/app/(tenant)/wellbeing/surveys/page.tsx`
**Role:** Principal, Deputy Principal (`wellbeing.manage_surveys`)
**Data source:** Phase B survey CRUD endpoints

**Layout:**
- "Create Survey" button (prominent)
- Survey list (table on desktop, cards on mobile):
  - Title
  - Status badge (Draft / Active / Closed / Archived) with colour coding
  - Window dates (opens → closes)
  - Response rate (for closed: "X of Y staff responded (Z%)")
  - Actions: Edit (draft only), Clone, Activate (draft only), Close (active only), View Results (closed only)
- Paginated, sorted by created_at descending (newest first)
- Filter by status

#### Create/Edit Survey Dialog/Page
- Title (required)
- Description (optional)
- Frequency (weekly / fortnightly / monthly / ad_hoc — informational, doesn't auto-schedule)
- Window opens at (date + time picker)
- Window closes at (date + time picker, must be after opens)
- Threshold overrides (advanced section, collapsed by default):
  - Min response threshold (slider, floor: 3, default: 5)
  - Department drill-down threshold (slider, floor: 8, default: 10)
  - Moderation enabled (toggle, default: on)
- Questions builder:
  - Add question: type selector (Likert 5 / Single Choice / Freeform)
  - Likert: just the question text (scale is standard 1-5)
  - Single choice: question text + options (add/remove/reorder)
  - Freeform: just the question text
  - Reorder questions (drag or up/down buttons)
  - Remove question (with confirmation)
  - 3-5 questions recommended (guidance text, not enforced)
- Save as Draft / Activate buttons

#### Clone Flow
- Click "Clone" on any survey → creates new draft immediately
- Navigates to edit view of the new draft
- Questions pre-populated from source
- Window dates blank (must be set)

### F3. Survey Detail — `/wellbeing/surveys/[id]`

**Route:** `apps/web/app/(tenant)/wellbeing/surveys/[id]/page.tsx`
**Role:** Principal, Deputy Principal
**Data source:** Phase B (survey detail) + Phase C (results, moderation)

**Tabs:**

#### Overview Tab
- Survey title, description, status, window dates
- Response statistics: count, eligible count, response rate
- Actions: Activate (if draft), Close (if active), Clone

#### Results Tab (visible only when closed/archived)
- **Anonymity explanation panel:**
  > "These results are aggregate. Individual responses cannot be traced to any staff member. Free-text responses have been reviewed for identifying information."
- Per-question results:
  - **Likert 5:** Horizontal stacked bar chart showing distribution (1-5) with mean score displayed
  - **Single choice:** Bar chart or pie chart showing option distribution
  - **Freeform:** Summary view by default ("X responses received")
    - Explicit "View individual responses" button (audit-logged click)
    - On click: show approved responses + redacted placeholders
    - Threshold-enforced (button hidden if below threshold)
- Department filter dropdown (only shows departments above threshold; hidden if none qualify)
- Cross-filter blocking: if applying department filter would drop below threshold, show explanation message instead of results
- Cycle comparison: if previous surveys exist, side-by-side trend for Likert questions (mean this survey vs mean previous)

#### Moderation Tab (visible when moderation is enabled and pending responses exist)
- List of freeform responses awaiting moderation
- Each response shows:
  - Response text
  - Submitted date (DATE only)
  - Flagged matches (highlighted in text if moderation scan found staff names, room codes, subject names)
  - Action buttons: Approve / Flag / Redact
- Redact action: confirmation dialog "This will permanently replace the response text. The original text cannot be recovered. Continue?"
- Moderation actions are audit-logged
- Count badge on tab: "Moderation (3)" showing pending count

### F4. Board Report — `/wellbeing/reports`

**Route:** `apps/web/app/(tenant)/wellbeing/reports/page.tsx`
**Role:** Principal, Deputy Principal, Board Member (`wellbeing.view_board_report`)
**Data source:** Phase D board report endpoint (`/reports/termly-summary`)

**Layout:**
- Term selector (current term pre-selected)
- Report preview:
  - Workload distribution summary
  - Cover fairness overview
  - Timetable quality overview
  - Substitution pressure trend
  - Survey trend (if surveys conducted — aggregated scores across cycles)
  - Absence pattern summary
  - Correlation insight (if 12+ months available)
- "Download PDF" button → triggers Puppeteer PDF generation
- Report is pre-rendered — no drill-down, no interactive filters
- Board members see ONLY this page (no dashboard, no survey management, no moderation)

**Audit logging:** Report generation is logged: user_id, timestamp, report_period.

---

## Charts & Visualisation

All charts use **Recharts** (existing dependency):
- Distribution histograms: `BarChart`
- Trend lines: `LineChart` (dual-axis for correlation)
- Likert distributions: `BarChart` (horizontal stacked)
- Gauges/scores: can be custom components or simplified `BarChart`
- All charts must have `aria-label` for accessibility
- Colours must work in both LTR and RTL
- On mobile: charts use `ResponsiveContainer` with reduced tick count

---

## Verification Checklist

- [ ] `/wellbeing/dashboard` shows aggregate data only — no individual names anywhere
- [ ] Over-allocated counts show numbers only, never names
- [ ] Cover fairness Gini displayed with assessment text
- [ ] Correlation shows accumulation state when < 12 months
- [ ] Correlation disclaimer is permanent and non-dismissable
- [ ] `/wellbeing/surveys` lists surveys with correct status badges and actions
- [ ] Create/edit survey form validates thresholds (min >= 3, dept >= 8)
- [ ] Clone creates new draft and navigates to edit view
- [ ] `/wellbeing/surveys/[id]` results tab shows aggregate only
- [ ] Freeform responses hidden by default — "View individual responses" requires explicit click
- [ ] "View individual responses" click is audit-logged
- [ ] Department filter hidden when no department exceeds threshold
- [ ] Cross-filter blocking shows explanation when filter would drop below threshold
- [ ] Moderation tab shows pending responses with flagged matches highlighted
- [ ] Redact confirmation dialog warns about permanence
- [ ] `/wellbeing/reports` generates board-safe PDF (no individual data)
- [ ] Board member role sees ONLY the reports page
- [ ] All principal page loads are audit-logged
- [ ] Framing language correct throughout — no "burnout", "at-risk", "underperforming"
- [ ] Charts render correctly in RTL
- [ ] Mobile responsive at 375px for all pages
- [ ] All text uses i18n translation keys (en + ar)
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
