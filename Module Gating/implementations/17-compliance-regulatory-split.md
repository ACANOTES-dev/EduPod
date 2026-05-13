# Implementation 17 — Compliance / Regulatory Split

> **Phase:** 3 — Wave W3
> **Wave:** W3
> **Depends on:** W1 (01–08); impl 09 (sets the precedent for splitting an existing module)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 / **Max effort** (legal sensitivity; regulatory.controller.ts has 67 endpoints; method-level gating)

---

## Goal

Split the existing `compliance` work into two distinct surfaces:

1. **Core compliance** (NEVER gateable; always-on for legal reasons) — DSAR, consent records, privacy notices, DPA acceptance, basic data retention, audit logs, sub-processor list, AI audit logging. Legal requirements under GDPR/UK DPA. Cannot be disabled.
2. **`compliance_advanced`** (gateable) — DES (Irish school inspections), TUSLA (Irish child protection reporting), PPOD (Irish payroll data), CBA (competency-based assessment), advanced retention policies, regulatory calendar, advanced audit trails.

This spec implements the gating for `compliance_advanced` and explicitly preserves the ungated state of core compliance. `regulatory.controller.ts` has 67 endpoints across many regulatory regimes — uses method-level `@ModuleEnabled` for the DES/TUSLA/PPOD/CBA endpoints only.

---

## Critical safety constraints

- **GDPR/DPA controllers MUST remain ungated.** Disabling them would break legal compliance for every EU/UK tenant. Add explicit doc comments at the top of every `gdpr/*.controller.ts` file: `// LEGAL REQUIREMENT: this controller MUST NEVER be gated. GDPR/DPA features are legally mandatory for every tenant. See Module Gating/STRATEGY.md §5.2.`
- **Existing `tenantModule.module_key = 'compliance'` rows from before W1 should NOT exist** (impl 02 removed the `compliance` key from the registry; the migration deleted those rows). Verify in the deploy verification SQL that no `module_key = 'compliance'` rows remain.
- **Default for `compliance_advanced` is OFF** per impl 01. Existing tenants don't see DES/TUSLA UI unless an admin explicitly enables it. Avoids surfacing irrelevant Irish-jurisdiction features to non-IE tenants.
- **Method-level gating on `regulatory.controller.ts`** is more verbose than class-level but necessary because the controller mixes core and advanced regulatory endpoints. Use `@ModuleEnabled('compliance_advanced')` on individual `@Get/@Post` methods that handle DES/TUSLA/PPOD/CBA paths.

---

## Files to modify

### Controllers — gate under `compliance_advanced` (method-level on regulatory.controller.ts)

- `apps/api/src/modules/regulatory/regulatory.controller.ts` — DES/TUSLA/PPOD/CBA endpoints (estimate ~30 of the 67) get `@ModuleEnabled('compliance_advanced')` per method. Other endpoints (basic regulatory operations like staff vetting, calendar event creation if used by all jurisdictions) stay ungated. **Verify each endpoint's purpose during implementation** — don't guess. Read the route paths.
- `apps/api/src/modules/compliance/retention-policies.controller.ts` — advanced policy management methods get `@ModuleEnabled('compliance_advanced')`. Basic retention queries stay ungated.

### Controllers — explicitly ungated (LEGAL REQUIREMENT)

For each of the following, add the doc comment from the safety constraints section:

- `apps/api/src/modules/compliance/compliance.controller.ts` — DSAR + compliance request handling
- `apps/api/src/modules/gdpr/*.controller.ts` (all 7) — consent, privacy notices, DPA, parent consent, AI audit, sub-processor agreements, etc.

### Worker processors (regulatory specifically)

- Any processors in `apps/worker/src/processors/regulatory/` that handle DES/TUSLA/PPOD/CBA submissions: Pattern B check on `compliance_advanced`.
- Compliance core processors (DSAR fulfillment, retention policy execution for basic GDPR retention) stay ungated.

### Frontend — nav annotations

- `/settings/compliance` — always visible (core). DO NOT annotate.
- `/settings/regulatory` — always visible (core hub). DO NOT annotate the hub itself.
- DES/TUSLA/PPOD/CBA sub-pages under `/settings/regulatory/*` → `moduleKey: 'compliance_advanced'`
- `/reports/compliance` — visible to admins always (basic compliance reports are core); advanced reports inside use `<IfModuleEnabled module="compliance_advanced">` to hide DES/TUSLA-specific report types.

### Tests

- Un-skip `compliance_advanced` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/regulatory/des/submissions` → 404 MODULE_DISABLED when off
  - `GET /api/v1/regulatory/tusla/reports` → 404 MODULE_DISABLED when off
  - `GET /api/v1/compliance/dsar/requests` → 200 (or whatever happy-path is — NOT gated)
  - `GET /api/v1/gdpr/consent/records` → 200 (NOT gated)
- Static analysis test from impl 07 confirms no `gdpr/*.controller.ts` has `@ModuleEnabled` (would be a violation; must NEVER be gated).

---

## Acceptance

- [ ] DES/TUSLA/PPOD/CBA endpoints in `regulatory.controller.ts` gated method-level under `@ModuleEnabled('compliance_advanced')`. Approximately 30 methods identified by their route paths.
- [ ] `retention-policies.controller.ts` advanced methods gated; basic methods ungated.
- [ ] All 7 `gdpr/*.controller.ts` controllers have the LEGAL REQUIREMENT doc comment and remain ungated.
- [ ] `compliance.controller.ts` (DSAR + compliance requests) remains ungated with the doc comment.
- [ ] Regulatory worker processors for DES/TUSLA/PPOD/CBA have Pattern B check.
- [ ] Frontend `/settings/compliance` and `/settings/regulatory` always visible; DES/TUSLA/PPOD/CBA sub-pages annotated.
- [ ] Module-gating leakage tests pass for `compliance_advanced`.
- [ ] Static analysis test confirms zero `@ModuleEnabled` in any `gdpr/*` file.
- [ ] Smoke test on NHQS: toggle `compliance_advanced` off → DES/TUSLA pages hidden but Compliance hub still visible; toggle on → DES/TUSLA pages appear. GDPR consent management always accessible regardless of toggle.

---

## Notes

- This spec is the most legally sensitive in the entire initiative. Get it wrong and you could expose tenants to GDPR non-compliance (e.g., a DSAR request can't be fulfilled because the controller is mistakenly gated). The doc comments on every legally-required controller are intentional — they're the breadcrumb for any future contributor wondering "why isn't this gated?"
- The 67-endpoint regulatory controller is the trickiest part. Recommendation: start by listing every endpoint with its route path; classify each as core or advanced; then apply `@ModuleEnabled('compliance_advanced')` per method. Pair-review the classification before merging.
- DES/TUSLA/PPOD/CBA are Irish-specific. UK tenants don't use them. Default-OFF for `compliance_advanced` means non-IE tenants don't see them in UI — clean separation.
- The `compliance` key was REMOVED from the gateable registry in impl 01. If anyone tries to re-add it as a toggle, they'll get a TS error from `ModuleKey`. The deprecation is intentional and irreversible.
- Audit logs (basic) stay always-on. The only "advanced audit" gateable concept here is DES/TUSLA/PPOD/CBA-specific audit reports, not the general audit-log functionality.
