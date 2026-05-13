# Implementation 09 — Communications Split (Outbound vs Inbox)

> **Phase:** 2 — Wave W2 (verification + completion)
> **Wave:** W2 (first per-module spec — sets the pattern for splits)
> **Depends on:** All of W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 / **Max effort** (cross-cutting; touches ~10 files in communications module + processors + frontend nav)

---

## Goal

Split the existing monolithic `communications` toggle into two distinct surfaces:

1. **`communications_outbound`** (gateable) — controls outbound dispatch via SMS/email/WhatsApp + announcements + notification template management. When disabled: no broadcasts go out, admin can't manage templates, the broadcast UI is hidden.
2. **In-app inbox** (CORE — never gateable) — controls in-app conversations and message reads. ALWAYS available regardless of toggle state because inbox is a core product feature.

The data model already supports this: the in-app `Notification` table is read by the inbox controller (always-on); the outbound dispatch processors (`dispatch-notifications.processor.ts` and friends) target external channels and are the ones to gate.

---

## Critical safety constraints

- **Inbox MUST keep working when outbound is disabled.** Test: toggle `communications_outbound` off; verify a user can still see their in-app notification inbox, mark notifications as read, see unread count.
- **Outbound webhook handlers (Resend, Twilio) ack regardless.** Per DZ-MG-3. Inline check + log + 200, no retry storm.
- **No DB migration needed.** Implementation 02 already mapped the old `communications` row to `communications_outbound`. This spec only wires the controllers/processors.
- **Existing tests must not break.** Existing `@ModuleEnabled('communications')` references in pastoral/wellbeing/etc. must be re-pointed to `communications_outbound` if they refer to outbound surfaces (they do — they gate announcements). Verify each one.

---

## Files to modify

### Controllers — gate under `communications_outbound`

- `apps/api/src/modules/communications/announcements.controller.ts` — change `@ModuleEnabled('communications')` to `@ModuleEnabled('communications_outbound')`
- `apps/api/src/modules/communications/notification-templates.controller.ts` — same change
- `apps/api/src/modules/communications/notifications.controller.ts` — REMOVE method-level `@ModuleEnabled('communications')` from `/admin/failed`; add class-level `@ModuleEnabled('communications_outbound')` ONLY for admin endpoints; ensure list/unread/read remain ungated (inbox)
- `apps/api/src/modules/communications/email-domain.controller.ts` — add `@ModuleEnabled('communications_outbound')` + `ModuleEnabledGuard`
- `apps/api/src/modules/communications/whatsapp-template.controller.ts` — add `@ModuleEnabled('communications_outbound')` + `ModuleEnabledGuard`

### Controllers — remain ungated (inbox + public)

- `apps/api/src/modules/communications/notifications.controller.ts` — list/unread/read methods stay ungated (core inbox)
- `apps/api/src/modules/communications/unsubscribe.controller.ts` — public; stays ungated
- `apps/api/src/modules/communications/webhook.controller.ts` — provider webhook; stays ungated externally; INLINE check inside handler (Pattern B from impl 05)
- `apps/api/src/modules/communications/communications-webhooks.controller.ts` — same

### Processors — gate via Pattern B (job-level guard)

- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — top-of-`process()` check `TenantModuleService.isEnabled(job.data.tenant_id, 'communications_outbound')`; return silently if disabled
- `apps/worker/src/processors/communications/publish-announcement.processor.ts` — same
- `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts` — same
- `apps/worker/src/processors/communications/retry-failed.processor.ts` — same

### Processors — remain ungated (inbox + cleanup)

- `apps/worker/src/processors/communications/inbox-dispatch-channels.processor.ts` — inbox dispatch (in-app); stays ungated
- `apps/worker/src/processors/communications/suppression-list-cleanup.processor.ts` — infrastructure cleanup; stays ungated
- `apps/worker/src/processors/communications/ip-cleanup.processor.ts` — infrastructure; stays ungated

### Frontend — nav annotations

- `apps/web/src/components/morph-shell/nav-config.ts` (or wherever nav is defined) — add `moduleKey: 'communications_outbound'` to:
  - Communications hub admin entry (`/communications`)
  - Announcements admin entry (`/communications/announcements`)
  - Notification templates settings entry
  - Email domain settings entry
  - WhatsApp template settings entry
- DO NOT add `moduleKey` to:
  - Inbox view (`/communications/inquiries` if that's actually the inbox; verify)
  - Parent inquiries (separate module, gated by `parent_inquiries`)
  - Notifications dropdown in the morph-shell header (always visible)

### Tests

- `apps/api/test/module-gating-leakage.e2e-spec.ts` — un-skip the `communications_outbound` block. Probes:
  - `GET /api/v1/announcements` → expect 404 MODULE_DISABLED
  - `GET /api/v1/notification-templates` → expect 404 MODULE_DISABLED
  - `GET /api/v1/notifications` (inbox list) → expect 200 (NOT gated)
  - Worker: enqueue a `notifications:dispatch` job for a tenant with module disabled; verify the job acks success without external API calls (mock Resend/Twilio).
- New unit test in `webhook.controller.spec.ts`: webhook arrives for tenant with `communications_outbound` disabled → ack 200, no enqueue, log emitted.

---

## Acceptance

- [ ] All outbound controllers gated `@ModuleEnabled('communications_outbound')` + `ModuleEnabledGuard` in `@UseGuards`. Static-analysis test from impl 07 passes.
- [ ] All outbound processors check tenant module state at top of `process()`; silently return if disabled.
- [ ] Inbox-related endpoints + processors verifiably remain ungated.
- [ ] Webhook handlers ack 200 regardless of module state; inline log emitted when skipping.
- [ ] Frontend nav: communications admin sub-entries hidden when `communications_outbound` disabled; inbox notification dropdown always visible.
- [ ] Module-gating leakage tests pass for `communications_outbound`.
- [ ] Smoke test on NHQS: toggle `communications_outbound` off → admin can't send a new announcement (UI hidden + API 404), but the user's in-app notification dropdown still shows existing notifications and accepts read-marks.

---

## Notes

- This spec is the template for any future "split a module into core + gateable" work. Compliance/regulatory split (impl 17) follows the same pattern.
- The decision to keep inbox always-on is final per STRATEGY §3. Inbox is the only in-app communication channel users have — disabling it would leave teachers/parents/students unable to reach each other through any in-product surface.
- Verify with grep that no other module imports `@school/shared/modules/registry`'s old `communications` key (the registry only has `communications_outbound` per impl 01). Should be zero hits since impl 01 already deleted the old key.
- Provider webhook controllers (Resend, Twilio): the webhook signature verification stays unchanged. The module-disabled check happens AFTER signature verification but BEFORE enqueueing the dispatch job. Order matters.
