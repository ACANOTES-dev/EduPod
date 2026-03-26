---
name: Staff Wellbeing & Workload Intelligence
description: SHOULD-HAVE — Aggregate workload intelligence from existing scheduling/cover/payroll data, anonymous pulse surveys, CPD tracking, staff voice, EAP visibility. No competitor offers this. Union-safe by design.
type: project
status: final-spec
version: 1.0
date: 2026-03-26
---

# Staff Wellbeing & Workload Intelligence — Final Spec & Implementation Plan

## 1. Module Identity

**What this is:** An aggregate-first staff wellbeing and workload intelligence layer that surfaces patterns principals need to see — without identifying or monitoring individual staff. Built almost entirely on data EduPod already holds (scheduling, substitutions, cover duties, payroll, leave) combined with optional anonymous pulse surveys that give staff a voice.

**What this is not:** Not corporate wellness. No mindfulness modules, no resilience content, no gamified engagement scores, no push notifications nudging teachers to "check in". No individual monitoring, no performance profiling, no burnout diagnosis. This is an operational intelligence layer for school leadership, combined with a safe channel for staff voice. It respects teachers as professionals.

**Design philosophy:** Aggregate, not surveillance. Every design decision passes this test: *"Would the INTO/TUI/ASTI union representative be comfortable with this?"* If the answer is no, it doesn't ship.

**Framing principle:** The principal dashboard is framed around **organisational conditions**, not teacher deficits. The system always implies that the school environment is what leadership can change.

- ✅ timetable strain, cover burden concentration, substitution pressure, absence trend shifts, CPD participation culture
- ❌ high-risk staff count, underperforming departments, resilience concerns, burnout risk indicators

**Commercial positioning (safe language):**
- "This capability is largely absent from mainstream school MIS products."
- "Where staff wellbeing tools exist, they typically sit outside operational school systems and lack access to timetable, cover, and leave data."
- "We are not aware of any Irish MIS platform offering integrated staff workload intelligence."

Do not claim "no competitor anywhere globally" without verified evidence.

---

## 2. Irish Context

**Teacher supply crisis:** Ireland is in the grip of a teacher recruitment and retention crisis. Regional schools cannot fill posts. Substitute availability is at an all-time low. Principals report that workload and burnout are the primary reasons teachers leave.

**Union sensitivity:** Irish teaching unions (INTO, TUI, ASTI, FORSA for SNAs) are powerful and rightly protective. Any system perceived as monitoring individual teacher performance, tracking movements, or creating individual productivity scores will be rejected at the school gate. The module must be designed with union buy-in as a first-class architectural constraint.

**Teaching Council / Cosán:** The national framework for teachers' learning requires ongoing CPD but is largely self-directed and untracked. Schools need a way to support and evidence CPD without micromanaging it.

**Croke Park / Haddington Road hours:** Post-primary teachers have ~33 hours per year for professional development and school planning. Currently tracked on paper sign-in sheets.

**Employee Assistance Programme (EAP):** Many schools have EAP access through their management body (JMB, ETBI, etc.) but staff don't know about it or forget. Surfacing this information is a low-effort, high-impact action.

---

## 3. Non-Negotiable Rules

These are hard product rules, not guidelines. They apply to all versions.

### 3.1 Anonymity Rules

| Rule | Detail |
|------|--------|
| No individual survey traceability | Survey responses stored with NO `user_id`, NO `staff_profile_id`, NO session token, NO IP address, NO timestamp more granular than the day. Anonymity by architecture, not policy. |
| No "who has not responded" views | Principal sees only aggregate count: "12 of 35 staff responded this cycle." Never per-person response tracking. |
| Minimum response threshold | Configurable, default **5** respondents. Below threshold: results suppressed entirely with message "Not enough responses to maintain anonymity." |
| Department drill-down threshold | Default **10** members. Tenant cannot lower below **8**. No drill-down at all for free-text responses. |
| No cross-filtering below threshold | No combination of filters (department + time + question) that reduces a result set below the anonymity threshold. System blocks the query and explains why. |
| No small-team cycle comparison | If comparing two survey cycles could effectively reveal identity changes, suppress the comparison. |
| Batch release only | Survey results are released to the principal ONLY after the survey window closes. No real-time result viewing during an active survey. This eliminates timing inference attacks. |
| No export of raw anonymous comments | Threshold checks apply to exports. Comments only exportable in aggregate or above threshold. |

### 3.2 Individual Risk Rules

| Rule | Detail |
|------|--------|
| No individual wellbeing/burnout scores | Do not compute individual risk scores even if hidden from management. Do not store them. Period. |
| No red/amber/green staff flags | No traffic-light indicators on individual staff. |
| No "at-risk staff member" logic | No manager alerts tied to specific people within this module. |
| No individual manager-facing absence trend | Absence trends are aggregate only within this module. Individual absence data lives in leave management / HR, not here. |
| Personal workload = self-service only | A teacher's own workload dashboard is visible ONLY to that teacher. No other staff member, no principal, no platform admin can see it. |

### 3.3 Free-Text Safety Rules

Free-text survey responses are the single biggest anonymity risk in the entire module.

| Rule | Detail |
|------|--------|
| Moderation queue | Optional (configurable per tenant, default: ON). Free-text responses pass through a moderation queue before principal view. |
| Automated redaction suggestions | System scans for: staff names (matched against tenant staff list), room numbers, subject names, class identifiers, specific dates, and incident-specific references. Flags but does not auto-redact — moderator confirms. |
| Submission warning | Staff see before submitting: "Avoid names or details that could identify you or others. Your response is anonymous — help keep it that way." |
| Principal view options | Principal can choose: (a) view themed summaries only, or (b) explicitly open raw comments. Raw comments are never the default view. |

### 3.4 Correlation Display Rules

The "cover pressure → sick leave" insight is the module's crown jewel, but correlation on small-N monthly school data is fragile.

| Rule | Detail |
|------|--------|
| Minimum data points | No correlation displayed unless **minimum 12 data points** exist (e.g., 12 months of data). |
| Language | Always display as "these trends moved together" — never "X caused Y". |
| UI disclaimer | Permanent, non-dismissable note on every correlation view: "This shows patterns that occurred together. It does not prove that one caused the other. Use this as a starting point for investigation, not a conclusion." |
| No confidence scores | Do not display p-values, R², or statistical confidence to principals. They will be misinterpreted. |

---

## 4. Permission Model

| Role | Access |
|------|--------|
| **Staff member** | Own workload dashboard, own CPD portfolio, EAP/resources page, submit survey responses, submit named/anonymous suggestions, view suggestion response feed |
| **Principal / Deputy** | Aggregate workload dashboards, survey results (above threshold, after window close), suggestion feed, CPD culture metrics, termly board report generation, moderation queue (if enabled) |
| **Board role** | Termly anonymised summary report only. No dashboard access, no drill-down. |
| **HR / Payroll admin** | No special access to wellbeing data unless separately authorised via custom role. |
| **Platform admin** | No access to survey responses, suggestion content, or aggregate wellbeing dashboards. Impersonation explicitly blocked for all wellbeing endpoints. |
| **Any teacher** | Cannot see another teacher's workload metrics. |

**API-level enforcement:**
- No API endpoints that expose anonymous `survey_response` rows directly. All survey endpoints return aggregated results only.
- Impersonation guard: `@BlockImpersonation()` decorator on all wellbeing module endpoints. If `req.user.isImpersonating === true`, return 403.
- Board role endpoints return pre-rendered summary data only — no raw query capability.

---

## 5. Phased Scope

### V1 — Trust Before Breadth

Ship the operational core. Prove the module is safe and useful before expanding.

| Component | Description | Data Source | New Data Model? |
|-----------|-------------|-------------|-----------------|
| Personal staff workload dashboard | Teaching load, cover duties, timetable quality, free period distribution, consecutive periods, room changes, trend over time | Scheduling, Substitutions (read-only) | No — computed views |
| School-level aggregate workload dashboard | Average teaching periods, cover fairness distribution (Gini + range), timetable quality aggregates, over-allocated count (threshold-based, count only) | Scheduling, Substitutions (read-only) | No — computed views |
| Cover fairness analysis | Distribution curve, range, fairness index. Shows distribution — never names. | Substitutions (read-only) | No |
| Timetable quality metrics (aggregate) | Average consecutive periods, free period clumping, split timetable %, room changes | Scheduling (read-only) | No |
| Anonymous pulse surveys | 3–5 questions, Likert + single choice + optional freeform, batch release after window close, moderation queue, threshold enforcement | New | Yes — `staff_surveys`, `survey_questions`, `survey_responses` |
| EAP / resources page | Configurable EAP provider info, external support links, termly refresh prompt | Configuration | No — `tenant_settings` JSONB key |
| Anonymity explanation panels | Visible UI explaining how anonymity is protected — shown to all staff on survey pages and principal on results pages | — | No |
| Basic termly board report | Aggregate survey trends, workload distribution summary, absence patterns, CPD participation (when available). Pre-rendered, no drill-down. | All above | No |

### V2 — Depth

Ship after V1 has been in production and trust is established.

| Component | Description |
|-----------|-------------|
| CPD portfolio | Self-reported activities with Cosán dimensions, hours, evidence upload, exportable portfolio, auto-populate from school events |
| Croke Park / Haddington Road tracker | Running total vs entitlement per staff member (self-service view) |
| Staff suggestion box | Anonymous + named options, category tagging, principal response feed, response time tracking, aggregate accountability stats |
| Year-on-year comparisons | All aggregate metrics with trend lines across academic years |
| Absence pattern analysis (aggregate) | School-wide sick leave trends, day-of-week patterns, term comparison, seasonal patterns. All aggregate. |
| Substitution pressure index | Composite score: absence rate × cover difficulty × external sub availability. Trend over time. |
| Retention indicators (aggregate) | Staff in first 3 years (count only), workforce transition profile (aggregate only), turnover rate, unfilled posts. No age-based profiling language. |
| Critical incident staff-support prompts | When student wellbeing module declares a critical incident, prompt principal: "N staff were directly involved. Have they been offered support?" Checklist only, not automated intervention. |

**Dependency note:** Critical incident linkage requires a **Student Wellbeing module** that does not yet exist and is not in the current phase timeline. This needs its own spec before V2 ships. For V2 without student wellbeing, skip this component.

### V3 — Only If Schools Ask

| Component | Description |
|-----------|-------------|
| Peer observation facilitation | Voluntary opt-in, reciprocal matching, structured reflection (private to the pair, invisible to management) |
| DEIS/SSE alignment tagging | Tag CPD to school improvement plan targets |
| Advanced correlation views | Multi-variable trend analysis with strengthened statistical guardrails |
| Workforce transition analytics | Projected staffing horizon (aggregate, no individual identification, no age-profiling language) |
| DES inspection readiness report | Pre-formatted evidence of wellbeing supports, CPD structures, professional learning culture for WSE |
| DEIS planning data | Staff capacity metrics feeding DEIS action plans |

---

## 6. Data Model

### 6.1 New Tables

#### `staff_surveys`
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
title               VARCHAR(255) NOT NULL
description         TEXT
status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                    -- draft | active | closed | archived
frequency           VARCHAR(20) NOT NULL DEFAULT 'fortnightly'
                    -- weekly | fortnightly | monthly | ad_hoc
window_opens_at     TIMESTAMPTZ NOT NULL
window_closes_at    TIMESTAMPTZ NOT NULL
results_released    BOOLEAN NOT NULL DEFAULT FALSE
min_response_threshold  INT NOT NULL DEFAULT 5
dept_drill_down_threshold INT NOT NULL DEFAULT 10
moderation_enabled  BOOLEAN NOT NULL DEFAULT TRUE
created_by          UUID NOT NULL FK → users(id)
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()

CONSTRAINT chk_threshold_floor CHECK (dept_drill_down_threshold >= 8)
CONSTRAINT chk_window CHECK (window_closes_at > window_opens_at)
RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `survey_questions`
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
survey_id           UUID NOT NULL FK → staff_surveys(id) ON DELETE CASCADE
question_text       TEXT NOT NULL
question_type       VARCHAR(20) NOT NULL
                    -- likert_5 | single_choice | freeform
display_order       INT NOT NULL
options             JSONB           -- for single_choice: ["option1", "option2", ...]
is_required         BOOLEAN NOT NULL DEFAULT TRUE
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()

RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `survey_responses` — CRITICAL ANONYMITY TABLE
```
id                  UUID PK DEFAULT gen_random_uuid()
survey_id           UUID NOT NULL FK → staff_surveys(id) ON DELETE CASCADE
question_id         UUID NOT NULL FK → survey_questions(id) ON DELETE CASCADE
answer_value        INT             -- for likert/single_choice
answer_text         TEXT            -- for freeform
submitted_date      DATE NOT NULL   -- DATE ONLY, no timestamp
moderation_status   VARCHAR(20) DEFAULT 'pending'
                    -- pending | approved | flagged | redacted
                    -- only applies to freeform; likert/choice auto-approved

-- ██████████████████████████████████████████████████████
-- NO tenant_id COLUMN
-- NO user_id COLUMN
-- NO staff_profile_id COLUMN
-- NO session_id COLUMN
-- NO ip_address COLUMN
-- NO created_at TIMESTAMP (only submitted_date DATE)
-- NO foreign key to ANY user-related table
-- This is anonymity by architecture, not policy.
-- There is NO join path from a response to a user.
-- ██████████████████████████████████████████████████████

-- Note: tenant_id is intentionally absent. Survey responses
-- are scoped via survey_id → staff_surveys.tenant_id.
-- RLS is NOT applied to this table directly. Access is
-- controlled at the application layer via survey ownership.
```

#### `cpd_activities` (V2)
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
staff_profile_id    UUID NOT NULL FK → staff_profiles(id)
title               VARCHAR(255) NOT NULL
provider            VARCHAR(255)
activity_date       DATE NOT NULL
hours               DECIMAL(5,2) NOT NULL
activity_type       VARCHAR(30) NOT NULL
                    -- workshop | conference | online | peer_observation
                    -- action_research | reading | cosan_cluster
cosan_dimension     VARCHAR(50)
                    -- engaging_personally | engaging_professionally
                    -- engaging_school_community | engaging_colleagues
learning_outcomes   TEXT
evidence_url        VARCHAR(500)    -- S3 key for uploaded certificate/notes
is_auto_populated   BOOLEAN NOT NULL DEFAULT FALSE
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()

RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `croke_park_hours` (V2)
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
staff_profile_id    UUID NOT NULL FK → staff_profiles(id)
academic_year_id    UUID NOT NULL FK → academic_years(id)
activity_date       DATE NOT NULL
hours               DECIMAL(4,2) NOT NULL
description         VARCHAR(500) NOT NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()

RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `staff_suggestions` (V2)
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
staff_profile_id    UUID            -- NULL if anonymous
is_anonymous        BOOLEAN NOT NULL DEFAULT TRUE
category            VARCHAR(30) NOT NULL
                    -- workload | facilities | policy | professional_development
                    -- wellbeing | communication | other
content             TEXT NOT NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()

RLS: tenant_id = current_setting('app.current_tenant_id')
```

#### `suggestion_responses` (V2)
```
id                  UUID PK DEFAULT gen_random_uuid()
tenant_id           UUID NOT NULL FK → tenants(id)
suggestion_id       UUID NOT NULL FK → staff_suggestions(id)
responded_by        UUID NOT NULL FK → users(id)
content             TEXT NOT NULL
is_public           BOOLEAN NOT NULL DEFAULT TRUE
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()

RLS: tenant_id = current_setting('app.current_tenant_id')
```

### 6.2 Existing Tables — Read-Only Usage

| Data Point | Source Table(s) | Module |
|------------|----------------|--------|
| Teaching periods per teacher | `schedule_entries` | Scheduling |
| Cover/substitution duties | `substitutions`, `cover_records` | Scheduling |
| Timetable structure | `schedule_entries`, `period_grid` | Scheduling |
| Room assignments | `schedule_entries`, `rooms` | Scheduling |
| Staff absence days | `substitutions` (V1 proxy), `staff_leave` (when built) | Scheduling / Leave |
| Compensation context | `compensation_records` | Payroll |
| Staff profile metadata | `staff_profiles` (DOB for aggregate workforce transition) | Staff Profiles |

### 6.3 Configuration — `tenant_settings` JSONB Keys

```jsonc
{
  "staff_wellbeing": {
    "enabled": true,                          // module toggle
    "survey_default_frequency": "fortnightly",
    "survey_min_response_threshold": 5,       // floor: 5
    "survey_dept_drill_down_threshold": 10,   // floor: 8
    "survey_moderation_enabled": true,
    "workload_high_threshold_periods": 22,    // periods/week
    "workload_high_threshold_covers": 8,      // covers/term
    "eap_provider_name": "",
    "eap_phone": "",
    "eap_website": "",
    "eap_hours": "",
    "eap_management_body": "",
    "external_resources": []                  // [{name, phone, website}]
  }
}
```

All keys use Zod `.default()` — no backfill migration needed.

---

## 7. API Endpoints

### V1 Endpoints

**Personal Workload Dashboard** — `v1/staff-wellbeing/my-workload`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `/my-workload/summary` | Teaching load, cover count, timetable quality, trend | Self only |
| GET | `/my-workload/cover-history` | Personal cover duty history with school average comparison | Self only |
| GET | `/my-workload/timetable-quality` | Free period distribution, consecutive periods, split days, room changes | Self only |

**Aggregate Workload Dashboard** — `v1/staff-wellbeing/aggregate`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `/aggregate/workload-summary` | School-wide averages, ranges, over-allocated count | `wellbeing.view_aggregate` |
| GET | `/aggregate/cover-fairness` | Distribution curve, Gini coefficient, range | `wellbeing.view_aggregate` |
| GET | `/aggregate/timetable-quality` | Aggregate timetable quality metrics | `wellbeing.view_aggregate` |
| GET | `/aggregate/absence-trends` | School-wide absence patterns (V2 enriches with leave data) | `wellbeing.view_aggregate` |
| GET | `/aggregate/substitution-pressure` | Composite pressure index with trend | `wellbeing.view_aggregate` |

**Surveys** — `v1/staff-wellbeing/surveys`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `/surveys` | Create survey with questions | `wellbeing.manage_surveys` |
| GET | `/surveys` | List surveys with status | `wellbeing.manage_surveys` |
| GET | `/surveys/:id` | Survey detail | `wellbeing.manage_surveys` |
| PATCH | `/surveys/:id` | Update draft survey | `wellbeing.manage_surveys` |
| POST | `/surveys/:id/activate` | Open survey window | `wellbeing.manage_surveys` |
| POST | `/surveys/:id/close` | Close window + release results | `wellbeing.manage_surveys` |
| GET | `/surveys/:id/results` | Aggregate results (threshold-enforced, blocked during active window) | `wellbeing.view_survey_results` |
| GET | `/surveys/:id/results/comments` | Moderated freeform responses (threshold-enforced) | `wellbeing.view_survey_results` |
| GET | `/surveys/:id/moderation` | Pending freeform responses for moderation | `wellbeing.moderate_surveys` |
| PATCH | `/surveys/:id/moderation/:responseId` | Approve/flag/redact a freeform response | `wellbeing.moderate_surveys` |

**Survey Submission** — `v1/staff-wellbeing/respond` (authenticated but response stored anonymously)

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `/respond/active` | Get current active survey for this tenant (if any) | Any staff |
| POST | `/respond/:surveyId` | Submit anonymous response | Any staff |

**Implementation note on `/respond/:surveyId`:** The endpoint authenticates the user (to confirm they are staff at this tenant) and checks they haven't already responded (via a separate `survey_participation_tokens` table — see §7.1). After validation, it writes to `survey_responses` with NO user identifier. The participation check uses a one-way hash that cannot be reversed to identify the user.

**Resources** — `v1/staff-wellbeing/resources`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `/resources` | EAP info + external resources from tenant_settings | Any staff |

**Board Report** — `v1/staff-wellbeing/reports`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `/reports/termly-summary` | Pre-rendered aggregate summary for board | `wellbeing.view_board_report` |

**Total V1: ~20 endpoints**

### 7.1 Double-Vote Prevention Without Identification

The challenge: prevent a staff member from submitting twice while storing no user identifier on the response.

**Solution:** `survey_participation_tokens` table.

```
survey_id           UUID NOT NULL FK → staff_surveys(id)
token_hash          VARCHAR(128) NOT NULL
created_date        DATE NOT NULL

PK (survey_id, token_hash)
-- Auto-deleted 7 days after survey closes (cron job)
```

On submission:
1. Compute `token = HMAC-SHA256(survey_id + user_id, server_secret)`
2. Hash: `token_hash = SHA256(token)`
3. Check if `(survey_id, token_hash)` exists → if yes, reject as duplicate
4. Insert token row
5. Write response rows (no user identifier)
6. The HMAC secret is server-side only. The token_hash cannot be reversed to user_id without the secret. After the tokens are deleted post-survey, even the server cannot determine who participated.

---

## 8. Frontend Pages

### V1 Pages

| Route | Description | Role |
|-------|-------------|------|
| `/wellbeing/my-workload` | Personal workload dashboard: teaching load, covers, timetable quality, trends | Staff (self only) |
| `/wellbeing/resources` | EAP info, external support links, Pieta House / Samaritans / text 50808 / union helplines | All staff |
| `/wellbeing/survey` | Active survey submission form with anonymity explanation panel | All staff |
| `/wellbeing/dashboard` | Aggregate workload heatmap, cover fairness, timetable quality, substitution pressure | Principal/Deputy |
| `/wellbeing/surveys` | Survey management: create, activate, close, view results | Principal/Deputy |
| `/wellbeing/surveys/[id]` | Survey detail with aggregate results (after close), moderation queue | Principal/Deputy |
| `/wellbeing/reports` | Termly board report generation | Principal/Deputy/Board |

**7 pages in V1.**

### V2 Pages (additional)

| Route | Description | Role |
|-------|-------------|------|
| `/wellbeing/my-cpd` | CPD portfolio: log activities, Cosán dimensions, hours tracker, export | Staff (self only) |
| `/wellbeing/my-cpd/croke-park` | Croke Park / Haddington Road hours tracker | Staff (self only) |
| `/wellbeing/suggestions` | Submit suggestion (anon/named), view response feed | All staff |
| `/wellbeing/suggestions/manage` | Review suggestions, post responses | Principal/Deputy |
| `/wellbeing/dashboard/cpd` | CPD culture metrics: participation rate, dimension distribution, budget | Principal/Deputy |
| `/wellbeing/dashboard/retention` | Workforce transition profile, turnover, unfilled posts (aggregate) | Principal/Deputy |
| `/wellbeing/dashboard/trends` | Year-on-year comparison across all aggregate metrics | Principal/Deputy |

### UI Requirements

**Anonymity explanation panels** (V1, non-negotiable):
- Survey submission page: "Your response is anonymous. We store no information that could identify you — not your name, not your account, not even the time you submitted. Results are only released after the survey closes."
- Principal results page: "These results are aggregate. Individual responses cannot be traced to any staff member. Free-text responses have been reviewed for identifying information."
- Architecture note (expandable): Brief, plain-language explanation of the technical anonymity measures. Staff should be able to trust the architecture, not just the school.

**Framing language in UI:**
- Use: "workload pressure", "cover burden", "timetable strain", "substitution pressure", "operational wellbeing"
- Never use: "burnout risk", "at-risk staff", "high-risk", "underperforming", "resilience"
- Retirement/age indicators (V2): Use "workforce transition profile" and "projected staffing horizon" — never "approaching retirement"

---

## 9. Worker Jobs

### V1 Jobs (wellbeing queue)

| Job | Trigger | Description |
|-----|---------|-------------|
| `wellbeing:compute-workload-metrics` | Daily cron 04:00 UTC | Compute and cache aggregate workload metrics for all tenants. Personal metrics computed on-demand (Redis-cached 5min). |
| `wellbeing:release-survey-results` | Survey window close | Mark survey as results_released, compute aggregates, apply threshold checks. |
| `wellbeing:cleanup-participation-tokens` | Daily cron 05:00 UTC | Delete participation tokens for surveys closed >7 days ago. |
| `wellbeing:moderation-scan` | On freeform response submission | Scan freeform text for staff names, room numbers, subject names, dates. Flag if match found. |

### V2 Jobs (additional)

| Job | Trigger | Description |
|-----|---------|-------------|
| `wellbeing:suggestion-response-notify` | On principal response to suggestion | If named suggestion: notify the staff member. If anonymous: no notification (nowhere to send it). |
| `wellbeing:cpd-auto-populate` | On school event completion | Pre-populate CPD hours for staff who attended school-facilitated CPD events. |

---

## 10. Audit & Trust

A privacy-sensitive module needs stronger auditability, not weaker.

### Audit Logging

| Event | Logged Data |
|-------|-------------|
| Principal views aggregate dashboard | user_id, timestamp, dashboard_section |
| Principal views survey results | user_id, timestamp, survey_id |
| Principal opens raw freeform comments | user_id, timestamp, survey_id (explicit opt-in action logged) |
| Survey created/activated/closed | user_id, timestamp, survey_id, action |
| Moderation action (approve/flag/redact) | user_id, timestamp, response_id, action, reason |
| Board report generated | user_id, timestamp, report_period |
| Threshold enforcement triggered | timestamp, survey_id, filter_attempted, reason_blocked |

### System Guardrails

| Guardrail | Implementation |
|-----------|----------------|
| Threshold enforcement | All aggregate query endpoints check result count ≥ threshold before returning data. Enforced at service layer, not just UI. |
| Cross-filter blocking | If applying a filter combination would reduce result count below threshold, return 403 with explanation. |
| Impersonation block | `@BlockImpersonation()` decorator on ALL wellbeing module controllers. Platform admin impersonation returns 403. |
| Survey window enforcement | Results endpoint returns 403 if survey status is `active`. Results only available after `closed` status. |
| Participation token expiry | Tokens auto-deleted 7 days after survey close. After deletion, even server-side analysis cannot determine who participated. |

---

## 11. Dependencies

| Dependency | Status | Required For |
|------------|--------|-------------|
| Scheduling module | ✅ Built | Teaching load, timetable quality, room changes |
| Substitution module | ✅ Built | Cover duties, fairness analysis, absence proxy |
| Payroll module | ✅ Built | Compensation context (V2 reports) |
| Staff Profiles module | ✅ Built | Staff metadata, DOB for aggregate workforce transition (V2) |
| Communications module | ✅ Built | Suggestion response notifications (V2) |
| Leave management module | ❌ Not built (in Leave → Sub pipeline spec) | Enriches absence analysis. V1 uses substitution data as proxy. |
| Student Wellbeing module | ❌ Not built, not in phase timeline | Critical incident staff-support linkage (V2). **Needs its own spec before this V2 component ships.** |

---

## 12. Effort Estimate

### V1

| Component | Effort | Rationale |
|-----------|--------|-----------|
| Personal workload dashboard | Low | Read-only computed views over scheduling data. Redis-cached. |
| Aggregate workload dashboard | Low | Same data, aggregated. Gini computation is trivial. |
| Cover fairness analysis | Low | Distribution query over substitutions table. |
| Timetable quality metrics | Low | Computed from schedule_entries + period_grid. |
| Anonymous pulse surveys | Medium | New data model, anonymity architecture, participation token system, moderation queue, threshold enforcement. The hardest piece is ensuring no accidental identification paths — a design discipline challenge. |
| EAP/resources page | Trivial | Read from tenant_settings JSONB. |
| Anonymity explanation panels | Trivial | Static UI content. |
| Termly board report | Low | Aggregate views rendered to PDF via existing Puppeteer pipeline. |

**V1 total: Low-Medium. ~3 weeks.**
- Week 1: Data model, survey anonymity architecture, participation tokens, API endpoints
- Week 2: Aggregate computation jobs, personal dashboard, aggregate dashboard, threshold enforcement
- Week 3: Survey UI (create/submit/results/moderation), explanation panels, board report, testing

### V2

| Component | Effort | Rationale |
|-----------|--------|-----------|
| CPD portfolio | Low | CRUD + export. Cosán dimension categorisation. |
| Croke Park tracker | Low | Simple hours ledger. |
| Suggestion box | Low | CRUD + response tracking + anonymous submission. |
| Year-on-year comparisons | Low | Additional time-series queries over cached metrics. |
| Absence patterns | Low | Aggregate queries over substitution/leave data. |
| Substitution pressure index | Low | Composite score computation. |
| Retention indicators | Low | Aggregate counts from staff_profiles. |
| Critical incident prompts | Low | Flag on CI record + principal reminder. Requires student wellbeing module. |

**V2 total: Low-Medium. ~2–3 weeks.**

### V3

**V3 total: Low. ~1–2 weeks.** Only built if schools request it. Peer observation is the most complex piece (matching algorithm + reflection templates).

---

## 13. Implementation Sequence

### Within V1 (3 weeks)

**Sub-plan 1 (Week 1): Foundation + Survey Architecture**
1. Database migrations: `staff_surveys`, `survey_questions`, `survey_responses`, `survey_participation_tokens`
2. `tenant_settings` JSONB schema extension with Zod defaults
3. `StaffWellbeingModule` NestJS module with `@BlockImpersonation()` guard
4. Survey CRUD service + controller (create, list, detail, update, activate, close)
5. Anonymous response submission with HMAC participation token
6. Moderation scan job (name/room/subject detection)
7. Participation token cleanup job

**Sub-plan 2 (Week 2): Workload Intelligence**
1. Workload computation service (reads scheduling + substitution data)
2. Personal workload dashboard endpoints (teaching load, covers, timetable quality, trends)
3. Aggregate workload dashboard endpoints (school-wide averages, ranges, over-allocated count)
4. Cover fairness computation (distribution, Gini coefficient)
5. Timetable quality metrics computation (consecutive periods, free period distribution, split days, room changes)
6. Daily cron job for aggregate metric caching
7. Redis caching for personal metrics (5min TTL)

**Sub-plan 3 (Week 3): Survey Results + UI + Reports**
1. Survey results aggregation service with threshold enforcement
2. Cross-filter blocking logic
3. Results endpoint (blocked during active window, batch release only)
4. Freeform comments endpoint with moderation status filter
5. Board report generation (aggregate summary → PDF)
6. All frontend pages (7 pages)
7. Anonymity explanation panels
8. Audit logging for all principal-facing actions
9. Integration tests: threshold enforcement, impersonation blocking, double-vote prevention, timing attack prevention (no results during active window)

---

## 14. Testing Requirements

### Unit Tests
- Threshold enforcement: verify data suppressed when response count < threshold
- Cross-filter blocking: verify 403 when filter combination reduces below threshold
- Participation token: verify HMAC computation, duplicate detection, cleanup
- Workload computation: verify aggregate calculations against known scheduling data
- Gini coefficient: verify against known distributions

### Integration Tests (against real PostgreSQL with RLS)
- **Anonymous submission flow:** submit response → verify no user identifier in `survey_responses` table → verify participation token exists → verify duplicate rejected
- **Batch release:** submit responses during active window → verify results endpoint returns 403 → close survey → verify results now available
- **Impersonation block:** impersonate user → call any wellbeing endpoint → verify 403
- **Threshold suppression:** create survey with 3 responses → verify results suppressed → add 2 more → verify results now visible
- **Moderation flow:** submit freeform with staff name → verify flagged → approve/redact → verify in results
- **Token cleanup:** close survey → advance clock 8 days → run cleanup → verify tokens deleted

### RLS Leakage Tests
- Verify `survey_responses` has no tenant_id column and no RLS policy (access controlled at app layer)
- Verify `staff_surveys`, `survey_questions` RLS prevents cross-tenant access
- Verify aggregate endpoints only return data for current tenant

---

## 15. Demo Strategy

The module sells best when you do NOT start with "wellbeing". Start with operational strain.

### Demo Flow

**Step 1: Show the principal the school workload heatmap.**
Not philosophy. Not surveys. Real operational pressure.
- Cover duty spread this term (distribution curve, fairness index)
- Average consecutive teaching periods
- Percentage of split timetables
- Substitution pressure trend

**Step 2: Show the connection.**
"Your highest cover-pressure period was followed by your highest staff absence period."
(Only shown if 12+ data points exist. Always with "these trends moved together" framing.)

**Step 3: Show the staff voice layer.**
- Pulse survey trend (aggregate scores over time)
- Anonymous suggestions with response accountability
- EAP visibility

**Step 4: Close.**
"Compass manages your students. VSware manages your timetable. EduPod manages your school — students AND the people who teach them."

### The Hidden Value Pitch (for principals who need to justify budget)

This module gives principals evidence for decisions they already struggle to justify:
- Requesting more substitution budget
- Redistributing cover duties
- Restructuring meeting schedules
- Redesigning timetables to reduce split days
- Supporting early-career teachers with reduced cover loads
- Prioritising CPD in areas of greatest strain

It converts an emotional problem into a governance and planning problem.

---

## 16. Risks — Named and Mitigated

| Risk | Mitigation |
|------|-----------|
| **Union distrust** | Architecture-enforced anonymity, explanation panels, conservative thresholds, no individual scoring. Offer union rep a walkthrough before school-wide launch. |
| **GDPR/privacy concern from free text** | Moderation queue (default ON), automated redaction suggestions, submission warning, principal sees themed summaries by default. |
| **False confidence from weak correlations** | 12-point minimum, "trends moved together" language, permanent non-dismissable disclaimer, no statistical confidence scores. |
| **Leadership misuse as accountability tool** | No individual data in principal views, permission model blocks drill-down, audit log tracks all principal access, framing language enforces organisational (not individual) lens. |
| **Survey fatigue** | Default fortnightly, 3–5 questions maximum, configurable down to monthly or ad-hoc. Less is more. |
| **Low response rates creating weak signals** | Threshold suppression prevents misleading small-sample results. Response rate trend visible to principal (aggregate only) as a signal to adjust approach. |
| **Age-related profiling perception** | No "approaching retirement" language. Use "workforce transition profile" and "projected staffing horizon". Aggregate counts only, no drill-down. V2+ only. |

---

## 17. Commercially Unique Value

EduPod's advantage is structural: it is the only platform that holds timetable + substitutions + cover + leave + payroll + class assignments in one place. The workload intelligence layer is impossible to build as a standalone tool — you need the scheduling data. This is a natural monopoly of integrated data.

Where standalone tools exist (e.g., Welbee in the UK), they run surveys but cannot correlate with workload because they lack timetable, cover, and leave data. EduPod can show the connection between operational pressure and staff experience — no other tool can.

The module's strongest single insight: *"Months with higher cover duty loads correlate with higher staff absence the following month."* That single data point, backed by evidence, justifies the entire module. It gives principals data to argue for budget, to redistribute duties, to restructure timetables.

For the first time, a Board of Management can see aggregate staff wellbeing trends over time. This is governance-grade insight that informs real decisions about staffing, budget allocation, and policy changes.
