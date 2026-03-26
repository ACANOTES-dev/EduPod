# /go — Autonomous Analyse → Fix → Deploy → Verify

You are operating in **autonomous mode**. Your goal is to fully resolve the issue or implement the change described in the user's message with minimal interruption. Only stop and ask the user if you hit a **genuine blocking decision** — something with major structural, architectural, or data-safety implications that you cannot confidently resolve alone. Remeber, your role is to make my life easier, not harder.

---

## Phase 1 · Analyse

1. Read the problem statement carefully. Identify the affected module(s), file(s), and data flows.
2. Search the codebase (`grep`, `find`, AST inspection) to understand the current behaviour and all call sites / dependents.
3. Check `feature-map.md`, `MEMORY.md`, `CLAUDE.md`, and any relevant phase docs or `.claude/rules/` files for architectural constraints that apply.
4. If the issue touches tenant-scoped data, verify RLS implications. If it touches finance/payroll, verify immutability rules. If it touches auth/RBAC, verify permission guard coverage.
5. Summarise your understanding in a short internal note (do NOT print a long analysis to the user — just proceed).

## Phase 2 · Plan

1. Draft the safe fix or implementation. Prefer surgical edits over rewrites, when possible.
2. Enumerate every file you will touch and what changes each gets.
3. Verify the plan does NOT:
   - Break existing API contracts (endpoint signatures, response shapes).
   - Alter DB migration files that are already applied in staging/production.
   - Remove or weaken RLS policies, permission guards, or audit logging.
   - Introduce sequential `$transaction` calls (PROHIBITED — use interactive transactions only).
   - Skip `tenant_id` on any new tenant-scoped table/query.
   - Violate optimistic concurrency on the 8 designated entity types.
   - Break i18n (missing keys), RTL layout, or dark-mode theming.
4. If the plan is safe → **auto-approve and proceed to Phase 3**. Do NOT ask the user for confirmation on routine changes.
5. If the plan has structural ambiguity (e.g., new DB table, new module boundary, new shared type, breaking API change, schema migration on production data) → **stop and present the plan to the user with the specific decision you need them to make**. Resume on their response.

## Phase 3 · Implement

1. Execute the plan file-by-file. Use `str_replace` for edits, `create_file` for new files.
2. After all edits, run the linter (`pnpm lint` or the project's configured command) and fix any issues.
3. Run the TypeScript compiler (`pnpm tsc --noEmit` or equivalent) and fix type errors.
4. If the change is testable locally:
   - Run the relevant test suite(s) (`pnpm test` scoped to affected module(s)).
   - If tests fail, diagnose and fix. Do not commit broken tests.
5. If new tests are warranted (new endpoint, new service method, bug fix), write them.

## Phase 4 · Commit & Push

1. Stage only the files relevant to this change (`git add <specific files>`). Do NOT blindly `git add .`.
2. Write a clear, conventional commit message:
   - Format: `<type>(<scope>): <short description>` (e.g., `fix(attendance): prevent double session generation on retry`)
   - Body: brief context if non-obvious.
3. Push to the current branch (`git push`).

## Phase 5 · Monitor Deployment

1. After push, check GitHub Actions status (`gh run list --limit 5` or poll `gh run watch`).
2. Wait for the workflow run triggered by your push to complete.
3. If the run **succeeds** → report success to the user and you're done.
4. If the run **fails** → proceed to Phase 6.

## Phase 6 · Diagnose & Fix Deployment Failure

1. Pull the failed run's logs (`gh run view <run-id> --log-failed`).
2. Identify the failure root cause (build error, test failure, deploy script error, infra issue).
3. If it's a code issue you introduced → fix it, commit, push, return to Phase 5.
4. If it's a flaky test or transient infra issue → re-run the workflow (`gh run rerun <run-id> --failed`) and return to Phase 5.
5. If it's a pre-existing issue unrelated to your change → inform the user and note it separately.
6. **Loop between Phase 5 and Phase 6** until deployment succeeds or you've exhausted 3 fix attempts (at which point, stop and escalate to the user with full context).

## Phase 7 · Server-Side Intervention (if needed)

You have permission to SSH into the server using the credentials available to you, **but only when**:
- The deployment succeeded but the issue manifests at runtime on the server.
- A database migration needs manual verification post-deploy.
- Logs on the server are needed to diagnose a production-only failure.
- When you determine a review is required to understand what is happening.
- Always remeber the server rules.


## Phase 8 · Testing

It is not enough to see only green checkmarks on deployment status. Essentially, i need to be able to confidentally assume that things are working as expected. Therefore, you must:
- Run regression tests
- Run unit tests
- Run QA E2E tests using playwright

---

## When to stop and ask the user

Stop ONLY for:
- **Architectural decisions**: new modules, new DB tables, new shared types, breaking API changes.
- **Data safety**: any production DB write, migration on live data, or destructive server command.
- **Ambiguous requirements**: the problem statement is unclear and multiple valid interpretations exist with meaningfully different outcomes.
- **Repeated failure**: 3+ failed attempts at the same fix — escalate with full context.
- **Security/secrets**: anything involving credentials, keys, or environment variable changes on production.

Do NOT stop for:
- Routine bug fixes, refactors, or feature additions within established patterns.
- Test failures you can diagnose and fix.
- Lint/type errors.
- Deployment retries.
- Choosing between equivalent implementation approaches (just pick the simpler one).

---

Now analyse the user's request and begin.
