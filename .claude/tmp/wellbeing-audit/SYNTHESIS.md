# Wellbeing Module — Audit Synthesis

**Tenant tested:** `nhqs.edupod.app` · School Principal · 2026-04-20
**Companion docs in this folder:**

- `backend-report.md` — full inventory of 5 backend modules (245+ endpoints, 68 tables, 29 jobs, all state machines, all hidden features)
- `playwright-walkthrough.md` — page-by-page live findings on every wellbeing route

---

## TL;DR

The wellbeing umbrella is **the largest feature surface in the codebase** — 5 backend modules, 245+ endpoints, 68 Prisma tables, 29 background jobs, ~65 frontend pages. About **half of it is dark** in the UI: large swathes of behaviour analytics, AI parsing, document generation, exclusion statutory workflow, guardian restrictions, parent acknowledgement tracking, DSAR, safeguarding break-glass, SST agenda AI, critical-incident response plans, and the entire staff-wellbeing data layer are present in code but either crashing, 404ing, or have no surface at all.

The user's two reported bugs are real and they are the **tip of an iceberg**:

1. `More → Wellbeing` 404 — `/wellbeing` has no `page.tsx`. Confirmed.
2. "Validation failed" toast on `/behaviour` — `GET /api/v1/behaviour/incidents/stats` returns **HTTP 400** on first load.

There are at least **8 page-level crashes** and **20+ broken endpoints** across the wellbeing umbrella.

---

## What we have (backend)

| Module              | Key code path                           | Endpoints | Tables | Jobs | Module flag       |
| ------------------- | --------------------------------------- | --------- | ------ | ---- | ----------------- |
| **behaviour**       | `apps/api/src/modules/behaviour/`       | 120+      | 25     | 15   | `behaviour`       |
| **pastoral**        | `apps/api/src/modules/pastoral/`        | 65+       | 20     | 8    | `pastoral`        |
| **safeguarding**    | folded into pastoral infra              | 22        | 4      | 6    | none              |
| **early-warning**   | `apps/api/src/modules/early-warning/`   | 8         | 3      | 0    | `early_warning`   |
| **staff-wellbeing** | `apps/api/src/modules/staff-wellbeing/` | 30+       | 5      | 0    | `staff_wellbeing` |

Major capabilities present in code (and, per the user, **most of these have never been wired to production**):

- **Behaviour engine.** Incidents with full state machine (draft → active → investigating → escalated → resolved with side-branches for parent meetings, approvals, safeguarding conversion). Sanctions with served/no-show/excused/superseded states. Interventions. Appeals. **Statutory exclusion case lifecycle** with notice → hearing → decision → appeal-window. Tasks. Alerts. **Recognition wall + house leaderboard**. **Parent acknowledgement tracking** at sent/delivered/read/acknowledged level across email/WhatsApp/in-app. **Amendment notices** with parent re-acknowledgement. **Guardian restrictions** (block parent comms/portal). **Document generation** (detention notice, suspension letter, exclusion notice, decision letter, board pack) with templates, PDF render callback, multi-channel send. **Policy engine** with rules + actions, dry-run, replay, import/export. **AI features** — incident description parsing, per-student summary, NL queries with history. **Admin data repair** — recompute points, rebuild awards, recompute pulse, backfill tasks, reindex search. **Retention + legal holds** with anonymisation. **Materialized views + Meilisearch search**.

- **Pastoral.** Concerns (with append-only versioning + amendment trail). Cases (cyclic state machine, no terminal). Interventions with outcome tracking. **External referrals** with full forward-only state machine (draft → submitted → acknowledged → assessment → report → recommendations). **SST meetings** with **AI-driven agenda pre-population**. **Critical incidents** with structured **response-plan items** + per-affected-person support log. **Wellbeing check-ins** (student self-report, auto-creates concern when flagged) with flagged-list endpoint for escalation. **Pastoral DSAR** (data subject access request) with item-level include/redact/exclude per concern/case. **Bulk pastoral import** (CSV/Excel + template).

- **Safeguarding.** Concern reporting + actions + **SLA tracking** (1h critical, 4h high, 24h medium, 72h low) with cron-driven breach tasks. **Auto-escalation chain** (liaison → deputy → fallback) every 30 min until acknowledged for criticals. **Break-glass emergency access** (time-bound, all-concerns or scoped, with mandatory after-action review). **Sealing** (irreversible, dual approval, GDPR). Cross-module incident linking (behaviour → safeguarding conversion).

- **Early warning.** Risk tiers (green/yellow/amber/red) across attendance, grades, behaviour, wellbeing, engagement domains.

- **Staff wellbeing.** Workload survey lifecycle (draft → active → closed → archived) with anonymity, freeform moderation, response aggregation, department drill-down. Aggregate analytics (workload distribution, cover fairness + Gini, timetable quality, substitution pressure, absence trends, correlation). Termly board report. Resources (EAP + crisis numbers + custom) with stale-warning >90d.

---

## What's actually wired in the UI

### Pages that work cleanly

- `/pastoral` and most `/pastoral/*` lanes — the pastoral workspace is the **best-implemented module today** and is structurally already a hub-style page (tabs for Overview/Concerns/Cases/Interventions/Referrals/SST/Check-ins/Critical-incidents, KPI counters, three header CTAs).
- `/behaviour/sanctions`, `/exclusions`, `/appeals`, `/interventions`, `/alerts`, `/amendments`, `/documents`, `/guardian-restrictions`, `/students` — empty shells but render and have working filters/tabs.
- `/wellbeing/surveys`, `/wellbeing/survey` — empty but functional.
- `/early-warnings`, `/early-warnings/cohort` — empty but functional.
- `/settings/behaviour-categories`, `/settings/behaviour-policies` — admin scaffolding present.

### Pages broken — page-level crashes

1. `/wellbeing/dashboard` — `Cannot read properties of undefined (reading 'mean')`
2. `/wellbeing/reports` — page-level error boundary
3. `/wellbeing/resources` — `Cannot read properties of undefined (reading 'length')`
4. `/pastoral/checkins` — `F.map is not a function` (response shape mismatch)
5. `/early-warnings/settings` — `Cannot read properties of undefined (reading 'attendance')`

### Pages broken — wrong/missing endpoints

6. `/wellbeing` — **404** (no `page.tsx`).
7. `/wellbeing/my-workload` — three endpoints all 404 (`/api/v1/staff-wellbeing/my-workload/{summary,cover-history,timetable-quality}`).
8. `/behaviour` — `GET /api/v1/behaviour/incidents/stats` returns 400 → "Validation failed" toast.
9. `/behaviour/incidents/new` — `GET /api/v1/behaviour/templates?pageSize=50` returns 404 (endpoint doesn't exist) + no behaviour categories seeded.
10. `/behaviour/analytics` — **8 of 8 chart endpoints 404**. Frontend is calling `/behaviour/analytics/*` **without the `/api/v1` prefix**, the rewrite 307s to localised paths, then 404s. Module is unusable.
11. `/behaviour/recognition` — `GET /api/v1/behaviour/recognition?pageSize=50&status=published` 404.
12. `/behaviour/tasks` — "Validation failed" on first load.
13. `/behaviour/analytics/ai` — query history endpoint returns 404 toast.

### Translation drought

The `behaviour.*` and `behaviourSettings.*` namespaces are **substantially missing from `messages/en.json`**. Every page in the behaviour module renders raw keys for stat labels, quick actions, tab captions, filter chips, empty-state copy, and the Quick Log button. Pastoral, wellbeing surveys, and early-warnings translations are mostly present.

### Hidden features (in code, no surface)

Beyond the listed pages, the backend exposes endpoints with **no corresponding UI page or button**:

- AI: `POST /behaviour/incidents/ai-parse`, `GET /behaviour/students/:id/ai-summary` (NL → fields, per-student summary).
- Policy ops: `POST /behaviour/policies/replay` (retroactive rule application), `import`/`export`, `policy-dry-run`.
- Admin data repair: `recompute-points`, `rebuild-awards`, `recompute-pulse`, `backfill-tasks`, `reindex-search`, `retention/preview` + `execute`, `legal-holds` lifecycle.
- Document multi-channel send + finalise + appeal decision letter + exclusion notice + board pack generators.
- Pastoral DSAR review (`/pastoral/dsar-reviews/*`) — wired into compliance flow but no UI.
- Pastoral CSV/Excel import (`/pastoral/import/{validate,confirm,template}`) — no UI.
- Safeguarding break-glass (`/safeguarding/break-glass*`) — no UI.
- Critical-incident response plan items + per-affected-person support log — no UI.
- SST agenda AI refresh (`/pastoral/sst/meetings/:id/agenda/refresh`) — no UI.
- Pastoral check-in flagged list (`/pastoral/checkins/flagged`) — no UI.

---

## Navigation problems

- The morph-bar **Wellbeing pill** routes directly to `/behaviour`. There is no `/wellbeing` landing.
- The **sub-strip** under Wellbeing shows: **Behaviour · Incidents · Pastoral · SEN · More**, with the More overflow containing **Wellbeing** (404) and **Early Warnings**.
- Per the user, this whole sub-strip pattern is going away.
- The "Wellbeing hub" today aggregates **5 different modules** (behaviour, pastoral, wellbeing, sen, early-warnings) — far too broad for one sub-strip. People/Finance/Operations/Learning all use a single dashboard with hub tiles instead.
- Many deep pages (`/behaviour/analytics`, `/exclusions`, `/appeals`, `/recognition`, `/documents`, `/guardian-restrictions`, `/parent-portal`, `/tasks`, `/wellbeing/dashboard`, `/wellbeing/my-workload`, `/wellbeing/reports`, `/wellbeing/resources`) are not in any nav surface — they're discoverable only via direct URL or links from the pages we did wire.

---

## Recommended redesign direction

**Pattern fit: copy `/people` (KPIs + quick actions + hub navigation cards) or `/operations` (hub tiles with optional dynamic counter badges).** Wellbeing is heterogeneous like People — many distinct workstreams that each deserve their own card.

### Proposed `/wellbeing` landing structure

1. **PageHeader** — "Wellbeing & Safeguarding" + descriptive line.
2. **Pending-attention banner** (Finance pattern) — surfaces SLA-breached safeguarding concerns, overdue interventions, unacknowledged criticals, pending appeals.
3. **KPI strip** (4 tiles, sourced from a single new `/api/v1/wellbeing/dashboard-summary` endpoint):
   - Students at risk (early-warning amber+red count)
   - Open incidents
   - Open pastoral cases
   - Overdue actions (sanctions/tasks/SLA breaches)
4. **Quick actions** (4 pills): Log Incident · Log Concern · Declare Critical Incident · Open Pastoral Case
5. **Hub navigation cards** (2-column, accent-bar + glow + count badge):
   - **Behaviour** (incidents, sanctions, exclusions, appeals, amendments, recognition, documents, tasks, analytics) — danger gradient, Shield icon
   - **Pastoral & Safeguarding** (concerns, cases, interventions, referrals, SST, check-ins, critical incidents) — rose gradient, Heart icon
   - **Early Warnings** (at-risk indicators across all domains) — amber gradient, AlertTriangle icon
   - **Staff Wellbeing** (workload, surveys, board reports, EAP resources) — violet gradient, Users icon
   - **Settings & Policies** (categories, policies, awards, houses, document templates, EAP config) — slate gradient, Cog icon — admin only
6. (Optional) **Recent activity feed** — recent incidents, recent concerns, recent acknowledgements.
7. Remove the wellbeing **sub-strip** entirely — make `wellbeing: []` in `hubSubStripConfigs`. The dashboard becomes the navigation surface (matches /people, /operations, /finance, /learning).

### Reuse, don't rebuild

- `KpiTile` from `apps/web/src/app/[locale]/(school)/people/_components/dashboard-parts.tsx`
- Hub-tile JSX pattern from `people/page.tsx` (lines ~450–488) or `operations/page.tsx` (with the dynamic count badge from the Admissions card at line ~184)
- `QuickAction` JSX pattern from `finance/page.tsx` (lines ~103–132)
- `PageHeader` shared component
- Tokens / colours from `docs/plans/ux-redesign-final-spec.md` — never hardcode hex
- Move the existing `/pastoral` overview's tab-strip + KPI counters logic into a per-module sub-page (`/wellbeing/pastoral` or keep `/pastoral` as today and link from the hub tile).

### Suggested phased plan

| Phase                                                 | Scope                                                                                                                                                                                                                                                                                                          | Why first                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **0. Stop the bleeding**                              | Fix the 5 page crashes (defensive null/array guards), the analytics URL-prefix bug, the `/incidents/stats` 400, the missing `/behaviour/templates` route, the missing `/behaviour/recognition` list endpoint, ship the missing `behaviour.*` translations. Seed default behaviour categories on tenant create. | Without this, the redesign sits on top of broken plumbing. Mostly small fixes. |
| **1. Build `/wellbeing` landing**                     | Create `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx` with the pattern above + `/api/v1/wellbeing/dashboard-summary` endpoint + remove sub-strip.                                                                                                                                                     | This is the user's primary ask and unblocks "More → Wellbeing".                |
| **2. Surface hidden capability one module at a time** | Wire AI incident parsing, document generation, exclusion case statutory workflow, guardian restrictions, amendment notices.                                                                                                                                                                                    | Highest-value already-built behaviour features, all backend-ready.             |
| **3. Pastoral / safeguarding depth**                  | Wire DSAR review, break-glass, critical-incident response plans, SST agenda AI, pastoral import.                                                                                                                                                                                                               | Compliance-heavy, regulator-visible.                                           |
| **4. Staff wellbeing repair**                         | Diagnose why `/api/v1/staff-wellbeing/*` is 404ing on this tenant (module flag? deployment?). Once endpoints respond, the dashboard/reports/resources crashes likely resolve from the defensive guards added in Phase 0.                                                                                       | Smallest blast radius once endpoints work.                                     |
| **5. Early-warnings polish**                          | Initialise default settings on tenant create so `/early-warnings/settings` doesn't crash. Wire indicator threshold UI.                                                                                                                                                                                         | Standalone, low-coupling.                                                      |

---

## Open questions for the user before implementation

1. **Scope for the rebuild:** are we limiting Phase 1 to the new `/wellbeing` landing + nav, or do you want phases 0-2 in the same swing?
2. **Hidden features priority:** which of the 14 hidden capabilities (AI parse, document generation, DSAR, break-glass, etc.) do you want surfaced first? Some are heavy UI projects.
3. **Module gating:** should we leave `behaviour`, `pastoral`, `staff_wellbeing`, `early_warning` as separate `@ModuleEnabled` flags so tenants can opt out? Or make wellbeing a single bundled module from a tenant POV?
4. **Sub-module landings:** do `/behaviour`, `/pastoral`, `/wellbeing/staff`, `/early-warnings` each get their own dashboard underneath the new `/wellbeing` hub, or do they keep their current structure and just lose the sub-strip nav?
5. **Pre-launch hardening:** the pre-launch checklist (`docs/operations/PRE-LAUNCH-CHECKLIST.md`) — should the wellbeing fixes be tracked there as a deferred-to-launch item, or are we fixing this before the upcoming launch?
