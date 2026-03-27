# Phase SW-4A: Self-Check-Ins — Implementation Spec

> **Phase**: 4A of 5 (Sub-phase of Phase 4 — Predictive Signals)
> **Name**: Student Self-Check-Ins
> **Description**: Privacy-preserving mood check-ins with prerequisite enforcement, keyword flagging, consecutive-low detection, and aggregate-only analytics with minimum cohort enforcement. Ships only when the school has completed safeguarding operating model prerequisites.
> **Dependencies**: SW-1B (concern service — flagged check-ins auto-generate Tier 2 concerns), SW-1E (notifications — alert delivery to monitoring owners)
> **Status**: NOT STARTED
> **Spec source**: master-spec.md sections 8 (Student self-check-ins) and 7 (Wellbeing indicators)
> **This document is self-contained. No need to open the master spec during implementation.**

---

## What This Sub-Phase Delivers

1. **Prerequisite verification** — a service that gates check-in enablement behind mandatory safeguarding readiness: monitoring ownership defined, monitoring hours defined, escalation protocol documented, written acknowledgement that check-ins are not an emergency service
2. **Check-in submission** — students submit a daily or weekly mood check-in (mood_score 1-5, optional freeform_text) with one-per-day enforcement and DATE-only storage for privacy
3. **Keyword flagging** — scans freeform_text against tenant-configurable flagged keywords and auto-generates a Tier 2 concern when matched
4. **Consecutive low detection** — detects 3+ consecutive check-ins at the lowest mood score (configurable threshold) and auto-generates a Tier 2 concern
5. **Helpline display** — hardcoded, non-configurable helpline numbers shown on every check-in screen and immediately after a flag is triggered
6. **Aggregate analytics** — year group mood trends, day-of-week patterns, before/after exam comparisons, with minimum cohort size enforcement (default 10) preventing individual identification
7. **Admin/monitoring views** — monitoring owners can view individual flagged check-ins and aggregate data; no access for class teachers or parents

---

## Prerequisites

SW-1B and SW-1E must be complete and merged before starting SW-4A. The following must exist:

- `pastoral_concerns` table with full CRUD and Tier 2 concern creation via `ConcernService.create()`
- `pastoral_audit_events` table with immutable append-only semantics
- Notification infrastructure for delivering alerts to specific users (monitoring owners)
- `tenant_settings.pastoral` JSONB with validated schema in `packages/shared`
- Permission guards infrastructure (existing `@RequiresPermission` and `@ModuleEnabled` decorators)
- Student authentication and student-facing API route infrastructure
- BullMQ producer available in API app

---

## Tenant Settings Extension

Add the following keys to the `tenant_settings.pastoral` JSONB schema:

```typescript
// In PastoralSettingsSchema (packages/shared)
checkin_enabled: z.boolean().default(false),
checkin_frequency: z.enum(['daily', 'weekly']).default('daily'),
checkin_monitoring_owner_user_ids: z.array(z.string().uuid()).default([]),
checkin_monitoring_hours: z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),   // "08:00"
  end: z.string().regex(/^\d{2}:\d{2}$/),      // "16:00"
  school_days_only: z.boolean().default(true),
}).nullable().default(null),
checkin_escalation_protocol: z.string().nullable().default(null),
checkin_prerequisites_acknowledged: z.boolean().default(false),
checkin_flagged_keywords: z.array(z.string()).default([
  'suicide', 'kill myself', 'want to die', 'self-harm', 'cut myself',
  'hurt myself', 'end it all', 'no point living', 'nobody cares',
]),
checkin_consecutive_low_threshold: z.number().int().min(2).max(10).default(3),
checkin_low_mood_score: z.number().int().min(1).max(5).default(1),
checkin_min_cohort_size: z.number().int().min(5).max(50).default(10),
```

---

## Database

### New Table: `pastoral_checkins`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `student_id` | UUID FK NOT NULL | -> `students` |
| `checkin_date` | DATE NOT NULL | DATE only — no timestamp, for privacy |
| `mood_score` | SMALLINT NOT NULL | 1-5 inclusive |
| `freeform_text` | TEXT NULL | Optional student narrative |
| `academic_year_id` | UUID FK NOT NULL | |
| `was_flagged` | BOOLEAN NOT NULL DEFAULT false | Set true if keyword or consecutive-low triggered |
| `flag_reason` | VARCHAR(50) NULL | `'keyword_match'` or `'consecutive_low'` or null |
| `flag_generated_concern_id` | UUID FK NULL | -> `pastoral_concerns` — the auto-generated concern |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Server-side timestamp (not exposed to students) |

**UNIQUE**: `(tenant_id, student_id, checkin_date)` — enforces one check-in per student per day.

**Indexes**:
- `(tenant_id, student_id, checkin_date DESC)` — student history queries and consecutive-low detection
- `(tenant_id, checkin_date, mood_score)` — aggregate analytics queries
- `(tenant_id, academic_year_id, checkin_date)` — year-scoped analytics
- `(tenant_id, was_flagged) WHERE was_flagged = true` — monitoring owner dashboard

**RLS Policy**:
```sql
CREATE POLICY pastoral_checkins_tenant_isolation ON pastoral_checkins
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**CHECK constraint**: `mood_score >= 1 AND mood_score <= 5`

---

## Services

### 1. `checkin-prerequisite.service.ts`

Validates all safeguarding prerequisites before allowing check-in enablement.

```typescript
interface PrerequisiteStatus {
  monitoring_ownership_defined: boolean;    // checkin_monitoring_owner_user_ids not empty
  monitoring_hours_defined: boolean;        // checkin_monitoring_hours not null
  escalation_protocol_defined: boolean;     // checkin_escalation_protocol not null/empty
  prerequisites_acknowledged: boolean;      // checkin_prerequisites_acknowledged = true
  all_met: boolean;                         // AND of all above
}

class CheckinPrerequisiteService {
  /**
   * Returns the current prerequisite status for this tenant.
   * Called before enabling check-ins and on the config screen.
   */
  async getPrerequisiteStatus(tx: PrismaTransaction, tenantId: string): Promise<PrerequisiteStatus>;

  /**
   * Validates all prerequisites are met. Throws HttpException(400) with
   * detailed checklist if any prerequisite is unmet.
   * Called when attempting to set checkin_enabled = true.
   */
  async validatePrerequisites(tx: PrismaTransaction, tenantId: string): Promise<void>;

  /**
   * Validates that monitoring owner user IDs reference real users who are
   * active staff members in this tenant.
   */
  async validateMonitoringOwners(tx: PrismaTransaction, tenantId: string, userIds: string[]): Promise<void>;
}
```

**Enforcement**: When `checkin_enabled` is set to `true` via the config endpoint, `validatePrerequisites()` is called. If any prerequisite is unmet, the update is rejected with a 400 response listing the unmet prerequisites.

---

### 2. `checkin.service.ts`

Core check-in submission and retrieval logic.

```typescript
interface CreateCheckinDto {
  mood_score: number;         // 1-5
  freeform_text?: string;     // optional
}

interface CheckinResponse {
  id: string;
  checkin_date: string;       // ISO date string (YYYY-MM-DD)
  mood_score: number;
  freeform_text: string | null;
  was_flagged: boolean;
  // flag_reason and concern_id are NOT returned to the student
}

interface StudentCheckinHistory {
  checkins: CheckinResponse[];
  meta: { page: number; pageSize: number; total: number };
}

class CheckinService {
  /**
   * Submit a check-in for the authenticated student.
   * - Verifies check-ins are enabled for this tenant
   * - Enforces one-per-day via unique constraint (returns 409 if duplicate)
   * - Enforces frequency: if weekly, checks that no check-in exists within the current week
   * - Stores checkin_date as DATE only (not timestamp)
   * - Delegates to CheckinAlertService for keyword/consecutive-low detection
   * - Returns the check-in response (WITHOUT flag details to the student)
   */
  async submitCheckin(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    userId: string,
    dto: CreateCheckinDto,
  ): Promise<CheckinResponse>;

  /**
   * Get authenticated student's own check-in history.
   * Paginated, most recent first.
   */
  async getMyCheckins(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<StudentCheckinHistory>;

  /**
   * Get individual check-ins for a specific student.
   * Restricted to monitoring owners and guidance counsellor only.
   * Includes flag_reason and concern linkage.
   */
  async getStudentCheckins(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    page: number,
    pageSize: number,
  ): Promise<MonitoringCheckinHistory>;

  /**
   * Get all flagged check-ins for the monitoring owner dashboard.
   * Filtered by date range, optionally by flag_reason.
   */
  async getFlaggedCheckins(
    tx: PrismaTransaction,
    tenantId: string,
    filters: FlaggedCheckinFilters,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<FlaggedCheckinDetail>>;
}
```

**Frequency enforcement**:
- `daily`: unique constraint on `(tenant_id, student_id, checkin_date)` handles this
- `weekly`: before insert, query for any existing check-in where `checkin_date` falls within the same ISO week as today. If found, return 409.

**Privacy**: The `created_at` timestamp is server-internal only. Student-facing responses expose only `checkin_date` (DATE). The student never sees `was_flagged`, `flag_reason`, or `flag_generated_concern_id`.

---

### 3. `checkin-alert.service.ts`

Detects flagged check-ins and auto-generates Tier 2 concerns.

```typescript
interface AlertCheckResult {
  was_flagged: boolean;
  flag_reason: 'keyword_match' | 'consecutive_low' | null;
  generated_concern_id: string | null;
}

class CheckinAlertService {
  /**
   * Called by CheckinService after a check-in is persisted.
   * Runs keyword matching and consecutive-low detection.
   * If either triggers:
   *   1. Updates the check-in record with was_flagged, flag_reason, flag_generated_concern_id
   *   2. Auto-generates a Tier 2 concern via ConcernService.create() assigned to the monitoring owner
   *   3. Records a 'checkin_alert_generated' pastoral audit event
   *   4. Enqueues a notification to monitoring owner(s)
   *   5. If outside monitoring hours: notification is queued for first-thing review
   */
  async evaluateCheckin(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    checkinId: string,
    checkinDate: string,
    moodScore: number,
    freeformText: string | null,
  ): Promise<AlertCheckResult>;

  /**
   * Keyword matching: case-insensitive scan of freeform_text against
   * tenant's checkin_flagged_keywords list.
   * Returns the first matched keyword or null.
   */
  private matchKeywords(text: string, keywords: string[]): string | null;

  /**
   * Consecutive low detection: query the student's last N check-ins
   * (where N = checkin_consecutive_low_threshold) ordered by checkin_date DESC.
   * If ALL have mood_score <= checkin_low_mood_score, return true.
   * The current check-in is included in the count (already persisted).
   */
  private async detectConsecutiveLow(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    threshold: number,
    lowMoodScore: number,
  ): Promise<boolean>;

  /**
   * Determines whether the current time falls within the tenant's
   * monitoring hours. Used to decide notification urgency.
   */
  private isWithinMonitoringHours(
    monitoringHours: { start: string; end: string; school_days_only: boolean },
    tenantTimezone: string,
    now: Date,
  ): boolean;

  /**
   * Generates the auto-concern for a flagged check-in.
   * Concern fields:
   *   - category: 'emotional' (or 'self_harm_suicidal_ideation' if keyword matched)
   *   - severity: 'elevated'
   *   - tier: 2
   *   - narrative: "Automated concern from student self-check-in on {date}. Flag reason: {reason}."
   *   - assigned_to: first monitoring owner
   *   - source: 'checkin_auto'
   */
  private async generateConcern(
    tx: PrismaTransaction,
    tenantId: string,
    studentId: string,
    checkinId: string,
    flagReason: 'keyword_match' | 'consecutive_low',
    matchedKeyword: string | null,
  ): Promise<string>; // returns concern_id
}
```

**Keyword matching rules**:
- Case-insensitive
- Word boundary aware where possible (e.g., "cut myself" should match "I cut myself today" but "shortcut" should not match "cut")
- Scan the full `freeform_text` against each keyword in order
- First match triggers — do not scan further

**Consecutive low detection rules**:
- Query the student's most recent N check-ins by `checkin_date DESC` where N = `checkin_consecutive_low_threshold`
- If fewer than N check-ins exist, consecutive low cannot trigger (return false)
- All N must have `mood_score <= checkin_low_mood_score`
- The check-in being evaluated is already persisted and included in the query

**Out-of-hours behaviour**:
- If the flag occurs outside monitoring hours, the notification is enqueued with a `deliver_after` timestamp set to the next monitoring hours start time
- The student sees the helpline information immediately regardless of monitoring hours
- The system does NOT imply to the student that someone is reading their check-in now

---

### 4. `checkin-analytics.service.ts`

Aggregate-only analytics with minimum cohort enforcement.

```typescript
interface MoodTrendDataPoint {
  period: string;           // ISO date or ISO week string
  average_mood: number;     // 1.0 - 5.0
  response_count: number;   // for display, NOT for individual identification
}

interface DayOfWeekPattern {
  day: number;              // 0-6 (Monday=0)
  average_mood: number;
  response_count: number;
}

interface ExamComparisonResult {
  before_period: { average_mood: number; response_count: number };
  during_period: { average_mood: number; response_count: number };
  after_period: { average_mood: number; response_count: number };
}

class CheckinAnalyticsService {
  /**
   * Year group mood trends over time.
   * Returns weekly or monthly aggregation depending on date range.
   * Enforces minimum cohort size: if a year group has fewer than
   * checkin_min_cohort_size unique students with check-ins in a period,
   * that data point is excluded from results.
   */
  async getYearGroupMoodTrends(
    tx: PrismaTransaction,
    tenantId: string,
    yearGroupId: string,
    dateRange: { from: string; to: string },
    granularity: 'weekly' | 'monthly',
  ): Promise<MoodTrendDataPoint[]>;

  /**
   * School-wide mood trends over time.
   * Same minimum cohort enforcement per period.
   */
  async getSchoolMoodTrends(
    tx: PrismaTransaction,
    tenantId: string,
    dateRange: { from: string; to: string },
    granularity: 'weekly' | 'monthly',
  ): Promise<MoodTrendDataPoint[]>;

  /**
   * Day-of-week patterns across the school or a year group.
   * Minimum cohort enforcement per day.
   */
  async getDayOfWeekPatterns(
    tx: PrismaTransaction,
    tenantId: string,
    yearGroupId: string | null,
    dateRange: { from: string; to: string },
  ): Promise<DayOfWeekPattern[]>;

  /**
   * Before/during/after exam period comparison.
   * Takes exam period start and end dates.
   * "Before" = same duration preceding the exam period.
   * "After" = same duration following the exam period.
   * Minimum cohort enforcement per sub-period.
   */
  async getExamPeriodComparison(
    tx: PrismaTransaction,
    tenantId: string,
    yearGroupId: string | null,
    examPeriod: { start: string; end: string },
  ): Promise<ExamComparisonResult | null>; // null if cohort too small

  /**
   * Internal: enforces minimum cohort size.
   * Counts distinct student_ids in the given scope and date range.
   * If count < min_cohort_size, returns null (data suppressed).
   */
  private async enforceMinCohort(
    tx: PrismaTransaction,
    tenantId: string,
    yearGroupId: string | null,
    dateRange: { from: string; to: string },
    minCohortSize: number,
  ): Promise<boolean>;
}
```

**Minimum cohort enforcement is non-negotiable**: If a year group or time period has fewer than `checkin_min_cohort_size` unique students with check-ins, the aggregation is NOT returned. The API returns `null` for that data point or excludes it from the array. The frontend displays "Insufficient data for anonymised display" in place of the chart/number.

**No individual identification**: Analytics endpoints never return student IDs, student names, or any data that could identify an individual student. Only aggregate numbers (average mood, response count) are returned.

---

## API Endpoints

### Student-Facing: `checkins.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/pastoral/checkins` | Submit a check-in | student (authenticated) |
| GET | `v1/pastoral/checkins/my` | Get own check-in history (paginated) | student (authenticated) |
| GET | `v1/pastoral/checkins/status` | Check if check-ins are enabled + whether student can submit today | student (authenticated) |

### Admin/Monitoring: `checkin-admin.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/pastoral/checkins/flagged` | List flagged check-ins (monitoring dashboard) | `pastoral.view_checkin_monitoring` |
| GET | `v1/pastoral/checkins/students/:studentId` | Individual student check-in history | `pastoral.view_checkin_monitoring` |
| GET | `v1/pastoral/checkins/analytics/mood-trends` | Year group or school mood trends | `pastoral.view_checkin_aggregate` |
| GET | `v1/pastoral/checkins/analytics/day-of-week` | Day-of-week mood patterns | `pastoral.view_checkin_aggregate` |
| GET | `v1/pastoral/checkins/analytics/exam-comparison` | Before/during/after exam comparison | `pastoral.view_checkin_aggregate` |

### Configuration: `checkin-config.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/pastoral/checkins/config/prerequisites` | Get prerequisite checklist status | `pastoral.admin` |
| PATCH | `v1/pastoral/checkins/config` | Update check-in settings (enable/disable, frequency, keywords, thresholds) | `pastoral.admin` |

**Total: 10 endpoints**

---

## Permissions

Register the following new permissions:

| Key | Description | Tier |
|-----|-------------|------|
| `pastoral.view_checkin_monitoring` | View individual student check-ins (monitoring owners, guidance counsellor) | admin |
| `pastoral.view_checkin_aggregate` | View aggregate check-in analytics (no individual data) | staff |

**Access control for individual check-in data** (enforced in service layer, not just permission):
- Individual check-in responses (student-level) are visible ONLY to users whose `user_id` is in `checkin_monitoring_owner_user_ids` OR who hold the guidance counsellor role
- Class teachers do NOT have access to individual check-ins
- Parents do NOT have access to check-in data at all
- Aggregate analytics are available to anyone with `pastoral.view_checkin_aggregate`

---

## Zod Schemas (`packages/shared/src/pastoral/schemas/`)

### `checkin.schema.ts`

```typescript
export const createCheckinSchema = z.object({
  mood_score: z.number().int().min(1).max(5),
  freeform_text: z.string().max(500).optional(),
});

export const checkinStatusResponseSchema = z.object({
  enabled: z.boolean(),
  can_submit_today: z.boolean(),
  frequency: z.enum(['daily', 'weekly']),
  last_checkin_date: z.string().nullable(),
});

export const checkinResponseSchema = z.object({
  id: z.string().uuid(),
  checkin_date: z.string(),
  mood_score: z.number().int().min(1).max(5),
  freeform_text: z.string().nullable(),
  was_flagged: z.boolean(),
});

// Admin/monitoring view includes flag details
export const monitoringCheckinResponseSchema = checkinResponseSchema.extend({
  flag_reason: z.enum(['keyword_match', 'consecutive_low']).nullable(),
  flag_generated_concern_id: z.string().uuid().nullable(),
  student_id: z.string().uuid(),
  student_name: z.string(),
});

export const checkinAnalyticsQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['weekly', 'monthly']).default('weekly'),
});

export const examComparisonQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  exam_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exam_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreateCheckinDto = z.infer<typeof createCheckinSchema>;
export type CheckinStatusResponse = z.infer<typeof checkinStatusResponseSchema>;
export type CheckinResponse = z.infer<typeof checkinResponseSchema>;
export type MonitoringCheckinResponse = z.infer<typeof monitoringCheckinResponseSchema>;
export type CheckinAnalyticsQuery = z.infer<typeof checkinAnalyticsQuerySchema>;
export type ExamComparisonQuery = z.infer<typeof examComparisonQuerySchema>;
```

---

## Worker Jobs

### `pastoral:checkin-alert-notification`

**Trigger**: Enqueued by `CheckinAlertService.evaluateCheckin()` when a flag is triggered.
**Queue**: `notifications`
**Payload**:
```typescript
{
  tenant_id: string;
  checkin_id: string;
  student_id: string;
  flag_reason: 'keyword_match' | 'consecutive_low';
  monitoring_owner_user_ids: string[];
  deliver_after?: string; // ISO timestamp — set if outside monitoring hours
}
```
**Logic**:
1. If `deliver_after` is set and current time is before it, re-enqueue as delayed job
2. Load student name (for notification body)
3. For each monitoring owner: send in-app notification + email
4. Notification body: "A student self-check-in has been flagged for review. Reason: {keyword match / consecutive low mood}. Please review at your earliest convenience."
5. Notification does NOT include the student's freeform text — monitoring owner must open the dashboard to read it

---

## Hardcoded Helpline Disclaimer

The following text is HARDCODED in the frontend. It is NOT configurable, NOT removable by tenant settings, NOT stored in the database, NOT in translation files.

**Permanent disclaimer (shown on every check-in screen):**
> This is not an emergency service. If you are in immediate danger or need help right now, contact: Childline 1800 66 66 66 / text 50808 / 999.

**Post-flag warm message (shown immediately when a check-in triggers a flag):**
> Thank you for sharing how you are feeling. If you would like to talk to someone right now, you can contact:
> - Childline: 1800 66 66 66 (freephone) or text "TALK" to 50808
> - Jigsaw: jigsaw.ie
> - In an emergency: 999 or 112
>
> A member of your school's support team will check in with you. This is not a live-monitored service.

These strings are defined as constants in `packages/shared/src/pastoral/constants/helpline.ts` and imported by the frontend. They are never fetched from the database.

---

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/pastoral/checkins` | Student check-in screen: mood selector (1-5), optional text field, permanent helpline disclaimer, submit button. Shows "already submitted today" if applicable. |
| `/pastoral/checkins/history` | Student's own check-in history: list of past check-ins with mood and date. No flag information shown. |
| `/pastoral/admin/checkins` | Monitoring owner dashboard: flagged check-ins list, individual student drill-down, link to analytics. |
| `/pastoral/admin/checkins/analytics` | Aggregate analytics: year group mood trends chart, day-of-week pattern chart, exam comparison chart. "Insufficient data" placeholder when cohort too small. |
| `/settings/pastoral-checkins` | Configuration page: prerequisite checklist with status indicators, enable/disable toggle (blocked until all prerequisites met), frequency selector, keyword management, threshold settings. |

**Student check-in screen design notes:**
- Mood selector: 5-point scale with colour gradient (red-1 to green-5). Accessible labels. Minimum touch target 44x44px.
- Optional text field: single textarea, max 500 characters, placeholder "Anything you'd like to tell us? (optional)"
- Helpline disclaimer: always visible, not dismissible, high contrast
- After submission: brief confirmation ("Recorded. Thank you.") and helpline numbers if flagged (warm message above)
- Mobile-first: full-width layout, single column

---

## Test Requirements

### Unit Tests

**CheckinPrerequisiteService:**
- Returns all-false when no prerequisites configured
- Returns individual true/false for each prerequisite independently
- `validatePrerequisites()` throws 400 when monitoring ownership missing
- `validatePrerequisites()` throws 400 when monitoring hours missing
- `validatePrerequisites()` throws 400 when escalation protocol missing
- `validatePrerequisites()` throws 400 when acknowledgement is false
- `validatePrerequisites()` passes when all prerequisites met
- `validateMonitoringOwners()` throws when user ID does not exist
- `validateMonitoringOwners()` throws when user is not active staff
- Enabling `checkin_enabled = true` via config endpoint calls `validatePrerequisites()` and rejects if unmet

**CheckinService:**
- Submit check-in creates record with correct fields
- `checkin_date` is DATE only (no time component stored)
- Duplicate check-in on same day returns 409
- Weekly frequency: second check-in in same week returns 409
- Weekly frequency: check-in in new week succeeds
- Student response does not include `flag_reason` or `flag_generated_concern_id`
- Check-in rejected when `checkin_enabled = false` (returns 403)
- `mood_score` outside 1-5 range rejected by Zod validation
- `freeform_text` over 500 characters rejected by Zod validation

**CheckinAlertService:**
- Keyword match: exact keyword in text triggers flag
- Keyword match: case-insensitive matching works
- Keyword match: partial word does not match (e.g., "shortcut" does not match "cut")
- Keyword match: multi-word keyword matches (e.g., "kill myself" in longer text)
- No keyword match: clean text returns no flag
- Consecutive low: 3 consecutive lowest-score check-ins triggers flag
- Consecutive low: 2 consecutive lowest-score check-ins does NOT trigger (threshold = 3)
- Consecutive low: mixed scores (low, high, low) does NOT trigger
- Consecutive low: fewer than threshold total check-ins does NOT trigger
- Flag generates Tier 2 concern via ConcernService
- Flag records `checkin_alert_generated` audit event
- Flag enqueues notification to monitoring owners
- Out-of-hours flag sets `deliver_after` on notification job
- Within-hours flag delivers notification immediately
- Both keyword and consecutive-low can trigger independently on the same check-in (keyword takes precedence)

**CheckinAnalyticsService:**
- Year group mood trend returns correct averages
- Minimum cohort enforcement: year group with 5 students (< default 10) returns null
- Minimum cohort enforcement: year group with 10 students returns data
- Day-of-week patterns return 7 entries (or fewer if some days have no data)
- Exam comparison calculates correct before/during/after periods
- Exam comparison returns null if any sub-period has insufficient cohort
- No student IDs or names appear in any analytics response

### RLS Leakage Tests
- `pastoral_checkins`: Tenant A check-in data invisible to Tenant B query
- `pastoral_checkins`: Student A cannot read Student B's check-ins via the student API

### Permission Tests
- Student can submit check-in (authenticated student role)
- Student can read own history only
- Student cannot access `/checkins/flagged` or `/checkins/students/:id` endpoints
- Class teacher cannot access individual check-in data (even with `pastoral.view`)
- User with `pastoral.view_checkin_monitoring` can view flagged check-ins
- User with `pastoral.view_checkin_monitoring` can view individual student check-ins
- User with `pastoral.view_checkin_aggregate` can view analytics
- User without `pastoral.view_checkin_aggregate` gets 403 on analytics endpoints
- User with `pastoral.admin` can update check-in configuration
- Enabling check-ins without prerequisites met returns 400

### Integration Tests
- End-to-end: student submits check-in with flagged keyword -> concern auto-generated -> notification enqueued -> monitoring owner can see flagged check-in
- End-to-end: student submits 3 consecutive low check-ins -> consecutive-low flag triggers on 3rd -> concern auto-generated
- End-to-end: prerequisite flow -> configure prerequisites -> enable check-ins -> student submits
- Aggregate analytics: 15 students submit check-ins -> analytics returns valid trend data
- Aggregate analytics: 5 students submit check-ins -> analytics returns "insufficient data"

---

## Verification Checklist

- [ ] All prerequisites enforced before check-in enablement
- [ ] One check-in per student per day enforced by unique constraint
- [ ] Weekly frequency enforcement works correctly
- [ ] `checkin_date` stores DATE only (verified in database)
- [ ] Keyword matching is case-insensitive and word-boundary aware
- [ ] Consecutive low detection works at configurable threshold
- [ ] Flagged check-ins auto-generate Tier 2 concerns
- [ ] Student never sees flag_reason, concern linkage, or monitoring details
- [ ] Individual check-in data accessible ONLY to monitoring owners + guidance counsellor
- [ ] Class teachers cannot access individual check-ins
- [ ] Parents cannot access check-in data
- [ ] Aggregate analytics enforces minimum cohort size
- [ ] Aggregates contain no individually identifiable data
- [ ] Helpline disclaimer is hardcoded and always visible on check-in screen
- [ ] Post-flag warm message displays immediately on flagged check-in
- [ ] Out-of-hours flags queue notification for next monitoring hours start
- [ ] Audit event recorded for every flag: `checkin_alert_generated`
- [ ] All endpoints return proper pagination `{ data, meta: { page, pageSize, total } }`
- [ ] RTL-safe frontend: all logical properties (ms-, me-, ps-, pe-, start-, end-)
- [ ] Mobile responsive: usable at 375px
- [ ] RLS leakage test passes (cross-tenant isolation)
- [ ] Regression suite passes (`turbo test`)

---

## Files to Create

```
apps/api/src/modules/pastoral/checkins/
├── checkin.module.ts
├── checkin.service.ts
├── checkin-prerequisite.service.ts
├── checkin-alert.service.ts
├── checkin-analytics.service.ts
├── checkins.controller.ts
├── checkin-admin.controller.ts
├── checkin-config.controller.ts
├── checkin.service.spec.ts
├── checkin-prerequisite.service.spec.ts
├── checkin-alert.service.spec.ts
└── checkin-analytics.service.spec.ts

packages/shared/src/pastoral/
├── schemas/
│   └── checkin.schema.ts
└── constants/
    └── helpline.ts

apps/web/src/app/[locale]/(school)/pastoral/
├── checkins/
│   ├── page.tsx                          # Student check-in screen
│   └── history/page.tsx                  # Student check-in history
├── admin/
│   └── checkins/
│       ├── page.tsx                      # Monitoring owner dashboard
│       └── analytics/page.tsx            # Aggregate analytics

apps/web/src/app/[locale]/(school)/settings/
└── pastoral-checkins/page.tsx            # Configuration page

apps/web/src/components/pastoral/
├── mood-selector.tsx
├── checkin-form.tsx
├── helpline-disclaimer.tsx
├── checkin-history-list.tsx
├── flagged-checkins-table.tsx
├── mood-trend-chart.tsx
├── day-of-week-chart.tsx
└── exam-comparison-chart.tsx
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/prisma/schema.prisma` | Add `pastoral_checkins` table |
| `packages/prisma/migrations/` | New migration for `pastoral_checkins` |
| `packages/shared/src/pastoral/schemas/index.ts` | Export checkin schemas |
| `packages/shared/src/pastoral/constants/index.ts` | Export helpline constants |
| `packages/prisma/seed/permissions.ts` | Add `pastoral.view_checkin_monitoring` and `pastoral.view_checkin_aggregate` |
| `apps/api/src/modules/pastoral/pastoral.module.ts` | Import `CheckinModule` |
| `apps/worker/src/worker.module.ts` | Register `pastoral:checkin-alert-notification` processor if needed |
| Tenant settings schema (`packages/shared`) | Add checkin-related keys to `PastoralSettingsSchema` |
