# Reports World-Class Enhancement — Design Spec

## Overview

22 features transforming reports from a link hub into a unified analytics centre with cross-module insights, AI narration, custom report builder, governance reports, scheduled delivery, and professional exports.

**Golden Rule:** Everything configurable by the tenant.
**UX Principle:** Complex analytics presented as simple, actionable insights.

---

## FOUNDATION

### R1. Unified Analytics Dashboard

**Purpose:** Single command-centre page showing the 10 most important school KPIs.

**No new tables** — aggregates from all modules.

**KPIs (all live, auto-refreshing):**
- Total students (active) + trend arrow vs last term
- School-wide attendance rate (this term)
- Average grade (across all subjects, this term)
- Fee collection rate (%)
- Outstanding balance total
- Active staff count
- Open admissions applications
- At-risk students count
- Overdue invoices count
- Schedule coverage (% of slots filled)

**UI:**
- Replaces current reports hub as the landing page at /reports
- 10 KPI cards in a responsive grid (2 cols mobile, 5 cols desktop)
- Each card: value, trend indicator (↑↓→), sparkline, click to drill down
- Auto-refresh every 5 minutes
- Recharts area chart: school-wide trends over last 6 months (attendance, grades, collection)

**Caching:** Redis, 5 min TTL per tenant

---

### R2. Cross-Module Insights

**Purpose:** Reports connecting data across modules.

**No new tables** — computed joins.

**Reports:**
- **Attendance vs Grades** — scatter plot + correlation coefficient. Per-student: attendance rate vs average grade. Highlights: "students below 85% attendance average 12% lower grades."
- **Cost per Student** — total monthly payroll ÷ enrolled student count, trended over months
- **Year Group Health Score** — composite index (0-100) per year group: weighted average of attendance rate (25%), average grade (25%), fee collection (25%), and behaviour/at-risk incidents (25%). Ranked table.
- **Teacher Effectiveness Index** — per teacher: attendance marking compliance %, grade entry completion %, student average grades, student attendance in their classes

**UI:**
- /reports/insights page with 4 tabs
- Each tab: chart + data table + key finding callout

---

### R3. Custom Report Builder

**Purpose:** Admin builds their own reports by selecting dimensions and measures.

**Data Model:**
- `saved_reports` — tenant_id, name, data_source ('students' | 'attendance' | 'grades' | 'finance' | 'staff' | 'admissions'), dimensions_json (JSON), measures_json (JSON), filters_json (JSON), chart_type ('table' | 'bar' | 'line' | 'pie', nullable), created_by_user_id, is_shared (boolean), created_at, updated_at
  - Unique on (tenant_id, name)
  - Index: idx_saved_reports_tenant on (tenant_id)

**Available Dimensions:** year_group, class, subject, academic_period, gender, nationality, status, department, payment_method, fee_structure, teacher, month, week, day_of_week

**Available Measures:** count, sum, average, min, max, percentage, rate

**Behavior:**
- Admin selects: source → dimensions → measures → filters → chart type
- Live preview as they build
- Save as named report for reuse
- Share with other admins (is_shared flag)
- Generates Prisma query server-side (same safe pattern as NL queries — no raw SQL)

**UI:**
- /reports/builder page
- Step wizard: Source → Dimensions → Measures → Filters → Preview → Save
- Drag dimensions into rows/columns areas
- Measure selector with aggregation type
- Live preview panel updates as selections change

---

## ACADEMIC ANALYTICS

### R4. Attendance Analytics Dashboard

**No new tables** — computed from attendance records.

**Sections:**
- **Chronic Absenteeism** — students with attendance below configurable threshold (default: 85%). Ranked list.
- **Day-of-Week Heatmap** — which days have lowest attendance. Grid: year_group × weekday, colour-coded.
- **Teacher Marking Compliance** — % of sessions marked on time per teacher. Highlights late/missed markings.
- **Attendance Trends** — line chart: school-wide rate over weeks/months
- **Excused vs Unexcused Breakdown** — pie chart + table
- **Class Comparison** — bar chart: attendance rate per class within year group

**UI:**
- /reports/attendance page with tabs per section
- Date range filter, year group filter

---

### R5. Grade Analytics Dashboard

**No new tables** — computed from grades and period_grade_snapshots.

**Sections:**
- **Pass/Fail Rates** — by subject, class, year group. Bar chart + table.
- **Grade Distribution** — school-wide histogram of period grades
- **Top/Bottom Performers** — ranked student lists (top 10, bottom 10) per subject or overall
- **Grade Trends** — line chart: average grades over terms
- **Subject Difficulty Ranking** — subjects ranked by average score (lowest = hardest). Table.
- **GPA Distribution** — histogram of GPAs across school

**UI:**
- /reports/grades page with tabs
- Filters: year group, subject, period

---

### R6. Student Demographics Report

**No new tables** — computed from students table.

**Sections:**
- **Nationality Breakdown** — pie chart + table
- **Gender Balance** — per year group bar chart
- **Age Distribution** — histogram
- **Year Group Sizes** — bar chart + table with capacity info
- **Enrolment Trends** — new enrolments vs withdrawals per month (line chart)
- **Status Distribution** — active/withdrawn/graduated/applicant counts

**UI:**
- /reports/demographics page
- No date filter needed (current snapshot), optional year group filter

---

### R7. Student Progress Tracker

**No new tables** — aggregates per student from grades, attendance, risk alerts.

**Behavior:**
- Select a student → see their full trajectory across all terms
- Grades: sparkline per subject showing trend
- Attendance: monthly rate trend line
- At-risk alerts timeline
- Competency progress (if standards enabled)
- Combines into "Overall Progress Score" (composite)

**UI:**
- /reports/student-progress page
- Student search/select
- Multi-panel view: grades chart, attendance chart, alerts timeline, competency bars

---

## ADMISSIONS ANALYTICS

### R8. Admissions Funnel Report

**No new tables** — computed from applications table.

**Sections:**
- **Pipeline Funnel** — visual funnel: Applied → Under Review → Accepted → Enrolled. Counts + conversion rates at each stage.
- **Processing Time** — average days from submission to decision, trended
- **Rejection Reasons** — breakdown of why applications were rejected
- **Monthly Applications** — trend line: applications received per month
- **Year Group Demand** — which year groups get the most applications

**UI:**
- /reports/admissions page
- Funnel visualization (Recharts custom) + metric cards + tables
- Date range filter

---

## OPERATIONAL ANALYTICS

### R9. Staff Analytics

**No new tables** — computed from staff_profiles, compensation, attendance.

**Sections:**
- **Headcount by Department** — bar chart
- **Staff-to-Student Ratio** — single KPI + trend
- **Tenure Distribution** — histogram (years of service)
- **Staff Attendance Rate** — from staff attendance tracker (P1)
- **Qualification Coverage** — subjects with/without qualified teachers
- **Compensation Distribution** — salary range bands

**UI:**
- /reports/staff page with tabs

---

### R10. Communication Analytics

**No new tables** — extends existing notification delivery report.

**Additions:**
- **Parent Engagement Rate** — % of parents who read notifications within 24h
- **Channel Effectiveness** — delivery success rate per channel, trended
- **Response Time** — average time for parent inquiry responses

**UI:**
- Enhance existing /reports/notification-delivery page with new metrics

---

## GOVERNANCE & COMPLIANCE

### R11. Board Report Generator

**Purpose:** One-click termly/annual summary for school board.

**Data Model:**
- `board_reports` — tenant_id, title, academic_period_id (nullable), report_type ('termly' | 'annual'), sections_json (JSON — which sections to include), generated_at, generated_by_user_id, file_url (text, nullable), created_at
  - Index: idx_board_reports_tenant on (tenant_id)

**Sections (all optional, tenant selects which to include):**
- Executive Summary (AI-generated)
- Enrolment & Demographics
- Academic Performance (grades, pass rates)
- Attendance Summary
- Financial Overview (revenue, collection, outstanding)
- Staffing Summary
- Admissions Pipeline
- Key Achievements & Concerns (AI-generated)

**Behavior:**
- Admin selects: report type (termly/annual), period, sections to include
- System generates branded PDF with all selected sections
- AI generates executive summary and key achievements narrative
- Stored for history

**UI:**
- /reports/board page
- Create: select type + period + sections checkbox list
- Generate → preview → download PDF
- History list of past board reports

---

### R12. Regulatory Compliance Report

**Purpose:** Data needed for education authority submissions.

**Data Model:**
- `compliance_report_templates` — tenant_id, name, country_code (varchar 2), fields_json (JSON array of required data points), created_at, updated_at
  - Tenant configures what data points their regulator requires

**Behavior:**
- Tenant defines what their education authority needs (student counts by category, staff qualifications, attendance rates, etc.)
- System auto-populates from existing data
- Exports as formatted document matching authority requirements
- Configurable per country (Ireland has different requirements than Libya)

**UI:**
- /reports/compliance page
- Template editor: define required fields
- Generate: auto-fills all data, shows any gaps
- Export

---

## SCHEDULED & AUTOMATED

### R13. Scheduled Report Delivery

**Data Model:**
- `scheduled_reports` — tenant_id, name, report_type (varchar — references a report ID), parameters_json (JSON — filters/config), schedule_cron (varchar — cron expression), recipient_emails (JSON array of strings), format ('pdf' | 'csv' | 'xlsx'), active (boolean), last_sent_at (timestamptz, nullable), created_by_user_id, created_at, updated_at
  - Index: idx_scheduled_reports_tenant_active on (tenant_id, active)

**Behavior:**
- Admin configures: which report, with what filters, how often (daily/weekly/monthly), to whom, in what format
- Worker job checks cron schedules, generates report, emails to recipients
- Common presets: "Aging report every Monday", "Attendance summary every Friday", "Monthly board report on 1st"

**Worker Job:** `reports:scheduled-delivery` — runs every hour, checks for due reports

**UI:**
- /reports/scheduled page
- List of scheduled reports with next-run indicator
- Create: select report type → set filters → set frequency (preset or custom cron) → add recipients → set format
- Enable/disable toggle
- History of past deliveries

---

### R14. Alert-Based Reports

**Data Model:**
- `report_alerts` — tenant_id, name, metric (varchar), operator ('lt' | 'gt' | 'eq'), threshold (decimal), check_frequency ('daily' | 'weekly'), notification_recipients_json (JSON), active (boolean), last_triggered_at (nullable), created_by_user_id, created_at, updated_at
  - Index: idx_report_alerts_tenant_active on (tenant_id, active)

**Available Metrics:**
- attendance_rate, collection_rate, overdue_invoice_count, at_risk_student_count, average_grade, staff_absence_rate

**Behavior:**
- Admin sets: "Notify me when collection_rate < 80%"
- Worker checks daily/weekly based on frequency
- If threshold breached: sends alert notification to configured recipients
- Includes: current value, threshold, trend, suggested action

**Worker Job:** Part of `reports:scheduled-delivery`

---

## EXPORT & PRESENTATION

### R15. Formatted Excel Export

**Behavior:**
- All reports gain "Export to Excel" button
- Excel output includes: branded header (school name, logo, report title, date range), formatted data table with auto-sized columns, summary row at bottom, color-coded cells for status/performance, embedded charts where applicable
- Uses existing xlsx library

---

### R16. Branded PDF Reports

**Behavior:**
- All reports gain "Export to PDF" button
- PDF includes: school logo, report title, date generated, filters applied, rendered charts (as images), formatted data tables
- Uses existing Puppeteer PDF pipeline
- A4 landscape for wide tables, portrait for standard

---

### R17. Export Pack Upgrade

**Behavior:**
- Student and household export packs now output as formatted Excel (not JSON)
- Student pack: cover page + profile sheet + attendance sheet + grades sheet + report cards sheet
- Household pack: cover page + profile sheet + invoices sheet + payments sheet
- Each sheet properly formatted with headers and data types

---

## AI-POWERED

### R18. AI Report Narrator

**Behavior:**
- On any report page: "Summarise" button
- AI reads the report data and generates a 3-5 sentence plain-language narrative
- Example: "Attendance this term is 94.2%, up 1.3% from last term. Year 8 has the lowest rate at 89%, driven by 4 students with chronic absenteeism."
- Cached per report + filters (Redis, 1 hour)
- Uses tenant's comment style setting

---

### R19. AI Trend Predictions

**Behavior:**
- On trend-based reports (attendance, grades, revenue): "Predict Next Term" button
- AI analyzes historical patterns and projects forward
- Shows prediction with confidence band (optimistic/expected/pessimistic)
- Example: "Based on current trends, expect collection rate to drop to 82% next term unless intervention on 8 overdue households."
- Visualized as dashed line extension on the chart

---

### R20. Natural Language Report Queries

**Behavior:**
- Cross-module version of the gradebook "Ask AI" feature
- Page: /reports/ask-ai
- Supports queries across ALL data: students, attendance, grades, finance, staff, admissions
- Examples: "How many Year 10 students have attendance below 85% AND failing Math?" "What's our total outstanding fees from households with more than 2 children?"
- Same safe architecture: AI → structured query → Prisma → RLS

---

### R21. Parent Insight Card

**Behavior:**
- In parent portal, at top of dashboard: AI-generated summary card per child
- "Fatima attended 96% of classes this term, ranked in the top 30% of her year group for Maths, and has 2 upcoming assessments next week."
- Generated on login, cached 24h
- Uses only published/visible data (grades that have been published to parents)
- Friendly, encouraging tone

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `saved_reports` | Custom report builder saved configurations |
| `board_reports` | Generated board/governance reports |
| `compliance_report_templates` | Regulatory compliance field definitions |
| `scheduled_reports` | Scheduled report delivery configs |
| `report_alerts` | Threshold-based alert configs |

All tables tenant-scoped with RLS.

---

## New Permissions

| Permission | Description |
|---|---|
| `analytics.manage_reports` | Create custom reports, schedule delivery, set alerts |
| `analytics.view_board_reports` | View/generate board reports |
| `analytics.manage_compliance` | Configure compliance report templates |

---

## Implementation Order

1. **Foundation:** R1 (unified dashboard) + R4 (attendance analytics) + R5 (grade analytics) + R6 (demographics)
2. **Cross-module:** R2 (insights) + R7 (student progress) + R8 (admissions) + R9 (staff) + R10 (comms)
3. **Governance:** R11 (board report) + R12 (compliance) + R13 (scheduled delivery) + R14 (alerts)
4. **Export:** R15 (Excel) + R16 (PDF) + R17 (export upgrade)
5. **AI:** R18 (narrator) + R19 (predictions) + R20 (NL queries) + R21 (parent insight)
6. **Builder:** R3 (custom report builder — last because it's complex and all data sources must exist first)
