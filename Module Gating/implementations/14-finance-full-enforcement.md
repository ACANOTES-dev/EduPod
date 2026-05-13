# Implementation 14 — Finance Full Enforcement

> **Phase:** 3 — Wave W3
> **Wave:** W3
> **Depends on:** W1 (01–08); impl 09 (sets the webhook precedent)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 / **Max effort** (Stripe webhook special case + active billing money flows)

---

## Goal

Wire `@ModuleEnabled('finance')` enforcement across the finance surface — 13 controllers + 4 worker processors + frontend nav — with one critical exception: the Stripe webhook controller must continue to ack events even when `finance` is disabled (otherwise Stripe retries indefinitely). After this ships, toggling `finance` off cleanly hides all admin finance UI, blocks new invoice/payment workflows, and silently drops Stripe-originated events for the disabled tenant without breaking the webhook contract with Stripe.

---

## Critical safety constraints

- **Stripe webhook controller (`stripe-webhook.controller.ts`) MUST NOT use `@ModuleEnabled`.** It uses the inline check pattern (DZ-MG-3): verify Stripe signature → identify tenant → check module → if disabled, log + return 200 (no enqueue). Returning 4xx triggers Stripe's retry policy and floods the queue.
- **Receipt + invoice numbers** are sequence-allocated. Disabling finance preserves the existing sequence state; re-enabling continues from where it left off (no holes, no resets). Verify the `tenant_sequences` table is unaffected by toggle.
- **In-flight invoice approvals stay safe.** If an invoice is pending approval and finance gets disabled, the approval callback processor silently no-ops; the invoice stays in pending state. Re-enabling allows approvals to resume.
- **Parent-finance (`parent-finance.controller.ts`)** also gates on `finance`. Parents lose access to their household statements + payment history when finance is off. Document this clearly — likely the most visible parent-facing impact.

---

## Files to modify

### Controllers (add `@ModuleEnabled('finance')` + `ModuleEnabledGuard`)

All 12 admin/parent controllers under `apps/api/src/modules/finance/`:

- `discounts.controller.ts`
- `fee-assignments.controller.ts`
- `fee-generation.controller.ts`
- `fee-structures.controller.ts`
- `fee-types.controller.ts`
- `finance-dashboard.controller.ts`
- `finance-enhanced.controller.ts`
- `household-statements.controller.ts`
- `invoices.controller.ts`
- `parent-finance.controller.ts`
- `payments.controller.ts`
- `refunds.controller.ts`

### Controller — remain ungated (Stripe webhook)

- `apps/api/src/modules/finance/stripe-webhook.controller.ts` — add inline pattern. Skeleton:

```ts
@Post('stripe')
@HttpCode(200)
async handle(@Headers('stripe-signature') sig: string, @RawBody() body: Buffer) {
  // 1. Verify signature (existing)
  const event = this.stripeService.verifyWebhook(body, sig);

  // 2. Identify tenant (existing — usually via account ID or metadata)
  const tenantId = await this.stripeService.resolveTenantFromEvent(event);

  // 3. NEW: check tenant's finance module
  const enabled = await this.tenantModule.isEnabled(tenantId, 'finance');
  if (!enabled) {
    this.logger.log(
      `Dropping Stripe ${event.type} for tenant ${tenantId}: finance module disabled`,
    );
    // Acknowledge to Stripe so they don't retry
    return { received: true, skipped: 'module_disabled' };
  }

  // 4. Existing dispatch (enqueue, etc.)
  await this.stripeService.handleEvent(event, tenantId);
  return { received: true };
}
```

Add explicit doc comment above the controller: `// EXTERNAL WEBHOOK: intentionally ungated at the decorator level. Module check happens INLINE (DZ-MG-3). Stripe must always receive 200; disabled tenants result in silent drop.`

### Worker processors (Pattern B — top-of-process check)

- `apps/worker/src/processors/finance/finance-queue.processor.ts` — top check on every job route handled
- `apps/worker/src/processors/finance/overdue-detection.processor.ts` — Pattern B
- `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts` — Pattern B (if disabled, silently complete the callback so the approval system doesn't hang)
- `apps/worker/src/processors/finance/stripe-refund-reconciliation.processor.ts` — Pattern B

### Frontend — nav annotations

- `nav.finance` (and ALL sub-entries — there are ~41 finance pages) → `moduleKey: 'finance'`
- Parent portal `/parent/finance`, `/parent/billing`, `/parent/payments` → `moduleKey: 'finance'`
- Budgeting nav (under finance) keeps its own `moduleKey: 'budgeting'` independently — disabling finance does NOT auto-disable budgeting per STRATEGY §7.

### Tests

- Un-skip the `finance` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/invoices` → 404 MODULE_DISABLED
  - `GET /api/v1/finance/dashboard` → 404 MODULE_DISABLED
  - `GET /api/v1/payments` → 404 MODULE_DISABLED
- New unit test in `stripe-webhook.controller.spec.ts`: webhook arrives for tenant with finance disabled → returns 200, does NOT enqueue any job, logs the skip.

---

## Acceptance

- [ ] All 12 admin/parent finance controllers gated. Static-analysis test passes.
- [ ] `stripe-webhook.controller.ts` is ungated at the decorator level; inline check + 200 ack pattern in place; doc comment explains why.
- [ ] All 4 worker processors have Pattern B check.
- [ ] Frontend nav for finance + parent finance + billing annotated with `moduleKey: 'finance'`.
- [ ] Module-gating leakage tests pass for `finance`.
- [ ] Stripe webhook unit test passes (disabled → 200 + no enqueue).
- [ ] Smoke test on NHQS: toggle `finance` off → admin loses access to all finance pages; parent loses billing view; trigger a Stripe sandbox event → check logs confirm the inline drop with 200 returned. Toggle back on → access restored.
- [ ] `tenant_sequences` for invoice/receipt/payment unchanged before vs after toggle (verify with a SELECT).

---

## Notes

- Stripe is the most important external dependency in this entire initiative. The webhook contract is non-negotiable. If Stripe receives 4xx, they retry up to 3 days with exponential backoff — that's tens of thousands of retried events. Returning 200 with `{ received: true, skipped: 'module_disabled' }` is the right answer.
- Parent-facing impact of disabling finance is the largest of any module. Schools should expect to message parents in advance ("school billing temporarily moved to manual handling — you can still pay via [other channel]"). Document in the admin console UI as a warning when toggling.
- The `tenant_sequences` invariant is critical: if a school disables finance, then re-enables 6 months later, the next invoice number must continue from where it left off. The sequences table is independent of `tenantModule`. Verify nothing in this spec touches it.
- The 4 worker processors all share `QUEUE_NAMES.FINANCE`. The Pattern B check is per-job-route inside the queue's processor. Verify the processor file structure (single processor handling many job names vs many processors).
