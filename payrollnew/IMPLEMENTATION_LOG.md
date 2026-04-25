# Payroll Overhaul — Implementation Log

> **What this is:** The single source of truth for the payroll-overhaul rebuild. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.

---

## 1. Work summary (read this first)

We are fixing the payroll module. A four-agent end-to-end audit (2026-04-25) confirmed that the visual redesign of the payroll hub was completed but the wiring underneath was not. Specifically: the calculation engine ignores allowances, deductions, adjustments, one-offs, staff attendance, and class delivery; two of three worker jobs are dead because of job-name mismatches; the frontend redesign references endpoints that don't exist on the backend; the direct and approval finalisation paths use different math (Number vs Decimal) and different payslip-number formats; and ten tables in the most recent payroll migration are missing `FORCE ROW LEVEL SECURITY` inline.

This rebuild does NOT replace the schema or the morph-shell pages. It rewrites the calculation engine to consume all inputs, fixes the worker job names and Redis-key formats, builds the missing endpoints, aligns the frontend contract, unifies the two finalisation paths under a single `FinalisationService`, and ships the regression tests that should have caught this before it shipped. See `PLAN.md` for the full spec, lifecycle walk-through, and component map.

**Scope of the rebuild (7 implementations, 5 waves):**

- Schema + shared foundation (new entry-total columns, idempotent deduction-application table, FORCE-RLS retrofit migration, shared `job-names` + `redis-keys` + `payslip-number` modules in `@school/shared`)
- Calculation engine + input integration (Decimal-safe `CalculationService`, new `PayrollInputResolver`, new `FinalisationService` shared by direct + approval paths, period-bracketed compensation query, idempotent deduction application)
- API contract + missing endpoints (build `/my-payslips`, `/my-payslips/ytd`, `/runs/:id/allowances|adjustments|anomalies|comparison`, rename `email-to-accountant`, fix PATCH-vs-PUT, add `@ModuleEnabled('payroll')`, fix `isSchoolOwner`, add `payroll.manage_attendance` and `payroll.self_service` permissions)
- Worker pipelines (mass-export and session-generation job names from shared constants, Redis keys via shared builders, payslip-number generator unified, idempotency via `jobId`, session-generation counts delivery records and respects closures)
- Frontend operational pages (runs detail + create dialog, compensation, staff-attendance, class-delivery, RHF + zod everywhere, error toasts, contract alignment)
- Frontend analytical + self-service pages (reports, exports, staff history, my-payslips, absences, hub dashboard)
- Polish (regression tests including RLS leakage + finalisation correctness, translation pass, mobile responsive sweep, dead-code removal, architecture-doc updates, smoke tests)

**Untouched by this rebuild:** the `PayrollModule` NestJS placement (stays top-level, NOT nested under FinanceModule); the `payroll.*` permission namespace (stays — does not migrate to `finance.payroll.*`); the historical payslip-number format on already-finalised runs (the new format applies only to newly finalised runs from the cutover onwards); the PDF visual template (the snapshot payload changes; the layout does not); the leave module's `/v1/payroll/absence-periods` endpoint (kept as-is, advisory).

---

## 2. Rules every session must follow

### Baseline rules

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; only deployments serialise, and only when they share a service restart target.** Deploy order is **first-come-first-served, not by implementation number**. If you're running task 04 and it finishes coding before task 03, task 04 deploys first. The only constraint: before entering the deploy phase, re-read the log; if another implementation in your wave is currently `deploying` AND shares a service restart target (API / worker / web — consult §3's deployment matrix), wait (poll every 3 minutes) until it flips to `completed`, then proceed. If it doesn't share a restart target, you can deploy concurrently without conflict.

**Rule 5 — NEVER push to GitHub.** Commit locally only. The CI gate is slow; pushing during this rebuild blocks everything. The human owner pushes the entire stack of accumulated commits manually at the end of the rebuild. No `git push`. No `gh pr create`. No exceptions.

**Rule 6 — Deploy directly to production after every implementation.** SSH access is granted for the duration of this rebuild. The deployment flow is:

1. Commit locally.
2. Generate a patch with `git format-patch -1 HEAD --stdout > /tmp/pay-NN.patch`.
3. `scp` the patch to `root@46.62.244.139:/tmp/pay-NN.patch`.
4. SSH and apply as the `edupod` user: `sudo -u edupod bash -lc 'cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/pay-NN.patch'`.
5. For schema changes: run `pnpm --filter @school/prisma migrate:deploy` on the server (as `edupod`). NOT `pnpm db:migrate` — that runs `migrate:dev` and offers to reset the database on drift. Then run `pnpm db:post-migrate`.
6. For backend changes: `pnpm turbo run build --filter=@school/api` then `sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api --update-env`.
7. For worker changes: `pnpm turbo run build --filter=@school/worker` then `pm2 restart worker --update-env`.
8. For web changes: clear `.next`, `pnpm turbo run build --filter=@school/web`, then `pm2 restart web --update-env`.
9. Smoke test against production URLs.
10. Update this log.

The production repo at `/opt/edupod/app` lives on `main` but is already many commits ahead of `origin/main`. Your patch adds one more. Do not run `git pull` or `git fetch origin main` on the server — you will revert everything.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the production commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before deploying. Do NOT deploy a breaking change and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** RLS on new tables (`FORCE ROW LEVEL SECURITY` with a tenant isolation policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)` for all writes, strict TypeScript (no `any`, no `@ts-ignore`, no `as unknown as` except the RLS cast), logical CSS properties on frontend, `react-hook-form` + Zod for new forms, co-located `.spec.ts` next to source. The `CLAUDE.md` file in the repo root is the ground truth.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — Never weaken privacy invariants.** Tenant isolation is non-negotiable. Encrypted bank details never leave the staff-profile boundary. The new `payroll.self_service` permission must scope `/my-payslips` to the calling user's own payslips ONLY — never accept a `staff_profile_id` query param that would let a user request someone else's payslips. Every new endpoint that touches a payroll table needs at least one RLS leakage test.

### Hardened parallel-coding rules (Wave-4 incident learnings)

The Wave 4 incident on the new-inbox rebuild taught us that frontend impls running in parallel destroy each other's work via `git add .` sweeps and lint-staged stash cycles. The following rules apply to every impl with any shared file, but are critical for Wave 4 of this rebuild:

**Rule H1 — Read your impl file's "Shared files this impl touches" section FIRST.** Every implementation file has it. Read it before writing code. It lists your conflict zones with sibling sessions.

**Rule H2 — Commit at every sub-step, not at the end.** The implementation file's `## What to build` has numbered sub-steps. Commit after each one that produces a working state. Three to five commits per impl is normal. DO NOT sit on hours of uncommitted work — it is exposed to every other session's edits and to lint-staged's stash behaviour.

**Rule H3 — Stage by explicit pathspec, NEVER `git add .` or `git add -A`.** Every `git add` must list the exact files you want to stage:

```bash
git add apps/api/src/modules/payroll/finalisation.service.ts \
        apps/api/src/modules/payroll/finalisation.service.spec.ts
```

If you default to `git add .` you will sweep up sibling sessions' untracked work and attribute it to your commit, triggering a revert war.

**Rule H4 — Run `git status` before every commit and inspect it.** If you see files you did not touch, ABORT the commit. A sibling session has written into your working tree. Stash your own changes with explicit pathspec, investigate, and only commit once the working tree contains exactly what you intended.

**Rule H5 — Shared files go LAST.** When your implementation's `## What to build` has sub-steps that touch shared files (translations, shell, seeds, module registration), do those sub-steps LAST, as close to your commit as possible. This minimises the window of exposure during which a sibling session can overwrite your edits. Ideal pattern: complete every isolated sub-step first, commit them, then do all shared-file edits in a single final commit.

**Rule H6 — Beware lint-staged auto-stash.** Husky + lint-staged stashes unstaged and untracked files before running pre-commit checks, then restores them. If a sibling session has untracked files in your working tree at the moment you commit, they can be destroyed during the stash/restore cycle. Before running `git commit`, verify `git status` shows ONLY files you intend to commit. Anything untracked or unstaged that belongs to a sibling session must be left out by staging only your own pathspecs.

**Rule H7 — `IMPLEMENTATION_LOG.md` is a shared file and always goes in its OWN separate commit.** Never bundle log updates with code changes. The pattern is:

```
feat(payroll): <impl title>                                    <- code commit(s), pathspec'd
docs(payroll): log completion of implementation NN             <- log commit, alone
```

Multiple sessions writing to the log at the same time cause merge noise, but isolating the log commit limits the blast radius.

**Rule H8 — Frontend translation buffer.** If you are a frontend impl touching translations, accumulate the new keys in a local scratch buffer (or a TODO at the top of your page file) and write them into `en.json`/`ar.json` ONLY in your final commit window. The moment you touch `en.json`, you are racing every other frontend sibling. Keep the window short.

**Rule H9 — Deep-merge `en.json` / `ar.json` edits, never replace the file.** If you edit these files, read the current content immediately before writing your additions, deep-merge your keys into the existing structure, write the result. Do not assume the file content you loaded 30 minutes ago is still current — re-read it just before the write.

**Rule H10 — If you discover a conflict you cannot resolve (sibling wiped your work, lint-staged destroyed untracked files, merge conflict in a shared file), STOP and file a follow-up note in the log. Do not blindly re-apply — you may overwrite a fix someone else just made.**

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND deploy on a first-come-first-served basis — **not** in implementation-number order. Whichever implementation reaches the deploy phase first takes the slot. Deployment only serialises (polling every 3 minutes) when another sibling is already `deploying` **and** shares a service restart target (API / worker / web, per the matrix below).

| Wave       | Implementations | Hard dependency | Parallelisation mode | Rationale                                                                                                                                                                                |
| ---------- | --------------- | --------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01              | None            | serial               | Schema + shared-type foundation. Every other impl depends on the new entry columns, the `payroll_deduction_applications` table, and the shared constants in `@school/shared/payroll`.    |
| **Wave 2** | 02              | Wave 1 complete | serial (single impl) | Calculation engine + input integration. The largest impl. Touches every input service plus `calculation.service.ts`, `payroll-runs.service.ts`, and introduces `FinalisationService`.    |
| **Wave 3** | 03, 04          | Wave 2 complete | parallel-safe        | API contract surface (03) and worker pipelines (04). 03 owns controllers; 04 owns worker processors. They share zero source files because all shared constants live in `@school/shared`. |
| **Wave 4** | 05, 06          | Wave 3 complete | parallel-risky       | Frontend rebuild. Both impls touch `apps/web/messages/en.json` and `ar.json`. Hardened rules H1–H10 apply. Each impl owns its own page directories.                                      |
| **Wave 5** | 07              | Wave 4 complete | serial (single impl) | Polish — regression tests, translation pass, mobile sweep, dead-code removal, architecture-doc updates, pre-launch smoke.                                                                |

### Deployment targets per implementation

This matrix is what you consult before deploying. "Who restarts" determines the serialisation rule.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ✅             | ❌          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ✅          | ✅             | ❌          |
| 05   | ❌        | ❌          | ❌             | ✅          |
| 06   | ❌        | ❌          | ❌             | ✅          |
| 07   | ❌        | ❌          | ❌             | ✅          |

Notes:

- 02 restarts the worker because `approval-callback.processor.ts` is rewritten to delegate to the new `FinalisationService`.
- 04 restarts the API because the small enqueue-site changes (job-name imports) live in API services.
- 03 and 04 share no source files but both restart the API; their deploys serialise via the 3-minute poll.
- 05 and 06 share no source files but both restart web; their deploys serialise via the 3-minute poll.

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                         | Wave | Classification | Parallelisation mode | Depends on | Status    | Completed at | Commit SHA |
| --- | --------------------------------------------- | ---- | -------------- | -------------------- | ---------- | --------- | ------------ | ---------- |
| 01  | Schema + shared foundation                    | 1    | schema         | serial               | —          | `pending` |              |            |
| 02  | Calculation engine + input integration        | 2    | backend        | serial               | 01         | `pending` |              |            |
| 03  | API contract + missing endpoints              | 3    | backend        | parallel-safe        | 01, 02     | `pending` |              |            |
| 04  | Worker pipelines + payslip number unification | 3    | worker         | parallel-safe        | 01, 02     | `pending` |              |            |
| 05  | Frontend operational pages                    | 4    | frontend       | parallel-risky       | 01, 02, 03 | `pending` |              |            |
| 06  | Frontend analytical + self-service            | 4    | frontend       | parallel-risky       | 01, 02, 03 | `pending` |              |            |
| 07  | Polish — tests, translations, mobile, docs    | 5    | polish         | serial               | 01–06      | `pending` |              |            |

Note: "Depends on" lists the minimum set of implementations that must be `completed` before this one can start. In strict wave order these are automatically satisfied — the column exists so the slash command and the human can double-check.

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
