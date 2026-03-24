# Attendance: Default Present Mode + Smart Tracking + AI Scan

**Date:** 2026-03-24
**Status:** Draft

---

## 1. Overview

Enhance the attendance system with seven interconnected features:

1. **Default Present Mode** — Pre-mark all students as present; teachers mark exceptions only
2. **Simplified Bulk Upload** — Exceptions-only upload with student_number + status
3. **Quick-Mark Shorthand** — Paste plain-text format instead of CSV/XLSX
4. **Undo Window** — 5-minute revert after bulk upload
5. **Smart Absence Pattern Detection** — Configurable rules that detect truancy, recurring day patterns, and chronic tardiness
6. **Parent Absence Notifications** — Immediate SMS/WhatsApp to parents when their child is marked absent, plus pattern-based alerts
7. **AI Photo Scan** — Photograph a handwritten absence sheet, AI extracts student numbers + statuses

---

## 2. Platform Infrastructure: AI Functions Module

### 2.1 Module Toggle

New module key: `ai_functions`

- Added to `TenantModule` table like any other module
- Gated by `@ModuleEnabled('ai_functions')` on AI-powered endpoints
- When disabled: all AI features hidden across the entire app (attendance scan, future AI services)
- When enabled: individual AI features appear based on their own feature-level settings

### 2.2 API Key Management

- **Platform-level only** — tenants never manage API keys
- API key stored in environment variable / secrets manager (existing pattern)
- Single Claude API key used for all tenants
- Future: usage tracking per tenant for billing (out of scope for this spec)

### 2.3 Tenant Setting

New section in `tenantSettingsSchema`:

```typescript
ai: {
  enabled: boolean  // default: false — master toggle for AI features for this tenant
}
```

The `ai_functions` module toggle controls access; this setting is the admin-facing on/off.

---

## 3. Feature 1: Default Present Mode

### 3.1 Tenant Setting

New field in `tenantSettingsSchema.attendance`:

```typescript
defaultPresentEnabled: boolean  // default: false
```

When enabled, this becomes the default behavior for all sessions. Can be overridden per session.

### 3.2 Schema Change

New column on `AttendanceSession`:

```
default_present  BOOLEAN  NULL
```

- `null` = inherit tenant setting
- `true` / `false` = explicit per-session override

### 3.3 Auto-Creation of Records

**When default_present is active for a session:**

- On session creation (manual or nightly job): immediately INSERT AttendanceRecord rows for every actively enrolled student in the class
- Status: `present`
- `marked_by_user_id`: the creating user (manual) or system user (nightly job)
- `marked_at`: creation timestamp
- Single `INSERT ... SELECT` from class enrollment for efficiency

**When default_present is NOT active:**

- Current behavior — no records until teacher marks them

### 3.4 Nightly Job Update

`attendance:generate-sessions` processor:
- After creating a session, check if default_present is active (session-level override > tenant setting)
- If active, bulk-insert present records for all enrolled students
- Idempotent: skip if records already exist (ON CONFLICT DO NOTHING)

### 3.5 Manual Marking UI

No structural change needed:
- Teacher opens session → sees all students already marked "present"
- Teacher changes only the exceptions (absent, late, left early)
- Save and submit work exactly as today

### 3.6 Session Creation UI

When tenant has `defaultPresentEnabled`:
- "Pre-mark all as present" toggle shown in create session dialog
- Defaults to ON (matching tenant setting)
- Teacher can toggle OFF for a specific session

---

## 4. Feature 2: Simplified Bulk Upload (Default Present Mode)

### 4.1 Upload Format

When default_present is active, the bulk upload switches to **exceptions-only** mode:

**Required columns:**
- `student_number` — the only identifier needed
- `status` — A (absent unexcused), AE (absent excused), L (late), LE (left early)

**Optional columns:**
- `reason` — absence/tardiness reason

The system resolves student name and class from `student_number` — no name matching needed, eliminating spelling errors.

### 4.2 Template Download

In default present mode:
- Template has headers only: `student_number, status, reason`
- No pre-populated rows — teacher fills in only exceptions

In standard mode:
- Current behavior unchanged (all enrolled students pre-populated)

### 4.3 Processing

1. Parse file (CSV/XLSX)
2. For each row: look up student by `student_number` within the tenant
3. Find their existing "present" record for the session
4. Update status to the specified value
5. Validation errors:
   - Unknown student_number → error with row number
   - Student not enrolled in any class with a session on that date → error
   - Status "P" → rejected (pointless in exceptions-only mode)
   - Missing status → error

### 4.4 Upload Scope

When uploading in default present mode, the teacher selects a **date** (not a specific session). The system:
1. Finds all sessions for that date where the student is enrolled
2. Updates the matching record(s)
3. If a student has multiple sessions that day, the status applies to ALL sessions (unless we add a session selector — keeping it simple for now)

---

## 5. Feature 3: Quick-Mark Shorthand

### 5.1 Format

Plain-text format, one student per line:

```
1045 A
1032 L
1078 AE sick
1012 LE parent pickup
```

Format: `{student_number} {status} {optional reason}`

### 5.2 Input Methods

- **Paste** into a text area on the upload page
- **Upload** as a `.txt` file
- Both options available alongside the CSV/XLSX upload

### 5.3 Processing

Same as Feature 2 — parse lines, resolve students, update records. Same validation rules apply.

### 5.4 Availability

Only shown when default_present mode is active (exceptions-only makes sense only when everyone starts as present).

---

## 6. Feature 4: Undo Window

### 6.1 Behavior

After a bulk upload (CSV/XLSX/TXT/shorthand) processes successfully:

1. Show summary: "8 students marked absent, 3 late, 1 left early"
2. Display "Undo" button with countdown timer (5 minutes)
3. If clicked: revert all modified records back to "present"
4. After 5 minutes: button disappears, changes are permanent

### 6.2 Implementation

- Store the set of modified record IDs + their previous status in a temporary server-side cache (Redis, 5-minute TTL)
- Undo endpoint: `POST /attendance/upload/undo` with the upload batch ID
- Only available to the user who performed the upload
- Only works if the session is still in "open" status

---

## 7. Feature 5: Smart Absence Pattern Detection

### 7.1 Tenant Configuration

New section in `tenantSettingsSchema.attendance`:

```typescript
patternDetection: {
  enabled: boolean                    // default: false
  excessiveAbsenceThreshold: number   // default: 5 — absences in rolling window
  excessiveAbsenceWindowDays: number  // default: 14 — rolling window size
  recurringDayThreshold: number       // default: 3 — same day missed N times
  recurringDayWindowDays: number      // default: 30 — rolling window size
  tardinessTreshold: number           // default: 4 — late marks in window
  tardinessWindowDays: number         // default: 14 — rolling window size
  parentNotificationMode: 'auto' | 'manual'  // default: 'manual'
}
```

All thresholds configurable by tenant.

### 7.2 Permission

New permission: `attendance.view_pattern_reports`

- Controls BOTH viewing pattern reports on the dashboard AND receiving notifications
- Single permission — no separate toggle for view vs notify
- Assignable to any role (principal, head of year, counselor, etc.)

### 7.3 Detection Engine

**Background job:** `attendance:detect-patterns`

- Runs daily (after all sessions for the day are expected to be submitted)
- For each student, checks:
  1. **Excessive absences**: count of absent_unexcused + absent_excused in rolling N-day window >= threshold
  2. **Recurring day pattern**: same day-of-week absent >= threshold times in rolling N-day window
  3. **Chronic tardiness**: count of "late" records in rolling N-day window >= threshold

**Output:** Creates `AttendancePatternAlert` records (new table).

### 7.4 New Table: AttendancePatternAlert

```
id                UUID PRIMARY KEY
tenant_id         UUID NOT NULL (FK tenants, RLS)
student_id        UUID NOT NULL (FK students)
alert_type        ENUM('excessive_absences', 'recurring_day', 'chronic_tardiness')
detected_date     DATE NOT NULL
window_start      DATE NOT NULL
window_end        DATE NOT NULL
details_json      JSONB NOT NULL
  -- excessive: { count, threshold, window_days }
  -- recurring: { day_of_week, count, threshold, dates: [...] }
  -- tardiness: { count, threshold, window_days }
status            ENUM('active', 'acknowledged', 'resolved') DEFAULT 'active'
acknowledged_by   UUID NULL (FK users)
acknowledged_at   TIMESTAMPTZ NULL
parent_notified   BOOLEAN DEFAULT false
parent_notified_at TIMESTAMPTZ NULL
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
```

Indexes:
- `idx_pattern_alerts_tenant_student` on (tenant_id, student_id)
- `idx_pattern_alerts_tenant_status` on (tenant_id, status)
- Unique on (tenant_id, student_id, alert_type, detected_date) to prevent duplicate alerts per day

### 7.5 Staff Notifications

When a pattern is detected:
- Create in-app notification for all users with `attendance.view_pattern_reports` permission
- Notification text: "Attendance pattern detected: {student_name} — {alert_type_description}"
- Links to the pattern reports dashboard

### 7.6 Parent Notifications (Pattern-Based)

**When `parentNotificationMode = 'auto'`:**
- System detects pattern → immediately sends notification to parent
- Via existing notification dispatch (WhatsApp → Email → In-app fallback cascade)

**When `parentNotificationMode = 'manual'`:**
- System detects pattern → flags it on staff dashboard
- Staff member clicks "Notify Parent" button → sends notification
- Button only appears for users with `attendance.view_pattern_reports`

**Parent notification content:**
- "Your child {name} has been absent {count} days in the past {window} days. Please contact the school office to discuss."
- "Your child {name} has been consistently absent on {day_name}s — {count} times in the past {window} days. Please contact the school office."
- "Your child {name} has been late {count} times in the past {window} days. Please contact the school office."

Gated by: `attendanceVisibleToParents` tenant setting must be true.

### 7.7 Exceptions Dashboard Enhancement

Existing `/attendance/exceptions` page gains a new tab/section: **"Patterns"**

- Lists all active `AttendancePatternAlert` records
- Filterable by: alert type, class, date range
- Actions: Acknowledge, Resolve, Notify Parent (if manual mode)
- Only visible to users with `attendance.view_pattern_reports`

---

## 8. Feature 6: Immediate Parent Absence Notification

### 8.1 Behavior

When a student's attendance record is changed FROM "present" TO any absence status (absent_unexcused, absent_excused, late, left_early):
- Immediately send SMS/WhatsApp notification to the student's parent(s)
- Uses existing notification dispatch infrastructure (WhatsApp → Email → In-app fallback)

### 8.2 Tenant Configuration

New field in `tenantSettingsSchema.attendance`:

```typescript
notifyParentOnAbsence: boolean  // default: false
```

Additional existing gate: `attendanceVisibleToParents` must also be true.

### 8.3 Notification Content

Templates (new `template_key` values):

- `attendance.absent_unexcused`: "Your child {student_name} was marked absent (unexcused) on {date}. If this is unexpected, please contact the school office."
- `attendance.absent_excused`: "Your child {student_name} was marked absent (excused) on {date}."
- `attendance.late`: "Your child {student_name} was marked late on {date}."
- `attendance.left_early`: "Your child {student_name} left school early on {date}."

Bilingual: templates exist in both English and Arabic.

### 8.4 Trigger Points

Notification fires when:
1. A teacher saves/submits attendance with a non-present status (manual marking)
2. A bulk upload changes a record from present to non-present
3. An amendment changes a record to a non-present status

Notification does NOT fire when:
- A record is created directly as non-present (no default_present mode — teacher marked it from scratch, no "change" occurred)
- Actually, reconsidering: it SHOULD fire on any non-present mark regardless of default_present mode. If a student is absent, the parent should know.

### 8.5 Deduplication

- One notification per student per session per day
- If a record is changed multiple times (e.g., absent → late → absent), only the first notification fires
- Tracked via `source_entity_type = 'attendance_record'` + `source_entity_id` on the Notification table

### 8.6 New Notification Types

Add to `NOTIFICATION_TYPES`:
- `attendance.absent` — parent notification on absence marking
- `attendance.late` — parent notification on late marking
- `attendance.left_early` — parent notification on early departure

These appear in the tenant's notification settings page, allowing per-type channel configuration.

---

## 9. Feature 7: AI Photo Scan

### 9.1 Prerequisites

- `ai_functions` module must be enabled for the tenant
- `attendance.manage` permission required

### 9.2 Flow

1. Teacher navigates to attendance upload page
2. Clicks "Scan Absence Sheet" (only visible if AI Functions enabled)
3. Takes photo or uploads image of handwritten absence sheet
4. Image sent to backend → background job processes via Claude Vision API
5. AI extracts: student numbers + statuses from the image
6. Returns structured data for confirmation:
   ```
   Detected 5 entries:
   ✓ 1045 — Absent (unexcused)
   ✓ 1032 — Late
   ✓ 1078 — Absent (excused)
   ⚠ 10?? — Could not read student number (row 4)
   ✓ 1012 — Left early
   ```
7. Teacher reviews, corrects any misreads, confirms
8. System processes confirmed entries (same as bulk upload)

### 9.3 Backend

**New endpoint:** `POST /attendance/scan`
- Accepts: multipart image (JPEG, PNG, HEIC — max 10MB)
- Gated: `@ModuleEnabled('ai_functions')` + `@RequiresPermission('attendance.manage')`
- Returns: parsed entries with confidence indicators

**Processing:**
- Enqueue BullMQ job: `attendance:scan-absence-sheet`
- Job payload: `{ tenant_id, image_path, session_date, uploaded_by_user_id }`
- Worker: sends image to Claude Vision API with structured prompt
- Prompt instructs the model to extract student_number + status pairs
- Response parsed into structured format with confidence scores

**Claude Vision Prompt (system):**
```
You are reading a handwritten school attendance/absence sheet. Extract each student entry as:
- student_number: the student's ID number
- status: one of "absent", "absent_excused", "late", "left_early"
- reason: any written reason (optional)
- confidence: "high" or "low" based on handwriting clarity

Return as JSON array. If a number is unclear, include your best guess with confidence: "low".
```

### 9.4 Confirmation UI

- Table showing extracted entries
- Each row: student_number (editable), resolved student name, status (dropdown), reason, confidence badge
- Low-confidence entries highlighted in amber
- Unresolved student numbers highlighted in red
- "Confirm & Apply" button → processes like a normal bulk upload
- "Cancel" button → discards scan results

### 9.5 Cost & Rate Limiting

- Estimated cost: $0.01–0.05 per scan (Claude Vision API)
- Rate limit: configurable per tenant (default: 50 scans/day)
- Platform-level daily budget cap (configurable in environment)

---

## 10. Late Arrival Time Tracking (Enhancement #6 from brainstorm)

### 10.1 Schema Change

New nullable column on `AttendanceRecord`:

```
arrival_time  TIME NULL
```

Only populated when status = `late`.

### 10.2 UI

- When teacher selects "Late" status, an optional time picker appears
- Pre-filled with current time
- Stored as HH:MM

### 10.3 Reporting

Enables future reports:
- Average tardiness per student
- Minutes lost per class
- Out of scope for this spec — just capturing the data

---

## 11. Settings UI Changes

### 11.1 Attendance Settings Section (existing page)

New fields added to the attendance collapsible section:

- **Default Present Mode** — toggle (defaultPresentEnabled)
- **Notify Parent on Absence** — toggle (notifyParentOnAbsence)
- **Pattern Detection** — sub-section (collapsible):
  - Enabled toggle
  - Excessive absence: threshold + window days
  - Recurring day: threshold + window days
  - Tardiness: threshold + window days
  - Parent notification mode: Auto / Manual (radio)

### 11.2 AI Functions (new settings section)

Only visible if `ai_functions` module is enabled:
- **AI Functions Enabled** — master toggle
- Description: "Enable AI-powered features such as handwritten attendance scanning"

### 11.3 Notification Settings Page

New notification types appear:
- `attendance.absent` — "Parent notified when child marked absent"
- `attendance.late` — "Parent notified when child marked late"
- `attendance.left_early` — "Parent notified when child leaves early"
- `attendance.pattern_detected` — "Staff notified of attendance pattern alerts"

Each configurable with channel toggles (SMS, WhatsApp, Email, In-app).

---

## 12. New Permission

```typescript
attendance: {
  // ... existing permissions ...
  view_pattern_reports: 'attendance.view_pattern_reports'  // View patterns + receive notifications
}
```

---

## 13. New Background Jobs

| Job Name | Queue | Trigger | Purpose |
|----------|-------|---------|---------|
| `attendance:detect-patterns` | attendance | Daily (configurable hour) | Run pattern detection for all students |
| `attendance:scan-absence-sheet` | attendance | On upload | Process photo via Claude Vision API |
| `attendance:notify-parent-absence` | notifications | On record change | Send immediate absence notification to parent |

All jobs include `tenant_id` in payload. All processors extend `TenantAwareJob`.

---

## 14. Migration Summary

### New columns:
- `attendance_sessions.default_present` (BOOLEAN NULL)
- `attendance_records.arrival_time` (TIME NULL)

### New table:
- `attendance_pattern_alerts` (with RLS policy)

### New enum:
- `AttendanceAlertType`: `excessive_absences`, `recurring_day`, `chronic_tardiness`
- `AttendanceAlertStatus`: `active`, `acknowledged`, `resolved`

### New notification templates:
- `attendance.absent`, `attendance.absent_excused`, `attendance.late`, `attendance.left_early` (EN + AR)
- `attendance.pattern_detected` (EN + AR)

### New notification types:
- `attendance.absent`, `attendance.late`, `attendance.left_early`, `attendance.pattern_detected`

### Tenant settings schema additions:
- `attendance.defaultPresentEnabled`
- `attendance.notifyParentOnAbsence`
- `attendance.patternDetection` (full sub-object)
- `ai.enabled`

### New module key:
- `ai_functions`

### New permission:
- `attendance.view_pattern_reports`
