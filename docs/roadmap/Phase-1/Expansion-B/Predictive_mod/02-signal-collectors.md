# Phase B: Signal Collectors — Implementation Plan

> **Parent:** [00-overview.md](00-overview.md)
> **Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md`
> **Depends on:** Phase A (foundation — shared types, enums, module scaffold)

## What This Builds

5 domain-specific signal collectors that query existing Prisma tables and return normalized `SignalResult` objects. Each collector is a standalone `@Injectable()` NestJS class with `PrismaService` as its only dependency. No new tables. No new endpoints. Pure read-only adapters.

## Files to Create

```
apps/api/src/modules/early-warning/collectors/
├── attendance-signal.collector.ts
├── attendance-signal.collector.spec.ts
├── grades-signal.collector.ts
├── grades-signal.collector.spec.ts
├── behaviour-signal.collector.ts
├── behaviour-signal.collector.spec.ts
├── wellbeing-signal.collector.ts
├── wellbeing-signal.collector.spec.ts
├── engagement-signal.collector.ts
└── engagement-signal.collector.spec.ts
```

**10 files total.** No existing files modified.

---

## Shared Interface (from Phase A `packages/shared/src/early-warning/types.ts`)

```typescript
export interface SignalResult {
  domain: EarlyWarningDomain;
  rawScore: number; // 0-100
  signals: DetectedSignal[];
  summaryFragments: string[];
}

export interface DetectedSignal {
  signalType: string;
  severity: EarlyWarningSignalSeverity;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}
```

## Common Collector Method Signature

```typescript
async collectSignals(tenantId: string, studentId: string, academicYearId: string): Promise<SignalResult>
```

## Common Patterns

- Import path for PrismaService: `../../prisma/prisma.service`
- Import path for shared types: `@school/shared`
- All queries include `tenant_id` in `where` clause (RLS)
- All date windows are computed relative to `new Date()` — no clock injection for v1
- `rawScore = Math.min(100, sum of all signal scoreContributions)`
- Empty data returns `{ domain, rawScore: 0, signals: [], summaryFragments: [] }`
- Severity mapping: contribution <= 10 = `low`, <= 20 = `medium`, <= 30 = `high`, > 30 = `critical`

---

## 1. AttendanceSignalCollector

### File: `attendance-signal.collector.ts`

**Class:** `AttendanceSignalCollector`

**Data sources:**
| Prisma Model | Table | Filter |
|---|---|---|
| `dailyAttendanceSummary` | `daily_attendance_summaries` | `tenant_id`, `student_id`, last 30 days |
| `attendancePatternAlert` | `attendance_pattern_alerts` | `tenant_id`, `student_id`, `status: 'active'` |
| `attendanceRecord` | `attendance_records` | `tenant_id`, `student_id`, last 30 days (joined through `attendanceSession` for `session_date`) |

**Signals:**

#### 1.1 `attendance_rate_decline` (+10-30 points)

Query `dailyAttendanceSummary` for last 30 days. Count days where `derived_status` is `present` or `late` vs total. If attendance rate < 90%:

- 80-89% = +10, severity `low`
- 70-79% = +20, severity `medium`
- < 70% = +30, severity `high`

Summary: `"Attendance rate ${rate}% over the last 30 days (${absentDays} absences)"`

Source entity: the most recent `DailyAttendanceSummary` with `absent` status.

#### 1.2 `consecutive_absences` (+15-25 points)

Query `dailyAttendanceSummary` ordered by `summary_date DESC`. Walk backward, counting consecutive days with `derived_status = 'absent'`. Skip weekends (Saturday=6, Sunday=0).

- 3 consecutive = +15, severity `medium`
- 4 consecutive = +20, severity `high`
- 5+ consecutive = +25, severity `high`

Summary: `"Absent ${count} consecutive school days (${startDate}–${endDate})"`

Source entity: the `DailyAttendanceSummary` of the first absent day in the streak.

#### 1.3 `recurring_day_pattern` (+10-20 points)

Query `attendancePatternAlert` with `alert_type: 'recurring_day'`, `status: 'active'`. Presence of an active alert:

- 1 alert = +10, severity `low`
- 2+ alerts = +20, severity `medium`

Summary: from `details_json.day_name` — `"Recurring absences on ${dayName}s (${count} of last 4 weeks)"`

Source entity: the `AttendancePatternAlert`.

#### 1.4 `chronic_tardiness` (+5-15 points)

From the 30-day `dailyAttendanceSummary` data, count days where `derived_status = 'late'`. Compute `lateRate = lateDays / attendedDays`. If > 20%:

- 20-30% = +5, severity `low`
- 30-50% = +10, severity `medium`
- > 50% = +15, severity `medium`

Also check for `attendancePatternAlert` with `alert_type: 'chronic_tardiness'`, `status: 'active'` as a secondary signal. Use the higher score.

Summary: `"Late ${lateDays} of ${attendedDays} attended days (${lateRate}%)"`

Source entity: most recent `DailyAttendanceSummary` with `late` status, or the `AttendancePatternAlert`.

#### 1.5 `attendance_trajectory` (+10-20 points)

From the 30-day `dailyAttendanceSummary` data, compute weekly attendance rates for the last 4 weeks (Mon-Fri). Check if rate declined 3+ consecutive weeks:

- 3 weeks declining = +10, severity `low`
- 4 weeks declining = +20, severity `medium`

Summary: `"Attendance declining ${weeksDecline} consecutive weeks: ${weekRates.join(' → ')}%"`

Source entity: the most recent `DailyAttendanceSummary`.

### Implementation Notes

- All 5 signals share the 30-day `dailyAttendanceSummary` query — fetch once, reuse.
- `attendancePatternAlert` query is a separate call (different model).
- Weekend detection: `date.getDay() === 0 || date.getDay() === 6`.
- For `consecutive_absences`, walk from most recent date backward. If today is absent and yesterday was absent, that counts.

### Test File: `attendance-signal.collector.spec.ts`

**Mock Prisma:**

```typescript
function buildMockPrisma() {
  return {
    dailyAttendanceSummary: { findMany: jest.fn().mockResolvedValue([]) },
    attendancePatternAlert: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
```

**Test cases:**

1. **Empty data returns score 0** — both queries return `[]` → `rawScore: 0`, `signals: []`, `summaryFragments: []`
2. **attendance_rate_decline detected** — mock 30 summaries, 8 absent → rate 73% → score 20, severity `medium`
3. **consecutive_absences detected** — mock 3 consecutive absent days → score 15, severity `medium`
4. **recurring_day_pattern from alert** — mock 1 active `recurring_day` alert → score 10, severity `low`
5. **chronic_tardiness detected** — mock 20 attended, 6 late (30%) → score 10
6. **attendance_trajectory declining** — mock 4 weeks of declining rates → score 20
7. **Multiple signals cap at 100** — mock data triggering all 5 signals with max points (30+25+20+15+20=110) → rawScore capped at 100
8. **Summary fragments generated** — verify each detected signal has a non-empty `summaryFragment`
9. **Source entity IDs populated** — verify `sourceEntityType` and `sourceEntityId` are set

---

## 2. GradesSignalCollector

### File: `grades-signal.collector.ts`

**Class:** `GradesSignalCollector`

**Data sources:**
| Prisma Model | Table | Filter |
|---|---|---|
| `studentAcademicRiskAlert` | `student_academic_risk_alerts` | `tenant_id`, `student_id`, `status: 'active'` |
| `periodGradeSnapshot` | `period_grade_snapshots` | `tenant_id`, `student_id`, academic periods within `academicYearId` |
| `grade` | `grades` | `tenant_id`, `student_id`, `is_missing: true`, joined through `assessment` for `academic_period_id` within current year |
| `progressReportEntry` | `progress_report_entries` | `tenant_id`, joined through `progressReport` for `student_id`, most recent report |

**Signals:**

#### 2.1 `below_class_mean` (+10-30 points)

Query `studentAcademicRiskAlert` where `status: 'active'` and `alert_type` is one of `at_risk_low`, `at_risk_medium`, `at_risk_high`. Map:

- `at_risk_low` = +10, severity `low`
- `at_risk_medium` = +20, severity `medium`
- `at_risk_high` = +30, severity `high`

If multiple alerts exist (different subjects), use the highest-scored one for this signal. The count of alerts feeds into `multi_subject_decline`.

Summary: `"Academic risk alert: ${triggerReason}" `(from the alert's `trigger_reason` field)

Source entity: the `StudentAcademicRiskAlert`.

#### 2.2 `grade_trajectory_decline` (+10-25 points)

Query `periodGradeSnapshot` for the student across academic periods within the academic year. Group by `subject_id`. For each subject, compare `computed_value` between the most recent two periods. If it declined:

- Decline in 1 subject = +10, severity `low`
- Decline in 2 subjects = +15, severity `medium`
- Decline in 3+ subjects = +25, severity `high`

Summary: `"Grade declined in ${count} subject(s) between ${period1} and ${period2}"`

Source entity: the `PeriodGradeSnapshot` with the biggest decline.

Note: also check `progressReportEntry.trend = 'declining'` as supporting evidence. If progress report entries show `declining` trend in more subjects than snapshots, use the higher count.

#### 2.3 `missing_assessments` (+10-20 points)

Query `grade` with `is_missing: true`, joined through `assessment` to filter by `academic_period_id` within the current academic year's periods. Count missing:

- 2-3 missing = +10, severity `low`
- 4-5 missing = +15, severity `medium`
- 6+ missing = +20, severity `high`

Summary: `"${count} missing assessment(s) in current period"`

Source entity: the first `Grade` record with `is_missing: true`.

#### 2.4 `score_anomaly` (+15-25 points)

Query `studentAcademicRiskAlert` where `alert_type: 'score_anomaly'`, `status: 'active'`.

- 1 anomaly alert = +15, severity `medium`
- 2+ anomaly alerts = +25, severity `high`

Summary: `"Score anomaly detected: ${triggerReason}"`

Source entity: the `StudentAcademicRiskAlert`.

#### 2.5 `multi_subject_decline` (+15-30 points)

Computed from the `grade_trajectory_decline` data. Count distinct subjects with declining `computed_value` across periods.

- 3 subjects = +15, severity `medium`
- 4 subjects = +20, severity `high`
- 5+ subjects = +30, severity `critical`

Note: only emitted if >= 3 subjects are declining. If fewer, this signal is not added (the individual declines are covered by `grade_trajectory_decline`).

Summary: `"Declining grades across ${count} subjects simultaneously"`

Source entity: the `PeriodGradeSnapshot` of the first declining subject.

### Implementation Notes

- `periodGradeSnapshot` and `progressReportEntry` queries require joining through `academicPeriod` to filter by `academic_year_id`. Use nested `where` on relations: `assessment: { academic_period: { academic_year_id } }`.
- The `computed_value` field is `Decimal(10,4)` — convert with `Number()` for arithmetic.
- `grade_trajectory_decline` and `multi_subject_decline` share the same data — compute once.

### Test File: `grades-signal.collector.spec.ts`

**Mock Prisma:**

```typescript
function buildMockPrisma() {
  return {
    studentAcademicRiskAlert: { findMany: jest.fn().mockResolvedValue([]) },
    periodGradeSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
    grade: { findMany: jest.fn().mockResolvedValue([]) },
    progressReportEntry: { findMany: jest.fn().mockResolvedValue([]) },
    academicPeriod: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
```

**Test cases:**

1. **Empty data returns score 0**
2. **below_class_mean from at_risk_medium alert** — mock 1 active alert → score 20
3. **grade_trajectory_decline across 2 subjects** — mock snapshots with declining values → score 15
4. **missing_assessments detected** — mock 3 grades with `is_missing: true` → score 10
5. **score_anomaly from alert** — mock 1 active `score_anomaly` alert → score 15
6. **multi_subject_decline (3+ subjects)** — mock 4 subjects declining → score 20 (plus `grade_trajectory_decline` +25)
7. **Multiple signals cap at 100** — stack all signals to exceed 100 → capped
8. **Summary fragments generated** — verify each signal has `summaryFragment`

---

## 3. BehaviourSignalCollector

### File: `behaviour-signal.collector.ts`

**Class:** `BehaviourSignalCollector`

**Data sources:**
| Prisma Model | Table | Filter |
|---|---|---|
| `behaviourAlert` | `behaviour_alerts` | `tenant_id`, `student_id`, `status: 'active_alert'` |
| `behaviourIncidentParticipant` | `behaviour_incident_participants` | `tenant_id`, `student_id`, `role: 'subject'`, last 30 days, joined through `incident` where `polarity: 'negative'` |
| `behaviourSanction` | `behaviour_sanctions` | `tenant_id`, `student_id`, active statuses |
| `behaviourExclusionCase` | `behaviour_exclusion_cases` | `tenant_id`, `student_id`, current academic year |
| `behaviourIntervention` | `behaviour_interventions` | `tenant_id`, `student_id`, relevant statuses |

**Critical:** Only negative polarity incidents contribute. Positive/neutral are excluded.

**Signals:**

#### 3.1 `incident_frequency` (+10-25 points)

Query `behaviourIncidentParticipant` where `student_id`, `role: 'subject'`, incident `polarity: 'negative'`, incident `occurred_at` within last 14 days. Count:

- 3-4 incidents = +10, severity `low`
- 5-6 incidents = +15, severity `medium`
- 7-9 incidents = +20, severity `high`
- 10+ incidents = +25, severity `high`

Summary: `"${count} negative behaviour incidents in the last 14 days"`

Source entity: the most recent `BehaviourIncidentParticipant`.

#### 3.2 `escalating_severity` (+10-20 points)

From the same incident data (30 days), compute average severity of incidents in first 15 days vs last 15 days. `BehaviourIncident.severity` is an `Int` field (higher = more severe).

If average severity increased:

- Increase of 1-2 points = +10, severity `low`
- Increase of 3+ points = +20, severity `medium`

Only emitted if there are incidents in both halves.

Summary: `"Incident severity escalating: average ${avgFirst} → ${avgSecond} over 30 days"`

Source entity: the most severe recent `BehaviourIncidentParticipant`.

#### 3.3 `active_sanction` (+15-30 points)

Query `behaviourSanction` where `student_id` and status in `['scheduled', 'partially_served']` (currently active). Map by `type`:

- `SanctionType` is an enum. Check for suspension-type sanctions:
  - Non-suspension sanction (detention, etc) = +15, severity `medium`
  - Suspension-type (has `suspension_start_date` set) = +30, severity `critical`

Summary: `"Active sanction: ${type} (${status})"`

Source entity: the `BehaviourSanction`.

#### 3.4 `exclusion_history` (+20-35 points)

Query `behaviourExclusionCase` for the student in the current academic year (join through `incident.academic_year_id`).

- 1 case = +20, severity `high`
- 2+ cases = +35, severity `critical`

Summary: `"${count} exclusion case(s) this academic year"`

Source entity: the `BehaviourExclusionCase`.

#### 3.5 `failed_intervention` (+10-20 points)

Query `behaviourIntervention` where `student_id` and:

- `outcome: 'deteriorated'` or `outcome: 'no_change'` with `status: 'completed_intervention'`
- OR `status: 'abandoned'`
- OR active intervention where `target_end_date < today` (overdue)

Count:

- 1 failed/overdue = +10, severity `low`
- 2+ failed/overdue = +20, severity `medium`

Summary: `"${count} failed or overdue behaviour intervention(s)"`

Source entity: the `BehaviourIntervention`.

### Implementation Notes

- `behaviourIncidentParticipant` needs a nested join: `incident: { polarity: 'negative', occurred_at: { gte: thirtyDaysAgo } }`.
- `behaviourAlert` with `status: 'active_alert'` — note the Prisma enum value is `active_alert` (mapped from `active` in DB).
- Active sanctions: `status` in `['scheduled', 'partially_served']`.
- Exclusion cases: filter by incident's `academic_year_id`.

### Test File: `behaviour-signal.collector.spec.ts`

**Mock Prisma:**

```typescript
function buildMockPrisma() {
  return {
    behaviourIncidentParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    behaviourSanction: { findMany: jest.fn().mockResolvedValue([]) },
    behaviourExclusionCase: { findMany: jest.fn().mockResolvedValue([]) },
    behaviourIntervention: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
```

**Test cases:**

1. **Empty data returns score 0**
2. **incident_frequency with 5 incidents** — score 15, severity `medium`
3. **escalating_severity detected** — mock incidents with rising severity → score 10+
4. **active_sanction (suspension)** — mock scheduled sanction with `suspension_start_date` → score 30, severity `critical`
5. **active_sanction (non-suspension)** — mock scheduled detention → score 15, severity `medium`
6. **exclusion_history with 1 case** — score 20, severity `high`
7. **failed_intervention** — mock 1 abandoned intervention → score 10
8. **Only negative polarity counted** — mock positive incident participants → no signal
9. **Multiple signals cap at 100**
10. **Summary fragments generated**

---

## 4. WellbeingSignalCollector

### File: `wellbeing-signal.collector.ts`

**Class:** `WellbeingSignalCollector`

**Data sources:**
| Prisma Model | Table | Filter |
|---|---|---|
| `studentCheckin` | `student_checkins` | `tenant_id`, `student_id`, last 30 days |
| `pastoralConcern` | `pastoral_concerns` | `tenant_id`, `student_id`, open statuses |
| `pastoralCase` | `pastoral_cases` | `tenant_id`, `student_id`, `status: 'open'` or `status: 'active'` |
| `pastoralReferral` | `pastoral_referrals` | `tenant_id`, `student_id`, active statuses |
| `criticalIncidentAffected` | `critical_incident_affected` | `tenant_id`, `student_id`, `wellbeing_flag_active: true` |

**DZ-27:** NEVER query `surveyResponse` or `staffSurveyResponse`. This collector only touches the models listed above.

**Signals:**

#### 4.1 `declining_wellbeing_score` (+10-25 points)

Query `studentCheckin` for last 30 days, ordered by `checkin_date DESC`. Take the most recent 5 check-ins. Compute linear trend of `mood_score` (1-5 scale). If trending down across 3+ check-ins:

- Decline of 0.5-1.0 avg points = +10, severity `low`
- Decline of 1.0-2.0 avg points = +15, severity `medium`
- Decline of > 2.0 avg points = +25, severity `high`

Decline is computed as: `firstCheckins avg - lastCheckins avg`. Split check-ins into first half and second half.

Summary: `"Wellbeing score declining: average ${avgFirst} → ${avgSecond} over last ${count} check-ins"`

Source entity: the most recent `StudentCheckin`.

#### 4.2 `low_mood_pattern` (+10-20 points)

From the same check-in data, look at the last 3 check-ins. If all have `mood_score <= 2`:

- All 3 at score 2 = +10, severity `low`
- All 3 at score 1 = +20, severity `medium`
- Mix of 1s and 2s = +15, severity `medium`

Summary: `"Low mood in last ${count} check-ins (scores: ${scores.join(', ')})"`

Source entity: the most recent `StudentCheckin`.

#### 4.3 `active_pastoral_concern` (+15-30 points)

Query `pastoralConcern` where `student_id` and `severity` in `['elevated', 'urgent', 'critical']`. The concern must not be fully resolved (check: it exists and has no `acknowledged_at` or is recent).

Actually, pastoral concerns don't have a simple status field — they use `case_id` linkage and `follow_up_needed`. Filter for concerns with `follow_up_needed: true` OR `severity` in `['urgent', 'critical']` created within the last 90 days.

Score by severity:

- `elevated` with `follow_up_needed` = +15, severity `medium`
- `urgent` = +20, severity `high`
- `critical` = +30, severity `critical`

Use the highest-severity concern.

Summary: `"Active pastoral concern: ${category} (severity: ${severity})"`

Source entity: the `PastoralConcern`.

#### 4.4 `active_pastoral_case` (+10-20 points)

Query `pastoralCase` where `student_id` and `status` in `['open', 'active', 'monitoring']`.

- 1 case = +10, severity `low`
- 2+ cases = +20, severity `medium`

Summary: `"${count} active pastoral case(s)"`

Source entity: the `PastoralCase`.

#### 4.5 `external_referral` (+15-25 points)

Query `pastoralReferral` where `student_id` and `status` in `['submitted', 'acknowledged', 'assessment_scheduled']`.

- 1 referral = +15, severity `medium`
- 2+ referrals = +25, severity `high`

Summary: `"External referral active: ${referralType} to ${referralBodyName} (${status})"`

Source entity: the `PastoralReferral`.

#### 4.6 `critical_incident_affected` (+20-35 points)

Query `criticalIncidentAffected` where `student_id` and `wellbeing_flag_active: true`.

Score by `impact_level`:

- `indirect` = +20, severity `high`
- `direct` = +35, severity `critical`

Summary: `"Affected by critical incident (impact: ${impactLevel})"`

Source entity: the `CriticalIncidentAffected`.

### Implementation Notes

- `studentCheckin` is append-only (no `updated_at`). Order by `checkin_date DESC`.
- `pastoralConcern` has no `status` column — determine "active" from `severity`, `follow_up_needed`, recency, and absence of `acknowledged_at`.
- `pastoralCase.status` uses enum `PastoralCaseStatus` with values `open`, `active`, `monitoring`, `resolved`, `closed`.
- `pastoralReferral.status` uses enum `PastoralReferralStatus`.
- `criticalIncidentAffected.wellbeing_flag_active` is a boolean, `wellbeing_flag_expires_at` can also be checked.

### Test File: `wellbeing-signal.collector.spec.ts`

**Mock Prisma:**

```typescript
function buildMockPrisma() {
  return {
    studentCheckin: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralConcern: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralCase: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralReferral: { findMany: jest.fn().mockResolvedValue([]) },
    criticalIncidentAffected: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
```

**Test cases:**

1. **Empty data returns score 0**
2. **declining_wellbeing_score** — mock 5 check-ins with declining mood → score 10-25
3. **low_mood_pattern** — mock 3 check-ins all with `mood_score: 1` → score 20
4. **active_pastoral_concern (urgent)** — mock 1 concern with `severity: 'urgent'` → score 20
5. **active_pastoral_case** — mock 1 open case → score 10
6. **external_referral** — mock 1 submitted referral → score 15
7. **critical_incident_affected (direct)** — mock with `impact_level: 'direct'` → score 35, severity `critical`
8. **NEVER queries survey_responses** — verify mock prisma has no `surveyResponse` access
9. **Multiple signals cap at 100**
10. **Summary fragments generated**

---

## 5. EngagementSignalCollector

### File: `engagement-signal.collector.ts`

**Class:** `EngagementSignalCollector`

**Data sources:**
| Prisma Model | Table | Filter |
|---|---|---|
| `studentParent` | `student_parents` | `tenant_id`, `student_id` → get parent IDs |
| `notification` | `notifications` | `tenant_id`, `recipient_user_id` in parent user IDs, `channel: 'in_app'`, last 30 days |
| `parentInquiry` | `parent_inquiries` | `tenant_id`, `parent_id` in parent IDs, current academic year |
| `parent` → `user` | `parents` → `users` | Parent's `user_id` → `User.last_login_at` |
| `behaviourParentAcknowledgement` | `behaviour_parent_acknowledgements` | `tenant_id`, `parent_id` in parent IDs, last 30 days |

**Best-parent metric:** For each signal, compute per-parent, then use the BEST (most engaged) parent's value. This avoids penalising families where only one parent is active on the platform.

**Signals:**

#### 5.1 `low_notification_read_rate` (+10-20 points)

Step 1: Get student's parents via `studentParent` → `parent` → `user_id`.
Step 2: For each parent with a `user_id`, query `notification` where `recipient_user_id = parent.user_id`, `channel: 'in_app'`, last 30 days.
Step 3: Compute read rate = count where `read_at IS NOT NULL` / total. Use the BEST parent's rate.

If best rate < 30%:

- 15-29% = +10, severity `low`
- 1-14% = +15, severity `medium`
- 0% = +20, severity `medium`

If no notifications sent, skip this signal.

Summary: `"Parent notification read rate: ${bestRate}% (${read}/${total} in 30 days)"`

Source entity: the most recent unread `Notification`.

#### 5.2 `no_portal_login` (+15-25 points)

From the parent→user data, check `User.last_login_at` for each parent. Use the MOST RECENT login across all parents.

If best parent's last login is:

- 21-30 days ago = +15, severity `medium`
- 31-60 days ago = +20, severity `high`
- > 60 days ago or never = +25, severity `high`

Summary: `"No parent portal login in ${daysSince} days"`

Source entity: construct a synthetic source — `sourceEntityType: 'User'`, `sourceEntityId` = the parent's `user_id`.

#### 5.3 `no_parent_inquiry` (+5-15 points)

Query `parentInquiry` for any of the student's parents, filtered by `created_at` within the academic year date range. Count across all parents.

If zero inquiries across all parents:

- If academic year is < 3 months old = +5, severity `low`
- If academic year is 3-6 months old = +10, severity `low`
- If academic year is > 6 months old = +15, severity `medium`

Summary: `"No parent-initiated inquiries this academic year"`

Source entity: `sourceEntityType: 'Student'`, `sourceEntityId` = `studentId`.

Academic year date range: query `academicYear` by `academicYearId` to get `start_date` and `end_date`.

#### 5.4 `slow_acknowledgement` (+10-20 points)

Query `behaviourParentAcknowledgement` for the student's parents, last 30 days. For each acknowledgement where both `sent_at` and `acknowledged_at` exist, compute response time in hours. Average across all. Use the BEST (fastest) parent.

If best parent's average response time:

- 72-120 hours = +10, severity `low`
- 121-168 hours (1 week) = +15, severity `medium`
- > 168 hours or never acknowledged = +20, severity `medium`

If no acknowledgements sent, skip this signal.

Summary: `"Average behaviour acknowledgement time: ${avgHours} hours"`

Source entity: the slowest `BehaviourParentAcknowledgement`.

#### 5.5 `disengagement_trajectory` (+10-20 points)

From notification data, compute weekly read rates for last 4 weeks (best parent). If read rate declined 3+ consecutive weeks:

- 3 weeks declining = +10, severity `low`
- 4 weeks declining = +20, severity `medium`

Alternatively, if login frequency data shows decreasing engagement (last_login_at getting further apart), this also triggers.

Summary: `"Parent engagement declining over ${weeks} consecutive weeks"`

Source entity: most recent `Notification`.

### Implementation Notes

- **First step in every signal:** resolve student → parents → parent user IDs. Cache this for the entire `collectSignals` call. If student has no parents with `user_id`, return score 0 (no engagement data available).
- `Notification` has `recipient_user_id` not `parent_id` — must go through `Parent.user_id`.
- `ParentInquiry` uses `parent_id` directly.
- `BehaviourParentAcknowledgement` uses `parent_id` directly.
- Academic year lookup needed for `no_parent_inquiry` — query `academicYear` by ID to get date range.

### Test File: `engagement-signal.collector.spec.ts`

**Mock Prisma:**

```typescript
function buildMockPrisma() {
  return {
    studentParent: { findMany: jest.fn().mockResolvedValue([]) },
    parent: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { findMany: jest.fn().mockResolvedValue([]) },
    parentInquiry: { findMany: jest.fn().mockResolvedValue([]) },
    academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
    behaviourParentAcknowledgement: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
```

**Test cases:**

1. **No parents returns score 0** — `studentParent` returns `[]`
2. **Parents without user accounts returns score 0** — parents exist but all have `user_id: null`
3. **low_notification_read_rate** — mock 10 notifications, 2 read → rate 20% → score 10
4. **no_portal_login (>60 days)** — mock parent user with `last_login_at` 90 days ago → score 25
5. **no_parent_inquiry** — mock 0 inquiries, academic year > 6 months → score 15
6. **slow_acknowledgement** — mock acknowledgements with 100h avg → score 10
7. **disengagement_trajectory** — mock declining weekly read rates → score 10+
8. **Best parent metric** — mock 2 parents: one with 50% read rate, one with 10% → signal uses 50% (no trigger at > 30%)
9. **Multiple signals cap at 100**
10. **Summary fragments generated**

---

## Cross-Cutting Implementation Details

### Helper: Severity Mapper

Shared utility at the top of each collector or in a shared helper:

```typescript
function mapSeverity(score: number): EarlyWarningSignalSeverity {
  if (score <= 10) return 'low';
  if (score <= 20) return 'medium';
  if (score <= 30) return 'high';
  return 'critical';
}
```

### Helper: Build Signal

```typescript
function buildSignal(params: {
  signalType: string;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}): DetectedSignal {
  return {
    ...params,
    severity: mapSeverity(params.scoreContribution),
  };
}
```

These helpers can live in a `collector-utils.ts` file in the `collectors/` directory, or be inlined per collector. Either approach is acceptable.

### Module Registration

Each collector must be registered as a provider in `early-warning.module.ts` (from Phase A scaffold):

```typescript
providers: [
  AttendanceSignalCollector,
  GradesSignalCollector,
  BehaviourSignalCollector,
  WellbeingSignalCollector,
  EngagementSignalCollector,
  // ... other services
],
```

The orchestration service (Phase D) will inject all 5 collectors and call `collectSignals()` in parallel via `Promise.all()`.

---

## Execution Order

1. Create `attendance-signal.collector.spec.ts` → run → fails (class doesn't exist)
2. Create `attendance-signal.collector.ts` → run tests → pass
3. Create `grades-signal.collector.spec.ts` → run → fails
4. Create `grades-signal.collector.ts` → run tests → pass
5. Create `behaviour-signal.collector.spec.ts` → run → fails
6. Create `behaviour-signal.collector.ts` → run tests → pass
7. Create `wellbeing-signal.collector.spec.ts` → run → fails
8. Create `wellbeing-signal.collector.ts` → run tests → pass
9. Create `engagement-signal.collector.spec.ts` → run → fails
10. Create `engagement-signal.collector.ts` → run tests → pass
11. Run all 5 spec files together — all green
12. Run `turbo lint` and `turbo type-check` — verify no errors
13. Update `early-warning.module.ts` providers array

**Note:** Steps 1-10 can be parallelised per collector (5 independent collector+test pairs).

---

## Verification Checklist

- [ ] All 5 collectors are `@Injectable()` NestJS classes
- [ ] All accept `PrismaService` via constructor DI
- [ ] All implement `collectSignals(tenantId, studentId, academicYearId): Promise<SignalResult>`
- [ ] All queries include `tenant_id` in where clause
- [ ] Empty data returns `rawScore: 0` for every collector
- [ ] `rawScore` is capped at 100 via `Math.min(100, sum)`
- [ ] Every detected signal has: `signalType`, `severity`, `scoreContribution`, `details`, `sourceEntityType`, `sourceEntityId`, `summaryFragment`
- [ ] `summaryFragments` array on `SignalResult` matches the signal `summaryFragment` values
- [ ] WellbeingSignalCollector NEVER touches `surveyResponse` (DZ-27)
- [ ] BehaviourSignalCollector only counts `negative` polarity incidents
- [ ] EngagementSignalCollector uses best-parent metric
- [ ] All 50+ test cases pass
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes
- [ ] No `any` types, no `@ts-ignore`
- [ ] Import ordering follows project conventions
