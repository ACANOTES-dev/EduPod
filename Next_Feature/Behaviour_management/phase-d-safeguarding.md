# Phase D: Safeguarding — Implementation Spec

> **Phase**: D of H
> **Scope**: Inspection-grade safeguarding chronicle with SLA tracking, break-glass access, and evidence management
> **Prerequisite phases**: A (schema, entity_history, data classification framework)
> **Controllers**: `safeguarding.controller.ts`
> **Service**: `safeguarding.service.ts`
> **Worker jobs**: 4 (attachment-scan, break-glass-expiry, sla-check, critical-escalation)
> **Endpoints**: 18
> **Frontend pages**: 5 + 1 settings page

---

## Prerequisites

Phase D depends on Phase A being fully complete:

- All 32 tables exist in the database with RLS policies applied
- `behaviour_entity_history` is live and used for incident/sanction audit trails
- Data classification framework (`DataClassification` enum, `stripFieldsByClassification`) is in `packages/shared/`
- `behaviour_attachments` table exists (Phase A schema — Phase D activates the upload/download pipeline and ClamAV scanning)
- `behaviour_tasks` table and task creation service are live
- Permission guards for `safeguarding.report`, `safeguarding.view`, `safeguarding.manage`, `safeguarding.seal` are registered
- `SequenceService` is live (used to generate `CP-XXXXXX` concern numbers)
- Notification infrastructure (comms module) is live for the escalation chain
- `tenant_settings.behaviour` JSONB keys for safeguarding (`designated_liaison_user_id`, `deputy_designated_liaison_user_id`, `dlp_fallback_chain`, `safeguarding_sla_*_hours`, `safeguarding_retention_years`) are schema-validated and accessible

---

## Objectives

1. Implement the full safeguarding concern lifecycle from first report through seal
2. SLA clocks that count wall-clock hours (not school days) with configurable per-severity thresholds
3. Critical concern escalation chain: DLP → 30 min → deputy DLP → 30 min → principal
4. Reporter acknowledgement view: reporters see status updates but never case detail
5. ClamAV attachment pipeline: no file is downloadable until scan confirms clean
6. Immutable case file PDF (watermarked + SHA-256) and redacted export variant
7. Seal with dual-control: two users with `safeguarding.seal` must confirm; irreversible in-app
8. Break-glass access: principal-granted, time-bounded, every record view audit-logged, mandatory after-action review on expiry
9. `converted_to_safeguarding` status projection: non-safeguarding users see `closed` with reason "Referred internally"

---

## Tables

These tables were created in Phase A. Phase D activates their full business logic. Definitions are reproduced here for implementer self-sufficiency.

### `safeguarding_concerns`

No delete operation exists in the codebase. Records can only progress toward `sealed`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_number` | VARCHAR(20) NOT NULL | Sequence: `CP-000001` via `SequenceService` |
| `student_id` | UUID FK NOT NULL | -> `students` |
| `reported_by_id` | UUID FK NOT NULL | -> `users` |
| `concern_type` | ENUM('physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect', 'self_harm', 'bullying', 'online_safety', 'domestic_violence', 'substance_abuse', 'mental_health', 'radicalisation', 'other') NOT NULL | |
| `severity` | ENUM('low', 'medium', 'high', 'critical') NOT NULL | Determines SLA clock |
| `status` | ENUM('reported', 'acknowledged', 'under_investigation', 'referred', 'monitoring', 'resolved', 'sealed') NOT NULL DEFAULT 'reported' | |
| `description` | TEXT NOT NULL | Visibility: SAFEGUARDING only |
| `immediate_actions_taken` | TEXT NULL | Actions at point of report |
| `designated_liaison_id` | UUID FK NULL | -> `users` — DLP assigned to this case |
| `assigned_to_id` | UUID FK NULL | -> `users` — investigator |
| `is_tusla_referral` | BOOLEAN NOT NULL DEFAULT false | |
| `tusla_reference_number` | VARCHAR(50) NULL | |
| `tusla_referred_at` | TIMESTAMPTZ NULL | |
| `tusla_outcome` | TEXT NULL | |
| `is_garda_referral` | BOOLEAN NOT NULL DEFAULT false | |
| `garda_reference_number` | VARCHAR(50) NULL | |
| `garda_referred_at` | TIMESTAMPTZ NULL | |
| `resolution_notes` | TEXT NULL | |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `reporter_acknowledgement_sent_at` | TIMESTAMPTZ NULL | Timestamp DLP sent acknowledgement to reporter |
| `reporter_acknowledgement_status` | ENUM('received', 'assigned', 'under_review') NULL | What the reporter is shown |
| `sla_first_response_due` | TIMESTAMPTZ NULL | Auto-set at creation by severity (wall-clock hours) |
| `sla_first_response_met_at` | TIMESTAMPTZ NULL | Set when status transitions to `acknowledged` |
| `sealed_at` | TIMESTAMPTZ NULL | |
| `sealed_by_id` | UUID FK NULL | -> `users` — first sealer |
| `sealed_reason` | TEXT NULL | Mandatory |
| `seal_approved_by_id` | UUID FK NULL | -> `users` — second approver (dual-control) |
| `retention_until` | DATE NULL | Default: 25 years from student DOB. Set at creation |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**UNIQUE**: `(tenant_id, concern_number)`.

**Indexes**:
- `(tenant_id, status)` — dashboard queries
- `(tenant_id, severity, status)` — SLA worker
- `(tenant_id, student_id)` — student history
- `(tenant_id, reported_by_id)` — my-reports
- `(tenant_id, sla_first_response_due) WHERE sla_first_response_met_at IS NULL` — SLA check worker
- `(tenant_id, assigned_to_id, status)` — task views

**RLS Policy** (already applied in Phase A):
```sql
CREATE POLICY safeguarding_concerns_tenant_isolation ON safeguarding_concerns
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

### `safeguarding_actions`

Append-only chronological log. No UPDATE, no DELETE.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_id` | UUID FK NOT NULL | -> `safeguarding_concerns` |
| `action_by_id` | UUID FK NOT NULL | -> `users` |
| `action_type` | ENUM('note_added', 'status_changed', 'assigned', 'meeting_held', 'parent_contacted', 'agency_contacted', 'tusla_referred', 'garda_referred', 'document_uploaded', 'document_downloaded', 'review_completed') NOT NULL | |
| `description` | TEXT NOT NULL | |
| `metadata` | JSONB NOT NULL DEFAULT '{}' | Type-specific data (e.g. old/new status, referral number, document id) |
| `due_date` | TIMESTAMPTZ NULL | For action items with deadlines |
| `is_overdue` | BOOLEAN NOT NULL DEFAULT false | Set by SLA worker |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | Append-only — no `updated_at` |

**Indexes**:
- `(tenant_id, concern_id, created_at DESC)` — case file chronology
- `(tenant_id, action_by_id, created_at DESC)` — staff activity

**Enforcement**: No UPDATE or DELETE statements on this table anywhere in the codebase. ESLint rule or code review gate. Every new entry is created with INSERT only.

---

### `safeguarding_concern_incidents`

Join table linking a safeguarding concern to the behaviour incidents that relate to it.
Access requires `safeguarding.view` — this table is completely invisible from the behaviour side.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `concern_id` | UUID FK NOT NULL | -> `safeguarding_concerns` |
| `incident_id` | UUID FK NOT NULL | -> `behaviour_incidents` |
| `linked_by_id` | UUID FK NOT NULL | -> `users` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**UNIQUE**: `(concern_id, incident_id)`.

**Index**: `(tenant_id, concern_id)` — list incidents for a concern.

**Behaviour-side isolation**: When the behaviour service queries `behaviour_incidents`, it MUST NOT join to `safeguarding_concern_incidents`. The concern number is never exposed in behaviour responses. Incidents with `status = 'converted_to_safeguarding'` are projected as `status = 'closed'` for all users without `safeguarding.view`. See status projection rules below.

---

### `safeguarding_break_glass_grants`

Break-glass access with mandatory post-access governance.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `granted_to_id` | UUID FK NOT NULL | -> `users` — the user receiving temporary access |
| `granted_by_id` | UUID FK NOT NULL | -> `users` — MUST hold `safeguarding.seal` (principal) |
| `reason` | TEXT NOT NULL | Mandatory justification |
| `scope` | ENUM('all_concerns', 'specific_concerns') NOT NULL DEFAULT 'all_concerns' | |
| `scoped_concern_ids` | UUID[] NULL | Required when scope = 'specific_concerns' |
| `granted_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `expires_at` | TIMESTAMPTZ NOT NULL | Max 72 hours from `granted_at`. Enforced at service layer |
| `revoked_at` | TIMESTAMPTZ NULL | Set by cron on expiry or manual revocation |
| `after_action_review_required` | BOOLEAN NOT NULL DEFAULT true | |
| `after_action_review_completed_at` | TIMESTAMPTZ NULL | |
| `after_action_review_by_id` | UUID FK NULL | -> `users` |
| `after_action_review_notes` | TEXT NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**Indexes**:
- `(tenant_id, granted_to_id, expires_at) WHERE revoked_at IS NULL` — active grant check
- `(tenant_id, expires_at) WHERE revoked_at IS NULL` — expiry cron
- `(tenant_id, after_action_review_required, after_action_review_completed_at) WHERE after_action_review_required = true AND after_action_review_completed_at IS NULL` — overdue review detection

---

### `behaviour_attachments`

Shared across all behaviour entities. Phase D activates the full ClamAV pipeline for `entity_type = 'safeguarding_concern'` and `'safeguarding_action'`. Table definition reproduced for completeness.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `tenant_id` | UUID FK NOT NULL | RLS |
| `entity_type` | ENUM('incident', 'sanction', 'intervention', 'safeguarding_concern', 'safeguarding_action', 'appeal', 'exclusion_case') NOT NULL | |
| `entity_id` | UUID NOT NULL | FK to the parent entity |
| `uploaded_by_id` | UUID FK NOT NULL | -> `users` |
| `file_name` | VARCHAR(255) NOT NULL | Original filename |
| `file_key` | VARCHAR(500) NOT NULL | S3 object key |
| `file_size_bytes` | BIGINT NOT NULL | |
| `mime_type` | VARCHAR(100) NOT NULL | |
| `sha256_hash` | VARCHAR(64) NOT NULL | Computed before upload, verified on download |
| `classification` | ENUM('staff_statement', 'student_statement', 'parent_letter', 'meeting_minutes', 'screenshot', 'photo', 'scanned_document', 'referral_form', 'return_agreement', 'behaviour_contract', 'medical_report', 'agency_correspondence', 'other') NOT NULL | |
| `description` | VARCHAR(500) NULL | |
| `visibility` | ENUM('staff_all', 'pastoral_only', 'management_only', 'safeguarding_only') NOT NULL DEFAULT 'staff_all' | For safeguarding entities always 'safeguarding_only' |
| `is_redactable` | BOOLEAN NOT NULL DEFAULT false | If true, redacted export shows "[Document withheld]" |
| `retention_status` | ENUM('active', 'archived', 'marked_for_deletion', 'retained_legal_hold') NOT NULL DEFAULT 'active' | |
| `retained_until` | DATE NULL | |
| `scan_status` | ENUM('pending', 'clean', 'infected', 'scan_failed') NOT NULL DEFAULT 'pending' | File NOT downloadable until 'clean' |
| `scanned_at` | TIMESTAMPTZ NULL | |
| `version` | INT NOT NULL DEFAULT 1 | |
| `replaced_by_id` | UUID FK NULL | -> `behaviour_attachments` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

**S3 configuration for safeguarding attachments**:
- SSE-S3 encryption (AES-256)
- `Content-Disposition: attachment`
- ACL: private (no public access)
- S3 Object Lock: GOVERNANCE mode, retention period = `tenant_settings.behaviour.safeguarding_retention_years` × 365 days from upload date

**Indexes**:
- `(tenant_id, entity_type, entity_id)` — list attachments for entity
- `(tenant_id, scan_status) WHERE scan_status = 'pending'` — scan backlog
- `(tenant_id, entity_type, scan_status)` — safeguarding-scoped scan queries

---

## Infrastructure Requirements

### ClamAV Daemon

ClamAV must be running on the Hetzner production server before Phase D is deployed.

**Setup**:
```bash
apt-get install -y clamav clamav-daemon
systemctl enable clamav-daemon
systemctl start clamav-daemon
freshclam   # Initial virus definition update
```

**Configuration** (`/etc/clamav/clamd.conf`):
```
LocalSocket /var/run/clamav/clamd.ctl
MaxFileSize 10M
MaxScanSize 10M
FollowDirectorySymlinks false
FollowFileSymlinks false
ReadTimeout 30
```

**Resource footprint**: ~200 MB RAM at idle. Scan throughput: ~50 MB/s. Definition updates: `cron 0 2 * * * /usr/bin/freshclam --quiet`.

**Node.js integration**: Use `clamdjs` npm package (or equivalent `clamscan`) to stream file bytes to the ClamAV socket. The worker reads the S3 object as a stream and pipes it to ClamAV — the file is never written to local disk.

**Production verification** (pre-deploy checklist):
1. `echo "Test" | clamdscan --stream -` returns `stdin: OK`
2. EICAR test file returns `Eicar-Test-Signature FOUND`
3. ClamAV socket path matches worker config
4. `systemctl status clamav-daemon` shows `Active: running`

### S3 Object Lock

S3 Object Lock must be enabled on the bucket (or a separate bucket for safeguarding) before Phase D is deployed. Object Lock **cannot be enabled after bucket creation**.

**Options**:
1. Enable Object Lock on existing bucket if it was created with lock capability
2. Create `{tenant}-safeguarding` prefix on a lock-enabled bucket
3. Use a dedicated `edupod-safeguarding` bucket with Object Lock enabled at creation

**Configuration**:
- Mode: `GOVERNANCE` (allows override by S3 admin for corrections; `COMPLIANCE` prevents all deletion including by admins — use GOVERNANCE for operational flexibility)
- Retention: Set per object at upload time via `ObjectLockRetainUntilDate`
- Formula: `upload_date + (safeguarding_retention_years × 365 days)`

**Verification**: Upload a test object with Object Lock, attempt deletion, confirm `AccessDenied`.

---

## Business Logic

### 1. Safeguarding Permission Model

Four distinct permissions in the safeguarding domain:

| Permission | Holders | Capabilities |
|------------|---------|--------------|
| `safeguarding.report` | All staff (default) | Create a concern. View own reports' `reporter_acknowledgement_status` only — no case detail |
| `safeguarding.view` | DLP, Deputy DLP, Principal | View all concern detail, action history, attachments. Every view is audit-logged |
| `safeguarding.manage` | DLP, Principal | Update concerns, record actions, record referrals, upload attachments |
| `safeguarding.seal` | Principal + designated second (must be two distinct users) | Initiate seal (first user) and approve seal (second user). Irreversible |

**Permission checks are enforced at the service layer**, not just controller guards. Every method in `SafeguardingService` that touches concern data calls `this.checkPermission(userId, 'safeguarding.view')` before any query and emits an audit log entry.

**Every access to a concern is audit-logged** via the platform audit log, with:
```typescript
{
  action: 'safeguarding_concern_viewed',
  entity_type: 'safeguarding_concern',
  entity_id: concernId,
  user_id: requestingUserId,
  context: isBreakGlass ? 'break_glass' : 'normal',
  break_glass_grant_id: isBreakGlass ? grantId : null,
}
```

**Break-glass access**: A user without `safeguarding.view` who has an active, unexpired `safeguarding_break_glass_grants` record may access concerns within the grant scope. Every record they view is logged with `context: 'break_glass'` and the grant ID.

---

### 2. Concern Lifecycle

**Status machine** (enforced in `SafeguardingService.transitionStatus`):

```
reported          -> acknowledged           (DLP acknowledges the report)
acknowledged      -> under_investigation    (DLP begins formal investigation)
under_investigation -> referred             (external referral to Tusla or Garda)
under_investigation -> monitoring           (ongoing monitoring, no immediate referral)
under_investigation -> resolved             (investigation concluded)
referred          -> monitoring             (post-referral monitoring phase)
referred          -> resolved               (closed after referral process)
monitoring        -> resolved               (monitoring period ended)
resolved          -> sealed                 (dual-control seal — IRREVERSIBLE)

Resolved is a soft terminal — new related information creates a NEW linked concern.
Sealed is hard terminal — no further transitions possible in application.
```

**On `reported` (creation)**:
1. Generate concern number via `SequenceService` (prefix: `CP`)
2. Set `sla_first_response_due` based on severity and current wall-clock time:
   - `critical`: `NOW() + settings.safeguarding_sla_critical_hours` (default 4h)
   - `high`: `NOW() + settings.safeguarding_sla_high_hours` (default 24h)
   - `medium`: `NOW() + settings.safeguarding_sla_medium_hours` (default 72h)
   - `low`: `NOW() + settings.safeguarding_sla_low_hours` (default 168h / 7 days)
3. Set `retention_until = student.date_of_birth + 25 years` (or tenant override)
4. Create `safeguarding_actions` entry: `action_type = 'status_changed'`, `description = 'Concern reported'`
5. Notify DLP via `safeguarding_concern_reported` notification
6. If `severity = 'critical'`: immediately enqueue `safeguarding:critical-escalation` job
7. Record in `behaviour_entity_history` (entity_type = implied by safeguarding concerns — use `entity_type = 'incident'` only if linking; safeguarding concerns have their own action log, not entity_history)

**On `acknowledged`**:
1. Set `sla_first_response_met_at = NOW()`
2. Set `reporter_acknowledgement_status = 'assigned'`
3. Send `safeguarding_reporter_ack` notification to `reported_by_id`
4. Create `safeguarding_actions` entry: `action_type = 'status_changed'`

**On `under_investigation`**:
1. Set `reporter_acknowledgement_status = 'under_review'`
2. Create `safeguarding_actions` entry

**On any status transition**:
- Create `safeguarding_actions` entry with `action_type = 'status_changed'` and `metadata = { from: old_status, to: new_status }`
- Reason is mandatory for all transitions; stored in the action `description`

---

### 3. Reporter Acknowledgement Workflow

A reporter with only `safeguarding.report` may query `GET v1/safeguarding/my-reports` and sees:

```typescript
{
  concern_number: 'CP-000042',
  concern_type: 'physical_abuse',  // their own input — they know what they reported
  reported_at: '2025-11-14T09:32:00Z',
  reporter_acknowledgement_status: 'assigned' | 'received' | 'under_review' | null,
  // NO: student name, description, actions, assigned_to, referral status, attachments
}
```

The `reporter_acknowledgement_status` field on the concern is the ONLY information surfaced to a non-privileged reporter. They see no concern detail, no investigation notes, no referral outcome.

**Status labels rendered in UI**:
- `received` → "Your report has been received"
- `assigned` → "Your report has been assigned to a designated liaison"
- `under_review` → "Your report is under review"
- `null` (not yet acknowledged) → "Awaiting acknowledgement"

---

### 4. SLA Tracking

SLA deadlines count **wall-clock hours**. Safeguarding does not pause for weekends, bank holidays, or school closures. This is a deliberate child safety requirement.

**SLA calculation at creation**:
```typescript
function computeSlaDeadline(severity: 'critical' | 'high' | 'medium' | 'low', settings: BehaviourSettings): Date {
  const now = new Date();
  const hoursMap = {
    critical: settings.safeguarding_sla_critical_hours,   // default 4
    high:     settings.safeguarding_sla_high_hours,       // default 24
    medium:   settings.safeguarding_sla_medium_hours,     // default 72
    low:      settings.safeguarding_sla_low_hours,        // default 168
  };
  return addHours(now, hoursMap[severity]);
}
```

**SLA worker** (`safeguarding:sla-check`, every 30 minutes):
1. Query all concerns where `sla_first_response_met_at IS NULL AND sla_first_response_due < NOW()`
2. For each: create or update a `behaviour_tasks` record (`task_type = 'safeguarding_action'`, priority = `urgent`, title = "SLA BREACH: [concern_number] — [severity] concern overdue")
3. Send `safeguarding_sla_breach` notification to DLP + deputy DLP
4. Mark relevant `safeguarding_actions` rows as `is_overdue = true`

**SLA breach detection is additive** — the worker does not modify the concern record itself. Breach is surfaced as a task and notification. The original `sla_first_response_due` is preserved for audit.

---

### 5. Critical Concern Escalation Chain

When `severity = 'critical'` and a new concern is created, enqueue `safeguarding:critical-escalation` immediately (not deferred).

**Escalation chain logic** (in the job processor):
```
Step 1 — On concern creation:
  - Send `safeguarding_concern_reported` push notification to designated_liaison_user_id (DLP)
  - Schedule next check in 30 minutes

Step 2 — 30 minutes later, if concern is still `reported` (not `acknowledged`):
  - Send `safeguarding_critical_escalation` push notification to deputy_designated_liaison_user_id (Deputy DLP)
  - Schedule next check in 30 minutes

Step 3 — 60 minutes after creation, if concern is still `reported`:
  - Send `safeguarding_critical_escalation` push notification to principal (from dlp_fallback_chain[0])
  - If dlp_fallback_chain has more entries, continue escalating every 30 minutes
  - Log each escalation in safeguarding_actions
```

**Settings keys used**:
- `tenant_settings.behaviour.designated_liaison_user_id` — DLP
- `tenant_settings.behaviour.deputy_designated_liaison_user_id` — Deputy DLP
- `tenant_settings.behaviour.dlp_fallback_chain` — ordered array of user IDs after deputy

**Safeguard**: If all chain members are the same person, or a chain member has no push token, escalation logs the failure and continues to the next available recipient.

**Termination**: Once `status != 'reported'` (i.e., acknowledged), the escalation job stops. The job checks current status from DB at each step.

---

### 6. Break-Glass Access

Break-glass is an emergency mechanism for situations where a staff member needs temporary access to safeguarding records but does not hold `safeguarding.view`.

**Grant (principal only)**:
1. Principal calls `POST v1/safeguarding/break-glass` with: `granted_to_id`, `reason`, `duration_hours` (max 72), `scope` ('all_concerns' or 'specific_concerns'), optionally `scoped_concern_ids`
2. Service validates: `granted_by_id` must hold `safeguarding.seal`
3. `expires_at = NOW() + duration_hours`
4. `safeguarding_break_glass_grants` record created
5. Notification sent to DLP + principal confirming the grant
6. `safeguarding_actions` entry created on all scoped concerns (or a global grant log entry) with `action_type = 'note_added'`, description records the grant

**During access**:
- Before serving any safeguarding response, `SafeguardingService` calls `checkEffectivePermission(userId, tenantId)`:
  ```typescript
  async function checkEffectivePermission(userId, tenantId, concernId?) {
    // 1. Check normal safeguarding.view permission
    if (userHasPermission(userId, 'safeguarding.view')) return { allowed: true, context: 'normal' };
    // 2. Check active break-glass grant
    const grant = await tx.safeguarding_break_glass_grants.findFirst({
      where: {
        tenant_id: tenantId,
        granted_to_id: userId,
        revoked_at: null,
        expires_at: { gt: new Date() },
        OR: [
          { scope: 'all_concerns' },
          { scope: 'specific_concerns', scoped_concern_ids: { has: concernId } },
        ],
      },
    });
    if (grant) return { allowed: true, context: 'break_glass', grantId: grant.id };
    return { allowed: false };
  }
  ```
- Every safeguarding record viewed under break-glass is audit-logged with `context: 'break_glass'` and `break_glass_grant_id`

**On expiry (cron every 5 minutes, `behaviour:break-glass-expiry` job)**:
1. Query all grants where `expires_at < NOW() AND revoked_at IS NULL`
2. For each:
   a. Set `revoked_at = NOW()` on the grant record
   b. Send `safeguarding_break_glass_review` notification to DLP + principal
   c. Create `behaviour_tasks` record: `task_type = 'break_glass_review'`, `entity_type = 'break_glass_grant'`, `entity_id = grant.id`, priority = `high`, `due_date = NOW() + 7 school days`
   d. Task description includes: user name, duration of access, number of concerns viewed, list of concern numbers accessed
3. Record `behaviour_entity_history` entry for the grant: `change_type = 'break_glass_expired'`

**After-action review**:
- The task assigned to DLP (or principal) requires them to open the review interface at `/safeguarding/concerns` and mark each accessed concern as "access appropriate" or "access inappropriate"
- `after_action_review_completed_at` is set when the review is completed
- `after_action_review_notes` captures the DLP's assessment
- If review not completed within 7 school days: task escalates to `priority = urgent`, re-notification sent

---

### 7. Seal (Dual-Control)

Sealing is **irreversible**. No API exists to unseal a concern. Records remain permanently readable by `safeguarding.view` holders but cannot be further edited.

**Two-step dual-control process**:

Step 1 — Initiator calls `POST v1/safeguarding/concerns/:id/seal/initiate`:
- Requester must hold `safeguarding.seal`
- Body: `{ reason: string }`
- Service records `sealed_by_id = userId`, `sealed_reason = reason` on the concern
- Status does NOT change yet — still `resolved`
- Creates a `behaviour_tasks` entry: `task_type = 'safeguarding_action'`, assigned to a second `safeguarding.seal` holder, title = "Seal approval required: [concern_number]", due_date = 7 days

Step 2 — Approver calls `POST v1/safeguarding/concerns/:id/seal/approve`:
- Requester must hold `safeguarding.seal`
- `seal_approved_by_id` MUST be different from `sealed_by_id` — enforced at service layer
- Body: `{ confirmation: true }` (explicit acknowledgement)
- Service sets: `status = 'sealed'`, `sealed_at = NOW()`, `seal_approved_by_id = userId`
- Creates `safeguarding_actions` entry: `action_type = 'status_changed'`, `metadata = { from: 'resolved', to: 'sealed', initiated_by: sealed_by_id, approved_by: userId }`
- Task marked complete

**Post-seal**:
- All `PATCH` operations return `403 Forbidden` with message "Concern is sealed and cannot be modified"
- `GET` operations remain available to `safeguarding.view` holders
- Exports remain available
- The word "SEALED" appears as a permanent banner on the concern UI

---

### 8. Document Chronology and Export

All actions are written to `safeguarding_actions` in real time, building an inspection-ready chronology. The case file PDF assembles this chronology into a formal document.

**Case file PDF (watermarked, SHA-256)**:

Generated via `POST v1/safeguarding/concerns/:id/case-file`:

1. Load concern + all `safeguarding_actions` ordered by `created_at ASC`
2. Load all `behaviour_attachments` for this concern (only `scan_status = 'clean'` attachments are included)
3. Render HTML template with:
   - Header: concern number, student (by reference code if redacted), severity, status, dates
   - Chronological action log with timestamps, actor roles, action types, descriptions
   - Referral details (Tusla/Garda reference numbers, dates)
   - Attachment manifest (list only — attachments not embedded in PDF)
   - Footer watermark: "CONFIDENTIAL — Generated by [user display name] ([role]) on [datetime] — [tenant name]"
   - Final page: SHA-256 hash of the preceding content
4. Generate PDF via `PdfRenderingService` (Puppeteer + Noto Sans Arabic)
5. Compute SHA-256 of the generated PDF bytes
6. Upload to S3 with Object Lock
7. Record in `behaviour_attachments` with `classification = 'other'`, `visibility = 'safeguarding_only'`
8. Return pre-signed URL (15-minute expiry)
9. Create `safeguarding_actions` entry: `action_type = 'document_uploaded'`, `metadata = { document_type: 'case_file', sha256: hash }`

**Redacted export** (`POST v1/safeguarding/concerns/:id/case-file/redacted`):

Same pipeline with these substitutions applied before render:
- Student name → reference code derived from `SHA-256(student_id)[0:8]` (e.g. `STU-4a7c2b1e`)
- Staff names → their role title (e.g. "Deputy Principal", "Class Teacher")
- `is_redactable = true` attachments → "[Document withheld — redacted export]"
- Referral numbers → "[Reference withheld]"
- Watermark adds: "— REDACTED VERSION"

---

### 9. ClamAV Attachment Pipeline (Full)

This pipeline applies to ALL `behaviour_attachments` uploads, but Phase D activates it. Safeguarding attachments require clean scan before any access.

**Upload pipeline** (enforced in `AttachmentService.upload`):

```
1. Validate file size: <= 10 MB. Reject with 413 if exceeded.

2. Validate extension: allowlist only.
   Allowed: .pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png, .gif, .mp4, .mov, .mp3, .wav, .txt
   Reject any other extension with 422.

3. Validate MIME type:
   - Check Content-Type header matches extension
   - Read first 512 bytes and verify magic bytes match declared MIME
   - Reject mismatch with 422.

4. Compute SHA-256 hash of the full file bytes.

5. Upload to S3:
   - Key: {tenant_id}/attachments/{entity_type}/{entity_id}/{uuid}.{ext}
   - Encryption: SSE-S3 (AES-256)
   - Content-Disposition: attachment; filename="{original_filename}"
   - If entity_type IN ('safeguarding_concern', 'safeguarding_action'):
     Apply Object Lock: GOVERNANCE mode, RetainUntilDate = (now + retention_years * 365 days)

6. Create `behaviour_attachments` record:
   - scan_status = 'pending'
   - sha256_hash = computed hash
   - visibility = 'safeguarding_only' (if safeguarding entity)

7. Enqueue BullMQ job: behaviour:attachment-scan
   payload: { tenant_id, attachment_id, file_key }

8. Return HTTP 202 Accepted with attachment_id.
   The attachment is NOT immediately downloadable.
```

**Scan job** (`behaviour:attachment-scan`):

```
1. Load attachment record from DB.
2. Stream S3 object bytes to ClamAV unix socket (never write to local disk).
3. Parse ClamAV response:
   a. 'OK' → scan_status = 'clean', scanned_at = NOW()
      Notify uploader (in-app): "Attachment [filename] is ready."
   b. 'FOUND' → scan_status = 'infected'
      - Move S3 object to quarantine prefix: {tenant_id}/quarantine/{uuid}.{ext}
      - Create admin alert in behaviour_alerts (alert_type = 'policy_threshold_breach', severity = 'critical',
        title = 'Infected file quarantined', description includes filename + concern number)
      - Send in-app notification to tenant admin + DLP: "Infected file detected and quarantined"
      - Audit log entry
   c. Error/timeout → scan_status = 'scan_failed', retry up to 3 times with backoff.
      After 3 failures: admin alert created, file remains inaccessible.
4. Update behaviour_attachments record.
```

**Download pipeline** (enforced in `AttachmentService.generateDownloadUrl`):

```
1. Load attachment record.

2. Permission check:
   - If entity_type IN ('safeguarding_concern', 'safeguarding_action'):
     Require safeguarding.view (or active break-glass grant)
   - Else: standard visibility class check per behaviour permissions

3. Scan status check:
   - If scan_status != 'clean': return 403 with message "File not available — awaiting security scan"
   - If scan_status = 'infected': return 403 with message "File unavailable"

4. Generate S3 pre-signed URL: 15-minute expiry.

5. Audit log:
   - Standard behaviour attachments: entry in audit_logs
   - Safeguarding attachments: entry in audit_logs WITH safeguarding context
     PLUS safeguarding_actions entry: action_type = 'document_downloaded',
     metadata = { attachment_id, file_name, break_glass: boolean, grant_id }

6. Return pre-signed URL.
```

---

### 10. Status Projection: `converted_to_safeguarding`

When a behaviour incident is converted to a safeguarding concern via `POST v1/safeguarding/concerns` with an `incident_id` parameter (or via the status transition on the incident):

1. The incident's `status` is set to `converted_to_safeguarding`
2. A `safeguarding_concern_incidents` record is created
3. The incident's `behaviour_entity_history` logs: `change_type = 'status_changed'`, `new_values = { status: 'closed' }` — **deliberately using 'closed' even in the history**, so that non-safeguarding reviewers of the history see 'closed'

**Projection rule** (enforced in `BehaviourService` and any service reading incidents):

```typescript
function projectIncidentStatus(
  incident: BehaviourIncident,
  userPermissions: string[],
): { status: string; status_reason?: string } {
  if (
    incident.status === 'converted_to_safeguarding' &&
    !userPermissions.includes('safeguarding.view')
  ) {
    return { status: 'closed', status_reason: 'Referred internally' };
  }
  return { status: incident.status };
}
```

**Projection applies to**:
- API responses from any incident endpoint
- Search index entries (Meilisearch) — indexed as `status: 'closed'`
- Redis cache entries
- PDF exports (behaviour pack)
- Entity history entries returned to behaviour-only users
- Parent-facing responses (parent portal always sees `closed` regardless of permissions)

**What safeguarding.view holders see**: The actual `converted_to_safeguarding` status, plus a link to the associated concern(s).

---

### 11. Retention

Default retention: **25 years from student date of birth** (Children First Act 2015 compliance).

At concern creation: `retention_until = student.date_of_birth + INTERVAL '25 years'`

If the student's DOB is not recorded: `retention_until = created_at + INTERVAL '25 years'` as a safe fallback.

**Retention worker** (`behaviour:retention-check`, monthly): Safeguarding concerns are excluded from the standard anonymisation pipeline. They are flagged for manual review after `retention_until` but never auto-deleted or auto-anonymised. A `behaviour_tasks` entry is created for the DLP when `retention_until < NOW()`.

**S3 Object Lock** on attachments enforces the physical file retention at storage layer independently of application-level retention logic.

---

## API Endpoints

All endpoints are under `v1/safeguarding/` and served by `SafeguardingController`.

| # | Method | Route | Description | Permission |
|---|--------|-------|-------------|------------|
| 1 | POST | `v1/safeguarding/concerns` | Report a new concern | `safeguarding.report` |
| 2 | GET | `v1/safeguarding/my-reports` | Reporter's own reports + ack status only | `safeguarding.report` |
| 3 | GET | `v1/safeguarding/concerns` | Paginated list with filters (status, severity, type, date range) | `safeguarding.view` |
| 4 | GET | `v1/safeguarding/concerns/:id` | Full concern detail | `safeguarding.view` |
| 5 | PATCH | `v1/safeguarding/concerns/:id` | Update fields (description, type, severity, referral details) | `safeguarding.manage` |
| 6 | PATCH | `v1/safeguarding/concerns/:id/status` | Status transition with mandatory reason | `safeguarding.manage` |
| 7 | POST | `v1/safeguarding/concerns/:id/assign` | Assign concern to DLP or investigator | `safeguarding.manage` |
| 8 | POST | `v1/safeguarding/concerns/:id/actions` | Record action in the chronological log | `safeguarding.manage` |
| 9 | GET | `v1/safeguarding/concerns/:id/actions` | Full action history (chronological) | `safeguarding.view` |
| 10 | POST | `v1/safeguarding/concerns/:id/tusla-referral` | Record Tusla referral (sets is_tusla_referral, reference number, date) | `safeguarding.manage` |
| 11 | POST | `v1/safeguarding/concerns/:id/garda-referral` | Record Garda referral (sets is_garda_referral, reference number, date) | `safeguarding.manage` |
| 12 | POST | `v1/safeguarding/concerns/:id/attachments` | Upload attachment (starts ClamAV pipeline, returns 202) | `safeguarding.manage` |
| 13 | GET | `v1/safeguarding/concerns/:id/attachments/:aid/download` | Download attachment (signed URL, scan-gated, audit-logged) | `safeguarding.view` |
| 14 | POST | `v1/safeguarding/concerns/:id/case-file` | Generate watermarked case file PDF (async, returns job ID) | `safeguarding.manage` |
| 15 | POST | `v1/safeguarding/concerns/:id/case-file/redacted` | Generate redacted PDF variant | `safeguarding.manage` |
| 16 | POST | `v1/safeguarding/concerns/:id/seal/initiate` | Initiate seal — first of dual-control (sets sealed_by_id) | `safeguarding.seal` |
| 17 | POST | `v1/safeguarding/concerns/:id/seal/approve` | Approve seal — second of dual-control (different user required) | `safeguarding.seal` |
| 18 | GET | `v1/safeguarding/dashboard` | Open concerns by severity, SLA compliance, overdue tasks | `safeguarding.view` |

### Endpoint Detail Notes

**POST `v1/safeguarding/concerns` (report)**:

Request body (Zod schema in `packages/shared`):
```typescript
const ReportSafeguardingConcernSchema = z.object({
  student_id: z.string().uuid(),
  concern_type: z.enum([
    'physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect',
    'self_harm', 'bullying', 'online_safety', 'domestic_violence',
    'substance_abuse', 'mental_health', 'radicalisation', 'other'
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(10),
  immediate_actions_taken: z.string().nullable().optional(),
  incident_id: z.string().uuid().nullable().optional(), // link to behaviour incident
});
```

Response: `{ concern_number: 'CP-000042', id: 'uuid', status: 'reported' }`

**GET `v1/safeguarding/concerns` (list)**:

Query params: `?page=1&pageSize=20&status=under_investigation&severity=critical&type=physical_abuse&from=2025-09-01&to=2025-12-31`

Response shape:
```typescript
{
  data: SafeguardingConcernSummary[],
  meta: { page: number, pageSize: number, total: number },
  sla_summary: {
    overdue: number,
    due_within_24h: number,
    on_track: number,
  }
}
```

**GET `v1/safeguarding/dashboard`**:

```typescript
{
  open_by_severity: { critical: number, high: number, medium: number, low: number },
  sla_compliance: {
    overdue: number,
    due_within_24h: number,
    on_track: number,
    compliance_rate: number,  // percentage of open concerns meeting SLA
  },
  by_status: { reported: number, acknowledged: number, under_investigation: number, referred: number, monitoring: number },
  overdue_tasks: BehaviourTask[],
  recent_actions: SafeguardingAction[],  // last 5
}
```

**POST `v1/safeguarding/concerns/:id/case-file`**:

Case file PDF generation is async (can take 10–30s for large files). The endpoint enqueues a BullMQ job and returns immediately:
```typescript
{ job_id: 'uuid', status: 'queued' }
```

The client polls `GET v1/safeguarding/concerns/:id/case-file/status` which returns:
```typescript
{ status: 'queued' | 'processing' | 'complete' | 'failed', download_url?: string }
```

When `status = 'complete'`, `download_url` is a pre-signed URL (15-minute expiry).

---

## Frontend Pages

### `/safeguarding` — Dashboard

**Access**: `safeguarding.view` required. All staff with only `safeguarding.report` are redirected to `/safeguarding/my-reports`.

**Layout** (desktop: 3-column grid, mobile: stacked):

- **SLA panel** (top, full width): Traffic-light summary — critical overdue (red), due within 24h (amber), on track (green). Click to filter concern list.
- **Open concerns by severity**: Four counters with colour coding (critical: red, high: orange, medium: yellow, low: blue)
- **Status funnel**: Horizontal bar showing distribution across statuses
- **Overdue tasks** (right column): Compact task list, click to open task detail
- **Recent activity** (bottom): Last 10 `safeguarding_actions` across all concerns, most recent first

**Mobile**: All panels stack vertically. SLA panel is the first thing visible on scroll-in.

---

### `/safeguarding/concerns` — Concern List

**Access**: `safeguarding.view` required.

**Filters** (persistent in URL params):
- Status (multi-select chips)
- Severity (multi-select chips)
- Concern type (dropdown)
- Date range (created_at)
- Assigned to (user selector)
- SLA status: All / Overdue / Due soon / On track

**Table columns** (desktop): Concern number, Student (name), Type, Severity badge, Status badge, Reported by, Created at, SLA deadline (colour-coded), Assigned to.

**Mobile**: Card view — concern number + student name as title, severity + status as badges, SLA deadline prominent.

**Overdue SLA indicator**: Concerns past `sla_first_response_due` without `sla_first_response_met_at` show a red clock icon and the words "SLA BREACHED" in the row.

---

### `/safeguarding/concerns/new` — Report Concern

**Access**: `safeguarding.report` (all staff).

**Form fields**:
1. Student search (type-ahead, required)
2. Concern type (dropdown, required)
3. Severity (radio buttons: low / medium / high / critical, required)
4. Description (textarea, min 10 chars, required) — labelled "What did you observe or hear? Be specific and factual."
5. Immediate actions taken (textarea, optional) — labelled "What actions did you take at the time of the concern?"
6. Link to behaviour incident (optional search field for incident number)

**After submission**: Page redirects to `/safeguarding/my-reports`. Reporter does not see the concern they just filed — they see the acknowledgement status in my-reports.

**Critical severity warning**: When `severity = 'critical'` is selected, show an amber banner: "A critical concern will be escalated immediately to the Designated Liaison Person. If a child is in immediate danger, call emergency services (999) first."

---

### `/safeguarding/concerns/[id]` — Case File

**Access**: `safeguarding.view` (or active break-glass grant).

**Break-glass indicator**: If the viewing user is accessing via break-glass, show a prominent amber banner: "You are viewing this concern under emergency break-glass access granted by [principal name] at [time]. This access is being logged."

**Layout** (desktop: 2-panel, mobile: tabbed):

Left panel / Tab 1 — **Concern Detail**:
- Header: concern number, severity badge, status badge, SLA status
- Student info (name, year group, DOB)
- Concern type, description, immediate actions
- Tusla referral block (if applicable): reference number, date, outcome
- Garda referral block (if applicable): reference number, date
- Resolution notes (if resolved)
- Assigned to
- Seal status (if sealed: sealed banner with date, sealed by, approved by)

Right panel / Tab 2 — **Chronological Actions**:
- Append-only timeline (oldest to newest, most recent at bottom)
- Each action: timestamp, actor role (not name on redacted view), action type label, description
- "Record action" button (for `safeguarding.manage` holders): opens modal with action type selector + description + optional due date

Tab 3 — **Attachments**:
- List of attachments with: filename, classification, uploaded by (role), upload date, scan status badge
- Files with `scan_status = 'pending'` show "Awaiting scan" with spinner
- Files with `scan_status = 'infected'` show "Quarantined — unavailable" in red
- Download button only shown for `scan_status = 'clean'` files
- Upload button (for `safeguarding.manage`)

Tab 4 — **Linked Incidents** (if any):
- List of behaviour incidents linked via `safeguarding_concern_incidents`
- Read-only summary: incident number, category, date, reporter role

**Actions sidebar** (desktop right rail, mobile bottom sheet):
- Status transition button (for `safeguarding.manage`) — opens status picker + reason field
- Record Tusla referral (for `safeguarding.manage`)
- Record Garda referral (for `safeguarding.manage`)
- Assign concern (for `safeguarding.manage`)
- Export Case File PDF
- Export Redacted PDF
- Initiate Seal (for `safeguarding.seal`, only when status = 'resolved')
- Approve Seal (for second `safeguarding.seal` holder, only when `sealed_by_id` is set)

---

### `/safeguarding/my-reports` — Reporter Acknowledgement View

**Access**: Any authenticated staff member (no additional permission required).

**What is shown**:
- Table/card list of concerns the current user reported
- Columns: Concern number, Type (their own input), Reported date, Acknowledgement status
- Acknowledgement status rendered as a labelled badge:
  - null → "Awaiting acknowledgement" (grey)
  - `received` → "Received" (blue)
  - `assigned` → "Assigned to liaison" (indigo)
  - `under_review` → "Under review" (amber)

**What is NOT shown**: Student name, description, assigned staff, actions taken, referral status, severity.

**Empty state**: "You have not filed any safeguarding reports." with a "Report a concern" button.

---

### `/settings/safeguarding` — Safeguarding Settings

**Access**: `behaviour.admin` or principal.

**Sections**:

1. **Designated Liaison Person (DLP)**
   - User selector: `designated_liaison_user_id`
   - User selector: `deputy_designated_liaison_user_id`
   - Additional fallback chain: ordered list of users (`dlp_fallback_chain`) with drag-and-drop ordering
   - Warning if DLP is unassigned: "A Designated Liaison Person must be assigned before the safeguarding module is active."

2. **SLA Thresholds**
   - Four number inputs (hours): Critical (default 4), High (default 24), Medium (default 72), Low (default 168)
   - Note: "SLA deadlines count wall-clock hours. Safeguarding does not pause for weekends."

3. **Retention**
   - `safeguarding_retention_years`: number input (default 25, min 25 for Irish statutory compliance)
   - Read-only note: "Records are retained for 25 years from the student's date of birth per the Children First Act 2015. Reducing this setting below 25 years is not recommended."

4. **Module status**: Toggle to enable/disable safeguarding module. Warning: "Disabling safeguarding removes the concern menu from all staff. Existing records are preserved."

---

## Worker Jobs

### `behaviour:attachment-scan`

| Property | Value |
|----------|-------|
| Queue | `behaviour` |
| Trigger | On every attachment upload (enqueued by `AttachmentService`) |
| Processor | `AttachmentScanProcessor` |

**Payload** (Zod-validated, extends `TenantAwareJob`):
```typescript
const AttachmentScanJobPayload = z.object({
  tenant_id: z.string().uuid(),
  attachment_id: z.string().uuid(),
  file_key: z.string(),
});
```

**Processing**:
1. Load attachment record from DB; verify `scan_status = 'pending'`
2. Open stream from S3 (`GetObjectCommand` stream)
3. Pipe stream to ClamAV unix socket via `clamdjs`
4. Parse result:
   - `'OK'`: Update `scan_status = 'clean'`, `scanned_at = NOW()`
   - `'FOUND'`:
     - Update `scan_status = 'infected'`
     - Move S3 object to quarantine prefix via `CopyObject` + `DeleteObject`
     - Create `behaviour_alerts` record
     - Send admin + DLP notification
   - Error/timeout: Update `scan_status = 'scan_failed'`
5. Retry config: 3 attempts, exponential backoff (1s, 4s, 16s)
6. Dead-letter after 3 failures; admin alert for unscanned backlog

**Idempotency**: Check `scan_status` before processing — if already `clean` or `infected`, skip silently and return.

---

### `behaviour:break-glass-expiry`

| Property | Value |
|----------|-------|
| Queue | `behaviour` |
| Trigger | Cron every 5 minutes |
| Processor | `BreakGlassExpiryProcessor` |

**Payload**:
```typescript
const BreakGlassExpiryJobPayload = z.object({
  tenant_id: z.string().uuid(),
});
```

**Processing** (runs per tenant):
1. Query `safeguarding_break_glass_grants` where `expires_at < NOW() AND revoked_at IS NULL`
2. For each expired grant:
   a. Set `revoked_at = NOW()` (atomic update with WHERE clause to prevent double-processing)
   b. Query all `audit_logs` entries for this grant where `context = 'break_glass'` — collect accessed concern IDs
   c. Create `behaviour_tasks`:
      - `task_type = 'break_glass_review'`
      - `entity_type = 'break_glass_grant'`
      - `entity_id = grant.id`
      - `priority = 'high'`
      - `title = 'Break-glass review required: [user display name] accessed safeguarding records'`
      - `description` = summary of: who accessed, duration, list of concern numbers accessed, total records viewed
      - `due_date = addSchoolDays(tenantId, NOW(), 7)`
      - `assigned_to_id = designated_liaison_user_id`
   d. Send `safeguarding_break_glass_review` notification to DLP + principal
   e. Record in `behaviour_entity_history` for the grant entity

**Idempotency**: The `WHERE revoked_at IS NULL` filter prevents re-processing. Use a Prisma `updateMany` with the WHERE clause so concurrent runs are safe.

---

### `safeguarding:sla-check`

| Property | Value |
|----------|-------|
| Queue | `behaviour` |
| Trigger | Cron every 30 minutes |
| Processor | `SafeguardingSlaCheckProcessor` |

**Payload**:
```typescript
const SlaCheckJobPayload = z.object({
  tenant_id: z.string().uuid(),
});
```

**Processing** (runs per tenant):
1. Load all concerns where:
   `sla_first_response_met_at IS NULL AND sla_first_response_due < NOW() AND status NOT IN ('resolved', 'sealed')`
2. For each breached concern:
   a. Check if a `behaviour_tasks` with `task_type = 'safeguarding_action'` and a title matching `SLA BREACH: [concern_number]` already exists and is not completed — if yes, skip task creation to avoid duplicates
   b. If no existing breach task: create `behaviour_tasks`:
      - `task_type = 'safeguarding_action'`
      - `entity_type = 'safeguarding_concern'`
      - `entity_id = concern.id`
      - `priority = 'urgent'`
      - `title = 'SLA BREACH: [concern_number] — [severity] concern acknowledgement overdue'`
      - `assigned_to_id = designated_liaison_user_id`
      - `due_date = NOW()` (immediately due)
   c. Send `safeguarding_sla_breach` notification to DLP + deputy DLP (not on every 30-min run — only if last breach notification was > 2 hours ago to avoid spam)
   d. Set `is_overdue = true` on related `safeguarding_actions` entries
3. Also check for concerns approaching SLA (within 25% of deadline remaining, not yet breached):
   - Create `priority = 'high'` (not urgent) tasks as an early warning
   - Only if no existing approach-warning task exists

---

### `safeguarding:critical-escalation`

| Property | Value |
|----------|-------|
| Queue | `behaviour` |
| Trigger | On critical concern creation (immediate, not cron) |
| Processor | `SafeguardingCriticalEscalationProcessor` |

**Payload**:
```typescript
const CriticalEscalationJobPayload = z.object({
  tenant_id: z.string().uuid(),
  concern_id: z.string().uuid(),
  escalation_step: z.number().int().min(0),  // 0 = initial DLP notification
});
```

**Processing**:
1. Load concern. If `status !== 'reported'` (i.e., already acknowledged): terminate — escalation succeeded.
2. Load tenant settings: `designated_liaison_user_id`, `deputy_designated_liaison_user_id`, `dlp_fallback_chain`
3. Build ordered escalation chain: `[designated_liaison_user_id, deputy_designated_liaison_user_id, ...dlp_fallback_chain]`
4. If `escalation_step >= chain.length`: log "Escalation chain exhausted" in `safeguarding_actions`, stop.
5. Notify `chain[escalation_step]`:
   - Send `safeguarding_critical_escalation` push + in-app notification
   - Record in `safeguarding_actions`: `action_type = 'note_added'`, description = `'Critical escalation step [N] — notified [role]'`
6. Enqueue next step: delay = 30 minutes, `escalation_step + 1`

**First step** is always `escalation_step = 0` (DLP). This job is enqueued immediately when the concern is created with `severity = 'critical'`.

**Retry config**: 3 attempts with 10s backoff. Failed notifications (push token missing etc.) are logged but do not prevent the next step from being scheduled.

---

## Notification Templates

These templates are used by Phase D. Template bodies are defined in the comms module seed data.

| Template Key | Trigger | Channel | Recipients |
|-------------|---------|---------|------------|
| `safeguarding_concern_reported` | New concern created (any severity) | Push + in-app | Designated liaison (DLP) |
| `safeguarding_critical_escalation` | Critical concern, DLP not responding after 30 min | Push + in-app | Next person in escalation chain |
| `safeguarding_reporter_ack` | DLP acknowledges concern (status → acknowledged) | In-app | Reporter (`reported_by_id`) |
| `safeguarding_sla_breach` | SLA deadline passed without first response | Push + email | DLP + Deputy DLP |
| `safeguarding_break_glass_review` | Break-glass grant expired | In-app + email | DLP + Principal |

**Template variables**:

`safeguarding_concern_reported`:
```
Title: "New safeguarding concern reported"
Body: "A {{severity}} safeguarding concern ({{concern_number}}) has been reported. First response required by {{sla_deadline}}."
```

`safeguarding_critical_escalation`:
```
Title: "⚠ CRITICAL safeguarding concern — escalation step {{step}}"
Body: "Critical concern {{concern_number}} has not been acknowledged. The designated liaison has not responded. Immediate action required."
```

`safeguarding_reporter_ack`:
```
Title: "Your safeguarding report has been received"
Body: "Your report ({{concern_number}}) has been received and assigned to a designated liaison."
```

`safeguarding_sla_breach`:
```
Title: "Safeguarding SLA breach — action required"
Body: "Concern {{concern_number}} ({{severity}}) has exceeded its first-response SLA of {{sla_hours}} hours. Immediate attention required."
```

`safeguarding_break_glass_review`:
```
Title: "Break-glass access review required"
Body: "{{user_display_name}} had emergency break-glass access to safeguarding records from {{granted_at}} to {{expires_at}}. Please review the accessed records and complete the after-action review."
```

---

## Acceptance Criteria

### Concern Lifecycle

- [ ] Creating a concern with `severity = 'critical'` immediately enqueues the critical escalation job
- [ ] `sla_first_response_due` is set correctly at creation for all four severity levels using wall-clock hours
- [ ] Status transition from `reported` to `acknowledged` sets `sla_first_response_met_at = NOW()`
- [ ] Status transition sends `safeguarding_reporter_ack` to the reporter
- [ ] All status transitions require a reason, create a `safeguarding_actions` entry, and reject empty reasons
- [ ] `resolved → sealed` requires two distinct users both holding `safeguarding.seal`
- [ ] Any PATCH attempt on a sealed concern returns 403
- [ ] `retention_until` is set to `student.date_of_birth + 25 years` at creation

### Reporter Acknowledgement

- [ ] A reporter with only `safeguarding.report` can access `/safeguarding/my-reports`
- [ ] The my-reports response contains ONLY: concern_number, concern_type, reported_at, reporter_acknowledgement_status
- [ ] The my-reports response does NOT contain: student name, description, assigned staff, actions, attachments
- [ ] Attempting to call `GET v1/safeguarding/concerns/:id` without `safeguarding.view` or break-glass returns 403

### SLA Worker

- [ ] After a concern's `sla_first_response_due` passes without `sla_first_response_met_at`, the worker creates an urgent task
- [ ] The SLA worker does not create duplicate tasks for the same breach
- [ ] SLA checks occur every 30 minutes (verify cron schedule)
- [ ] SLA notifications are not re-sent more than once per 2 hours for the same concern

### Break-Glass

- [ ] Only a user with `safeguarding.seal` can grant break-glass access
- [ ] `expires_at` cannot be more than 72 hours from `granted_at` (service-layer enforcement)
- [ ] Every safeguarding record view under break-glass is logged in `audit_logs` with `context = 'break_glass'` and `break_glass_grant_id`
- [ ] The expiry cron (every 5 minutes) sets `revoked_at` on expired grants
- [ ] On expiry: a `break_glass_review` task is created for DLP within one cron cycle
- [ ] The after-action task description includes the list of accessed concern numbers
- [ ] An unexpired grant holder can view concerns within their scope
- [ ] An expired grant holder cannot access concerns (returns 403 after expiry)
- [ ] `seal_approved_by_id` cannot equal `sealed_by_id` (enforced at service layer, returns 400)

### Attachment Pipeline

- [ ] File upload returns 202 immediately with `attachment_id`; not 201
- [ ] File is NOT downloadable until `scan_status = 'clean'`; returns 403 with "awaiting security scan" message
- [ ] Infected file: `scan_status = 'infected'`, quarantined in S3, admin alert created
- [ ] Safeguarding attachments are uploaded with S3 Object Lock (GOVERNANCE mode)
- [ ] File extension outside allowlist returns 422
- [ ] File size > 10 MB returns 413
- [ ] MIME type mismatch (magic bytes vs declared type) returns 422
- [ ] SHA-256 hash is stored and matches the uploaded bytes
- [ ] Attachment download for safeguarding entities creates `safeguarding_actions` entry with `action_type = 'document_downloaded'`

### Status Projection

- [ ] A user without `safeguarding.view` calling `GET v1/behaviour/incidents/:id` on a `converted_to_safeguarding` incident receives `status: 'closed'`, `status_reason: 'Referred internally'`
- [ ] A user WITH `safeguarding.view` calling the same endpoint receives `status: 'converted_to_safeguarding'`
- [ ] Meilisearch index for the incident stores `status: 'closed'` (verify by querying index directly)
- [ ] Parent portal never shows `converted_to_safeguarding`

### Exports

- [ ] Case file PDF contains watermark including generator's display name, role, datetime, and tenant name
- [ ] Case file PDF final page contains SHA-256 hash of the preceding content
- [ ] Redacted PDF substitutes student name with reference code (SHA-256 derived)
- [ ] Redacted PDF substitutes staff names with role titles
- [ ] Redacted PDF marks `is_redactable = true` attachments as "[Document withheld]"
- [ ] Infected or pending-scan attachments are excluded from PDF exports (manifest entry shows "unavailable")

### Data Isolation

- [ ] `GET v1/behaviour/incidents` never returns information about linked safeguarding concerns
- [ ] `safeguarding_concern_incidents` is not queryable via behaviour API endpoints
- [ ] Safeguarding concerns are not indexed in Meilisearch

---

## Test Requirements

### Safeguarding Isolation Tests (release gate)

```typescript
describe('Safeguarding Isolation', () => {
  it('safeguarding_concern_incidents join invisible from behaviour side', async () => {
    // Create concern, link incident, query incident as behaviour-only user
    // Assert: response contains no concern_id, no concern_number, no safeguarding fields
  });

  it('converted_to_safeguarding projected as closed for behaviour users', async () => {
    // Set incident status to converted_to_safeguarding
    // Query as teacher (no safeguarding.view)
    // Assert: status === 'closed', status_reason === 'Referred internally'
  });

  it('converted_to_safeguarding visible as-is for safeguarding.view users', async () => {
    // Query same incident as DLP
    // Assert: status === 'converted_to_safeguarding'
  });

  it('safeguarding entities not in search index', async () => {
    // Create concern
    // Query Meilisearch index directly
    // Assert: concern not present
  });

  it('safeguarding fields never in AI prompts', async () => {
    // AI service interceptor test: verify no SAFEGUARDING-class data in prompt payload
  });

  it('safeguarding data never in materialised views', async () => {
    // Refresh mv_student_behaviour_summary
    // Assert: no safeguarding concern data in aggregate columns
  });

  it('every safeguarding read creates audit log entry', async () => {
    // Call GET v1/safeguarding/concerns/:id
    // Assert: audit_log entry with action = 'safeguarding_concern_viewed'
  });

  it('break-glass grants expire correctly', async () => {
    // Create grant with expires_at = 2 minutes ago
    // Run break-glass-expiry job
    // Assert: revoked_at is set, review task created
  });

  it('reporter cannot view concern detail', async () => {
    // Call GET v1/safeguarding/concerns/:id as reporter (safeguarding.report only)
    // Assert: 403
  });

  it('my-reports returns only ack status, no case detail', async () => {
    // Call GET v1/safeguarding/my-reports as reporter
    // Assert: no description, no student_name, no assigned_to in response
  });
});
```

### SLA Tests

```typescript
describe('SLA Tracking', () => {
  it('sla_first_response_due set to wall-clock hours on creation', async () => {
    const before = new Date();
    const concern = await createConcern({ severity: 'critical' });
    const expected = addHours(before, 4); // default critical SLA
    expect(concern.sla_first_response_due).toBeWithinMinutesOf(expected, 1);
  });

  it('SLA uses wall-clock hours, not school days', async () => {
    // Create concern on Friday at 23:00
    // Assert: critical SLA due Saturday 03:00 (not Monday)
  });

  it('sla_first_response_met_at set on acknowledge transition', async () => {
    const concern = await createAndTransition({ to: 'acknowledged' });
    expect(concern.sla_first_response_met_at).not.toBeNull();
  });

  it('SLA worker creates urgent task on breach', async () => {
    // Create concern with sla_first_response_due in the past
    // Run sla-check job
    // Assert: behaviour_tasks record created with priority = 'urgent'
  });

  it('SLA worker does not duplicate breach task', async () => {
    // Run sla-check job twice for same breached concern
    // Assert: only one breach task exists
  });
});
```

### Break-Glass Tests

```typescript
describe('Break-Glass Access', () => {
  it('non-principal cannot grant break-glass', async () => {
    // Call POST v1/safeguarding/break-glass as DLP (not principal)
    // Assert: 403
  });

  it('grant duration cannot exceed 72 hours', async () => {
    // Attempt to grant with duration_hours = 73
    // Assert: 422
  });

  it('break-glass access is audit-logged per record view', async () => {
    // Active grant for user B, view concern as user B
    // Assert: audit_logs entry with context = 'break_glass' and break_glass_grant_id
  });

  it('expired break-glass denies access', async () => {
    // Grant with expires_at = now - 1 minute
    // Attempt to view concern as grantee
    // Assert: 403
  });

  it('seal requires two distinct users', async () => {
    // User A initiates seal
    // User A attempts to approve seal
    // Assert: 400 with message about dual-control requirement
  });
});
```

### ClamAV Pipeline Tests

```typescript
describe('ClamAV Attachment Pipeline', () => {
  it('file not downloadable while scan_status = pending', async () => {
    const { attachment_id } = await uploadAttachment();
    // Before scan job runs
    const resp = await downloadAttachment(attachment_id);
    expect(resp.status).toBe(403);
  });

  it('file downloadable after clean scan', async () => {
    const { attachment_id } = await uploadAttachment();
    await runScanJob(attachment_id); // mock ClamAV returning OK
    const resp = await downloadAttachment(attachment_id);
    expect(resp.status).toBe(200);
    expect(resp.body.download_url).toBeDefined();
  });

  it('infected file quarantined and inaccessible', async () => {
    const { attachment_id } = await uploadAttachment();
    await runScanJob(attachment_id); // mock ClamAV returning FOUND
    const attachment = await getAttachment(attachment_id);
    expect(attachment.scan_status).toBe('infected');
    // Verify object moved to quarantine prefix in S3 (S3 mock assertion)
    const resp = await downloadAttachment(attachment_id);
    expect(resp.status).toBe(403);
  });

  it('extension outside allowlist rejected at upload', async () => {
    const resp = await uploadFile({ extension: '.exe' });
    expect(resp.status).toBe(422);
  });

  it('file over 10MB rejected at upload', async () => {
    const resp = await uploadFile({ sizeBytes: 11 * 1024 * 1024 });
    expect(resp.status).toBe(413);
  });
});
```

### RLS Leakage Tests

```typescript
describe('RLS — Safeguarding Tenant Isolation', () => {
  it('Tenant B cannot read Tenant A safeguarding_concerns', async () => {
    // Create concern as Tenant A
    // Authenticate as Tenant B DLP
    // Query GET v1/safeguarding/concerns
    // Assert: empty result
  });

  it('Tenant B cannot read Tenant A safeguarding_actions', async () => { /* same pattern */ });

  it('Tenant B cannot read Tenant A safeguarding_break_glass_grants', async () => { /* same pattern */ });

  it('Tenant B cannot access Tenant A safeguarding attachments', async () => { /* same pattern */ });
});
```

---

## Feature Map Changes (for confirmation when phase is finalised)

The following feature map entries would need to be updated after Phase D is complete and finalised:

- Add safeguarding module section with 18 endpoints across `safeguarding.controller.ts`
- Add 5 frontend pages under `/safeguarding/` and 1 settings page under `/settings/safeguarding`
- Add 4 worker jobs to event-job-catalog
- Update infrastructure notes to include ClamAV daemon on Hetzner
- Update blast radius for safeguarding → behaviour_attachments shared dependency

Do not update the feature map during iterative Phase D implementation. Update it once the phase is complete and confirmed.
