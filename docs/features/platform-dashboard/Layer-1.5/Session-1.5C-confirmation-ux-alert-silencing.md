# Session 1.5C: Owner Confirmation UX + Alert Silencing Primitives

**Depends on:** Sessions 1.5A (platform owner identity + permissions) + 1.5B (every action emits audit entries)
**Unlocks:** Layer 2A (alert rule builder UX uses silencing); Layer 2B (multi-channel alerting respects silences before fanning out); Layer 3B/3C (dangerous operator actions reuse the confirmation primitive); Layer 4D (AI Copilot supervised actions reuse the same owner-approved action pattern)

---

## Objective

Ship the safety primitives that work for EduPod's real operating model for the next year: **one human platform owner**.

This session deliberately removes mandatory two-person approval. Requiring a second approver would force the solo operator to create two accounts and approve their own actions, which adds friction without adding real safety. The correct safety model is:

1. The signed-in `platform_owner` can execute any permitted action.
2. High-blast actions require a stronger confirmation step: exact action/target preview, typed confirmation phrase, required reason, optional fresh-auth/MFA check when available, and audit logging.
3. The system never blocks a legitimate solo-owner action because a second platform owner does not exist.

This session delivers:

- **Owner action confirmation** — durable confirmation record for high-blast actions such as global cache flush, queue clean, ownership transfer, tenant-wide force logout, tenant archive, and AI-proposed destructive actions.
- **Alert silencing** — suppress a specific rule, a component, or global non-security alerts for a bounded window while still recording suppressed alerts.
- **Platform alert maintenance windows** — planned alert-suppression windows with a dashboard banner. This is alert noise control, not tenant-facing maintenance mode; Layer 3C owns tenant maintenance mode.

---

## Critical Safety Constraints

- **No fake dual approval.** No endpoint, guard, or UI may require a second platform owner in the solo-operator phase. If future staffing changes, a true multi-approver policy can be added as a separate feature flag, but it is not part of this implementation.
- **High-blast actions still require friction.** The owner must type a confirmation phrase derived from the target, provide a reason, and see a clear before/after or payload preview before execution.
- **Confirmation is not authorization.** `PlatformRoleGuard` and `@RequiresPlatformPermission()` still decide whether the owner may perform the action. Confirmation is an extra safety step after authorization.
- **Action payload is captured at confirmation time.** The audit record stores action kind, target, payload summary, reason, and actor. If the payload changes, a new confirmation is required.
- **Silencing is a write.** Creating/removing silences emits audit entries. Suppressed alerts still land in `platform_alert_history` with `suppressed_by_silence_id` or `suppressed_by_maintenance_window_id`.
- **Maintenance windows do not mask security alerts.** Alert rules marked `is_security_critical` still fire during maintenance windows.

---

## Database

### New Tables

```prisma
model PlatformOwnerActionConfirmation {
  id                   String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actor_user_id         String              @db.Uuid
  action                PlatformAuditAction
  target_resource_type  String              @db.VarChar(60)
  target_resource_id    String?             @db.VarChar(255)
  target_tenant_id      String?             @db.Uuid
  payload_summary       Json                @db.JsonB
  confirmation_phrase   String              @db.VarChar(200)
  reason                String              @db.Text
  confirmed_at          DateTime            @default(now()) @db.Timestamptz()
  executed_at           DateTime?           @db.Timestamptz()
  execution_status      String              @default("pending") @db.VarChar(30)
  execution_result      Json?

  actor                 User                @relation("OwnerActionConfirmationActor", fields: [actor_user_id], references: [id], onDelete: Restrict)

  @@map("platform_owner_action_confirmations")
  @@index([actor_user_id, confirmed_at(sort: Desc)])
  @@index([action, confirmed_at(sort: Desc)])
  @@index([target_tenant_id, confirmed_at(sort: Desc)])
}

model PlatformAlertSilence {
  id                      String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  scope                   PlatformAlertSilenceScope
  alert_rule_id            String?                    @db.Uuid
  component                String?                    @db.VarChar(40)
  reason                  String                     @db.Text
  starts_at                DateTime                   @default(now()) @db.Timestamptz()
  ends_at                  DateTime                   @db.Timestamptz()
  created_by_user_id       String                     @db.Uuid
  created_at               DateTime                   @default(now()) @db.Timestamptz()
  removed_at               DateTime?                  @db.Timestamptz()
  removed_by_user_id       String?                    @db.Uuid
  removed_reason           String?                    @db.Text

  alert_rule               PlatformAlertRule?         @relation(fields: [alert_rule_id], references: [id], onDelete: Cascade)
  created_by               User                       @relation("AlertSilenceCreatedBy", fields: [created_by_user_id], references: [id], onDelete: Restrict)
  removed_by               User?                      @relation("AlertSilenceRemovedBy", fields: [removed_by_user_id], references: [id], onDelete: SetNull)

  @@map("platform_alert_silences")
  @@index([starts_at, ends_at])
  @@index([alert_rule_id])
  @@index([component])
}

model PlatformMaintenanceWindow {
  id                       String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title                    String                     @db.VarChar(200)
  description              String?                    @db.Text
  starts_at                DateTime                   @db.Timestamptz()
  ends_at                  DateTime                   @db.Timestamptz()
  created_by_user_id       String                     @db.Uuid
  cancelled_at             DateTime?                  @db.Timestamptz()
  cancelled_by_user_id     String?                    @db.Uuid
  created_at               DateTime                   @default(now()) @db.Timestamptz()

  created_by               User                       @relation("MaintenanceWindowCreatedBy", fields: [created_by_user_id], references: [id], onDelete: Restrict)
  cancelled_by             User?                      @relation("MaintenanceWindowCancelledBy", fields: [cancelled_by_user_id], references: [id], onDelete: SetNull)

  @@map("platform_maintenance_windows")
  @@index([starts_at, ends_at])
}

enum PlatformAlertSilenceScope {
  single_rule
  component
  global
}
```

### Modified Tables

`PlatformPermission` from Session 1.5A should use:

```prisma
requires_owner_confirmation Boolean @default(false)
```

Do not use `requires_two_person`. That name encodes the wrong operating model.

`PlatformAlertRule` gains `is_security_critical Boolean @default(false)`.

`PlatformAlertHistory` gains nullable `suppressed_by_silence_id` and `suppressed_by_maintenance_window_id`.

---

## API + Service Layer

### `PlatformOwnerActionConfirmationService`

```ts
@Injectable()
export class PlatformOwnerActionConfirmationService {
  async confirmAndExecute(input: {
    actor_user_id: string;
    action: PlatformAuditAction;
    target_resource_type: string;
    target_resource_id?: string;
    target_tenant_id?: string;
    payload: unknown;
    confirmation_phrase: string;
    typed_confirmation: string;
    reason: string;
  }): Promise<{ confirmation_id: string; execution_status: 'executed' | 'failed' }>;
}
```

The service verifies:

- Actor has the required permission.
- `typed_confirmation === confirmation_phrase`.
- `reason` is present and meaningful.
- The action has a registered executor.

Initial executors:

- `cache_flushed_global`
- `queue_cleaned`
- `tenant_ownership_transferred`
- `session_force_logged_out_tenant`
- `tenant_archived`

Layer 2/3/4 sessions add executors as their action surfaces ship.

### New Controllers

```
POST /v1/admin/action-confirmations -> confirm + execute a high-blast action
GET  /v1/admin/action-confirmations -> list recent confirmations

POST   /v1/admin/alert-silences
DELETE /v1/admin/alert-silences/:id
GET    /v1/admin/alert-silences

POST   /v1/admin/alert-maintenance-windows
DELETE /v1/admin/alert-maintenance-windows/:id
GET    /v1/admin/alert-maintenance-windows
```

Use `alert-maintenance-windows` to avoid colliding with Layer 3C's tenant maintenance-mode windows.

---

## Frontend

### Shared Component: `<OwnerActionConfirmDialog>`

Used by every destructive/high-blast UI.

It renders:

- Human-readable action summary.
- Target name/id.
- Payload preview or before/after summary.
- Required typed phrase, for example `ARCHIVE NHQS Pilot`.
- Required reason textarea.
- Final "Confirm and execute" button.

### Other UI

- `/admin/alerts/silences` — active silences + create form.
- `/admin/maintenance` — platform alert maintenance windows + active banner.
- `<ActiveSilenceBanner>` and `<MaintenanceBanner>` in the platform layout.

---

## Tests

- `owner-action-confirmation.service.spec.ts`: phrase mismatch blocked; missing reason blocked; permitted owner executes; audit entries written; executor failure captured.
- `alert-silence.service.spec.ts`: scoped silences match correct rules; expired silences do not suppress; removed silences stop suppressing.
- `maintenance-window.service.spec.ts`: active window detection; security-critical rules exempt.
- E2E: signed-in platform owner confirms queue clean with phrase + reason → executor runs → audit and confirmation rows exist.
- Static check: destructive Layer 2/3/4 frontend surfaces use `<OwnerActionConfirmDialog>` or an explicit lower-risk confirmation component.

---

## Acceptance

- [x] No two-person/second-approver requirement exists in this session.
- [x] `requires_owner_confirmation` is the permission flag for high-blast actions.
- [x] `PlatformOwnerActionConfirmationService` exists with executor registry.
- [x] `<OwnerActionConfirmDialog>` exists and is used by at least one existing destructive UI.
- [x] At least 5 action executors registered: global cache flush, queue clean, ownership transfer, tenant-wide force logout, tenant archive.
- [x] `PlatformAlertSilenceService` exists and integrates with 1C's alert evaluation cron.
- [x] `PlatformMaintenanceWindowService` exists for alert-suppression windows; active window suppresses non-security-critical alerts; security-critical rules exempt.
- [x] Platform alert maintenance endpoints use `/v1/admin/alert-maintenance-windows`, not `/v1/admin/maintenance-windows`.
- [x] All owner-confirmed actions emit platform audit entries with reason and target.
- [x] `docs/architecture/danger-zones.md` gains DZ-PA-4: solo-owner confirmations must never require fake second accounts.

---

## Notes

- This is intentionally solo-operator friendly. If EduPod later has a real ops team, add multi-approver policy as a new session/feature flag instead of smuggling it into the solo phase.
- The confirmation phrase is not a security boundary by itself; it prevents accidental clicks and forces the owner to look at the exact target. Authorization still comes from RBAC.
- Layer 4D AI actions reuse this exact owner confirmation path. The AI proposes; Ram confirms; the executor runs. No autonomous execution and no fake second account.

## Commits / CI / Notes

- Commits:
  - `c003e7b8` - `feat(platform): add owner confirmations and alert silencing`
  - `af90b5c9` - `test(platform): cover alert suppression controllers`
- CI:
  - Initial run `25964040691`: failed in `unit-tests-merge` because API line coverage was `88.80%` against the `89%` threshold.
  - Fix-forward/deploy run `25964354027`: passed and deployed via CI (`https://github.com/ACANOTES-dev/EduPod/actions/runs/25964354027`).
- Production smoke: 2026-05-16 passed on `https://dua.edupod.app`.
  - Confirmed platform dashboard, tenant list/detail, tenant onboarding tracker, health, alerts, alert silences, alert maintenance banner/page, platform users, permissions, queue owner-confirmation dialog, tenant audit, platform audit ledger, error log, and redaction rules loaded.
  - Confirmed owner confirmation UX on queue failed-job delete without executing a production delete.
  - Created and removed a test alert silence, scheduled and cancelled a test maintenance window, and confirmed corresponding platform audit ledger entries.
  - Confirmed no active smoke alert silences or maintenance windows remained after cleanup.
