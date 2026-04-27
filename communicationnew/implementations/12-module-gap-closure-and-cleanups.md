# Implementation 12 — Module Gap Closure + Cleanups

> **Wave:** 4
> **Depends on:** 03 (services + controllers + tests). Wave 3 services exist but are not strictly required: this impl talks to the existing `NotificationsService.createBatch()` API, not the new credential layer.
> **Restart targets:** API + worker + web (per IMPLEMENTATION_LOG.md §3 restart-target matrix).
> **Deployment:** Worktree commit only — NO CI, NO PRODUCTION (per IMPLEMENTATION_LOG.md Rule 5).

---

## Goal

Close every existing communications gap in the codebase. After this impl ships:

1. **No module writes directly to the `notification` table.** Finance is the last offender; this impl migrates `payment-reminders.service.ts` (4 sites) onto `NotificationsService.createBatch()`.
2. **Every comms touchpoint that should fire actually fires.** Auth password reset (a stub since Phase 7), password-changed (new), trips invitations + payment reminders, school closures, staff leave decisions, health incidents, SEN EHA updates — all wired through the canonical service.
3. **The frontend's `'push'` channel mismatch is removed.** The settings UI and the parent communication preferences both expose a channel that the backend dispatch layer has never supported. We replace `'push'` with `'whatsapp'` everywhere it appears in `apps/web/`.
4. **The `NotificationTemplate.channel` type union matches reality.** It currently lies — declares `'email' | 'whatsapp' | 'in_app'` while the backend dispatches and seeds `'sms'` rows for years. We add `'sms'` and fix the consumers.
5. **Every new notification type has a seed template.** EN and AR, subject and body, all four channels (the seeder strips subject for SMS/WhatsApp like `cover-notification-templates.ts` does).

This is the last code-level cleanup before Wave 5 backfills tenant configs. After this impl, the comms surface is internally consistent: backend types, frontend types, seed data, and dispatch behaviour all align.

### Scope clarifications confirmed against the codebase

The session that wrote this spec verified the following before locking it in:

- **`apps/api/src/modules/trips/`** is a placeholder module today (just `trips.module.ts` + `audience/trip-roster.provider.ts`). It does **not** own a domain service that creates trip records or trip fees. Wiring `trip.invitation` and `trip.payment_due` therefore falls into "**document as gap**" per spec point 11 — we add the notification type constants and seed templates so the surface is ready, but we do **not** invent a `trips/trips.service.ts` to call from. The session executing Impl 12 confirms this is still the case before deciding whether to create skeletons or document as gap (see §3.5).
- **`apps/api/src/modules/health/`** is the **system health monitoring** service (queue depth, pgbouncer, disk). There is no student-medical / nurse-visit / health-incident module in the codebase. Same treatment: add `health.incident` constant + templates, document the wiring as a gap.
- **`apps/api/src/modules/sen/`** exists with full domain services (support plans, accommodations, EHA via the support-plan lifecycle), but no `eha-update-notifier.service.ts` exists today. SEN support-plan transitions live in `sen-support-plan.service.ts` lines 429–467. We can wire here directly — see §3.7.
- **`apps/api/src/modules/leave/`** has `leave-requests.service.ts:182` (`approve`) and `:235` (`reject`) — concrete and ready to wire. See §3.6.
- **`apps/api/src/modules/school-closures/`** has `school-closures.service.ts:47` (`create`) and `:100` (the bulk-create flow). Both are ready to wire. See §3.5.
- **The `NotificationsService` in `apps/api/src/modules/communications/notifications.service.ts:149` exposes `createBatch(tenantId, notifications[])`** — that is the canonical API every other module already uses (homework, gradebook, attendance, etc.). The PLAN.md text says `NotificationsService.dispatch(...)` but that method does not exist. We use `createBatch` to match the ten existing call sites in the codebase. The shape of each input is `CreateNotificationInput` (see notifications.service.ts:16-25), which already covers `tenant_id`, `recipient_user_id`, `channel`, `template_key`, `locale`, `payload_json`, `source_entity_type`, `source_entity_id`. No service signature changes needed.

This is a deliberate scope adjustment: the spec's intent ("every comms touchpoint goes through `NotificationsService`") holds, but the call shape is `createBatch([{...}])` not `dispatch({...})`.

---

## What to change

### 1. Finance migration — remove the direct DB write

#### 1.1 The four trigger sites

`apps/api/src/modules/finance/payment-reminders.service.ts` writes directly to the `notification` table at lines 219–233 (inside the helper `dispatchReminder`). The helper is called from three public methods:

- Line 19 — `sendDueSoonReminders(tenantId)` calls `dispatchReminder(tenantId, invoice.id, 'due_soon', channel)` at line 52.
- Line 62 — `sendOverdueReminders(tenantId)` calls `dispatchReminder(...)` at line 91.
- Line 101 — `sendFinalNotices(tenantId)` calls `dispatchReminder(...)` at line 129.
- Line 220 — `prisma.notification.create({...})` inside the helper itself.

The PLAN.md's "4 direct-write sites" is the three callers + the helper. We migrate all of them to `NotificationsService.createBatch()`.

#### 1.2 Migration shape

`PaymentRemindersService` is currently constructor-injected with `PrismaService` and `SettingsService`. Add `NotificationsService` as a third dep:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly settingsService: SettingsService,
  private readonly notificationsService: NotificationsService,
) {}
```

The helper rewrites to (a) keep its `invoiceReminder` dedup write, (b) build the `CreateNotificationInput[]` array, (c) delegate to `notificationsService.createBatch(tenantId, inputs)`, and (d) drop the direct `prisma.notification.create` block. The `// eslint-disable-next-line school/no-cross-module-prisma-access` comment goes away with the call it was suppressing.

```typescript
private async dispatchReminder(
  tenantId: string,
  invoiceId: string,
  reminderType: 'due_soon' | 'overdue' | 'final_notice',
  channel: string,
): Promise<void> {
  try {
    const channelValues = channel === 'both' ? ['email', 'whatsapp'] : [channel];

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
      select: {
        id: true,
        invoice_number: true,
        due_date: true,
        balance_amount: true,
        currency_code: true,
        household: {
          select: {
            household_name: true,
            billing_parent: { select: { user_id: true } },
          },
        },
      },
    });

    if (!invoice) {
      this.logger.warn(`dispatchReminder: invoice ${invoiceId} not found for tenant ${tenantId}`);
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { default_locale: true },
    });
    const locale = tenant?.default_locale ?? 'en';
    const recipientUserId = invoice.household?.billing_parent?.user_id ?? null;

    const templateKey = `payment_reminder_${reminderType}`;
    const payload = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      due_date: invoice.due_date.toISOString(),
      balance_amount: Number(invoice.balance_amount),
      currency_code: invoice.currency_code,
      household_name: invoice.household?.household_name ?? null,
      reminder_type: reminderType,
    };

    // Build dedup rows + notification inputs in a single pass.
    const dedupRows: Array<{ channel: 'email' | 'sms' | 'whatsapp' | 'in_app' }> = [];
    const notifications: CreateNotificationInput[] = [];
    for (const ch of channelValues) {
      dedupRows.push({ channel: ch as 'email' | 'sms' | 'whatsapp' | 'in_app' });
      if (!recipientUserId) continue;
      notifications.push({
        tenant_id: tenantId,
        recipient_user_id: recipientUserId,
        channel: ch,
        template_key: templateKey,
        locale,
        payload_json: payload,
        source_entity_type: 'invoice',
        source_entity_id: invoiceId,
      });
    }

    // Dedup rows still go through the local invoiceReminder table — this is a
    // finance-domain dedup ledger, not a comms artifact.
    for (const row of dedupRows) {
      await this.prisma.invoiceReminder.create({
        data: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
          reminder_type: reminderType as never,
          channel: row.channel as never,
          sent_at: new Date(),
        },
      });
    }

    if (notifications.length === 0) {
      this.logger.warn(
        `dispatchReminder: no billing parent user for invoice ${invoiceId} — dedup row written, notifications skipped`,
      );
    } else {
      await this.notificationsService.createBatch(tenantId, notifications);
    }

    this.logger.log(
      `Reminder dispatched: invoice=${invoiceId} type=${reminderType} channel=${channel} recipient=${recipientUserId ?? 'none'}`,
    );
  } catch (error: unknown) {
    this.logger.error(`Failed to dispatch reminder for invoice ${invoiceId}`, error);
  }
}
```

The helper **stays** — the spec said "delete the helper", but the helper aggregates dedup-write + notification-dispatch behaviour that the three callers all need. What we delete is the **direct `prisma.notification.create` block** at lines 220–233. The helper becomes a thin orchestrator over `notificationsService.createBatch`. This is more honest than deleting the helper and inlining the same logic three times.

If the executing session prefers a literal interpretation (delete the helper, inline its behaviour into `sendDueSoonReminders` / `sendOverdueReminders` / `sendFinalNotices`), that is acceptable and the inline call sites use exactly the same `createBatch` shape. The architectural invariant — no direct `prisma.notification.create` from finance — is what matters; whether the inlined or helper-shaped version ships is a code-style call.

#### 1.3 Module wiring

`FinanceModule` (or whichever module owns `PaymentRemindersService` — verify with `grep "PaymentRemindersService" apps/api/src/modules/**/*.module.ts`) gains a `CommunicationsModule` import:

```typescript
imports: [..., CommunicationsModule],
```

`CommunicationsModule` already exports `NotificationsService` (verify by reading `apps/api/src/modules/communications/communications.module.ts` `exports` array). If it does not, add it to the exports — but the homework / attendance / behaviour / gradebook modules all already import `CommunicationsModule` for the same dependency, so this is almost certainly already in place.

Run the AppModule DI smoke (Rule 6) before committing.

#### 1.4 Verification: no direct writes anywhere else

`grep -rn "prisma.notification.create\b" apps/api/src` after the migration. The only remaining hits should be inside `apps/api/src/modules/communications/` (where the canonical write lives — the `NotificationsService.createBatch` method itself uses `prisma.notification.createMany`, which is the legitimate consumer). Any other hit is a regression and must be fixed in this same impl.

Same audit for `prisma.notification.createMany` — only `notifications.service.ts:163` should appear.

### 2. Auth — wire the password reset email

#### 2.1 Add the notification type

`packages/shared/src/constants/notification-types.ts` currently lists 17 types. Append two new entries:

```typescript
export const NOTIFICATION_TYPES = [
  'invoice.issued',
  'payment.received',
  'payment.failed',
  'report_card.published',
  'attendance.exception',
  'attendance.absent',
  'attendance.late',
  'attendance.left_early',
  'attendance.pattern_detected',
  'admission.status_change',
  'announcement.published',
  'approval.requested',
  'approval.decided',
  'inquiry.new_message',
  'payroll.finalised',
  'payslip.generated',
  'parent.daily_digest',
  // ─── Added by Impl 12 ────────────────────────────────────────────────────
  'auth.password_reset',
  'auth.password_changed',
  'trip.invitation',
  'trip.payment_due',
  'school.closure',
  'staff.leave_decision',
  'health.incident',
  'sen.eha_update',
] as const;
```

This file is on the shared-file claim list (Rule 17). Append the Wave-4 ownership claim to `IMPLEMENTATION_LOG.md` §5 before editing.

#### 2.2 Wire the existing `PasswordResetService.requestPasswordReset`

`apps/api/src/modules/auth/auth-password-reset.service.ts:21` is the entry. Today it generates a `rawToken`, persists the SHA-256 hash, logs an audit row, and returns. Line 61 has the comment `// Note: actual email sending deferred to Phase 7`. We wire the email here.

```typescript
// apps/api/src/modules/auth/auth-password-reset.service.ts
import { ConfigService } from '@nestjs/config';

import { NotificationsService } from '../communications/notifications.service';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly sessionService: SessionService,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return success to avoid leaking user existence
    if (!user) {
      await this.securityAuditService.logPasswordReset(null, 'email', email);
      return { message: 'If email exists, reset link sent' };
    }

    // ... existing rate-limit + token-generation logic stays as-is ...

    // After persisting the token row and logging the audit event:
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:5551';
    const resetUrl = `${appUrl}/auth/password-reset/confirm?token=${rawToken}`;
    const tenantId = user.tenant_id_for_password_reset ?? null;
    // The user table is platform-level. For password reset, the dispatch
    // tenant_id is determined by the user's primary membership — auth-password-reset
    // should resolve this via TenantsReadFacade or a direct prisma.userTenant.findFirst
    // join. The exact resolution lives below in §2.3.

    if (tenantId) {
      await this.notificationsService.createBatch(tenantId, [
        {
          tenant_id: tenantId,
          recipient_user_id: user.id,
          channel: 'email',
          template_key: 'auth.password_reset',
          locale: user.locale ?? 'en',
          payload_json: {
            user_first_name: user.first_name ?? null,
            reset_url: resetUrl,
            expiry_minutes: 60, // matches the 1-hour expires_at above
          },
          source_entity_type: 'password_reset_token',
          source_entity_id: tokenRow.id,
        },
      ]);
    }
    // If the user has no tenant membership (rare — orphaned platform-only user),
    // the audit log row is sufficient. We do NOT silently skip without logging.
    // Note: the password reset path also has special "platform-domain" hosting where
    // tenant_id may legitimately be null — in that case we use a sentinel platform
    // tenant if PLATFORM_TENANT_ID is configured, otherwise the email send fallback
    // is to log a warn and leave the audit trail.

    return { message: 'If email exists, reset link sent' };
  }
}
```

#### 2.3 Tenant resolution for password reset

The `users` table is platform-level (`tenant_id` does not exist). Notifications require `tenant_id`. Resolution path (preferring the simpler primary-tenant lookup over a multi-tenant-aware path):

```typescript
const membership = await this.prisma.userTenant.findFirst({
  where: { user_id: user.id, status: 'active' },
  orderBy: { created_at: 'asc' }, // first-joined tenant is the canonical "home"
  select: { tenant_id: true },
});
const tenantId = membership?.tenant_id ?? null;
```

If `membership` is null and `PLATFORM_TENANT_ID` env var is set, fall back to that. Otherwise log a warn and skip the email — the audit row + the password-reset-token row are still written, so the password reset itself is still operable via the API; only the email is lost.

The session executing Impl 12 must read the actual `userTenant` model name and confirm the column shape (`user_id` / `tenant_id` / `status`) before committing this; the schema may have evolved.

#### 2.4 Module wiring

`apps/api/src/modules/auth/auth.module.ts` currently imports `[ConfigurationModule, forwardRef(() => TenantsModule)]`. Add `CommunicationsModule`:

```typescript
imports: [ConfigurationModule, forwardRef(() => TenantsModule), CommunicationsModule],
```

If a circular dep emerges (CommunicationsModule transitively depending on AuthModule via the AuthGuard), wrap with `forwardRef(() => CommunicationsModule)` and verify with the AppModule DI smoke. The audit interceptor lives outside this graph so the cycle should not manifest.

Add `ConfigService` to the providers list **only** if it is not already available transitively — `ConfigModule.forRoot({ isGlobal: true })` in `app.module.ts` makes it global, so a separate provider entry is unnecessary.

### 3. Auth — add the new password-changed notification

#### 3.1 Where the password-change flow lives

Two flows change passwords today:

1. **Reset confirmation** — `PasswordResetService.confirmPasswordReset` at `auth-password-reset.service.ts:66`. After hashing the new password and updating the user row, it deletes all sessions and logs a `logPasswordChange` audit event (line 113). This is where the notification fires.
2. **Self-service password change** (if it exists) — search `apps/api/src/modules/auth/` for a `changePassword` method. If it exists, wire the same notification dispatch there.

The session must verify both with `grep -n "logPasswordChange\|password_hash:" apps/api/src/modules/auth/`. Wire the dispatch at every site that calls `securityAuditService.logPasswordChange`.

#### 3.2 The dispatch call

Inside `confirmPasswordReset`, immediately after `await this.securityAuditService.logPasswordChange(resetToken.user_id);`:

```typescript
const user = await this.prisma.user.findUnique({
  where: { id: resetToken.user_id },
  select: { id: true, email: true, first_name: true, locale: true },
});
const membership = await this.prisma.userTenant.findFirst({
  where: { user_id: resetToken.user_id, status: 'active' },
  orderBy: { created_at: 'asc' },
  select: { tenant_id: true },
});

if (user && membership) {
  await this.notificationsService.createBatch(membership.tenant_id, [
    {
      tenant_id: membership.tenant_id,
      recipient_user_id: user.id,
      channel: 'email',
      template_key: 'auth.password_changed',
      locale: user.locale ?? 'en',
      payload_json: {
        user_first_name: user.first_name ?? null,
        changed_at: new Date().toISOString(),
        // Include identifying info so the user can recognise it's a real notification
        // and not a phishing signal. Do NOT include the new password or any token.
      },
      source_entity_type: 'user',
      source_entity_id: user.id,
    },
  ]);
}
```

This is a security-critical email — the parallel to the audit row. It tells the account owner that their password changed and (in the body template) tells them what to do if they did not initiate the change. The PLAN.md spec mentioned a separate `auth-password-changed.service.ts` file. Creating a one-method service for two call sites adds indirection without value; we wire it inline in `PasswordResetService.confirmPasswordReset` (and any other password-change site) and skip the new file.

If the executing session finds three or more password-change call sites, they should extract a `notifyPasswordChanged(tenantId, userId)` private method on `PasswordResetService` to avoid duplication.

### 4. Module wiring — trips, school-closures, leave, sen

The PLAN spec proposes notifier services for trips, school-closures, leave, health, sen. The executing session inspects each module's current state and decides between (a) "module exists with concrete services — wire here directly" and (b) "module is a placeholder — document as gap." The matrix verified at spec-write time:

| Module             | State today                                                     | Wire-or-gap         |
| ------------------ | --------------------------------------------------------------- | ------------------- |
| `trips`            | Placeholder (just `trips.module.ts` + audience provider)        | **Document as gap** |
| `school-closures`  | Concrete (`school-closures.service.ts:47` `create` exists)      | Wire                |
| `leave`            | Concrete (`leave-requests.service.ts:182,235` approve/reject)   | Wire                |
| `health` (medical) | **Module does not exist.** `health.service.ts` is system-health | **Document as gap** |
| `sen`              | Concrete (`sen-support-plan.service.ts:429-467` transitions)    | Wire                |

#### 4.1 Trips — document as gap

Add the constants and seed templates (so the surface is ready) but do NOT create `trips/trip-invitations.service.ts` or `trips/trip-payment-reminders.service.ts`. The trips domain is not built — there are no trip records to invite parents to. Per the spec's point 11: "If any module doesn't have these (because the module itself is incomplete), document as a gap and skip — don't invent the module."

Record this in the §5 completion record under "Follow-ups": "Trips module is a placeholder. Notification types `trip.invitation` and `trip.payment_due` are seeded; wiring waits for the trips domain to land in a future rebuild."

#### 4.2 School closures — wire

`apps/api/src/modules/school-closures/school-closures.service.ts:47` has `async create(tenantId, userId, dto)`. After persisting the closure row and applying side-effects, fan out a notification to the audience (parents + staff).

The audience resolution is non-trivial. Two options:

- **Simple (chosen)**: Use `audience-resolution.service.ts` from communications. It already supports `scope: 'school'` which fans out to all parents + staff. `audienceResolution.resolve(tenantId, { scope: 'school' })` returns `{ user_ids: string[] }`. We dispatch one notification per user.
- **Granular (deferred)**: Closure has `affected_classes` / `affected_year_groups` columns — we could narrow the audience to just those. The closures domain doesn't expose them on the create DTO today (verify with the actual `CreateClosureDto`); if it does, prefer the narrow path. Otherwise fall back to school-wide.

Wire shape:

```typescript
// apps/api/src/modules/school-closures/school-closures.service.ts

constructor(
  private readonly prisma: PrismaService,
  private readonly notificationsService: NotificationsService,
  private readonly audienceResolution: AudienceResolutionService,
) {}

async create(tenantId: string, userId: string, dto: CreateClosureDto) {
  // ... existing persistence + side-effect logic stays ...

  // After commit, fan out the notification
  const recipients = await this.audienceResolution.resolve(tenantId, { scope: 'school' });
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { default_locale: true },
  });
  const locale = tenant?.default_locale ?? 'en';

  const notifications = recipients.user_ids.map((userId) => ({
    tenant_id: tenantId,
    recipient_user_id: userId,
    channel: 'in_app' as const,
    template_key: 'school.closure',
    locale,
    payload_json: {
      closure_id: created.id,
      closure_date: created.closure_date.toISOString(),
      reason: created.reason,
      title: created.title,
    },
    source_entity_type: 'school_closure',
    source_entity_id: created.id,
  }));

  if (notifications.length > 0) {
    await this.notificationsService.createBatch(tenantId, notifications);
  }

  return created;
}
```

Same pattern for `bulkCreate` at line 100 — fan out per closure or aggregate, the executing session decides based on what the school admin actually wants. Recommended: aggregate (one notification per recipient summarising the bulk closure window), not per-closure.

If `AudienceResolutionService.resolve` does not support `scope: 'school'` (verify against the existing types), use `audience-resolution.service.ts`'s actual API surface. The session must read `audience-resolution.service.ts` first to confirm the resolver shape.

#### 4.3 Staff leave — wire

`apps/api/src/modules/leave/leave-requests.service.ts:182` (`approve`) and `:235` (`reject`). After the status update, dispatch a single notification to the requester:

```typescript
async approve(tenantId: string, userId: string, id: string, dto: ReviewLeaveRequestDto) {
  const request = await this.findOrThrow(tenantId, id);
  this.assertTransition(request.status as LeaveRequestStatus, 'approved');

  // ... existing transaction body stays ...
  const result = await prismaWithRls.$transaction(async (tx) => { /* unchanged */ });

  // After commit, notify the requester. The staff_profile -> user link gives us the recipient.
  const staff = await this.prisma.staffProfile.findFirst({
    where: { id: request.staff_profile_id, tenant_id: tenantId },
    select: { user_id: true, first_name: true, last_name: true },
  });
  const reviewer = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { first_name: true, last_name: true },
  });
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { default_locale: true },
  });
  const locale = tenant?.default_locale ?? 'en';

  if (staff?.user_id) {
    await this.notificationsService.createBatch(tenantId, [
      {
        tenant_id: tenantId,
        recipient_user_id: staff.user_id,
        channel: 'in_app',
        template_key: 'staff.leave_decision',
        locale,
        payload_json: {
          decision: 'approved',
          leave_request_id: request.id,
          date_from: request.date_from.toISOString(),
          date_to: request.date_to.toISOString(),
          reviewer_name: reviewer ? `${reviewer.first_name} ${reviewer.last_name ?? ''}`.trim() : '',
          review_notes: dto.review_notes ?? null,
        },
        source_entity_type: 'leave_request',
        source_entity_id: request.id,
      },
    ]);
  }

  return result;
}
```

`reject` is the same shape with `decision: 'rejected'`. Module wiring: `LeaveModule` imports `CommunicationsModule`.

Note: a `leave.request_approved` / `leave.request_rejected` template pair already exists in `cover-notification-templates.ts:166-186` — that is wired by the cover/substitution flow, not the leave flow. The notification type is the same surface (`staff.leave_decision`) but with different payloads. Reuse the existing seeded template if it covers our payload shape; otherwise add `staff.leave_decision` to the seed and use that. The session executing this verifies the template_key strings are consistent — DO NOT seed two templates with overlapping intent. See §5 for the seed list.

#### 4.4 Health module — document as gap

There is no student-medical or nurse-visit module in the codebase today. `health.service.ts` is system health (queues, db, disk). Add the `health.incident` notification type constant and seed templates so the surface is ready, but do NOT invent a `health/health-incident-notifier.service.ts`.

Record in §5: "No student-health module exists. Notification type `health.incident` and templates seeded; wiring waits for the medical/nurse-visit domain to land in a future rebuild."

#### 4.5 SEN EHA updates — wire

`apps/api/src/modules/sen/sen-support-plan.service.ts:429-467` handles support plan status transitions (`draft → active → under_review → closed`). When a transition lands, notify the student's parents + the SEN coordinator.

Wire shape (insert after the transaction commits):

```typescript
async transitionStatus(tenantId, userId, planId, dto) {
  // ... existing validation + transaction ...
  const plan = await this.findOrThrow(tenantId, planId);
  // ... existing lifecycle logic ...

  // After commit, notify parents + SEN coordinator
  await this.notifyOnStatusChange(tenantId, plan, dto.status);

  return updated;
}

private async notifyOnStatusChange(tenantId: string, plan: SenPlan, newStatus: string) {
  const tenant = await this.prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { default_locale: true },
  });
  const locale = tenant?.default_locale ?? 'en';

  // Resolve the student's parents
  const studentLinks = await this.prisma.householdStudent.findMany({
    where: { student_id: plan.student_id, tenant_id: tenantId },
    select: {
      household: {
        select: { primary_billing_parent: { select: { user_id: true } } },
      },
    },
  });
  const parentUserIds = studentLinks
    .map((l) => l.household?.primary_billing_parent?.user_id)
    .filter((id): id is string => id !== null && id !== undefined);

  // Resolve SEN coordinator(s) — users with sen.coordinate permission
  // Or a tenant-level `sen_coordinator_user_id` if the tenant settings have one.
  // The simplest reliable resolver: query users with the sen.coordinate role assignment.
  // For Impl 12, we resolve via roleAssignment join on a permission key — see §4.5.1.
  const coordinatorUserIds = await this.resolveSenCoordinators(tenantId);

  const recipients = [...new Set([...parentUserIds, ...coordinatorUserIds])];
  if (recipients.length === 0) return;

  const notifications = recipients.map((userId) => ({
    tenant_id: tenantId,
    recipient_user_id: userId,
    channel: 'in_app' as const,
    template_key: 'sen.eha_update',
    locale,
    payload_json: {
      plan_id: plan.id,
      student_id: plan.student_id,
      status: newStatus,
      updated_at: new Date().toISOString(),
    },
    source_entity_type: 'sen_support_plan',
    source_entity_id: plan.id,
  }));

  await this.notificationsService.createBatch(tenantId, notifications);
}
```

##### 4.5.1 SEN coordinator resolution

If the tenant maintains a `sen_coordinator_user_id` column on `tenant_settings`, prefer that. Otherwise, query users with the `sen.coordinate` (or equivalent) permission. The session executing this verifies the actual permission name in `packages/prisma/seed/permissions.ts` — do NOT invent a permission string. If no SEN-coordinator permission exists today, the recipient set is parents-only and we record this in §5 as a follow-up.

### 5. Notification template seed

Create `packages/prisma/seed/comms-gap-templates.ts` mirroring `cover-notification-templates.ts` exactly. Eight new templates × 2 locales × 4 channels (with subject stripped on SMS/WhatsApp per the existing seeder) = 64 rows.

```typescript
// packages/prisma/seed/comms-gap-templates.ts
//
// Notification templates for the comms-gap closure (Impl 12).
//
// Eight new template_keys: auth.password_reset, auth.password_changed,
// trip.invitation, trip.payment_due, school.closure, staff.leave_decision,
// health.incident, sen.eha_update.
//
// All seeded with tenant_id = NULL (system defaults). Tenants can override
// per the existing template-resolution chain.

export type Locale = 'en' | 'ar';
export type Channel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export interface NotificationTemplateSeed {
  channel: Channel;
  template_key: string;
  locale: Locale;
  subject_template: string | null;
  body_template: string;
}

interface TemplateDef {
  key: string;
  en: { subject: string | null; body: string };
  ar: { subject: string | null; body: string };
}

const TEMPLATES: TemplateDef[] = [
  // ─── Auth ─────────────────────────────────────────────────────────────────
  {
    key: 'auth.password_reset',
    en: {
      subject: 'Password reset request',
      body: 'Hi {{user_first_name}},\n\nWe received a request to reset your password. Click the link below to set a new password (valid for {{expiry_minutes}} minutes):\n\n{{reset_url}}\n\nIf you did not request this, you can safely ignore this email — no changes have been made to your account.',
    },
    ar: {
      subject: 'طلب إعادة تعيين كلمة المرور',
      body: 'مرحباً {{user_first_name}}،\n\nتلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. انقر على الرابط أدناه لتعيين كلمة مرور جديدة (صالح لمدة {{expiry_minutes}} دقيقة):\n\n{{reset_url}}\n\nإذا لم تطلب هذا، يمكنك تجاهل هذا البريد الإلكتروني — لم يتم إجراء أي تغييرات على حسابك.',
    },
  },
  {
    key: 'auth.password_changed',
    en: {
      subject: 'Your password was changed',
      body: 'Hi {{user_first_name}},\n\nThis is a confirmation that your password was changed at {{changed_at}}. If you did not make this change, please contact your school administrator immediately.',
    },
    ar: {
      subject: 'تم تغيير كلمة المرور الخاصة بك',
      body: 'مرحباً {{user_first_name}}،\n\nهذا تأكيد بأن كلمة المرور الخاصة بك قد تم تغييرها في {{changed_at}}. إذا لم تقم بهذا التغيير، يرجى الاتصال بمسؤول المدرسة فوراً.',
    },
  },

  // ─── Trips (templates seeded; wiring deferred — see §4.1) ─────────────────
  {
    key: 'trip.invitation',
    en: {
      subject: 'Trip invitation: {{trip_name}}',
      body: '{{student_first_name}} is invited to {{trip_name}} on {{trip_date}}. Cost: {{trip_cost}} {{currency_code}}. Please confirm participation by {{rsvp_deadline}}.',
    },
    ar: {
      subject: 'دعوة لرحلة: {{trip_name}}',
      body: '{{student_first_name}} مدعو إلى {{trip_name}} في {{trip_date}}. التكلفة: {{trip_cost}} {{currency_code}}. يرجى تأكيد المشاركة قبل {{rsvp_deadline}}.',
    },
  },
  {
    key: 'trip.payment_due',
    en: {
      subject: 'Trip payment due: {{trip_name}}',
      body: "Payment of {{amount_due}} {{currency_code}} for {{student_first_name}}'s {{trip_name}} is due by {{due_date}}.",
    },
    ar: {
      subject: 'دفعة الرحلة مستحقة: {{trip_name}}',
      body: 'دفعة بقيمة {{amount_due}} {{currency_code}} لرحلة {{student_first_name}} ({{trip_name}}) مستحقة قبل {{due_date}}.',
    },
  },

  // ─── School closures ──────────────────────────────────────────────────────
  {
    key: 'school.closure',
    en: {
      subject: 'School closure: {{title}}',
      body: 'The school will be closed on {{closure_date}}. Reason: {{reason}}. Please plan accordingly.',
    },
    ar: {
      subject: 'إغلاق المدرسة: {{title}}',
      body: 'ستكون المدرسة مغلقة في {{closure_date}}. السبب: {{reason}}. يرجى التخطيط وفقاً لذلك.',
    },
  },

  // ─── Staff leave ──────────────────────────────────────────────────────────
  {
    key: 'staff.leave_decision',
    en: {
      subject: 'Leave request {{decision}}',
      body: 'Your leave request from {{date_from}} to {{date_to}} has been {{decision}} by {{reviewer_name}}.{{#if review_notes}} Notes: {{review_notes}}{{/if}}',
    },
    ar: {
      subject: 'طلب الإجازة {{decision}}',
      body: 'تم {{decision}} طلب إجازتك من {{date_from}} إلى {{date_to}} من قبل {{reviewer_name}}.{{#if review_notes}} الملاحظات: {{review_notes}}{{/if}}',
    },
  },

  // ─── Health incidents (templates seeded; wiring deferred — see §4.4) ──────
  {
    key: 'health.incident',
    en: {
      subject: 'Health update for {{student_first_name}}',
      body: 'A health incident was logged for {{student_first_name}} at {{incident_time}}: {{summary}}. Please contact the school for more information.',
    },
    ar: {
      subject: 'تحديث صحي لـ {{student_first_name}}',
      body: 'تم تسجيل حادث صحي لـ {{student_first_name}} في {{incident_time}}: {{summary}}. يرجى الاتصال بالمدرسة للحصول على مزيد من المعلومات.',
    },
  },

  // ─── SEN EHA updates ──────────────────────────────────────────────────────
  {
    key: 'sen.eha_update',
    en: {
      subject: 'SEN plan update for {{student_first_name}}',
      body: '{{student_first_name}}\'s SEN support plan status has been updated to "{{status}}" on {{updated_at}}. View the latest plan details by logging in.',
    },
    ar: {
      subject: 'تحديث خطة الاحتياجات الخاصة لـ {{student_first_name}}',
      body: 'تم تحديث حالة خطة دعم الاحتياجات الخاصة لـ {{student_first_name}} إلى "{{status}}" في {{updated_at}}. اعرض أحدث تفاصيل الخطة عن طريق تسجيل الدخول.',
    },
  },
];

const CHANNELS: Channel[] = ['in_app', 'email', 'sms', 'whatsapp'];

export const COMMS_GAP_TEMPLATE_SEEDS: NotificationTemplateSeed[] = TEMPLATES.flatMap((tpl) => {
  const rows: NotificationTemplateSeed[] = [];
  for (const channel of CHANNELS) {
    const subjectEn = channel === 'in_app' || channel === 'email' ? tpl.en.subject : null;
    const subjectAr = channel === 'in_app' || channel === 'email' ? tpl.ar.subject : null;
    rows.push({
      channel,
      template_key: tpl.key,
      locale: 'en',
      subject_template: subjectEn,
      body_template: tpl.en.body,
    });
    rows.push({
      channel,
      template_key: tpl.key,
      locale: 'ar',
      subject_template: subjectAr,
      body_template: tpl.ar.body,
    });
  }
  return rows;
});
```

#### 5.1 Wire the seed into `seed.ts`

Open `packages/prisma/seed.ts` and add the import + the per-row upsert loop, mirroring the cover-template pattern at lines 264–297:

```typescript
import { COMMS_GAP_TEMPLATE_SEEDS } from './seed/comms-gap-templates';

// ... after the cover-template loop (around line 298) ...

console.log('Seed: Step 3e — Comms gap templates (Impl 12)');
for (const tpl of COMMS_GAP_TEMPLATE_SEEDS) {
  const existing = await prisma.notificationTemplate.findFirst({
    where: {
      tenant_id: null,
      channel: tpl.channel as never,
      template_key: tpl.template_key,
      locale: tpl.locale,
    },
  });
  if (existing) {
    await prisma.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        subject_template: tpl.subject_template,
        body_template: tpl.body_template,
        is_system: true,
      },
    });
  } else {
    await prisma.notificationTemplate.create({
      data: {
        tenant_id: null,
        channel: tpl.channel as never,
        template_key: tpl.template_key,
        locale: tpl.locale,
        subject_template: tpl.subject_template,
        body_template: tpl.body_template,
        is_system: true,
      },
    });
  }
}
console.log(`  ${COMMS_GAP_TEMPLATE_SEEDS.length} comms-gap notification templates seeded.`);
```

The deletes-and-recreates block at lines 1656–1657 is in the platform-level reset path; no change needed there because the new templates have `tenant_id = null` and will be picked up automatically when the seeder reseeds.

Run `pnpm --filter @school/prisma run seed` against the local dev DB after the migration. Confirm row count: `SELECT count(*) FROM notification_template WHERE tenant_id IS NULL AND template_key LIKE 'auth.%' OR template_key LIKE 'trip.%' OR template_key LIKE 'school.closure' OR template_key LIKE 'staff.leave_decision' OR template_key LIKE 'health.incident' OR template_key LIKE 'sen.eha_update'` should be 64 (8 keys × 4 channels × 2 locales).

### 6. Type union update — add `'sms'` to `NotificationTemplate.channel`

`packages/shared/src/types/notification-template.ts` declares:

```typescript
channel: 'email' | 'whatsapp' | 'in_app';
```

Update to:

```typescript
channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
```

#### 6.1 Find every consumer

```bash
grep -rn "NotificationTemplate\b" apps/ packages/ --include="*.ts" --include="*.tsx"
```

Triage the hits:

- **Backend service consumers** (`notification-templates.service.ts`, etc.): the backend stores the channel as a Prisma enum that already includes `sms`. Adding the union value matches reality; no behavioural change.
- **Frontend consumers** (`apps/web/src/app/[locale]/(school)/settings/notification-templates/`): any switch-statement or filter that did not have an `'sms'` case will now error with `TS2322` or similar. Add the SMS branch.
- **Test fixtures**: any mock that hard-coded `channel: 'email' | 'whatsapp' | 'in_app'` needs the SMS variant added.

Run `pnpm turbo type-check` after the union change. Every error is an SMS-aware consumer that needs a branch added. Fix all of them before flipping to `completed`.

#### 6.2 Backend dispatch already supports SMS

The Prisma `notification_channel` enum already lists `'sms'`. The Twilio SMS provider exists. Tenants who configured SMS can already receive SMS today — the type was the only thing lying. After this update, the type matches the runtime.

### 7. Frontend — `'push'` → `'whatsapp'` in three files

#### 7.1 `apps/web/src/app/[locale]/(school)/settings/notifications/page.tsx`

Line 21:

```typescript
const AVAILABLE_CHANNELS = ['email', 'sms', 'push'] as const;
```

becomes:

```typescript
const AVAILABLE_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
```

The render loop at lines 93–111 (and the header loop at lines 219–234) reads channel labels via:

```typescript
const channelLabelKey =
  `channel${channel.charAt(0).toUpperCase() + channel.slice(1)}` as Parameters<typeof t>[0];
```

This produces `channelEmail`, `channelSms`, `channelPush` today. After our change it produces `channelWhatsapp` (lowercase 'a') — but the convention in the existing translation file uses `channelWhatsApp` (uppercase 'A'). The session executing must read `apps/web/messages/en.json` to see the existing key shape and either:

- (a) Use `channelWhatsapp` (lowercase) and add new translation keys, or
- (b) Use a hard-coded label resolver that maps `'whatsapp' → 'channelWhatsApp'` (matching existing translation key casing).

Recommended: option (a) — add new translation keys `channelWhatsapp` to both `en.json` and `ar.json`. The slightly redundant casing matches the existing pattern of `channelEmail` / `channelSms`. The `channelPush` key stays in `messages/{en,ar}.json` for now (no need to delete it; later cleanup can purge unused i18n keys via the existing tooling).

EN translation: `"channelWhatsapp": "WhatsApp"`
AR translation: `"channelWhatsapp": "واتساب"`

#### 7.2 `apps/web/src/app/[locale]/(school)/profile/communication/page.tsx`

Line 105:

```typescript
function toggle(field: keyof Pick<CommunicationPreferences, 'email' | 'sms' | 'push'>) {
```

becomes:

```typescript
function toggle(field: keyof Pick<CommunicationPreferences, 'email' | 'sms' | 'whatsapp'>) {
```

Line 169 onwards calls `toggle('push')`. Verify the `CommunicationPreferences` type definition supports `whatsapp` (it should, given the backend stores all four channels). Update the `onCheckedChange={() => toggle('push')}` call to `onCheckedChange={() => toggle('whatsapp')}`.

If the icon used here is a `Bell` / `Phone` push icon, swap to `MessageCircle` from `lucide-react`. The existing imports table reveals which icons are used; the session mechanically swaps the import + the JSX usage.

#### 7.3 `apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx`

Line 109:

```tsx
<SelectItem value="push">{t('push')}</SelectItem>
```

becomes:

```tsx
<SelectItem value="whatsapp">{t('whatsapp')}</SelectItem>
```

Verify the `t('whatsapp')` key exists in the namespace this page uses. If not, add it.

#### 7.4 Final grep audit

```bash
grep -rn "'push'\|\"push\"\|: push\b" apps/web/src --include="*.ts" --include="*.tsx"
```

After the migration this should return zero hits in code (the `messages/*.json` translation file may still carry a `channelPush` key — leave it; deleting unused i18n keys is out of scope for this impl, and the global delete is risky given parallel sessions).

### 8. Module hygiene — finance does not import communications models

`packages/prisma/schema.prisma` is unchanged — no model edits in this impl. The `Notification` model already exists and is owned by communications. Finance's `InvoiceReminder` model is the dedup ledger and stays in the finance module.

### 9. Verifying no other module writes to `notification`

```bash
grep -rn "prisma.notification.create\b" apps/api/src/modules
grep -rn "prisma\.notification\.createMany\b" apps/api/src/modules
```

After Impl 12, the only acceptable hits are inside `apps/api/src/modules/communications/`. Anything else is a regression and must be migrated in this impl.

---

## Tests

Per `.claude/rules/testing.md`: every endpoint needs happy-path + permission-denied; every state machine needs valid + blocked transitions; every notification dispatch needs a unit test confirming the dispatch happened with the right payload.

### 9.1 Test file inventory

```
apps/api/src/modules/finance/payment-reminders.service.spec.ts          [UPDATE]
apps/api/src/modules/auth/auth-password-reset.service.spec.ts           [UPDATE]
apps/api/src/modules/leave/leave-requests.service.spec.ts               [UPDATE]
apps/api/src/modules/school-closures/school-closures.service.spec.ts    [UPDATE]
apps/api/src/modules/sen/sen-support-plan.service.spec.ts               [UPDATE]
apps/api/src/modules/communications/notifications.service.spec.ts        [UPDATE: SMS channel test]
apps/web/src/app/[locale]/(school)/settings/notifications/page.spec.tsx [UPDATE]

packages/shared/src/constants/notification-types.spec.ts                [NEW: snapshot of constant]
packages/prisma/seed/comms-gap-templates.spec.ts                        [NEW: row-count + key-coverage]
```

### 9.2 Test 1 — Finance migration (4 sites)

For each call site (`sendDueSoonReminders`, `sendOverdueReminders`, `sendFinalNotices`, `dispatchReminder` private), the existing test file already covers the happy path. Update each test to:

- Mock `NotificationsService.createBatch` (instead of asserting against `prisma.notification.create`).
- Assert `createBatch` is called with the expected `tenantId` and a notifications array containing one entry per channel × recipient.
- Assert `prisma.notification.create` is NOT called anywhere — `expect(mockPrisma.notification.create).not.toHaveBeenCalled();`.
- Assert the dedup row in `prisma.invoiceReminder.create` is still written (this is the finance-domain ledger, unrelated to comms).

```typescript
describe('PaymentRemindersService — sendDueSoonReminders (Impl 12 migration)', () => {
  it('dispatches via NotificationsService.createBatch, not prisma.notification.create', async () => {
    mockSettings.getSettings.mockResolvedValue({
      finance: { paymentReminderEnabled: true, dueSoonReminderDays: 3, reminderChannel: 'email' },
    });
    mockPrisma.invoice.findMany.mockResolvedValue([{ id: 'inv-1', /* ... */ reminders: [] }]);
    mockPrisma.invoice.findFirst.mockResolvedValue(/* ... */);
    mockPrisma.tenant.findUnique.mockResolvedValue({ default_locale: 'en' });

    await service.sendDueSoonReminders(TENANT_ID);

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: BILLING_PARENT_USER_ID,
          channel: 'email',
          template_key: 'payment_reminder_due_soon',
          source_entity_type: 'invoice',
          source_entity_id: 'inv-1',
        }),
      ]),
    );
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });
});
```

Add an architectural-invariant test that the source file does NOT contain `prisma.notification.create`:

```typescript
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('Architecture invariant — payment-reminders does not write notifications directly', () => {
  it('payment-reminders.service.ts does not call prisma.notification.create', async () => {
    const path = resolve(__dirname, 'payment-reminders.service.ts');
    const contents = await fs.readFile(path, 'utf8');
    expect(contents).not.toMatch(/prisma\.notification\.create\b/);
    expect(contents).not.toMatch(/prisma\.notification\.createMany\b/);
  });
});
```

This invariant guards against a future PR re-introducing the direct-write pattern.

### 9.3 Test 2 — Password reset email

```typescript
describe('PasswordResetService.requestPasswordReset (Impl 12 wiring)', () => {
  it('dispatches auth.password_reset notification when user has tenant membership', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: 'user@nhqs.test',
      first_name: 'Alice',
      locale: 'en',
    });
    mockPrisma.passwordResetToken.count.mockResolvedValue(0);
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'tok-1', user_id: USER_ID });
    mockPrisma.userTenant.findFirst.mockResolvedValue({ tenant_id: TENANT_ID });
    mockConfig.get.mockReturnValue('https://nhqs.local');

    await service.requestPasswordReset('user@nhqs.test');

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: USER_ID,
          channel: 'email',
          template_key: 'auth.password_reset',
          payload_json: expect.objectContaining({
            user_first_name: 'Alice',
            reset_url: expect.stringContaining(
              'https://nhqs.local/auth/password-reset/confirm?token=',
            ),
            expiry_minutes: 60,
          }),
        }),
      ]),
    );
  });

  it('logs warn but does not crash when user has no tenant membership', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID });
    mockPrisma.passwordResetToken.count.mockResolvedValue(0);
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'tok-1' });
    mockPrisma.userTenant.findFirst.mockResolvedValue(null);

    const result = await service.requestPasswordReset('user@nhqs.test');
    expect(result.message).toBe('If email exists, reset link sent');
    expect(mockNotificationsService.createBatch).not.toHaveBeenCalled();
    // Audit row still written
    expect(mockSecurityAudit.logPasswordReset).toHaveBeenCalled();
    // Token row still written (the password reset itself still works via API)
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
  });

  it('does NOT include the raw token in the payload', async () => {
    // The reset_url contains the token; payload itself must not duplicate it.
    // ...
    const payload = mockNotificationsService.createBatch.mock.calls[0][1][0].payload_json;
    expect(payload).not.toHaveProperty('token');
    expect(payload).not.toHaveProperty('raw_token');
    expect(payload).not.toHaveProperty('token_hash');
  });
});
```

### 9.4 Test 3 — Password changed notification

```typescript
describe('PasswordResetService.confirmPasswordReset (Impl 12 password-changed)', () => {
  it('dispatches auth.password_changed notification on successful reset', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'tok-1', user_id: USER_ID });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      first_name: 'Alice',
      locale: 'en',
    });
    mockPrisma.userTenant.findFirst.mockResolvedValue({ tenant_id: TENANT_ID });

    await service.confirmPasswordReset('raw-token', 'NewPassword123!');

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: USER_ID,
          channel: 'email',
          template_key: 'auth.password_changed',
        }),
      ]),
    );
  });
});
```

### 9.5 Test 4 — Leave decision notifications

```typescript
describe('LeaveRequestsService.approve (Impl 12 wiring)', () => {
  it('dispatches staff.leave_decision notification on approve', async () => {
    // ... existing happy-path setup ...
    await service.approve(TENANT_ID, REVIEWER_USER_ID, REQUEST_ID, {
      review_notes: 'Approved by HOD',
    });

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          recipient_user_id: STAFF_USER_ID,
          template_key: 'staff.leave_decision',
          payload_json: expect.objectContaining({ decision: 'approved' }),
        }),
      ]),
    );
  });

  it('dispatches with decision: rejected on reject', async () => {
    await service.reject(TENANT_ID, REVIEWER_USER_ID, REQUEST_ID, {
      review_notes: 'Insufficient cover',
    });
    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          payload_json: expect.objectContaining({ decision: 'rejected' }),
        }),
      ]),
    );
  });

  it('does not crash when staff has no user_id (orphaned profile)', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-1', user_id: null });
    await service.approve(TENANT_ID, REVIEWER_USER_ID, REQUEST_ID, {});
    expect(mockNotificationsService.createBatch).not.toHaveBeenCalled();
  });
});
```

### 9.6 Test 5 — School closure broadcast

```typescript
describe('SchoolClosuresService.create (Impl 12 wiring)', () => {
  it('dispatches school.closure to all resolved recipients', async () => {
    mockAudienceResolution.resolve.mockResolvedValue({ user_ids: ['u1', 'u2', 'u3'] });
    mockPrisma.tenant.findUnique.mockResolvedValue({ default_locale: 'en' });

    await service.create(TENANT_ID, USER_ID, validClosureDto);

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({ recipient_user_id: 'u1', template_key: 'school.closure' }),
        expect.objectContaining({ recipient_user_id: 'u2', template_key: 'school.closure' }),
        expect.objectContaining({ recipient_user_id: 'u3', template_key: 'school.closure' }),
      ]),
    );
  });

  it('does not crash when no recipients resolved', async () => {
    mockAudienceResolution.resolve.mockResolvedValue({ user_ids: [] });
    await service.create(TENANT_ID, USER_ID, validClosureDto);
    expect(mockNotificationsService.createBatch).not.toHaveBeenCalled();
  });
});
```

### 9.7 Test 6 — SEN EHA update notification

```typescript
describe('SenSupportPlanService.transitionStatus (Impl 12 wiring)', () => {
  it('dispatches sen.eha_update to parents + SEN coordinators', async () => {
    mockPrisma.householdStudent.findMany.mockResolvedValue([
      { household: { primary_billing_parent: { user_id: 'parent-1' } } },
      { household: { primary_billing_parent: { user_id: 'parent-2' } } },
    ]);
    // resolveSenCoordinators returns the coordinator user
    jest.spyOn(service as never, 'resolveSenCoordinators').mockResolvedValue(['coord-1']);

    await service.transitionStatus(TENANT_ID, USER_ID, PLAN_ID, { status: 'active' });

    expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
      TENANT_ID,
      expect.arrayContaining([
        expect.objectContaining({ recipient_user_id: 'parent-1', template_key: 'sen.eha_update' }),
        expect.objectContaining({ recipient_user_id: 'parent-2', template_key: 'sen.eha_update' }),
        expect.objectContaining({ recipient_user_id: 'coord-1', template_key: 'sen.eha_update' }),
      ]),
    );
  });

  it('deduplicates when a parent is also the coordinator (rare but possible)', async () => {
    mockPrisma.householdStudent.findMany.mockResolvedValue([
      { household: { primary_billing_parent: { user_id: 'shared' } } },
    ]);
    jest.spyOn(service as never, 'resolveSenCoordinators').mockResolvedValue(['shared']);

    await service.transitionStatus(TENANT_ID, USER_ID, PLAN_ID, { status: 'under_review' });

    const calls = mockNotificationsService.createBatch.mock.calls;
    const recipients = calls[0][1].map((n: { recipient_user_id: string }) => n.recipient_user_id);
    expect(recipients).toEqual(['shared']); // Set-deduped
  });
});
```

### 9.8 Test 7 — Notification type constant snapshot

```typescript
// packages/shared/src/constants/notification-types.spec.ts
import { NOTIFICATION_TYPES } from './notification-types';

describe('NOTIFICATION_TYPES (Impl 12 expansion)', () => {
  it('includes the eight new types added in Impl 12', () => {
    expect(NOTIFICATION_TYPES).toEqual(
      expect.arrayContaining([
        'auth.password_reset',
        'auth.password_changed',
        'trip.invitation',
        'trip.payment_due',
        'school.closure',
        'staff.leave_decision',
        'health.incident',
        'sen.eha_update',
      ]),
    );
  });

  it('does not regress: still contains the original 17 types', () => {
    const original = [
      'invoice.issued',
      'payment.received',
      'payment.failed',
      'report_card.published',
      'attendance.exception',
      'attendance.absent',
      'attendance.late',
      'attendance.left_early',
      'attendance.pattern_detected',
      'admission.status_change',
      'announcement.published',
      'approval.requested',
      'approval.decided',
      'inquiry.new_message',
      'payroll.finalised',
      'payslip.generated',
      'parent.daily_digest',
    ];
    for (const t of original) {
      expect(NOTIFICATION_TYPES).toContain(t);
    }
  });
});
```

### 9.9 Test 8 — Frontend: `'push'` is gone, `'whatsapp'` is present

```typescript
// apps/web/src/app/[locale]/(school)/settings/notifications/page.spec.tsx
import { render } from '@testing-library/react';

import NotificationsPage from './page';

describe('Settings/Notifications channel selector (Impl 12)', () => {
  it('does NOT render a "push" channel column', async () => {
    const { container } = render(<NotificationsPage />);
    // The header column would have aria-label or text including "Push"
    expect(container.querySelector('[id$="-push"]')).toBeNull();
  });

  it('renders a "whatsapp" channel column', async () => {
    const { container } = render(<NotificationsPage />);
    // Wait for fetch to settle then look for the whatsapp checkbox(es)
    // ...
    expect(container.querySelector('[id$="-whatsapp"]')).not.toBeNull();
  });
});
```

For the `profile/communication/page.tsx` file, the same shape — assert the toggle points at `whatsapp` not `push`.

### 9.10 Test 9 — Type union compilation

A type-only test file:

```typescript
// packages/shared/src/types/notification-template.spec.ts
import type { NotificationTemplate } from './notification-template';

describe('NotificationTemplate.channel union (Impl 12)', () => {
  it('accepts all four channel values', () => {
    const email: NotificationTemplate['channel'] = 'email';
    const sms: NotificationTemplate['channel'] = 'sms';
    const whatsapp: NotificationTemplate['channel'] = 'whatsapp';
    const inApp: NotificationTemplate['channel'] = 'in_app';
    // Compile-time only
    expect([email, sms, whatsapp, inApp]).toHaveLength(4);
  });

  it('rejects invalid channel values', () => {
    // @ts-expect-error — 'push' must NOT compile
    const badPush: NotificationTemplate['channel'] = 'push';
    // @ts-expect-error — 'fax' must NOT compile
    const badFax: NotificationTemplate['channel'] = 'fax';
    expect([badPush, badFax]).toHaveLength(2);
  });
});
```

The `@ts-expect-error` comments are the test — if the union ever drops `'sms'` or re-adds `'push'`, the comment fails to suppress an error and the file won't compile. This is the simplest way to lock in the union shape.

### 9.11 Test 10 — Seed coverage

```typescript
// packages/prisma/seed/comms-gap-templates.spec.ts
import { COMMS_GAP_TEMPLATE_SEEDS } from './comms-gap-templates';

describe('COMMS_GAP_TEMPLATE_SEEDS (Impl 12)', () => {
  it('seeds 64 rows total (8 keys × 4 channels × 2 locales)', () => {
    expect(COMMS_GAP_TEMPLATE_SEEDS).toHaveLength(64);
  });

  it.each([
    'auth.password_reset',
    'auth.password_changed',
    'trip.invitation',
    'trip.payment_due',
    'school.closure',
    'staff.leave_decision',
    'health.incident',
    'sen.eha_update',
  ])('seeds %s in 4 channels × 2 locales = 8 rows', (key) => {
    const rows = COMMS_GAP_TEMPLATE_SEEDS.filter((r) => r.template_key === key);
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((r) => r.channel))).toEqual(
      new Set(['in_app', 'email', 'sms', 'whatsapp']),
    );
    expect(new Set(rows.map((r) => r.locale))).toEqual(new Set(['en', 'ar']));
  });

  it.each([
    'auth.password_reset',
    'auth.password_changed',
    'trip.invitation',
    'trip.payment_due',
    'school.closure',
    'staff.leave_decision',
    'health.incident',
    'sen.eha_update',
  ])('strips subject for SMS/WhatsApp on %s (matches cover-template seeder)', (key) => {
    const smsRows = COMMS_GAP_TEMPLATE_SEEDS.filter(
      (r) => r.template_key === key && r.channel === 'sms',
    );
    const whatsappRows = COMMS_GAP_TEMPLATE_SEEDS.filter(
      (r) => r.template_key === key && r.channel === 'whatsapp',
    );
    for (const row of [...smsRows, ...whatsappRows]) {
      expect(row.subject_template).toBeNull();
    }
  });

  it('keeps subject for in_app + email', () => {
    const inAppRows = COMMS_GAP_TEMPLATE_SEEDS.filter((r) => r.channel === 'in_app');
    const emailRows = COMMS_GAP_TEMPLATE_SEEDS.filter((r) => r.channel === 'email');
    for (const row of [...inAppRows, ...emailRows]) {
      expect(row.subject_template).not.toBeNull();
      expect(row.subject_template!.length).toBeGreaterThan(0);
    }
  });
});
```

### 9.12 No regressions

```bash
pnpm turbo run test --filter=@school/api --filter=@school/web --filter=@school/shared --filter=@school/prisma
pnpm turbo run lint
pnpm turbo run type-check
```

If the type-check fails on a consumer of the `NotificationTemplate.channel` union (because we added `'sms'`), fix the consumer in the same impl. The fix is mechanical — add an `'sms'` branch to whatever switch / filter / map is missing it.

---

## Verification (local dev server)

Per IMPLEMENTATION_LOG.md Rule 27a, every implementation must drive its surface end-to-end on a local dev server before flipping to `completed`. This impl spans backend + worker + web; verification covers all three.

### 11.1 Pre-flight gauntlet

```bash
pnpm turbo run type-check
pnpm turbo run lint
pnpm turbo run test --filter=@school/api --filter=@school/web --filter=@school/shared --filter=@school/prisma --filter=@school/worker

# AppModule DI smoke (Rule 6)
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

### 11.2 Reseed the local dev DB

```bash
pnpm --filter @school/prisma run seed
```

Confirm the new template rows landed:

```sql
SELECT template_key, count(*) FROM notification_template
WHERE tenant_id IS NULL
  AND template_key IN (
    'auth.password_reset', 'auth.password_changed',
    'trip.invitation', 'trip.payment_due',
    'school.closure', 'staff.leave_decision',
    'health.incident', 'sen.eha_update'
  )
GROUP BY template_key
ORDER BY template_key;
```

Each row should show `8` (4 channels × 2 locales).

### 11.3 Spin up dev servers

```bash
pnpm --filter @school/api dev    # → http://localhost:3001
pnpm --filter @school/worker dev  # tail logs in this shell
pnpm --filter @school/web dev    # → http://localhost:5551
```

Login as `owner@nhqs.test` (Password123!).

```bash
TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!","domain":"nhqs.local"}' \
  | jq -r '.data.accessToken')
```

### 11.4 Trigger and verify each migrated/new flow

#### Flow 1 — Finance reminder via NotificationsService

Generate test data: a billing-parent invoice due in 2 days. Then trigger the reminder cron manually:

```bash
# Either trigger via the existing finance admin endpoint, or run the worker job directly.
# Easiest: enqueue the cron job manually via the worker's Bull dashboard / Redis CLI.
# After enqueue, verify a `notification` row was created — NOT a direct DB write.
```

```sql
SELECT id, template_key, channel, status, source_entity_type, source_entity_id, created_at
FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key LIKE 'payment_reminder_%'
ORDER BY created_at DESC LIMIT 5;
```

The `source_entity_id` should match the invoice id. The `created_at` should be within seconds of the cron run.

#### Flow 2 — Password reset email

```bash
curl -i -X POST http://localhost:3001/api/v1/auth/password-reset/request \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-Host: nhqs.local' \
  -d '{"email":"owner@nhqs.test"}'
```

Expected: 200 with `{ message: 'If email exists, reset link sent' }`. Then:

```sql
SELECT id, template_key, channel, status, payload_json
FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key = 'auth.password_reset'
ORDER BY created_at DESC LIMIT 1;
```

Confirm the `payload_json.reset_url` contains a token. Confirm the `password_reset_token` row was also created.

#### Flow 3 — Password changed

Use the token from Flow 2 to confirm a password change:

```bash
RAW_TOKEN=$(echo "<from the password_reset_token row>")
curl -i -X POST http://localhost:3001/api/v1/auth/password-reset/confirm \
  -H 'Content-Type: application/json' \
  -d "{\"token\":\"$RAW_TOKEN\",\"new_password\":\"NewPassword456!\"}"
```

Then:

```sql
SELECT template_key, count(*) FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key = 'auth.password_changed'
  AND created_at > now() - interval '5 minutes'
GROUP BY template_key;
```

Expect 1.

#### Flow 4 — Staff leave approve

```bash
# Submit a leave request as a teacher
TEACHER_TOKEN=$(curl -sX POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"teacher@nhqs.test","password":"NewPassword456!","domain":"nhqs.local"}' \
  | jq -r '.data.accessToken')

REQ_ID=$(curl -sX POST http://localhost:3001/api/v1/leave-requests \
  -H "Authorization: Bearer $TEACHER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"leave_type_id":"<sick-leave-id>","date_from":"2026-05-01","date_to":"2026-05-01","full_day":true,"reason":"flu"}' \
  | jq -r '.data.id')

# Approve as owner
curl -i -X POST http://localhost:3001/api/v1/leave-requests/$REQ_ID/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"review_notes":"Approved"}'
```

Then:

```sql
SELECT recipient_user_id, payload_json->>'decision' AS decision
FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key = 'staff.leave_decision'
ORDER BY created_at DESC LIMIT 1;
```

Expect `decision = 'approved'`, recipient = the teacher's user_id.

#### Flow 5 — School closure broadcast

```bash
curl -i -X POST http://localhost:3001/api/v1/school-closures \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"closure_date":"2026-05-15","reason":"weather","title":"Snow day"}'
```

Then:

```sql
SELECT count(*) FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key = 'school.closure'
  AND created_at > now() - interval '5 minutes';
```

Expect a non-zero count matching the active-user audience.

#### Flow 6 — SEN EHA update

Find an existing SEN support plan id, then transition it:

```bash
PLAN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/sen/support-plans?status=draft \
  | jq -r '.data[0].id')

curl -i -X PATCH http://localhost:3001/api/v1/sen/support-plans/$PLAN_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"active"}'
```

Then:

```sql
SELECT count(*) FROM notification
WHERE tenant_id = '<nhqs-id>'
  AND template_key = 'sen.eha_update'
  AND source_entity_id = '<plan-id>'
  AND created_at > now() - interval '5 minutes';
```

Expect a count of `parents_count + sen_coordinator_count`.

#### Flow 7 — Frontend push removal

Navigate to `http://localhost:5551/en/settings/notifications` (logged in as owner). Confirm:

- The channel header row shows columns: `Type | Enable | Email | SMS | WhatsApp` (NOT Push).
- The WhatsApp checkbox is interactive (toggling it persists via `PATCH /api/v1/notification-settings/:type`).
- No console errors (`browser_console_messages(level: 'error')` returns []).

Navigate to `http://localhost:5551/en/profile/communication`. Confirm the same:

- The toggles are Email / SMS / WhatsApp, not Push.

Navigate to `http://localhost:5551/en/reports/notification-delivery`. Confirm the channel filter dropdown shows "WhatsApp" not "Push".

#### Flow 8 — Type-check passes

```bash
pnpm turbo run type-check
```

No errors. If errors surface, they are SMS-aware consumers that need an `'sms'` branch — fix them in this same impl.

### 11.5 Local verification block to record in §5

```
- **Local verification:**
  - Endpoints covered: payment-reminders crons (3 types); /v1/auth/password-reset/{request,confirm};
    /v1/leave-requests/:id/{approve,reject}; /v1/school-closures POST; /v1/sen/support-plans PATCH.
  - Database spot-check: 8 new notification template_keys × 4 channels × 2 locales = 64 rows present.
  - Frontend pages: settings/notifications, profile/communication, reports/notification-delivery
    all render WhatsApp option, no Push option, no console errors.
  - Direct-write audit: `grep -rn "prisma.notification.create" apps/api/src/modules` returns
    only hits inside apps/api/src/modules/communications/ (the canonical service path).
  - DI smoke: AppModule.compile() returned OK after adding NotificationsService deps to
    finance, auth, school-closures, leave, sen modules.
  - Test suites passing: payment-reminders.service.spec.ts (X tests),
    auth-password-reset.service.spec.ts (X tests),
    leave-requests.service.spec.ts (X tests),
    school-closures.service.spec.ts (X tests),
    sen-support-plan.service.spec.ts (X tests),
    notifications.service.spec.ts (X tests),
    notification-types.spec.ts (2 tests),
    comms-gap-templates.spec.ts (4 tests),
    notification-template.spec.ts type-test (compiles).
  - Console errors observed: none.
  - Run timestamp: <ISO>.
```

---

## Files touched

### New files

```
packages/prisma/seed/comms-gap-templates.ts                              [NEW]
packages/prisma/seed/comms-gap-templates.spec.ts                         [NEW]
packages/shared/src/constants/notification-types.spec.ts                 [NEW]
packages/shared/src/types/notification-template.spec.ts                  [NEW]
apps/web/src/app/[locale]/(school)/settings/notifications/page.spec.tsx  [NEW]
```

### Modified files (claim under Rule 17 where listed)

```
packages/shared/src/constants/notification-types.ts                      [+8 entries] (CLAIM)
packages/shared/src/types/notification-template.ts                       [+'sms' to union]
packages/prisma/seed.ts                                                  [+seed loop]

apps/api/src/modules/finance/payment-reminders.service.ts                [migrate to NotificationsService]
apps/api/src/modules/finance/payment-reminders.service.spec.ts           [update mocks]
apps/api/src/modules/finance/finance.module.ts                           [+CommunicationsModule]

apps/api/src/modules/auth/auth-password-reset.service.ts                 [wire dispatch]
apps/api/src/modules/auth/auth-password-reset.service.spec.ts            [add dispatch tests]
apps/api/src/modules/auth/auth.module.ts                                 [+CommunicationsModule]

apps/api/src/modules/leave/leave-requests.service.ts                     [wire dispatch on approve/reject]
apps/api/src/modules/leave/leave-requests.service.spec.ts                [add dispatch tests]
apps/api/src/modules/leave/leave.module.ts                               [+CommunicationsModule]

apps/api/src/modules/school-closures/school-closures.service.ts          [wire dispatch on create]
apps/api/src/modules/school-closures/school-closures.service.spec.ts     [add dispatch tests]
apps/api/src/modules/school-closures/school-closures.module.ts           [+CommunicationsModule]

apps/api/src/modules/sen/sen-support-plan.service.ts                     [wire dispatch on transitionStatus]
apps/api/src/modules/sen/sen-support-plan.service.spec.ts                [add dispatch tests]
apps/api/src/modules/sen/sen.module.ts                                   [+CommunicationsModule]

apps/web/src/app/[locale]/(school)/settings/notifications/page.tsx       [push → whatsapp]
apps/web/src/app/[locale]/(school)/profile/communication/page.tsx        [push → whatsapp]
apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx [push → whatsapp]
apps/web/messages/en.json                                                [+channelWhatsapp key] (CLAIM)
apps/web/messages/ar.json                                                [+channelWhatsapp key] (CLAIM)
```

### Files NOT touched (deliberate)

- `packages/prisma/schema.prisma` — no model changes; the `Notification` enum already supports `'sms'`.
- `packages/prisma/rls/policies.sql` — no new tenant-scoped tables.
- `apps/api/src/modules/trips/` — placeholder module; documented as gap, no skeleton service created.
- `apps/api/src/modules/health/` — system health monitoring; no medical-incident module exists, documented as gap.
- `apps/api/src/modules/communications/notifications.service.ts` — canonical `createBatch` API stays unchanged; this impl only adds **callers**, not new methods.
- `docs/architecture/*.md` — Impl 14 owns architecture doc updates per Rule 14.

### Shared-file claim register (Rule 17)

Append to `IMPLEMENTATION_LOG.md` §5 before opening the claimed files:

```
### [WAVE 4 SHARED-FILE CLAIM] — impl 12
- Claims: packages/shared/src/constants/notification-types.ts
- Claims: apps/web/messages/en.json
- Claims: apps/web/messages/ar.json
- Until: committed OR flipped to `🛑 blocked`
```

Impl 11 (frontend Settings UI) is the only sibling in Wave 4. It does not touch `notification-types.ts` and only adds new top-level keys to `messages/{en,ar}.json`. We deep-merge with Impl 11's translation additions per the per-session commit-hygiene rules in `CLAUDE.md`.

---

## Rollback

Worktree-only commits. Recovery is git revert.

```bash
git -C <worktree-path> log --oneline -10
git -C <worktree-path> revert --no-commit <impl-12-commit-1-sha> <impl-12-commit-2-sha> ...
git -C <worktree-path> commit -m "revert(comms): roll back Impl 12 — module gap closure + cleanups"
```

After revert:

- The frontend re-shows the `'push'` channel option.
- Finance returns to the direct `prisma.notification.create` pattern. The dedup ledger in `invoice_reminder` continues to work (its rows were never affected by this impl).
- Auth password reset returns to its stub state (no email sent; reset still operable via API).
- The notification-template seed rows seeded by Impl 12 stay in the local dev DB — they are harmless (no consumer references them after revert). To clean:

```sql
DELETE FROM notification_template
WHERE tenant_id IS NULL
  AND template_key IN (
    'auth.password_reset', 'auth.password_changed',
    'trip.invitation', 'trip.payment_due',
    'school.closure', 'staff.leave_decision',
    'health.incident', 'sen.eha_update'
  );
```

The eight new entries in `NOTIFICATION_TYPES` revert with the source file. No DB schema changes; no migrations to roll back.

---

## Follow-ups

- **Trips wiring** — when the trips domain lands (a future rebuild), wire `trip.invitation` and `trip.payment_due` from the trips create flow + the trips payment-reminder cron. The notification types and templates are already seeded by Impl 12. Owner: future trips rebuild.
- **Medical/health module** — when the student-medical / nurse-visit module lands, wire `health.incident` from the incident-log endpoint. Owner: future health rebuild.
- **SMS template authoring UI** — Impl 11 ships the channel selectors but does not include a tenant-facing template authoring UI for the new keys. The current notification-templates admin UI handles this — verify after merge that adding a tenant override for `auth.password_reset` works through the existing `/settings/notification-templates` page.
- **`channelPush` translation key** — the `messages/{en,ar}.json` files still contain a `channelPush` entry. It is unused in code after this impl. A later cleanup can purge it via the existing unused-i18n-key tooling.
- **Audience resolution for closures** — Impl 12 fans out to `scope: 'school'`. If schools want narrower audiences (only affected year groups, only opted-in parents), a future enhancement can plumb through the closure DTO's `affected_classes` / `affected_year_groups`. Out of scope here.
- **SEN coordinator resolution** — Impl 12 uses a permission-based query. If the tenant model later gains a dedicated `sen_coordinator_user_id` column, swap the resolver to use it directly (cheaper).
- **Architecture docs** — Impl 14 owns:
  - `feature-map.md` — record that Auth, Leave, SchoolClosures, SEN now dispatch comms; remove the "⚠️ direct DB write" note from Finance's row.
  - `module-blast-radius.md` — finance, auth, leave, school-closures, sen now consume `CommunicationsModule`.
  - `event-job-catalog.md` — no new BullMQ jobs; the new dispatch sites enqueue through the existing notification queue path via `createBatch`.
  - `state-machines.md` — leave-request and SEN-support-plan transitions now have a notification side-effect; document.
  - `danger-zones.md` — add: "any module that creates a `notification` row directly bypasses rate limits, consent, audit, and unsubscribe — never write `prisma.notification.create` outside `apps/api/src/modules/communications/`."
  - `communication-architecture.md` §4.7 — flip the "Module hygiene" notes from "to-do" to "shipped"; the `payment-reminders.service.ts` direct-write entry can be deleted from the touchpoint map's "⚠️" column.

---

## Key invariants this impl establishes

1. **No direct `prisma.notification.create` outside communications.** The architectural-invariant test (Test 1) enforces this for `payment-reminders.service.ts`. Future impls should add similar invariants if other modules attempt direct writes.
2. **Every new comms touchpoint goes through `NotificationsService.createBatch`.** This means: rate limits apply, consent checks apply, audit interceptor logs the row, unsubscribe gating applies, idempotency keys can be set. Bypassing the service is bypassing all of this.
3. **The `'push'` channel does not exist in the frontend code paths.** Three files were updated; the architectural grep audit (§7.4) is the gate.
4. **The `NotificationTemplate.channel` type union includes `'sms'`.** The compile-time test (Test 9) enforces this. If a future PR drops `'sms'` or re-adds `'push'`, the test fails.
5. **Every new notification type has a complete template set.** 8 keys × 4 channels × 2 locales = 64 rows. The seed-coverage test (Test 10) enforces the count.
6. **Seed templates are platform-level (`tenant_id IS NULL`).** Tenants can override via the existing template-resolution chain (tenant row preferred when present), but the platform default is always available — even for fresh tenants with no overrides.
7. **The audit row + the password-reset-token row are written even when the email send fails.** Email is best-effort; the security-critical state changes (password reset token issued, password changed, audit log written) are not gated on the dispatch result. The dispatch is a side-effect, not a precondition.
8. **Trips and health are documented gaps, not invented modules.** The PLAN spec explicitly says don't invent missing modules; we follow that rule. The notification types and templates are seeded so the surface is ready for future wiring.
9. **Finance's `invoice_reminder` dedup ledger stays in finance.** The dedup is a finance-domain concern (we sent THIS reminder for THIS invoice), separate from the comms-domain concern (we attempted to deliver THIS notification). The two tables solve different problems and Impl 12 keeps both.
