# Session 3E -- Tenant Module Toggles UI

**Session:** 3E
**Layer:** 3 (Polish & Operations)
**Dependencies:** Module Gating Wave 5 must be complete (`Module Gating/STRATEGY.md` — registry, seed backfill, API enforcement, frontend gating, worker patterns, cache invalidation, test contract, doc pass, all 22 implementations). Specifically depends on Module Gating implementations 01 (canonical registry), 06 (toggle endpoint behaviour), and 22 (admin console handoff doc which is the binding interface contract).
**Estimated effort:** Single session
**Builds on:** §3.11 of `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`

---

## 1. Objective

Build the per-tenant module toggle UI that the platform operator uses to enable/disable individual modules for each tenant. After this ships:

- A page at `/admin/tenants/:id/modules` renders 20 module cards (one per gateable key in `MODULE_REGISTRY`) grouped by category.
- Toggling a card calls the existing `PATCH /v1/admin/tenants/:id/modules/:key` endpoint (already wired by Module Gating impl 06) with optimistic UI; revert + toast on failure.
- Each card shows current state, default hint, and "last toggled by Y on Z" sourced from the audit log.
- Disabling a parent module surfaces a warning prompt for any enabled dependents (per `depends_on` in the registry); operator confirms either way.
- Enabling `compliance_advanced` surfaces a one-time jurisdiction warning.
- A health banner appears if `TenantModuleService.assertCompleteness(tenantId)` returns incomplete — should never fire in production, safety net only.

This is a UI session. No gating logic is added or changed — Module Gating already shipped that. The contribution here is operator UX on top of the foundation.

---

## 2. Database

**No new tables, no new enums, no migrations.** This session reads from:

- `tenant_modules` (existing — Module Gating data layer)
- `audit_logs` (existing — filter on `action = 'module_toggle'` and `metadata_json.module_key`)

And writes via the existing `PATCH /v1/admin/tenants/:id/modules/:key` handler (Module Gating impl 06) with `{ is_enabled: boolean }`.

---

## 3. Backend

### 3.1 New Service Method: `TenantModulesAdminService.getModulesView(tenantId)`

**File:** `apps/api/src/modules/tenants/admin/tenant-modules-admin.service.ts` (new file under existing tenants admin namespace)

Combines registry data, current toggle state, and the latest audit log entry per module into a single payload for the UI.

```typescript
import { Injectable } from '@nestjs/common';
import { MODULE_REGISTRY, type ModuleDefinition, type ModuleKey } from '@school/shared';
import { TenantModuleService } from '../../../common/services/tenant-module.service';
import { PrismaService } from '../../../prisma/prisma.service';

export interface ModuleView extends ModuleDefinition {
  is_enabled: boolean;
  last_toggled_at: string | null;
  last_toggled_by: { user_id: string; display_name: string } | null;
}

export interface TenantModulesViewResponse {
  tenant_id: string;
  modules: ModuleView[];
  completeness: { complete: boolean; missing: ModuleKey[] };
}

@Injectable()
export class TenantModulesAdminService {
  constructor(
    private readonly tenantModule: TenantModuleService,
    private readonly prisma: PrismaService,
  ) {}

  async getModulesView(tenantId: string): Promise<TenantModulesViewResponse> {
    const [enabledKeys, completeness, recentToggles] = await Promise.all([
      this.tenantModule.getEnabledModules(tenantId),
      this.tenantModule.assertCompleteness(tenantId),
      this.fetchLatestToggleEventsByKey(tenantId),
    ]);

    const enabledSet = new Set(enabledKeys);

    return {
      tenant_id: tenantId,
      modules: MODULE_REGISTRY.map((def) => ({
        ...def,
        is_enabled: enabledSet.has(def.key),
        last_toggled_at: recentToggles.get(def.key)?.created_at?.toISOString() ?? null,
        last_toggled_by: recentToggles.get(def.key)?.actor ?? null,
      })),
      completeness,
    };
  }

  private async fetchLatestToggleEventsByKey(tenantId: string) {
    // For each module key, get the most recent audit_log entry where
    // action = 'module_toggle', entity_id = tenantId, and metadata_json.module_key is canonical.
    // Implementation: one query selecting all matching rows, then JS-side
    // dedup-by-key using DISTINCT ON or array_agg in Postgres.
    // Acceptable to return an empty Map if audit_log doesn't have entries yet.
    // ...returns Map<ModuleKey, { created_at, actor: { user_id, display_name } }>
  }
}
```

### 3.2 New Endpoint: `GET /v1/admin/tenants/:id/modules`

**File:** `apps/api/src/modules/tenants/admin/tenant-modules-admin.controller.ts` (new)

```typescript
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PlatformOwnerGuard } from '../guards/platform-owner.guard';
import { TenantModulesAdminService } from './tenant-modules-admin.service';

@Controller('v1/admin/tenants')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class TenantModulesAdminController {
  constructor(private readonly service: TenantModulesAdminService) {}

  // GET /v1/admin/tenants/:id/modules
  @Get(':id/modules')
  async getModules(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getModulesView(id);
  }
}
```

### 3.3 Existing Endpoint Reused

`PATCH /v1/admin/tenants/:id/modules/:key` already exists. Module Gating impl 06 added the audit-log + cache invalidation + pub/sub publish. No changes required for this session.

---

## 4. Frontend

### 4.1 Page: `/[locale]/(platform)/admin/tenants/[id]/modules`

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/modules/page.tsx`

Renders the modules view using server-side fetch (per repo convention — apiClient with await) or via a TanStack Query hook (whichever the existing platform admin pages use). Refer to `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` for the established pattern.

Layout:

```
┌────────────────────────────────────────────────────────────────┐
│  ← Back to Tenant                                              │
│  School A — Module Toggles                                     │
│                                                                │
│  Status: 18 of 20 modules enabled                              │
│  [Apply preset: Standard ▼]    [Audit history →]               │
├────────────────────────────────────────────────────────────────┤
│  Academic                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────┐  │
│  │ Admissions   │ │ Gradebook    │ │ Homework     │ │ SEN  │  │
│  │ default: ON  │ │ default: ON  │ │ default: ON  │ │ OFF  │  │
│  │ ● ON         │ │ ● ON         │ │ ● ON         │ │ ○ OFF│  │
│  │ Last: Ram    │ │ Last: never  │ │ Last: never  │ │      │  │
│  │   3 days ago │ │              │ │              │ │      │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────┘  │
│                                                                │
│  Finance / Ops                                                 │
│  ... 3 cards ...                                               │
│                                                                │
│  People Care                                                   │
│  ... 4 cards ...                                               │
│                                                                │
│  Communications                                                │
│  ... 4 cards ...                                               │
│                                                                │
│  Operations                                                    │
│  ... 4 cards ...                                               │
│                                                                │
│  Compliance                                                    │
│  ... 1 card (compliance_advanced) ...                          │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Component: `<ModuleToggleCard>`

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/modules/_components/module-toggle-card.tsx`

Props:

```typescript
interface ModuleToggleCardProps {
  module: ModuleView; // typed shape from the GET endpoint
  tenantId: string;
  enabledModules: ModuleKey[]; // for depends_on warning logic
  onToggle: (key: ModuleKey, nextState: boolean) => Promise<void>;
}
```

Behaviour:

1. Renders display_name, description, current is_enabled (toggle), default hint, "last toggled by X on Y" line.
2. On click of the toggle:
   - If turning OFF and any enabled module has this key in its `depends_on`: show `<DependentModulesWarningDialog>` listing the dependents; cancel or proceed.
   - If turning ON `compliance_advanced`: show `<JurisdictionWarningDialog>`; confirm or cancel.
   - Optimistically flip the local state; call `onToggle`.
   - On failure: revert local state; toast error.
3. On success: persist; toast success ("Gradebook enabled for School A").

### 4.3 Component: `<DependentModulesWarningDialog>`

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/modules/_components/dependent-modules-warning-dialog.tsx`

Reusable shadcn/ui Dialog. Lists the affected dependent modules and gives the operator three options:

- "Disable both" (turn off the parent + each listed dependent — multiple toggle calls in sequence)
- "Disable only the parent" (proceed; dependents remain in their possibly-broken state)
- "Cancel" (no change)

### 4.4 Component: `<JurisdictionWarningDialog>`

**File:** `.../jurisdiction-warning-dialog.tsx`

One-time confirmation when enabling `compliance_advanced`. Operator must check "I confirm this tenant operates in Ireland" before "Enable" button activates.

### 4.5 Component: `<ModuleCompletenessBanner>`

**File:** `.../module-completeness-banner.tsx`

Renders only if `completeness.complete === false`. Lists missing module keys + a "Run backfill migration" CTA pointing at the operations runbook.

### 4.6 (Optional / Layer 2 follow-up) Bulk preset application

A "Apply preset: Standard" dropdown that, on selection, calls the toggle endpoint sequentially for any module whose current state differs from the preset. For Session 3E ship the dropdown UI but wire only the "Standard" preset (= registry's `default_enabled` values). Custom presets defer to a future session.

---

## 5. Files to Create

| File                                                                         | Purpose                                      |
| ---------------------------------------------------------------------------- | -------------------------------------------- |
| `apps/api/src/modules/tenants/admin/tenant-modules-admin.service.ts`         | Combines registry + toggle state + audit log |
| `apps/api/src/modules/tenants/admin/tenant-modules-admin.service.spec.ts`    | Unit tests                                   |
| `apps/api/src/modules/tenants/admin/tenant-modules-admin.controller.ts`      | GET endpoint                                 |
| `apps/api/src/modules/tenants/admin/tenant-modules-admin.controller.spec.ts` | Controller tests                             |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/modules/page.tsx`   | The page                                     |
| `.../modules/_components/module-toggle-card.tsx`                             | Per-module card                              |
| `.../modules/_components/dependent-modules-warning-dialog.tsx`               | depends_on warning                           |
| `.../modules/_components/jurisdiction-warning-dialog.tsx`                    | compliance_advanced warning                  |
| `.../modules/_components/module-completeness-banner.tsx`                     | health banner                                |
| `.../modules/_components/preset-dropdown.tsx`                                | Standard preset apply                        |
| `apps/web/src/lib/api/admin-tenant-modules.ts`                               | apiClient wrappers for GET + POST toggle     |
| `apps/web/src/__tests__/admin/tenant-modules-page.spec.tsx`                  | Page interaction tests                       |

## 6. Files to Modify

| File                                                                         | Change                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/tenants/tenants.module.ts`                             | Register the new admin service + controller                                                         |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx`           | Add a "Modules" tab/link pointing at the new page                                                   |
| `apps/web/src/app/[locale]/(platform)/admin/_components/admin-nav-config.ts` | Sub-nav under Tenants if applicable; ensure existing tenant detail nav surfaces the new modules tab |
| `docs/architecture/feature-map.md`                                           | Add the new admin route under §29 (Platform Admin & Operations)                                     |

---

## 7. Testing Strategy

### Backend (unit tests, co-located)

- `tenant-modules-admin.service.spec.ts`:
  - Returns 20 modules per the registry.
  - Each module has correct `is_enabled` matching the underlying tenantModule rows.
  - `last_toggled_at` is populated when audit-log entries exist; null when none.
  - `completeness.complete` is true when all 20 rows exist.
- `tenant-modules-admin.controller.spec.ts`:
  - 200 happy path (platform_owner JWT).
  - 403 for non-platform user.
  - 400 for invalid UUID param.

### Frontend (Jest + React Testing Library + msw)

- Page renders 20 cards.
- Toggle click optimistically updates UI; on mock 500 reverts.
- Disabling `finance` shows the dependent dialog if `budgeting` is currently enabled.
- Enabling `compliance_advanced` requires the jurisdiction checkbox.
- Completeness banner renders when API response has `complete: false`.

### E2E smoke (Playwright, optional but recommended)

- Login as platform_owner via NHQS sandbox tenant.
- Navigate to /admin/tenants/:nhqs/modules.
- Toggle `gradebook` off; reload page; assert state persists.
- Toggle back on.

---

## 8. Acceptance Criteria

- [x] `GET /v1/admin/tenants/:id/modules` returns the full module view payload (20 entries + completeness object) for any tenant the operator can access.
- [x] Page at `/[locale]/(platform)/admin/tenants/[id]/modules` renders all 20 modules grouped by category (Academic, Finance/Ops, People Care, Communications, Operations, Compliance).
- [x] Each card shows display_name, description, default_enabled hint, current state, last toggled by/on.
- [x] Toggling a card PATCHes `/v1/admin/tenants/:id/modules/:key` with `{ is_enabled: boolean }` and visually reflects success (optimistic + persisted) or failure (revert + toast).
- [x] Disabling a parent module with currently-enabled dependents triggers `<DependentModulesWarningDialog>` with the three options.
- [x] Enabling `compliance_advanced` triggers `<JurisdictionWarningDialog>`; toggle is blocked until checkbox is ticked.
- [x] `<ModuleCompletenessBanner>` renders only when `completeness.complete === false`.
- [x] Audit log integration verified: a flip creates an `audit_logs` row with `action = 'module_toggle'`, `entity_type = 'tenant_config'`, `entity_id = '<tenantId>'`, and metadata includes `module_key` and `is_enabled`. (No new code — verify the existing Module Gating impl 06 handler still does this after registering the new admin route.)
- [x] Within 60s of a toggle, an open browser tab on the SAME page sees the new state without manual refresh (per the polling subscriber from Module Gating impl 06).
- [x] Unit tests + controller tests + frontend page tests all pass.
- [x] Smoke test on NHQS in production: navigate, toggle a non-critical module (e.g., `staff_wellbeing`) off, observe the school user's nav update on next /me poll, toggle back on.

---

## 9. Out of Scope

- Bulk toggle across multiple tenants (single tenant only this session).
- Custom preset definitions (only the "Standard" preset = registry defaults; custom preset library is a future session).
- "X tenants enable this" cross-tenant adoption telemetry on each card (Layer 2 follow-up; would need a new aggregate metric).
- Time-bounded toggles (e.g., "enable for 30 days then disable") — out per Module Gating §14.
- Per-AI-surface toggles inside `ai_functions` — those stay in the existing AI Settings page, not duplicated here.
- Plan / tier abstraction — out per Module Gating §14. Per-tenant flat toggles only.

---

## 10. Notes

- The "Modules" tab on the existing `/admin/tenants/[id]/` page is the natural entry point. It complements the existing Locales tab (added in the i18n expansion) and the existing tenant detail surface. Do not move the existing module toggle UI from the tenant detail page in this session — leave it as a fallback, deprecate cleanly in a follow-up after the new page proves itself.
- Reuse the existing audit-log viewer (Layer 1 § Compliance) for full per-module toggle history filtered by `action = 'module_toggle'` and `metadata_json.module_key`.
- The page intentionally has no live WebSocket subscription (yet). The polling fallback (60s) is sufficient for V1; switch to push when the WebSocket infrastructure from §3.1 of the master spec ships and the Module Gating cache-bus subscriber is upgraded (Module Gating impl 21 documents the migration path).

## 11. Commits / CI / Notes

### Commits

- `d003eb91 feat(platform): add tenant module toggles UI`
- `ef266a53 test(platform): update tenant modules e2e contract`
- `0ff5912c fix(platform): scope tenant module admin reads`
- `62d65a6c fix(platform): scope tenant module audit reads`
- `bcfafa15 fix(platform): scope tenant module toggles`
- `4f202dd1 fix(platform): audit tenant module toggles under rls`

### CI

- GitHub Actions run `25979797169` passed on `main`, including build, unit shards, backend parallel integration, backend serial integration, visual smoke, coverage merge, and deploy.

### Verification Notes

- Local targeted backend tests passed for `tenant-modules-admin.service.spec.ts`, `tenants.service.spec.ts`, and `tenants.e2e-spec.ts`.
- Local type-check, lint, Prisma validation, and `git diff --check` passed. A full local pre-push gate hit one unrelated serial `p5-gradebook.e2e-spec.ts` 403 flake; the isolated `p5-gradebook.e2e-spec.ts` run passed immediately after.
- Production smoke on `https://dua.edupod.app` verified the modules page renders 20 registry modules, completeness is true, `website` can toggle off and back on, audit `last_toggled_at` / `last_toggled_by` is populated, dependency and Irish jurisdiction warnings open and cancel safely, mobile width has no horizontal overflow, and `staff_wellbeing` disappears/reappears from the NHQS school user's `/me` enabled modules after toggle/restore.
- Regression smoke verified Platform Dashboard, sessions/cache/maintenance, platform users, Cmd+K global search, support user search, and tenant detail support panel still load with platform navigation.

## 12. Next Session Prompt

```text
Implement Session 4A of the Platform Admin Dashboard build. Server access granted for diagnostics.

Spec:
docs/features/platform-dashboard/Layer-4/Layer-4-Plan.md

Context:
- Sessions 0, 1A, 1B, 1C, 1D, 1.5A, 1.5B, 1.5C, 2A, 2B, 2C, 2D, 3A, 3B, 3C, 3D, and 3E are complete, deployed, smoke-tested, and accepted.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main.

Before coding:
1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 1, Layer 1.5, Layer 2, Layer 3, and Layer 4 plans.
5. Read the Session 4A / Observability Context sections of docs/features/platform-dashboard/Layer-4/Layer-4-Plan.md end-to-end.
6. Read Session-3E.md and the Layer 3 closeout notes.
7. Inspect existing platform admin health, alerts, queues, error log, audit log, deploy workflow, worker logging, and correlation/logging conventions before designing anything new.
8. Load backend, frontend, prisma, worker, testing, code-quality, architecture-policing, and feature-map-maintenance rule packs as relevant.

Implementation requirements:
- Stay strictly within Session 4A.
- Build the observability context foundation for Layer 4: correlation event capture, deploy event visibility, runbook index, service topology, and severity policies as described in the Layer 4 plan.
- Keep all new Layer 4 foundation tables platform-level; do not add tenant RLS to platform-managed tables.
- Tenant-scoped operations still use existing RLS-aware transaction patterns.
- Do not build the AI chat/copilot UI, recommendations, supervised actions, or incident postmortems in Session 4A.
- Do not add always-on AI generation.
- Preserve existing platform admin behavior, including Sessions 3A through 3E.
- Follow token-driven UX styling.

Verification:
- Run targeted backend/frontend checks, type-check, lint, Prisma validation, and relevant tests.
- Verify the new observability context pages/endpoints in production after deploy.
- Verify deploy event capture from the CI deployment where feasible.
- Verify existing Platform Admin regressions, especially dashboard, alerts, queues, error log, audit log, tenant detail/modules, sessions/cache/maintenance, platform users, Cmd+K global search, and support toolkit access.

Deployment:
- Commit to main and push to origin main only.
- Watch GitHub Actions with gh run watch / gh run view.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy.

Completion:
- Tick the Session 4A acceptance criteria after green CI and production smoke.
- Add "Commits / CI / Notes" to the relevant Layer 4 session documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether Session 4A is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```
