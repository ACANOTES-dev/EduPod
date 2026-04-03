# Phase F: Analytics + AI — Implementation Spec

> **Phase**: F of H
> **Prerequisite phases**: Phase A (incidents, participants, points data), Phase B (policy evaluations), Phase E (points computed, awards, house memberships)
> **Spec source**: behaviour-management-spec-v5-master.md
> **This document is self-contained. No need to open the master spec during implementation.**

---

## Prerequisites

The following must be in place before starting Phase F:

**From Phase A**:

- `behaviour_incidents` with `occurred_at`, `polarity`, `severity`, `status`, `follow_up_required`, `subject_id`, `reported_by_id`, `context_type`, `weekday`, `period_order`, `academic_year_id`
- `behaviour_incident_participants` with `points_awarded`, `student_id`, `student_snapshot`
- `behaviour_categories` with `benchmark_category` enum
- `behaviour_tasks` with `status`, `due_date`, `completed_at`
- `tenant_settings.behaviour` JSONB with AI and pulse settings

**From Phase B**:

- `behaviour_policy_evaluations` with `stage`, `evaluation_result`

**From Phase E**:

- `behaviour_recognition_awards` with `academic_year_id`, `awarded_at`
- Points computation service (`BehaviourPointsService`)
- `behaviour_house_memberships`

**Infrastructure**:

- Claude API client (`@anthropic-ai/sdk`) configured in worker/API
- OpenAI API client (`openai`) configured as fallback
- Redis client (for Pulse cache)
- Materialised view support in PostgreSQL migration pipeline
- `anonymiseForAI` utility slot in `packages/shared/` (to be implemented in this phase)

---

## Objectives

1. Implement the three materialised views: `mv_student_behaviour_summary`, `mv_behaviour_benchmarks`, `mv_behaviour_exposure_rates`
2. Implement the 5-dimension Behaviour Pulse with exposure-adjusted composite scoring
3. Implement exposure-adjusted analytics (all rates normalised by contact hours from scheduling)
4. Implement the AI feature suite: NL query, narrative summaries, quick-log parse — all with mandatory anonymisation pipeline, governance controls, and Claude/GPT fallback
5. Implement pattern detection with per-user alert ownership
6. Implement the ETB platform-level benchmarking panel architecture
7. Implement all 16 analytics endpoints
8. Implement the three analytics frontend pages

---

## Tables

### `behaviour_alerts`

Pattern detection results from the daily worker. One alert per pattern detection event.

| Column          | Type                                                                                                                                                   | Notes                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `id`            | UUID PK                                                                                                                                                | `gen_random_uuid()`                                                                       |
| `tenant_id`     | UUID FK NOT NULL                                                                                                                                       | RLS                                                                                       |
| `alert_type`    | ENUM('escalating_student', 'disengaging_student', 'hotspot', 'logging_gap', 'overdue_review', 'suspension_return', 'policy_threshold_breach') NOT NULL |                                                                                           |
| `severity`      | ENUM('info', 'warning', 'critical') NOT NULL                                                                                                           |                                                                                           |
| `student_id`    | UUID FK NULL                                                                                                                                           | -> `students`. Set for student-level alerts                                               |
| `subject_id`    | UUID FK NULL                                                                                                                                           | -> `subjects`. Set for hotspot alerts by subject                                          |
| `staff_id`      | UUID FK NULL                                                                                                                                           | -> `users`. Set for logging gap alerts                                                    |
| `title`         | VARCHAR(300) NOT NULL                                                                                                                                  | Human-readable summary                                                                    |
| `description`   | TEXT NOT NULL                                                                                                                                          | Detailed explanation with data evidence                                                   |
| `data_snapshot` | JSONB NOT NULL                                                                                                                                         | Supporting evidence at time of detection. Never updated after creation.                   |
| `status`        | ENUM('active', 'resolved') NOT NULL DEFAULT 'active'                                                                                                   | Aggregate status: transitions to 'resolved' when the last recipient resolves or dismisses |
| `resolved_at`   | TIMESTAMPTZ NULL                                                                                                                                       |                                                                                           |
| `created_at`    | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                                                                     |                                                                                           |
| `updated_at`    | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                                                                     |                                                                                           |

**Partition strategy**: Yearly range on `created_at`. Same pattern as `audit_logs`. Low volume (< 500/year per school) does not need monthly partitioning.

**Indexes**:

- `(tenant_id, status, created_at DESC)` — active alerts list
- `(tenant_id, alert_type, status)` — filter by type
- `(tenant_id, student_id) WHERE student_id IS NOT NULL` — student profile alert badge

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

### `behaviour_alert_recipients`

Per-user alert state. Each alert can have multiple recipients (e.g. year head + deputy + pastoral lead). Each recipient tracks their own acknowledgement state independently.

| Column             | Type                                                                                                 | Notes                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`               | UUID PK                                                                                              | `gen_random_uuid()`                                                                   |
| `tenant_id`        | UUID FK NOT NULL                                                                                     | RLS                                                                                   |
| `alert_id`         | UUID FK NOT NULL                                                                                     | -> `behaviour_alerts`                                                                 |
| `recipient_id`     | UUID FK NOT NULL                                                                                     | -> `users`                                                                            |
| `recipient_role`   | VARCHAR(50) NULL                                                                                     | The role that qualified them to receive this alert (e.g. `'year_head'`, `'pastoral'`) |
| `status`           | ENUM('unseen', 'seen', 'acknowledged', 'snoozed', 'resolved', 'dismissed') NOT NULL DEFAULT 'unseen' |                                                                                       |
| `seen_at`          | TIMESTAMPTZ NULL                                                                                     |                                                                                       |
| `acknowledged_at`  | TIMESTAMPTZ NULL                                                                                     |                                                                                       |
| `snoozed_until`    | TIMESTAMPTZ NULL                                                                                     |                                                                                       |
| `resolved_at`      | TIMESTAMPTZ NULL                                                                                     |                                                                                       |
| `dismissed_at`     | TIMESTAMPTZ NULL                                                                                     |                                                                                       |
| `dismissed_reason` | TEXT NULL                                                                                            | Optional reason when dismissing                                                       |
| `created_at`       | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                   |                                                                                       |
| `updated_at`       | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                   |                                                                                       |

**UNIQUE**: `(alert_id, recipient_id)` — one recipient row per alert per user.

**Partition strategy**: Yearly range on `created_at`.

**Index**: `(tenant_id, recipient_id, status) WHERE status IN ('unseen', 'seen', 'acknowledged', 'snoozed')` — "my active alerts" badge count.

**Auto-resolve parent alert**: After every `behaviour_alert_recipients` update, check if all recipients for this alert are now in `resolved` or `dismissed` status. If yes, transition `behaviour_alerts.status` to `'resolved'` and set `resolved_at = now()`.

**RLS policy**: `tenant_id = current_setting('app.current_tenant_id')::uuid`

---

## Materialised Views

Materialised views are defined in raw SQL migrations (Prisma cannot natively declare them). Each view has a corresponding refresh strategy and index.

### `mv_student_behaviour_summary`

**Purpose**: Fast STAFF-class aggregates per student. Feeds student list views, profile headers, and dashboard widgets. Avoids repeated expensive aggregations.

**Refresh strategy**: Every 15 minutes using `REFRESH MATERIALIZED VIEW CONCURRENTLY`. BullMQ job `behaviour:refresh-mv-student-summary` runs on a cron schedule (`*/15 * * * *`). Uses CONCURRENTLY to avoid read locks — requires a unique index on the view.

**SQL definition**:

```sql
CREATE MATERIALIZED VIEW mv_student_behaviour_summary AS
SELECT
  bi_p.tenant_id,
  bi_p.student_id,
  bi.academic_year_id,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'positive'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS positive_count,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'negative'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS negative_count,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'neutral'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS neutral_count,
  COALESCE(SUM(bi_p.points_awarded) FILTER (
    WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ), 0) AS total_points,
  ROUND(
    CASE WHEN COUNT(*) FILTER (WHERE bi.polarity IN ('positive','negative') AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding') AND bi.retention_status = 'active') > 0
    THEN COUNT(*) FILTER (WHERE bi.polarity = 'positive' AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding') AND bi.retention_status = 'active')::numeric
       / COUNT(*) FILTER (WHERE bi.polarity IN ('positive','negative') AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding') AND bi.retention_status = 'active')::numeric
    ELSE NULL
    END, 4
  ) AS positive_ratio,
  MAX(bi.occurred_at) FILTER (
    WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS last_incident_at,
  now() AS computed_at
FROM behaviour_incident_participants bi_p
JOIN behaviour_incidents bi ON bi.id = bi_p.incident_id
  AND bi.tenant_id = bi_p.tenant_id
WHERE bi_p.participant_type = 'student'
  AND bi_p.student_id IS NOT NULL
GROUP BY bi_p.tenant_id, bi_p.student_id, bi.academic_year_id
WITH DATA;

-- Required unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX uq_mv_student_behaviour_summary
  ON mv_student_behaviour_summary (tenant_id, student_id, academic_year_id);

-- Query index
CREATE INDEX idx_mv_student_behaviour_summary_tenant_year
  ON mv_student_behaviour_summary (tenant_id, academic_year_id);
```

**Data classification**: STAFF-class. Safe to include in scope-filtered API responses. Never exposes `context_notes`, `description`, or participant details.

---

### `mv_behaviour_benchmarks`

**Purpose**: PUBLIC-class aggregates used by the platform-level ETB panel. Contains only canonical category counts and rates — no student names, no incident details, no staff data. The ETB panel reads this view via a platform-level service with cross-tenant read access to materialised views only.

**Refresh strategy**: Nightly at 03:00 UTC. BullMQ job `behaviour:refresh-mv-benchmarks` on cron `0 3 * * *`. Uses CONCURRENTLY.

**Cohort minimum suppression**: Rows where the student count for that year_group in that academic period is below `tenant_settings.behaviour.benchmark_min_cohort_size` (default 10) are excluded from the materialised view. Prevents de-anonymisation of small cohorts.

**SQL definition**:

```sql
CREATE MATERIALIZED VIEW mv_behaviour_benchmarks AS
SELECT
  bi.tenant_id,
  bi.academic_year_id,
  bi.academic_period_id,
  bc.benchmark_category,
  COUNT(DISTINCT bi_p.student_id) AS student_count,
  COUNT(DISTINCT bi.id) AS incident_count,
  -- Rate per 100 students. Requires joining to student enrollment count per year/period.
  ROUND(
    COUNT(DISTINCT bi.id)::numeric
      / NULLIF(COUNT(DISTINCT bi_p.student_id), 0)
      * 100, 2
  ) AS rate_per_100,
  now() AS computed_at
FROM behaviour_incidents bi
JOIN behaviour_categories bc ON bc.id = bi.category_id AND bc.tenant_id = bi.tenant_id
JOIN behaviour_incident_participants bi_p
  ON bi_p.incident_id = bi.id AND bi_p.tenant_id = bi.tenant_id
WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
  AND bi.retention_status = 'active'
  AND bi_p.participant_type = 'student'
GROUP BY bi.tenant_id, bi.academic_year_id, bi.academic_period_id, bc.benchmark_category
HAVING COUNT(DISTINCT bi_p.student_id) >= (
  -- Inline minimum cohort size from tenant settings
  -- Implementation note: use a function or join to tenant_settings JSONB
  SELECT (ts.settings->'behaviour'->>'benchmark_min_cohort_size')::int
  FROM tenant_settings ts WHERE ts.tenant_id = bi.tenant_id
)
WITH DATA;

CREATE UNIQUE INDEX uq_mv_behaviour_benchmarks
  ON mv_behaviour_benchmarks (tenant_id, academic_year_id, academic_period_id, benchmark_category);

CREATE INDEX idx_mv_behaviour_benchmarks_tenant
  ON mv_behaviour_benchmarks (tenant_id);
```

**Data classification**: PUBLIC-equivalent. No PII. Only aggregated counts and rates keyed by canonical taxonomy.

**ETB panel access**: The platform-level ETB panel service connects with a dedicated database role (`etb_panel_role`) that has `SELECT` privileges on `mv_behaviour_benchmarks` only — no access to any other table or view in the behaviour schema. The platform service queries with `WHERE tenant_id IN (etb_entity.managed_tenant_ids)`.

---

### `mv_behaviour_exposure_rates`

**Purpose**: Per-subject, per-teacher, and per-period teaching hours derived from the scheduling module. Used for exposure-adjusted analytics — normalising incident rates by contact hours rather than raw counts. Stored as snapshots per academic period so historical analytics use the correct exposure data.

**Refresh strategy**: Nightly at 02:00 UTC. BullMQ job `behaviour:refresh-mv-exposure-rates` on cron `0 2 * * *`. Uses CONCURRENTLY.

**Key design constraint**: Analytics must join exposure data to incidents using the period snapshot that was active at `bi.occurred_at`, not current data. A student or teacher reassignment mid-year should not retroactively change historical incident rates.

**SQL definition (simplified — actual implementation queries scheduling module tables)**:

```sql
CREATE MATERIALIZED VIEW mv_behaviour_exposure_rates AS
SELECT
  t.tenant_id,
  t.academic_year_id,
  t.academic_period_id,
  t.effective_from,       -- Start of this academic period
  t.effective_until,      -- End of this academic period (NULL = current)
  t.subject_id,
  t.staff_id,             -- Teacher
  t.year_group_id,
  t.context_type,         -- 'class' etc.
  t.total_teaching_periods, -- Total scheduled periods in this period for this subject/teacher/year
  t.total_students,       -- Distinct students enrolled
  now() AS computed_at
FROM (
  -- Aggregated from schedule_entries, student_enrollments, and academic_periods
  -- One row per (tenant, academic_period, subject, staff, year_group)
  SELECT
    se.tenant_id,
    ap.academic_year_id,
    se.academic_period_id,
    ap.start_date AS effective_from,
    ap.end_date   AS effective_until,
    se.subject_id,
    se.staff_id,
    se.year_group_id,
    'class'::text AS context_type,
    COUNT(DISTINCT se.id) AS total_teaching_periods,
    COUNT(DISTINCT sse.student_id) AS total_students
  FROM schedule_entries se
  JOIN academic_periods ap ON ap.id = se.academic_period_id
  LEFT JOIN student_schedule_enrollments sse ON sse.schedule_entry_id = se.id
  WHERE se.status = 'active'
  GROUP BY se.tenant_id, ap.academic_year_id, se.academic_period_id,
           ap.start_date, ap.end_date, se.subject_id, se.staff_id, se.year_group_id
) t
WITH DATA;

CREATE UNIQUE INDEX uq_mv_behaviour_exposure_rates
  ON mv_behaviour_exposure_rates (tenant_id, academic_period_id, subject_id, staff_id, year_group_id);

CREATE INDEX idx_mv_behaviour_exposure_rates_tenant_period
  ON mv_behaviour_exposure_rates (tenant_id, academic_period_id);
```

**How analytics use this view**: When computing "incidents per 100 teaching periods" for subject X in period P:

```sql
SELECT
  COUNT(bi.id)::numeric
    / NULLIF(er.total_teaching_periods, 0)
    * 100 AS rate_per_100_periods
FROM behaviour_incidents bi
JOIN mv_behaviour_exposure_rates er
  ON er.tenant_id = bi.tenant_id
  AND er.subject_id = bi.subject_id
  AND bi.occurred_at >= er.effective_from
  AND (er.effective_until IS NULL OR bi.occurred_at <= er.effective_until)
WHERE bi.tenant_id = $tenantId
  AND bi.academic_year_id = $yearId
  AND bi.subject_id = $subjectId
  AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
```

---

## Business Logic

### Behaviour Pulse — 5-Dimension Scoring

The Behaviour Pulse is a school-wide health snapshot. It is not a score for individual students — it reflects the overall behaviour climate of the school at a point in time. It is displayed on the main `/behaviour` dashboard.

**Calculation window**: Rolling 7 days from the current date (all five dimensions use the same window unless noted).

**All five dimensions**:

#### Dimension 1: Positive Ratio (weight: 20%)

```
positive_ratio = COUNT(incidents WHERE polarity='positive') /
                 COUNT(incidents WHERE polarity IN ('positive','negative'))

over the rolling 7-day window, for all non-withdrawn incidents.

If total positive+negative incidents = 0: dimension_score = null (insufficient data)
```

**Normalisation to 0–1 score**: `dimension_score = positive_ratio` (already 0–1)

---

#### Dimension 2: Severity Index (weight: 25%)

```
severity_index = weighted average severity of negative incidents in last 7 days

weighted_avg_severity =
  SUM(incident.severity * 1) / COUNT(negative incidents)

where severity is 1–10. Normalised and inverted so that lower severity = higher score.

dimension_score = 1 - ((weighted_avg_severity - 1) / 9)
  -- maps severity 1 -> score 1.0 (best), severity 10 -> score 0.0 (worst)

If no negative incidents in window: dimension_score = 1.0 (no negatives = best possible)
```

---

#### Dimension 3: Serious Incident Count (weight: 25%)

```
serious_incidents = COUNT(incidents WHERE severity >= 7 AND polarity = 'negative')
                    in last 7 days, per 100 students enrolled

rate = (serious_incidents / total_enrolled_students) * 100

dimension_score:
  rate = 0         -> 1.0
  rate <= 0.5      -> linear scale from 1.0 to 0.8
  rate <= 2.0      -> linear scale from 0.8 to 0.4
  rate <= 5.0      -> linear scale from 0.4 to 0.1
  rate > 5.0       -> 0.0

(Graduated decay. Schools with 0 serious incidents per 100 students score 1.0.)
```

**Total enrolled students**: Count of students with `status = 'enrolled'` (from students table). Cached for 1 hour.

---

#### Dimension 4: Resolution Rate (weight: 15%)

```
resolution_rate = follow_ups_completed / follow_ups_required

over the rolling 30-day window (not 7 days — longer window for operational completeness).

follow_ups_required = COUNT(incidents WHERE follow_up_required = true
                            AND occurred_at >= 30 days ago
                            AND status NOT IN ('withdrawn'))

follow_ups_completed = COUNT(above WHERE status = 'resolved'
                             OR EXISTS(behaviour_tasks WHERE entity_id = incident.id
                                       AND task_type = 'follow_up'
                                       AND status = 'completed'))

dimension_score = resolution_rate (0–1)

If follow_ups_required = 0: dimension_score = 1.0 (nothing outstanding = full score)
```

---

#### Dimension 5: Reporting Confidence (weight: 15%)

```
reporting_confidence =
  COUNT(DISTINCT reported_by_id for incidents in last 7 days) /
  COUNT(DISTINCT staff_id for staff with behaviour.log permission AND active status)

dimension_score = reporting_confidence (0–1)

If total teaching staff = 0: dimension_score = null
```

**Important**: This dimension is ALSO the gate for the composite score. If `reporting_confidence < 0.50`, the composite score is **not displayed** — the dashboard shows each individual dimension as a standalone indicator with a notice: "Composite score requires at least 50% of teaching staff to have logged this week."

---

#### Composite Score

```
composite = (positive_ratio_score * 0.20)
           + (severity_index_score * 0.25)
           + (serious_incident_count_score * 0.25)
           + (resolution_rate_score * 0.15)
           + (reporting_confidence_score * 0.15)

Prerequisites:
  - reporting_confidence_score >= 0.50 (gate)
  - All dimension scores must be non-null (if any are null due to insufficient data,
    composite is null)

Result: 0.0 to 1.0. Displayed as a percentage or colour-coded gauge.
```

**Caching**: Pulse is computed on request and cached in Redis (`behaviour:pulse:{tenantId}`) with a 5-minute TTL. The `behaviour:detect-patterns` worker also force-refreshes the pulse cache after completing.

**Tenant setting gate**: Pulse only displayed if `tenant_settings.behaviour.behaviour_pulse_enabled = true`.

---

### Exposure-Adjusted Analytics

All rate-based analytics normalise by the exposure data from `mv_behaviour_exposure_rates`. Raw counts are never presented without context. The following normalisation table applies:

| Analytics dimension | Normalisation denominator                             | Display format           |
| ------------------- | ----------------------------------------------------- | ------------------------ |
| Per subject         | Total teaching periods for that subject in the period | Per 100 teaching periods |
| Per teacher         | Total teaching periods for that teacher in the period | Per 100 teaching periods |
| Per year group      | Total enrolled students in that year group            | Per 100 students         |
| Per period/slot     | Total classes scheduled in that period slot           | Per 100 active classes   |
| Per context type    | Total scheduled hours in that context                 | Per 100 hours            |

**Temporal exposure snapshots**: Analytics join to the exposure snapshot that was active at `bi.occurred_at`:

```
JOIN mv_behaviour_exposure_rates er
  ON er.subject_id = bi.subject_id
  AND bi.occurred_at >= er.effective_from
  AND (er.effective_until IS NULL OR bi.occurred_at <= er.effective_until)
```

This ensures that a teacher who was reassigned mid-year doesn't distort historical data — the analytics use the scheduling reality at the time of the incident.

**Fallback when exposure data unavailable**: If `mv_behaviour_exposure_rates` has no data for the requested dimension (e.g. scheduling module not fully populated), the API returns raw counts with a `data_quality.exposure_normalised = false` flag in the response. The frontend renders a notice: "Rate normalisation unavailable — showing raw counts."

---

### AI Features

**MANDATORY**: Every AI feature in this codebase follows the anonymisation pipeline described below without exception. Any AI prompt that bypasses anonymisation is a data protection violation and must not be merged.

#### Anonymisation Pipeline

All AI-calling code uses the `anonymiseForAI` utility from `packages/shared/src/ai/anonymise.ts`. This utility must be implemented as part of Phase F.

**`anonymiseForAI` utility specification**:

```typescript
// packages/shared/src/ai/anonymise.ts

export type AnonymisationResult<T> = {
  anonymised: T;
  // In-memory mapping from token to real identity. Never log, never persist.
  // Lives only for the duration of the request.
  tokenMap: Map<string, string>;
};

export function anonymiseForAI<T extends object>(
  data: T,
  options: AnonymiseOptions,
): AnonymisationResult<T>;

type AnonymiseOptions = {
  replaceStudentNames: boolean; // Replace with "Student-A", "Student-B", etc.
  replaceStaffNames: boolean; // Replace with role title e.g. "Year Head", "Class Teacher"
  removeUUIDs: boolean; // Strip all UUID values
  removeContextNotes: boolean; // Always true — context_notes never goes to AI
  removeSendDetails: boolean; // Always true — SEND details never go to AI
  removeSafeguardingFlags: boolean; // Always true — safeguarding data never goes to AI
};
```

**What the utility does**:

1. Traverses the input object recursively
2. Every student name field: replaced with opaque sequential token (`Student-A`, `Student-B`, etc.)
3. Every staff name field: replaced with their role title
4. All UUID fields: stripped
5. `context_notes` field: removed entirely
6. Any field tagged as SENSITIVE or SAFEGUARDING data class: removed
7. `send_aware`, `send_notes`, SEND flags: removed
8. Builds a `tokenMap` mapping each token back to the real identity (in memory only)
9. Returns the anonymised copy and the tokenMap

**De-anonymisation**: After receiving the AI response, call `deAnonymiseFromAI(response, tokenMap)` to replace tokens with display names for the user.

**Mapping table lifetime**: The `tokenMap` object is created per-request, used for de-anonymisation, and then garbage collected. It is **never** written to any database, cache, log file, or external service.

**Logging (when `ai_audit_logging = true`)**:

- Log to `audit_logs` with `context = 'ai_behaviour'`
- Log entry contains: the **anonymised** prompt (never the original), model used, response time, tenant_id, user_id, feature (e.g. 'nl_query', 'narrative', 'quick_log_parse')
- Never log the tokenMap

#### Providers and Fallback

```typescript
async function callAI(prompt: string, timeout: number): Promise<string> {
  try {
    const result = await Promise.race([
      claudeClient.messages.create({ model: 'claude-sonnet-4-5', ... }),
      rejectAfter(timeout),
    ]);
    return result.content[0].text;
  } catch (error) {
    if (isTimeoutOrUnavailable(error)) {
      // Fallback to OpenAI GPT
      const fallback = await openaiClient.chat.completions.create({ model: 'gpt-4o', ... });
      return fallback.choices[0].message.content;
    }
    throw error;
  }
}
```

**Timeouts**:

- Quick-log NL parse: 2 seconds total (AI call + overhead)
- Narrative summaries: 10 seconds
- NL analytics queries: 15 seconds

**Below confidence threshold**: If the AI returns a confidence score below `tenant_settings.behaviour.ai_confidence_threshold` (default 0.85) for any field, that field is highlighted in the UI for manual review/confirmation.

#### Blocked Language

The system prompt for all AI calls includes:

```
You are a school behaviour analytics assistant. You must:
- Describe behavioural patterns only. Never diagnose.
- Never infer family circumstances, mental health conditions, or medical diagnoses.
- Never use clinical terminology (e.g. ADHD, autism, anxiety disorder, ODD).
- Do not reference SEND status even if you infer it from patterns.
- Refer to students only by their assigned token (Student-A, etc.).
- Refer to staff only by role title.
- Express uncertainty clearly — do not state patterns as definitive causes.
- All insights are for professional discussion only and must be verified by staff.
```

**Tenant setting gate**: `ai_insights_enabled`, `ai_narrative_enabled`, `ai_nl_query_enabled` are independently toggleable. If the feature is disabled, the endpoint returns `403 Forbidden` with `{ error: { code: 'AI_FEATURE_DISABLED' } }`.

#### Human Confirmation Labels

Every AI-generated output shown to the user carries a label:

- Quick-log parse: "AI-suggested — please confirm before submitting"
- Narrative summary: "AI-generated — verify before sharing"
- NL query result: "Data as of [timestamp]. AI-interpreted — verify critical findings."

---

### Pattern Detection (behaviour:detect-patterns)

**Trigger**: Cron, daily at 05:00 in each tenant's configured timezone.
**Queue**: `behaviour`
**Payload**: `{ tenantId: string }`

The worker detects the following alert types:

| alert_type                | Detection logic                                                                                                                             | Severity   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `escalating_student`      | Student with 3+ negative incidents in last 7 days AND the trend is increasing vs the prior 7 days                                           | `warning`  |
| `disengaging_student`     | Student had positive incidents in prior month but zero in last 7 days AND at least 2 negative incidents                                     | `info`     |
| `hotspot`                 | A subject or teacher has an incident rate > 2x the school average per 100 teaching periods (exposure-adjusted)                              | `warning`  |
| `logging_gap`             | A teacher with `behaviour.log` permission has not logged any behaviour in the last 14 school days (implies disengagement, not no incidents) | `info`     |
| `overdue_review`          | An active intervention has `next_review_date` that is more than 3 school days overdue                                                       | `warning`  |
| `suspension_return`       | A student is returning from suspension in the next 3 school days with no return check-in task                                               | `warning`  |
| `policy_threshold_breach` | A student has reached a policy-defined threshold (e.g. 3 verbal warnings in 30 days) but the consequent policy rule has not yet fired       | `critical` |

**Deduplication**: Before creating a new alert, check if an active alert of the same `alert_type` for the same `student_id`/`subject_id`/`staff_id` already exists. If yes, update the `data_snapshot` of the existing alert rather than creating a duplicate.

**Recipients**: Determined by alert_type and scope:

- `escalating_student`, `disengaging_student`: year head for the student's year group + pastoral lead
- `hotspot`: subject head or HOD (if applicable) + deputy principal
- `logging_gap`: the individual teacher + their line manager
- `overdue_review`: the staff member assigned to the intervention + their line manager
- `suspension_return`: the intervention lead + pastoral lead
- `policy_threshold_breach`: year head + deputy principal

**Alert lifecycle**: `status = 'active'` until the last `behaviour_alert_recipients` row for this alert transitions to `resolved` or `dismissed`. At that point, `behaviour_alerts.status = 'resolved'` and `resolved_at = now()`.

**Snooze**: A recipient can snooze an alert (`snoozed_until` date). While snoozed, the alert does not appear in their active alert list. On the next day's `behaviour:detect-patterns` run, if the condition still exists, the alert stays but the snooze is respected until its date.

---

### ETB Benchmarking — Platform-Level Panel Architecture

ETB benchmarking is a **platform-level feature** — it is not tenant-scoped and does not appear in tenant settings beyond the opt-in toggle.

#### Architecture (5 points)

**Point 1: ETB entity and authentication**

The ETB panel is a separate platform-tier interface alongside the existing platform admin. ETB users authenticate with platform-level credentials. They are assigned to an `etb_entity` record (in the platform schema, not any tenant schema) which owns a list of `tenant_id` values (the schools in its network).

```
Platform schema:
  etb_entities: { id, name, managed_tenant_ids UUID[], created_at }
  etb_users: { id, etb_entity_id, user_id, role }
```

ETB users cannot log into any tenant's admin panel. Their access is exclusively through the ETB panel interface.

**Point 2: Data pull from mv_behaviour_benchmarks**

The platform-level ETB service has a dedicated database role (`etb_panel_role`) with `SELECT` privilege on `mv_behaviour_benchmarks` only. No other table or view in the behaviour schema is accessible via this role.

```typescript
// ETB service queries using dedicated read-only role connection
const data = await etbPrismaClient.mv_behaviour_benchmarks.findMany({
  where: {
    tenant_id: { in: etbEntity.managed_tenant_ids },
    // Opt-in filter: only include tenants where benchmarking is enabled
    // (checked against cached tenant settings, not the DB)
  },
});
```

**Point 3: Aggregation in the ETB panel**

The ETB panel service aggregates across its network:

- Per-school summaries: incident rates by canonical category, per academic period
- Network-wide trends: rolling averages across all opted-in schools
- School-to-school comparison: anonymised by default (School-A, School-B); named only if the school has `cross_school_benchmarking_enabled = true` AND opts into named comparison

Aggregations happen in the platform service, not in tenant schema queries.

**Point 4: No student-level data crosses the tenant boundary**

The `mv_behaviour_benchmarks` view contains only:

- `tenant_id` (so the platform service can group by school)
- `academic_year_id`, `academic_period_id` (time dimension)
- `benchmark_category` (canonical taxonomy, not tenant-specific category names)
- `student_count`, `incident_count`, `rate_per_100` (aggregated numbers)

Individual student names, incident descriptions, staff names, attachments, or any other PII are not accessible to the ETB panel by architectural constraint — the data does not exist in `mv_behaviour_benchmarks`.

**Point 5: Opt-in and cohort minimum**

A school participates only if:

1. `tenant_settings.behaviour.cross_school_benchmarking_enabled = true`
2. Each data point has `student_count >= benchmark_min_cohort_size` (default 10)

Both conditions are enforced in the `mv_behaviour_benchmarks` view definition (the `HAVING` clause). Schools that haven't opted in do not appear in the ETB panel even if the platform queries for them.

#### Canonical Taxonomy Mapping

Every tenant category maps to one of these fixed canonical values (defined in `behaviour_categories.benchmark_category`):

| benchmark_category    | Meaning                                  |
| --------------------- | ---------------------------------------- |
| `praise`              | Informal positive recognition            |
| `merit`               | Formal merit/commendation                |
| `minor_positive`      | Minor positive behaviour                 |
| `major_positive`      | Major positive recognition / achievement |
| `verbal_warning`      | Verbal warning                           |
| `written_warning`     | Written/formal warning                   |
| `detention`           | Detention                                |
| `internal_suspension` | Suspension within school                 |
| `external_suspension` | Suspension from school premises          |
| `expulsion`           | Permanent exclusion/expulsion            |
| `note`                | General note to file                     |
| `observation`         | Observation (no consequence)             |
| `other`               | Any category not mapping above           |

This mapping is set on `behaviour_categories` at tenant provisioning and can be edited by the tenant admin. The ETB panel always sees the canonical category, never the tenant's custom category name.

---

## API Endpoints

### Analytics & Pulse (behaviour-analytics.controller.ts) — 16 endpoints

| Method | Route                                         | Description                                                              | Permission                                                      |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| GET    | `v1/behaviour/analytics/pulse`                | 5-dimension Behaviour Pulse with composite (gated on confidence >= 50%)  | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/heatmap`              | Exposure-adjusted incident heatmap (by weekday + period)                 | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/overview`             | School-wide overview: counts, ratios, trends (current period vs prior)   | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/trends`               | Incident count trend over time (line chart, configurable period)         | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/categories`           | Breakdown by category: count, rate, trend                                | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/heatmap/historical`   | Full historical heatmap with exposure normalisation                      | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/subjects`             | Per-subject incident rates (exposure-adjusted, per 100 teaching periods) | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/staff`                | Staff logging activity: incidents logged per staff, categories, scope    | `behaviour.view_staff_analytics`                                |
| GET    | `v1/behaviour/analytics/sanctions`            | Sanction summary: by type, served/no-show, trends                        | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/interventions`        | Intervention outcomes: improved/no_change/deteriorated, by type + SEND   | `behaviour.manage`                                              |
| GET    | `v1/behaviour/analytics/ratio`                | Positive/negative ratio by year group, class, period                     | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/comparisons`          | Year group comparison + cohort benchmarks (exposure-adjusted)            | `behaviour.view`                                                |
| GET    | `v1/behaviour/analytics/policy-effectiveness` | Policy rule match rates, action fire rates, false positive estimates     | `behaviour.admin`                                               |
| GET    | `v1/behaviour/analytics/task-completion`      | Task completion rates by type, assigned staff, overdue age               | `behaviour.manage`                                              |
| POST   | `v1/behaviour/analytics/ai-query`             | Natural language analytics query (anonymised, Claude/GPT)                | `behaviour.view` + `behaviour.ai_query` + `ai_nl_query_enabled` |
| GET    | `v1/behaviour/analytics/ai-query/history`     | History of NL queries run by current user                                | `behaviour.view` + `behaviour.ai_query`                         |

#### Query Parameters (common across analytics endpoints)

All analytics endpoints accept:

| Parameter            | Type     | Default      | Description                             |
| -------------------- | -------- | ------------ | --------------------------------------- |
| `academicYearId`     | UUID     | current year | Scope to academic year                  |
| `academicPeriodId`   | UUID     | null         | Scope to academic period                |
| `from`               | ISO date | 30 days ago  | Start of custom date range              |
| `to`                 | ISO date | today        | End of custom date range                |
| `yearGroupId`        | UUID     | null         | Filter to year group                    |
| `classId`            | UUID     | null         | Filter to class                         |
| `polarity`           | string   | null         | 'positive', 'negative', 'neutral'       |
| `categoryId`         | UUID     | null         | Filter to category                      |
| `exposureNormalised` | boolean  | true         | Whether to apply exposure normalisation |

Scope enforcement applies: a class-scope user can only query students in their classes, etc.

#### `POST v1/behaviour/analytics/ai-query` — NL Query

**Request body**:

```typescript
{
  query: string; // Max 500 characters
  context?: {
    yearGroupId?: string;
    studentId?: string; // Requires pastoral/all scope
    fromDate?: string;
    toDate?: string;
  };
}
```

**Processing pipeline**:

1. Validate user has `behaviour.ai_query` permission and `ai_nl_query_enabled = true`
2. Determine scope of data the user can access (apply scope rules)
3. Translate NL query to a structured analytics query (pattern matching + AI)
4. Fetch relevant data from the database (scoped to user's access)
5. Anonymise data using `anonymiseForAI` (all student names -> tokens, staff -> roles, remove UUIDs, context_notes, SEND details, safeguarding flags)
6. Call Claude (2-15s timeout) with anonymised data + query + blocked language system prompt
7. De-anonymise response using tokenMap
8. Return result with `data_as_of` timestamp and `ai_generated: true` label
9. Log anonymised prompt + response to `audit_logs` (if `ai_audit_logging = true`)

**Response shape**:

```typescript
{
  result: string;            // AI-generated narrative
  data_as_of: string;        // ISO timestamp
  ai_generated: true;
  scope_applied: string;     // What data scope was used
  confidence: number | null; // 0–1 if available
  structured_data?: object;  // If AI returned structured supporting data
}
```

**Data classification enforcement**: The NL query can only return STAFF-class data. Fields at SENSITIVE classification (context_notes, meeting_notes, SEND notes) are stripped before data is sent to AI and are not surfaced in responses, even for users with `behaviour.view_sensitive`. Safeguarding data is never accessible through AI queries regardless of permissions.

---

## Frontend Pages

### `/behaviour/analytics`

**Purpose**: Full analytics dashboard with exposure-adjusted data. The primary data-driven view for management, year heads, and pastoral leads.

**Layout**: Sticky filter bar at top (academic year/period, date range, year group/class, polarity, exposure normalisation toggle). Dashboard sections below.

**Section 1 — Pulse Widget** (if `behaviour_pulse_enabled`):

- 5 dimension gauges (Positive Ratio, Severity Index, Serious Incidents, Resolution Rate, Reporting Confidence)
- Each gauge: colour-coded (green/amber/red), current value, dimension label
- Composite score displayed below gauges (only if Reporting Confidence >= 50%)
- If composite unavailable: notice explaining why
- Refresh timestamp

**Section 2 — Overview Cards**:

- Total incidents this period vs prior period (delta arrow)
- Positive/negative ratio (with trend)
- Open follow-ups overdue
- Active alerts (count, link to alerts page)

**Section 3 — Trend Chart**:

- Line chart: positive incidents vs negative incidents over time
- Granularity: daily (< 30 days), weekly (30–90 days), monthly (> 90 days)
- Optional overlay: academic period boundaries

**Section 4 — Heatmap**:

- X: day of week (Mon–Fri). Y: period slot (Period 1–8 or custom labels)
- Cell value: incidents per 100 active classes (exposure-adjusted, falls back to raw count)
- Colour scale: green -> amber -> red
- Toggle: polarity filter (All / Positive / Negative)
- Click cell: drill-down list of incidents in that slot

**Section 5 — Category Breakdown**:

- Horizontal bar chart: top categories by incident count
- Each bar shows raw count + rate per 100 students
- Click category: filter dashboard to that category

**Section 6 — Subject Analysis** (exposure-adjusted):

- Table: subject, incident count, rate per 100 teaching periods, trend
- Only subjects with > 0 incidents shown
- Click subject: drill-down filtered to that subject

**Section 7 — Year Group Comparison**:

- Bar chart: incident rate per 100 students by year group
- Positive and negative bars side by side

**Section 8 — Staff Logging Activity** (only with `behaviour.view_staff_analytics`):

- Table: staff member, incidents logged last 7 days, last 30 days, total this year
- Highlight staff who have not logged in the last 14 school days

**Mobile layout**: All sections stack vertically. Charts use horizontal scroll at mobile widths. Heatmap collapses to a compact grid at < 480px.

---

### `/behaviour/analytics/ai`

**Purpose**: Natural language behaviour analytics queries. Staff describe what they want to know in plain English or Arabic; the system queries the data and returns a narrative.

**Layout**: Chat-like interface — query input at top, results below.

**Query input**:

- Textarea (500 char limit), RTL-aware (auto-detects Arabic input)
- Suggested queries (chips): "Which subjects have the most negative incidents this term?", "Show me students with improving behaviour in Year 9", "How many detentions were served last month?"
- Context pickers (optional, collapsible): year group, student (if scope permits), date range
- Submit button (disabled while processing)

**Result display**:

- AI narrative paragraph(s)
- Supporting data table or chart (if structured data returned)
- "AI-generated — verify critical findings" label
- "Data as of [timestamp]" label
- Confidence indicator (if below threshold: "Low confidence — verify manually" warning)
- Copy to clipboard button

**Query history**:

- Collapsible panel on the right (desktop) / bottom sheet (mobile)
- Last 10 queries this session + last 20 across sessions
- Timestamp, query text, one-line result summary
- Click to restore context and result

**Fallback states**:

- AI unavailable (timeout or both providers down): "AI is temporarily unavailable. Please use the standard analytics dashboard."
- Feature disabled: "AI queries are not enabled for your school. Contact your administrator."
- No data in scope: "Insufficient data to answer this query."

---

### `/behaviour/alerts`

**Purpose**: Pattern alerts with per-user state management. Each user sees their own view of active alerts.

**Layout**: Alert list with filter tabs.

**Tabs**: All | Unseen | Acknowledged | Snoozed | Resolved

**Each alert card**:

- Severity badge (Info / Warning / Critical)
- Alert type label
- Title and description
- Supporting data preview (expandable)
- Student/subject/staff tag (if applicable)
- Created date
- My status (Unseen/Seen/Acknowledged/Snoozed until [date]/Resolved/Dismissed)
- Actions: Acknowledge | Snooze (date picker) | Resolve | Dismiss (with optional reason)

**Acknowledge**: Sets `status = 'acknowledged'`, `acknowledged_at = now()`. Alert remains in active list.

**Snooze**: Prompts for snooze date (tomorrow / end of week / custom). Sets `status = 'snoozed'`, `snoozed_until`. Alert disappears from active view until that date.

**Resolve**: Sets `status = 'resolved'`. If all recipients are now resolved/dismissed, the parent alert auto-resolves.

**Dismiss**: Sets `status = 'dismissed'`. Prompts for optional reason. Dismissed alerts visible in "Resolved" tab.

**Badge**: Unseen alert count shown in the left navigation as a red badge on the "Alerts" link. Computed from `behaviour_alert_recipients` where `recipient_id = currentUser.id AND status IN ('unseen', 'seen')`.

**Mobile**: Cards display in full-width stack. Actions collapse to a "..." menu.

---

## Worker Jobs

### `behaviour:detect-patterns`

**Queue**: `behaviour`
**Trigger**: Cron, daily at 05:00 in each tenant's configured timezone
**Payload**: `{ tenantId: string }`

**Full execution sequence**:

```
1. Load current tenant configuration (pulse settings, AI enabled, timezone)
2. Compute tenant local date from timezone
3. Run each detection algorithm (see Pattern Detection section above)
4. For each detected pattern:
   a. Check for existing active alert of same type + entity (student/subject/staff)
   b. If exists: update data_snapshot with latest evidence, keep existing recipients
   c. If new: INSERT behaviour_alerts, determine recipients, INSERT behaviour_alert_recipients (status='unseen')
5. For each new alert with severity = 'warning' or 'critical': send in-app notification to recipients
6. Force-refresh Pulse cache for this tenant (clear Redis key behaviour:pulse:{tenantId})
7. Log job completion with counts: detected, created, updated, recipients_notified
```

**Idempotency**: If the cron fires twice in quick succession (e.g. deployment restart), the dedup logic (step 4b) prevents duplicate alerts. The job is safe to re-run.

---

### Materialised View Refresh Jobs (3 jobs)

These jobs are registered separately from the detection job.

| Job name                               | Cron           | Description                                            |
| -------------------------------------- | -------------- | ------------------------------------------------------ |
| `behaviour:refresh-mv-student-summary` | `*/15 * * * *` | Refresh `mv_student_behaviour_summary` for all tenants |
| `behaviour:refresh-mv-benchmarks`      | `0 3 * * *`    | Refresh `mv_behaviour_benchmarks` for all tenants      |
| `behaviour:refresh-mv-exposure-rates`  | `0 2 * * *`    | Refresh `mv_behaviour_exposure_rates` for all tenants  |

All use `REFRESH MATERIALIZED VIEW CONCURRENTLY` to avoid blocking reads. All jobs record last_refresh_at for the health endpoint.

---

## Acceptance Criteria

### Behaviour Pulse

- [ ] Pulse returns all 5 dimensions as separate values
- [ ] Composite score NOT displayed when reporting_confidence < 0.50
- [ ] Composite score IS displayed when reporting_confidence >= 0.50 and all dimensions non-null
- [ ] Positive Ratio = 1.0 when all incidents are positive
- [ ] Severity Index = 1.0 when there are no negative incidents in the last 7 days
- [ ] Serious Incident Count = 1.0 when rate = 0 serious incidents per 100 students
- [ ] Resolution Rate = 1.0 when follow_ups_required = 0
- [ ] Pulse hidden when `behaviour_pulse_enabled = false`
- [ ] Pulse served from Redis cache (5-min TTL) on repeat requests

### Exposure-Adjusted Analytics

- [ ] Subject incident rate is expressed per 100 teaching periods, not raw count
- [ ] Historical analytics use the exposure snapshot valid at `occurred_at` time
- [ ] `data_quality.exposure_normalised = false` flag returned when scheduling data unavailable
- [ ] Frontend shows notice when falling back to raw counts

### AI Features

- [ ] `anonymiseForAI` strips student names, replaces with Student-A/B/C tokens
- [ ] `anonymiseForAI` strips staff names, replaces with role titles
- [ ] `anonymiseForAI` removes all UUIDs from the data
- [ ] `anonymiseForAI` removes `context_notes`, SEND fields, safeguarding flags
- [ ] tokenMap is not logged, not persisted, not returned in API responses
- [ ] AI audit log entry contains anonymised prompt only (never raw data)
- [ ] Claude called first; OpenAI GPT called only if Claude times out or is unavailable
- [ ] Quick-log parse times out after 2s and falls back gracefully
- [ ] AI endpoints return 403 when feature is disabled in tenant settings
- [ ] All AI responses carry "AI-generated — verify" label in frontend
- [ ] Blocked language enforced in system prompt

### Pattern Detection

- [ ] `escalating_student` alert created when student has 3+ negatives in 7 days trending up
- [ ] Duplicate alert NOT created if active alert of same type + student already exists (data_snapshot updated instead)
- [ ] Alert auto-resolves when last recipient resolves or dismisses
- [ ] Snoozed alert reappears after snooze date passes
- [ ] In-app notification sent for warning/critical alerts

### ETB Benchmarking

- [ ] `mv_behaviour_benchmarks` excludes tenants with `cross_school_benchmarking_enabled = false`
- [ ] `mv_behaviour_benchmarks` excludes rows where student_count < benchmark_min_cohort_size
- [ ] ETB panel database role cannot query any table except `mv_behaviour_benchmarks`
- [ ] No student names, incident descriptions, or staff names appear in `mv_behaviour_benchmarks`
- [ ] ETB panel groups by `benchmark_category` (canonical), never tenant-specific category names

### Materialised Views

- [ ] `mv_student_behaviour_summary` excludes withdrawn and converted_to_safeguarding incidents
- [ ] `mv_student_behaviour_summary` refreshes every 15 minutes without blocking reads
- [ ] `mv_behaviour_exposure_rates` contains per-period snapshots with effective dates
- [ ] All three views use CONCURRENTLY refresh

---

## Test Requirements

All tests must follow the RLS leakage pattern from `architecture/testing.md`.

### Unit Tests

**Pulse Calculations**:

- `should compute positive_ratio as positive / (positive + negative)`
- `should return positive_ratio = null when zero positive+negative incidents`
- `should compute severity_index = 1.0 when no negative incidents`
- `should compute severity_index from weighted average severity, normalised and inverted`
- `should compute serious_incident_count score with graduated decay curve`
- `should compute resolution_rate = 1.0 when zero follow_ups_required`
- `should return composite = null when reporting_confidence < 0.50`
- `should return composite score when reporting_confidence >= 0.50`
- `should apply weights 20/25/25/15/15 to composite`

**anonymiseForAI utility**:

- `should replace student names with sequential tokens Student-A, Student-B`
- `should replace staff names with role titles`
- `should remove all UUID values from input`
- `should remove context_notes field`
- `should remove send_notes and send_aware fields`
- `should return tokenMap mapping tokens to original identities`
- `should not mutate the original input object`
- `should de-anonymise response using tokenMap`
- `should handle nested objects recursively`

**Pattern Detection**:

- `should create escalating_student alert when student has 3+ negatives in 7 days trending up`
- `should update existing alert data_snapshot instead of creating duplicate`
- `should not create logging_gap alert for staff who logged within 14 school days`
- `should auto-resolve alert when all recipients are resolved or dismissed`

### Integration Tests

**AI Feature Gates**:

- `should return 403 when ai_nl_query_enabled = false`
- `should return 403 when ai_insights_enabled = false and requesting narrative`
- `should fall back to OpenAI when Claude times out`
- `should return graceful fallback when both AI providers unavailable`

**Exposure Analytics**:

- `should return raw counts when exposure data unavailable, with warning flag`
- `should use historical exposure snapshot matching occurred_at date`

**RLS Leakage**:

- `RLS: behaviour_alerts from tenant A not visible to tenant B`
- `RLS: behaviour_alert_recipients from tenant A not visible to tenant B`
- `RLS: mv_student_behaviour_summary scoped to correct tenant`

**ETB Panel**:

- `ETB panel: should not include opted-out tenant data`
- `ETB panel: should suppress data points below benchmark_min_cohort_size`
- `ETB panel: should not expose student-level data in any response`

### Permission Tests

- `should return 403 for analytics/staff without behaviour.view_staff_analytics`
- `should return 403 for analytics/policy-effectiveness without behaviour.admin`
- `should return 403 for analytics/ai-query without behaviour.ai_query permission`
- `should respect scope: class-scope user cannot query other classes in AI`
- `should respect scope: own-scope user only sees their own incidents in analytics`
