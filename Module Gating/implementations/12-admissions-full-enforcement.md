# Implementation 12 — Admissions Full Enforcement

> **Phase:** 3 — Wave W3 (full enforcement pass)
> **Wave:** W3
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Sonnet 4.6 (template-driven; 6 controllers + 4 cron processors + nav)

---

## Goal

Wire `@ModuleEnabled('admissions')` enforcement across the entire admissions surface — all 6 controllers, all 4 cron processors, all frontend nav entries — except the public application form (which must remain accessible to prospective parents who don't have an authenticated session). After this ships, toggling `admissions` off hides the admin admissions UI and prevents new applications via the parent portal, but preserves the public landing for prospective applicants.

---

## Critical safety constraints

- **Public admissions form (`public-admissions.controller.ts`) MUST remain ungated.** Prospective parents reach this without authentication; they don't yet have a tenant relationship. Add an inline doc comment: `// PUBLIC: intentionally ungated. Prospective applicants submit before any tenant relationship exists. The receiving tenant's `admissions` toggle does not gate this endpoint; data still lands in the Application table but admin UI is hidden when disabled.`
- **In-flight applications survive disable.** The `Application` table is preserved. Re-enabling restores admin visibility immediately.
- **Payment events must continue to be received** (Stripe webhooks for admissions payments). The webhook controller pattern from impl 14 (finance) applies if any admissions-payment-specific webhook exists.

---

## Files to modify

### Controllers (add `@ModuleEnabled('admissions')` + `ModuleEnabledGuard`)

- `apps/api/src/modules/admissions/admission-forms.controller.ts`
- `apps/api/src/modules/admissions/admissions-dashboard.controller.ts`
- `apps/api/src/modules/admissions/admissions-payment.controller.ts`
- `apps/api/src/modules/admissions/applications.controller.ts`
- `apps/api/src/modules/admissions/parent-applications.controller.ts`

### Controllers — remain ungated

- `apps/api/src/modules/admissions/public-admissions.controller.ts` — add doc comment as above

### Worker processors (Pattern B — top-of-process check)

- `apps/worker/src/processors/admissions/admissions-application-received.processor.ts` — check `TenantModuleService.isEnabled(tenant_id, 'admissions')`; silently return if disabled
- `apps/worker/src/processors/admissions/admissions-application-withdrawn.processor.ts` — same
- `apps/worker/src/processors/admissions/admissions-payment-expiry.processor.ts` — same
- `apps/worker/src/processors/admissions/admissions-payment-link.processor.ts` — same

### Frontend — nav annotations

- `nav.admissions` (and any sub-entries: `/admissions/forms`, `/admissions/applications`, `/admissions/payment-links`, `/admissions/applications/:id`) → `moduleKey: 'admissions'`
- Parent portal `/applications` (parent-applications view) → `moduleKey: 'admissions'`

### Tests

- Un-skip the `admissions` block in `module-gating-leakage.e2e-spec.ts`. Add probes:
  - `GET /api/v1/admissions/dashboard` → 404 MODULE_DISABLED when off
  - `GET /api/v1/applications` → 404 MODULE_DISABLED when off
  - `POST /api/v1/public/admissions/applications` → 200 (or whatever the public form's success status is) regardless of toggle (verify with a separate test).
- Worker test: enqueue `admissions-application-received` for a disabled tenant; verify silent return + ack.

---

## Acceptance

- [ ] All 5 admin admissions controllers gated `@ModuleEnabled('admissions')` + `ModuleEnabledGuard`. Static-analysis test passes.
- [ ] `public-admissions.controller.ts` remains ungated with explicit doc comment.
- [ ] All 4 admissions worker processors have the Pattern B check.
- [ ] Frontend nav entries annotated with `moduleKey: 'admissions'`.
- [ ] Module-gating leakage tests pass for `admissions`.
- [ ] Public admissions form test confirms 200 even when `admissions` is disabled for the receiving tenant. Application row IS created (data still flows).
- [ ] Smoke test on NHQS: toggle `admissions` off → admin loses /admissions hub access; submit a public form (should succeed); toggle back on; new application visible in admin list.

---

## Notes

- This is the cleanest of the W3 specs: small surface, no special webhook complexity, no other modules sharing controllers.
- The "data still flows" semantic for the public form is intentional: a tenant might disable admissions during a quiet period and want to re-enable later without losing prospective applicants. The data continues to land in the table.
- Admissions-payment ties to `finance` (Stripe). When `admissions` is disabled, the payment-link controller is unreachable but Stripe might still send events for already-issued payment links. The webhook handler's tenant resolution still works; it just no-ops if relevant. Verified once impl 14 (finance) is in place.
