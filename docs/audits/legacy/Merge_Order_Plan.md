# Audit Recovery — Merge Order Plan

> **Date**: 2026-04-01
> **Branches**: 12 audit worktree branches → `main`
> **Total commits**: 44 across all branches
> **Strategy**: Sequential branch merge in conflict-minimizing order, with forward-merge between waves

---

## Context

All 12 branches diverged from the same `main` commit (`5d939cde`). Each branch was worked dimension-by-dimension (all phases within a dimension in one session), rather than the original phase-by-phase plan. This means branches have overlapping file edits that would conflict if merged in the wrong order.

### Conflict Matrix Summary

```
                         Overlapping files with other branches
governance           1   (only architecture/pre-flight-checklist.md)
worker-test-health   15  (mostly spec file adjacency)
refactor-safety      22  (mostly package.json, jest configs)
backend-tests        28  (spec files + some service files)
ops                  30  (deploy scripts, CI workflows, health checks)
dx                   30  (CI workflows, package.json, docker)
security             36  (guards, services, CI workflows)
reliability          48  (services, cron, shared packages)
architecture         24  (module files, shared/index.ts, pre-flight)
maintainability      87  (services, translation files, shared)
modularity           79  (module files, services, barrel exports)
code-quality        123  (touches nearly every source file — 1,114 files total)
```

### Key Insight

**`code-quality` Phase B commit `d6faeb0f`** is a 1,061-file codemod (175 empty-catch fixes + import/order promotion to error + raw-SQL rule expansion). It touches every service, controller, and page in the codebase. It **must** go last. Rather than rebasing this monster commit, we cherry-pick only the new ESLint rules/helpers/configs, then re-run the codemods fresh against current main (see Wave 5).

---

## Merge Procedure (Per Step)

For each step:

1. `git checkout main`
2. `git merge --no-ff <branch>` — always `--no-ff` so the branch history is preserved and an entire dimension can be reverted with `git revert -m1 <merge-commit>`
3. If conflicts: resolve, commit the merge
4. `turbo type-check && turbo lint && turbo test` (full CI pre-flight — catch regressions early, not at Step 12)
5. Push to remote
6. Forward-merge main into remaining branches: `git checkout <branch> && git merge main` — **not** rebase, since all branches were pushed to remote. Rebasing would rewrite history and require force-push. Forward-merge gives the same conflict resolution without history rewriting.

---

## Wave 1 — Zero-Conflict Branches

These branches are almost entirely new files with no meaningful overlap with each other. Can be merged in rapid succession without rebasing between them.

### Step 1: `audit/governance` (5 commits, 10 files, 9 new)

| Order | Commit     | Phase | Description                                             |
| ----- | ---------- | ----- | ------------------------------------------------------- |
| 1     | `f615b9a4` | A     | Tracked recovery backlog, roadmap gate, expansion block |
| 2     | `df3436a5` | B     | Policy rules, review cadence, completeness rule         |
| 3     | `75a81659` | D     | Health metrics KPI registry (TTD/TTR, hotspot counts)   |
| 4     | `ea8e46f0` | E     | Monthly scorecard, re-audit checkpoints                 |
| 5     | `4b4c8cd7` | —     | Move governance docs into `Governance/` top-level home  |

**Risk**: Minimal. Only 1 overlap file (`architecture/pre-flight-checklist.md`) shared with architecture branch.

### Step 2: `audit/worker-test-health` (3 commits, 72 files, 66 new)

| Order | Commit     | Phase | Description                                                                                |
| ----- | ---------- | ----- | ------------------------------------------------------------------------------------------ |
| 1     | `a7fba75a` | B     | Phase B — evaluate-policy + critical-escalation specs, coverage config, processor registry |
| 2     | `8391d63f` | C     | Phase C — 56 processor spec files, tenant isolation tests, idempotency tests               |
| 3     | `a3d914e0` | D     | Phase D — processor spec CI enforcement, worker integration tests                          |

**Risk**: Very low. 66 of 72 files are new `.spec.ts` files. Overlaps are minor (jest configs, package.json scripts).

### Step 3: `audit/refactor-safety` (3 commits, 61 files, 49 new)

| Order | Commit     | Phase | Description                                                                           |
| ----- | ---------- | ----- | ------------------------------------------------------------------------------------- |
| 1     | `da7cd4bb` | C     | Coverage thresholds (API + worker jest configs), 11 state machine spec files          |
| 2     | `25526441` | D     | 15 new docs/scripts (checklist, snapshots, benchmarks, contract tests, feature flags) |
| 3     | `48189670` | E     | Stryker config, CI gates, refactoring log, re-audit schedule                          |

**Risk**: Low. 49 of 61 files are new architecture docs, scripts, and test utilities. Overlaps with dx (8 files — package.json, CI) and ops (5 files — CI, scripts).

**After Wave 1**: Forward-merge main into all remaining branches (`git checkout <branch> && git merge main`).

---

## Wave 2 — Low-Conflict Branches

Mostly new files plus some service/config modifications. Sequence matters within this wave.

### Step 4: `audit/backend-tests` (3 commits, 58 files, 17 new)

| Order | Commit     | Phase | Description                                                                 |
| ----- | ---------- | ----- | --------------------------------------------------------------------------- |
| 1     | `ca48543b` | B     | Jest coverage setup, safeguarding specs, RLS smoke test, CI integration     |
| 2     | `e8e95cb8` | C-1   | Import executor, app state machine, attendance, error assertion upgrades    |
| 3     | `7d5d3cbe` | C-2   | High-risk RLS tests, finance concurrency tests with SELECT FOR UPDATE locks |

**Risk**: Low-moderate. 17 new spec files. Overlaps are mostly spec files also touched by code-quality (14 files). Merge before code-quality to establish the baseline.

### Step 5: `audit/ops` (4 commits, 43 files, 15 new)

| Order | Commit     | Phase | Description                                                                             |
| ----- | ---------- | ----- | --------------------------------------------------------------------------------------- |
| 1     | `47cddd2f` | A     | Deploy guardrails, CI gating, backup, rollback, frozen-lockfile, worker shutdown hooks  |
| 2     | `0714cc43` | B     | Vector log shipper, PM2 reload, Sentry release tracking, smoke tests, SHA-pinned deploy |
| 3     | `de319a16` | D     | Post-migration optimization, PgBouncer + Redis monitoring, admin health dashboard       |
| 4     | `5afdfea6` | E     | Recovery drill governance, weekly ops review template                                   |

**Risk**: Moderate. Overlaps with reliability (8 files — health checks, cron), dx (9 files — CI workflows, package.json). Merge before both.

### Step 6: `audit/dx` (3 commits, 42 files, 22 new)

| Order | Commit     | Phase | Description                                                                              |
| ----- | ---------- | ----- | ---------------------------------------------------------------------------------------- |
| 1     | `acbb9028` | B     | PM2 ecosystem config, integration test CI job with PostgreSQL + Redis service containers |
| 2     | `3f649a25` | D     | Playwright CI, migration safety check, Dockerfiles, PgBouncer local, Bull Board          |
| 3     | `86e9e985` | E     | Makefile, build caching, changelog, doctor command, dev logging, seed idempotency        |

**Risk**: Moderate. Overlaps with ops (9 files) should be resolved by merging ops first. Remaining overlaps are CI workflows and package.json scripts.

**After Wave 2**: Forward-merge main into all remaining branches.

---

## Wave 3 — Moderate-Conflict Branches

These touch production service files more heavily. Order within this wave is important.

### Step 7: `audit/security` (4 commits, 57 files, 20 new)

| Order | Commit     | Phase | Description                                                                                                |
| ----- | ---------- | ----- | ---------------------------------------------------------------------------------------------------------- |
| 1     | `e41d4069` | A     | RLS FORCE on attendance_pattern_alerts, rate limiting, DB role restriction + assertion                     |
| 2     | `3c3b95dd` | B     | CSP/Permissions-Policy headers, CORS HTTPS-only, MFA encryption, RLS catalogue, CI gates                   |
| 3     | `2f67ecb2` | C     | GDPR token non-exposure test, survey tenant isolation test, security headers test, audit logging expansion |
| 4     | `3245cbfb` | E     | Security design review PR template, review guide                                                           |

**Risk**: Moderate. 15-file overlap with code-quality (rbac guards/services, tenants). Merge before reliability (3-file overlap on auth/services).

### Step 8: `audit/reliability` (4 commits, 61 files, 13 new)

| Order | Commit     | Phase | Description                                                                                                          |
| ----- | ---------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| 1     | `87cfdd59` | A     | Worker Sentry, 19 empty-catch fixes, real worker health check                                                        |
| 2     | `a53d7ca0` | B     | BullMQ queue health expansion, safeguarding hourly cron, DLQ monitor, cron staggering, atomic shareConcernWithParent |
| 3     | `9854be31` | C     | State machine guards for PayrollRun, Payment, ComplianceRequest, SEN referral (4 new shared modules)                 |
| 4     | `a7b56d30` | D     | Structured error codes (36 throws), atomic approval creation + uniqueness guard                                      |

**Risk**: Moderate-high. 28-file overlap with code-quality (auth, behaviour, finance services). 8-file overlap with modularity (behaviour, pastoral services). The 19 empty-catch fixes in `87cfdd59` will overlap with code-quality's 175-file catch-block codemod — but since code-quality goes last and its mechanical fixes will be re-run fresh, reliability's targeted fixes merge cleanly now.

**After Wave 3**: Forward-merge main into all remaining branches.

---

## Wave 4 — High-Overlap Branches (Sequenced)

These branches restructure module internals and touch many shared files. Order is critical.

### Step 9: `audit/architecture` (5 commits, 57 files, 32 new)

| Order | Commit     | Phase | Description                                                                                 |
| ----- | ---------- | ----- | ------------------------------------------------------------------------------------------- |
| 1     | `3ad6326c` | C     | Extract auth login shared logic (`validateCredentialsAndStatus()`)                          |
| 2     | `dadedfa2` | D-W1  | Sub-path exports for shared, GradebookModule split, Communications-GDPR decoupling          |
| 3     | `c26285cd` | D-W2  | BehaviourModule 6 sub-modules, PastoralModule 6 sub-modules, Pastoral-CP forwardRef removal |
| 4     | `e3aa67af` | D-W3  | 4 read facades (students, staff, academics, attendance) + enforcement script                |
| 5     | `ea97029f` | E     | Module graph generator, 5 ADRs, module size CI, @Internal decorator, staleness detection    |

**Risk**: High overlap with modularity (13 files — module files, barrel exports, blast-radius docs). **Must merge before modularity** because modularity's export reduction and boundary enforcement depends on the sub-module extractions done here.

### Step 10: `audit/maintainability` (4 commits, 126 files, 29 new)

| Order | Commit     | Phase | Description                                                                                                                                            |
| ----- | ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `878aae9b` | B     | Import/order lint fix batch (38 files)                                                                                                                 |
| 2     | `302adb16` | C     | Shared ApiError helper, mock factories, TODO cleanup                                                                                                   |
| 3     | `cbd7ed8d` | D     | Service decompositions (Concern, BehaviourStudents, Workload, ReportCards), BullMQ Zod schemas, useIsMobile, handleApiError, ErrorBoundary, i18n fixes |
| 4     | `e5022193` | E     | i18n check script, GETTING-STARTED, commitlint, PR template, CODEOWNERS, hotspot metrics                                                               |

**Risk**: High. 74-file overlap with code-quality (services, translation files, shared index). 11-file overlap with modularity. **Must merge before modularity** — the service decompositions (ConcernService split, BehaviourStudentsService split, etc.) create the files that modularity's boundary enforcement will reference.

**CAUTION**: `878aae9b` (import/order fixes, 38 files) will partially overlap with code-quality's `d6faeb0f` (import/order enforcement, 1061 files). Since code-quality goes last and its mechanical fixes will be re-run fresh against current main, maintainability's fixes merge cleanly.

### Step 11: `audit/modularity` (2 commits, 148 files, 44 new)

| Order | Commit     | Phase | Description                                                                                                                                                                                                             |
| ----- | ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `298ecfb6` | D     | Export reduction (6 modules), ESLint boundary rule, public API barrels, SequenceModule extraction, PdfJobService queue, BehaviourPolicyEngine extraction, CQRS-lite splits, BehaviourSideEffectsService, contract tests |
| 2     | `4044f63f` | E     | Module cohesion CI, module tiers, cross-module dep CI, module READMEs, extraction criteria, global singleton check                                                                                                      |

**Risk**: High. 46-file overlap with code-quality, 13 with architecture, 11 with maintainability. Depends on architecture (sub-module structure) and maintainability (service decompositions) being in main first. After forward-merging main into this branch, conflicts should be manageable since the structural foundation is in place.

**After Wave 4**: Proceed to Wave 5 — code-quality gets the cherry-pick + re-run treatment (no rebase needed).

---

## Wave 5 — The Mega-Branch (Cherry-Pick + Re-Run)

### Step 12: `audit/code-quality`

**Do NOT merge or rebase this branch.** Rebasing a 1,061-file codemod commit against a main that has absorbed 11 branches would produce hundreds of conflicts for changes that are entirely mechanical. Instead, cherry-pick only the new artifacts, then re-run the codemods fresh against current main. The result is identical — cleaner, faster, and conflict-free.

#### What code-quality contains

| Commit     | Phase | Files | Type of Change                                                                                                                                      |
| ---------- | ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d6faeb0f` | B     | 1,061 | **MEGA-COMMIT**: 3 new ESLint rules + 1,058 files of mechanical auto-fixes (catch blocks, import order, raw-SQL)                                    |
| `20133fb0` | C     | 38    | `as any` cast removal (12), formatDate standardization, no-console tightened, notification helper, strict:true verification, logger standardization |
| `be38db5c` | D     | 49    | withRls() helper, form migrations, i18n gap fixes, 2 new lint rules, large page extractions, mapping helper extractions                             |
| `c14a6887` | E     | 10    | JSDoc on exported methods, max-lines ESLint rule, max-public-methods rule, code review checklists                                                   |
| `0c023bec` | —     | 150   | ESLint import/order @/ path alias fix (pure auto-fix output)                                                                                        |

#### Execution Plan

**Phase 1 — Cherry-pick new ESLint infrastructure from `d6faeb0f`** (the rules, not the fixes):

```bash
# From audit/code-quality, extract ONLY the new files:
git checkout main
git checkout audit/code-quality -- \
  packages/eslint-config/rules/no-empty-catch.js \
  packages/eslint-config/rules/no-empty-catch.test.js \
  packages/eslint-config/plugin.js \
  packages/eslint-config/index.js \
  packages/eslint-config/nest.js \
  packages/eslint-config/next.js
# Stage and commit: "health(code-quality): add ESLint rule infrastructure"
```

**Phase 2 — Cherry-pick targeted commits** (`20133fb0` through `c14a6887`):

These 3 commits touch 97 files total with non-mechanical, targeted changes. Cherry-pick each, resolve conflicts against current main:

```bash
git cherry-pick 20133fb0   # Phase C — type safety, logging (38 files)
git cherry-pick be38db5c   # Phase D — helpers, forms, lint rules (49 files)
git cherry-pick c14a6887   # Phase E — docs, budgets, checklists (10 files)
```

If a cherry-pick has conflicts, resolve manually — these are small enough to handle.

**Phase 3 — Re-run the codemods fresh against current main**:

```bash
# Fix all empty catch blocks + import order + raw-SQL violations in one pass
pnpm eslint --fix apps/ packages/
git add -A
git commit -m "health(code-quality): apply ESLint codemods against current main"
```

**Phase 4 — Drop commit `0c023bec`** entirely. It was a pure auto-fix for the @/ path alias import ordering — `eslint --fix` in Phase 3 already covers this.

**Phase 5 — Verify**:

```bash
turbo type-check && turbo lint && turbo test
```

**Why this works**: The mega-commit (`d6faeb0f`) is ~30 new files of ESLint infrastructure + ~1,030 files of `eslint --fix` output. The auto-fix output is deterministic — running `eslint --fix` against current main produces the same corrections adapted to current file contents. No conflict resolution needed.

---

## Summary Table

| Wave | Step | Branch                     | Commits | Files | Expected Conflicts                 | Forward-Merge After? |
| ---- | ---- | -------------------------- | ------- | ----- | ---------------------------------- | -------------------- |
| 1    | 1    | `audit/governance`         | 5       | 10    | None                               | No                   |
| 1    | 2    | `audit/worker-test-health` | 3       | 72    | None                               | No                   |
| 1    | 3    | `audit/refactor-safety`    | 3       | 61    | Minimal (package.json)             | **Yes**              |
| 2    | 4    | `audit/backend-tests`      | 3       | 58    | Low (spec files)                   | No                   |
| 2    | 5    | `audit/ops`                | 4       | 43    | Low (CI, health)                   | No                   |
| 2    | 6    | `audit/dx`                 | 3       | 42    | Low-moderate (CI overlap with ops) | **Yes**              |
| 3    | 7    | `audit/security`           | 4       | 57    | Moderate (guards, services)        | No                   |
| 3    | 8    | `audit/reliability`        | 4       | 61    | Moderate (services, cron)          | **Yes**              |
| 4    | 9    | `audit/architecture`       | 5       | 57    | Moderate (module structure)        | No                   |
| 4    | 10   | `audit/maintainability`    | 4       | 126   | Moderate-high (services, i18n)     | No                   |
| 4    | 11   | `audit/modularity`         | 2       | 148   | High (module rewiring)             | **Yes**              |
| 5    | 12   | `audit/code-quality`       | —       | 1,114 | **None** (cherry-pick + re-run)    | Done                 |
|      |      | **Totals**                 | **44**  |       |                                    |                      |

---

## Blocked Items — Post-Merge Follow-Up

The following items were blocked during dimension execution because they require schema migrations or cross-cutting refactors that couldn't be done safely in isolated worktrees. These should be addressed in a **dedicated migration session after all 12 branches are merged**:

| #     | Action                                          | Why Blocked                     | Suggested Bundling              |
| ----- | ----------------------------------------------- | ------------------------------- | ------------------------------- |
| R-13  | `automation_failed` flag on behaviour incidents | Prisma schema change            | Bundle with R-18/R-19           |
| R-14  | Move document generation out of DB transactions | Deep Puppeteer refactor (DZ-19) | Pair with R-24                  |
| R-18  | Claim/lease state for notifications             | New enum value + migration      | Bundle with R-19                |
| R-19  | Idempotency keys for outbound sends             | New column on dispatch table    | Bundle with R-18                |
| R-23  | Persist per-tenant cron failures                | New `cron_execution_log` table  | Standalone migration            |
| R-24  | Move ALL external sends out of transactions     | Cross-cutting refactor          | Pair with R-14                  |
| R-26  | Approval callback replay tooling                | New admin endpoint              | Standalone feature              |
| BT-15 | Coverage ratchet script                         | Depends on coverage infra       | Unblocked after Steps 2-3 merge |

---

## Post-Merge Checklist

After all 12 branches are merged:

- [ ] `turbo type-check` passes
- [ ] `turbo lint` passes
- [ ] `turbo test` passes (full suite)
- [ ] All worktree directories cleaned up: `git worktree remove <path>` x12
- [ ] All audit branches deleted: `git branch -d audit/*` x12
- [ ] Remote branches pruned: `git push origin --delete audit/*` x12
- [ ] Architecture docs reviewed for consistency after merge
- [ ] Update `Audits/Audit_Actions_Report` with merge completion status
- [ ] Schedule dedicated migration session for blocked reliability items (R-13/14/18/19/23/24/26)
- [ ] Implement BT-15 (coverage ratchet) — now unblocked
