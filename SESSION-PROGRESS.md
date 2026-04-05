# Session Progress — 2026-04-05

## What Was Done

### CI Pipeline Fixes (committed + deployed)

| Fix                                                                            | Commit   | Status   |
| ------------------------------------------------------------------------------ | -------- | -------- |
| Integration job OOM — added NODE_OPTIONS max-old-space-size=6144               | 8437b34b | Deployed |
| Flaky weekend test — widened appeal deadline tolerance                         | bb183166 | Deployed |
| Canary SLA false positives — job-completion-based checks instead of Redis ACK  | 8cf77944 | Deployed |
| AnomalyScan RLS errors — per-tenant iteration with set_config()                | 8cf77944 | Deployed |
| AUDIT_LOG queue config drift detection + duplicate removal                     | 0b05407e | Deployed |
| 161 TypeScript type errors in health recovery spec files                       | 4a88ff5e | Deployed |
| Raw SQL allowlist for check-awards processor                                   | b1347d68 | Deployed |
| Uncommitted health recovery work (197 files, coverage ratchet to 88/74/85/89%) | f7a860ff | Deployed |
| Added express as direct API dependency (Node 24 + pnpm strict mode)            | 59411b63 | Deployed |
| Force fork mode in PM2 ecosystem + deploy script fresh start                   | 16b7549e | Deployed |

### Production Server Fixes (applied directly)

| Fix                                                                       | Status |
| ------------------------------------------------------------------------- | ------ |
| Created Meilisearch \_health_check index (stopped every-5-min error spam) | Done   |
| Added ENCRYPTION_KEY to server .env (was only ENCRYPTION_KEY_LOCAL)       | Done   |
| Symlinked root .env to apps/api/.env and apps/worker/.env for fork mode   | Done   |
| Cleared duplicate root PM2 daemon (was conflicting with edupod PM2)       | Done   |
| Rebuilt all packages on server after node_modules wipe                    | Done   |
| Regenerated Prisma client on server                                       | Done   |

### Current Production State

All processes online in fork mode, all endpoints responding, CI fully green (ci + visual + integration + deploy).

---

## What's In Progress (uncommitted)

### 1. no-floating-promises ESLint rule — DONE, needs commit

Files changed (20 files):

- packages/eslint-config/nest.js — added rule as error (warn for spec files)
- packages/eslint-config/next.js — added rule as error (warn for spec files)
- apps/api/src/main.ts — void bootstrap()
- apps/api/src/common/services/loki-log-shipper.service.ts — void this.flush() (x2)
- 16 web frontend files — void prefix on fire-and-forget promises in useEffect callbacks

Status: All source files pass lint. Spec files have warnings only (not blocking). Ready to commit.

### 2. Module boundary violations (17) — NOT STARTED

Violations to fix:

| Violating File                          | Facade Needed          | Count |
| --------------------------------------- | ---------------------- | ----- |
| behaviour/behaviour-admin.service.ts    | StudentReadFacade      | 12    |
| classes/class-assignments.service.ts    | StudentReadFacade      | 1     |
| behaviour/behaviour-students.helpers.ts | AttendanceReadFacade   | 2     |
| behaviour/behaviour-award.service.ts    | AcademicReadFacade     | 1     |
| configuration/key-rotation.service.ts   | StaffProfileReadFacade | 1     |

What's needed for each:

1. Read the violating line to understand the Prisma query
2. Add a matching method to the appropriate ReadFacade
3. Inject the facade into the service constructor (if not already)
4. Replace the direct prisma.model.xxx() call with the facade method
5. After all 17 are fixed, ratchet --max-violations from 17 to 0 in .github/workflows/ci.yml

Estimated effort: ~30-45 minutes.

### 3. Module cohesion errors (3) — NOT STARTED

Structural — modules with too many files. Tracked in health recovery plan. Lower priority.

---

## Other Session's Work

There is an active parallel session modifying ~115 .spec.ts files (test coverage improvements). Do not touch those files. They will be committed separately.

---

## CI Thresholds After All Work Is Done

| Check                            | Current                        | Target                                  |
| -------------------------------- | ------------------------------ | --------------------------------------- |
| Module boundary violations       | max 17                         | max 0                                   |
| Module cohesion errors           | max 3                          | max 3 (no change planned)               |
| Cross-module deps                | max 8 (currently 0 actual)     | max 0 (ratchet down)                    |
| Coverage (stmts/branch/fn/lines) | 88/74/85/89%                   | Ratchet up after test session completes |
| no-floating-promises             | warn in specs, error in source | Already configured                      |
