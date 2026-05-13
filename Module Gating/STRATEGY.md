# Per-Tenant Module Gating — Strategy

**Last updated:** 2026-05-13
**Status:** Spec under review (Phase 0)
**Owner:** info@acanotes.com
**Operating model:** Claude Opus 4.7 (1M context); Sonnet 4.6 acceptable for low-risk per-module sessions

---

## 1. Mission

Build a **per-tenant module gating system** that the platform admin console can use to enable or disable functional modules for each tenant. The system must be honest end-to-end: a toggle flipped in the admin console must consistently take effect across the API, frontend UI, BullMQ workers, and notifications — with no orphan code paths, no UI lying about availability, and no "disabled" features that secretly still run in the background.

After this work ships:

- The platform operator (you) has a single per-tenant view in the admin console showing every gateable module + its current state.
- A single source-of-truth canonical list (`packages/shared/src/modules/registry.ts`) drives the data model, the API enforcement layer, the frontend nav, the worker tenant-skip logic, and the test contract.
- 22 modules are gateable; the remaining ~50 modules are core (always-on, never appear in the admin console).
- Every gated controller, every gated cron, every gated nav entry is verified end-to-end with a "leakage test" that proves a disabled module returns 404 for that tenant across all surfaces.
- Existing tenants (NHQS + 4 stress-test tenants) are migrated to a baseline preset with no behaviour change.

This work is the **prerequisite for the platform admin dashboard spec** (`docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`). The dashboard cannot honestly expose "module toggles" to the operator until the underlying gating is consistent. Designing a UI that flips toggles which don't actually toggle anything is the trap this spec exists to avoid.

---

## 2. Working Constraints (Non-Negotiable)

These constraints come directly from the user and override defaults:

1. **No finer-than-module granularity.** Decision made in brainstorming on 2026-05-13: the system gates at the module level, not the feature level. There will be no per-endpoint toggles, no per-feature flags inside a module, no tier/plan abstraction. If a tenant turns Gradebook off, the entire Gradebook surface is gone — not "Gradebook minus AI grading." The finer-grained `ai_functions` and `compliance_advanced` toggles are exceptions agreed during the deep-dive (see §6).
2. **No new schema for plans/tiers.** Tenants are flat: each tenant has its own per-module toggle row. No "Standard / Pro / Enterprise" plan abstraction. If we ever need that, it's a separate spec.
3. **Production tenants are test tenants until August 2026.** NHQS and the 4 stress-test tenants are not real customers. Migration plans don't need feature flags or rollback drills targeting "real users" — but production behaviour stability is still required (we can't break NHQS while they're previewing the product).
4. **Honesty over speed.** A toggle that silently doesn't take effect is worse than no toggle at all. Every gated module must be verified end-to-end across all four enforcement layers before its toggle is exposed in the admin console.
5. **The existing per-tenant `tenantModule` table is the data layer.** Don't redesign it. We're filling in the enforcement layers around an existing data model.
6. **Default-deny on missing rows.** This is the existing `ModuleEnabledGuard` behaviour and we're keeping it (see §4.1). The migration plan must therefore guarantee every existing tenant has a row for every gateable module before any new enforcement lands.
7. **No mid-session feature flips that strand users.** When an admin disables a module while a user is on a page using it, the user gets a clean redirect to a "this feature has been disabled by your admin" landing page on next request — not a 500, not a broken UI, not an infinite loop.
8. **Bullsh\*t-detection: every spec in `implementations/` ends with an Acceptance section that the implementing session can verify before claiming done.** No vague "implemented" markers.

---

## 3. Decisions Inherited From Brainstorming

These decisions were locked in conversation on 2026-05-13 before this spec was written. They are not up for re-debate during execution.

| Decision                                                                                                                                                     | Rationale                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module-level granularity, not feature-level                                                                                                                  | Cardinality of feature-level (~700 endpoints) makes consistent enforcement infeasible without dedicating a permanent team to it. Module-level (22 toggles) is achievable.                             |
| `attendance` is core (always-on) — promote from existing dead toggle                                                                                         | Universal across every school; AI-powered scan stays gated under `ai_functions`.                                                                                                                      |
| `analytics_advanced` is **NOT** a real toggle. The existing `analytics` seed key is deprecated.                                                              | Reports are naturally gated by their underlying module (finance.view gates finance reports). A separate analytics toggle would be a permission cartesian explosion.                                   |
| `communications` splits into `communications_outbound` (gateable) + inbox (core)                                                                             | In-app inbox conversations are core to the product. Disabling the entire communications module accidentally breaks inbox. The split was confirmed achievable in the deep-dive.                        |
| `compliance` splits into core (DSAR, consent, GDPR) + `compliance_advanced` (DES/TUSLA/PPOD/CBA)                                                             | GDPR/DPA features are legally required and cannot be turned off without legal exposure. Jurisdiction-specific regulatory submissions are optional.                                                    |
| `ai_functions` is one unified toggle, not per-AI-surface                                                                                                     | The existing `tenant_ai_flag` system stays as a finer per-surface knob inside the AI Settings page. The admin console gets the single ai_functions on/off.                                            |
| `engagement` and `early_warning` are gateable but **currently broken** because their seed rows are missing and the guard denies missing rows. Fix in Wave 1. | Both have full @ModuleEnabled enforcement but no `MODULE_KEYS` seed entry. Default-deny means every tenant currently gets 403 on these. Critical migration item.                                      |
| `trips` stays a placeholder. Either gate it as a stub-toggle for future or skip until real trips lands.                                                      | Per the agent investigation, trips has no controllers, no tables, no permissions — only a stub `TripRosterProvider`. Recommendation: skip from current admin console; revisit when trips work begins. |

---

## 4. System Architecture

The gating system has four enforcement layers + one cache layer + one propagation layer, all driven by a single canonical list.

### 4.1 Canonical list (source of truth)

A new `packages/shared/src/modules/registry.ts` exports:

```ts
export type ModuleKey =
  | 'admissions'
  | 'gradebook'
  | 'homework'
  | 'finance'
  | 'payroll'
  | 'budgeting'
  | 'communications_outbound'
  | 'parent_inquiries'
  | 'website'
  | 'engagement'
  | 'auto_scheduling'
  | 'leave'
  | 'school_closures'
  | 'behaviour'
  | 'pastoral'
  | 'sen'
  | 'staff_wellbeing'
  | 'early_warning'
  | 'ai_functions'
  | 'compliance_advanced';

export interface ModuleDefinition {
  key: ModuleKey;
  display_name: string; // Admin console UI
  description: string; // Admin console tooltip
  default_enabled: boolean; // Used by seed + new-tenant provisioning
  category:
    | 'academic'
    | 'finance_ops'
    | 'people_care'
    | 'communications'
    | 'operations'
    | 'compliance';
  depends_on?: ModuleKey[]; // Optional; informational only — we DO NOT auto-disable dependents
}

export const MODULE_REGISTRY: ReadonlyArray<ModuleDefinition> = [
  /* ...20 entries... */
];
export const MODULE_KEYS: ReadonlySet<ModuleKey> = new Set(MODULE_REGISTRY.map((m) => m.key));
```

The registry is the **only** place where a new toggle is added. Every other layer (seed, fixture, guard, frontend hook, test, doc) imports from here.

### 4.2 Layer 1 — API enforcement

The existing `@ModuleEnabled('key')` decorator + `ModuleEnabledGuard` stays. Three improvements:

1. **Missing-row behaviour stays default-deny** but is documented inline in the guard with a `// SAFETY:` comment. The migration plan (§9) ensures every gateable module has a row for every tenant before any new enforcement ships.
2. **Response shape** when a module is disabled: `404 { error: { code: 'MODULE_DISABLED', module: 'gradebook', message: 'This feature is disabled by your administrator.' } }`. Currently the guard throws `ForbiddenException` (403). Change to `NotFoundException` so it's indistinguishable from "endpoint doesn't exist" — better security posture, cleaner UX. Frontend interprets `MODULE_DISABLED` and shows the redirect landing page.
3. **Type-safe key argument**: change the decorator signature from `@ModuleEnabled(key: string)` to `@ModuleEnabled<K extends ModuleKey>(key: K)`. A typo becomes a TypeScript error.

### 4.3 Layer 2 — Frontend gating

A new `useModuleEnabled(key: ModuleKey)` hook reads from the React context populated by the existing auth boot flow. Today the `/me` endpoint returns user + tenant info; we extend it to include `enabled_modules: ModuleKey[]`.

Three call sites:

1. **Nav filter** in `apps/web/src/components/morph-shell/nav-config.ts` (or wherever the morph-shell nav lives). Each nav entry declares its `moduleKey?: ModuleKey`. Filter at render time before producing the visible nav.
2. **Page guard** in each module's top-level `page.tsx` or shared `(school)/<module>/layout.tsx`. If module is disabled, redirect to `/[locale]/disabled?module=<key>` (a single shared page that explains "this feature has been turned off by your admin").
3. **In-page conditionals** for cross-cutting embeds (e.g., a "behaviour incidents" link inside a student profile card). Wrap with `<IfModuleEnabled module="behaviour">…</IfModuleEnabled>`.

### 4.4 Layer 3 — Worker gating

Two patterns, picked per processor:

1. **Cron dispatcher pattern** (preferred for per-tenant fan-out): cross-tenant cron dispatchers (e.g., `behaviour:cron-dispatch-daily`) iterate the tenant list and skip any tenant whose relevant module is disabled. The check uses a `TenantModuleService.isEnabled(tenantId, key)` helper that hits the same Redis cache used by the API guard.
2. **Job-level guard**: for processors that handle one-off events (e.g., webhook callbacks, user-triggered jobs), check tenant module state at the top of `process()` and silently no-op (`return`) if disabled. The job is acked as completed — disabled state is normal, not an error.

Stripe webhooks and notification provider callbacks (Resend, Twilio) are an exception: they MUST acknowledge the webhook (200 OK back to provider) regardless of tenant module state. The handler is responsible for the no-op behaviour internally.

### 4.5 Layer 4 — Cache + propagation

`TenantModuleService` caches the per-tenant enabled-modules array in Redis at key `tenant_modules:{tenantId}` with TTL 5 minutes. The existing guard uses this; the worker check uses this; the new `/me` endpoint uses this.

When the admin console flips a toggle, the toggle handler:

1. Writes the new `tenantModule.is_enabled` value
2. Inserts an audit log row (existing audit-log infrastructure)
3. `DEL tenant_modules:{tenantId}` to invalidate the cache
4. Publishes `tenant_modules:invalidated` on Redis pub/sub for any subscriber that needs immediate refresh
5. Returns the new state

The frontend listens for the pub/sub event via the existing comms-cache-bus pattern (see `apps/api/src/modules/communications/comms-cache-bus.service.ts` for prior art) — when received, the user's session refetches `/me` and re-renders nav.

### 4.6 Layer 5 — Mid-session UX

When a user is mid-action and a module is disabled by the admin:

- Their next API call returns `{ code: 'MODULE_DISABLED', module: '<key>' }`.
- The frontend root error boundary catches `MODULE_DISABLED`, shows a 2-second toast ("This feature has been disabled by your administrator"), and redirects to `/[locale]/disabled?module=<key>`.
- The disabled landing page links back to the user's home (morph-shell collapsed state).
- This is a clean exit, not a broken UI.

For background-tab users that don't make a request, the next API call after the toggle (typically within 30s due to other background polling) triggers the same path.

---

## 5. Canonical Module Lists

### 5.1 Gateable modules (20 toggles)

Twenty toggles. Down from the 22 originally proposed (analytics_advanced dropped per §3; trips deferred). Each appears in the admin console.

| #   | Key                       | Display name                                 | Default | Category       | Dependencies (informational)                    |
| --- | ------------------------- | -------------------------------------------- | ------- | -------------- | ----------------------------------------------- |
| 1   | `admissions`              | Admissions & Applications                    | on      | academic       | finance (for admissions payments)               |
| 2   | `gradebook`               | Gradebook & Report Cards                     | on      | academic       | —                                               |
| 3   | `homework`                | Homework & Assignments                       | on      | academic       | —                                               |
| 4   | `sen`                     | Special Educational Needs                    | off     | academic       | —                                               |
| 5   | `finance`                 | Finance Management                           | on      | finance_ops    | —                                               |
| 6   | `payroll`                 | Payroll Management                           | on      | finance_ops    | —                                               |
| 7   | `budgeting`               | Budgeting & Financial Modeling               | on      | finance_ops    | finance                                         |
| 8   | `behaviour`               | Behaviour & Conduct                          | on      | people_care    | —                                               |
| 9   | `pastoral`                | Pastoral Care & Cases                        | on      | people_care    | —                                               |
| 10  | `staff_wellbeing`         | Staff Wellbeing                              | on      | people_care    | —                                               |
| 11  | `early_warning`           | Early Warning System                         | on      | people_care    | behaviour, pastoral, gradebook (signals)        |
| 12  | `communications_outbound` | Communications Outbound (SMS/email/WhatsApp) | on      | communications | —                                               |
| 13  | `parent_inquiries`        | Parent Inquiries                             | on      | communications | —                                               |
| 14  | `engagement`              | Events & Conferences                         | on      | communications | —                                               |
| 15  | `website`                 | Public Website                               | on      | communications | —                                               |
| 16  | `auto_scheduling`         | Automated Timetable Scheduling               | on      | operations     | —                                               |
| 17  | `leave`                   | Staff Leave Management                       | on      | operations     | payroll (cross-impact), auto_scheduling (cover) |
| 18  | `school_closures`         | School Closures Management                   | on      | operations     | —                                               |
| 19  | `ai_functions`            | AI-Powered Features                          | on      | operations     | —                                               |
| 20  | `compliance_advanced`     | Advanced Compliance & Regulatory Reporting   | off     | compliance     | —                                               |

### 5.2 Core modules (NEVER gateable; not in admin console)

These ~50 modules ship enabled for every tenant. They are listed here for clarity (so future contributors know NOT to add them to the registry).

**Foundational data + identity:** students, parents, households, staff-profiles, registration

**Academic structure:** academics, classes, rooms, period-grid, class-requirements, class-subject-requirements

**Schedule (read-side):** schedules, staff-availability, staff-preferences

**Operations:** attendance (base sessions; AI scan stays gated under ai_functions), approvals, inbox

**Identity / platform:** auth, rbac, audit-log, tenants, configuration, preferences, sequence

**UI / read surfaces:** dashboard, search, people-dashboard, imports, reports

**Infrastructure:** ai (Anthropic client; gating happens upstream via ai_functions), ai-flags, policy-engine, metrics, pdf-rendering, queue-admin, prisma, redis, s3, config, health

**Regulatory / legal (always-on for legal reasons):** gdpr, compliance (the core surface — DSAR, consent, privacy notices, retention, audit logs, sub-processors), security-incidents, regulatory (the core surface — leaves DES/TUSLA/PPOD/CBA submissions to compliance_advanced), safeguarding, child-protection, critical-incidents

**Stub / placeholder:** trips, pastoral-checkins, pastoral-dsar (sub-feature wrappers; not gateable on their own)

### 5.3 Deprecated keys (cleanup work)

| Old key                                                       | Disposition                                                                            | Implementation spec      |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `analytics`                                                   | Remove from seed; never enforced; reports gated by underlying module's view permission | 02-seed-data-corrections |
| `parent_inquiries` (separate `parent_inquiries` key as today) | Keep — it's already enforced and works                                                 | n/a                      |

---

## 6. Per-Module Current State Matrix

Synthesized from the deep-dive evidence (see `_evidence/`). For every gateable module, this table summarises today's enforcement state and the wave that brings it to ship-ready.

| Module                      | API today                                                       | Frontend today | Worker today    | Seed today                                            | Risk if disabled | Implementation wave                              |
| --------------------------- | --------------------------------------------------------------- | -------------- | --------------- | ----------------------------------------------------- | ---------------- | ------------------------------------------------ |
| **admissions**              | none (0/6)                                                      | none           | crons unguarded | in seed                                               | medium           | W3 — full enforcement                            |
| **gradebook**               | none (0/14)                                                     | none           | crons unguarded | in seed                                               | high             | W3 — full enforcement                            |
| **homework**                | none (0/6)                                                      | none           | crons unguarded | in seed                                               | medium           | W3 — full enforcement                            |
| **sen**                     | full (9/9)                                                      | nav not gated  | n/a (no crons)  | in seed (default off)                                 | low              | W2 — verify + fix nav                            |
| **finance**                 | none (0/13)                                                     | none           | crons unguarded | in seed                                               | high             | W3 — full enforcement                            |
| **payroll**                 | partial (6/7)                                                   | unverified     | crons unguarded | in seed                                               | high             | W2 — complete partial                            |
| **budgeting**               | none (0/11)                                                     | none           | crons unguarded | seed.ts but **MISSING from fixture**                  | medium           | W3 — full enforcement                            |
| **behaviour**               | full (18/18)                                                    | nav not gated  | full (3 crons)  | in seed                                               | high             | W2 — verify + fix nav                            |
| **pastoral**                | full (15/15)                                                    | nav not gated  | full            | in seed                                               | high             | W2 — verify + fix nav                            |
| **staff_wellbeing**         | full (6/6)                                                      | nav not gated  | partial         | in seed                                               | medium           | W2 — verify + fix nav                            |
| **early_warning**           | full (1/1)                                                      | none in nav    | full            | **MISSING from seed — currently 403 for all tenants** | high             | W1 — fix seed BEFORE enforcement reaches tenants |
| **communications_outbound** | partial (split needed)                                          | none           | partial         | in seed (under wrong key — needs split)               | high             | W2 — split + complete                            |
| **parent_inquiries**        | full (1/1)                                                      | nav not gated  | unguarded crons | in seed                                               | medium           | W2 — fix nav + cron guards                       |
| **engagement**              | partial (5/9)                                                   | none           | unguarded       | **MISSING from seed — currently 403 for all tenants** | high             | W1 — fix seed + complete coverage                |
| **website**                 | partial (2/4 — public correctly ungated)                        | none           | n/a             | in seed                                               | low              | W2 — frontend gate only                          |
| **auto_scheduling**         | none (0/13)                                                     | none           | crons unguarded | in seed (under `auto_scheduling` key)                 | high             | W3 — full enforcement                            |
| **leave**                   | none (0/2)                                                      | none           | n/a             | **NEW — not in seed**                                 | medium           | W4 — new toggle                                  |
| **school_closures**         | none (0/1)                                                      | none           | n/a             | **NEW — not in seed**                                 | low              | W4 — new toggle                                  |
| **ai_functions**            | partial (5 controllers via @RequiresAiFlag, 4 surfaces ungated) | partial        | unguarded       | in seed                                               | low-medium       | W2 — extend to ungated AI surfaces               |
| **compliance_advanced**     | none (split needed)                                             | none           | unguarded       | **NEW — not in seed**                                 | high (legal)     | W4 — new toggle + regulatory split               |

**Observations:**

- 8 modules need **W1** seed/migration fixes BEFORE anything else (`engagement`, `early_warning` currently completely blocked due to default-deny on missing rows; the foundation specs all need to land first).
- 6 modules are already fully API-enforced and only need **W2** frontend nav fixes + verification (`sen`, `behaviour`, `pastoral`, `staff_wellbeing`, plus payroll completion + ai_functions extension).
- 5 modules need **W3** full ground-up enforcement (`admissions`, `gradebook`, `homework`, `finance`, `auto_scheduling`).
- 3 modules need **W4** new-toggle creation (`leave`, `school_closures`, `compliance_advanced`).
- Communications gets its own W2 spec because the outbound/inbox split is non-trivial.

---

## 7. Disable Semantics

When a module is disabled for a tenant, the following invariants hold:

1. **API**: Every controller decorated `@ModuleEnabled(key)` returns `404 { code: 'MODULE_DISABLED', module: key }` for that tenant. This is intentionally indistinguishable from "endpoint doesn't exist" externally. Tenant operators using their own automation get a clear `code` field they can handle.
2. **Frontend nav**: Every nav entry whose `moduleKey === key` is hidden. The morph-shell sub-strip skips disabled hubs. The mobile overlay nav skips them too.
3. **Frontend pages**: Direct navigation to a disabled module's route hits the page's gating layer (`useModuleEnabled` check in the layout) and redirects to `/[locale]/disabled?module=<key>`.
4. **Frontend embeds**: `<IfModuleEnabled module={key}>` returns `null`.
5. **Worker crons**: Per-tenant fan-out skips this tenant for any job whose module is disabled. The skip is logged at `info` level for observability.
6. **Worker jobs (event-driven)**: The processor checks at the top of `process()` and silently `return`s if the tenant's module is disabled. Job is acked as success (not failed).
7. **Notifications**: The notification dispatcher consults the catalogue + the tenant's enabled modules. Notifications whose `template_key` is associated with a disabled module are not enqueued (the announcement controller never reaches dispatch in the first place because it's @ModuleEnabled-gated).
8. **Data**: All existing data is preserved. No deletions, no anonymisation, no archival. The data is invisible to the API but readable via direct DB inspection. Re-enabling restores immediate access.
9. **Public/external endpoints** (Stripe webhooks, Resend webhooks, public website, public-admissions, public-contact) ALWAYS respond, regardless of module state. They handle the disabled state internally:
   - Stripe webhook: ack 200, log "tenant has finance disabled, dropping payment event ID X". Idempotency preserved (event won't retry).
   - Resend/Twilio webhooks: same pattern — ack, log, no-op.
   - Public website pages: render normally if data exists. Gating only hides admin UI for the website module.
   - Public admissions form: continues to accept submissions. The `applications` table fills up. When the admin re-enables admissions, the new submissions are visible.

### What disable does NOT do

- It does NOT delete or archive data.
- It does NOT cancel in-flight database transactions.
- It does NOT revoke API tokens.
- It does NOT send a notification to users (except the in-session toast on next request).
- It does NOT propagate to dependent modules. Disabling `finance` does NOT auto-disable `budgeting` even though budgeting depends on finance — the admin must explicitly disable both. The `depends_on` field in the registry is informational only and may surface as a UI warning ("Disabling finance will leave budgeting in a broken state — also disable?") but the admin has the final say.

---

## 8. Mid-Session Behaviour

This is its own section because it's the trickiest UX surface.

**Scenario A: Admin disables module while user is on its page**

1. User is on `/school/behaviour/incidents/abc123` editing an incident.
2. Admin flips `behaviour` off in the platform admin console.
3. User clicks "Save" → API returns `404 { code: 'MODULE_DISABLED', module: 'behaviour' }`.
4. Frontend axios interceptor catches `MODULE_DISABLED`, shows toast for 2 seconds, redirects to `/disabled?module=behaviour`.
5. The user's edit is lost. Acceptable trade-off (rare event; admin decision is intentional).

**Scenario B: Admin re-enables module while user is on the disabled landing page**

1. User is on `/disabled?module=behaviour`.
2. Admin re-enables behaviour.
3. The Redis pub/sub invalidation fires; the user's session has subscribed (via existing socket pattern). User's nav refetches `/me`, sees behaviour back, the disabled page shows "Feature has been re-enabled — click here to return."
4. User clicks, returns to morph-shell home (NOT to the previous deep-link, since they may have lost context).

**Scenario C: Background tab — user is logged in but inactive**

1. Module is disabled.
2. User wakes up the tab 10 minutes later.
3. Stale session: nav still shows the disabled hub.
4. User clicks the disabled hub → page loads → API call to fetch data returns `MODULE_DISABLED` → redirect.
5. Acceptable; the redirect is the recovery.

**Scenario D: Worker mid-job for the disabled tenant**

1. A `gradebook:report-card-generation` job is mid-flight for tenant T.
2. Admin disables gradebook for T.
3. The in-flight job completes (we don't kill it). The PDF is rendered. The notification is enqueued.
4. The notification's `gradebook` linkage is checked at dispatch time → notification is dropped (not sent).
5. The PDF sits in S3, orphaned. This is acceptable. It can be cleaned up by a periodic janitor job (out of scope for this spec).

**Anti-pattern we are NOT doing:** killing in-flight requests/jobs/transactions. That introduces partial-state bugs. Disable is forward-looking only.

---

## 9. Migration Plan for Existing Tenants

There are 5 production tenants today: NHQS + 4 stress-test tenants (stress-a/b/c/d). All are pre-launch test tenants per the "production tenants are test tenants until August 2026" memory. None are real customers yet.

### 9.1 Pre-flight (before any new gating ships)

Before any new enforcement spec lands, the seed must be airtight for all currently-enforced modules so existing tenants don't lose access. This is **W1 — Foundational Wave**:

1. Add the 20 canonical keys to `MODULE_REGISTRY` in `packages/shared/src/modules/registry.ts`.
2. Add a Prisma migration that backfills `tenantModule` rows for every tenant × every gateable key (using `default_enabled` from the registry). Idempotent: skipDuplicates.
3. The migration also REMOVES any `tenantModule` rows for keys that are no longer in the registry (e.g., the deprecated `analytics` key).
4. After migration, every tenant has exactly 20 `tenantModule` rows, one per gateable key.

Without this, the missing-row default-deny behaviour means new enforcement instantly breaks tenants. With this, every new `@ModuleEnabled(key)` decorator finds a row to consult and behaves correctly.

### 9.2 Default preset for existing tenants

Per §5.1, all 20 modules default to ON except `sen` and `compliance_advanced` (default OFF). The migration backfill respects these defaults.

For NHQS specifically: per the user's confirmation that they're a pilot, default ON for everything makes sense — they'll see the full product surface. If they want to turn things off, the admin console (when shipped) lets them.

For stress-a/b/c/d: same default preset. These are synthetic; the values don't matter as long as they're consistent.

### 9.3 Per-wave migration safety

Each enforcement wave (W2–W4) ships per-module. Before each module's gating goes live, two pre-checks:

1. The module's `tenantModule` row exists for every tenant (verify via a one-off SQL count assertion in the deploy script).
2. The default value in the registry matches what the module's existing tenants currently expect (check NHQS specifically; if they wouldn't expect this feature, default-OFF in registry).

If either check fails, the wave is rolled back without going live.

### 9.4 No legacy-tenant special cases

We do NOT add special-case logic ("if tenant_id == nhqs, ignore module gating"). Every tenant goes through the same enforcement pipeline. The migration backfill is the only place tenant-specific defaults live.

---

## 10. Test Contract

Every gated module must satisfy three test categories before it ships:

### 10.1 Unit / integration

Per gated controller:

- One test verifying the happy path with module enabled (existing tests cover this).
- One new test verifying `404 { code: 'MODULE_DISABLED' }` when the tenant's module is disabled.
- The disabled-state test goes in the controller's existing `*.controller.spec.ts` (co-located, per project convention).

### 10.2 Module gating leakage (RLS-style)

Per gateable module, in `apps/api/test/module-gating-leakage.e2e-spec.ts` (a new shared e2e spec):

```ts
describe('Module gating leakage — <module_key>', () => {
  it('returns 404 MODULE_DISABLED when module is disabled', async () => {
    // Provision tenant with module disabled
    // Authenticate as that tenant's school_owner
    // For each surface this module exposes (sample 2-3 endpoints), assert 404
  });

  it('returns happy-path responses when re-enabled', async () => {
    // Toggle the module ON
    // Same surfaces should now return 200
  });
});
```

This is the gating equivalent of the RLS leakage tests already running. It catches "I added the decorator but forgot to import the guard" class bugs.

### 10.3 Frontend nav coverage

Per gateable module, in `apps/web/src/__tests__/module-gating/nav-filter.spec.ts`:

```ts
describe('Nav filter — <module_key>', () => {
  it('hides the module hub when disabled', async () => {
    // Render morph-shell with mocked /me returning enabled_modules without this key
    // Assert that no nav entry referencing this module renders
  });
});
```

### 10.4 Worker job coverage

Per gateable cron-dispatcher (or per worker that handles this module):

```ts
describe('Worker — <processor>', () => {
  it('skips tenants whose <module> is disabled', async () => {
    // Seed two tenants — one with module on, one off
    // Trigger the cron-dispatch
    // Assert: only the enabled tenant gets a per-tenant job enqueued
  });
});
```

---

## 11. Rollout Plan / Phases

### Wave W1 — Foundation (must land first; blocks all later waves)

| Spec | What ships                                                                                                                       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Canonical module registry constant in `packages/shared/`; types; descriptions; default values                                    |
| 02   | Seed data corrections + migration backfill for all existing tenants                                                              |
| 03   | API enforcement layer improvements (guard typing, response shape change, missing-row docs)                                       |
| 04   | Frontend gating system: `useModuleEnabled` hook, `IfModuleEnabled` component, `/me` endpoint extension, `/disabled` landing page |
| 05   | Worker gating layer: `TenantModuleService.isEnabled()` helper, cron-dispatch tenant-skip pattern, job-level guard pattern        |
| 06   | Redis cache + pub/sub invalidation on toggle                                                                                     |
| 07   | Test contract files: shared module-gating leakage e2e spec scaffold; nav filter test scaffold; worker test scaffold              |
| 08   | Documentation pass: feature-map gets a "Gateable" column; danger-zones DZ-MG-1/2; pre-flight checklist additions                 |

W1 ships in 1 PR (or 8 sequential commits) — **no enforcement changes yet**, only infrastructure. After W1, the system is ready for per-module work without breaking anything.

### Wave W2 — Verification + completion (currently-enforced modules)

| Spec | What ships                                                                                                                                                                  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 09   | Communications split: extract `communications_outbound` toggle from `communications` key; rewire announcements/templates/dispatch processors; keep inbox core               |
| 10   | Already-enforced verification: pastoral, behaviour, sen, staff_wellbeing — verify completeness, fix frontend nav, add tests                                                 |
| 11   | Partial-enforcement completion: payroll missing controller, parent_inquiries cron guards, ai_functions extend to ungated AI surfaces, website public/admin split documented |

W2 ships per spec, sequentially. Each spec ends with deploy + production verification.

### Wave W3 — Full enforcement pass (dead-toggle modules)

| Spec | What ships                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 12   | Admissions full enforcement (6 controllers + 4 cron processors + frontend)                                                           |
| 13   | Gradebook full enforcement (14 controllers + 5 cron processors + frontend; largest spec)                                             |
| 14   | Finance full enforcement (13 controllers + 4 worker processors + frontend; second-largest spec)                                      |
| 15   | Homework full enforcement (6 controllers + 5 cron processors + frontend)                                                             |
| 16   | Auto-scheduling full enforcement (13 controllers + worker processors + frontend); includes EXAM_SCHEDULING + cp-sat sidecar          |
| 17   | Compliance/regulatory split: gate DES/TUSLA/PPOD/CBA under `compliance_advanced`; keep core compliance/regulatory surfaces always-on |

W3 ships per spec, parallelisable across implementing sessions if multiple are dispatched.

### Wave W4 — New toggles

| Spec | What ships                                                         |
| ---- | ------------------------------------------------------------------ |
| 18   | New toggle: `leave` (controllers, frontend, seed, tests)           |
| 19   | New toggle: `school_closures` (controllers, frontend, seed, tests) |
| 20   | Trips placeholder cleanup + analytics ghost-key removal            |

### Wave W5 — Closure

| Spec | What ships                                                                                                                                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 21   | Migration runbook for existing tenants: confirm each tenant has all 20 `tenantModule` rows post-W1, audit-log the initial state, document rollback                                                                                            |
| 22   | Admin console handoff spec: hands off to the platform admin dashboard team (or the next session) with a clean foundation. Documents the API surface for toggling, the `/me` payload, the audit-log schema, the disabled landing page contract |

---

## 12. Implementation Index

Status legend (mirrors `New Languages/IMPLEMENTATION_LOG.md`):

- ⏳ planned — spec exists, not started
- 🚧 in progress
- ✅ shipped (committed, deployed, verified on production)
- ❌ blocked / requires decision

| #   | Spec                                                                                             | Wave | Status | Depends on |
| --- | ------------------------------------------------------------------------------------------------ | ---- | ------ | ---------- |
| 01  | [Canonical module registry](implementations/01-canonical-module-registry.md)                     | W1   | ⏳     | —          |
| 02  | [Seed data corrections + migration](implementations/02-seed-data-corrections.md)                 | W1   | ⏳     | 01         |
| 03  | [API enforcement layer](implementations/03-api-enforcement-layer.md)                             | W1   | ⏳     | 01         |
| 04  | [Frontend gating system](implementations/04-frontend-gating-system.md)                           | W1   | ⏳     | 01, 03     |
| 05  | [Worker gating layer](implementations/05-worker-gating-layer.md)                                 | W1   | ⏳     | 01, 03     |
| 06  | [Redis cache + invalidation](implementations/06-redis-cache-invalidation.md)                     | W1   | ⏳     | 03, 04, 05 |
| 07  | [Test contract](implementations/07-test-contract.md)                                             | W1   | ⏳     | 01–06      |
| 08  | [Documentation pass](implementations/08-documentation-pass.md)                                   | W1   | ⏳     | 01–07      |
| 09  | [Communications split](implementations/09-communications-split.md)                               | W2   | ⏳     | W1         |
| 10  | [Already-enforced verification](implementations/10-already-enforced-verification.md)             | W2   | ⏳     | W1         |
| 11  | [Partial-enforcement completion](implementations/11-partial-enforcement-completion.md)           | W2   | ⏳     | W1         |
| 12  | [Admissions full enforcement](implementations/12-admissions-full-enforcement.md)                 | W3   | ⏳     | W1         |
| 13  | [Gradebook full enforcement](implementations/13-gradebook-full-enforcement.md)                   | W3   | ⏳     | W1         |
| 14  | [Finance full enforcement](implementations/14-finance-full-enforcement.md)                       | W3   | ⏳     | W1         |
| 15  | [Homework full enforcement](implementations/15-homework-full-enforcement.md)                     | W3   | ⏳     | W1         |
| 16  | [Auto-scheduling full enforcement](implementations/16-auto-scheduling-full-enforcement.md)       | W3   | ⏳     | W1         |
| 17  | [Compliance / regulatory split](implementations/17-compliance-regulatory-split.md)               | W3   | ⏳     | W1         |
| 18  | [New toggle: leave](implementations/18-new-toggle-leave.md)                                      | W4   | ⏳     | W1         |
| 19  | [New toggle: school_closures](implementations/19-new-toggle-school-closures.md)                  | W4   | ⏳     | W1         |
| 20  | [Trips placeholder + analytics ghost-key cleanup](implementations/20-trips-analytics-cleanup.md) | W4   | ⏳     | W1         |
| 21  | [Migration runbook for existing tenants](implementations/21-migration-runbook.md)                | W5   | ⏳     | W1–W4      |
| 22  | [Admin console handoff spec](implementations/22-admin-console-handoff.md)                        | W5   | ⏳     | W1–W4      |

---

## 13. Risks & Mitigations

| Risk                                                                                                                                             | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1 migration backfill misses a tenant; that tenant gets 403 on existing modules they were using                                                  | medium     | high   | Migration script writes a verification SQL count at the end (`SELECT COUNT(*) FROM tenant_modules WHERE tenant_id=$1` must equal 20 for every tenant). Deploy aborts if any tenant has fewer rows.                                                    |
| Frontend nav cache doesn't invalidate on toggle, user sees stale state                                                                           | medium     | low    | Pub/sub invalidation pattern (§4.5) — already battle-tested via comms-cache-bus. New code reuses it.                                                                                                                                                  |
| @ModuleEnabled decorator added to a controller but ModuleEnabledGuard not in @UseGuards — silent unguarded endpoint                              | high       | high   | Add a unit test in W1 spec 07 that scans every controller file: if @ModuleEnabled is present, ModuleEnabledGuard MUST be in @UseGuards. Lint-style enforcement.                                                                                       |
| W3 specs touching gradebook/finance/scheduling have huge surface area; risk of partial enforcement                                               | high       | medium | Each W3 spec ends with an Acceptance section that requires running `module-gating-leakage.e2e-spec.ts` for that specific module's key. Failures block merge.                                                                                          |
| Stripe webhook acks but tenant has finance disabled — Stripe data orphaned                                                                       | low        | medium | Document the orphan-data behaviour in §7 + DZ-MG-3 (created in spec 08). Operations team has visibility via the `info`-level skip log.                                                                                                                |
| Communications split breaks notification dispatch for some surface (e.g., a notification template references the wrong key)                      | medium     | high   | W2 spec 09 includes a notification-key audit: every existing notification's template must be re-categorised explicitly under `communications_outbound` or core. Test contract verifies that disabling outbound stops the relevant notification types. |
| Admin enables `compliance_advanced` for a tenant but they're not in Ireland/UK and try to submit DES — 404 from external service or invalid data | low        | medium | The compliance_advanced UI in the admin console (W5 spec 22) shows a jurisdiction warning. The DES submission service has its own validation that rejects non-IE tenants.                                                                             |
| User on a disabled module's page sees the redirect for an instant before content unmounts (flash)                                                | low        | low    | The page guard runs in the layout, before the page renders. No flash if implemented in the layout, not the page.                                                                                                                                      |

---

## 14. Out of Scope

To keep this work shippable, the following are explicitly NOT included:

- **Plans / tiers** (Standard/Pro/Enterprise). Flat per-tenant toggles only. If we ever need plans, that's its own spec.
- **Time-bounded toggles** (free trial, beta access). Toggles are immediate and persistent.
- **Granularity finer than module level**. Per-feature flags are out. The existing `tenant_ai_flag` table is the one exception (it pre-dates this work and stays).
- **Auto-disable of dependent modules**. Disabling `finance` does not auto-disable `budgeting`. The `depends_on` field is a UI hint only.
- **Per-user feature flags**. This is tenant-level only.
- **Admin console UI itself**. That's spec 22's job to hand off cleanly. The actual UI design (tabs, layouts, search, bulk operations) is the platform admin dashboard team's work.
- **Billing / metering** of toggled features. No "you used Gradebook for 30 days, here's the bill." Out of scope until billing is real.
- **Feature toggles for newly-shipped non-modular features** (e.g., a single new dashboard widget). Those go through normal release; if they need gating later, add as a module-level toggle then.
- **GraphQL or new APIs for the admin console**. Existing REST + JWT auth pattern stays. Admin console uses the existing `/v1/admin/tenants/:id/modules/toggle` endpoint with auth via `platform_owner` role.

---

## 15. Glossary

See [glossary.md](glossary.md) for terms (module key, gateable, enforcement layer, default-deny, tenant module, etc.).

---

## 16. References

- Brainstorming conversation: 2026-05-13 session
- Deep-dive evidence: `_evidence/batch-1` through `_evidence/batch-6` in this folder
- Related architecture docs: `docs/architecture/feature-map.md`, `docs/architecture/module-blast-radius.md`, `docs/architecture/danger-zones.md`, `docs/architecture/pre-flight-checklist.md`
- Platform admin dashboard spec (consumes this work): `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`
- Existing per-tenant module data model: `packages/prisma/schema.prisma` (`TenantModule` model)
- Existing guard: `apps/api/src/common/guards/module-enabled.guard.ts`
- Existing decorator: `apps/api/src/common/decorators/module-enabled.decorator.ts`
- Existing fixture seed: `apps/api/test/tenant-fixture.builder.ts` (`MODULE_KEYS` constant)
