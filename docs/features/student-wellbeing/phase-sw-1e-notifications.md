---
sub-phase: SW-1E
name: Tiered Notifications
status: NOT STARTED
dependencies: [SW-1B]
estimated-effort: medium
date: 2026-03-27
---

# SW-1E: Tiered Notifications

## Summary

Tiered notification dispatch driven by concern severity, escalation timeouts that auto-promote unacknowledged concerns, and concern acknowledgement that cancels pending escalation jobs. This sub-phase wires pastoral care into the existing communications infrastructure (in-app notifications, Resend email, Twilio WhatsApp) and adds a new `pastoral` BullMQ queue for escalation timeout jobs.

**What ships:** When a concern is created, notifications are dispatched to the right people at the right urgency. Unacknowledged urgent concerns auto-escalate to critical after a configurable timeout. Unacknowledged critical concerns trigger a second notification round. Viewing a concern counts as acknowledgement and cancels pending escalation jobs.

---

## Prerequisites

| Requirement           | Source                         | Notes                                                                                                                                                                                              |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SW-1A complete        | Infrastructure & foundation    | `app.current_user_id` in RLS context, immutability triggers, append-only `pastoral_events` table                                                                                                   |
| SW-1B complete        | Concern logging & audit events | `pastoral_concerns` table with `severity`, `acknowledged_at`, `acknowledged_by_user_id` columns; `PastoralEventService` for immutable audit writes; `ConcernService.create()` as the trigger point |
| Communications module | Existing                       | `NotificationsService.createBatch()`, `NotificationDispatchService`, `NotificationTemplatesService.resolveTemplate()`                                                                              |
| BullMQ infrastructure | Existing                       | Worker module, `TenantAwareJob` base class, queue constants                                                                                                                                        |
| `notification` table  | Existing Prisma model          | Channels: `in_app`, `email`, `whatsapp`, `sms`                                                                                                                                                     |

---

## Notification Flow

```
Concern Created (ConcernService.create)
    |
    v
PastoralNotificationService.dispatchForConcern(concern)
    |
    +-- Read severity from concern
    |
    +-- Resolve recipients (tenant_settings.pastoral.notification_recipients
    |   OR fall back to role-based defaults)
    |
    +-- severity = 'routine'?
    |       |
    |       +-- Create in-app notifications for relevant Tier 1 viewers
    |       +-- No email, no push, no WhatsApp
    |       +-- DONE (concern appears in next SST meeting agenda automatically)
    |
    +-- severity = 'elevated'?
    |       |
    |       +-- Create in-app notifications for year head + pastoral care coordinator
    |       +-- Create email notifications for year head + pastoral care coordinator
    |       +-- Enqueue 'communications:dispatch-notifications' job for email delivery
    |       +-- DONE
    |
    +-- severity = 'urgent'?
    |       |
    |       +-- Create in-app notifications for DLP + deputy principal
    |       +-- Create email notifications for DLP + deputy principal
    |       +-- Create push notifications (in-app with priority flag) for DLP + deputy principal
    |       +-- Enqueue 'communications:dispatch-notifications' job (priority)
    |       +-- Enqueue DELAYED 'pastoral:escalation-timeout' job
    |       |       delay = tenant_settings.pastoral.escalation.urgent_timeout_minutes
    |       |       (default: 120 minutes)
    |       +-- DONE
    |
    +-- severity = 'critical'?
            |
            +-- Create in-app notifications for DLP + principal
            +-- Create email notifications for DLP + principal
            +-- Create push notifications (in-app with priority flag) for DLP + principal
            +-- Create WhatsApp notifications for DLP + principal
            +-- Enqueue 'communications:dispatch-notifications' job (priority)
            +-- Enqueue DELAYED 'pastoral:escalation-timeout' job
            |       delay = tenant_settings.pastoral.escalation.critical_timeout_minutes
            |       (default: 30 minutes)
            +-- DONE
```

---

## Escalation Flow

```
DELAYED JOB fires: pastoral:escalation-timeout
    |
    v
Load concern by ID
    |
    +-- concern.acknowledged_at IS NOT NULL?
    |       |
    |       YES --> Log "escalation cancelled — concern acknowledged" --> DONE
    |
    +-- concern.severity = 'urgent' AND escalation_type = 'urgent_to_critical'?
    |       |
    |       +-- UPDATE concern SET severity = 'critical'
    |       +-- INSERT pastoral_event: 'concern_auto_escalated'
    |       |       payload: { old_severity: 'urgent', new_severity: 'critical',
    |       |                  reason: 'unacknowledged_timeout',
    |       |                  timeout_minutes: <configured> }
    |       +-- Dispatch critical-level notifications (same as critical concern creation)
    |       +-- Enqueue NEW delayed job for critical timeout
    |       |       delay = critical_timeout_minutes (default: 30 min)
    |       |       escalation_type = 'critical_second_round'
    |       +-- DONE
    |
    +-- concern.severity = 'critical' AND escalation_type = 'critical_second_round'?
            |
            +-- concern.acknowledged_at IS NOT NULL?
            |       |
            |       YES --> DONE (acknowledged after escalation but before second round)
            |
            +-- INSERT pastoral_event: 'critical_concern_unacknowledged'
            |       payload: { concern_id, severity: 'critical',
            |                  minutes_elapsed: <elapsed>,
            |                  notification_round: 2 }
            +-- Send second-round notifications to principal
            |       (if principal is not the DLP, add principal;
            |        if principal IS the DLP, re-notify the DLP)
            +-- DONE (no further automatic escalation — chain terminates)
```

---

## Concern Acknowledgement Flow

```
GET /api/v1/pastoral/concerns/:id  (any authorised viewer)
    |
    v
ConcernService.getById(id, userId)
    |
    +-- Load concern
    +-- concern.acknowledged_at IS NULL?
    |       |
    |       YES:
    |       +-- Is current user in the notification recipient list for this concern?
    |       |       |
    |       |       YES:
    |       |       +-- UPDATE concern SET acknowledged_at = now(),
    |       |       |                       acknowledged_by_user_id = userId
    |       |       +-- INSERT pastoral_event: 'concern_acknowledged'
    |       |       |       payload: { concern_id, acknowledged_by_user_id }
    |       |       +-- Cancel pending escalation timeout job(s) for this concern
    |       |       |       (look up job by custom job ID pattern, call job.remove())
    |       |       +-- Continue to return concern data
    |       |
    |       |       NO:
    |       |       +-- Continue (non-recipient views do not count as acknowledgement)
    |       |
    |       NO:
    |       +-- Continue (already acknowledged, no action)
    |
    +-- Return concern data
```

---

## 1. Pastoral Notification Service

**File:** `apps/api/src/modules/pastoral/services/pastoral-notification.service.ts`

### Responsibilities

- Resolves notification recipients based on concern severity and tenant settings
- Creates notification records via `NotificationsService.createBatch()`
- Enqueues BullMQ dispatch jobs for external channels (email, WhatsApp)
- Enqueues delayed escalation timeout jobs for urgent and critical concerns

### Recipient Resolution

The service reads `tenant_settings.pastoral.notification_recipients` to determine who receives notifications at each severity level. If the tenant has not configured recipients, role-based defaults apply.

**Tenant settings shape** (within `tenant_settings.settings` JSONB):

```typescript
{
  pastoral: {
    notification_recipients: {
      routine: {
        // No explicit recipients — in-app only for Tier 1 viewers
      },
      elevated: {
        user_ids: string[];        // explicit user IDs
        fallback_roles: string[];  // e.g., ['year_head', 'pastoral_coordinator']
      },
      urgent: {
        user_ids: string[];        // explicit user IDs (DLP, deputy principal)
        fallback_roles: string[];  // e.g., ['dlp', 'deputy_principal']
      },
      critical: {
        user_ids: string[];        // explicit user IDs (DLP, principal)
        fallback_roles: string[];  // e.g., ['dlp', 'principal']
      }
    },
    escalation: {
      urgent_timeout_minutes: number;   // default 120
      critical_timeout_minutes: number; // default 30
    }
  }
}
```

**Recipient resolution algorithm:**

1. Read `tenant_settings.pastoral.notification_recipients[severity]`
2. If `user_ids` is non-empty, use those user IDs directly
3. If `user_ids` is empty or missing, resolve from `fallback_roles`:
   - `dlp` -> read `tenant_settings.pastoral.designated_liaison_user_id`
   - `deputy_dlp` -> read `tenant_settings.pastoral.deputy_designated_liaison_user_id`
   - `principal` -> query `staff_profiles` where `role = 'principal'` for this tenant
   - `deputy_principal` -> query `staff_profiles` where `role = 'deputy_principal'`
   - `year_head` -> resolve from the concern's student's year group -> year head assignment
   - `pastoral_coordinator` -> query `staff_profiles` where `role = 'pastoral_coordinator'`
4. Deduplicate recipient list (a user may appear via both explicit ID and role resolution)
5. Exclude the `logged_by_user_id` from the recipient list (the person who logged the concern does not need to be notified of their own action)

### Channels by Severity

| Severity | in_app               | email | push (PWA) | WhatsApp |
| -------- | -------------------- | ----- | ---------- | -------- |
| routine  | Yes (Tier 1 viewers) | No    | No         | No       |
| elevated | Yes                  | Yes   | No         | No       |
| urgent   | Yes                  | Yes   | Yes (\*)   | No       |
| critical | Yes                  | Yes   | Yes (\*)   | Yes      |

(\*) Push notifications use the existing in-app notification channel with a `priority: 'high'` flag in `payload_json`. The frontend PWA service worker reads this flag to trigger a browser push notification. This avoids adding a new `NotificationChannel` enum value and keeps the push delivery mechanism in the frontend layer where Web Push API registration lives.

### Method Signatures

```typescript
class PastoralNotificationService {
  constructor(
    prisma: PrismaService,
    notificationsService: NotificationsService,
    notificationsQueue: Queue, // 'notifications' queue
    pastoralQueue: Queue, // 'pastoral' queue
    settingsService: SettingsService,
    pastoralEventService: PastoralEventService,
  ) {}

  /** Called by ConcernService.create() after concern is persisted. */
  async dispatchForConcern(
    tenantId: string,
    concern: PastoralConcernWithStudent,
    loggedByUserId: string,
  ): Promise<void>;

  /** Called by escalation timeout processor when urgent -> critical. */
  async dispatchCriticalEscalation(
    tenantId: string,
    concern: PastoralConcernWithStudent,
  ): Promise<void>;

  /** Called by escalation timeout processor for second-round critical. */
  async dispatchSecondRoundCritical(
    tenantId: string,
    concern: PastoralConcernWithStudent,
  ): Promise<void>;

  /** Resolves recipient user IDs for a given severity. */
  private async resolveRecipients(
    tenantId: string,
    severity: ConcernSeverity,
    studentId: string,
    excludeUserId: string,
  ): Promise<string[]>;

  /** Enqueues delayed escalation timeout job. Returns BullMQ job ID. */
  private async enqueueEscalationTimeout(
    tenantId: string,
    concernId: string,
    escalationType: 'urgent_to_critical' | 'critical_second_round',
    delayMinutes: number,
  ): Promise<string>;

  /** Cancels a pending escalation timeout job by concern ID. */
  async cancelEscalationTimeout(tenantId: string, concernId: string): Promise<void>;
}
```

### Escalation Job ID Convention

Delayed jobs use a deterministic job ID so they can be looked up and cancelled:

```
pastoral:escalation:{tenantId}:{concernId}:{escalationType}
```

Examples:

- `pastoral:escalation:abc-123:def-456:urgent_to_critical`
- `pastoral:escalation:abc-123:def-456:critical_second_round`

This allows `cancelEscalationTimeout()` to call `pastoralQueue.getJob(jobId)` and then `job.remove()` without scanning the queue.

---

## 2. BullMQ Job Definitions

### New Queue: `pastoral`

**File:** `apps/worker/src/base/queue.constants.ts`

Add `PASTORAL: 'pastoral'` to `QUEUE_NAMES`.

**Registration in worker module** (`apps/worker/src/worker.module.ts`):

```
{
  name: QUEUE_NAMES.PASTORAL,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
}
```

**Registration in API module** (`apps/api/src/modules/pastoral/pastoral.module.ts`):

```
BullModule.registerQueue({ name: 'pastoral' })
```

### Job: `pastoral:notify-concern`

**Queue:** `notifications` (uses existing queue since it dispatches notifications)

**Trigger:** `ConcernService.create()` enqueues this job after persisting the concern.

**Payload schema:**

```typescript
interface PastoralNotifyConcernPayload extends TenantJobPayload {
  tenant_id: string;
  concern_id: string;
  severity: 'routine' | 'elevated' | 'urgent' | 'critical';
  student_id: string;
  student_name: string;
  category: string;
  logged_by_user_id: string;
}
```

**Zod schema** (`packages/shared/src/schemas/pastoral-notification.schema.ts`):

```typescript
export const pastoralNotifyConcernPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  concern_id: z.string().uuid(),
  severity: z.enum(['routine', 'elevated', 'urgent', 'critical']),
  student_id: z.string().uuid(),
  student_name: z.string().min(1),
  category: z.string().min(1),
  logged_by_user_id: z.string().uuid(),
});
```

**Processor file:** `apps/worker/src/processors/pastoral/notify-concern.processor.ts`

**Job name constant:** `PASTORAL_NOTIFY_CONCERN_JOB = 'pastoral:notify-concern'`

**Processing logic:**

1. Validate payload (tenant_id present)
2. Load concern from database (verify it still exists and severity has not changed)
3. Call `PastoralNotificationService.dispatchForConcern()` (the service is NOT available in worker context -- see integration note below)
4. Since worker processors cannot inject API-side services, the processor handles notification creation directly using the `TenantAwareJob` pattern with `PrismaClient`

**Worker-side processing (alternative to API-side service injection):**

The worker processor replicates the recipient resolution and notification creation logic:

1. Load tenant settings to resolve recipients
2. Create notification records in the `notification` table via Prisma
3. Enqueue dispatch jobs for external channels
4. Enqueue delayed escalation timeout job (if urgent or critical)

This follows the same pattern as `BehaviourParentNotificationProcessor` which creates notification records directly in the worker.

### Job: `pastoral:escalation-timeout`

**Queue:** `pastoral` (dedicated queue for pastoral background processing)

**Trigger:** Enqueued as a delayed job when an urgent or critical concern is created (or when an urgent concern is auto-escalated to critical).

**Payload schema:**

```typescript
interface PastoralEscalationTimeoutPayload extends TenantJobPayload {
  tenant_id: string;
  concern_id: string;
  escalation_type: 'urgent_to_critical' | 'critical_second_round';
  original_severity: 'urgent' | 'critical';
  enqueued_at: string; // ISO 8601 timestamp
}
```

**Zod schema** (`packages/shared/src/schemas/pastoral-notification.schema.ts`):

```typescript
export const pastoralEscalationTimeoutPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  concern_id: z.string().uuid(),
  escalation_type: z.enum(['urgent_to_critical', 'critical_second_round']),
  original_severity: z.enum(['urgent', 'critical']),
  enqueued_at: z.string().datetime(),
});
```

**Processor file:** `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`

**Job name constant:** `PASTORAL_ESCALATION_TIMEOUT_JOB = 'pastoral:escalation-timeout'`

**Processing logic:**

```
1. Load concern by ID within RLS transaction
2. IF concern.acknowledged_at IS NOT NULL:
     Log "Escalation cancelled — concern {id} was acknowledged"
     RETURN (no-op)
3. IF escalation_type = 'urgent_to_critical':
     a. UPDATE concern SET severity = 'critical'
     b. INSERT pastoral_event ('concern_auto_escalated', {
          concern_id, old_severity: 'urgent', new_severity: 'critical',
          reason: 'unacknowledged_timeout', timeout_minutes: <from settings>
        })
     c. Resolve critical-level recipients
     d. Create notification records (in_app + email + WhatsApp)
     e. Enqueue 'communications:dispatch-notifications' for external delivery
     f. Enqueue NEW delayed job: pastoral:escalation-timeout
          with escalation_type = 'critical_second_round'
          delay = critical_timeout_minutes from tenant settings (default 30)
4. IF escalation_type = 'critical_second_round':
     a. IF concern.acknowledged_at IS NOT NULL:
          RETURN (acknowledged between escalation and second round)
     b. INSERT pastoral_event ('critical_concern_unacknowledged', {
          concern_id, severity: 'critical',
          minutes_elapsed: <now - concern.created_at>,
          notification_round: 2
        })
     c. Resolve principal recipient
     d. Create second-round notification records
     e. Enqueue 'communications:dispatch-notifications' for delivery
     f. TERMINATE (no further automatic escalation)
```

---

## 3. Concern Acknowledgement

### Implicit Acknowledgement via GET

When a notification recipient views a concern via `GET /api/v1/pastoral/concerns/:id`, the concern is implicitly acknowledged. This is handled inside `ConcernService.getById()`, not as a separate endpoint.

**Logic added to `ConcernService.getById()`:**

```
1. Load concern
2. IF concern.acknowledged_at IS NULL:
     a. Resolve notification recipients for this concern's severity
     b. IF current user IS in the recipient list:
          i.  UPDATE concern SET acknowledged_at = now(),
                                  acknowledged_by_user_id = currentUserId
          ii. INSERT pastoral_event ('concern_acknowledged', {
                concern_id, acknowledged_by_user_id: currentUserId
              })
          iii. Cancel pending escalation timeout jobs:
                - Look up job ID: pastoral:escalation:{tenantId}:{concernId}:urgent_to_critical
                - Look up job ID: pastoral:escalation:{tenantId}:{concernId}:critical_second_round
                - For each found job: call job.remove()
3. Return concern data (regardless of acknowledgement outcome)
```

**Why implicit (via GET) rather than explicit (separate PATCH)?**

The master spec states: "When any notification recipient views a concern (GET /concerns/:id), mark it as acknowledged." This is deliberate -- it ensures acknowledgement happens at the moment of awareness, not at the moment of deliberate action. For safeguarding, the legal question is "when were you made aware?", and the answer should be "when you first opened the record."

**Only the first view counts.** If `acknowledged_at` is already set, subsequent views are no-ops for acknowledgement purposes.

**Only notification recipients trigger acknowledgement.** A general staff member with `pastoral.view_tier1` permission viewing a routine concern does not count as acknowledgement (they are not on the notification recipient list for that concern). This prevents premature cancellation of escalation timeouts.

### Tracking Which Recipients Were Notified

To determine whether the current viewer is a notification recipient (for acknowledgement logic), the system needs to know who was notified. Two approaches:

**Approach A (chosen): Query notification table.** When checking whether to acknowledge, query `notification` WHERE `source_entity_type = 'pastoral_concern' AND source_entity_id = concern.id AND recipient_user_id = currentUserId`. If a record exists, the user was notified and their view counts as acknowledgement.

This is preferred because:

- Uses existing data (notification records already created during dispatch)
- No additional columns or tables needed
- Naturally handles the case where recipient lists change after initial dispatch

### API Changes

No new endpoints are required. The acknowledgement behaviour is added to the existing `GET /api/v1/pastoral/concerns/:id` endpoint in SW-1B.

**Side-effect summary for GET /concerns/:id:**

- Reads concern (existing)
- IF first view by notification recipient: sets `acknowledged_at`, writes audit event, cancels escalation jobs (new in SW-1E)

This is a controlled side-effect on a GET request. It is acceptable here because:

1. The side-effect is idempotent (only fires once per concern)
2. The GET response is unchanged (no new fields in the response body)
3. The alternative (requiring a separate acknowledgement action) contradicts the "viewed = acknowledged" requirement from the master spec

---

## 4. Notification Templates

### Template Keys

| Template Key                    | Channel    | Severity     | Description                                                |
| ------------------------------- | ---------- | ------------ | ---------------------------------------------------------- |
| `pastoral.concern_routine`      | `in_app`   | routine      | Brief in-app note about a new concern logged               |
| `pastoral.concern_elevated`     | `in_app`   | elevated     | Elevated concern requiring attention within 48 hours       |
| `pastoral.concern_elevated`     | `email`    | elevated     | Email to year head / pastoral coordinator                  |
| `pastoral.concern_urgent`       | `in_app`   | urgent       | Urgent concern requiring immediate attention               |
| `pastoral.concern_urgent`       | `email`    | urgent       | Email to DLP / deputy principal (urgent language)          |
| `pastoral.concern_critical`     | `in_app`   | critical     | Critical concern — immediate action required               |
| `pastoral.concern_critical`     | `email`    | critical     | Email to DLP / principal (critical urgency language)       |
| `pastoral.concern_critical`     | `whatsapp` | critical     | WhatsApp to DLP / principal (pre-approved Twilio template) |
| `pastoral.concern_escalated`    | `in_app`   | escalation   | Auto-escalated from urgent to critical                     |
| `pastoral.concern_escalated`    | `email`    | escalation   | Email notifying escalation due to non-acknowledgement      |
| `pastoral.concern_escalated`    | `whatsapp` | escalation   | WhatsApp for escalated concern                             |
| `pastoral.concern_second_round` | `in_app`   | second round | Second notification — critical concern unacknowledged      |
| `pastoral.concern_second_round` | `email`    | second round | Second-round email to principal                            |

### Template Variables

All templates receive the following variables for interpolation:

```typescript
{
  student_name: string;           // "John D." (first name + last initial for privacy)
  category: string;               // "Emotional", "Child protection", etc.
  severity: string;               // "Routine", "Elevated", "Urgent", "Critical"
  logged_by_name: string;         // Name of the staff member who logged the concern
  concern_date: string;           // Formatted date of concern
  concern_url: string;            // Direct link to concern detail page
  escalation_reason?: string;     // "Not acknowledged within 120 minutes" (escalation templates only)
  notification_round?: number;    // 1 or 2 (second-round templates only)
}
```

### Email Template Urgency Language

**Elevated:**

> Subject: Pastoral Concern — {student_name} ({category})
> Body: A pastoral concern has been logged for {student_name}. Category: {category}. Severity: Elevated. Please review within 48 hours. [View Concern]

**Urgent:**

> Subject: URGENT: Pastoral Concern — {student_name} ({category})
> Body: An urgent pastoral concern has been logged for {student_name}. Category: {category}. This requires your immediate attention. [View Concern Now]

**Critical:**

> Subject: CRITICAL: Pastoral Concern — {student_name} — Immediate Action Required
> Body: A critical pastoral concern has been logged for {student_name}. Category: {category}. Immediate action is required. A mandated report prompt has been generated. [View Concern Now]

**Escalation:**

> Subject: ESCALATED: Pastoral Concern — {student_name} — Auto-escalated to Critical
> Body: A pastoral concern for {student_name} has been automatically escalated from urgent to critical because it was not acknowledged within {timeout_minutes} minutes. Immediate action is required. [View Concern Now]

### WhatsApp Template

WhatsApp messages must use a pre-approved Twilio template. The template should be registered as:

**Template name:** `pastoral_critical_concern`
**Template body:** `CRITICAL pastoral concern for {{1}} ({{2}}). Immediate action required. Open EduPod now: {{3}}`
**Variables:** `{{1}}` = student first name + last initial, `{{2}}` = category, `{{3}}` = concern URL

This template must be submitted and approved in Twilio before critical WhatsApp notifications can be delivered. Until approved, WhatsApp notifications will fall back to email via the existing `NotificationDispatchService.dispatchWhatsApp()` fallback mechanism.

---

## 5. Integration Points

### ConcernService.create() (SW-1B modification)

After persisting the concern and writing the `concern_created` audit event, add:

```
await this.pastoralNotificationService.dispatchForConcern(
  tenantId,
  concern,
  loggedByUserId,
);
```

If the concern severity is `routine`, this creates in-app notifications only. For `elevated`/`urgent`/`critical`, it also enqueues BullMQ jobs.

### ConcernService.getById() (SW-1B modification)

After loading the concern, add the acknowledgement side-effect logic described in Section 3.

### PastoralModule (SW-1B modification)

Add to module imports:

- `BullModule.registerQueue({ name: 'pastoral' })`
- `BullModule.registerQueue({ name: 'notifications' })` (if not already registered)
- `CommunicationsModule` (for `NotificationsService`)

Add to module providers:

- `PastoralNotificationService`

### WorkerModule modifications

Add to queue registrations:

- `QUEUE_NAMES.PASTORAL` with standard retry configuration

Add to providers:

- `PastoralNotifyConcernProcessor`
- `PastoralEscalationTimeoutProcessor`

### Queue Constants

Add to `apps/worker/src/base/queue.constants.ts`:

```typescript
PASTORAL: 'pastoral',
```

---

## 6. Tenant Settings Schema

**Zod schema** (`packages/shared/src/schemas/pastoral-notification.schema.ts`):

```typescript
export const pastoralNotificationRecipientsSchema = z.object({
  routine: z.object({}).optional(),
  elevated: z
    .object({
      user_ids: z.array(z.string().uuid()).default([]),
      fallback_roles: z.array(z.string()).default(['year_head', 'pastoral_coordinator']),
    })
    .optional(),
  urgent: z
    .object({
      user_ids: z.array(z.string().uuid()).default([]),
      fallback_roles: z.array(z.string()).default(['dlp', 'deputy_principal']),
    })
    .optional(),
  critical: z
    .object({
      user_ids: z.array(z.string().uuid()).default([]),
      fallback_roles: z.array(z.string()).default(['dlp', 'principal']),
    })
    .optional(),
});

export const pastoralEscalationSettingsSchema = z.object({
  urgent_timeout_minutes: z.number().int().min(15).max(480).default(120),
  critical_timeout_minutes: z.number().int().min(10).max(120).default(30),
});

export const pastoralSettingsSchema = z.object({
  notification_recipients: pastoralNotificationRecipientsSchema.optional(),
  escalation: pastoralEscalationSettingsSchema.optional(),
  designated_liaison_user_id: z.string().uuid().nullable().optional(),
  deputy_designated_liaison_user_id: z.string().uuid().nullable().optional(),
});
```

---

## Files Created / Modified

| Action | File Path                                                                      | Description                                                                            |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| CREATE | `apps/api/src/modules/pastoral/services/pastoral-notification.service.ts`      | Tiered notification dispatch, recipient resolution, escalation job enqueuing           |
| CREATE | `apps/api/src/modules/pastoral/services/pastoral-notification.service.spec.ts` | Unit tests                                                                             |
| CREATE | `apps/worker/src/processors/pastoral/notify-concern.processor.ts`              | BullMQ processor for `pastoral:notify-concern`                                         |
| CREATE | `apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`          | BullMQ processor for `pastoral:escalation-timeout`                                     |
| CREATE | `packages/shared/src/schemas/pastoral-notification.schema.ts`                  | Zod schemas for job payloads and tenant settings                                       |
| MODIFY | `apps/api/src/modules/pastoral/services/concern.service.ts`                    | Add notification dispatch call in `create()`, add acknowledgement logic in `getById()` |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts`                             | Register BullMQ queues, import CommunicationsModule, add PastoralNotificationService   |
| MODIFY | `apps/worker/src/base/queue.constants.ts`                                      | Add `PASTORAL` queue name                                                              |
| MODIFY | `apps/worker/src/worker.module.ts`                                             | Register `pastoral` queue, add processor providers                                     |
| MODIFY | `packages/shared/src/schemas/index.ts`                                         | Export pastoral notification schemas                                                   |

---

## Test Requirements

### Unit Tests: PastoralNotificationService

**File:** `apps/api/src/modules/pastoral/services/pastoral-notification.service.spec.ts`

| Test                                                                                 | Description                                                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `should create in-app notifications only for routine concerns`                       | Verify only `in_app` channel notifications are created; no email, no WhatsApp; no escalation job enqueued |
| `should create in-app + email notifications for elevated concerns`                   | Verify `in_app` and `email` channel notifications for year head + pastoral coordinator; no escalation job |
| `should create in-app + email + push notifications for urgent concerns`              | Verify all channels except WhatsApp; verify escalation timeout job enqueued with correct delay            |
| `should create in-app + email + push + WhatsApp notifications for critical concerns` | Verify all channels including WhatsApp; verify escalation timeout job enqueued with 30-min default delay  |
| `should resolve recipients from tenant settings user_ids when configured`            | Configure explicit user_ids, verify those are used                                                        |
| `should fall back to role-based recipients when user_ids are empty`                  | Leave user_ids empty, verify fallback roles are resolved                                                  |
| `should exclude the logging user from recipient list`                                | Verify `logged_by_user_id` is not in the notification recipients                                          |
| `should deduplicate recipients`                                                      | Configure a user via both explicit ID and role, verify only one set of notifications created              |
| `should use tenant-configured timeout for urgent escalation delay`                   | Configure `urgent_timeout_minutes = 60`, verify delayed job uses 60-minute delay                          |
| `should use default timeout (120 min) when tenant setting is missing`                | No pastoral escalation settings, verify 120-minute default                                                |
| `should use tenant-configured timeout for critical escalation delay`                 | Configure `critical_timeout_minutes = 15`, verify 15-minute delay                                         |

### Unit Tests: Escalation Timeout Processor

**File:** `apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts`

| Test                                                                                  | Description                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `should skip escalation when concern is already acknowledged`                         | Set `acknowledged_at` before job fires, verify no severity change, no notifications                              |
| `should escalate urgent to critical when unacknowledged`                              | Concern unacknowledged, verify severity updated to 'critical', audit event written with `concern_auto_escalated` |
| `should dispatch critical-level notifications after urgent->critical escalation`      | Verify new notification records created with critical channels                                                   |
| `should enqueue critical_second_round job after urgent->critical escalation`          | Verify a new delayed job is enqueued with `critical_second_round` type                                           |
| `should record critical_concern_unacknowledged event on second round`                 | Second round fires, concern still unacknowledged, verify audit event                                             |
| `should send second-round notifications to principal`                                 | Verify principal receives notification on second round                                                           |
| `should not escalate if concern was acknowledged between escalation and second round` | Set `acknowledged_at` after first escalation but before second round fires                                       |
| `should handle missing concern gracefully`                                            | Concern deleted or not found, verify no error thrown, job completes                                              |

### Unit Tests: Concern Acknowledgement

**File:** Tests added to `apps/api/src/modules/pastoral/services/concern.service.spec.ts`

| Test                                                                   | Description                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `should set acknowledged_at when notification recipient views concern` | View concern as a notified user, verify `acknowledged_at` and `acknowledged_by_user_id` set |
| `should not re-acknowledge on subsequent views`                        | View twice, verify `acknowledged_at` timestamp is from the first view                       |
| `should not acknowledge when viewer is not a notification recipient`   | View as a user who was NOT notified, verify `acknowledged_at` remains NULL                  |
| `should write concern_acknowledged audit event`                        | Verify `pastoral_events` INSERT with `event_type = 'concern_acknowledged'`                  |
| `should cancel pending escalation timeout jobs on acknowledgement`     | Verify `queue.getJob()` called with correct job ID pattern, `job.remove()` called           |
| `should cancel both urgent and critical escalation jobs`               | Verify both possible job IDs are checked                                                    |

### Integration Tests: End-to-End Notification Flow

| Test                                                                              | Description                                                                                                |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `should dispatch notifications when concern is created via API`                   | POST a concern, verify notification records exist in DB                                                    |
| `should escalate and notify when timeout fires for unacknowledged urgent concern` | Create urgent concern, advance time, fire escalation job, verify severity = critical and new notifications |
| `should cancel escalation when concern is viewed by recipient`                    | Create urgent concern, GET concern as recipient, verify escalation job removed                             |

### RLS Leakage Tests

| Test                                                             | Description                                                                           |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Tenant B should not see Tenant A's pastoral notifications`      | Create concern as Tenant A, authenticate as Tenant B, verify no notifications visible |
| `Notification recipients should be scoped to the correct tenant` | Verify recipient resolution only returns users belonging to the concern's tenant      |

---

## Verification Checklist

- [ ] `PastoralNotificationService` correctly dispatches notifications for all four severity levels
- [ ] Routine concerns create only in-app notifications (no email, no WhatsApp)
- [ ] Elevated concerns create in-app + email notifications to year head + pastoral coordinator
- [ ] Urgent concerns create in-app + email + push to DLP + deputy principal
- [ ] Critical concerns create in-app + email + push + WhatsApp to DLP + principal
- [ ] Recipient resolution reads from `tenant_settings.pastoral.notification_recipients` first
- [ ] Recipient resolution falls back to role-based defaults when tenant settings are not configured
- [ ] The concern author (`logged_by_user_id`) is excluded from the notification recipient list
- [ ] Duplicate recipients are deduplicated (no double notifications)
- [ ] Escalation timeout job is enqueued with correct delay for urgent concerns (default 120 min)
- [ ] Escalation timeout job is enqueued with correct delay for critical concerns (default 30 min)
- [ ] Escalation job uses deterministic job ID pattern for cancellation lookup
- [ ] Urgent concern auto-escalates to critical when unacknowledged after timeout
- [ ] Auto-escalation writes `concern_auto_escalated` audit event with correct payload
- [ ] After auto-escalation, a second delayed job (`critical_second_round`) is enqueued
- [ ] Second-round job writes `critical_concern_unacknowledged` audit event when concern remains unacknowledged
- [ ] Second-round job sends additional notification to principal
- [ ] Escalation chain terminates after second round (no infinite escalation loop)
- [ ] Viewing a concern as a notification recipient sets `acknowledged_at` and `acknowledged_by_user_id`
- [ ] Only the first view counts as acknowledgement (subsequent views are no-ops)
- [ ] Non-recipient views do not count as acknowledgement
- [ ] Acknowledgement writes `concern_acknowledged` audit event
- [ ] Acknowledgement cancels pending escalation timeout jobs (both urgent and critical)
- [ ] `PASTORAL` queue is registered in both worker module and API pastoral module
- [ ] All job payloads include `tenant_id` (TenantAwareJob enforcement)
- [ ] All processors extend TenantAwareJob pattern (RLS context set before DB operations)
- [ ] Notification templates exist for all severity levels and channels
- [ ] WhatsApp template uses pre-approved Twilio template format
- [ ] Template fallback works (WhatsApp -> email -> in_app)
- [ ] Zod schemas validate all job payloads
- [ ] All unit tests pass
- [ ] All RLS leakage tests pass
- [ ] `turbo test` passes (full regression suite)
- [ ] `turbo lint` passes
- [ ] `turbo type-check` passes

---

## Edge Cases and Design Decisions

### 1. Race condition: acknowledgement vs escalation job

If a user views the concern at nearly the same time the escalation job fires, the escalation processor re-checks `acknowledged_at` inside its RLS transaction. The `SELECT` on `pastoral_concerns` within the transaction will see the latest state. If `acknowledged_at` is set, escalation is cancelled. This is safe because both operations are within their own interactive Prisma transactions with `SET LOCAL`.

### 2. Concern severity changed manually before escalation fires

If a staff member manually changes severity from `urgent` to `elevated` before the escalation timeout fires, the escalation processor should detect the severity mismatch. The processor checks `concern.severity === 'urgent'` for `urgent_to_critical` escalation type. If severity no longer matches, the job is a no-op (logged and skipped).

### 3. Concern deleted before escalation fires

The processor loads the concern first. If not found, the job completes as a no-op with a warning log. No error is thrown.

### 4. Tenant settings change after escalation job is enqueued

The delay is set at enqueue time based on the tenant settings at that moment. If the tenant changes their timeout setting after the job is enqueued, the change does not affect already-enqueued delayed jobs. This is acceptable -- the timeout was correct at the time the concern was created.

### 5. Push notifications (PWA)

The platform does not currently have a dedicated push notification channel in the `NotificationChannel` enum. Rather than adding a new enum value (which requires a migration), push notifications are implemented as in-app notifications with a `priority: 'high'` flag in `payload_json`. The frontend service worker checks this flag when processing in-app notifications and triggers a browser push notification if the user has granted push permission. This is a frontend concern that can be wired independently of this sub-phase.

### 6. Routine concerns and the "next SST meeting" path

Routine concerns do not trigger any time-sensitive notification. They appear in the next SST meeting's pre-computed agenda (handled in SW-2A). The in-app notification for routine concerns is informational only -- it tells Tier 1 viewers "a concern was logged" without urgency.

### 7. WhatsApp delivery before Twilio template approval

Until the `pastoral_critical_concern` WhatsApp template is approved in Twilio, the existing `NotificationDispatchService.dispatchWhatsApp()` will fail gracefully and create an email fallback notification. This is the existing fallback mechanism in the communications module -- no additional handling is needed.
