# Wellbeing Rebuild — Sign-Off Package

**Status:** READY FOR MANUAL SIGN-OFF
**Prepared:** 2026-04-21 Europe/Dublin
**Prepared by:** Claude Opus 4.7 (1M context)
**Final commit at sign-off time:** see `IMPLEMENTATION_LOG.md` row 24 after this pass completes

---

## One-page summary

Over 24 implementations across 7 waves (2026-04-20 → 2026-04-21), the wellbeing module — the largest feature surface in the platform — was rebuilt from a half-dark, 8-page-crashing, 20-broken-endpoint legacy state into a flagship-grade deliverable: a `/wellbeing` super-hub + four sub-hubs (`/behaviour`, `/wellbeing/staff`, `/early-warnings`, `/safeguarding`), every hidden backend capability surfaced, every translation key backfilled, AI gating per tenant, and an entire new notification orchestration layer.

**Headline deliverables:**

- ~160 commits in this rebuild (between 2026-04-20T13:27Z and 2026-04-21T00:45Z, plus pre-24 cleanup and impl 24 polish)
- 3 new backend modules: `wellbeing-aggregate`, `ai-flags`, `wellbeing-notifications`
- 14+ AI / document / exclusion / pastoral / safeguarding / recognition / policy / admin surfaces shipped
- 428 endpoint signatures on the wellbeing umbrella (120 behaviour + 65 pastoral + 22 safeguarding + 8 early-warning + 24 staff-wellbeing + 3 new modules)
- 31 default behaviour categories seeded on all 5 tenants
- 4 new permissions: `ai_flag.manage`, `wellbeing.view_dashboard`, `safeguarding.dedicated_view`, `wellbeing_notifications.configure`
- 3 new tables: `tenant_ai_flags`, `tenant_notification_preferences`, `behaviour_ai_query_history`
- 2 new BullMQ processors: `behaviour:exclusion-deadline-check`, `behaviour:ack-reminders`
- ~900+ translation keys backfilled across `messages/en.json` + `messages/ar.json` with structural parity
- 5 architecture docs updated: `feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`, `danger-zones.md`

**Impl 24 polish specifically fixed:** 3 high-severity production bugs surfaced by the authenticated multi-role Playwright sweep + 1 cosmetic UX bug.

---

## All 24 impls completed

|   #    | Wave | Title                                                 | Completed         | Commit         |
| :----: | :--: | ----------------------------------------------------- | ----------------- | -------------- |
|   01   |  1   | Schema foundation + default seeds                     | 2026-04-20T14:15Z | c5ee2128       |
|   02   |  2   | Fix broken behaviour endpoints                        | 2026-04-20T13:27Z | 16bffbb4       |
|   03   |  2   | Wellbeing dashboard-summary aggregator                | 2026-04-20T13:32Z | 4b749aac       |
|   04   |  2   | AI flag service + notification routing                | 2026-04-20T13:43Z | 815bd9d2       |
|   05   |  3   | Behaviour AI services                                 | 2026-04-20T14:40Z | 8305a4de       |
|   06   |  3   | Document generation lifecycle                         | 2026-04-20T14:10Z | 2a850c21       |
|   07   |  3   | Exclusion + amendment + ack services                  | 2026-04-20T15:15Z | 1a529312       |
|   08   |  3   | Pastoral hidden services                              | 2026-04-20T18:15Z | b9bd7d04       |
|   09   |  3   | Safeguarding + admin repair + policy ops              | 2026-04-20T17:15Z | 80e60532       |
|   10   |  4   | Page crash fixes (5 pages)                            | 2026-04-20T19:10Z | 2d7acb80       |
|   11   |  4   | Behaviour analytics URL fix + endpoint reconnects     | 2026-04-20T17:38Z | 99dd039a       |
|   12   |  4   | Translation backfill (en + ar)                        | 2026-04-20T17:45Z | 802daede       |
|   13   |  5   | Wellbeing super-hub + sub-strip removal               | 2026-04-20T21:00Z | 16a0bce4       |
|   14   |  5   | Behaviour sub-hub                                     | 2026-04-20T21:15Z | 18c69ef6       |
|   15   |  5   | Staff wellbeing folded sub-hub                        | 2026-04-20T21:10Z | 607dab0d       |
|   16   |  5   | Early-warnings flagship sub-hub                       | 2026-04-20T22:45Z | 0728765b       |
|   17   |  5   | Safeguarding sub-hub                                  | 2026-04-20T22:55Z | 4a321481       |
|   18   |  5   | Tenant admin → AI flags page                          | 2026-04-20T23:25Z | 0a8d8588       |
|   19   |  6   | AI features UI                                        | 2026-04-20T23:55Z | 59f95bbe       |
|   20   |  6   | Document generation UI                                | 2026-04-20T23:45Z | 9c41fcd2       |
|   21   |  6   | Exclusion + restrictions + amendments + ack UI        | 2026-04-21T00:05Z | 60b63439       |
|   22   |  6   | Pastoral hidden-feature UI                            | 2026-04-21T00:35Z | 168d4818       |
|   23   |  6   | Safeguarding hidden + recognition + policy + admin UI | 2026-04-21T00:45Z | eb674691       |
| pre-24 |  –   | Debt closure pass                                     | 2026-04-21T01:05Z | 0dd4307b (log) |
|   24   |  7   | Polish, multi-role Playwright sweep, docs             | 2026-04-21        | _this commit_  |

All impls deployed to `https://nhqs.edupod.app` via the rsync + `git am` patch flow. No commits pushed to GitHub per rebuild rule.

---

## Test sweep excerpt

Full report: `wellbeing_new/test-report.md`.

**29 canonical URLs** — HTTP 200 at the edge for both `en` and `ar` locales (58 combinations).

**Mobile at 375×812** — no horizontal scroll on `/wellbeing`, `/behaviour`, `/ar/wellbeing`. RTL mirror verified.

**Authenticated sweep (school_principal role)** — zero console errors on 15 visited surfaces after the polish fixes.

**Three production bugs fixed in impl 24:**

1. **ISSUE-24-01** — `/safeguarding` 403 toasts for principal/VP. Fix: migration `20260421000000_wbr_backfill_safeguarding_admin_grants` backfills the four safeguarding permissions on existing tenants + updates seed.
2. **ISSUE-24-02** — `/early-warnings` 500 from `prisma.pastoralIntervention.findMany({ status: 'active' })`. Fix: `toPrismaInterventionStatus` helper translates public value `active` → Prisma `pc_active` (Prisma `@map` gotcha documented in DZ-Wellbeing-1).
3. **ISSUE-24-03** — `/behaviour/analytics` 500 from `prisma.student.count({ status: 'enrolled' })`. Fix: swapped `'enrolled'` → `'active'` (the actual StudentStatus enum value) in behaviour-comparison, behaviour-pulse, behaviour-incident-analytics services.
4. **ISSUE-24-04** (cosmetic) — `/wellbeing/staff` three 404 toasts for non-teaching admins. Fix: `MyWorkloadSection` catches `STAFF_PROFILE_NOT_FOUND` specifically and renders a friendly empty state.

---

## Endpoint coverage excerpt

Full matrix: `wellbeing_new/endpoint-coverage.md`.

- Behaviour: 209 endpoint decorators (120 original + 89 from the rebuild / pre-24 cleanup)
- Pastoral: 153
- Safeguarding: 31
- Early-warning: 8 (no new endpoints; consumed by aggregate)
- Staff-wellbeing: 24 (no new endpoints)
- Wellbeing-aggregate **NEW**: 1 (`GET /v1/wellbeing/dashboard-summary`)
- AI-flags **NEW**: 2 (list + PATCH per module)
- Wellbeing-notifications: service-only (no HTTP endpoints)

**Permission matrix post-fix:** principal can now read / manage / seal safeguarding concerns. All flag-gated AI endpoints return `403 AI_DISABLED` when the flag is off (confirmed on pastoral + behaviour AI gates).

---

## Mobile pass findings

No layout breakage found at 375×812 across sampled pages. Recharts charts on `/early-warnings` + `/wellbeing/staff` collapse correctly. Hub tile grids stack to 1-col. All forms use `w-full` on mobile.

---

## Architecture doc updates summary

- `docs/architecture/feature-map.md` — **NEW §39** (Wellbeing Super-Hub + AI Flags + Notifications); §30 Behaviour / §31 Safeguarding / §32 Pastoral / §33 Early Warning / §37 Staff Wellbeing updated with the new routes + rebuild notes. Quick Reference totals updated from 38 to 39 domains.
- `docs/architecture/module-blast-radius.md` — three **NEW** Tier 3 module entries (`WellbeingAggregateModule`, `AiFlagsModule`, `WellbeingNotificationsModule`); existing Behaviour / Pastoral / Safeguarding / Early Warning / Staff Wellbeing entries updated with rebuild dependency notes.
- `docs/architecture/event-job-catalog.md` — new cross-queue chains documented: wellbeing notification dispatch, behaviour document lifecycle, behaviour exclusion lifecycle + new cron processors.
- `docs/architecture/state-machines.md` — verified: `DocumentStatus`, `ExclusionStatus`, `InterventionStatus`, `SafeguardingStatus`, `AppealStatus` already matched source code. No new state machines introduced by the rebuild.
- `docs/architecture/danger-zones.md` — **8 new DZ entries** (`DZ-Wellbeing-1` through `DZ-Wellbeing-8`) covering: Prisma `@map` enum lying casts, AI flag disable semantics, sealing irreversibility, break-glass audit trail fragility, admin repair blast radius, in-app always-on invariant, `safeguarding.view` backfill gap, and Wave 4 hardening rules persistence.

---

## Known remaining out-of-scope items

Explicitly deferred per `PLAN.md §8`:

- Hardening of email / SMS / WhatsApp delivery providers (stubs emit `PROVIDER_NOT_WIRED`)
- `ANTHROPIC_API_KEY` on production env (AI endpoints currently return `503 AI_SERVICE_UNAVAILABLE` when flag on + key missing)
- `generation_failed` state + `last_error` / `retry_count` on `behaviour_documents`
- Multi-recipient `/send-batch` endpoint
- SMS channel (currently only email / WhatsApp / in_app / print)
- Per-jurisdiction exclusion statutory deadlines (tenant settings)
- Multi-instance Redis rate limit + cache invalidation (in-memory today)
- Module-flag hard-hide on hub tiles (currently visible with count=0)
- LLM-backed SST agenda + early-warnings narrative (deterministic heuristics ship today)
- Recognition feed merger (awards vs positive incidents — product decision)
- Dedicated `safeguarding_break_glass_access_log` table (projected from `safeguarding_actions` today)
- `admin_repair_runs` dedicated tracking table (uses BullMQ job IDs today)
- Resend document counter (needs schema + state machine work)
- `SYSTEM_ROLE_PERMISSIONS` / `SYSTEM_ROLES` consolidation refactor (see DZ-Wellbeing-7)

None of the above blocks sign-off; all are documented, justified, and tracked in the appropriate architecture doc + implementation log follow-ups.

---

## Ready for user manual sign-off

The rebuild closes every in-scope item in `PLAN.md`. Every prerequisite documented in impl files is met. Every page and endpoint listed in §2 of the plan is live on production. All tests pass locally (1537/1537 API, 482/482 web, 2/2 translation parity). Type-check + lint clean on all changed files.

**User actions remaining:**

1. Review `test-report.md` + `endpoint-coverage.md` for any specific concerns.
2. Do a hands-on walk of any role/surface combination you specifically want to verify (e.g. parent portal view of exclusion documents; student self-check-in flagged queue).
3. When satisfied, mark the rebuild complete in whatever governance tracker you use.
4. Push the accumulated local commits to GitHub whenever you're ready — the rebuild rule was "never push mid-flight", and the final commit graph is now stable.

**User actions outside the rebuild scope that are worth scheduling:**

1. Add `ANTHROPIC_API_KEY` to production `.env` so AI endpoints go live.
2. Consider the `SYSTEM_ROLE_PERMISSIONS` refactor (DZ-Wellbeing-7) before creating any new system roles.
3. Provider hardening pass for email / SMS / WhatsApp delivery (wellbeing-notifications stubs).
4. Mobile validation at 360px (some Android devices) — all my tests were at 375×812 (iPhone SE).
