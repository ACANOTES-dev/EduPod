# Implementation 18 — Tenant Admin → AI Flags Page

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10, but lighter scope than siblings)
> **Classification:** frontend
> **Depends on:** 04, 12
> **Deploys:** Web restart only

---

## Goal

Build the admin UI for the per-module AI flag toggles. Single page at `/settings/ai-flags` (or `/admin/ai-flags` — investigate the existing admin shell pattern; reuse it). Lists the four module AI flags (behaviour, pastoral, staff_wellbeing, early_warning) with on/off toggles, last-changed timestamps, and a one-line description per flag.

This is a small page — minimal complexity, but visible to every tenant admin. Polish matters.

## Shared files this impl touches

- `apps/web/src/lib/nav-config.ts` — add a settings sub-entry for `AI Flags`. Edit late.
- `apps/web/messages/en.json` + `ar.json` — add `aiFlagsAdmin.*` namespace. Apply Rules H8 + H9.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **MEDIUM** (translations + nav-config; small additions).

## What to build

### 1. New page `apps/web/src/app/[locale]/(school)/settings/ai-flags/page.tsx`

Layout:

- **PageHeader** — title "AI Features", description ("Enable or disable AI-powered features per module. Disabling a module's AI immediately stops API calls to AI providers and saves cost.").
- **Module cards (4)** — one per module flag. Each card:
  - Module name (Behaviour / Pastoral / Staff Wellbeing / Early Warnings)
  - Description of what the AI does for this module (e.g. "Behaviour AI: Incident description parsing, per-student summaries, natural-language queries.")
  - Toggle (large, accessible) — current state
  - Sub-line: "Last changed by Yusuf Rahman on 2026-04-20" (from `updated_by` and `updated_at`)
  - Cost note (optional): "AI calls are billed per request. See your tenant plan for usage limits."
- **Bulk action bar** at the top: "Enable all" / "Disable all" buttons (with typed-confirmation for "Disable all" because users might bulk-disable in panic and lose access to features they rely on).

### 2. Data flow

- On mount: `apiClient<{ data: TenantAiFlag[] }>('/api/v1/admin/ai-flags')` — render cards.
- On toggle: `apiClient(`/api/v1/admin/ai-flags/${moduleKey}`, { method: 'PATCH', body: { enabled } })` — optimistic update, revert on error with toast.
- On bulk action: 4 sequential PATCHes (or a new bulk endpoint — out of scope; do sequential here).

### 3. Permission gate

Page requires `ai_flag.manage` (added in impl 01). Render permission-denied screen for users without it.

### 4. Translation additions

Namespace `aiFlagsAdmin.*`. Apply Rule H8.

### 5. Nav-config addition

Add a sub-entry under the Settings hub (or wherever tenant admin pages live):

```ts
{
  labelKey: 'nav.aiFlags',
  href: '/settings/ai-flags',
  roles: ['school_owner', 'school_principal'],
}
```

Plus the corresponding `nav.aiFlags` translation key.

## Tests

- `ai-flags/page.spec.tsx`:
  - Renders 4 cards with current flag state
  - Toggle calls PATCH endpoint optimistically
  - Permission-denied screen for teacher role
  - Bulk disable requires typed confirmation
- Playwright: visit `/en/settings/ai-flags` as principal, toggle behaviour AI on, observe state persists across refresh, toggle off again.

## Watch out for

- **Optimistic update + error rollback** — if the PATCH fails (e.g. permission revoked mid-session), revert the toggle and toast. Don't leave the user looking at a flipped switch that didn't actually change anything.
- **"Enable all" without confirmation is fine, "Disable all" needs typed phrase** — disabling AI is a high-impact operation when features are in production use. Match impl 09's confirmation pattern.
- **Audit log** — backend-side, the PATCH already audits via `AuditLogInterceptor`. Frontend just needs to surface the "last changed by" sub-line.

## Deployment notes

- Restart: web only.
- Smoke: `/en/settings/ai-flags` lists 4 module cards. Toggle each, observe optimistic update + persisted state on refresh. Verify in DB: `SELECT module_key, enabled FROM tenant_ai_flags WHERE tenant_id = '<NHQS>';`
