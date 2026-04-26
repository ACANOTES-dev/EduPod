# Wellbeing Module Rebuild — Master Plan

> **Status:** Plan locked. Implementation split into **24 tasks across 7 waves**. See `IMPLEMENTATION_LOG.md` for execution order, hardened parallelisation rules, and per-wave deployment matrix.
>
> **Source-of-truth audit (read alongside this plan):**
>
> - `.claude/tmp/wellbeing-audit/SYNTHESIS.md`
> - `.claude/tmp/wellbeing-audit/backend-report.md`
> - `.claude/tmp/wellbeing-audit/playwright-walkthrough.md`

---

## 1. Why we're building this

Wellbeing is **the largest feature surface in the codebase** — five backend modules, 245+ endpoints, 68 Prisma tables, 29 background jobs, ~65 frontend pages — and roughly half of it is dark in the UI. The backend has shipped behaviour AI parsing, document generation lifecycle, statutory exclusion workflow, guardian restrictions, parent acknowledgement tracking, amendment notices, pastoral DSAR, safeguarding break-glass, critical-incident response plans, SST agenda AI, recognition wall + house leaderboard, policy engine ops, and admin data repair. Almost none of it is reachable from the UI today. On top of that, eight pages crash, twenty endpoints are wrong or missing, the entire `behaviour.*` translation namespace is absent, the `/wellbeing` landing returns 404, and the morph-bar Wellbeing pill silently lands users on a broken `/behaviour` page.

This rebuild closes the gap. The goal is **a flagship-grade wellbeing module — every page so polished and indispensable that school admins can't go a few hours without interacting with it.** Every hidden feature gets a surface. Every broken page gets fixed. Every silent error gets an honest one. Every translation key has both English and Arabic. Every page is verified live via Playwright before it ships.

This is **not an MVP**. The user has explicitly stated it represents a complete deliverable for the largest module in the platform, and that this is the only focus until done.

## 2. The shape of the new wellbeing module

### 2a. The wellbeing super-hub

A single new top-level dashboard at `/wellbeing` that **replaces the current sub-strip pattern** entirely. The morph-bar Wellbeing pill drops users into a **WOW-grade landing**, and from there they navigate via hub tiles. There is no morph-bar sub-strip cascading from Wellbeing — the page itself is the navigation surface, identical in pattern to `/people`, `/finance`, `/operations`, `/learning`.

**Layout (top to bottom), copying the `/people` template:**

1. **Page header** — title (`Wellbeing & Safeguarding`) + descriptive line. Hard role: any staff role.
2. **Pending-attention banner** — surfaces SLA-breached safeguarding concerns, overdue interventions, unacknowledged criticals, pending appeals, awaiting-parent-meetings. Renders only when there are items.
3. **KPI strip** — four `KpiTile` cards in a 4-column responsive grid, sourced from the new `/api/v1/wellbeing/dashboard-summary` endpoint:
   - Students at risk (early-warning amber+red count)
   - Open behaviour incidents
   - Open pastoral cases
   - Overdue actions (sanctions + tasks + SLA breaches)
4. **Quick actions** — four `QuickAction` pills in a 4-column responsive grid:
   - Log Incident → `/behaviour/incidents/new`
   - Log Concern → `/pastoral/concerns/new`
   - Declare Critical Incident → `/pastoral/critical-incidents/new`
   - Open Pastoral Case → `/pastoral/cases/new`
5. **Hub navigation cards** — six large cards in a 2-column responsive grid (3-col on `xl`):
   - **Behaviour** — danger gradient, Shield icon → `/behaviour`
   - **Pastoral** — rose gradient, Heart icon → `/pastoral` (existing page, untouched)
   - **Safeguarding** — slate gradient, ShieldAlert icon → `/safeguarding` (new sub-hub)
   - **Early Warnings** — amber gradient, AlertTriangle icon → `/early-warnings` (flagship sub-hub)
   - **Staff Wellbeing** — violet gradient, Users icon → `/wellbeing/staff` (folded sub-hub)
   - **Settings & Policies** — slate gradient, Cog icon → `/settings/behaviour-general` (admin only)
6. **Recent activity feed** — last 8 wellbeing-relevant events (incidents, concerns, acknowledgements, escalations) with type badges and timestamps.
7. **Resource ribbon** — small section linking to support resources, EAP, training docs (admin/teacher only, hidden if no resources configured).

Hub tiles **filter by module flag** — if `behaviour` is disabled for the tenant, the Behaviour card hides. Tiles also **filter by role** — Staff Wellbeing card hides for parents/students.

Hub tiles render **dynamic counters** as small badges (per the `/operations` Admissions card pattern). Counter source: the same dashboard-summary endpoint. Tiles **animate in on load** with a subtle stagger (60ms intervals). Hover state: lift + glow + accent-bar pulse. Each tile carries a `tooltip` (Radix tooltip) with a one-sentence description of what's behind it.

### 2b. The four sub-hubs

Each of the four wellbeing sub-modules gets its own flagship dashboard, modelled on the same pattern as `/wellbeing` but scoped:

- `/behaviour` — KPI strip (incidents today, positive:negative ratio, open tasks, overdue, recognition points awarded), quick actions (log, parse with AI, generate document, open analytics), hub cards for Incidents, Sanctions, Exclusions, Appeals, Recognition, Documents, Tasks, Alerts, Amendments, Guardian Restrictions, Analytics, AI Analytics. Recent activity feed.
- `/wellbeing/staff` — folded super-hub replacing five separate routes. Top-level KPIs (avg teaching load, cover fairness Gini, timetable quality, substitution pressure), quick actions (launch survey, generate board report, view EAP), and four sections accessible via internal navigation cards or in-page anchors:
  - My Workload (staff's own)
  - Aggregate Dashboard (admin)
  - Surveys & Responses (admin)
  - Board Report + Resources
- `/early-warnings` — **flagship treatment**. KPI strip (students at amber, students at red, new flags this week, interventions triggered), at-risk student list with risk-tier badges, indicator drill-down (attendance / grades / behaviour / wellbeing / engagement domains), cohort analysis charts (year group, class, gender, demographic), settings access. AI narrative engine ("Of the 14 amber students this week, 9 are concentrated in Year 5; the dominant indicator is attendance below 85%"). Trend over time. Intervention triggering UI.
- `/safeguarding` — separate sub-hub from pastoral. KPI strip (open concerns, SLA breaches, critical concerns awaiting acknowledgement, sealed records this year), quick actions (report concern, view my reports, request break-glass, run after-action review), hub cards for Concerns / My Reports / Sealed records / Break-glass grants / SLA dashboard / Settings. Privacy banner + tier-3 access control note.

### 2c. Pastoral stays untouched

`/pastoral` keeps its current internal tab strip and sub-pages intact. The wellbeing super-hub links to it via a Pastoral hub tile. Pastoral's design is the only bright spot in the current wellbeing umbrella; the rebuild does not modify it. (One exception: the `/pastoral/checkins` crash fix in Wave 4 is a defensive null-guard that does not change the page's appearance.)

## 3. Backend architecture

### 3a. Module map

The five existing NestJS modules stay in place:

- `apps/api/src/modules/behaviour/` (120+ endpoints, 25 tables, 15 jobs)
- `apps/api/src/modules/pastoral/` (65+ endpoints, 20 tables, 8 jobs)
- `apps/api/src/modules/safeguarding/` (22 endpoints, 4 tables, 6 jobs) — currently folded into pastoral, surfaced by this rebuild
- `apps/api/src/modules/early-warning/` (8 endpoints, 3 tables)
- `apps/api/src/modules/staff-wellbeing/` (30+ endpoints, 5 tables) — currently 404ing, repaired by this rebuild

This rebuild **adds three new pieces** on top of the existing surface:

1. `apps/api/src/modules/wellbeing-aggregate/` — a thin aggregate module that owns `/api/v1/wellbeing/dashboard-summary`. It cross-queries the five module services to compose the super-hub's KPI strip + recent activity + pending-attention banner. No tables of its own; depends on read access to incidents, concerns, cases, early-warning flags, sanctions, tasks, safeguarding SLA state.
2. `apps/api/src/modules/ai-flags/` — tenant-level AI feature gating. One table (`tenant_ai_flags`), one service, one decorator (`@RequiresAiFlag('behaviour')`) used on every AI endpoint to short-circuit with `403 AI_DISABLED` when the tenant has the flag off.
3. `apps/api/src/modules/wellbeing-notifications/` — a thin orchestration layer that maps wellbeing events (incident logged, concern raised, sanction served, SLA breached, etc.) to per-tenant channel preferences (in-app default + optional email/SMS/WhatsApp). Does not implement provider delivery — that work is deferred. This layer wires the in-app channel solidly and stubs the rest with provider interfaces ready to be filled in.

### 3b. The dashboard-summary contract

Single endpoint, single payload:

```ts
GET / api / v1 / wellbeing / dashboard - summary;

Response: {
  data: {
    kpis: {
      students_at_risk: {
        amber: number;
        red: number;
        total: number;
      }
      open_incidents: {
        total: number;
        positive: number;
        negative: number;
      }
      open_pastoral_cases: number;
      overdue_actions: {
        sanctions: number;
        tasks: number;
        sla_breaches: number;
        total: number;
      }
    }
    pending_attention: Array<{
      kind:
        | 'sla_breach'
        | 'overdue_intervention'
        | 'unack_critical'
        | 'pending_appeal'
        | 'awaiting_parent_meeting';
      severity: 'critical' | 'high' | 'medium';
      title: string; // localised
      detail: string; // localised
      href: string; // deep link
      due_at?: string; // ISO timestamp
      count?: number; // for grouped items
    }>;
    hub_counts: {
      // dynamic counters per hub tile
      behaviour: number;
      pastoral: number;
      safeguarding: number;
      early_warnings: number;
      staff_wellbeing: number;
    }
    recent_activity: Array<{
      id: string;
      kind:
        | 'incident'
        | 'concern'
        | 'acknowledgement'
        | 'escalation'
        | 'sanction_served'
        | 'recognition';
      title: string;
      actor_name: string | null;
      occurred_at: string;
      href: string;
    }>;
  }
}
```

Implementation lives in `WellbeingAggregateService.getDashboardSummary(tenantId, userId)`. It runs the five sub-queries in parallel (`Promise.allSettled`), tolerates per-module failures (a failing sub-query yields zero counts and a logged warning, never a 500). Module-flag-disabled sources contribute zero counts.

### 3c. AI flag model

One table:

```prisma
model TenantAiFlag {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id  String   @db.Uuid
  module_key String   // 'behaviour' | 'pastoral' | 'staff_wellbeing' | 'early_warning' (matches module flag keys)
  enabled    Boolean  @default(false)
  updated_at DateTime @default(now()) @updatedAt @db.Timestamptz()
  updated_by String?  @db.Uuid

  @@unique([tenant_id, module_key])
  @@index([tenant_id])
}
```

Default state: all module AI flags **off** at tenant create. Owner/principal toggles them in a new admin page. Decorator `@RequiresAiFlag('behaviour')` short-circuits with `ForbiddenException({ code: 'AI_DISABLED', message: 'AI features for behaviour are disabled for this tenant' })` when off.

AI flag **gates all of:** `POST /behaviour/incidents/ai-parse`, `GET /behaviour/students/:id/ai-summary`, `POST /behaviour/analytics/ai-query`, `POST /pastoral/sst/meetings/:id/agenda/refresh`, and any future AI endpoints.

### 3d. Notification channel model

In-app is **always on** for wellbeing notifications — every event creates an in-app inbox entry for relevant recipients. The per-tenant channel preference table extends an existing `tenant_notification_preferences` row (or creates the table if missing) with a `wellbeing_channels` JSONB column shaped:

```ts
{
  defaults: { email: false, sms: false, whatsapp: false }, // tenant-wide default
  overrides: {
    [eventKey: string]: {
      email?: boolean;
      sms?: boolean;
      whatsapp?: boolean;
    };
  };
}
```

Event keys: `incident.logged`, `incident.escalated`, `concern.raised`, `concern.acknowledged`, `sanction.scheduled`, `sanction.served`, `sla.breach`, `critical.declared`, `appeal.submitted`, `recognition.awarded`, etc.

The `WellbeingNotificationsService.dispatch(event, recipients)` method:

1. Always writes in-app inbox rows.
2. Looks up per-event channel preference (override → default → false).
3. Enqueues outbound jobs to the email/SMS/WhatsApp providers if their respective preference is true.
4. Provider implementations are **scaffolded** — they emit a `NotImplementedException` with `{ code: 'PROVIDER_NOT_WIRED' }` and a structured log line. The user will harden them in a later pass.

## 4. Frontend architecture

### 4a. Routing changes

```
apps/web/src/app/[locale]/(school)/
├── wellbeing/
│   ├── page.tsx                   ← NEW: super-hub
│   ├── staff/
│   │   ├── page.tsx               ← NEW: folded staff super-hub
│   │   └── _components/           ← internal sections
│   ├── dashboard/page.tsx         ← REDIRECT to /wellbeing/staff#aggregate
│   ├── my-workload/page.tsx       ← REDIRECT to /wellbeing/staff#my
│   ├── surveys/                   ← MOVED into _components, kept routable for deep-link compat
│   ├── reports/page.tsx           ← REDIRECT to /wellbeing/staff#board-report
│   └── resources/page.tsx         ← REDIRECT to /wellbeing/staff#resources
├── behaviour/
│   ├── page.tsx                   ← REWRITTEN: flagship sub-hub (replaces Behaviour Pulse)
│   └── ...                        ← all existing sub-pages kept
├── safeguarding/
│   ├── page.tsx                   ← REWRITTEN: flagship sub-hub (replaces redirect)
│   ├── concerns/                  ← preserved (was redirecting to /pastoral/concerns)
│   └── my-reports/page.tsx        ← preserved
├── early-warnings/
│   ├── page.tsx                   ← REWRITTEN: flagship sub-hub
│   └── ...                        ← cohort + settings preserved + new indicator-config page
└── pastoral/                      ← UNTOUCHED
```

### 4b. Nav-config changes

`apps/web/src/lib/nav-config.ts`:

- `hubSubStripConfigs.wellbeing = []` (remove the sub-strip entirely)
- `hubConfigs[wellbeing].basePaths` stays the same (still highlights for `/behaviour`, `/pastoral`, `/wellbeing`, `/sen`, `/early-warnings`, `/safeguarding`)
- The morph-bar Wellbeing pill resolves to `/wellbeing` (the new super-hub) instead of falling through to `/behaviour`
- Settings hub gets new sub-hub entries for AI flags page

### 4c. Component reuse

The rebuild **reuses** existing components — no new design system:

- `KpiTile` from `apps/web/src/app/[locale]/(school)/people/_components/dashboard-parts.tsx` (extracted into a generic location for cross-module reuse — `apps/web/src/components/kpi-tile.tsx`)
- `CardSkeleton` — same extraction
- Hub-tile pattern — copied from `/people/page.tsx` lines 450–488
- `QuickAction` pattern — copied from `/finance/page.tsx` lines 103–132
- `PageHeader` from `@/components/page-header`
- All Tailwind tokens from the design system in `docs/plans/ux-redesign-final-spec.md`

### 4d. Translation keys

Three new top-level namespaces land in `messages/en.json` and `messages/ar.json`:

- `wellbeingHub.*` — super-hub strings
- `wellbeingStaff.*` — folded staff sub-hub strings
- `safeguardingHub.*` — safeguarding sub-hub strings
- `earlyWarnings.*` — extends existing keys with flagship additions
- `behaviourHub.*` — new sub-hub strings (separate from existing `behaviour.*` namespace)

The existing missing-translation storm (`behaviour.*`, `behaviourSettings.*`) gets backfilled exhaustively in Wave 4.

## 5. Default behaviour categories (seeded on tenant create)

Twenty-eight categories shipped as defaults, balanced across positive and negative, mapped to severity tiers:

**Negative — minor (1 point):** Lateness, Uniform infringement, Phone use, Out of bounds, Disruption (low), Missed homework, Disrespect (low)
**Negative — moderate (3 points):** Disruption (sustained), Defiance, Bullying (verbal), Lying / dishonesty, Damage to property (minor), Inappropriate language
**Negative — major (5 points):** Bullying (physical / cyber), Theft, Fighting, Drug-related concern, Major damage, Discrimination / harassment, Weapons-related concern
**Positive — minor (1 point):** Effort, Helpfulness, Punctuality, Participation
**Positive — moderate (3 points):** Outstanding work, Leadership, Kindness, Improvement
**Positive — major (5 points):** Exceptional achievement, Acts of integrity, Community contribution

Each category has an icon, a severity, a default points value, a flag for whether to require parent acknowledgement, a flag for whether to auto-create a pastoral concern, and a flag for whether it converts to a safeguarding concern by default. Tenants can edit, deactivate, or add their own; the seed gives them a working baseline so no admin is staring at "no categories configured" on day one.

## 6. Permissions

The rebuild does **not** introduce new role-pair grids. It uses the existing `behaviour.*`, `pastoral.*`, `safeguarding.*`, `early_warning.*`, `staff_wellbeing.*` permission scopes. New permissions added:

- `ai_flag.manage` — gates the AI flags admin page (owner + principal)
- `wellbeing.view_dashboard` — gates `/wellbeing` super-hub (any staff role)
- `safeguarding.dedicated_view` — gates the new `/safeguarding` sub-hub (designated safeguarding lead + owner + principal + VP)
- `wellbeing_notifications.configure` — gates the notification channel preferences in tenant settings (owner + principal)

All existing permission decorators on the surfaced hidden endpoints are preserved unchanged.

## 7. Wave breakdown (summary)

Full wave structure with parallelisation rules, dependencies, and deployment matrix lives in `IMPLEMENTATION_LOG.md` §3. Summary:

| Wave | Theme                                    | Mode               | Impls                  |
| ---- | ---------------------------------------- | ------------------ | ---------------------- |
| 1    | Schema foundation                        | serial             | 01                     |
| 2    | Backend stop-the-bleeding                | parallel-safe      | 02, 03, 04             |
| 3    | Backend hidden-capability surfacing      | parallel-safe      | 05, 06, 07, 08, 09     |
| 4    | Frontend stop-the-bleeding               | **parallel-risky** | 10, 11, 12             |
| 5    | New super-hub + four sub-hubs + AI admin | **parallel-risky** | 13, 14, 15, 16, 17, 18 |
| 6    | Frontend hidden-capability surfacing     | **parallel-risky** | 19, 20, 21, 22, 23     |
| 7    | Polish + verification + docs             | serial             | 24                     |

## 8. Out of scope (explicit non-goals)

- **Hardening of email/SMS/WhatsApp delivery providers.** Wave 3 wires the channel routing layer with provider stubs that emit `NotImplementedException`. The user will return for delivery hardening in a separate pass.
- **Modifying `/pastoral`.** The pastoral page and its tab strip stay exactly as today. The Wave 4 `/pastoral/checkins` crash fix is a defensive null-guard that does not change visible behaviour.
- **New backend modules outside the wellbeing umbrella.** The rebuild does not touch Inbox, People, Learning, Operations, Finance, Reports, Regulatory, or generic Settings infrastructure. (It does add to `Settings → Communications` for notification channel preferences.)
- **AI provider integration.** AI endpoints already exist and call into whichever provider the backend wires; this rebuild adds the **gating** and the **UI surfaces**. Provider keys, prompts, models — all out of scope.
- **Migrating existing tenant data.** All existing incidents, concerns, sanctions, etc. continue to work. No backfill required. The new defaults seed only fires for tenants without pre-existing categories.
- **Replacing the Recognition data model.** Recognition wall + house leaderboard are surfaced from existing tables; no schema rework.

## 9. Why this shape

**Why a single super-hub at `/wellbeing` instead of keeping the sub-strip?** Sub-strips were tested in production and felt 2010s. The dashboard-as-navigation-surface pattern — `/people`, `/finance`, `/operations`, `/learning` — has been validated across the user's own product and is unambiguously the direction. The super-hub also gives us a place to surface cross-module signals (SLA breaches, overdue actions, pending attention) that the sub-strip pattern had no home for.

**Why fold staff wellbeing into one page?** Five separate routes for staff dashboard / my workload / surveys / reports / resources fragments a single coherent workflow ("I want to understand staff wellbeing") into five clicks. Folding into one page with internal navigation keeps the surface small and matches user mental model.

**Why promote safeguarding out of pastoral?** Safeguarding has unique operational characteristics — SLA timers, break-glass emergency access, sealing with dual approval, after-action reviews — that don't belong in a generic pastoral surface. A dedicated sub-hub makes those primitives discoverable for the people who actually use them (designated safeguarding leads, principals).

**Why all 14 hidden capabilities at once instead of phased?** Because the user explicitly said: "I spent real time and money building these — no sense dropping them from the product offering." Half of the wellbeing module's value is in capabilities the UI never exposed. Surfacing them now is the difference between a flagship deliverable and an MVP.

**Why per-module AI flags instead of a single master toggle?** AI cost differs per feature. AI parse for incidents is cheap and high-value; SST agenda AI may be more expensive. Per-module gating gives tenants and the platform owner cost control without forcing a binary all-or-nothing decision. This matches the existing module-flag pattern, so the admin UI is familiar.

**Why hardened parallelisation rules on Waves 4, 5, 6?** The `new-inbox` rebuild's Wave 4 lost work to lint-staged auto-stash and `git add .` collisions across sibling sessions. Wave 4/5/6 of this rebuild touch `messages/en.json`, `messages/ar.json`, `nav-config.ts`, and the morph-bar shell — exactly the same shared-file shape that triggered the inbox incident. The hardened rules in `IMPLEMENTATION_LOG.md` §2b prevent a repeat.

---

End of plan. Implementation files in `implementations/01-*.md` through `implementations/24-*.md`. Wave structure, status table, completion records, and operating rules in `IMPLEMENTATION_LOG.md`.
