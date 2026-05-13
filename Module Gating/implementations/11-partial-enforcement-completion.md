# Implementation 11 — Partial Enforcement Completion (payroll, parent_inquiries, ai_functions, website)

> **Phase:** 2 — Wave W2
> **Wave:** W2
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Opus 4.7 (multiple modules with subtle gaps; AI surfaces in particular need careful coverage)

---

## Goal

Four modules have partial enforcement — most of their surface is gated but a few specific gaps exist. This spec closes each gap.

| Module             | Gap                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payroll`          | `payroll-entries.controller.ts` has no `@ModuleEnabled`; the other 6 controllers do.                                                                                                              |
| `parent_inquiries` | API controller is gated; cron processors are not.                                                                                                                                                 |
| `ai_functions`     | Existing `@RequiresAiFlag` covers 5 controllers; gradebook AI / scheduling AI substitution / attendance scan / GDPR AI audit are ungated. Add `@ModuleEnabled('ai_functions')` as the outer gate. |
| `website`          | Admin controllers gated; public controllers correctly remain ungated. Add `@ModuleEnabled('website')` to `contact-submissions.controller.ts` for consistency; document the public/admin split.    |

---

## Critical safety constraints

- **AI service-level fallback is the safety net.** Even with all AI controllers gated, a future code path might call `AnthropicClientService` from somewhere we miss. Add a top-level check inside `AnthropicClientService.beforeRequest()` (or its equivalent entry method) that consults `TenantModuleService.isEnabled(tenantId, 'ai_functions')` and throws if disabled. This catches anything that bypassed the controller-level gate.
- **public-website / public-contact must stay ungated.** Public visitors don't have a session; they can't be tied to a tenant via JWT. Their access is via tenant domain. Document this in the controller as `// PUBLIC: intentionally ungated. Tenant resolution via Host header; module state ignored for the live site (separate from admin UI).`
- **`@RequiresAiFlag` stays in place.** Layered gating: `@ModuleEnabled('ai_functions')` is the outer tenant-level gate (admin console toggle); `@RequiresAiFlag('reports_predictions')` is the inner per-AI-surface flag (existing settings page). Both must pass for an AI request to proceed.

---

## Files to modify

### payroll

- `apps/api/src/modules/payroll/payroll-entries.controller.ts` — add `@ModuleEnabled('payroll')` at class level + `ModuleEnabledGuard` to `@UseGuards`.

### parent_inquiries

- `apps/worker/src/processors/communications/inquiry-notification.processor.ts` — Pattern B check at top of `process()`: `TenantModuleService.isEnabled(tenant_id, 'parent_inquiries')`; silently return if disabled.
- `apps/worker/src/processors/communications/stale-inquiry-detection.processor.ts` — same.
- (If the cron-dispatcher fans out per-tenant, add Pattern A skip there instead.)

### ai_functions

Add `@ModuleEnabled('ai_functions')` + `ModuleEnabledGuard` at class level to:

- `apps/api/src/modules/gradebook/ai/ai-comments.controller.ts` (verify file location)
- `apps/api/src/modules/gradebook/ai/ai-grading.controller.ts` (or wherever ai-grading is exposed)
- `apps/api/src/modules/gradebook/ai/ai-progress-summary.controller.ts`

For service-only AI surfaces (no controller, called from inside another module's service):

- `apps/api/src/modules/scheduling/ai-substitution.service.ts` — at the start of the method that calls Anthropic, check `TenantModuleService.isEnabled(tenantId, 'ai_functions')`; if false, log + return null/empty (do NOT throw — the calling code expects the substitution helper to gracefully no-op).
- `apps/api/src/modules/attendance/attendance-scan.service.ts` — same pattern.
- `apps/api/src/modules/gdpr/ai-audit.service.ts` — this is a read service; check at the start; return empty list if disabled.

Service-level safety net:

- `apps/api/src/modules/ai/anthropic-client.service.ts` — wrap `beforeRequest` (or the main `messages.create` entry point) with `await this.tenantModule.isEnabled(tenantId, 'ai_functions')` check. If false, throw `ModuleDisabledException('ai_functions')`. Inject `TenantModuleService` into AnthropicClientService — if not already a Nest provider, refactor so it can be.

### website

- `apps/api/src/modules/website/contact-submissions.controller.ts` — add `@ModuleEnabled('website')` + `ModuleEnabledGuard`.
- `apps/api/src/modules/website/public-website.controller.ts` — add inline doc comment: `// PUBLIC: intentionally ungated. Live website remains accessible to visitors regardless of admin module state. Disabling 'website' only hides the admin UI for editing pages.`
- `apps/api/src/modules/website/public-contact.controller.ts` — same comment.

### Frontend — nav annotations

- `nav.payroll` and sub-entries → `moduleKey: 'payroll'`
- `nav.inquiries` (parent portal) → `moduleKey: 'parent_inquiries'`
- AI feature toggles in `/settings/ai-flags` page header → conditional render via `<IfModuleEnabled module="ai_functions">` (settings still surface the per-flag knobs but only when the module is on)
- `nav.website` (admin) → `moduleKey: 'website'`. Public-facing site routes (if any rendered by Next.js) stay unannotated.

### Tests — un-skip in leakage spec

For each of the 4 modules, un-skip the corresponding `it` blocks in `module-gating-leakage.e2e-spec.ts` and verify they pass.

Add new unit tests:

- `anthropic-client.service.spec.ts` — when `TenantModuleService.isEnabled` returns false for `ai_functions`, the service throws `ModuleDisabledException`.
- `ai-substitution.service.spec.ts` — when AI is disabled, `getSubstitutionSuggestion` returns `null` (or empty), does not call Anthropic, logs the skip.

---

## Acceptance

- [ ] `payroll-entries.controller.ts` has `@ModuleEnabled('payroll')` + `ModuleEnabledGuard`. Static analysis passes.
- [ ] All 3 parent_inquiries processors have Pattern B check.
- [ ] All AI controllers + service entry points have `@ModuleEnabled('ai_functions')` (or service-level check). The AnthropicClientService safety net throws if `ai_functions` is disabled.
- [ ] `public-website.controller.ts` and `public-contact.controller.ts` remain ungated with explicit doc comments.
- [ ] `contact-submissions.controller.ts` is gated.
- [ ] Module-gating leakage tests pass for `payroll`, `parent_inquiries`, `ai_functions`, `website`.
- [ ] Smoke test on NHQS:
  - Toggle `payroll` off → admin loses access to all payroll pages including the previously-ungated `/payroll/entries`. Toggle back on → access restored.
  - Toggle `parent_inquiries` off → submitting an inquiry from the parent portal fails with disabled landing; existing inquiries' notification dispatcher silently skips.
  - Toggle `ai_functions` off → Reports Ask-AI fails; Gradebook AI grading suggestion button hidden or no-ops; AI substitution in scheduler returns empty.
  - Toggle `website` off → admin website management hidden; live public site still loads at `https://nhqs.edupod.app/`.

---

## Notes

- The AI gating layered approach is the most subtle in this spec. Document the layering in code comments: `@ModuleEnabled('ai_functions')` is "tenant has AI on at all"; `@RequiresAiFlag('reports_predictions')` is "this specific AI surface is on within the tenant's AI features." Both must pass.
- The `AnthropicClientService` safety net is critical because AI is called from many places. The service-level check ensures even if a controller is missed (a future bug), the disabled state is honored.
- Wait until impl 09 (communications split) ships before this spec touches `parent_inquiries`'s processors — they live in the communications dir and impl 09 may have moved them or changed their imports.
