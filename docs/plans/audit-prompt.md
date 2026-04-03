# Codebase Health Audit — 7-Agent Parallel Analysis

## Instructions for the orchestrating session

You are conducting a full technical due diligence audit of this codebase. You will dispatch exactly 7 specialist agents in parallel, each covering a distinct dimension. Once all 7 return, you will synthesize their findings into a single master audit report.

**Set effort to max. Use Opus 4.6 for all 7 agents.**

---

## Step 1 — Pre-read (do this yourself, do NOT delegate)

Before dispatching agents, read these files in the main session to build shared context:

```
CLAUDE.md
architecture/danger-zones.md
architecture/module-blast-radius.md
```

You need this context to write accurate agent prompts and to synthesize the final report. Do not skip this step.

---

## Step 2 — Dispatch all 7 agents in a SINGLE message (parallel)

Each agent prompt below is self-contained. Dispatch all 7 simultaneously using the Agent tool. Every agent should be `subagent_type: "general-purpose"` on Opus 4.6.

---

### Agent 1 — Architecture & Module Boundaries

```
You are auditing a multi-tenant school management SaaS (NestJS + Next.js + BullMQ + PostgreSQL, ~288K LOC).

Your focus: ARCHITECTURE AND MODULARITY. Evaluate the structural health of the monolith.

STEP 1 — Run these bash commands (all in parallel where possible):

# Module count and registration
grep -c "Module" apps/api/src/app.module.ts
ls apps/api/src/modules/ | wc -l

# Cross-module imports (coupling detection)
for d in apps/api/src/modules/*/; do
  mod=$(basename "$d")
  imports=$(grep -rh "from '../../" "$d" --include="*.ts" 2>/dev/null | grep -v spec | grep -v dto | sort -u | wc -l | tr -d ' ')
  echo "$mod: $imports cross-module imports"
done | sort -t: -k2 -rn | head 20

# Module sizes
for d in apps/api/src/modules/*/; do
  mod=$(basename "$d")
  files=$(find "$d" -name "*.ts" ! -name "*.spec.ts" | wc -l | tr -d ' ')
  lines=$(find "$d" -name "*.ts" ! -name "*.spec.ts" -exec cat {} + 2>/dev/null | wc -l | tr -d ' ')
  echo "$mod: $files files, $lines lines"
done | sort -t, -k2 -rn | head 20

# Shared package exports
grep -c "export" packages/shared/src/index.ts 2>/dev/null || echo "check exports manually"

STEP 2 — Read these files:
- apps/api/src/app.module.ts (module registration — what's imported)
- architecture/module-blast-radius.md (documented coupling)
- architecture/danger-zones.md (known architectural risks)
- apps/api/src/main.ts (bootstrap config)
- turbo.json (build dependency graph)
- packages/shared/src/index.ts (shared package surface area)

STEP 3 — Read the 3 largest service files by line count (from your bash output) and assess:
- Single responsibility — does each do one thing?
- Cohesion — do the methods belong together?
- Coupling — how many other modules does it import?

STEP 4 — Write a focused report covering:
1. Overall architecture assessment (is the modular monolith well-structured?)
2. Module boundary health (clean vs leaky boundaries)
3. Coupling hotspots (which modules import too many others?)
4. God modules (too many files, too many responsibilities)
5. Shared package health (is it a dumping ground or well-organised?)
6. Natural extraction candidates (what could become a separate service?)
7. Architecture risks (verify danger-zones.md entries — are they still valid?)
8. Score: Architecture 1-10, Modularity 1-10 with justification
```

---

### Agent 2 — Backend Test Health

```
You are auditing a multi-tenant school management SaaS (NestJS backend, ~55 modules, ~653 source files).

Your focus: BACKEND TEST COVERAGE AND QUALITY. Not just whether tests exist — whether they're meaningful.

STEP 1 — Run these bash commands:

# Per-module test coverage ratio
for d in apps/api/src/modules/*/; do
  mod=$(basename "$d")
  src=$(find "$d" -name "*.ts" ! -name "*.spec.ts" ! -path "*/dto/*" | wc -l | tr -d ' ')
  spec=$(find "$d" -name "*.spec.ts" | wc -l | tr -d ' ')
  if [ "$src" -gt 0 ]; then
    pct=$((spec * 100 / src))
  else
    pct=0
  fi
  echo "$mod: $spec/$src ($pct%)"
done | sort -t'(' -k2 -n

# Run the actual tests
cd apps/api && pnpm test 2>&1 | tail -20

# Failing tests detail
cd apps/api && pnpm test 2>&1 | grep -E "FAIL |● " | head 30

# Skipped tests
cd apps/api && pnpm test 2>&1 | grep -i "skip\|todo\|pending" | head 20

# Async leak warnings
cd apps/api && pnpm test 2>&1 | grep "Cannot log after" | wc -l

STEP 2 — Read these files for test QUALITY assessment (not just existence):
- Pick the best-tested module (highest ratio) — read 1 spec file fully
- Pick the worst-tested module with >5 source files — read whatever spec exists
- Pick 1 controller spec and 1 service spec from different modules
- Read apps/api/jest.config.ts or jest.config.js (test configuration)

For each spec file, evaluate:
- Are assertions meaningful or just "expect(result).toBeDefined()"?
- Is mocking appropriate or excessive?
- Do tests cover edge cases or just happy paths?
- Would these tests catch a regression during refactoring?
- Is the test naming descriptive?

STEP 3 — Write a focused report covering:
1. Total test count (suites, individual tests, pass/fail)
2. Failing tests — root cause for each failing suite
3. Per-module coverage classification: well-tested / partially / poorly / untested
4. Test quality assessment (meaningful vs superficial)
5. Critical blind spots (which important modules are undertested?)
6. Mock quality (appropriate vs over-mocking)
7. Flakiness indicators (async leaks, timing issues)
8. Confidence level: would you trust these tests for a refactor?
9. Score: Test Health 1-10 with justification
```

---

### Agent 3 — Frontend & Worker Test Health

```
You are auditing a multi-tenant school management SaaS. The frontend is Next.js 14 App Router (~303 pages). The worker is BullMQ (~78 processors).

Your focus: FRONTEND AND WORKER TEST COVERAGE.

STEP 1 — Run these bash commands:

# Frontend test files
find apps/web/src -name "*.spec.*" -o -name "*.test.*" | head 20
find apps/web/e2e -name "*.spec.*" 2>/dev/null | head 20

# Frontend page count
find apps/web/src/app -name "page.tsx" | wc -l

# Frontend component count
find apps/web/src/components -name "*.tsx" | wc -l
find apps/web/src/app -path "*/_components/*.tsx" | wc -l

# Worker test coverage
for f in apps/worker/src/processors/**/*.processor.ts; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .ts)
  spec="${f%.ts}.spec.ts"
  if [ -f "$spec" ]; then echo "TESTED: $base"; else echo "UNTESTED: $base"; fi
done | sort

# Worker test run
cd apps/worker && pnpm test 2>&1 | tail -10

# Shared package tests
cd packages/shared && pnpm test 2>&1 | tail -10

# E2E test content (check what they actually test)
head -30 apps/web/e2e/visual/*.spec.ts 2>/dev/null | head 100

STEP 2 — Read these files:
- 2 E2E test specs (pick ones for critical flows like finance, auth, or attendance)
- The 1 frontend unit test that exists (find it)
- 2 worker processor specs (1 well-tested domain, 1 poorly-tested)
- apps/worker/src/base/tenant-aware-job.spec.ts (the base class test)

STEP 3 — Write a focused report covering:
1. Frontend test inventory (unit tests, E2E tests, visual regression tests)
2. Frontend coverage gap — 303 pages with how many tests?
3. E2E test quality — do they test real user flows or just render checks?
4. Worker processor coverage — X of 78 tested
5. Worker test quality — do they verify tenant isolation?
6. Shared package test health
7. What SHOULD be tested that isn't?
8. Score: Frontend Test Health 1-10, Worker Test Health 1-10
```

---

### Agent 4 — Security & RLS Audit

```
You are auditing a multi-tenant school management SaaS that uses PostgreSQL Row-Level Security for tenant isolation. This system holds children's personal data. Security is the #1 concern.

Your focus: SECURITY AND DATA ISOLATION.

STEP 1 — Run these bash commands:

# Schema tenant_id coverage
grep -c "tenant_id" packages/prisma/schema.prisma
grep -c "^model " packages/prisma/schema.prisma

# RLS policy count
grep -c "ENABLE ROW LEVEL SECURITY" packages/prisma/rls/policies.sql

# Tables WITH RLS (from policies.sql)
grep "ENABLE ROW LEVEL SECURITY" packages/prisma/rls/policies.sql | sed 's/.*TABLE //' | sed 's/ .*//' | sort > /tmp/rls_tables.txt
wc -l /tmp/rls_tables.txt

# Tables WITH RLS (from post_migrate.sql files)
find packages/prisma/migrations -name "post_migrate.sql" -exec grep "ENABLE ROW LEVEL SECURITY" {} \; | sed 's/.*TABLE //' | sed 's/ .*//' | sort -u >> /tmp/rls_tables.txt
sort -u /tmp/rls_tables.txt | wc -l

# Models with tenant_id (should all have RLS)
grep -B1 "tenant_id" packages/prisma/schema.prisma | grep "^model " | awk '{print $2}' | sort > /tmp/tenant_models.txt
wc -l /tmp/tenant_models.txt

# GAP: models with tenant_id but no RLS
comm -23 /tmp/tenant_models.txt <(sort -u /tmp/rls_tables.txt) 2>/dev/null | head 30

# Raw SQL usage outside RLS
grep -rn "executeRawUnsafe\|queryRawUnsafe\|executeRaw\|queryRaw" apps/api/src/ --include="*.ts" | grep -v spec | grep -v "rls.middleware"

# Auth module files
ls -la apps/api/src/modules/auth/

# Encryption usage
grep -rn "encrypt\|decrypt\|AES\|cipher" apps/api/src/ --include="*.ts" | grep -v spec | grep -v node_modules | head 20

# Secret handling
grep -rn "process.env" apps/api/src/ --include="*.ts" | grep -v spec | grep -vi "node_env" | head 20

# CORS config
grep -A5 "cors\|Cors\|CORS" apps/api/src/main.ts

# Helmet usage
grep "helmet\|Helmet" apps/api/src/main.ts

STEP 2 — Read these files:
- apps/api/src/common/middleware/rls.middleware.ts (THE security linchpin)
- packages/prisma/rls/policies.sql (skim the patterns, check for FORCE ROW LEVEL SECURITY)
- apps/api/src/modules/auth/ (all files — this is only ~10 files)
- apps/api/src/common/guards/auth.guard.ts
- apps/api/src/common/guards/permission.guard.ts
- architecture/danger-zones.md (security-related entries)

STEP 3 — Write a focused report covering:
1. RLS coverage — exact count of protected vs unprotected tenant-scoped tables
2. List of tables MISSING RLS (the gap)
3. RLS middleware quality — is the implementation sound?
4. Auth module assessment — JWT handling, token refresh, MFA
5. Permission system — RBAC implementation quality
6. Encryption — what's encrypted, how, key management
7. CORS and security headers
8. Raw SQL audit — any unsafe usage?
9. GDPR/data protection posture
10. Verified danger zones (which security DZs are still open?)
11. Score: Security 1-10 with justification
```

---

### Agent 5 — Code Quality & Maintainability

```
You are auditing a multi-tenant school management SaaS (~288K LOC, TypeScript strict mode).

Your focus: CODE QUALITY AND MAINTAINABILITY.

STEP 1 — Run these bash commands:

# Type safety violations
echo "=== any types ===" && grep -rn ": any\|as any" apps/api/src/ apps/web/src/ apps/worker/src/ --include="*.ts" --include="*.tsx" | grep -v spec | grep -v node_modules | grep -v ".d.ts"
echo "=== @ts-ignore ===" && grep -rn "@ts-ignore\|@ts-expect-error" apps/api/src/ apps/web/src/ apps/worker/src/ --include="*.ts" --include="*.tsx"
echo "=== empty catches ===" && grep -Prn "catch\s*\([^)]*\)\s*\{\s*\}" apps/api/src/ apps/web/src/ --include="*.ts" --include="*.tsx" 2>/dev/null
echo "=== console.log in prod ===" && grep -rn "console\.log" apps/api/src/ apps/web/src/ apps/worker/src/ --include="*.ts" --include="*.tsx" | grep -v spec | grep -v node_modules

# Technical debt markers
grep -rcn "TODO\|FIXME\|HACK\|XXX\|TEMP\|WORKAROUND" apps/api/src/ apps/web/src/ apps/worker/src/ --include="*.ts" --include="*.tsx" | grep -v ":0$" | sort -t: -k2 -rn

# God files (>500 lines)
find apps/api/src -name "*.ts" ! -name "*.spec.ts" | xargs wc -l 2>/dev/null | sort -rn | head 25
find apps/web/src -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head 15

# RTL violations (physical CSS)
grep -rn "\\bml-\|\\bmr-\|\\bpl-\|\\bpr-\|\\btext-left\\b\|\\btext-right\\b\|\\brounded-l-\|\\brounded-r-\|\\bborder-l-\|\\bborder-r-" apps/web/src/ --include="*.tsx" | grep -v node_modules

# Lint check
pnpm turbo run lint 2>&1 | tail -30

# Type check
pnpm turbo run type-check 2>&1 | tail -15

# i18n parity
echo "EN keys:" && jq '[path(..)|select(length>0)] | length' apps/web/messages/en.json
echo "AR keys:" && jq '[path(..)|select(length>0)] | length' apps/web/messages/ar.json

# Custom ESLint rules
ls packages/eslint-config/rules/ 2>/dev/null
cat packages/eslint-config/plugin.js 2>/dev/null | head 30

STEP 2 — Read these files for qualitative assessment:
- The 3 largest backend service files (from god file list)
- The 3 largest frontend page files (from god file list)
- 2 medium-sized services (~200-400 lines) for comparison
- packages/eslint-config/rules/ (all custom rules)

For each file assess: naming consistency, error handling patterns, separation of concerns, readability, adherence to conventions in CLAUDE.md.

STEP 3 — Write a focused report covering:
1. Type safety — any violations of strict mode?
2. Code cleanliness — lint results, unused code, dead patterns
3. God files — count and list of files >500, >1000, >1500 lines
4. Error handling quality — are catch blocks meaningful?
5. Naming and convention adherence
6. RTL/i18n compliance
7. Custom ESLint rules — are they enforcing the right things?
8. Technical debt markers (TODO/FIXME count and locations)
9. Duplication or copy-paste patterns
10. Score: Code Quality 1-10, Maintainability 1-10 with justification
```

---

### Agent 6 — Reliability & Error Handling

```
You are auditing a multi-tenant school management SaaS with NestJS backend, BullMQ workers, and PostgreSQL.

Your focus: RELIABILITY — state machines, error propagation, job safety, and failure modes.

STEP 1 — Run these bash commands:

# State machine patterns
grep -rn "VALID_TRANSITIONS\|validTransitions\|StatusTransition" apps/api/src/ --include="*.ts" | grep -v spec | head 20

# Exception types used
grep -rn "NotFoundException\|BadRequestException\|ForbiddenException\|ConflictException\|UnprocessableEntityException" apps/api/src/ --include="*.ts" | grep -v spec | grep -v node_modules | wc -l

# Catch blocks in services (error handling patterns)
grep -Pn "catch\s*\(" apps/api/src/modules/ --include="*.ts" -r | grep -v spec | head 30

# Worker retry configuration
grep -A3 "attempts\|backoff\|removeOnComplete\|removeOnFail" apps/worker/src/base/queue.constants.ts 2>/dev/null | head 40

# Cron job count and registration
grep -c "add(" apps/worker/src/cron/cron-scheduler.service.ts

# Approval callback mechanism
grep -rn "callback\|onApproved\|executeCallback" apps/api/src/modules/approvals/ --include="*.ts" | grep -v spec | head 15

# Health checks
ls apps/api/src/modules/health/ 2>/dev/null
cat apps/api/src/modules/health/health.controller.ts 2>/dev/null | head 50

STEP 2 — Read these files:
- architecture/state-machines.md (documented state machines)
- architecture/event-job-catalog.md (job flows and side effects)
- architecture/danger-zones.md (reliability-related entries: DZ-01, DZ-03, DZ-05, DZ-23)
- apps/worker/src/base/tenant-aware-job.ts (job safety base class)
- apps/worker/src/cron/cron-scheduler.service.ts (cron registration)
- apps/api/src/modules/approvals/ (the approval flow — check for fire-and-forget)
- 2 worker processors (1 complex like scheduling-solver, 1 simple like search-index)

STEP 3 — Write a focused report covering:
1. State machine health — are transitions validated consistently?
2. Error propagation — do services throw typed exceptions or swallow errors?
3. Job safety — do all processors handle failure gracefully?
4. Tenant isolation in jobs — is TenantAwareJob used consistently?
5. Cron job health — are all registered, are any missing?
6. Approval callback chain — is it fire-and-forget or reconciled?
7. Retry/timeout handling — are external calls protected?
8. Health check quality — does it check all dependencies?
9. Danger zone verification — which reliability DZs are still open?
10. Score: Reliability 1-10 with justification
```

---

### Agent 7 — Operational Readiness & Developer Experience

```
You are auditing a multi-tenant school management SaaS deployed on a single Hetzner VPS via GitHub Actions.

Your focus: OPERATIONAL READINESS AND DEVELOPER EXPERIENCE.

STEP 1 — Run these bash commands:

# CI pipeline
cat .github/workflows/ci.yml
cat .github/workflows/deploy.yml

# Build system
cat turbo.json
cat package.json | head -40

# Docker setup
cat docker-compose.yml 2>/dev/null

# Environment config
cat .env.example 2>/dev/null | head 60

# Pre-commit hooks
ls .husky/ 2>/dev/null
cat .husky/pre-commit 2>/dev/null

# Sentry integration
grep -rn "Sentry\|sentry\|SENTRY" apps/api/src/main.ts apps/api/src/instrument.ts 2>/dev/null | head 10

# PM2 or process management
find . -name "ecosystem.config.*" -o -name "pm2.*" 2>/dev/null | head 5

# Node/pnpm versions
grep "engines\|packageManager" package.json

# Scripts available
cat package.json | grep -A30 '"scripts"'

# Environment validation
find apps/api/src -name "env*" -o -name "config*" | grep -v node_modules | grep -v spec | head 10

# Migration tooling
ls packages/prisma/scripts/ 2>/dev/null

STEP 2 — Read these files:
- .github/workflows/ci.yml (full read)
- .github/workflows/deploy.yml (full read)
- apps/api/src/main.ts (bootstrap — what's configured at startup)
- apps/api/src/instrument.ts (Sentry/observability setup)
- docker-compose.yml
- .env.example (full read — what's required?)

STEP 3 — Write a focused report covering:
1. CI pipeline — does it run lint, type-check, tests, build? Any gaps?
2. Deploy pipeline — how does code reach production? Safety mechanisms?
3. Environment management — is there staging? How many environments?
4. Environment validation — are required vars validated at startup?
5. Monitoring/observability — Sentry config, structured logging, correlation IDs?
6. Local dev experience — how easy is setup? Docker compose quality?
7. Build system — Turbo config, caching, dependency graph
8. Pre-commit hooks — do they exist? What do they enforce?
9. Secret management — .env handling, key rotation
10. Deployment risk — what could go wrong in a deploy?
11. Score: Operational Readiness 1-10, Developer Experience 1-10 with justification
```

---

## Step 3 — Synthesize the master report

Once all 7 agents return, write the final report using this exact structure. Do not simply concatenate — SYNTHESIZE. Cross-reference findings between agents (e.g., Agent 4 finding auth is undertested + Agent 2 confirming the same = high-confidence finding).

### Required output structure:

```
1. Executive Summary
   One paragraph. Honest verdict.

2. System Overview
   Architecture, modules, scale, tech stack. Drawn from Agent 1 + your pre-read.

3. Build / Run / Test Findings
   What passed, what failed. Drawn from Agents 2, 3, 5.

4. Test Health Assessment
   Combined from Agents 2 (backend) and 3 (frontend + worker).
   Classify every module: well-tested / partially / poorly / untested.

5. Module-by-Module Health Review
   For each major module: purpose, strengths, weaknesses, risk level, test quality, refactor priority.
   Combine signals from ALL agents — a module might score well on architecture but poorly on tests.

6. Cross-Cutting Architectural Risks
   Merged from Agents 1, 4, 6. De-duplicate. Verify against danger-zones.md.

7. Top 10 Most Important Issues
   Ranked by engineering risk. Each must cite which agent(s) identified it.

8. Quick Wins
   High impact, low effort. From all agents.

9. Strategic Refactor Opportunities
   Sequenced. From Agents 1, 5, 6.

10. Scorecard (1-10 each with justification)
    - Architecture (Agent 1)
    - Code Quality (Agent 5)
    - Modularity (Agent 1)
    - Test Health (Agents 2 + 3, averaged and weighted — backend matters more)
    - Maintainability (Agent 5)
    - Reliability (Agent 6)
    - Security (Agent 4)
    - Developer Experience (Agent 7)
    - Operational Readiness (Agent 7)
    - Refactor Safety (Agents 2 + 5 — tests + code quality combined)
    - Overall Health (weighted average, reliability and security weighted 2x)

11. Final Verdict
    - Is this monolith healthy?
    - Is it safe to scale?
    - Is it safe to extend?
    - Is it safe to refactor?
    - What should I do first?

12. Review Limitations
    What could not be verified and how it affects confidence.
```

### Three-line summary (very end):

**Health verdict:** one sentence
**Biggest risk:** one sentence
**Best next step:** one sentence

---

## Rules for synthesis

- Do NOT flatter. Be honest.
- If two agents disagree, investigate why and state the stronger evidence.
- If an agent missed something obvious, note the gap in Review Limitations.
- Distinguish between FACTS (test counts, lint results), STRONG SIGNALS (consistent patterns across files), and INFERENCES (architectural judgments).
- Every score must be justified with evidence, not vibes.
- The Top 10 issues must be actionable — each should suggest a fix direction.
- Do NOT pad the report. If a section has nothing meaningful to say, say "No significant findings" and move on.
