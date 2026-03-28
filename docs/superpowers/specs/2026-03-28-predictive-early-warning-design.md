# Predictive Early Warning System — Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Priority:** Should-have (unique market differentiator)

## Overview

A cross-module risk intelligence layer that correlates attendance, grades, behaviour, wellbeing, and parent engagement data to flag at-risk students before they fail. No competitor does cross-module correlation — EduPod is uniquely positioned because all data lives in one platform.

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Signal scope | All 5 domains from day one | All modules are fully built; no reason to phase inputs |
| Computation model | Hybrid: daily batch + intraday high-severity bump | Overnight handles gradual trends; intraday catches urgent events (suspension, critical incident) |
| Visibility | Tiered + action routing | Yellow→homeroom teacher, amber→year head, red→principal + pastoral lead |
| Scoring | Configurable weights with strong defaults | Adapts to school context (golden rule); most schools won't touch defaults |
| Output surfaces | Email digest + in-app dashboard + push alerts | Different temporal needs: weekly summary, daily working view, urgent interrupts |
| Cohort analysis | Full dimensional pivot (year/class/subject/period/domain) | ETB-ready; clean computation/access layer separation |
| Risk tiers | 4 tiers (green/yellow/amber/red) with hysteresis | Yellow separates "watch" from "intervene"; hysteresis prevents alert fatigue |
| Explanation | Score + breakdown + NL summary + trend | Template-based string construction, no AI cost, fully deterministic |
| Historical validation | Deferred to future iteration | Needs a full academic year of data to validate against |

## Architecture: Three-Layer Computation

```
┌─────────────────────────────────────────────────────┐
│                   Action Layer                       │
│  Routing evaluator · Notification dispatch ·         │
│  Intervention creation · Assignment                  │
├─────────────────────────────────────────────────────┤
│                  Scoring Engine                       │
│  Weight application · Cross-domain boost ·           │
│  Hysteresis · NL summary · Trend calculation         │
│  (Pure computation — no DB access — ETB-portable)    │
├─────────────────────────────────────────────────────┤
│               Signal Collectors (×5)                 │
│  Attendance · Grades · Behaviour · Wellbeing ·       │
│  Engagement — each a thin Prisma-only adapter        │
└─────────────────────────────────────────────────────┘
```

**Signal collectors** query existing domain tables and alert records. Each outputs a uniform `SignalResult`. Schema coupling is isolated here — if a domain's schema changes, only its collector needs updating.

**Scoring engine** is a pure computation module. Takes 5 SignalResults + tenant config, produces a `RiskAssessment`. No DB access. Independently testable. Portable to ETB.

**Action layer** handles routing, notifications, and intervention creation by calling existing services (NotificationsService, pastoral intervention service).

---

## Data Model

### student_risk_profiles

One row per student per academic year. The "current state" table — what the dashboard queries.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| tenant_id | UUID FK NOT NULL | → tenants |
| student_id | UUID FK NOT NULL | → students |
| academic_year_id | UUID FK NOT NULL | → academic_years |
| composite_score | NUMERIC(5,2) | 0-100 |
| risk_tier | ENUM | green / yellow / amber / red |
| tier_entered_at | TIMESTAMPTZ | When current tier was entered |
| attendance_score | NUMERIC(5,2) | 0-100 domain sub-score |
| grades_score | NUMERIC(5,2) | 0-100 domain sub-score |
| behaviour_score | NUMERIC(5,2) | 0-100 domain sub-score |
| wellbeing_score | NUMERIC(5,2) | 0-100 domain sub-score |
| engagement_score | NUMERIC(5,2) | 0-100 domain sub-score |
| signal_summary_json | JSONB | NL text + top signal data points |
| trend_json | JSONB | Last 30 daily composite scores |
| assigned_to_user_id | UUID FK NULLABLE | → users. Staff member responsible |
| assigned_at | TIMESTAMPTZ NULLABLE | When assignment was made |
| last_computed_at | TIMESTAMPTZ NOT NULL | Last computation timestamp |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | @updatedAt |

**Indexes:** UNIQUE (tenant_id, student_id, academic_year_id), (tenant_id, risk_tier), (tenant_id, composite_score DESC)
**RLS:** Standard tenant_isolation policy.

### student_risk_signals

Append-only audit trail. One row per signal detection event.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| tenant_id | UUID FK NOT NULL | → tenants |
| student_id | UUID FK NOT NULL | → students |
| academic_year_id | UUID FK NOT NULL | → academic_years |
| domain | ENUM | attendance / grades / behaviour / wellbeing / engagement |
| signal_type | VARCHAR | e.g. 'consecutive_absences', 'below_class_mean' |
| severity | ENUM | low / medium / high / critical |
| score_contribution | NUMERIC(5,2) | Points this signal contributed |
| details_json | JSONB | Signal-specific data |
| source_entity_type | VARCHAR | e.g. 'AttendancePatternAlert' |
| source_entity_id | UUID | FK to source record in domain table |
| detected_at | TIMESTAMPTZ NOT NULL | When signal was detected |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**No updated_at** (append-only).
**Indexes:** (tenant_id, student_id, detected_at DESC), (tenant_id, domain, detected_at DESC)
**RLS:** Standard tenant_isolation policy.

### early_warning_tier_transitions

Append-only. Logs every tier change. Drives hysteresis, notifications, and historical analysis.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| tenant_id | UUID FK NOT NULL | → tenants |
| student_id | UUID FK NOT NULL | → students |
| profile_id | UUID FK NOT NULL | → student_risk_profiles |
| from_tier | ENUM NULLABLE | green / yellow / amber / red (null if first computation) |
| to_tier | ENUM NOT NULL | green / yellow / amber / red |
| composite_score | NUMERIC(5,2) | Score at time of transition |
| trigger_signals_json | JSONB | Which signals caused the change |
| routed_to_user_id | UUID FK NULLABLE | → users. Who was notified |
| notification_id | UUID FK NULLABLE | → notifications. The notification sent |
| transitioned_at | TIMESTAMPTZ NOT NULL | When transition occurred |
| created_at | TIMESTAMPTZ | DEFAULT now() |

**No updated_at** (append-only).
**Indexes:** (tenant_id, student_id, transitioned_at DESC), (tenant_id, to_tier, transitioned_at DESC)
**RLS:** Standard tenant_isolation policy.

### early_warning_configs

Per-tenant configuration. One row per tenant.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `gen_random_uuid()` |
| tenant_id | UUID FK NOT NULL UNIQUE | → tenants |
| is_enabled | BOOLEAN | DEFAULT false |
| weights_json | JSONB | `{attendance: 25, grades: 25, behaviour: 20, wellbeing: 20, engagement: 10}` |
| thresholds_json | JSONB | `{green: 0, yellow: 30, amber: 50, red: 75}` |
| hysteresis_buffer | INTEGER | DEFAULT 10 — points below threshold to downgrade |
| routing_rules_json | JSONB | `{yellow: {role: 'homeroom_teacher'}, amber: {role: 'year_head'}, red: {roles: ['principal', 'pastoral_lead']}}` |
| digest_day | INTEGER | DEFAULT 1 (Monday). Day of week. |
| digest_recipients_json | JSONB | User IDs or role filters |
| high_severity_events_json | JSONB | Which events trigger intraday recompute (default: suspension, critical_incident, third_consecutive_absence) |
| created_at | TIMESTAMPTZ | DEFAULT now() |
| updated_at | TIMESTAMPTZ | @updatedAt |

**All JSONB fields have Zod schemas with `.default()` values.**
**RLS:** Standard tenant_isolation policy.

### New Enums

```
EarlyWarningRiskTier: green, yellow, amber, red
EarlyWarningDomain: attendance, grades, behaviour, wellbeing, engagement
EarlyWarningSignalSeverity: low, medium, high, critical
```

---

## Signal Collectors

Each collector is a standalone `@Injectable()` class with `PrismaService` as its only dependency. All output the `SignalResult` interface.

### Common Interface

```typescript
interface SignalResult {
  domain: 'attendance' | 'grades' | 'behaviour' | 'wellbeing' | 'engagement';
  rawScore: number; // 0-100 normalized
  signals: DetectedSignal[];
  summaryFragments: string[];
}

interface DetectedSignal {
  signalType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string; // e.g. "Absent 3 consecutive days (Mar 25-27)"
}
```

### 1. AttendanceSignalCollector

**Sources:** `DailyAttendanceSummary` (30 days), `AttendancePatternAlert` (active), `AttendanceRecord` (recent for streaks).

| Signal | Condition | Points |
|--------|-----------|--------|
| attendance_rate_decline | 30-day rate below tenant threshold (default 90%) | +10-30 |
| consecutive_absences | 3+ consecutive days absent (excl. school closures) | +15-25 |
| recurring_day_pattern | Same day absent 3+ times in 4 weeks | +10-20 |
| chronic_tardiness | Late > 20% of attended days in 30-day window | +5-15 |
| attendance_trajectory | Week-over-week rate declining 3+ consecutive weeks | +10-20 |

Leverages existing `AttendancePatternAlert` records — active alert types map directly to signals.

### 2. GradesSignalCollector

**Sources:** `StudentAcademicRiskAlert` (active), `PeriodGradeSnapshot` (current + previous period), `Grade` (missing work), `ProgressReportEntry` (trend direction).

| Signal | Condition | Points |
|--------|-----------|--------|
| below_class_mean | Student avg below class mean by configurable % | +10-30 |
| grade_trajectory_decline | PeriodGradeSnapshot decline across consecutive periods | +10-25 |
| missing_assessments | 2+ assessments with is_missing = true in current period | +10-20 |
| score_anomaly | Score > 2 std dev below class | +15-25 |
| multi_subject_decline | Decline in 3+ subjects simultaneously | +15-30 |

Consumes existing `StudentAcademicRiskAlert` records — at_risk_low/medium/high map to score bands.

### 3. BehaviourSignalCollector

**Sources:** `BehaviourAlert` (active), `BehaviourIncidentParticipant` (role=subject, 30 days), `BehaviourSanction` (active), `BehaviourExclusionCase` (current year), `BehaviourIntervention` (active).

| Signal | Condition | Points |
|--------|-----------|--------|
| incident_frequency | 3+ negative incidents in 14-day window | +10-25 |
| escalating_severity | Average severity increasing over 30 days | +10-20 |
| active_sanction | Currently serving detention/suspension | +15-30 |
| exclusion_history | Any exclusion case this academic year | +20-35 |
| failed_intervention | Intervention closed_unsuccessful or overdue | +10-20 |

Only counts negative polarity incidents.

### 4. WellbeingSignalCollector

**Sources:** `StudentCheckin` (30 days), `PastoralConcern` (open/investigating/monitoring), `PastoralCase` (open), `PastoralReferral` (pending/active), `CriticalIncidentAffected` (current year).

| Signal | Condition | Points |
|--------|-----------|--------|
| declining_wellbeing_score | wellbeing_score trending down over 3+ check-ins | +10-25 |
| low_mood_pattern | Mood consistently negative across last 3 check-ins | +10-20 |
| active_pastoral_concern | Open concern severity medium+ against student | +15-30 |
| active_pastoral_case | Student linked to open pastoral case | +10-20 |
| external_referral | Active referral to CAMHS/SENCO/external | +15-25 |
| critical_incident_affected | Student affected by critical incident this year | +20-35 |

**DZ-27 respected:** Never accesses `survey_responses` (no tenant_id, anonymity-by-design).

### 5. EngagementSignalCollector

**Sources:** `Notification` (parent-targeted, 30 days), `ParentInquiry` (activity this year), `StudentParent → Parent → User` (last_login_at), `BehaviourParentAcknowledgement` (response times).

| Signal | Condition | Points |
|--------|-----------|--------|
| low_notification_read_rate | < 30% of in-app notifications read in 30 days | +10-20 |
| no_portal_login | No parent logged in within 21 days (configurable) | +15-25 |
| no_parent_inquiry | Zero parent-initiated communication this year | +5-15 |
| slow_acknowledgement | Behaviour acknowledgement > 72h average | +10-20 |
| disengagement_trajectory | Login frequency and read rate both declining over 4 weeks | +10-20 |

**Best-parent metric:** Uses the most engaged parent's data to avoid penalising single-parent households.

---

## Scoring Engine

Pure computation module. No DB access. ETB-portable.

### Pipeline

1. **Receive** 5× SignalResult
2. **Apply tenant weights** — default: attendance 25%, grades 25%, behaviour 20%, wellbeing 20%, engagement 10%. Weights must sum to 100.
3. **Cross-domain correlation boost** — if 3+ domains have rawScore ≥ 40: +5. If 4+: +10. If all 5: +15. The 40-point threshold is configurable. This is the core differentiator.
4. **Assign tier with hysteresis** — see below.
5. **Generate NL summary** — trend sentence + top 5 signal fragments sorted by score contribution.
6. **Return `RiskAssessment`** — compositeScore, riskTier, domainScores, crossDomainBoost, signals, summaryText, trendData, tierChanged, previousTier.

### Tier Thresholds (defaults)

| Tier | Range | Meaning |
|------|-------|---------|
| Green | 0-29 | On track |
| Yellow | 30-49 | Watch |
| Amber | 50-74 | Monitoring / active concern |
| Red | 75-100 | Intervention needed |

### Hysteresis

- **Upgrading (worsening):** Immediate. Score crosses threshold → tier changes.
- **Downgrading (improving):** Score must drop `hysteresis_buffer` (default 10) points below current tier's entry threshold.
  - Red (entered at 75): must reach ≤ 65 to drop to amber.
  - Amber (entered at 50): must reach ≤ 40 to drop to yellow.
  - Yellow (entered at 30): must reach ≤ 20 to drop to green.

### NL Summary Generation

Template-based. No AI API call. Deterministic.

```
"Risk score increased from 48 to 71 over the past 3 weeks. Maths grade
dropped from B+ to C- this period. Absent 4 of the last 10 school days
including 3 consecutive days (Mar 25-27). Two negative behaviour incidents
in the last 14 days. No parent portal login in 26 days."
```

Each collector generates `summaryFragment` strings with concrete data. The scoring engine merges them — trend sentence first, then top 5 by contribution.

### RiskAssessment Interface

```typescript
interface RiskAssessment {
  compositeScore: number;
  riskTier: 'green' | 'yellow' | 'amber' | 'red';
  domainScores: {
    attendance: number;
    grades: number;
    behaviour: number;
    wellbeing: number;
    engagement: number;
  };
  crossDomainBoost: number; // 0, 5, 10, or 15
  signals: DetectedSignal[];
  summaryText: string;
  trendData: number[]; // last 30 daily composite scores
  tierChanged: boolean;
  previousTier: RiskTier | null;
}
```

---

## Action Layer

### Routing Evaluator

When `tierChanged === true`, resolves recipient based on `routing_rules_json`:

| Tier | Default Route |
|------|--------------|
| Yellow | Homeroom teacher (via class_enrolments → classes → class_staff where role = homeroom_teacher) |
| Amber | Year head (via students → year_groups → staff assignment where role = year_head) |
| Red | Principal + pastoral lead (via tenant role assignments) |

### Notification Dispatch

Calls `NotificationsService.createNotification()` with:
- `template_key: 'early_warning_tier_change'`
- `source_entity_type: 'EarlyWarningTierTransition'`
- `source_entity_id: transition.id`
- `payload_json`: student name, new tier, composite score, top 3 signals, NL summary

Logs to `early_warning_tier_transitions` with `notification_id` FK.

### Intervention Creation

On **red tier entry only**: creates a draft `PastoralIntervention` via existing pastoral service:
- `intervention_type`: 'early_warning_referral'
- `status`: 'draft' (staff must review and activate)
- `objectives_json`: auto-populated from top signals
- Linked to the student

### Assignment

Sets `assigned_to_user_id` on `student_risk_profiles` to the primary routed recipient. Dashboard shows ownership. Staff can manually reassign via API.

---

## Worker Jobs

New queue: `EARLY_WARNING` in `queue.constants.ts`.

### early-warning:compute-daily

- **Type:** Cross-tenant cron
- **Schedule:** 01:00 UTC daily (before 02:00 academic risk job)
- **Logic:** Iterate all tenants with `is_enabled = true`. For each tenant, iterate all active students. Run 5 collectors → scoring engine → action layer. Upsert `student_risk_profiles`, append to `student_risk_signals`, log tier transitions.
- **Processor:** `EarlyWarningComputeProcessor extends WorkerHost`
- **Job class:** `ComputeDailyJob extends TenantAwareJob`

### early-warning:compute-student

- **Type:** Event-driven, single student
- **Trigger:** High-severity events as configured in `high_severity_events_json`:
  - Suspension created (`BehaviourExclusionCase` inserted)
  - Critical incident reported (`CriticalIncident` created with affected student)
  - 3rd consecutive absence detected (attendance pattern detection)
- **Dispatch mechanism:** The early-warning module exports an `EarlyWarningTriggerService` with a `triggerStudentRecompute(tenantId, studentId, event)` method. This service is injected into the 3 source modules' existing processors:
  - `BehaviourExclusionProcessor` → calls trigger after exclusion case creation
  - `CriticalIncidentProcessor` → calls trigger for each affected student
  - `AttendancePatternProcessor` → calls trigger when consecutive absence threshold hit
  - Each call enqueues `early-warning:compute-student` on the EARLY_WARNING queue. The trigger service checks `early_warning_configs.is_enabled` and `high_severity_events_json` before enqueuing — if the event type isn't in the config, it's a no-op.
- **Payload:** `{ tenant_id, student_id, trigger_event }`
- **Logic:** Same pipeline as daily, but for one student.

### early-warning:weekly-digest

- **Type:** Cross-tenant cron
- **Schedule:** Weekly on `digest_day` (default Monday) at 07:00 tenant TZ
- **Logic:** Query `student_risk_profiles` for the tenant. Group by tier. Generate digest email with: top N at-risk students (configurable, default 10), tier distribution, week-over-week score changes, new tier entries. Send via `NotificationsService` with template `early_warning_weekly_digest`.
- **Recipients:** Per `digest_recipients_json` config.

---

## API Endpoints

All under `@Controller('v1/early-warnings')` with `@UseGuards(AuthGuard, PermissionGuard)` and `@ModuleEnabled('early_warning')`.

| Method | Route | Permission | Description |
|--------|-------|-----------|-------------|
| GET | `/v1/early-warnings` | `early_warning.view` | Paginated risk profiles. Filter: tier, year_group_id, class_id. Sort: composite_score, student_name. Role-scoped. |
| GET | `/v1/early-warnings/:studentId` | `early_warning.view` | Single student detail: profile, signals, transitions, trend. |
| GET | `/v1/early-warnings/cohort` | `early_warning.view` | Dimensional pivot. Query params: group_by (year_group/class/subject/domain), period, filters. |
| GET | `/v1/early-warnings/summary` | `early_warning.view` | Tier distribution counts: `{green: 180, yellow: 28, amber: 12, red: 3}` |
| GET | `/v1/early-warnings/config` | `early_warning.manage` | Read tenant config. |
| PUT | `/v1/early-warnings/config` | `early_warning.manage` | Update tenant config. Validates weights sum to 100. |
| POST | `/v1/early-warnings/:studentId/acknowledge` | `early_warning.acknowledge` | Mark profile as reviewed by current user. |
| POST | `/v1/early-warnings/:studentId/assign` | `early_warning.assign` | Manually assign a staff member. |

---

## Frontend Pages

### Dashboard Card
Tier distribution donut on main dashboard. Red/amber/yellow/green counts. Click through to full list.

### Early Warning List (`/[locale]/(school)/early-warnings`)
Table sorted by composite_score DESC. Columns: student name, score, tier badge, top signal, 30-day sparkline, assigned to. Filters: tier, year group, class. Mobile: card layout with score + tier badge + top signal.

### Student Detail Panel
Slide-over or expandable row. 5-domain radar/bar chart. NL summary text. 30-day trend line chart. Tier transition timeline. Quick actions: assign, acknowledge, create intervention (links to pastoral module).

### Cohort Heatmap (`/[locale]/(school)/early-warnings/cohort`)
Dimensional pivot. Rows: year groups or classes. Columns: signal domains or time periods. Cells: average score, colour-coded green→red. Click cell to drill into student list. Subject-level breakdown available.

### Settings (`/[locale]/(school)/early-warnings/settings`)
Admin only. Weight sliders (must sum to 100). Threshold inputs. Hysteresis buffer. Routing rules. Digest day and recipients. High-severity event toggles.

---

## Permissions

| Permission | Tier | Description |
|-----------|------|-------------|
| `early_warning.view` | staff | View risk profiles. Scoped: teacher→their classes, year head→year group, principal→all |
| `early_warning.manage` | admin | Edit config, weights, routing rules |
| `early_warning.acknowledge` | staff | Mark profiles as reviewed |
| `early_warning.assign` | admin | Assign staff to risk profiles |

Module guard: `@ModuleEnabled('early_warning')`.

---

## Module Structure

```
apps/api/src/modules/early-warning/
├── dto/
│   ├── early-warning-config.dto.ts
│   ├── early-warning-query.dto.ts
│   ├── cohort-query.dto.ts
│   └── assign-student.dto.ts
├── collectors/
│   ├── attendance-signal.collector.ts
│   ├── grades-signal.collector.ts
│   ├── behaviour-signal.collector.ts
│   ├── wellbeing-signal.collector.ts
│   └── engagement-signal.collector.ts
├── engine/
│   ├── scoring.engine.ts
│   ├── hysteresis.evaluator.ts
│   ├── summary.builder.ts
│   └── types.ts                        # SignalResult, DetectedSignal, RiskAssessment
├── early-warning.controller.ts
├── early-warning.controller.spec.ts
├── early-warning.service.ts
├── early-warning.service.spec.ts
├── early-warning-config.service.ts
├── early-warning-routing.service.ts
├── early-warning-cohort.service.ts
├── early-warning.module.ts
└── early-warning.constants.ts

apps/worker/src/processors/early-warning/
├── early-warning-compute.processor.ts
├── early-warning-compute-student.processor.ts
└── early-warning-digest.processor.ts

packages/shared/src/early-warning/
├── schemas.ts                          # Zod schemas for config, query, etc.
├── types.ts                            # Shared types
└── constants.ts                        # Signal types, tier values, defaults
```

---

## Danger Zone Awareness

| DZ | Risk | Mitigation |
|----|------|-----------|
| DZ-02 | Collectors do Prisma-direct cross-module reads | Each collector is isolated — schema change in one domain only breaks its collector |
| DZ-05 | Config JSONB changes affect all tenants | All JSONB fields have `.default()` values in Zod schemas |
| DZ-14 | Parent send-gate could block high-severity notifications | Early warning notifications use `early_warning_tier_change` template, not behaviour pipeline |
| DZ-27 | survey_responses has no tenant_id | WellbeingSignalCollector explicitly excludes survey_responses |

---

## What This Does NOT Include (Deferred)

- **Historical validation / prediction accuracy tracking** — needs a full academic year of data
- **ML-based scoring** — rule-based is sufficient and more explainable
- **ETB cross-tenant aggregation** — scoring engine is portable; data access layer needs separate work
- **Real-time WebSocket dashboard updates** — polling or page refresh is sufficient for v1
- **Student/parent-facing risk view** — staff-only for now
