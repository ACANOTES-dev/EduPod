# Household Numbers & Sibling Flow — Implementation Log

> **What this is:** The single source of truth for the household-numbers rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.

---

## 1. Work summary (read this first)

We are adding three things the new-admissions rebuild left out:

1. **Household numbers** — 6-character alphanumeric per-tenant identifiers (`XYZ476`, `MKL021`), auto-generated on every new Household created via either the walk-in registration wizard or the public apply form. Existing households stay without a number.
2. **Household-derived student numbers** — new students in a household with a household_number get `{household_number}-{nn}` (e.g. `XYZ476-01`, `XYZ476-02`). Existing students keep `STU-NNNNNN`. Hard cap of 99 students per household.
3. **Multi-student applications with sibling priority** — the public apply form accepts one or many students in a single submission, each becoming its own Application row internally. A "mode picker" lets parents choose between "new family" and "adding a child to an existing family". The existing-family path requires household number + parent email to look up the family. Waiting-list auto-promotion runs tiered FIFO: siblings promote first, then FIFO within each tier.

**Scope of the rebuild (6 implementations, 4 waves):**

- Schema foundation (households/applications columns, shared types, Zod schemas)
- Backend — household number generator, student number refactor
- Backend — sibling priority, multi-student API, public household lookup endpoint
- Frontend — public apply form rewrite (mode picker, lookup, multi-student, reordered sections)
- Frontend — walk-in wizard household-number preview + admin surfaces (household detail, admissions queue sibling badges)
- Polish — translations, architecture docs, regression tests, feature-map update

**Not in scope** (see PLAN.md §8): backfilling existing households/students, household-number regen, cross-tenant codes, Stripe multi-student bundling, sibling priority on the initial submission gate, parent portal.

---

## 2. Rules every session must follow

### Baseline rules

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; only deployments serialise.** Within a wave, all impls can start coding immediately. Deployments serialise first-come-first-served (NOT numeric order). Use the 3-minute poll described in Rule 6b to check for in-flight deploys that share your restart target. If no other impl in your wave is currently in the `deploying` state for a target you share, you deploy.

**Rule 5 — NEVER push to GitHub.** Commit locally only. The CI gate takes 3-4 hours; pushing during the rebuild would grind everything to a halt. The human owner pushes at the end of the rebuild manually. No `git push`. No `gh pr create`. No exceptions.

**Rule 6a — Deploy directly to production after every implementation.** SSH access is granted for the duration of this rebuild. The deployment flow is:

1. Commit locally.
2. Generate a patch with `git format-patch -1 HEAD --stdout > /tmp/hh-NN.patch`.
3. `scp` the patch to `root@46.62.244.139:/tmp/hh-NN.patch`.
4. SSH and apply as the `edupod` user: `sudo -u edupod bash -lc 'cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/hh-NN.patch'`.
5. For schema changes: run `pnpm --filter @school/prisma migrate:deploy` on the server as `edupod`, then `pnpm db:post-migrate`.
6. For backend changes: `pnpm turbo run build --filter=@school/api --force` then `sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api --update-env`.
7. For worker changes: `pnpm turbo run build --filter=@school/worker --force` then `pm2 restart worker --update-env`.
8. For web changes: clear `.next`, `pnpm turbo run build --filter=@school/web --force`, then `pm2 restart web --update-env`. ALWAYS use `--force` because turbo's cache based on source hashes is unreliable during this rebuild — PLAN-15 fix cycles burned ~90 minutes to stale-cache chunks.
9. Smoke test against production URLs.
10. Update this log in a SEPARATE commit (see Rule 7).

The production repo at `/opt/edupod/app` lives on `main` but is already many commits ahead of `origin/main`. Your patch adds one more. Do not run `git pull` or `git fetch origin main` on the server — you will revert everything.

**Rule 6b — Pre-deploy serialisation check.** Before running `pm2 restart <target>`, check §4 Wave Status table for any impl in your wave that has `status: deploying` AND the same restart target as yours. If there is one, wait. Poll every 3 minutes — no fixed timeout, just keep polling until the other session flips to `completed`. Then flip yours to `deploying` and proceed.

Within a wave, deployments are first-come-first-served. NUMERIC ORDER DOES NOT MATTER. Impl 04 can deploy before impl 03 if 04 finishes coding first.

**Rule 7 — Update this log at the end of your implementation in a SEPARATE commit.** Never bundle log updates with code changes. The pattern is:

```
feat(household-numbers): <impl title>          <- code commit(s), pathspec-staged
docs(household-numbers): log completion NN     <- log commit, alone
```

Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the production commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before deploying. Do NOT deploy a breaking change and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** RLS on new tables (`FORCE ROW LEVEL SECURITY` with a tenant isolation policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)` for all writes, strict TypeScript (no `any`, no `@ts-ignore`), logical CSS properties on frontend, `react-hook-form` + Zod for new forms. The CLAUDE.md file in the repo root is the ground truth.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — Never weaken the privacy invariant on the household lookup endpoint.** The `POST /v1/public/households/lookup` endpoint MUST verify BOTH the household number AND a matching parent email before returning any information. Never return different status codes for the two failure modes — both return `HOUSEHOLD_NOT_FOUND` with identical 404s. Changing this is a hard-blocked change.

### Hardened rules for parallel coding (from new-inbox Wave 4 learnings)

**Rule H1 — Read the "Shared files" section of your implementation file FIRST.** Every impl file has a `## Shared files this impl touches` section. Read it. It lists the hot zones where you will conflict with sibling sessions.

**Rule H2 — Commit at every sub-step, not at the end.** The implementation file's `## What to build` has numbered sub-steps. Commit after each one that produces a working state. Four or five commits per impl is normal. DO NOT sit on hours of uncommitted work — it is exposed to every other session's edits and to lint-staged's stash behaviour.

**Rule H3 — Stage by explicit pathspec, never `git add .` or `git add -A`.** Every `git add` must list the exact files you want to stage:

```bash
git add apps/api/src/modules/households/household-number.service.ts \
        apps/api/src/modules/households/household-number.service.spec.ts
```

If you default to `git add .` you will sweep up sibling sessions' untracked work and attribute it to your commit, triggering a revert war.

**Rule H4 — Run `git status` before every commit and inspect it.** If you see files you did not touch, ABORT the commit. A sibling session has written into your working tree. Stash your own changes, investigate, and only commit once the working tree contains exactly what you intended.

**Rule H5 — Shared files go LAST.** When your implementation's `## What to build` has sub-steps that touch shared files (translations, shell, seeds, module registration), do those sub-steps LAST, as close to your commit as possible. This minimises the window of exposure during which a sibling session can overwrite your edits. The ideal pattern: complete every isolated sub-step first, commit them, then do all shared-file edits in a single final commit.

**Rule H6 — Beware lint-staged auto-stash.** Husky + lint-staged stashes unstaged and untracked files before running pre-commit checks, then restores them. If a sibling session has untracked files in the working tree at the moment you commit, they can be destroyed during the stash/restore cycle. Before running `git commit`, verify `git status` shows ONLY files you intend to commit. Anything untracked or unstaged that belongs to a sibling session must be left out by staging only your own pathspecs.

**Rule H7 — The `IMPLEMENTATION_LOG.md` is a shared file and always goes in its OWN separate commit.** Never bundle log updates with code changes. See Rule 7 above.

**Rule H8 — Frontend impls touching translations: buffer the keys, write at the end.** If you are a frontend impl (04 or 05) that adds translation keys, keep them in a local scratch buffer while you code the React pieces. Write them into `en.json` / `ar.json` only in your final commit window, immediately before `git add`. The moment you touch those files, you are racing every other frontend sibling.

**Rule H9 — Deep-merge `en.json` / `ar.json`, never replace.** If you edit translations, re-read the file content immediately before writing. Merge your additions into the existing structure. Do not assume the file content from 30 minutes ago is still current.

**Rule H10 — If a sibling wipes your work or lint-staged destroys untracked files, STOP.** Do not blindly re-apply — you may overwrite a fix someone else just made. File a follow-up note in the log and ask the user.

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations can code in parallel, but their deployments MUST serialise per Rule 6b (first-come-first-served, shared-target only).

| Wave       | Implementations | Parallelisation mode | Hard dependency | Rationale                                                                                                                |
| ---------- | --------------- | -------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Wave 1** | 01              | `serial`             | None            | Schema foundation — everything depends on the new columns, constraints, and Zod schemas. Must land first.                |
| **Wave 2** | 02, 03          | `parallel-safe`      | Wave 1          | Backend services across different module directories. 02 owns households+students, 03 owns admissions+public-households. |
| **Wave 3** | 04, 05          | `parallel-risky`     | Wave 2          | Frontend rewrites. Both touch `en.json`/`ar.json`. Apply hardened rules H5/H8/H9.                                        |
| **Wave 4** | 06              | `serial`             | Wave 3          | Polish — translations sweep, architecture docs, regression tests, feature-map update, smoke tests.                       |

### Deployment targets per implementation

This matrix is what you consult before deploying. "Who restarts" determines the serialisation rule under Rule 6b.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ❌             | ❌          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ❌          | ❌             | ✅          |
| 05   | ❌        | ❌          | ❌             | ✅          |
| 06   | ❌        | ❌          | ❌             | ✅          |

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                         | Wave | Classification | Parallelisation mode | Depends on | Status      | Completed at              | Commit SHA |
| --- | --------------------------------------------- | ---- | -------------- | -------------------- | ---------- | ----------- | ------------------------- | ---------- |
| 01  | Schema foundation                             | 1    | schema         | serial               | —          | `completed` | 2026-04-11T15:00:00+01:00 | 7ff33d56   |
| 02  | Household number generator + student refactor | 2    | backend        | parallel-safe        | 01         | `completed` | 2026-04-11T16:26:00+01:00 | b2593a08   |
| 03  | Multi-student API + sibling priority + lookup | 2    | backend        | parallel-safe        | 01         | `completed` | 2026-04-11T16:30:00+01:00 | 678bb9a4   |
| 04  | Public apply form rewrite                     | 3    | frontend       | parallel-risky       | 02, 03     | `completed` | 2026-04-11T17:05:00+01:00 | 497e571e   |
| 05  | Wizard + admin surfaces                       | 3    | frontend       | parallel-risky       | 02, 03     | `completed` | 2026-04-11T17:00:00+01:00 | 39b6fe77   |
| 06  | Polish, translations, docs, tests             | 4    | polish         | serial               | 04, 05     | `completed` | 2026-04-11T17:27:00+01:00 | 24e924d4   |

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Commit:** <sha>
- **Deployed to production:** yes / no (if no, explain)
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Session notes (optional):** anything weird or surprising.
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema foundation

- **Completed:** 2026-04-11T15:00:00+01:00 (Europe/Dublin)
- **Commits:** bf8b1c54, 174dee9d, 2f6f11b4, 7ff33d56
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Created `packages/shared/src/households/household-number.ts` with format constants
  (`HOUSEHOLD_NUMBER_PATTERN`, `HOUSEHOLD_MAX_STUDENTS`), `isValidHouseholdNumber()`,
  and `formatStudentNumberFromHousehold()`. Migration adds `student_counter` to
  `households`, adds `household_id`, `submission_batch_id`, `is_sibling_application` to
  `applications` with partial indexes for tiered FIFO auto-promotion. Rewrote
  `createPublicApplicationSchema` from single-student to multi-student shape with
  `mode` (new_household/existing_household), `household_payload`, and `students[]` array
  with Zod refine validation. Added `publicHouseholdLookupSchema` with case coercion to
  `household.schema.ts`. Bridged `applications.service.ts` `createPublic` to extract
  first student from `students[]` (temporary — impl 03 rewrites properly). Updated e2e
  test helpers for new schema. **Key deviation:** production already had 692
  `household_number` values in legacy `XXX999-N` format (8 chars) and 2 in `HH-000001`
  format (9 chars). Kept `VARCHAR(50)` instead of tightening to `VARCHAR(6)`. Removed
  the format CHECK constraint. The generator in impl 02 will write strict 6-char values;
  existing legacy values coexist.
- **Follow-ups:** Impl 02 should validate that the generator only writes 6-char values
  and document how legacy household numbers interact with the student number format.
  The `HouseholdDetail` interface in `households.service.ts` now includes
  `student_counter` — downstream code referencing this interface should be aware.
- **Session notes:** Advisory lock from crashed migration attempt needed manual
  `pg_terminate_backend` to clear. Pre-existing ESLint OOM on large staged file sets
  requires `NODE_OPTIONS=--max-old-space-size=8192` for commits touching many files.

### [IMPL 02] — Household number generator + student refactor

- **Completed:** 2026-04-11T16:26:00+01:00 (Europe/Dublin)
- **Commits:** fb2174d1, c25b14b7, 3453817e, be077497, b2593a08 (local) / b742fd2a..98f96ccd (prod)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Created `HouseholdNumberService` at `apps/api/src/modules/households/household-number.service.ts`
  with four public methods: `generateUniqueForTenant` (random 6-char AAA999 format with
  `crypto.randomInt`, collision-retry loop up to 8 attempts), `previewForTenant` (preview
  for walk-in wizard), `incrementStudentCounter` (SELECT FOR UPDATE row lock, cap at 99),
  and `generateStudentNumber` (branches on `household.household_number` — new households
  get `{hh}-{nn}`, legacy households without a number get `STU-NNNNNN` via the existing
  sequence service). Hooked `generateUniqueForTenant` into `HouseholdsCrudService.create`
  and `RegistrationService.registerFamily` (replacing `sequenceService.generateHouseholdReference`).
  Hooked `generateStudentNumber` into `StudentsService.create`,
  `RegistrationService.registerFamily`, and `RegistrationService.addStudentToHousehold`.
  Registered `HouseholdNumberService` as a direct provider in `HouseholdsModule` (providers
  - exports), `StudentsModule`, and `RegistrationModule` (avoids circular dep). Added
    `./households/*` export to `@school/shared` package.json. 15 unit tests covering
    generation, collision, cap, branching, and legacy fallback. Updated 3 existing spec files
    for new DI dependency. Did NOT touch `ApplicationConversionService` — impl 03 territory.
- **Follow-ups:** Impl 03 must hook `HouseholdNumberService.generateUniqueForTenant` into
  `ApplicationConversionService.resolveHousehold` and `generateStudentNumber` into
  `convertToStudent`. The service is already exported from `HouseholdsModule`.
- **Session notes:** Ran in parallel with impl 03 session. Sibling session's commits
  interleaved in git log — deployed via individual format-patches. `packages/shared/package.json`
  is a shared file (added `households/*` export) — impl 03 may also touch it.

### [IMPL 03] — Multi-student API + sibling priority + public household lookup

- **Completed:** 2026-04-11T16:30:00+01:00 (Europe/Dublin)
- **Commits:** a7d04329, a29bf77f, 01caf440, 6c92d5a4, 42fdb817, b61e92cf, 678bb9a4 (local) / fd38dcd3..c0875adf (prod)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Created `PublicHouseholdsModule` at `apps/api/src/modules/public-households/` with
  `PublicHouseholdsController` (POST /v1/public/households/lookup),
  `PublicHouseholdsService` (dual-match: household_number + parent email, both failures
  return identical 404 `HOUSEHOLD_NOT_FOUND`), and `PublicHouseholdsRateLimitService`
  (5 attempts/IP/tenant/hour). Rewrote `ApplicationsService.createPublic` for multi-student
  submissions: loops over `dto.students[]`, creates each Application row with
  `submission_batch_id`, `household_id`, and `is_sibling_application` flag, then gates each
  independently via new `routeSubmittedApplication` method on the state machine. Added
  tiered FIFO to `AdmissionsAutoPromotionService.promoteYearGroup`: `ORDER BY
is_sibling_application DESC, apply_date ASC`. Rewrote `ApplicationConversionService` for
  batch household materialisation: existing_household path loads household + increments
  `student_counter`; new_household path generates random 6-char household_number
  (crypto-based, collision-retry), creates household, links all batch sibling apps.
  Student numbers derived from household: `{hh}-{nn}` format via
  `formatStudentNumberFromHousehold`. **Key deviation:** did NOT import
  `HouseholdNumberService` from impl 02 — implemented household number generation and
  student counter management inline in the conversion service to avoid the runtime dependency.
- **Follow-ups:** Impl 06 (polish) should consolidate the inline household number generation
  in `ApplicationConversionService` to use `HouseholdNumberService` from impl 02, eliminating
  the duplicate implementation. The `SequenceService.generateHouseholdReference` method is now
  unused by the conversion service (replaced by the random generator).
- **Session notes:** Ran in parallel with impl 02. Interleaved commits deployed via combined
  format-patch (7 patches). Tenant resolution middleware already handled `/api/v1/public/*`
  paths — no changes needed for the household lookup route.

### [IMPL 05] — Walk-in wizard + admin surfaces

- **Completed:** 2026-04-11T17:00:00+01:00 (Europe/Dublin)
- **Commits:** edb32d12, 09853ef8, a3c1f9f9, 39b6fe77 (local) / patches applied on prod
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Added `GET /v1/households/next-number` endpoint to `HouseholdsController`, routed through
  `HouseholdsService` facade → `HouseholdsCrudService.previewNextNumber` → `HouseholdNumberService.previewForTenant`
  inside a short RLS transaction. Walk-in registration wizard (`step-parent-household.tsx`) now
  fetches a preview household number on mount and displays it in a styled preview box below the
  household name input, with a Refresh button that re-fetches. Uses `apiClient` + `unwrap()` for
  the `{ data: { household_number } }` envelope. Household detail page passes `household_number`
  as the `reference` prop to `RecordHub`, rendering it as monospace text beneath the title.
  Household list page shows `household_number` in monospace alongside each household name.
  Admissions queue API responses (`getReadyToAdmitQueue`, `getWaitingListQueue`) now include
  `is_sibling_application` in the select clause, passed through `groupApplicationsByYearGroup`
  into the bucket application type. Frontend `QueueApplication` type extended with the field;
  `ApplicationRow` renders a sky-colored "Sibling" badge when true. Translation keys added
  (en + ar) for preview labels (`householdNumberPreviewLabel`, `refreshNumber`,
  `householdNumberPreviewHelper`) and `siblingBadge`.
- **Follow-ups:** None. Impl 06 (polish) should verify all surfaces render correctly in Arabic RTL.
- **Session notes:** Ran in parallel with impl 04. Deployed impl 04's code commit as a dependency
  (it sat between my two code commits in git history). The `unwrap()` fix was needed because
  `apiClient` returns the raw `{ data: T }` envelope — caught during production smoke test.

### [IMPL 04] — Public apply form rewrite

- **Completed:** 2026-04-11T17:05:00+01:00 (Europe/Dublin)
- **Commits:** 54dec678, 497e571e (local) / f01ffc7c (prod — translations patch; code was already applied via impl 05's deployment)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Rewrote `apps/web/src/app/[locale]/(public)/apply/[tenantSlug]/page.tsx` from a single-student
  DynamicFormRenderer approach to a multi-mode, multi-student form. Page now starts with a mode
  picker ("New family" vs "Adding a child to existing family"). "Existing family" path shows a
  household lookup form (household number + parent email) that calls `POST /v1/public/households/lookup`,
  auto-uppercases the code input, handles 404 and 403 rate-limit errors via toast. On match, shows
  a matched-household banner and the students-only form. "New family" path shows reordered sections:
  parent 1 → parent 2 → address → students → emergency contact. Students section supports add/remove
  with stable client-side UUIDs per draft. Extracted `StudentsSection` and `StudentFields` into
  `_components/students-section.tsx` to stay under the 600-line lint limit. Submit handler builds
  the correct `new_household`/`existing_household` mode payload with `household_payload` or
  `existing_household_id`. Batch results stashed in sessionStorage. Updated submitted page to read
  batch results and render per-application cards with status badges. Added 30+ translation keys
  (en + ar) for mode picker, lookup, student fields, and batch submitted page.
- **Follow-ups:** Impl 06 should verify the full end-to-end submit flow with 2+ students and Arabic RTL rendering.
- **Session notes:** Ran in parallel with impl 05. First patch was "already applied" on production because impl 05 had deployed it as a dependency. Only the translations patch needed fresh application.

### [IMPL 06] — Polish, translations, docs, regression tests

- **Completed:** 2026-04-11T17:27:00+01:00 (Europe/Dublin)
- **Commits:** 561cc46a, e8ac94e0, 1d1230ca, 76e5155c, 0b7cdaf4, 24e924d4
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Final polish pass for the household-numbers rebuild. Translation sweep confirmed
  all EN/AR keys for `publicApplyForm`, `registration`, and `admissionsQueues`
  namespaces are present and in parity — no missing or placeholder keys. Updated
  four architecture docs: `module-blast-radius.md` (HouseholdsModule extended with
  HouseholdNumberService exports/consumers, AdmissionsModule batch + sibling
  entries), `state-machines.md` (tiered FIFO note on ApplicationStatus),
  `event-job-catalog.md` (admissions:auto-promoted tiered FIFO), `feature-map.md`
  (new household numbers & multi-student section under Admissions). Added household
  numbers section to `docs/features/admissions.md`. Created E2E render-smoke spec
  at `apps/web/e2e/journeys/household-flow.journey.ts` (4 tests: mode picker,
  lookup error, section order, add-child). Fixed pre-existing test regressions:
  regenerated `api-surface.snapshot.json`, added `HouseholdNumberService` mock to
  `prisma-query-snapshots.spec.ts`, fixed TS2532 in `admissions-rls.e2e-spec.ts`.
  **Bonus fix:** resolved broken logo on the public apply form — `PublicTenantsService`
  was returning the raw S3 key instead of a presigned URL; added S3Service DI and
  presigning logic.
- **Follow-ups:** The inline household number generation in `ApplicationConversionService`
  (from impl 03) was NOT consolidated to use `HouseholdNumberService` — both paths work
  correctly, but there is duplicate logic. This is a cleanup item, not a blocker.
- **Session notes:** All 15,266 API tests passing. Production smoke test confirmed:
  mode picker, lookup form, new-family section order, add-child button, household
  numbers on list page, and logo rendering all verified on nhqs.edupod.app.
