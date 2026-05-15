# Session 1.5C: Confirmation UX + Alert Silencing Primitives

**Depends on:** Sessions 1.5A (uses `platform_users` for the secondary-approver list) + 1.5B (every action emits audit entries)
**Unlocks:** Layer 2A (alert rule builder UX uses silencing); Layer 2B (multi-channel alerting respects silences before fanning out); Layer 3B (support toolkit destructive actions use the confirmation primitives); Layer 3C (cache flush global, force logout tenant, maintenance mode all use two-person + maintenance-window infra); Layer 4D (AI Copilot supervised actions reuse the confirmation pattern)

---

## Objective

Three small but cross-cutting deliverables that the rest of the dashboard reuses:

1. **Two-person approval primitive** — for high-blast actions flagged `requires_two_person: true` in the permission catalogue (cache flush global, queue clean, ownership transfer, force-logout tenant, AI-Copilot-proposed destructive actions). Operator A initiates → email goes to all platform_owners → Operator B clicks the link → action executes. Stored as `platform_two_person_requests` with status + payload + expiration.

2. **Alert silencing** — operator can suppress a specific rule, all rules for a component (e.g., "all Redis alerts"), or globally. Time-bounded (default: 1 hour, configurable up to 7 days). Silenced alerts still fire to the audit log but do NOT dispatch via email/Telegram/etc. Stored as `platform_alert_silences`. The 1C alert evaluation cron consults silences before publishing.

3. **Maintenance windows** — pre-scheduled time periods during which all alerts are suppressed AND a banner appears in the dashboard. Operator schedules in advance ("Sunday 02:00–04:00 UTC for DB upgrade"). Stored as `platform_maintenance_windows`. Layer 3C's "maintenance mode" is the immediate-now version of this; this session ships the scheduled version.

After this session, no destructive Layer 2/3 action ships without a confirmation modal; no alert storm during planned work without a clean silence flow; and Layer 4's AI Copilot has a clean handoff path for supervised actions.

---

## Critical safety constraints

- **Two-person approval cannot be self-approved.** Operator A (initiator) is excluded from the approver pool. If only one platform_owner exists, the action is BLOCKED with a clear error: "This action requires a second platform_owner. Invite one before proceeding." (No fallback to "single-operator mode" — tempting but defeats the safety property.)
- **Approval requests expire.** Default 30 minutes; configurable per action. Expired requests cannot be approved; operator must re-initiate. Prevents "approved last week, executed today" surprise.
- **The action payload is captured at INITIATE time, executed verbatim at APPROVE time.** Operator A cannot modify the payload after initiating. If they need a different payload, reject the existing request and initiate a new one.
- **Silencing is a write — not just a config flip.** Every silence creation is an audit entry. Every silence removal is an audit entry. Every alert that WOULD HAVE fired but was suppressed by a silence is still recorded in `platform_alert_history` with `suppressed_by_silence_id` populated, so retrospective analysis sees what happened.
- **Maintenance windows do NOT mask security alerts.** A separate flag `is_security_critical` on alert rules; rules with this flag fire even during maintenance windows. Examples: "RLS query rejected", "audit chain hash break detected", "platform_user invited from unfamiliar IP". Operator can disable specific security rules manually but the maintenance window doesn't.
- **Two-person email contains no payload preview by default** — only "Operator A wants to perform action X on resource Y. [Approve] [Reject]" with a link. Payload is shown to Operator B inside the dashboard, not in email (reduces leak surface if email is compromised).

---

## Database

### New tables

```prisma
model PlatformTwoPersonRequest {
  id                  String                              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  initiator_user_id   String                              @db.Uuid
  approver_user_id    String?                             @db.Uuid           // populated on approve
  action              PlatformAuditAction                 // mirrors the audit action enum
  target_resource_type String                             @db.VarChar(60)
  target_resource_id  String?                             @db.VarChar(255)
  target_tenant_id    String?                             @db.Uuid
  payload             Json                                @db.JsonB          // captured at initiate; executed verbatim at approve
  reason              String                              @db.Text           // initiator's explanation (required)
  status              PlatformTwoPersonRequestStatus      @default(pending)
  initiated_at        DateTime                            @default(now()) @db.Timestamptz()
  expires_at          DateTime                            @db.Timestamptz()  // initiated_at + configured TTL (default 30min)
  resolved_at         DateTime?                           @db.Timestamptz()
  rejection_reason    String?                             @db.Text

  initiator           User                                @relation("TwoPersonInitiator", fields: [initiator_user_id], references: [id], onDelete: Restrict)
  approver            User?                               @relation("TwoPersonApprover", fields: [approver_user_id], references: [id], onDelete: SetNull)

  @@map("platform_two_person_requests")
  @@index([status, expires_at])
  @@index([initiator_user_id, initiated_at(sort: Desc)])
}

enum PlatformTwoPersonRequestStatus {
  pending
  approved
  rejected
  expired
  executed
  failed
}

model PlatformAlertSilence {
  id                String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scope             PlatformAlertSilenceScope
  alert_rule_id     String?                      @db.Uuid          // populated when scope = single_rule
  component         String?                      @db.VarChar(40)   // populated when scope = component (e.g., 'postgres', 'redis')
  reason            String                       @db.Text
  starts_at         DateTime                     @default(now()) @db.Timestamptz()
  ends_at           DateTime                     @db.Timestamptz()
  created_by_user_id String                      @db.Uuid
  created_at        DateTime                     @default(now()) @db.Timestamptz()
  removed_at        DateTime?                    @db.Timestamptz()
  removed_by_user_id String?                     @db.Uuid
  removed_reason    String?                      @db.Text

  alert_rule        PlatformAlertRule?           @relation(fields: [alert_rule_id], references: [id], onDelete: Cascade)
  created_by        User                         @relation("AlertSilenceCreatedBy", fields: [created_by_user_id], references: [id], onDelete: Restrict)
  removed_by        User?                        @relation("AlertSilenceRemovedBy", fields: [removed_by_user_id], references: [id], onDelete: SetNull)

  @@map("platform_alert_silences")
  @@index([starts_at, ends_at])
  @@index([alert_rule_id])
  @@index([component])
}

enum PlatformAlertSilenceScope {
  single_rule
  component
  global
}

model PlatformMaintenanceWindow {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title             String           @db.VarChar(200)
  description       String?          @db.Text
  starts_at         DateTime         @db.Timestamptz()
  ends_at           DateTime         @db.Timestamptz()
  created_by_user_id String          @db.Uuid
  cancelled_at      DateTime?        @db.Timestamptz()
  cancelled_by_user_id String?       @db.Uuid
  created_at        DateTime         @default(now()) @db.Timestamptz()

  created_by        User             @relation("MaintenanceWindowCreatedBy", fields: [created_by_user_id], references: [id], onDelete: Restrict)
  cancelled_by      User?            @relation("MaintenanceWindowCancelledBy", fields: [cancelled_by_user_id], references: [id], onDelete: SetNull)

  @@map("platform_maintenance_windows")
  @@index([starts_at, ends_at])
}
```

### Modified table (from 1C)

```prisma
model PlatformAlertRule {
  // ... existing fields ...
  is_security_critical  Boolean   @default(false)   // exempt from maintenance window suppression
  suppressed_by_silence_ids  String[]  @default([])  // populated by alert evaluation when suppression hits

  // ... existing relations ...
  silences  PlatformAlertSilence[]
}
```

### Modified table (from 1C)

```prisma
model PlatformAlertHistory {
  // ... existing fields ...
  suppressed_by_silence_id  String?  @db.Uuid  // populated when alert WOULD have fired but a silence intercepted
  suppressed_by_maintenance_window_id  String?  @db.Uuid  // populated when alert WOULD have fired but a maintenance window intercepted
}
```

---

## API + service layer

### `PlatformTwoPersonService`

```ts
@Injectable()
export class PlatformTwoPersonService {
  /**
   * Initiate a two-person request. Returns the request id. Sends email
   * to all platform_owners except the initiator with the approve/reject link.
   */
  async initiate(input: {
    initiator_user_id: string;
    action: PlatformAuditAction;
    target_resource_type: string;
    target_resource_id?: string;
    target_tenant_id?: string;
    payload: unknown;
    reason: string;
    ttl_minutes?: number; // default 30
  }): Promise<{ request_id: string; expires_at: Date }> {
    /* ... */
  }

  /**
   * Approve a pending request. Verifies approver !== initiator.
   * Verifies request not expired. Executes the action via the
   * registered ActionExecutor for that action enum.
   * Records audit entry for the approval AND the execution.
   */
  async approve(request_id: string, approver_user_id: string): Promise<void> {
    /* ... */
  }

  /**
   * Reject a pending request with optional reason.
   */
  async reject(request_id: string, rejector_user_id: string, reason?: string): Promise<void> {
    /* ... */
  }
}
```

### Action executor registry

`apps/api/src/modules/platform-two-person/action-executors/`:

One executor per `PlatformAuditAction` value that requires two-person. Each implements:

```ts
interface PlatformTwoPersonActionExecutor {
  action: PlatformAuditAction;
  execute(
    payload: unknown,
    context: { approver_user_id: string; initiator_user_id: string },
  ): Promise<void>;
}
```

Initial executors (ship in this session):

- `cache_flushed_global` → calls `RedisService.flushAll()` with audit
- `queue_cleaned` → calls BullMQ queue `clean()` with audit
- `tenant_ownership_transferred` → existing service method, wrapped
- `session_force_logged_out_tenant` → mass session invalidation
- `tenant_archived` → existing service method, wrapped

Layer 2/3/4 sessions REGISTER additional executors as they ship. The executor registry is open-ended; new actions don't need to modify this session.

### `PlatformAlertSilenceService`

```ts
@Injectable()
export class PlatformAlertSilenceService {
  async create(input: {
    scope;
    alert_rule_id?;
    component?;
    ends_at;
    reason;
    created_by_user_id;
  }): Promise<PlatformAlertSilence>;
  async remove(silence_id: string, remover_user_id: string, reason?: string): Promise<void>;

  /**
   * Called by the alert evaluation cron (1C). Returns true if any
   * matching silence is active.
   */
  async isAlertSilenced(
    rule: PlatformAlertRule,
    now: Date,
  ): Promise<{ silenced: boolean; silence_id?: string }>;
}
```

### `PlatformMaintenanceWindowService`

```ts
@Injectable()
export class PlatformMaintenanceWindowService {
  async create(input: {
    title;
    description?;
    starts_at;
    ends_at;
    created_by_user_id;
  }): Promise<PlatformMaintenanceWindow>;
  async cancel(window_id: string, canceller_user_id: string): Promise<void>;

  /**
   * Returns the active window if any. Used by alert evaluation AND
   * surfaced in the dashboard layout via WebSocket.
   */
  async getActiveWindow(now: Date): Promise<PlatformMaintenanceWindow | null>;
}
```

### Alert evaluation integration (modifies 1C's evaluator)

Inside 1C's `AlertEvaluationService.evaluate(rule)`:

```ts
// Before publishing the alert
if (!rule.is_security_critical) {
  const window = await this.maintenance.getActiveWindow(new Date());
  if (window) {
    await this.alertHistory.recordSuppressed(rule, { window_id: window.id });
    return;
  }
}

const silence = await this.silences.isAlertSilenced(rule, new Date());
if (silence.silenced) {
  await this.alertHistory.recordSuppressed(rule, { silence_id: silence.silence_id });
  return;
}

// Existing publish logic continues
```

### New controllers

```
POST   /v1/admin/two-person-requests                       -> @RequiresPlatformPermission(varies by action) + initiate
POST   /v1/admin/two-person-requests/:id/approve           -> @RequiresPlatformPermission(matches request action) + approve
POST   /v1/admin/two-person-requests/:id/reject            -> @RequiresPlatformPermission(matches request action) + reject
GET    /v1/admin/two-person-requests                       -> list pending requests for the current operator (their own + ones awaiting their approval)

POST   /v1/admin/alert-silences                            -> @RequiresPlatformPermission('platform.alerts.silence')
DELETE /v1/admin/alert-silences/:id                        -> @RequiresPlatformPermission('platform.alerts.silence')
GET    /v1/admin/alert-silences                            -> @RequiresPlatformPermission('platform.alerts.view')

POST   /v1/admin/maintenance-windows                       -> @RequiresPlatformPermission('platform.maintenance.toggle')
DELETE /v1/admin/maintenance-windows/:id                   -> @RequiresPlatformPermission('platform.maintenance.toggle')
GET    /v1/admin/maintenance-windows                       -> @RequiresPlatformPermission('platform.alerts.view')
```

### Cleanup cron

Daily at 04:45 UTC: mark `pending` two-person requests where `expires_at < now()` as `expired`. Audit-log per expiration.

---

## Frontend

### Shared component: `<TwoPersonConfirmationDialog>`

`apps/web/src/components/platform-admin/two-person-confirmation-dialog.tsx`:

```tsx
interface TwoPersonConfirmationDialogProps {
  action: PlatformAuditAction;
  targetDescription: string; // human-readable target
  payload: unknown; // sent to the API verbatim
  onComplete?: () => void;
}
```

Renders a modal with:

- Action description ("This will permanently archive tenant 'NHQS Pilot'.")
- Payload preview (JSON pretty-printed)
- "Reason" textarea (required, min 10 chars)
- "Initiate approval request" button → POSTs to `/v1/admin/two-person-requests`
- After initiation: shows the request id + a list of platform_owners who can approve

Used by every Layer 2/3/4 destructive action UI.

### Single-step confirmation: `<DestructiveConfirmDialog>`

For actions flagged `is_destructive: true` but NOT `requires_two_person`, use a simpler confirm-with-reason modal. Same `reason` capture; no second-approver flow.

### New pages

`apps/web/src/app/[locale]/(platform)/admin/two-person-requests/page.tsx`:

- Tabbed view: "Awaiting my approval" | "My pending requests" | "Recent (last 7 days)".
- Each row: action, target, initiator, initiated_at, expires_at, status.
- Approve / Reject buttons inline for "Awaiting my approval" tab.

`apps/web/src/app/[locale]/(platform)/admin/alerts/silences/page.tsx`:

- Active silences list + "Add silence" button.
- Form: scope (single_rule / component / global), duration, reason.

`apps/web/src/app/[locale]/(platform)/admin/maintenance/page.tsx`:

- Active window banner (if any).
- Scheduled windows table (future).
- Past windows table (history).
- "Schedule new" button.

### Layout banner

Dashboard header gains a `<MaintenanceBanner>` component:

- Visible to all platform users when an active window exists.
- Visible to all tenant users (in a separate, less prominent form) when an active window exists AND the window has `notify_tenants: true` (added field; default false).
- Pulled in real-time via the existing platform WebSocket — when a window starts/ends, the banner appears/disappears without page refresh.

---

## Tests

### Unit

- `platform-two-person.service.spec.ts`: initiate → email sent to other platform_owners; self-approval blocked; expired requests cannot be approved; payload integrity preserved across initiate/approve cycle.
- `alert-silence.service.spec.ts`: scoped silences match correct rules; expired silences don't suppress; cascade on rule deletion works.
- `maintenance-window.service.spec.ts`: active window detection; security-critical rules exempt.

### Integration

- E2E: operator A initiates "queue clean" → operator B receives email (mocked Resend) → B approves → queue cleaned → audit entries for initiate, approve, execute all present.
- E2E: silence created → matching alert rule fires during silence → alert is recorded as suppressed in history but no email/dispatch happens.
- E2E: maintenance window scheduled for next 2 hours → during window, non-security alerts suppressed; security-critical alert (audit chain hash break) still fires.

### Static analysis

- A new spec scans Layer 2/3/4 controllers for endpoints that map to `is_destructive: true` permissions. Asserts each has a corresponding frontend component using `<DestructiveConfirmDialog>` or `<TwoPersonConfirmationDialog>`. (Best-effort heuristic — pragmatic check.)

---

## Acceptance

- [ ] `PlatformTwoPersonService` exists with initiate/approve/reject. Self-approval blocked. Expiration enforced.
- [ ] At least 5 action executors registered (cache_flushed_global, queue_cleaned, tenant_ownership_transferred, session_force_logged_out_tenant, tenant_archived).
- [ ] `<TwoPersonConfirmationDialog>` component exists and is used by at least one existing destructive UI (recommend: tenant archive button).
- [ ] `<DestructiveConfirmDialog>` exists for non-two-person destructive actions.
- [ ] `PlatformAlertSilenceService` exists and integrates with 1C's alert evaluation cron.
- [ ] `PlatformMaintenanceWindowService` exists; active window suppresses non-security-critical alerts; security-critical rules exempt.
- [ ] `<MaintenanceBanner>` renders in real-time via WebSocket when a window starts/ends.
- [ ] Frontend pages: `/admin/two-person-requests`, `/admin/alerts/silences`, `/admin/maintenance` all functional.
- [ ] Email to second approver does NOT include payload (only the action description).
- [ ] All actions emit audit entries (initiate, approve, reject, expire, execute).
- [ ] `docs/architecture/danger-zones.md` gains DZ-PA-4 (two-person self-approval impossible — single-operator deployments need a second platform_owner before this primitive is usable).

---

## Notes

- The two-person flow's "single-operator block" is the most contentious safety call. The alternative — falling back to single-operator confirmation when only one owner exists — defeats the safety property when it matters most (the early days when the operator is alone). The right fix is "invite a second platform_owner before you need to do something dangerous." Layer 1.5A's invitation flow makes this 30 seconds of work.
- The action executor registry is intentionally open-ended. Layer 2/3/4 sessions add executors without touching this session's code. Each new executor lands as part of its own session's PR.
- Alert silencing UX should support quick presets ("Silence for 1 hour", "Silence for the next maintenance window"). Form complexity stays low.
- The `notify_tenants: true` flag on maintenance windows is a Layer 3 concern (the tenant-facing banner). Schema includes it now; UI for setting it ships in Layer 3.
- Layer 4D's AI Copilot supervised actions reuse `PlatformTwoPersonService.initiate()` directly — the AI is the "initiator," operator is the "approver." Same audit trail. Same expiration semantics. Means the AI can never execute a two-person action by itself even if granted unbounded permissions.
