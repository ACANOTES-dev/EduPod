# State Machine Contracts

> **Purpose**: Before changing a status field or adding a transition, check here for the full contract.
> **Maintenance**: Update when adding new statuses or changing transition rules.
> **Last verified**: 2026-05-16 (Session 1.5C platform confirmation/alert silencing: documented owner confirmation execution status plus alert silence and maintenance-window lifecycle fields). Previously: 2026-05-16 (Session 1D platform onboarding tracker: documented `BillingStatus` and `OnboardingStepStatus`). Previously: 2026-05-13 (drift sweep against `packages/prisma/schema.prisma`: corrected `NotificationStatus` (the `bounced`/`complained` states never actually entered the enum — bounce/complaint tracking lives on `notification_suppression_list`; documented the dormant `claimed` value); flagged synthetic lifecycles as "not a Prisma enum"; disclosed `@map` translations on `CriticalIncidentStatus`; added a Catalog Index for the ~50 enums not previously documented and promoted seven high-traffic ones to full sections.); 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off baseline).

---

## How to read this

Each state machine lists:

- **Valid transitions**: `from -> [to1, to2]`
- **Terminal states**: No outgoing transitions (marked with `*`)
- **Side effects**: What happens when a transition occurs
- **Guarded by**: Where the transition validation lives

---

## Core Entity Lifecycles

### StudentStatus

```
applicant  -> [active]
active     -> [withdrawn, graduated, archived]
withdrawn  -> [active]
graduated  -> [archived]
archived*
```

- **Guarded by**: `packages/shared/src/constants/student-status.ts` + `students.service.ts`
- **Side effects**: Status change triggers search reindex. `active` enables class enrolment. `withdrawn/archived` should cascade to drop active enrolments.
- **Note**: Transition map is duplicated in shared constants AND service — keep both in sync.

### ClassEnrolmentStatus

```
active    -> [dropped, completed]
dropped   -> [active]
completed*
```

- **Guarded by**: `packages/shared/src/constants/class-enrolment-status.ts` + `class-enrolments.service.ts`
- **Side effects**: `dropped` removes student from class. `active` (re-enrol) adds them back. `completed` is set during year-end promotion.
- **Note**: Transition map is duplicated in shared constants AND service — keep both in sync.

### Household Communication Locale Opt-In

This is not a status enum, but the two household locale fields form a small dispatch state machine:

```
dual_language_opt_in=false, secondary_locale=null     -> single-locale dispatch
dual_language_opt_in=false, secondary_locale=<locale> -> single-locale dispatch
dual_language_opt_in=true,  secondary_locale=null     -> single-locale dispatch
dual_language_opt_in=true,  secondary_locale=<locale> -> dual-locale dispatch when distinct from default and tenant-supported
```

- **Guarded by**: `PATCH /v1/households/:id/locale-preferences` validates `secondary_locale` against `tenant.supported_locales`.
- **Side effects**: `NotificationsService.createBatch` emits the default-locale notification row first, then the secondary-locale row if the opt-in state is active.
- **No-op duplicate rule**: if `secondary_locale` equals the resolved default locale, dispatch remains single-locale.

### AcademicYearStatus

```
planned -> [active]
active  -> [closed]
closed*
```

- **Guarded by**: `academic-years.service.ts` line 17
- **Side effects**: Only ONE year can be `active` per tenant (enforced in service). `active` enables all academic operations. `closed` triggers promotion eligibility.
- **Danger**: Closing a year while periods are still `active` is possible — service does not enforce period closure first.

### AcademicPeriodStatus

```
planned -> [active]
active  -> [closed]
closed*
```

- **Guarded by**: `academic-periods.service.ts` line 17
- **Side effects**: `closed` triggers the `report-cards:auto-generate` cron job (daily 03:00 UTC check). Gradebook assessments should be locked before period closure.

### SupportPlanStatus (SEN)

```
draft         -> [active]
active        -> [under_review, closed]
under_review  -> [active, closed]
closed        -> [archived]
archived*
```

- **Guarded by**: `packages/shared/src/sen/state-machine.ts`, enforced at runtime by `apps/api/src/modules/sen/sen-support-plan.service.ts`
- **Side effects**:
  - `draft -> active`: sets `next_review_date` from tenant setting `sen.default_review_cycle_weeks`
  - `active -> under_review`: stamps `review_date` and `reviewed_by_user_id`
  - `under_review -> active`: clears review state and assigns a fresh `next_review_date`
  - `under_review -> closed`: persists final `review_notes` and reviewer
  - `closed -> archived`: terminal archival, no downstream jobs yet

### SenGoalStatus

```
not_started        -> [in_progress]
in_progress        -> [partially_achieved, achieved, discontinued]
partially_achieved -> [in_progress, achieved, discontinued]
achieved*
discontinued*
```

- **Guarded by**: `packages/shared/src/sen/state-machine.ts`, enforced at runtime by `apps/api/src/modules/sen/sen-goal.service.ts`
- **Side effects**:
  - `not_started -> in_progress`: status only
  - `in_progress -> partially_achieved`: optional append-only progress note
  - `* -> achieved`: optional append-only achievement note plus optional `current_level` update
  - `* -> discontinued`: optional append-only discontinuation note plus optional `current_level` update

### SenReferralStatus (Professional Involvement)

```
pending         -> [scheduled]
scheduled       -> [completed]
completed       -> [report_received]
report_received*
```

- **Guarded by**: `packages/shared/src/sen/state-machine-referral.ts` — `isValidReferralTransition()`. Strictly forward-only; no skipping steps, no backward transitions.
- **Location**: `apps/api/src/modules/sen/sen-professional.service.ts` (enforced in `update()`)
- **Side effects**: None. Status is informational tracking for the referral lifecycle.

---

## Admissions & Registration

### ApplicationStatus (new-admissions rebuild, financially gated)

```
(public form submit)       -> submitted  (transient, gating runs on entry)
submitted                  -> [ready_to_admit | waiting_list | waiting_list+awaiting_year_setup]
ready_to_admit             -> [conditional_approval, rejected, withdrawn]
waiting_list               -> [ready_to_admit (auto-promote), rejected, withdrawn]
waiting_list+awaiting_year_setup
                           -> [waiting_list (when year group activated), ready_to_admit (if capacity)]
conditional_approval       -> [approved (payment match / override), waiting_list (deadline lapse), rejected, withdrawn]
approved*                  (terminal — student, household, parent records materialised)
rejected*                  (terminal — seat released if held)
withdrawn*                 (terminal — seat released if held)
```

- **Guarded by**: `packages/shared/src/admissions/application-status.ts` (enum + constants) + `application-state-machine.service.ts` (`VALID_TRANSITIONS` map, dedicated methods: `submit`, `moveToConditionalApproval`, `reject`, `withdraw`, `markApproved`, `revertToWaitingList`, `manuallyPromoteToReadyToAdmit`).
- **Capacity math (critical)**: every non-terminal transition re-checks seat availability via `AdmissionsCapacityService` inside the caller's RLS transaction. Conditional approvals hold a seat until approved or the 7-day payment deadline lapses; the math subtracts them from the raw year-group capacity so concurrent approvals cannot oversubscribe.
- **Side effects**:
  - `submitted`: generates application number (SequenceService); runs gating to route to ready/waiting/awaiting-year-setup; stamps `apply_date` for FIFO.
  - `ready_to_admit → conditional_approval`: row-locks the application, re-checks capacity, resolves fees via `FinanceFeesFacade`, stamps `payment_amount_cents` + `payment_deadline`, enqueues `admissions:payment-link` for Stripe session creation.
  - `conditional_approval → approved`: calls `ApplicationConversionService.convertToStudent` which materialises Student + Household + Parent + Consent rows, stamps `materialised_student_id` for idempotency. Triggered by Stripe webhook, cash/bank recording, or admin override (with `AdmissionOverride` audit row).
  - `conditional_approval → waiting_list` (expiry): releases the seat, fires auto-promotion pass for the same (academic_year, year_group) so the next FIFO applicant moves up. Handled by the `admissions:payment-expiry` cron (every 15 min).
  - `reject | withdraw` from conditional_approval: releases seat, fires auto-promotion pass.
- **Auto-promotion triggers**:
  - `ClassesService.create` → `AdmissionsAutoPromotionService.onClassAdded` (new class with capacity).
  - Activating a year group for the first time → `AdmissionsAutoPromotionService.onYearGroupActivated` (drops `awaiting_year_setup` sub-status for matching rows, runs gating pass).
- **Tiered FIFO (household-numbers rebuild)**: `waiting_list → ready_to_admit` (auto-promotion) is now TIERED — applications with `is_sibling_application = true` promote ahead of non-sibling waiting-list entries, regardless of `apply_date`. Within each tier, FIFO by `apply_date` holds. The sort is: `ORDER BY is_sibling_application DESC, apply_date ASC`.
- **Legacy transitions removed**: `draft`, `under_review`, `pending_acceptance_approval`, `accepted` states deleted by migration `20260411000100_remove_legacy_admissions_statuses` (data migrated: `draft→withdrawn`, `under_review→ready_to_admit`, `pending_acceptance_approval→ready_to_admit`, `accepted→approved`).
- **See**: `new-admissions/PLAN.md` for the full state diagram, gating math, and payment flow.

### FormDefinitionStatus (Admission Forms)

```
draft     -> [published]
published -> [archived]
archived*
```

- **Guarded by**: `admission-forms.service.ts`
- **Side effects**: `published` makes form available for applications. Publishing a new version auto-archives the previous one.

### ConsentRecordStatus

```
granted   -> [withdrawn, expired]
withdrawn*
expired*
```

- **Guarded by**: `gdpr/consent.service.ts`
- **Side effects**: `withdrawn` takes effect synchronously on the next downstream read. WhatsApp notifications fall back to SMS, AI grading/comments/progress summaries reject requests, risk detection skips the student, allergy reports hide consent-gated rows, and cross-school benchmarking excludes the student immediately.
- **Note**: Active uniqueness is enforced by a partial unique index on `(tenant_id, subject_type, subject_id, consent_type)` where `status = 'granted'`, so withdrawn consent can be re-granted as a new row.

### DPA Acceptance

> **⚠ Synthetic — state via field/timestamp comparison, not a Prisma enum.** The "states" below are the result of comparing tenant `dpa_acceptances.dpa_version_id` against the current `dpa_versions.version`. There is no `DpaAcceptanceStatus` enum to grep for.

```
not_accepted               -> [accepted_current]
accepted_current          -> [stale_on_new_dpa_version]
stale_on_new_dpa_version  -> [accepted_current]
```

- **Guarded by**: `gdpr/dpa.service.ts` + global `gdpr/dpa-accepted.guard.ts`
- **Side effects**: Accepting the current DPA appends an immutable acceptance row with content hash, user, timestamp, and IP. A newly published platform `dpa_versions.version` does not mutate old rows; instead it makes previous acceptance stale because the global guard compares tenant acceptance against the current platform version before allowing tenant-scoped API access.

### PrivacyNoticeVersionPublication

> **⚠ Synthetic — state via `published_at IS NULL`, not a Prisma enum.** "Draft" = `published_at IS NULL`; "published" = `published_at IS NOT NULL`. There is no `PrivacyNoticeVersionStatus` enum.

```
draft      -> [published]
published*   (read-only; superseded only by a newer published version)
```

- **Guarded by**: `gdpr/privacy-notices.service.ts`
- **Side effects**: Drafts may be edited until `published_at` is set. Publishing fan-outs in-app notifications to all active tenant memberships and makes the new version the current acknowledgement target.

### PrivacyNoticeAcknowledgement

> **⚠ Synthetic — state via row-existence + version comparison, not a Prisma enum.** The "states" below are the result of comparing the latest `privacy_notice_acknowledgements` row for `(tenant_id, user_id)` against the current `privacy_notice_versions` row. There is no `PrivacyNoticeAcknowledgementStatus` enum.

```
not_acknowledged             -> [acknowledged_current]
acknowledged_current         -> [stale_on_new_notice_version]
stale_on_new_notice_version  -> [acknowledged_current]
```

- **Guarded by**: `gdpr/privacy-notices.service.ts`
- **Side effects**: Acknowledgements are unique per `(tenant_id, user_id, privacy_notice_version_id)`. When a newer notice is published, earlier acknowledgements remain in history but no longer satisfy the current-version check, which re-shows the acknowledgement banner until the latest version is acknowledged.

---

## Finance

### InvoiceStatus (CONSOLIDATED)

```
draft              -> [pending_approval, issued, cancelled]
pending_approval   -> [issued (via approval callback), cancelled]
issued             -> [partially_paid, paid, overdue, void, written_off]
partially_paid     -> [paid, written_off]
overdue            -> [partially_paid, paid, void, written_off]
paid*
void*
cancelled*
written_off*
```

- **Guarded by**: `packages/shared/src/constants/invoice-status.ts` -> `VALID_INVOICE_TRANSITIONS` map (single source of truth) + `helpers/invoice-status.helper.ts` -> `validateInvoiceTransition()` which enforces it in the API
- **Side effects**:
  - `draft -> issued`: sets `issue_date`, starts overdue clock. May route through `pending_approval` if approval is required.
  - `draft -> pending_approval`: links to approval request; approval callback worker handles `pending_approval -> issued`
  - `issued/overdue -> partially_paid`: automatic when payment < total (via `deriveInvoiceStatus` in payment allocation)
  - `issued/overdue/partially_paid -> paid`: automatic when cumulative payments >= total (via `deriveInvoiceStatus`)
  - `issued -> overdue`: set by `finance:overdue-detection` cron job, not by user action
  - `issued/overdue -> void`: requires no payments allocated (balance must equal total)
  - `issued/partially_paid/overdue -> written_off`: records `write_off_amount`, zeros balance
  - `draft/pending_approval -> cancelled`: cancels any linked approval request
- **Transition initiators**:
  - User-initiated: `draft->issued`, `draft->pending_approval`, `draft/pending_approval->cancelled`, `issued/overdue->void`, `issued/partially_paid/overdue->written_off`
  - System-driven: `pending_approval->issued` (approval callback worker), `issued->overdue` (overdue cron), `issued/overdue->partially_paid/paid` (payment service via `deriveInvoiceStatus`)
- **Payable statuses**: `issued`, `partially_paid`, `overdue` -- these are the only statuses that accept payment allocations, credit note applications, late fees, and Stripe checkout
- **Note**: The user-initiated `issue()` method only accepts `draft` status. The `pending_approval -> issued` path is handled exclusively by the `InvoiceApprovalCallbackProcessor` worker.

### PaymentStatus

```
pending         -> [posted, failed, voided]
posted          -> [refunded_partial, refunded_full, voided]
failed          -> [pending]
voided*
refunded_partial -> [refunded_full]
refunded_full*
```

- **Guarded by**: `packages/shared/src/finance/state-machine-payment.ts` — `isValidPaymentTransition()`. Wired in `payments.service.ts`.
- **Side effects**: `posted` updates invoice paid amount and may transition invoice to `partially_paid` or `paid`. `voided` reverses the payment and recalculates invoice status.

### RefundStatus

```
pending_approval -> [approved, rejected]
approved         -> [executed, failed]
executed*
rejected*
failed*
```

- **Guarded by**: `refunds.service.ts`
- **Side effects**: `executed` updates payment status to `refunded_partial` or `refunded_full` and recalculates invoice status.

### CreditNoteStatus

```
open            -> [partially_used, fully_used, cancelled]
partially_used  -> [fully_used]
fully_used*
cancelled*
```

- **Side effects**: Usage reduces invoice balance due.

### PaymentPlanStatus

```
pending         -> [approved, rejected, counter_offered]
counter_offered -> [approved, rejected]
approved*  (creates installment schedule)
rejected*
```

### ScholarshipStatus

```
active  -> [expired, revoked]
expired*
revoked*
```

---

## Payroll

### PayrollRunStatus

```
draft             -> [pending_approval, finalised, cancelled]
pending_approval  -> [draft (rejected), finalised (approved), cancelled]
finalised*
cancelled*
```

- **Guarded by**: `packages/shared/src/payroll/state-machine.ts` — `isValidPayrollRunTransition()`. Wired in `payroll-runs.service.ts` (`finalise()`, `cancelRun()`, `executeFinalisation()`).
- **Side effects**: `finalised` is now produced **only** through `FinalisationService.finaliseAtomic` (Wave 2 unification — single source of truth). Both the direct (school-owner) path and the worker approval-callback path call it; both emit `<PREFIX>-YYYYMM-NNNNNN` payslip numbers via the shared `formatPayslipNumber`. The atomic transaction generates payslip numbers (`tenant_sequences`), creates payslip rows, persists the new aggregate columns (`gross_pay` / `total_deductions` / `net_pay` / `*_total`) AND the legacy compatibility columns (`basic_pay` / `bonus_pay` / `total_pay`), commits the two-phase recurring deductions (see `danger-zones.md` **DZ-Payroll-2**), and flips the run status. Self-heals on already-finalised runs (no double payslips).
- `pending_approval -> cancelled` (Wave 2 addition) is the escape hatch for stuck runs whose approval request never executes; `cancelRun()` is responsible for cancelling the dangling `ApprovalRequest`.
- **Danger**: `finalised` via the approval-callback path happens in the worker, not the API. The unified atomic transaction means a worker mid-flight failure rolls the entire run back; partial payslip creation is no longer possible. If the worker dies after committing but before reporting success, the next retry of the same job sees the already-finalised state and is a clean no-op.

---

## Communications

### AnnouncementStatus

```
draft            -> [pending_approval, scheduled, published]
pending_approval -> [published (via approval callback)]
scheduled        -> [published (by scheduler)]
published        -> [archived]
archived*
```

- **Side effects**: `published` triggers notification dispatch to all audience members.

### NotificationStatus

**Actual enum** (`packages/prisma/schema.prisma:435`, six values):

```
queued, claimed, sent, delivered, failed, read
```

State diagram (production behaviour — the `claimed` value is reserved/dormant, see note below):

```
queued    -> [sent, delivered, failed]
sent      -> [delivered, failed]
delivered -> [read]
read*
failed    -> [queued]   // retryable, within max_attempts (re-enqueued by retry processor)
```

- **Guarded by**: `apps/api/src/modules/communications/notifications.service.ts` + `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` + the webhook handlers in `apps/api/src/modules/communications/webhooks/`.
- **Side effects**:
  - `queued -> sent`: provider `messages.create` (or `emails.send`) returns success; `provider_message_id` populated; `last_attempt_at` updated. Email/SMS/WhatsApp path only.
  - `queued -> delivered` (in-app shortcut): `dispatch-notifications.processor.ts:383` writes `delivered` straight onto in-app rows because there is no external acknowledgement to wait for. `notifications.service.ts:169` also creates in-app rows pre-stamped as `delivered`.
  - `sent -> delivered`: webhook event `email.delivered` (Resend) or `MessageStatus=delivered` (Twilio). Sets `delivered_at`.
  - `sent -> failed`: Twilio `MessageStatus=failed` or `MessageStatus=undelivered`. Increments `attempts`; if below `max_attempts`, the retry processor re-enqueues (back to `queued`).
  - `queued -> failed`: dispatch attempt threw or was skipped (e.g. `channel_not_configured`, `channel_disabled`, `suppressed:*`, `outside_service_window_no_template`, `sender_domain_unverified`). Sets `failure_reason`.
  - `delivered -> read`: in-app inbox mark-as-read via `notifications.service.ts:106-108` (`markAsRead`) or `:115-122` (`markAllAsRead`).
  - `failed -> queued`: retry processor (`retry-failed.processor.ts`) re-enqueues with exponential backoff `60_000 × 2^attempts` ms. The unread-count and inbox-listing queries treat `failed` as non-unread (see `unread_only` filter at `notifications.service.ts:51` and `:80`: `status: { in: ['queued', 'sent', 'delivered'] }`).
- **Failure reasons** (set on `failed`):
  - `channel_not_configured` — tenant has no config row for the channel.
  - `channel_disabled` — tenant disabled the channel (`is_enabled=false`); detected mid-flight.
  - `suppressed:hard_bounce`, `suppressed:complaint`, `suppressed:manual`, `suppressed:unsubscribe`, `suppressed:soft_bounce_threshold` — recipient on suppression list.
  - `outside_service_window_no_template` — WhatsApp send outside 24h window with no `template_key`.
  - `sender_domain_unverified` — Resend send from an unverified domain.
  - `Resend bounce (hard|soft): <message>` / `Resend spam complaint` — see "Bounces & complaints" below.
  - `provider_error:<verbatim>` — provider returned an unhandled error.
- **`claimed` (dormant)**: added to the enum by migration `20260402080000_add_reliability_r13_r18_r19_r23` (R-18, "claim before dispatch") and ordered between `queued` and `sent`. **No production code currently reads or writes this value** — both `dispatch-notifications.processor.ts` and the webhook handlers operate directly on `queued`/`sent`. It is reserved for a future "claim a row before dispatching to prevent two workers picking the same notification" pattern. Treat the value as forward-compatible: keep matching against it in any `status in (...)` filter you add, but do not assume any code path produces it today.
- **Bounces & complaints — NOT a status transition**: the `bounced` and `complained` states **do not exist in the enum**. Resend's `email.bounced` and `email.complained` webhooks are translated by `resend-webhook-handler.service.ts` into:
  - `notification.status = 'failed'` with a descriptive `failure_reason` (e.g. `Resend bounce (hard): mailbox full`, `Resend spam complaint`), AND
  - a row inserted into `notification_suppression_list` with `SuppressionReason` ∈ `hard_bounce | soft_bounce_threshold | complaint | manual | unsubscribe`.

  The suppression-list row — not the notification row — is the canonical record of "permanent failure for this recipient". Future sends to that recipient short-circuit to `failed` with `failure_reason='suppressed:<reason>'`. Soft bounces only insert a suppression row after `SOFT_BOUNCE_THRESHOLD = 3` events in `SOFT_BOUNCE_LOOKBACK_DAYS = 30`.

- **Note**: `read` is the only terminal state. `failed` is non-terminal because retries cycle through `queued`. The `chain_id` UUID is preserved across all retries so the fallback chain can identify them as related. WhatsApp delivery also has a consent gate: missing active `whatsapp_channel` consent immediately transitions the original notification to `failed` and creates an SMS fallback notification.

### WhatsAppTemplateStatus (Impl 08 of Communications Overhaul)

```
pending    -> [submitted]
submitted  -> [approved, rejected]
approved   -> [paused]
rejected*
paused     -> [approved]
```

- **Guarded by**: `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.service.ts`.
- **Side effects**:
  - `pending -> submitted`: tenant clicks "Submit for approval" in the settings UI. POSTs to Twilio Content API; on accept, sets `submitted_at`; on Twilio reject, throws (state stays `pending`).
  - `submitted -> approved`: cron `comms:whatsapp-template-sync` (every 15 min) polls Twilio; status comes back `approved`. Stores `twilio_template_sid`. Sets `approved_at`. Dispatches in-app notification to the user who submitted the template.
  - `submitted -> rejected`: same cron path; status comes back `rejected`. Stores `approval_message` with the verbatim rejection reason. Dispatches in-app notification. Terminal — user must clone-and-resubmit (creates a new pending row).
  - `approved -> paused`: Twilio paused the template (rate limit, abuse signal, etc.). Cron detects and updates. Outbound sends using this template are blocked while paused.
  - `paused -> approved`: cron detects re-activation. Outbound sends using this template are unblocked.
- **Note**: only `approved` templates are eligible for outbound sends outside the 24-hour service window. Inside the window, free-form sends do not consult this table.

### EmailDomainStatus (Impl 07 of Communications Overhaul)

```
pending  -> [verified, failed]
verified -> [pending]   // re-register if DNS records were edited
failed   -> [pending]   // re-register if DNS records were edited
```

- **Guarded by**: `apps/api/src/modules/communications/deliverability/email-domain.service.ts` + `apps/worker/src/processors/communications/domain-verification-refresh.processor.ts`.
- **Side effects**:
  - `pending -> verified`: cron `comms:domain-verification-refresh` (every 30 min) polls Resend; all three of SPF / DKIM / DMARC return `verified`. Sets `verified_at`. Dispatches in-app notification to the user who registered the domain.
  - `pending -> failed`: same cron path; one or more of SPF / DKIM / DMARC return `failed`. Sets `failure_reason` with the verbatim Resend error. Continues polling — a tenant can fix DNS records and the next poll will flip the row to verified.
  - `verified -> pending` (re-register): tenant calls `POST /v1/email-domains/:id/refresh` after editing DNS records. Resets per-record statuses and `last_checked_at`.
  - `failed -> pending` (re-register): same as above.
- **Note**: outbound dispatch enforces verified-domain status. Sends from an unverified or failed domain are skipped with `failure_reason='sender_domain_unverified'`. The `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag bypasses the check in local dev only — production must never set it.

### ParentInquiryStatus

```
open        -> [in_progress, closed]
in_progress -> [closed]
closed*
```

### ContactFormStatus

```
new_submission -> [reviewed, closed, spam]
reviewed       -> [closed, spam]
closed*
spam*
```

- **Guarded by**: `contact-form.service.ts` line 10 (explicit transition map)

### ConversationLifecycle (inbox, 2026-04-11)

> **⚠ Synthetic — state via `conversations.state` text/varchar field, not a Prisma enum.** There is no `ConversationLifecycleStatus` enum to grep for; the values below are produced by service-layer string writes against the `conversations.state` column.

```
active    -> [frozen, archived]
frozen    -> [active (unfrozen), archived]
archived*
```

- **Owned by**: `ConversationsService` + `InboxOversightService` (`apps/api/src/modules/inbox/`).
- **Terminal state**: `archived` is terminal. An archived conversation is hidden from participants' inbox list but still visible in admin oversight.
- **`active` → `frozen`**: set by admin via `InboxOversightService.freeze`. Requires `inbox.oversight.read`. Writes a system message into the thread ("This conversation has been disabled by school administration") and an `oversight_access_log` row. Participants see a banner instead of a composer; the policy chokepoint `canReplyToConversation` returns `false` regardless of matrix. Freezing requires a non-empty `freeze_reason` (enforced in the DTO).
- **`frozen` → `active`**: `InboxOversightService.unfreeze`. Writes a second system message ("Conversation re-enabled") and an `oversight_access_log` row. Clears `freeze_reason`.
- **`active|frozen` → `archived`**: admin-triggered retention action or per-user archive (note: per-user archive is a participant flag on `conversation_participants`, not a state transition on `conversations`). True archival of the conversation row is pending a retention worker.
- **Enforcement**: the chokepoint is `MessagingPolicyService.canReplyToConversation`, which checks `conversation.state === 'frozen'` before consulting the matrix. Freezing does NOT delete messages — oversight retains full read access to a frozen thread.

### MessageFlagReviewState (inbox safeguarding, 2026-04-11)

```
pending    -> [dismissed, escalated, frozen]
dismissed* (false positive — flag gone, message stays)
escalated* (external review — PDF export generated)
frozen*    (thread locked down alongside flag action)
```

- **Owned by**: `InboxOversightService` + `safeguarding:scan-message` processor.
- **Entry**: a `message_flags` row is created in `pending` when the scanner matches one or more keywords. `severity = MAX(matched_keywords.severity)`, `matched_keywords[]` carries the word list.
- **`pending` → `dismissed`**: `InboxOversightService.dismissFlag`, requires non-empty `review_notes`. Writes an `oversight_access_log` row. The original message stays visible to participants; only the flag is removed from the review queue.
- **`pending` → `escalated`**: `InboxOversightService.escalateFlag`, requires non-empty `review_notes`. Enqueues `pdf:render` for a conversation export, stamps `message_flags.export_url` when the render completes, writes an `oversight_access_log` row, and surfaces the PDF download link to the reviewer.
- **`pending` → `frozen`**: `InboxOversightService.freezeFromFlag`, which atomically freezes the containing conversation (see ConversationLifecycle above) AND marks the flag as reviewed with `review_state = 'frozen'`. A single `review_notes` value is used for both actions.
- **Terminal**: all three non-pending states are terminal. Flags cannot be re-opened — create a new flag or re-run the scanner if review needs to happen again. Dismissal is deliberately irreversible to prevent reviewer fatigue / re-litigation.
- **Dashboard surface**: `SafeguardingAlertsWidget` polls `GET /v1/inbox/oversight/flags?review_state=pending` every 60s and surfaces the pending queue to admin-tier users on the dashboard.

---

## Scheduling

### SchedulingRunStatus

```
queued    -> [running]
running   -> [completed, failed]
completed -> [applied, discarded]
failed*
applied*
discarded*
```

- **Side effects**: `applied` writes schedules to the schedules table. `failed` may be set by stale reaper cron if run exceeds 30 minutes. `completed` stores result in `result_json` JSONB.

### SubstitutionStatus

```
assigned  -> [confirmed, declined]
confirmed -> [completed]
declined*
completed*
```

### ExamSessionStatus

```
planning  -> [published]
published -> [completed]
completed*
```

### ScenarioStatus

```
draft   -> [solved]
solved  -> [approved, rejected]
approved*
rejected*
```

---

## Attendance

### AttendanceSessionStatus

```
open      -> [submitted, cancelled]
submitted -> [locked]
locked*
cancelled*
```

- **Side effects**: `submitted` makes records visible to parents. `locked` prevents any further edits. `cancelled` by school closure detection.

### AttendanceAlertStatus

```
active       -> [acknowledged, resolved]
acknowledged -> [resolved]
resolved*
```

---

## Gradebook

### AssessmentStatus

```
draft             -> [open]                          (teacher opens for grade entry)
open              -> [submitted_locked]              (teacher final-submits all grades)
submitted_locked  -> [unlock_requested]              (teacher requests unlock)
unlock_requested  -> [reopened, submitted_locked]    (approver grants or denies)
reopened          -> [final_locked]                   (teacher resubmits after amendment)
final_locked*
```

- **Guarded by**: `assessments.service.ts` `transitionStatus()` and unlock request flow
- **Side effects**: `submitted_locked` triggers grade calculation eligibility.
- **Legacy values**: `closed` and `locked` exist in the Prisma enum for backward compatibility but have been data-migrated:
  - `closed` → `submitted_locked`
  - `locked` → `final_locked`
- **Note**: The unlock flow (`submitted_locked -> unlock_requested -> reopened`) replaces the old `closed -> open` reopen path. Only an approver can grant the unlock; denial keeps the assessment in `submitted_locked`.

### ConfigApprovalStatus (AssessmentCategory, RubricTemplate, CurriculumStandard, TeacherGradingWeight)

```
draft             -> [pending_approval]   (teacher submits)
pending_approval  -> [approved, rejected] (approver reviews)
rejected          -> [draft]              (teacher edits and resets)
approved          -> [archived]           (admin archives)
archived*
```

- **Guarded by**: each respective service's `submitForApproval()` and `review()` methods
- **Side effects**: Only `approved` items can be used in assessment creation.
- **Note**: This config approval workflow applies to teacher-created configuration entities (assessment categories, rubric templates, curriculum standards, teacher grading weights). It ensures all teacher-authored config is reviewed before it enters the active grading pipeline.

### ReportCardStatus

```
draft      -> [published, revised, superseded]
published  -> [revised, superseded]
revised    -> [superseded]  (revised creates a new version chain)
superseded* (overwritten by a regeneration run)
```

- **Guarded by**: `report-cards.service.ts` (existing) and the regeneration pipeline introduced by Implementation 03 of the Report Cards Redesign.
- **Side effects**: When a row is `superseded`, the canonical query excludes it; the file at `pdf_storage_key` is queued for cleanup; downstream listings render the new version only. The `revision_of_report_card_id` chain is preserved for audit.
- **Note**: `superseded` was added by Implementation 01 (Report Cards Redesign — Database Foundation). Existing transitions are preserved.

### CommentWindowStatus _(Report Cards Redesign — impl 01)_

```
scheduled -> [open, closed]
open      -> [closed]
closed    -> [open]   (admin reopen — typically via teacher request approval)
```

- **Guarded by**: `comment-windows.service.ts` (introduced in a later impl) and the partial unique index `report_comment_windows_one_open_per_tenant` which enforces "at most one `open` window per tenant" at the database layer.
- **Side effects**:
  - `scheduled -> open`: enables teacher comment edits and AI draft requests for the targeted academic period.
  - `open -> closed`: blocks further comment edits and AI calls. The AI draft endpoint must reject calls outside an open window with `COMMENT_WINDOW_CLOSED`.
  - `closed -> open`: reopening a previously closed window — only allowed when no other window for the same tenant is currently `open` (enforced by the partial unique index).
- **Cost control**: this state machine is the core mechanism that gates AI cost. Server-side enforcement is mandatory.

### ReportCardBatchJob (generation run) _(Report Cards Redesign — impl 04)_

Logical lifecycle exposed by `ReportCardGenerationService` + `ReportCardGenerationProcessor`:

```
pending (queued)       -> [running (processing), failed]
running (processing)   -> [completed, partial_success, failed]
completed*             (terminal — every student produced at least one PDF)
partial_success*       (terminal — at least one student failed, see errors_json)
failed*                (terminal — infrastructure-level failure before any student was processed)
```

The physical `BatchJobStatus` enum only carries four values today (`queued`, `processing`, `completed`, `failed`). The logical states above map onto them like so:

- `pending` = `queued`
- `running` = `processing`
- `completed` = `completed` with `students_blocked_count = 0`
- `partial_success` = `completed` with `students_blocked_count > 0` (inspect `errors_json`)
- `failed` = `failed` with `error_message` set

- **Guarded by**: `ReportCardGenerationService.generateRun` (insert as `queued` with `total_count = resolvedStudentIds.length`) and `ReportCardGenerationJob.processJob` (transitions `queued → processing → completed | failed`).
- **Side effects**:
  - `queued → processing`: sets `status = processing` and marks the start of PDF rendering.
  - `processing → completed`: every student's PDFs have been rendered and upserted; counters are final.
  - Per-student errors accumulate on `errors_json` without changing the terminal status — a completed run with a non-zero `students_blocked_count` is the logical "partial success" signal. The frontend wizard displays this as a warning banner.
  - `processing → failed`: infrastructure failure (tenant/template missing, DB unreachable) — no reports are produced and `error_message` is recorded.
- **Comment gating**: enforced synchronously by `dryRunCommentGate` before a run is enqueued. A run cannot move past `queued` without either (a) all required comments finalised or (b) an explicit `override_comment_gate` flag from an admin whose tenant has `allow_admin_force_generate = true`.
- **Overwrite semantics**: per-student upsert on `(tenant_id, student_id, academic_period_id, template_id, template_locale)`. Previous `pdf_storage_key` is deleted in the same transaction — see `danger-zones.md` for the data-loss tradeoff.

### TeacherRequestStatus _(Report Cards Redesign — impl 01, wired impl 05)_

```
pending   -> [approved, rejected, cancelled]
approved  -> [completed]
rejected* (terminal — author may submit a new request)
cancelled* (terminal — author cancelled before review)
completed* (terminal — admin executed the requested action)
```

- **Guarded by**: `apps/api/src/modules/gradebook/report-cards/report-card-teacher-requests.service.ts`. State validation lives in `VALID_TRANSITIONS`; every transition call runs `assertTransitionAllowed` before the DB update.
- **Side effects**:
  - `pending` → `approved`: if the caller passes `auto_execute = true`, the service calls `ReportCommentWindowsService.open` (for `open_comment_window` requests) or `ReportCardGenerationService.generateRun` (for `regenerate_reports` requests) BEFORE flipping status. A downstream failure leaves the request in `pending`. When auto-execute succeeds, `resulting_window_id` or `resulting_run_id` is populated on the request row in the same transaction as the status update.
  - `approved` → `completed`: housekeeping transition invoked by downstream flows when the resulting window closes or the generation run finishes. Currently called explicitly; no automatic completion wiring yet.
  - `rejected`: review note is recorded; in-app notification sent to the author via `NotificationsService.createBatch`.
  - `cancelled`: only the author can cancel, and only while `pending`. Enforced server-side via `requested_by_user_id === actor.userId` check before the state transition.
- **Notification fan-out**: on `submit`, every membership with `report_cards.manage` receives an in-app notification (`template_key: report_cards.teacher_request_submitted`). On `approve`/`reject`, the author receives a single in-app notification with the decision and any review note. Notification failures are logged but do not roll back the state transition.
- **Note**: `request_type = open_comment_window` requests must have `target_scope_json IS NULL`; `request_type = regenerate_reports` requests must carry a non-null `target_scope_json`. Cross-field rule is enforced by `submitTeacherRequestSchema` in `@school/shared/report-cards`.

### AcademicAlertStatus

```
active       -> [acknowledged, resolved]
acknowledged -> [resolved]
resolved*
```

---

## Platform & Infrastructure

### TenantStatus

```
active    -> [suspended, archived]
suspended -> [active, archived]
archived*
```

### BillingStatus

```
active     -> [past_due, cancelled]
past_due   -> [active, cancelled]
cancelled*
```

- **Guarded by**: Session 1D stores the status on `tenants.billing_status`; no billing automation transition service exists yet.
- **Side effects**: `billing_status_set` in the platform onboarding tracker is manual in Session 1D and records only onboarding completion. It does not suspend tenants, trigger invoicing, or perform Layer 2 billing/audit work.

### OnboardingStepStatus

```
pending     -> [in_progress, completed, skipped]
in_progress -> [pending, completed, skipped]
completed   -> [pending, in_progress, skipped]
skipped     -> [pending, in_progress, completed]
```

- **Guarded by**: `OnboardingService.updateStep()` validates blockers before allowing `completed` unless the update is an auto-complete event.
- **Side effects**: Every update publishes a `platform:onboarding` Redis pub/sub payload consumed by the platform WebSocket gateway as `onboarding:update`.
- **Scope**: Platform-level, no tenant RLS. The rows are tenant-associated by `tenant_id`, but the controller is guarded by platform-owner access only.

### PlatformOwnerActionConfirmation.execution_status

```
pending -> [executed, failed]
executed*
failed*
```

- **Guarded by**: `OwnerActionConfirmationService.confirmAndExecute()` creates the confirmation row as `pending`, writes the blocking platform audit entry, then updates to `executed` or `failed` after the registered executor returns.
- **Side effects**: The confirmation record stores action, target, payload summary, typed phrase, reason, actor, execution timestamp, and execution result. The confirmation phrase is friction, not authorization; platform RBAC remains the authorization boundary.
- **Scope**: Platform-level, no tenant RLS. The owner-confirmed action may target a tenant, but the confirmation row itself belongs to the platform audit/control plane.

### PlatformAiActionProposalStatus

```
awaiting_approval -> [approved, rejected, expired]
approved          -> [executing, executed, failed]
executing         -> [executed, failed]
executed*
failed*
rejected*
expired*
```

- **Schema**: `packages/prisma/schema.prisma` (`PlatformAiActionProposal.status`).
- **Guarded by**: `PlatformAiActionProposalsService` only. Proposals are created from cited 4C recommendations, approval re-checks both `platform.ai.approve_action` and the proposal's underlying permission, and destructive/sensitive actions route through Layer 1.5C owner confirmation. The AI is never an approver; `approved_by_user_id` is always the signed-in platform user.
- **Side effects**: `awaiting_approval -> approved` writes `ai_action_approved`; `awaiting_approval -> rejected` writes `ai_action_rejected`; terminal execution writes `ai_action_executed` plus the underlying domain audit entry where an executor mutates platform state. Owner-confirmed execution stores `owner_confirmation_id`.
- **Hard stops**: no state transition may execute schema/migration changes, deploy config edits, secret/env-var changes, cron changes, production server configuration changes, Module Gating registry changes, or repository code patches. Code-required fixes create `PlatformAgentHandoffPrompt` rows only.
- **Scope**: Platform-level, no tenant RLS. The proposal may carry `target_tenant_id` as evidence context, but the approval/execution ledger is part of the platform control plane.

### PlatformAlertSilence lifecycle

```
active/pending -> [removed, expired]
removed*
expired*
```

- **Storage model**: This is a timestamp-derived lifecycle, not a Prisma enum. A silence is active when `removed_at IS NULL`, `starts_at <= now`, and `ends_at > now`; pending when the start time is in the future; expired when `ends_at <= now`; removed when `removed_at` is set.
- **Guarded by**: `AlertSilenceService.create()` validates scope-specific targets and bounded time windows. `remove()` requires a reason and records actor/removal metadata.
- **Side effects**: Active matching silences cause `AlertEvaluationService` to write suppressed alert history with `suppressed_by_silence_id` and publish an alert-suppressed platform realtime event. Global silences do not suppress security-critical rules.

### PlatformMaintenanceWindow lifecycle

```
scheduled -> [active, cancelled, expired]
active    -> [cancelled, expired]
cancelled*
expired*
```

- **Storage model**: This is timestamp-derived plus `cancelled_at`, not a Prisma enum. A window is active when `cancelled_at IS NULL`, `starts_at <= now`, and `ends_at > now`.
- **Guarded by**: `MaintenanceWindowService.create()` validates the time bounds. `cancel()` requires a reason and records actor/cancellation metadata.
- **Side effects**: Active windows cause `AlertEvaluationService` to write suppressed alert history with `suppressed_by_maintenance_window_id` and publish an alert-suppressed platform realtime event. Security-critical alert rules are always exempt.

### MembershipStatus

```
invited                -> [pending_verification, active, expired]
pending_verification   -> [active]
active                 -> [suspended, disabled, archived]
suspended              -> [active, disabled]
disabled*
archived*
```

### InvitationStatus

```
pending -> [accepted, expired, revoked]
accepted*
expired*
revoked*
```

### ApprovalRequestStatus

```
pending_approval -> [approved, rejected, cancelled]
approved         -> [executed]
rejected*
cancelled*
expired*
executed*
```

- **Guarded by**: `ApprovalRequestsService.approve()`, `reject()`, and `cancel()` use conditional `updateMany(... status: 'pending_approval' ...)` transitions so concurrent stale reads cannot produce two successful decisions.
- **Side effects**: `approved` triggers MODE_A_CALLBACKS dispatch (see event-job-catalog.md)

---

## Import & Compliance

### ImportStatus

```
uploaded   -> [validated, failed]
validated  -> [processing]
processing -> [completed, failed, partially_rolled_back]
completed  -> [rolled_back]
failed*
rolled_back*
partially_rolled_back*
```

### ComplianceRequestStatus

```
submitted  -> [classified]
classified -> [approved, rejected]
approved   -> [completed]
rejected*
completed*
```

- **Guarded by**: `packages/shared/src/compliance/state-machine.ts` — `isValidComplianceTransition()`. Wired in `compliance.service.ts` (`classify()`, `approve()`, `reject()`, `execute()`).
- **Side effects**: `create()` auto-sets `deadline_at = now + 30 days`. `extend()` sets `extension_granted=true`, `extension_deadline_at = deadline_at + 60 days` (Article 12(3)). `compliance:deadline-check` cron sets `deadline_exceeded=true` when effective deadline passes. Erasure execution also deletes consent records + tokenisation mappings.
- **Subject types**: `student`, `parent`, `household`, `user`, `staff` (Phase F), `applicant` (Phase F)

---

## Regulatory & Child Protection

### RegulatoryTransferStatus

```
pending    -> [accepted, rejected, cancelled]
accepted   -> [completed, cancelled]
rejected*
completed*
cancelled*
```

- **Guarded by**: `apps/api/src/modules/regulatory/regulatory-transfers.service.ts`
- **Prisma enum mapping**: API `pending|accepted|rejected|completed|cancelled` maps to DB `transfer_pending|transfer_accepted|transfer_rejected|transfer_completed|transfer_cancelled`
- **Side effects**: transfer lifecycle updates are local to the inter-school transfer record; `ppod_confirmed` is tracked separately and does not itself drive a status transition

### MandatedReportStatus

```
none             -> [draft]
draft            -> [submitted]
submitted        -> [acknowledged]
acknowledged     -> [outcome_received]
outcome_received*
```

- **Guarded by**: `apps/api/src/modules/child-protection/services/mandated-report.service.ts`
- **Prisma enum mapping**: `mr_draft`, `mr_submitted`, `mr_acknowledged`, `outcome_received`
- **Side effects**:
  - `none -> draft`: creates the mandated report draft on the linked CP record and writes a pastoral event
  - `draft -> submitted`: stores Tusla reference details and submission metadata
  - `submitted -> acknowledged`: records acknowledgement details
  - `acknowledged -> outcome_received`: records the final outcome
- **Note**: this is a synthetic lifecycle layered over `cp_records.mandated_report_status`; a CP record can also remain in `none` forever if no mandated report is opened

---

## Staff Wellbeing Lifecycles

### SurveyStatus

```
draft    -> [active]
active   -> [closed]
closed   -> [archived]
archived*
```

- **Guarded by**: `apps/api/src/modules/staff-wellbeing/services/survey.service.ts` — `activate()`, `close()` methods enforce per-transition validation
- **Valid transitions**:
  - `draft → active` (requires: questions exist, window dates set, no other active survey for tenant)
  - `active → closed` (side effects: `results_released` set to `true`)
  - `closed → archived` (no side effects, cleanup only)
- **Invalid transitions**: No backward transitions. No `draft→closed`. No `active→draft`. No skipping states.
- **Note**: Results are only visible after `active → closed` transition — the `results_released` flag gates all result endpoints. There is no separate `release-survey-results` job; results computation happens inline on query.

### ModerationStatus (survey responses)

```
pending  -> [approved, flagged, redacted]
approved*
flagged  -> [approved, redacted]
redacted*
```

- **Guarded by**: `apps/api/src/modules/staff-wellbeing/services/survey-results.service.ts` — `moderateResponse()`
- **Side effects**: `redacted` overwrites original `answer_text` with `[Response redacted by moderator]`. Redaction is irreversible — original text is destroyed.
- **Auto-flagging**: The `wellbeing:moderation-scan` worker job automatically transitions `pending → flagged` if staff names, room codes, or subject names are detected in freeform text.
- **Danger**: `survey_responses` has NO `tenant_id` and NO RLS — see DZ-27. Moderation access is gated by joining through the tenant-scoped `staff_surveys` table.

---

## Behaviour Module Lifecycles

### IncidentStatus

```
draft          -> [active, withdrawn]
active         -> [investigating, under_review, escalated, resolved, withdrawn]
investigating  -> [awaiting_approval, awaiting_parent_meeting, resolved, escalated, converted_to_safeguarding]
awaiting_approval       -> [active, resolved]
awaiting_parent_meeting -> [resolved, escalated]
under_review   -> [active, escalated, resolved, withdrawn]
escalated      -> [investigating, resolved]
resolved       -> [closed_after_appeal, superseded]
withdrawn*
closed_after_appeal*
superseded*
converted_to_safeguarding*  (PROJECTED as "closed" for non-safeguarding users)
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine.ts` -> `isValidTransition()` (single source of truth) + `behaviour.service.ts` -> `transitionStatus()` which calls it
- **Side effects**:
  - `draft -> active`: If `follow_up_required`, auto-creates a `BehaviourTask` of type `follow_up`. If category has `requires_parent_notification`, queues `behaviour:parent-notification` job.
  - `active -> withdrawn`: Records history with reason. Cascading withdrawal in Phase C (sanctions -> cancelled, tasks -> cancelled, unsent notifications -> cancelled).
  - `* -> converted_to_safeguarding`: Visible only to `safeguarding.view` users. All other users see this as `closed` with reason "Referred internally". Applied in: API responses, search indexing, entity history rendering, parent notifications.
  - Any transition: Records `behaviour_entity_history` entry with `change_type = 'status_changed'`, previous status, new status, and optional reason.
- **Danger**: The status projection for `converted_to_safeguarding` must be applied at EVERY surface: API responses, search results, exports, hover cards, parent portal. Missing one surface leaks safeguarding information.
- **Note**: `resolved` is terminal UNLESS appealed (-> `closed_after_appeal`) or superseded. This two-stage terminal design is intentional — it allows post-resolution corrections without re-opening.

### BehaviourTaskStatus

```
pending     -> [in_progress, completed, cancelled, overdue]
in_progress -> [completed, cancelled, overdue]
overdue     -> [in_progress, completed, cancelled]
completed*
cancelled*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-task.ts` -> `isValidTaskTransition()` (single source of truth, added in SP3) + `behaviour-tasks.service.ts` -> `completeTask()`, `cancelTask()` (per-method validation)
- **Side effects**:
  - `* -> completed`: Sets `completed_at`, `completed_by_id`, optional `completion_notes`. Records history.
  - `* -> cancelled`: Records history with mandatory reason.
  - `pending -> overdue`: Set automatically by `behaviour:task-reminders` daily cron when `due_date < yesterday`. Sends overdue notification.
  - `in_progress -> overdue`: Also set by task-reminders cron if a task in progress passes its due date.
- **Note**: `overdue` is NOT terminal — tasks can still be completed or cancelled after becoming overdue. The `in_progress -> overdue` transition was added in SP3 (previously only `pending -> overdue` was valid).

### SanctionStatus (Phase C)

```
pending_approval -> [scheduled, cancelled]
scheduled        -> [served, partially_served, no_show, excused, cancelled, superseded, not_served_absent, appealed]
appealed         -> [scheduled, cancelled, replaced]
no_show          -> [superseded, cancelled]
excused          -> [superseded, cancelled]
not_served_absent-> [superseded]
served*
partially_served*
cancelled*
replaced*
superseded*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-sanction.ts` -> `isValidSanctionTransition()` + `behaviour-sanctions.service.ts` -> `transitionStatus()`
- **Side effects**:
  - Creation: Generates `SN-YYYYMM-NNNNNN` sequence number. Checks if approval required (suspension/expulsion). Auto-creates exclusion case for external suspensions >= 5 days or expulsions.
  - `scheduled -> served`: Sets `served_at`, `served_by_id`. Records history.
  - `scheduled -> appealed`: Triggered by appeal submission. Sets appeal reference.
  - `scheduled -> superseded`: Old sanction on reschedule. New sanction created with same incident link.
  - `appealed -> scheduled`: Appeal rejected (upheld_original). Sanction reinstated.
  - `appealed -> cancelled`: Appeal upheld (overturned). Incident transitions to `closed_after_appeal`.
  - `appealed -> replaced`: Appeal partially upheld. New replacement sanction created.
  - Bulk mark served: `POST /sanctions/bulk-mark-served` transitions multiple sanctions atomically with partial success.
- **Danger**: Appeal decision cascading — a single `decide` call can transition the sanction, incident, and exclusion case. All in one transaction.

### InterventionStatus (Phase E)

```
planned                  -> [active_intervention, abandoned]
active_intervention      -> [monitoring, completed_intervention, abandoned]
monitoring               -> [completed_intervention, active_intervention]
completed_intervention*
abandoned*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-intervention.ts` -> `isValidInterventionTransition()` (single source of truth) + `behaviour-interventions.service.ts` -> `transitionStatus()`
- **Prisma enum mapping**: `active_intervention` -> DB `"active"`, `completed_intervention` -> DB `"completed"`. Other values (`planned`, `monitoring`, `abandoned`) map to themselves.
- **Side effects**:
  - `planned -> active_intervention`: Records entity history. Intervention plan is now in effect.
  - `active_intervention -> monitoring`: Moves intervention to observation phase. Records history.
  - `monitoring -> active_intervention`: Re-activates intervention if monitoring reveals it's still needed.
  - `* -> completed_intervention`: Terminal. Records completion. Sets completed metrics.
  - `* -> abandoned`: Terminal. Records abandonment with reason. No further transitions allowed.
- **Note**: `monitoring -> active_intervention` is a deliberate cycle — interventions can oscillate between active and monitoring until a terminal state is reached. This supports iterative intervention plans where a student's needs change.
- **Danger**: The Prisma enum names (`active_intervention`, `completed_intervention`) differ from their DB-mapped values (`active`, `completed`) to avoid collisions with other enums. Code that handles these statuses must use the Prisma enum name, not the DB value.

### SafeguardingStatus (Phase D)

```
reported             -> [acknowledged]
acknowledged         -> [under_investigation]
under_investigation  -> [referred, monitoring, resolved]
referred             -> [monitoring, resolved]
monitoring           -> [resolved]
resolved             -> [sealed]
sealed*
```

- **Guarded by**: `packages/shared/src/behaviour/safeguarding-state-machine.ts` -> `isValidSafeguardingTransition()` (single source of truth) + `safeguarding.service.ts` -> `transitionStatus()`
- **Prisma enum mapping**: `monitoring` -> DB `"sg_monitoring"` (to avoid collision with `InterventionStatus.monitoring`). Other values map to themselves.
- **Side effects**:
  - `reported -> acknowledged`: SLA clock stops (`sla_first_response_met_at` set). Critical escalation chain terminates (processor checks `status !== 'reported'`).
  - `acknowledged -> under_investigation`: Designated liaison formally opens investigation.
  - `under_investigation -> referred`: Referral to external agency (Tusla, Garda). Records referral details.
  - `* -> resolved`: Closes the concern. Outcome notes recorded.
  - `resolved -> sealed`: IRREVERSIBLE. Seals the record for long-term retention. Sealed concerns cannot be viewed without `safeguarding.seal_access` permission. A sealed record cannot be unsealed.
- **SLA Notes**: SLA deadlines are computed on creation based on severity:
  - `critical`: 1 hour
  - `high`: 4 hours
  - `medium`: 24 hours
  - `low`: 72 hours
    The `safeguarding:sla-check` cron (every 5 min) creates breach tasks if `sla_first_response_met_at` is null and `sla_first_response_due < now()`.
- **Critical Escalation**: When severity is `critical`, a `safeguarding:critical-escalation` job is enqueued immediately (step 0). It re-enqueues itself with 30-minute delay for each subsequent step in the escalation chain (designated liaison -> deputy -> fallback chain). Chain terminates when concern is acknowledged or chain is exhausted.
- **Danger**: The `sealed` state is the most dangerous transition in the system — it is completely irreversible. There is no unsealing mechanism by design. Data under a sealed concern is subject to enhanced access controls and cannot be included in standard reports. The Prisma enum uses `sg_monitoring` for the `monitoring` status to avoid name collision.

### ExclusionStatus (Phase C)

```
initiated             -> [notice_issued]
notice_issued         -> [hearing_scheduled_exc]
hearing_scheduled_exc -> [hearing_held]
hearing_held          -> [decision_made]
decision_made         -> [appeal_window]
appeal_window         -> [finalised, overturned]
finalised*
overturned*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-exclusion.ts` -> `isValidExclusionTransition()` + `behaviour-exclusion-cases.service.ts`
- **Side effects**:
  - Creation: Auto-populates `statutory_timeline` JSON with school-day-computed deadlines. Sets legal holds on incident, sanction, and all linked entities. Creates `appeal_review` task.
  - `hearing_held -> decision_made`: Records decision, computes `appeal_deadline = decision_date + 15 school days`.
  - `decision_made -> appeal_window`: Auto-transition on decision recording.
  - `appeal_window -> overturned`: Linked appeal succeeded. Sanction cancelled.
- **Danger**: Statutory timeline dates are computed once on creation and stored as JSONB. If school closures change after creation, stored dates may be stale. Dynamic status computation in `getTimeline()` mitigates this for current status.

### AppealStatus (Phase C)

```
submitted         -> [under_review, withdrawn_appeal]
under_review      -> [hearing_scheduled, decided, withdrawn_appeal]
hearing_scheduled -> [decided, withdrawn_appeal]
decided*
withdrawn_appeal*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-appeal.ts` -> `isValidAppealTransition()` + `behaviour-appeals.service.ts`
- **Side effects**:
  - Submission: Generates `AP-YYYYMM-NNNNNN`. If sanction is `scheduled`, transitions to `appealed`. Sets legal holds. Links to exclusion case if applicable. Creates `appeal_review` task.
  - `* -> decided`: Records decision + reasoning. Applies outcome:
    - `upheld_original`: sanction `appealed -> scheduled`
    - `modified`: applies amendments, creates replacement sanction if needed
    - `overturned`: sanction -> `cancelled`, incident -> `closed_after_appeal`, exclusion case -> `overturned`
  - Creates amendment notices for parent-visible field changes. All in single interactive transaction.
  - `* -> withdrawn_appeal`: Restores sanction from `appealed -> scheduled`.
- **Danger**: The `decide` endpoint's atomic transaction touches up to 6 tables: appeals, sanctions, incidents, exclusion_cases, amendment_notices, entity_history. Transaction timeout risk on complex decisions.

### DocumentStatus (Phase G, updated reliability hardening R-14)

- **Model**: `BehaviourDocument.status`
- **Prisma enum mapping**: `generating` → DB `"generating"`, `draft_doc` → DB `"draft"`, `sent_doc` → DB `"sent"`, `finalised` and `superseded` unchanged
- **Initial state**: `generating` (all documents start here since R-14; transitions to `draft_doc` on PDF render callback)
- **Terminal states**: `sent_doc *`, `superseded *`
- **Transitions**:
  - `generating -> draft_doc` (on `PdfRenderProcessor` callback via `behaviour:document-ready` job)
  - `generating -> generating` (stays on callback failure — logged, retried by BullMQ)
  - `draft_doc -> finalised` (staff reviews and confirms via `PATCH /documents/:id/finalise`)
  - `finalised -> sent_doc` (dispatched via `POST /documents/:id/send` with channel email/whatsapp/in_app)
  - `finalised -> superseded` (amendment generates replacement document)
  - `sent_doc -> superseded` (amendment to a previously sent document)
- **Side effects**:
  - `generating -> draft_doc`: `file_key` and `file_size` set from rendered PDF. In-app notification created for the requesting user.
  - `draft_doc -> finalised`: Entity history entry recorded. Staff can now send or print.
  - `finalised -> sent_doc`: `sent_at` and `sent_via` set. `behaviour_parent_acknowledgements` row created. Notification dispatched.
  - `* -> superseded`: `superseded_by_id` and `superseded_reason` set. Original document retained for audit.
  - Print channel: Does NOT transition status. Generates download URL + logs `document_printed` history event.
- **Auto-generation triggers**: Sanction creation (detention_notice, suspension_letter), exclusion initiation (exclusion_notice), appeal hearing date set (appeal_hearing_invite), appeal decided (appeal_decision_letter). All auto-generated docs start at `generating` and transition to `draft_doc` on render callback.
- **Guarded by**: `BehaviourDocumentService.finaliseDocument()`, `BehaviourDocumentService.sendDocument()`, `PdfRenderProcessor` (for `generating -> draft_doc`)
- **Danger**: Documents in `generating` status have no `file_key` — callers of `autoGenerateDocument()` and `generateDocument()` must not assume the returned document has a PDF ready. See DZ-37.

---

## Legal Hold Lifecycle (Phase H)

- **Table**: `behaviour_legal_holds`
- **Status enum**: `LegalHoldStatus` — `active_hold` (@map "active"), `released`
- **Initial state**: `active_hold`
- **Terminal state**: `released *`
- **Transitions**:
  - `active_hold -> released` (admin releases via `POST /admin/legal-holds/:id/release`)
- **Side effects**:
  - `createHold`: Creates hold record + propagates to all linked entities (one level). Logs `legal_hold_set` in entity history.
  - `releaseHold`: Updates status to `released`. Logs `legal_hold_released` in entity history. Does NOT trigger anonymisation. If `releaseLinked=true`, releases all holds with same `legal_basis`.
  - **Retention worker**: Checks for active holds before anonymising any entity. If held, entity is skipped and logged.
- **Propagation rules**: incident → sanctions, tasks, attachments, documents. appeal → incident + all incident-linked. exclusion_case → sanction, incident, documents + all incident-linked.
- **Guarded by**: `BehaviourLegalHoldService.createHold()`, `BehaviourLegalHoldService.releaseHold()`
- **Danger**: Releasing a hold does NOT immediately anonymise the entity. The entity may still be within its retention period or have other active holds. Only the retention worker handles anonymisation.

---

## Retention Status Lifecycle (Phase H)

- **Field**: `retention_status` on incidents, sanctions, interventions, attachments
- **Enum**: `RetentionStatus` — `active`, `archived`, `anonymised`
- **Initial state**: `active`
- **Transitions**:
  - `active -> archived` (retention worker marks records for left students past retention period)
  - `archived -> anonymised` (retention worker strips PII from records past full retention deadline, if no legal hold)
- **Side effects**:
  - `active -> archived`: Record excluded from default list views, search, analytics. Still fully readable with "Include archived" toggle.
  - `archived -> anonymised`: PII fields replaced (student names → hash, free text → "[Archived content]"). Entity history logged. Meilisearch entry deleted. IRREVERSIBLE.
- **Guarded by**: `RetentionCheckProcessor` (worker job only — no manual API transition)

---

## SecurityIncidentStatus (Phase J)

- **Field**: `status` on `security_incidents`
- **Values**: `detected`, `investigating`, `contained`, `reported`, `resolved`, `closed`
- **Initial state**: `detected`
- **Transitions**:
  ```
  detected      -> [investigating, contained]
  investigating -> [contained, resolved]
  contained     -> [reported, resolved]
  reported      -> [resolved]
  resolved      -> [closed]
  closed*
  ```
- **Side effects**:
  - Every transition: a `status_change` event is added to `security_incident_events` timeline
  - `contained -> reported`: should correlate with DPC notification (72-hour Article 33 requirement)
  - `detected` → `investigating`: acknowledges the incident, stops the 12-hour escalation cron
- **Guarded by**: `SECURITY_INCIDENT_STATUS_TRANSITIONS` in `packages/shared/src/security/incident.types.ts` + validated in `SecurityIncidentsService.update()`
- **Platform-level**: No tenant_id. Incidents may span multiple tenants.
- **72-hour clock**: Starts at `detected_at`. Breach deadline cron fires escalation events at 12h, 48h, and 72h for high/critical severity incidents.

---

### HomeworkStatus

- **Field**: `status` on `homework_assignments`
- **Values**: `draft`, `published`, `archived`
- **Initial state**: `draft`
- **Transitions**:
  ```
  draft      -> [published, archived]
  published  -> [archived]
  archived*
  ```
- **Side effects**:
  - `draft -> published`: sets `published_at` timestamp, makes assignment visible to students/parents, fires `HomeworkNotificationService.notifyOnPublish` (Wave 2) — in-app fan-out to class parents
  - `published -> archived`: hides from default views but retains for analytics
- **Guarded by**: `VALID_HOMEWORK_TRANSITIONS` in `packages/shared/src/constants/homework-status.ts` + enforced in `apps/api/src/modules/homework/homework.service.ts`
- **Simplicity**: 3 states, 2 transitions — follows the published/archive pattern rather than the more complex finance or behaviour machines

### HomeworkSubmissionStatus (Wave 3)

- **Field**: `status` on `homework_submissions`
- **Values**: `submitted`, `returned_for_revision`, `graded`
- **Initial state**: `submitted` (row only exists once a student submits — there is no `not_submitted` row)
- **Transitions**:
  ```
  submitted              -> [returned_for_revision, graded]
  returned_for_revision  -> [submitted]   (student resubmits)
  graded*                (terminal — teacher can edit the grade in place, but cannot revert status)
  ```
- **Side effects**:
  - Initial `submitted`: computes `is_late` against `homework_assignments.due_date` + `due_time`; hard-rejected upfront if `homework_assignments.accept_late_submissions = false` and deadline has passed. Mirrors `HomeworkCompletion` to `status = completed`. Fires `HomeworkNotificationService.notifyOnSubmit` (teacher in-app).
  - `submitted -> returned_for_revision`: set by `HomeworkCompletionsService.returnSubmission`. Downgrades the mirrored `HomeworkCompletion` to `in_progress` so the student sees it as outstanding again. Fires `HomeworkNotificationService.notifyOnReturn` (student + parents in-app).
  - `returned_for_revision -> submitted`: student resubmits via `POST /v1/student/homework/:id/submit`; `version` increments; re-mirrors completion to `completed`.
  - `* -> graded`: set by `HomeworkCompletionsService.gradeSubmission`. Stamps `graded_at`, `graded_by_user_id`, `points_awarded`, `teacher_feedback`. Fires `HomeworkNotificationService.notifyOnGrade` (student + parents in-app).
- **Guarded by**: inline checks in `HomeworkStudentService.submit` (late policy, attachment locking after grade) and `HomeworkCompletionsService.gradeSubmission/returnSubmission` (rejects return on already-graded submissions).
- **Invariants**: `version` increments on every state change (optimistic locking). `is_late` is immutable after initial submission — computed once at submission time against the assignment's deadline.

---

## Engagement Module Lifecycles

### EngagementFormTemplateStatus

```
draft      -> [published]
published  -> [archived]
archived*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/engagement/form-templates.service.ts`
- **Side effects**:
  - `draft -> published`: makes the template available for distribution and parent submission flows
  - `published -> archived`: retires the template from new use while preserving historical submissions
- **Note**: the service also prevents unsafe edits when submissions already exist, even if the raw status transition is valid

### EngagementEventStatus

```
draft         -> [published, cancelled]
published     -> [open, cancelled]
open          -> [closed, cancelled]
closed        -> [in_progress, cancelled]
in_progress   -> [completed, cancelled]
completed     -> [archived]
cancelled     -> [archived]
archived*
```

- **Guarded by**: `EVENT_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `published -> open`: triggers downstream form distribution and invoice generation jobs
  - `* -> cancelled`: enqueues `engagement:cancel-event` to reverse pending forms/invoices
  - `completed -> archived`: terminal. Retains data for analytics.
- **Note**: `cancelled` is NOT terminal — it can transition to `archived` for cleanup.

### EngagementSubmissionStatus

```
pending       -> [submitted, expired]
submitted     -> [acknowledged, revoked]
acknowledged  -> [revoked]
expired*
revoked*
```

- **Guarded by**: `SUBMISSION_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `pending -> submitted`: records parent response + optional signature
  - `submitted -> acknowledged`: admin acknowledges submission
  - `* -> revoked`: consent withdrawal path (GDPR)
- **Terminal states**: `expired`, `revoked`

### ConferenceSlotStatus

```
available     -> [booked, blocked]
booked        -> [completed, cancelled]
blocked       -> [available]
completed*
cancelled     -> [available]
```

- **Guarded by**: `SLOT_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `available -> booked`: creates a `ConferenceBooking` record
  - `booked -> cancelled`: releases the slot back to `available` (via `cancelled -> available`)
- **Note**: `cancelled` is NOT terminal — slots return to `available` for rebooking.

### ConferenceBookingStatus

```
confirmed     -> [completed, cancelled, no_show]
completed*
cancelled*
no_show*
```

- **Guarded by**: `BOOKING_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Initial state**: `confirmed` (created on successful slot booking)
- **Terminal states**: `completed`, `cancelled`, `no_show`
- **Side effects**: `confirmed -> cancelled` also transitions the parent slot back to `available`.

---

## Pastoral Module Lifecycles

### PastoralCaseStatus

```
open       -> [active]
active     -> [monitoring, resolved]
monitoring -> [active, resolved]
resolved   -> [closed]
closed     -> [open]
```

- **Guarded by**: `packages/shared/src/pastoral/case-state-machine.ts` -> `CASE_TRANSITIONS` + `isValidCaseTransition()` (single source of truth) + `CaseService.transitionStatus()`
- **Side effects**:
  - `* -> resolved`: Sets `resolved_at` timestamp.
  - `* -> closed`: Sets `closed_at` timestamp.
  - `closed -> open`: Clears `resolved_at` and `closed_at` (reopen flow).
- **Note**: There are NO terminal states — `closed` can cycle back to `open`. This is intentional for cases that require re-opening after parental contact or new evidence.

### PastoralReferralStatus

```
draft                        -> [submitted]
submitted                    -> [acknowledged, withdrawn]
acknowledged                 -> [assessment_scheduled, withdrawn]
assessment_scheduled         -> [assessment_complete, withdrawn]
assessment_complete          -> [report_received, withdrawn]
report_received              -> [recommendations_implemented, withdrawn]
recommendations_implemented*
withdrawn*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/referral.service.ts`
- **Terminal states**: `recommendations_implemented`, `withdrawn`
- **Side effects**: `submitted` notifies the referral recipient. Each forward transition records a pastoral event. `withdrawn` at any stage marks the referral as no longer active.
- **Waitlist states**: `submitted`, `acknowledged`, `assessment_scheduled` — referrals in these states appear in the "awaiting" view.

### PastoralReferralRecommendationStatus

```
pending        -> [in_progress, not_applicable]
in_progress    -> [implemented, not_applicable]
implemented*
not_applicable*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/referral-recommendation.service.ts`
- **Terminal states**: `implemented`, `not_applicable`

### SstMeetingStatus

```
scheduled   -> [in_progress, cancelled]
in_progress -> [completed, cancelled]
completed*
cancelled*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/sst-meeting.service.ts`
- **Side effects**: `scheduled` triggers `pastoral:precompute-agenda` job for agenda pre-population. `completed` locks the agenda and generates minutes.

### CriticalIncidentStatus

```
ci_active     -> [ci_monitoring, ci_closed]
ci_monitoring -> [ci_active, ci_closed]
ci_closed     -> [ci_monitoring]
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/critical-incident.service.ts:166`.
- **Prisma enum (`packages/prisma/schema.prisma:7596`)**: each Prisma value uses `@map` to a shorter DB literal — the Prisma names are namespaced to avoid collisions with `PastoralCaseStatus` and `SafeguardingStatus`, but the DB enum literals are bare `active|monitoring|closed`:
  ```
  enum CriticalIncidentStatus {
    ci_active     @map("active")
    ci_monitoring @map("monitoring")
    ci_closed     @map("closed")
  }
  ```
- **API ↔ Prisma translation**: API/DTO callers send the bare `active|monitoring|closed` strings. The service's `STATUS_TO_PRISMA` map (`critical-incident.service.ts:173`) translates them into the Prisma enum literals before any DB write or filter:
  ```
  active     -> ci_active
  monitoring -> ci_monitoring
  closed     -> ci_closed
  ```
- **Danger — `@map` editing trap**: if you rename a Prisma enum value here you MUST update both the `VALID_TRANSITIONS` keys AND the `STATUS_TO_PRISMA` map. The `@map` value is the DB-side literal and changing it is a destructive enum-value migration. Touch one without the other and either the validation map or the DB writes silently break.
- **Note**: No true terminal state — closed incidents can return to monitoring. This allows multi-phase critical incidents (e.g., a lockdown followed by ongoing monitoring of the affected community).

### PastoralInterventionStatus

```
pc_active -> [achieved, partially_achieved, not_achieved, escalated, withdrawn]
```

- **Guarded by**: `InterventionService.transitionStatus()` — only `pc_active` interventions can transition
- **Prisma enum**: `pc_active` → DB `"active"` (prefixed to avoid collision with other `active` enums)
- **Terminal states**: `achieved`, `partially_achieved`, `not_achieved`, `escalated`, `withdrawn` — all terminal
- **Side effects**: All terminal transitions require `outcome_notes`. `escalated` should trigger creation of a new higher-tier intervention or a behaviour referral.

### FinancialModelStatus

```
draft → [published, archived]
published → [archived]
(restore: published → new draft, original published row untouched)
```

- **Guarded by**: `VALID_TRANSITIONS` in
  `apps/api/src/modules/budgeting/financial-models/financial-models.service.ts`
- **Prisma enum mapping**: `draft`, `published`, `archived`
- **Side effects**:
  - `publish` (draft → published): creates a `financial_model_snapshots` row
    with `version_number = MAX + 1`, captures the full state (drivers, every
    scenario with merged drivers, every line item, totals, per-pupil
    economics, source snapshot, executive summary), updates the parent's
    `current_snapshot_id`, enqueues `budgeting:board-pack-render` for both
    PDF and Excel, writes an audit log entry. Snapshot rows are immutable
    post-publish — only `pdf_object_key`, `excel_object_key`, and
    `rendered_at` may change.
  - `archive` (any → archived): sets `archived_at`, hides from default lists,
    variance refresh stops including this model.
  - `restore` (published → new draft): duplicates a specific snapshot's
    payload (drivers + line items) into a new draft model row. The original
    published row + snapshot stay intact.
- **Terminal state**: `archived` (no transitions out)

### EventBudgetStatus

```
draft → [confirmed, cancelled]
confirmed → [fees_generated (paid), fees_generated (school-funded), cancelled]
fees_generated → [completed]   (cancel rejected with EVENT_BUDGET_FEES_PRESENT)
completed → (terminal)
cancelled → (terminal)
```

- **Guarded by**: `VALID_TRANSITIONS` in
  `apps/api/src/modules/budgeting/event-budgets/event-budgets.service.ts`
- **Prisma enum mapping**: `draft`, `confirmed`, `fees_generated`, `completed`,
  `cancelled`
- **Side effects**:
  - `confirm` (draft → confirmed): validates required fields (event_date,
    participant_count > 0). Audit log entry.
  - `generate-fees` (confirmed → fees_generated, when `household_share_pct > 0`):
    delegated to `TripFeeIntegrationService.generateFees()` which calls
    `FeeAssignmentsService.bulkCreate()` inside one
    `createRlsClient($transaction)`. Sets `fee_structure_id` and
    `fee_generation_run_id` on the event row. Three-permission gate
    (`budgeting.view` AND `budgeting.generate_fees` AND `finance.manage`).
    Audit log entry.
  - `mark-school-funded` (confirmed → fees_generated, when
    `household_share_pct = 0`): no FeeAssignment side effect; just records
    that the trip is school-funded. Audit log entry.
  - `complete` (confirmed | fees_generated → completed): post-trip closure.
    Audit log entry.
  - `cancel` (draft | confirmed → cancelled): audit log entry. **Rejected**
    when status is `fees_generated` (returns 409 with code
    `EVENT_BUDGET_FEES_PRESENT`) — the user must void invoices in Finance
    first, then re-cancel manually if desired.
  - `cancel` (completed → ): rejected — cannot cancel a completed event.
- **Terminal states**: `completed`, `cancelled`

---

## High-traffic Lifecycles (promoted 2026-05-13)

These were on the catalog index until this pass — they appear in enough hot paths that a full section is warranted.

### EmploymentStatus

```
active   -> [inactive]
inactive -> [active]
```

- **Schema**: `packages/prisma/schema.prisma:197` — `enum EmploymentStatus { active, inactive }`.
- **Field**: `staff_profiles.employment_status`.
- **Guarded by**: There is **no** explicit `VALID_TRANSITIONS` map; the value is set directly by staff CRUD endpoints and the leave/hire workflows. Cycling between `active` and `inactive` is permitted unconditionally.
- **Side effects**: `inactive` removes a staff member from class-cover candidate lists, dashboards, and the active staff directory but preserves all historical attendance, payroll, and behaviour-actor links. The corresponding `User`/`Membership` row is updated separately — `EmploymentStatus` does not gate auth.
- **Note**: this is a soft-delete proxy for staff — there is no `archived` value. If you need to permanently retire a profile, use `inactive` and rely on the membership-level `disabled`/`archived` states (see MembershipStatus).

### AttendanceRecordStatus

```
present | absent_unexcused | absent_excused | late | left_early
```

- **Schema**: `packages/prisma/schema.prisma:253`.
- **Field**: `attendance_records.status` — one row per (student, session) on submission of an attendance session.
- **Guarded by**: `apps/api/src/modules/attendance/attendance-session.service.ts` (no explicit transition map — values are written on submit and edited in place via `attendance-exceptions.service.ts` until the session locks).
- **Lifecycle**: there is **no `from -> to` transition machine** here — the status is the snapshot value for that one session. Edits replace the value; the rolling history sits on `attendance_record_history`. The hard write-cutoff is the parent session's `AttendanceSessionStatus = locked` (see above): once the session is locked, no record-level edits are allowed.
- **Side effects**: the daily summary worker recomputes `DailyAttendanceStatus` from this row plus its siblings (see below). Late thresholds (`late`) and excused-absence ratios feed `AttendanceAlertStatus` rules.
- **Note**: `absent_excused` requires a linked `student_absence_excuse` row in the same RLS transaction. Editing a record from `absent_unexcused` to `absent_excused` is the single most common parent-portal workflow.

### DailyAttendanceStatus (derived)

```
present | partially_absent | absent | late | excused
```

- **Schema**: `packages/prisma/schema.prisma:261`.
- **Field**: `daily_attendance_summaries.derived_status` — one row per (student, day).
- **Guarded by**: `apps/api/src/modules/attendance/daily-summary.service.ts:104-121` is the **single derivation site**. It is computed from the day's `AttendanceRecordStatus` rows by counting `sessionsPresent / sessionsAbsent / sessionsLate / sessionsExcused`:
  ```
  no absences and no lates                                 -> present
  no presents/lates and every absence is excused           -> excused
  no presents/lates (and not all-excused)                  -> absent
  some lates, zero absences                                -> late
  otherwise (mixed presence + absences)                    -> partially_absent
  ```
- **Lifecycle**: there is no transition graph — every recompute upserts the new derived value. Recomputes fire on every record edit and as part of the nightly summary cron.
- **Side effects**: feeds `AttendanceAlertStatus` thresholds, the regulatory POD/Tusla dashboard, and the early-warning risk tiering.
- **Danger**: do not write `derived_status` from any other path — it must remain the output of the derivation function above. Manual writes will desynchronise the underlying records and the summary view.

### LeaveRequestStatus

```
pending  -> [approved, rejected, withdrawn]
approved -> [cancelled]
rejected*    cancelled*    withdrawn*
```

- **Schema**: `packages/prisma/schema.prisma:4163`.
- **Guarded by**: `apps/api/src/modules/leave/leave-requests.service.ts:24` — explicit `VALID_TRANSITIONS` map enforced before every status update.
- **Side effects**:
  - `pending -> approved`: enqueues `substitution:cover-search` for the affected periods if the leave overlaps a teaching schedule. Sets `approved_at` and `approver_user_id`.
  - `pending -> rejected | withdrawn`: terminal — author may submit a new request.
  - `approved -> cancelled`: only valid before the leave start date. Releases any auto-created substitution offers.
- **Note**: `withdrawn` is author-driven (the requester pulls the request before review); `rejected` is approver-driven; `cancelled` is the post-approval escape hatch.

### AlertStatus + AlertRecipientStatus (behaviour alerts)

Two coupled enums — the parent alert lifecycle (`AlertStatus`) and the per-recipient acknowledgement lifecycle (`AlertRecipientStatus`).

**AlertStatus** (`packages/prisma/schema.prisma:7324`):

```
active_alert    @map("active")    -> [resolved_alert]
resolved_alert  @map("resolved")*
```

**AlertRecipientStatus** (`packages/prisma/schema.prisma:7329`):

```
unseen        -> [seen]
seen          -> [acknowledged, snoozed, dismissed, resolved_recipient]
acknowledged  -> [snoozed, dismissed]
snoozed       -> [seen, acknowledged, dismissed]
resolved_recipient @map("resolved")*    dismissed*
```

- **Guarded by**: `apps/api/src/modules/behaviour/behaviour-alerts.service.ts` — no `VALID_TRANSITIONS` map, transitions are enforced inline by the dedicated endpoints (`acknowledge`, `snooze`, `dismiss`, `resolve`).
- **Prisma `@map` translations** (both enums use prefixed Prisma names to avoid collisions across the behaviour domain):
  - `AlertStatus.active_alert` -> DB `"active"`, `AlertStatus.resolved_alert` -> DB `"resolved"`.
  - `AlertRecipientStatus.resolved_recipient` -> DB `"resolved"`.
- **Side effects**:
  - Alert creation: parent row is `active_alert`; one `AlertRecipient` row per resolved recipient (initial state `unseen`).
  - First open of the alert by a recipient: `unseen -> seen` (auto, on read).
  - When the parent alert flips to `resolved_alert` (admin closes it), all non-terminal recipient rows are bulk-updated to `resolved_recipient` in the same transaction.
- **Danger**: the `@map` collision-prefixing means filter literals must use the Prisma name (`active_alert`, `resolved_alert`, `resolved_recipient`) when written against the Prisma client, but the DB rows store the bare `active|resolved` literal. Filtering raw SQL against `'active_alert'` returns zero rows.

### ApprovalStepStatus (report-card approval workflow)

```
pending -> [approved, rejected]
approved*   rejected*
```

- **Schema**: `packages/prisma/schema.prisma:4549`.
- **Field**: `report_card_approval_steps.status` — one row per (report card, configured approval step).
- **Guarded by**: `apps/api/src/modules/gradebook/report-cards/report-card-approval.service.ts` — no explicit `VALID_TRANSITIONS` map; transitions are produced by the dedicated `approveStep` and `rejectStep` flows which use conditional `updateMany(... status: 'pending' ...)` writes for concurrency safety.
- **Side effects**:
  - `pending -> approved`: stamps `approved_at`/`approved_by_user_id`. If this is the **last** pending step on the chain, the parent report-card row transitions `draft -> published` in the same transaction (`report-card-approval.service.ts:294`).
  - `pending -> rejected`: stamps `rejected_at`/`rejection_reason`. Cascades to all later pending steps in the chain — they are bulk-updated to `rejected` with `rejection_reason = 'Cancelled due to earlier rejection'` so the chain cannot resume mid-stream.
- **Note**: this is the **per-step** state machine. The parent `ApprovalRequest` machine (see Platform & Infrastructure) is the cross-cutting equivalent for non-report-card approvals.

### BatchJobStatus (underlying enum for ReportCardBatchJob)

```
queued     -> [processing, failed]
processing -> [completed, failed]
completed*    failed*
```

- **Schema**: `packages/prisma/schema.prisma:4568` — physical four-value enum shared across batch-style worker jobs.
- **Used by**: `report_card_batch_jobs.status` is the only current consumer. The logical "partial success" state is layered on top by reading `students_blocked_count > 0` on a `completed` row (see ReportCardBatchJob above for the full mapping).
- **Guarded by**: each consumer's batch service. There is no shared transition map.
- **Side effects** (per consumer): see ReportCardBatchJob.
- **Note**: `failed` is set with an `error_message`; per-row failures during `processing` accumulate on the consumer's `errors_json` column without flipping the status (allowing the "completed-but-with-errors" partial-success pattern).

---

## Catalog Index — undocumented state machines

These enums exist in `packages/prisma/schema.prisma` but do not yet have a full transition spec in this document. Each entry lists the schema line, value count, and a one-line note on what it tracks. Promote any of these to a full section as you touch the underlying code path.

If you change an enum's values (`ALTER TYPE ... ADD VALUE` or rename via `@map`), update or promote the matching entry in the same change.

### Identity, access, & approvals

- **`UserGlobalStatus`** — `schema.prisma:37` — 3 values (`active|suspended|disabled`). Platform-level user account state, set on the `users` table (the only non-tenant-scoped table). Transitions are admin-driven; not yet wired through a service-level transition map.
- **`VerificationStatus`** — `schema.prisma:25` — 3 values (`pending|verified|failed`). Generic per-row verification flag (custom domain TXT proof, etc).
- **`SslStatus`** — `schema.prisma:31` — 3 values (`pending|active|failed`). Reflects ACME / Let's Encrypt issuance for tenant custom domains.
- **`DnsRecordStatus`** — `schema.prisma:460` — 3 values (`pending|verified|failed`). Per-record DNS verification rolling up into `EmailDomainStatus`.
- **`tenantModule.is_enabled`** — `schema.prisma:953` — boolean, not a Prisma enum. Transitions are `false ↔ true` and must be triggered exclusively through the tenant module toggle flow. Side effects: security audit row, Redis `tenant_modules:{tenantId}` cache invalidation, and `tenant_modules:invalidated` pub/sub publish. Missing rows default-deny at the guard layer; see DZ-MG-1.

### Households & people

- **`HouseholdStatus`** — `schema.prisma:131` — 3 values (`active|inactive|archived`). Household lifecycle; soft-delete via `archived`.
- **`ParentStatus`** — `schema.prisma:137` — 2 values (`active|inactive`). Per-parent active flag (a household may have an inactive parent without archiving the household).
- **`ParentConsentStatus`** — `schema.prisma:7301` — 4 values (`not_requested|pending_consent @map("pending")|granted|denied`). Per-parent consent flag distinct from the broader `ConsentRecordStatus`.

### Class operations

- **`ClassStatus`** — `schema.prisma:184` — 3 values (`active|inactive|archived`). Per-class lifecycle; `inactive` hides from default lists, `archived` retires for the year.
- **`ClassDeliveryStatus`** — `schema.prisma:108` — 4 values (`delivered|absent_covered|absent_uncovered|cancelled`). Per-class-instance delivery outcome tracked alongside attendance.

### Staff, payroll, leave

- **`StaffAttendanceStatus`** — `schema.prisma:99` — 6 values (`present|absent|half_day|unpaid_leave|paid_leave|sick_leave`). Daily staff attendance value used by the payroll calculator.
- **`SubstitutionOfferStatus`** — `schema.prisma:4171` — 5 values (`pending|accepted|declined|expired|revoked`). Per-candidate substitution offer fan-out — feeds `SubstitutionStatus`.
- **`SnaAssignmentStatus`** — `schema.prisma:1076` — 2 values (`active|ended`). SNA-to-student assignment lifecycle.
- **`StaffVettingStatus`** — `schema.prisma:9064` — 5 values (`active|expiring_soon|expired|pending_renewal|revoked`). Garda vetting state per staff member; expiry-based transitions are derived by a daily cron.

### Admissions & finance

- **`AdmissionPaymentStatus`** — `schema.prisma:402` — 5 values (`pending|paid_online|paid_cash|payment_plan|waived`). Per-application payment outcome distinct from `ApplicationStatus`.
- **`AdmissionsPaymentEventStatus`** — `schema.prisma:396` — 3 values (`succeeded|failed|received_out_of_band`). Stripe-webhook event ledger row outcome.
- **`InstallmentStatus`** — `schema.prisma:3742` — 3 values (`pending|paid|overdue`). Per-installment state for finance payment plans.

### Communications & website

- **`ProgressReportStatus`** — `schema.prisma:4132` — 2 values (`draft|sent`). Light-weight progress-update lifecycle (distinct from the full report-card flow).
- **`WebsitePageStatus`** — `schema.prisma:499` — 3 values (`draft|published|unpublished`). CMS page lifecycle for the public school site.
- **`DeliveryStatus`** — `schema.prisma:4561` — 4 values (`pending_delivery|sent|failed|viewed`). Generic delivery tracker used by older notification fan-outs (predates `NotificationStatus`).
- **`ParentNotifStatus`** — `schema.prisma:7004` — 6 values (`not_required|pending|sent|delivered|failed|acknowledged`). Behaviour-incident parent-notification ledger; mirrors the dispatch outcome.

### Gradebook, scheduling, exams

- **`AiGradingInstructionStatus`** — `schema.prisma:4103` — 4 values (`draft|pending_approval|active|rejected`). Teacher-authored AI grading instruction approval lifecycle.

### Compliance, regulatory, child protection

- **`SearchIndexStatusEnum`** — `schema.prisma:6224` — 3 values (`pending|indexed|search_failed`). Per-row Meilisearch index sync state.
- **`CronExecutionStatus`** — `schema.prisma:6350` — 4 values (`running|success|failed|timeout`). Cron-execution audit log row outcome.
- **`ScheduledReportRunStatus`** — `schema.prisma:6795` — 4 values (`pending|running|succeeded|failed`). Per-run state for the scheduled-reports module.
- **`IncidentApprovalStatus`** — `schema.prisma:6997` — 4 values (`not_required|pending|approved|rejected`). Per-incident-approval-request state on the behaviour module.
- **`RegulatorySubmissionStatus`** — `schema.prisma:7656` — 7 values (all `@map`'d to bare names: `not_started|in_progress|ready_for_review|submitted|accepted|rejected|overdue`). Regulatory submission packet lifecycle.
- **`PodSyncStatus`** — `schema.prisma:7696` — 5 values (`@map` to `pending|synced|changed|error|not_applicable`). Per-record POD (Tusla) sync state.
- **`PodSyncLogStatus`** — `schema.prisma:7710` — 4 values (`@map` to `in_progress|completed|completed_with_errors|failed`). Per-batch POD sync run outcome.
- **`CbaSyncStatus`** — `schema.prisma:7730` — 3 values (`@map` to `pending|synced|error`). CBA exam sync state per cohort.
- **`ChildProtectionReviewStatus`** — `schema.prisma:9072` — 4 values (`scheduled|in_progress|completed|overdue`). Periodic CP-record review cycle state.
- **`AdminRepairRunStatus`** — `schema.prisma:9018` — 4 values (`preview|executed|failed|rolled_back`). Platform admin "data repair" tool run lifecycle.

### Behaviour & safeguarding (auxiliary)

- **`RestrictionStatus`** — `schema.prisma:7345` — 4 values (`@map` to `active|expired|revoked|superseded`). Per-student behaviour restriction lifecycle.
- **`ScanStatus`** — `schema.prisma:7441` — 4 values (`@map` to `pending|clean|infected|scan_failed`). Antivirus scan outcome on uploaded attachments.
- **`PolicyActionExecutionStatus`** — `schema.prisma:7482` — 4 values (`success|failed|skipped_duplicate|skipped_condition`). Per-execution outcome on automated behaviour policy actions.
- **`ReporterAckStatus`** — `schema.prisma:7495` — 3 values (`@map` to `received|assigned|under_review`). Reporter acknowledgement state on safeguarding/CP intake.

### Pastoral (auxiliary)

- **`PastoralActionStatus`** — `schema.prisma:7527` — 5 values (`@map` to `pending|in_progress|completed|overdue|cancelled`). Per-action state on pastoral case action plans.

### Engagement (auxiliary)

- **`ParticipantStatus`** — `schema.prisma:7829` — 10 values (`invited|registered|consent_pending|consent_granted|consent_declined|payment_pending|confirmed|attended|absent|withdrawn`). Per-participant engagement-event lifecycle.
- **`ParticipantConsentStatus`** — `schema.prisma:7842` — 3 values (`pending|granted|declined`). Per-participant consent state.
- **`ParticipantPaymentStatus`** — `schema.prisma:7848` — 5 values (`not_required|pending|paid|waived|refunded`). Per-participant payment state for paid engagement events.
- **`TimeSlotStatus`** — `schema.prisma:7862` — 5 values (`available|booked|blocked|completed|cancelled`). Underlying enum for `ConferenceSlotStatus` (already documented as a transition section above).
- **`EngagementFormStatus`** — `schema.prisma:7780` — 3 values (`draft|published|archived`). Documented above as `EngagementFormTemplateStatus` (the API-level name); same enum.
- **`FormSubmissionStatus`** — `schema.prisma:7786` — 5 values (`pending|submitted|acknowledged|expired|revoked`). Documented above as `EngagementSubmissionStatus` (the API-level name); same enum.

### Homework

- **`CompletionStatus`** — `schema.prisma:7753` — 3 values (`not_started|in_progress|completed`). Per-student-per-assignment completion mirror, kept in sync with `HomeworkSubmissionStatus`.

### Scheduling auxiliary

- **`ExamSolveJobStatus`** — `schema.prisma:4191` — 5 values (`queued|running|completed|failed|cancelled`). Exam-timetable solver run lifecycle (parallel to `SchedulingRunStatus` for the academic timetable solver).

### Notes on collisions

Several enums use Prisma `@map` to avoid duplicate value names across the schema (PostgreSQL global enum-value namespace would otherwise collide). Common patterns: `ci_*` (`CriticalIncidentStatus`), `pc_*` (`PastoralInterventionStatus`, `PastoralActionStatus`), `sg_*` (`SafeguardingStatus`), `sst_*` (`SstMeetingStatus`), `mr_*` (`MandatedReportStatus`), `pod_*` / `cba_*` (regulatory sync), `transfer_*` (`TransferStatus`), `reg_*` (`RegulatorySubmissionStatus`), `rec_*` (`PastoralReferralRecommendationStatus`), `sync_*` (`PodSyncLogStatus`), `*_alert` / `*_recipient` / `*_restriction` (behaviour alerts/restrictions), `_doc` / `_hold` (documents / legal holds), `withdrawn_appeal` / `hearing_scheduled_exc` (`AppealStatus`, `ExclusionStatus`).

When you add a new enum value, check this list first — if your new value would collide with an existing PostgreSQL enum value anywhere in the schema, you must use `@map` and pick a prefixed Prisma-side name. Forgetting this surfaces as a confusing migration error rather than a clean lint failure.
