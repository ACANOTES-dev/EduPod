# Wellbeing Rebuild — Implementation Log

> **What this is:** The single source of truth for the wellbeing module rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.
>
> Master plan: `wellbeing_new/PLAN.md`. Audit source: `.claude/tmp/wellbeing-audit/{SYNTHESIS,backend-report,playwright-walkthrough}.md`.

---

## 1. Work summary (read this first)

We are rebuilding the wellbeing module — the largest feature surface in the platform — into a flagship-grade deliverable. Five backend modules (behaviour, pastoral, safeguarding, early-warning, staff-wellbeing) with 245+ endpoints, 68 tables, and 29 jobs. Roughly half of that backend is dark in the UI today: AI parsing, document generation, statutory exclusion workflow, guardian restrictions, parent acknowledgement tracking, amendment notices, pastoral DSAR, safeguarding break-glass, critical-incident response plans, SST agenda AI, recognition wall + house leaderboard, policy engine ops, admin data repair. On top of that, eight pages crash on load, twenty endpoints are wrong or missing, the entire `behaviour.*` translation namespace is absent, and the `/wellbeing` landing returns 404.

This rebuild does all of:

1. **Stop the bleeding** — fix every page crash, every broken endpoint, every missing translation key (English and Arabic), seed default behaviour categories on tenant create.
2. **Build a `/wellbeing` super-hub** that replaces the morph-bar sub-strip pattern entirely, modelled on `/people`.
3. **Build four flagship sub-hubs** for behaviour, staff-wellbeing (folded into one page), early-warnings (taken to the full 6 yards as a key product differentiator), safeguarding (separated from pastoral).
4. **Surface every hidden capability** in the UI — every backend endpoint either gets a page or is explicitly marked backend-only.
5. **AI gating** — a per-module on/off table + admin page so tenants can enable/disable AI features independently per module.
6. **Repair staff-wellbeing 404s and the `/early-warnings/settings` crash with default-init.**
7. **Verify every page, flow, permission, and notification** — Playwright walkthrough across all four roles plus a manual sign-off sweep.
8. **Update all five architecture docs** — `feature-map.md`, `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`, `danger-zones.md`.

`/pastoral` is **untouched** — it is the only existing page in the umbrella that already meets the bar.

The rebuild is split into **24 implementations across 7 waves**. See §3 for the wave structure and §4 for the live status table.

---

## 2. Rules every session must follow

### 2a. Baseline rules (apply to every implementation)

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify cross-wave prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its `Depends on` column must have `status: completed`. **In-wave siblings are NOT prerequisites** — you code in parallel with them, only deployment serialises (Step 6 of `/WBR`). If a cross-wave prerequisite is missing, poll every 30 minutes per the `/WBR` slash command's Step 1.

**Rule 3 — Read the summaries of completed prerequisites** in §5 (Completion Records). What shipped may differ from what the impl file said.

**Rule 4 — Implementations within the same wave code in parallel; only deployments serialise** (first-come-first-served, not numeric order), and only when they share a service restart target. Consult the deployment matrix in §3 before deploying.

**Rule 5 — NEVER push to GitHub.** Commit locally only. Deploy via SSH patch flow per the `/WBR` slash command. The user pushes the entire stack at the end of the rebuild.

**Rule 6 — Deploy directly to production after every implementation.** SSH access is granted for the duration. Production lives at `root@46.62.244.139`, repo at `/opt/edupod/app`, runs as `edupod` user via PM2. **Never run `git pull` or `git fetch origin` on the server** — you will revert the accumulated local-only commits.

**Rule 7 — Update this log at the end of your implementation.** Append a Completion Record in §5 + flip your row in §4 from `in-progress` to `completed`. The log update goes in its **own separate commit** — never bundled with code.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. Fix any regressions before deploying.

**Rule 9 — Follow `.claude/rules/*` and CLAUDE.md.** RLS on every new tenant-scoped table (`FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)`, strict TypeScript, logical CSS properties (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`, never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`), `react-hook-form` + Zod for new forms.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need. Do not invent state. Do not delete unrecognised code.

**Rule 11 — Never weaken privacy invariants.** Every wellbeing endpoint touches sensitive data (safeguarding, child protection, AI). Existing permission decorators stay. New surfaces respect them. If a test or feature seems to need it, STOP and ask the user.

**Rule 12 — Translations are mandatory in both `en.json` and `ar.json`.** No new English string ships without its Arabic counterpart. The translation backfill in Wave 4 covers existing missing keys; every new key in Waves 5 and 6 lands in both locale files in the same commit.

### 2b. Hardened rules for parallel coding (Waves 4, 5, 6)

These rules exist because the `new-inbox` rebuild's Wave 4 lost work to lint-staged's auto-stash interacting with `git add .` and unstaged sibling files. Apply these on EVERY frontend impl in Waves 4, 5, 6. They are the difference between a clean parallel run and a 90-minute revert war.

**Rule H1 — Read your impl's `## Shared files this impl touches` section FIRST.** Every impl file lists every file it will touch that another sibling might also touch. Hold them in working memory — they are your conflict zones.

**Rule H2 — Commit at every sub-step, not at the end.** The impl's `## What to build` lists numbered sub-steps. Commit after each sub-step that produces a working state. Three to five commits per frontend impl is normal. Sitting on hours of uncommitted work exposes you to every sibling's edits and to lint-staged's stash behaviour.

**Rule H3 — Stage by explicit pathspec, NEVER `git add .` or `git add -A`.** Every `git add` lists the exact files:

```bash
git add apps/web/src/app/[locale]/\(school\)/wellbeing/page.tsx \
        apps/web/src/components/kpi-tile.tsx
```

If you default to `git add .` you will sweep up sibling sessions' untracked work and attribute it to your commit, triggering revert wars.

**Rule H4 — Run `git status` before EVERY commit and inspect it.** If you see files you did not touch, ABORT the commit. A sibling session has written into your working tree. Investigate before proceeding — stash your own changes, work out what happened, then proceed.

**Rule H5 — Shared files go LAST.** When your impl touches translations, `nav-config.ts`, the morph bar, settings shells, or seed files, do those sub-steps **last**, immediately before your final commit. This minimises the window during which a sibling can overwrite your edits. Pattern: build everything in your own files first, commit, then do shared-file edits in a single final commit.

**Rule H6 — Beware lint-staged auto-stash.** Husky's `lint-staged` stashes unstaged and untracked files before running pre-commit checks, then restores them. If a sibling session has untracked files in your working tree at the moment you commit, they can be destroyed during the stash/restore cycle. Before `git commit`, verify `git status` shows ONLY files you intend to commit.

**Rule H7 — `IMPLEMENTATION_LOG.md` is a shared file and ALWAYS goes in its own separate commit.** Never bundle log updates with code. Pattern:

```
feat(wellbeing): <impl title>           <- code commit(s), pathspec'd
docs(wellbeing): log completion of impl NN   <- log commit, alone
```

**Rule H8 — Translation keys go into a local scratch first, then into `en.json` / `ar.json` in your final commit window.** Do not edit `en.json` early in your impl — you race every other frontend sibling. Keep your additions in a buffer (a comment, a scratch file, an in-memory list) and write them into the locale files in the final commit window only.

**Rule H9 — Deep-merge `en.json` / `ar.json` edits, never replace the file.** Re-read the current content of each locale file immediately before writing. Merge your additions into the existing structure. Do not assume the content you loaded 30 minutes ago is still current — a sibling may have added keys you'd otherwise overwrite.

**Rule H10 — If you discover a conflict you cannot resolve (sibling wiped your work, lint-staged destroyed untracked files), STOP and file a follow-up note in the log. Do not blindly re-apply** — you may overwrite a fix someone else just made. Tell the user, attach what you can recover, wait for guidance.

---

## 3. Wave structure & deployment matrix

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND deploy on a first-come-first-served basis — not in implementation-number order.

### Wave structure

| Wave  | Implementations        | Hard dependency | Parallelisation mode | Theme                                                      |
| ----- | ---------------------- | --------------- | -------------------- | ---------------------------------------------------------- |
| **1** | 01                     | None            | serial               | Schema foundation (AI flags, default categories, defaults) |
| **2** | 02, 03, 04             | Wave 1          | parallel-safe        | Backend stop-the-bleeding                                  |
| **3** | 05, 06, 07, 08, 09     | Wave 2          | parallel-safe        | Backend hidden-capability surfacing                        |
| **4** | 10, 11, 12             | Wave 3          | **parallel-risky**   | Frontend stop-the-bleeding (apply rules H1–H10)            |
| **5** | 13, 14, 15, 16, 17, 18 | Wave 4          | **parallel-risky**   | New super-hub + four sub-hubs + AI admin (rules H1–H10)    |
| **6** | 19, 20, 21, 22, 23     | Wave 5          | **parallel-risky**   | Frontend hidden-capability surfacing (rules H1–H10)        |
| **7** | 24                     | Wave 6          | serial               | Polish, Playwright sweep, docs                             |

### Deployment matrix

Restart target determines deploy serialisation. Deployments only block each other when they share a target.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ❌             | ❌          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ✅          | ✅             | ❌          |
| 05   | ❌        | ✅          | ❌             | ❌          |
| 06   | ❌        | ✅          | ✅             | ❌          |
| 07   | ❌        | ✅          | ✅             | ❌          |
| 08   | ❌        | ✅          | ✅             | ❌          |
| 09   | ❌        | ✅          | ❌             | ❌          |
| 10   | ❌        | ❌          | ❌             | ✅          |
| 11   | ❌        | ❌          | ❌             | ✅          |
| 12   | ❌        | ❌          | ❌             | ✅          |
| 13   | ❌        | ❌          | ❌             | ✅          |
| 14   | ❌        | ❌          | ❌             | ✅          |
| 15   | ❌        | ❌          | ❌             | ✅          |
| 16   | ❌        | ❌          | ❌             | ✅          |
| 17   | ❌        | ❌          | ❌             | ✅          |
| 18   | ❌        | ❌          | ❌             | ✅          |
| 19   | ❌        | ❌          | ❌             | ✅          |
| 20   | ❌        | ❌          | ❌             | ✅          |
| 21   | ❌        | ❌          | ❌             | ✅          |
| 22   | ❌        | ❌          | ❌             | ✅          |
| 23   | ❌        | ❌          | ❌             | ✅          |
| 24   | ❌        | ✅          | ✅             | ✅          |

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                                 | Wave | Mode           | Depends on | Status      | Completed at      | Commit SHA |
| --- | ----------------------------------------------------- | ---- | -------------- | ---------- | ----------- | ----------------- | ---------- |
| 01  | Schema foundation + default seeds                     | 1    | serial         | —          | `completed` | 2026-04-20T14:15Z | c5ee2128   |
| 02  | Fix broken behaviour endpoints                        | 2    | parallel-safe  | 01         | `completed` | 2026-04-20T13:27Z | 16bffbb4   |
| 03  | Wellbeing dashboard-summary aggregator                | 2    | parallel-safe  | 01         | `deploying` |                   |            |
| 04  | AI flag service + notification routing                | 2    | parallel-safe  | 01         | `deploying` |                   |            |
| 05  | Behaviour AI services                                 | 3    | parallel-safe  | 01, 04     | `pending`   |                   |            |
| 06  | Document generation lifecycle                         | 3    | parallel-safe  | 01, 04     | `pending`   |                   |            |
| 07  | Exclusion + amendment + ack services                  | 3    | parallel-safe  | 01, 04     | `pending`   |                   |            |
| 08  | Pastoral hidden services (DSAR, import, SST AI, etc.) | 3    | parallel-safe  | 01, 04     | `pending`   |                   |            |
| 09  | Safeguarding, admin repair, policy engine ops         | 3    | parallel-safe  | 01, 04     | `pending`   |                   |            |
| 10  | Page crash fixes (5 pages)                            | 4    | parallel-risky | 02, 03     | `pending`   |                   |            |
| 11  | Behaviour analytics URL fix + endpoint reconnects     | 4    | parallel-risky | 02         | `pending`   |                   |            |
| 12  | Translation backfill (en + ar)                        | 4    | parallel-risky | 02         | `pending`   |                   |            |
| 13  | Wellbeing super-hub + sub-strip removal               | 5    | parallel-risky | 03, 12     | `pending`   |                   |            |
| 14  | Behaviour sub-hub                                     | 5    | parallel-risky | 03, 12     | `pending`   |                   |            |
| 15  | Staff wellbeing folded sub-hub                        | 5    | parallel-risky | 12         | `pending`   |                   |            |
| 16  | Early-warnings flagship sub-hub                       | 5    | parallel-risky | 03, 12     | `pending`   |                   |            |
| 17  | Safeguarding sub-hub                                  | 5    | parallel-risky | 09, 12     | `pending`   |                   |            |
| 18  | Tenant admin → AI flags page                          | 5    | parallel-risky | 04, 12     | `pending`   |                   |            |
| 19  | AI features UI                                        | 6    | parallel-risky | 05, 14, 18 | `pending`   |                   |            |
| 20  | Document generation UI                                | 6    | parallel-risky | 06, 14     | `pending`   |                   |            |
| 21  | Exclusion + restrictions + amendments + ack UI        | 6    | parallel-risky | 07, 14     | `pending`   |                   |            |
| 22  | Pastoral hidden-feature UI                            | 6    | parallel-risky | 08         | `pending`   |                   |            |
| 23  | Safeguarding hidden + recognition + policy + admin UI | 6    | parallel-risky | 09, 14, 17 | `pending`   |                   |            |
| 24  | Polish, Playwright multi-role sweep, docs             | 7    | serial         | 10–23      | `pending`   |                   |            |

`Depends on` lists the minimum cross-wave prerequisites. In strict wave order these are auto-satisfied; the column lets the slash command and human double-check.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> Europe/Dublin
- **Commit:** <sha>
- **Deployed to production:** yes / no (if no, explain)
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs later attention, with owner.
- **Session notes (optional):** anything weird or surprising.
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema foundation + default seeds

- **Completed:** 2026-04-20T14:15Z Europe/Dublin
- **Commit:** c5ee2128 (local); rebased to `ef6402ff` on production via `git am`
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the wellbeing rebuild's database foundation. New tables:
  `tenant_ai_flags` (per-module AI gate; 4 rows per tenant, enabled=false)
  and `tenant_notification_preferences` (wellbeing_channels JSONB for
  email/sms/whatsapp per event; in-app always on). Extended
  `behaviour_categories` with `requires_parent_ack`,
  `auto_create_pastoral_concern`, `converts_to_safeguarding`. Both new
  tables ship with `FORCE ROW LEVEL SECURITY` + tenant_isolation
  policies in post_migrate.sql and in the authoritative
  `packages/prisma/rls/policies.sql` catalogue. Migration data-seeds
  all 5 existing tenants (NHQS + stress-a/b/c/d): 20 AI flag rows, 5
  notification preference rows, 31 × 5 behaviour categories (zero-count
  tenants only). Four new permissions (`ai_flag.manage`,
  `wellbeing.view_dashboard`, `safeguarding.dedicated_view`,
  `wellbeing_notifications.configure`) wired into
  `packages/shared/src/constants/permissions.ts` PERMISSIONS +
  PERMISSION_TIER_MAP + SYSTEM_ROLE_PERMISSIONS, the prisma seed catalogues
  (`seed/permissions.ts`, `seed/system-roles.ts`), and role_permission
  grants backfilled on existing tenants via migration SQL.
  New helpers: `packages/prisma/src/wellbeing-defaults.ts` exports
  `seedWellbeingDefaultsForTenant` / `seedWellbeingDefaultsForAllTenants`.
  Category list lives at
  `packages/prisma/src/seed-data/wellbeing-default-categories.ts`.
  Shared types at `packages/shared/src/wellbeing/index.ts` via
  subpath export. `TenantsService.createTenant` and dev `seed.ts` both
  call the new seed helper after the inbox seed.

- **Follow-ups:**
  - **28 vs 31 categories** — PLAN.md headline says "Twenty-eight
    categories" but its own enumerated list contains 31. Shipped all 31. Future docs pass: reconcile the count in PLAN.md §5 headline.
  - **Two behaviour-category seed paths** — `seed/behaviour-seed.ts`
    still bootstraps new tenants with the legacy 12 sanction-outcome
    categories (Praise / Merit / Detention …). `seedWellbeingDefaultsForTenant`
    only touches the table when count === 0, so new tenants keep the
    legacy 12 and never get the new 31. Existing tenants that happened
    to have zero categories received the 31. A future rebuild wave
    should reconcile these two seed paths (probably by merging the 31
    into `seed/behaviour-seed.ts` with matching policy rules + templates).
  - **`designated_safeguarding_lead` role** — impl file wanted
    `safeguarding.dedicated_view` granted to this role, but no such
    role exists in `TENANT_SYSTEM_ROLES` yet. Permission was granted
    to school_owner/principal/vice_principal only. When Wave 5 Impl 17
    (safeguarding sub-hub) or a future impl introduces the DSL role,
    it MUST also grant `safeguarding.dedicated_view` to it.
  - **Permission backfill is migration-side-only** — existing
    tenants' role_permission grants were added by the migration SQL.
    If the migration SQL hadn't worked, we'd have followed the
    `SafeguardingPermissionsInit` OnModuleInit pattern. The current
    implementation doesn't have a boot-time init, so if Wave 5 adds
    new roles or new tenants created between the migration and a
    redeploy don't go through `tenants.service.ts` (unlikely), they
    would be missing grants. Wave 5 Impl 18 (AI flags admin page)
    should confirm this is still fine or add a boot init.
  - **Production behaviour_categories count** — both NHQS and stress-a
    showed 0 categories before migration, so both received the new 31.
    That implies these tenants were never seeded with the legacy 12 —
    possibly because they predate `seedBehaviourData` being wired in
    or because they were stress-tested through a different path.
    Verify behaviour analytics still work on these tenants on the next
    Wave 2 backend pass.

- **Session notes:**
  Production rebuild required chown fixes on `apps/*/dist` and
  `node_modules/.pnpm/@prisma+client*` before the edupod user could
  overwrite the existing build artefacts (previous build had been run
  as root). After rebuild, turbo reported a `@school/prisma` cache
  hit; had to `rm -rf packages/prisma/dist` and rebuild to force the
  new compiled output. The old `api-error.log` (210MB, last written
  Apr 5) contains stale `ERR_MODULE_NOT_FOUND` entries from prior
  deploys — unrelated to this deployment. New processes start clean.

### [IMPL 02] — Fix broken behaviour endpoints

- **Completed:** 2026-04-20T13:27Z Europe/Dublin
- **Commit:** 16bffbb4 (local); rebased to `7dbbb3bb` on production via `git am`
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Fixed the four broken surfaces the /behaviour redesign sits on top of.
  New endpoints:
  - `GET /api/v1/behaviour/incidents/stats` — aggregate KPI counts
    (total/positive/negative incidents + open/overdue tasks). Root cause
    of the 400 toast was a missing route: requests hit
    `/behaviour/incidents/:id` and ParseUUIDPipe rejected "stats".
    Static route declared before `:id` in `behaviour.controller.ts`.
  - `GET /api/v1/behaviour/templates` — flat paginated list of
    `behaviour_description_templates`, projected into the frontend's
    `TemplateOption` shape (`id`, `name`, `body_template`). `name` and
    `body_template` both map to the DB `text` column; no schema change.
    Returns `{data: [], meta: {total: 0}}` for tenants with no templates.
  - `GET /api/v1/behaviour/recognition` — top-level recognition feed
    backed by positive `behaviour_incidents`, shape matches
    `RecognitionItem`. Supports `status=published` (default) | `pending`
    | `all`, plus `academic_year_id` / `student_id` filters.
    Fixed: `listTasksQuerySchema.assigned_to_id` now accepts the `"me"`
    sentinel (alongside UUID). `BehaviourTasksService.listTasks` gained a
    `userId` arg and resolves "me" server-side. Shared schemas:
    `listTemplatesQuerySchema`, `recognitionListQuerySchema`,
    `RECOGNITION_LIST_STATUS`. Production smoke confirmed all four routes
    return 200 + canonical shapes on NHQS.

- **Follow-ups:**
  - **Empty NHQS state** — stats/templates/recognition/tasks all return
    zero on NHQS today. Impl 01's note about "0 behaviour_categories"
    - fresh migration-seeded 31 categories implies no incidents have
      been logged yet; once UI is wired up (Wave 4), we should seed a
      handful of fixture incidents for NHQS so the /behaviour dashboard
      doesn't demo as empty.
  - **Recognition award source duplication** — the new list endpoint
    reads positive incidents; the existing
    `GET /behaviour/recognition/awards` reads `behaviour_recognition_awards`
    (manual awards). The Wave 6 impl 23 rebuild of the Recognition page
    should decide whether to merge these feeds or keep them as separate
    tabs. For now both live side-by-side.
  - **Behaviour templates name truncation** — `name` maps to the full
    `text` (up to 500 chars). If UI chips need a shorter label, truncate
    client-side or introduce a separate `label` column in a later pass.

- **Session notes:**
  Sibling sessions impl 03 + impl 04 were running concurrently in the
  same tree (Wave 2 parallel-safe). Applied H3 anyway: every `git add`
  used explicit pathspec; sibling files (`app.module.ts`,
  `read-facades.module.ts`, new `wellbeing-aggregate/` and `ai-flags/`
  dirs) were never staged. Production log was still on the pre-Wave-2
  version when I deployed, so I split my local 2-commit patch into a
  code-only patch (applied cleanly) and deferred the production log
  update to this record's separate commit. Stats shows `total_incidents: 0`
  on NHQS today — expected given no behaviour incidents logged yet.
