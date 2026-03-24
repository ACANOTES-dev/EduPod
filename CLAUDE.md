# CLAUDE.md — School Operating System

## What This Is

Multi-tenant school management SaaS. Single PostgreSQL database, shared schema, Row-Level Security isolation. NestJS modular monolith backend, Next.js App Router frontend, BullMQ worker service. Bilingual English/Arabic with full RTL. Phase 1 is ~90% complete (~180k lines of code). Two confirmed tenants pending onboarding.

## Implementation Plans

This project is built phase-by-phase from implementation plans stored in `plans/`.

```
plans/
├── context.md                    # Architecture, RLS, auth, RBAC — ALWAYS LOAD
├── ui-design-brief.md            # Visual language, components — LOAD FOR ANY FRONTEND WORK
├── masterplan.md                 # Full unified plan (reference only)
├── phases-instruction/           # What to build (P0–P9 specs)
├── phases-plan/                  # How to build it (generated plans)
├── phases-results/               # What was built (post-implementation summaries)
├── phases-testing-instruction/   # How to test it
└── phases-testing-result/        # Test outcomes
```

Build order: P0 → P1 → P2 → P3 → P4a → P4b → P5 → P6 → P6b → P7 → P8 → P9

---

## Current Workflow

Phase 1 (P0–P9) is complete. The phase plans, results, and testing files in `plans/` are historical reference — do not execute from them.

Current work is iterative: refining existing functionality, adding enhancements based on tenant feedback, and QA fixes. Work may touch any module in any order. Each session is self-contained — read the relevant source code, make the requested changes, run regression tests.

---

# Autonomous Execution Policy

## Workflow

1. **User describes the deliverable.**
2. **I respond with my understanding** — explicit, nothing assumed. I also ask whether server access is granted for this task.
3. **User approves** the understanding and grants or denies server access.
4. **I execute autonomously from that point:**
   - Implement the changes
   - Run regression tests locally
   - Commit to GitHub (every change must be committed for version control)
   - Monitor GitHub Actions deployment via `gh run watch` / `gh run view`
   - If deployment fails: read logs via `gh run view --log-failed`, fix in code, commit again
   - If the issue is server-side and server access was granted: SSH into production and resolve
   - **Test in production** — local-only results are not sufficient. The work is not done until it is verified on production.

## Do Not Ask for Approval During Execution For
- Applying edits, fixing bugs, retrying after failures
- Refactoring within scope, file restructuring within scope
- Implementation-level decisions
- Committing and pushing to GitHub
- SSHing into the server (if permission was granted for this task)

## Stop and Ask If
- The change requires scope beyond what was requested
- Architecture changes or major unplanned functionality
- A blocker forces a materially different approach

## GitHub — Hard Rules

- **Only interact with `ACANOTES-dev/EduPod`.** Never access, read, push to, or reference any other repo on this account. No exceptions.

## Production Server — Hard Rules

The server is a live production environment. Every action carries real consequences.

- **Assume every command is high-stakes.** Measure all actions against the fact that this is production.
- **No destructive actions** that put the project at risk — no wiping data, dropping tables, deleting databases.
- **Operational deletions are permitted** — removing corrupted files, reverting a bad commit, cleaning up a failed deployment. These are maintenance, not destruction.
- **Never change credentials** (passwords, SSH keys, API keys, secrets) without explicit approval.
- **Never upgrade packages on the server** — versions are controlled from the codebase, not ad-hoc on the server.

---

## Monorepo Structure (Turborepo)

```
root/
├── apps/
│   ├── web/              # Next.js 14+ (App Router) — all role-aware shells
│   ├── api/              # NestJS — modular monolith backend
│   └── worker/           # BullMQ consumer service
├── packages/
│   ├── shared/           # Shared types, constants, Zod schemas
│   │   └── src/scheduler/  # Auto-scheduling CSP solver (pure TypeScript, no DB deps)
│   ├── prisma/           # Prisma schema, client, migrations, seed
│   ├── ui/               # Shared shadcn/Radix component library
│   ├── eslint-config/    # Shared ESLint configuration
│   └── tsconfig/         # Shared TypeScript configurations
├── plans/                # Implementation plans (see structure above)
├── turbo.json
├── package.json
└── .github/workflows/    # CI/CD
```

## Critical Rules — Read Every Time

### RLS — The #1 Rule

Every tenant-scoped table has `tenant_id UUID NOT NULL`. Row-Level Security is enforced at the database layer.

- Tenant context is set via `SET LOCAL app.current_tenant_id` at the start of every Prisma **interactive** transaction
- A Prisma middleware handles this — it reads tenant context from the request pipeline
- **Interactive transactions ONLY**: All tenant-scoped DB access MUST use `prisma.$transaction(async (tx) => { ... })`. The sequential/batch API `prisma.$transaction([...])` is PROHIBITED (PgBouncer transaction mode cannot guarantee connection affinity). Custom ESLint rule `no-sequential-transaction` enforces this.
- **NEVER write raw SQL outside the RLS middleware.** No `$executeRawUnsafe`, no `$queryRawUnsafe` anywhere else. A lint rule enforces this.
- Every BullMQ job payload MUST include `tenant_id`. The `TenantAwareJob` base class sets RLS context before any DB operation. Jobs without `tenant_id` are rejected at enqueue time.
- The `users` table is the ONE exception — it is platform-level, not tenant-scoped, no RLS. Guarded at the application layer.

### Regression Testing — Mandatory

Before considering any work complete, run the full existing test suite to verify nothing was broken by the changes. This is not optional.

- Run `turbo test` (or the relevant test commands for affected packages) after every feature addition, redesign, fix, or refactor
- If any existing test fails that was passing before your changes, you MUST fix the regression before proceeding
- This applies to all work — new features, bug fixes, redesigns, refactors, schema changes
- Do not skip this step. Do not treat it as a nice-to-have. A change that breaks existing functionality is not complete.

### No Drift

- Do not add tables, columns, endpoints, or features beyond what was requested
- Do not unilaterally "improve" the schema or architecture — if you see an opportunity for improvement, flag it to the user for a decision
- If something seems missing, flag it — don't invent it

### Sub-agents

- Sonnet 4.6 or Opus 4.6 models only. Never spawn Haiku sub-agents.

### TypeScript Strict

- `strict: true` in all tsconfig files
- No `any` types. No `@ts-ignore`. No `as unknown as X` casting hacks.
- All API inputs validated with Zod schemas (defined in `packages/shared`)
- All JSONB fields have corresponding Zod schemas



## Sequence Number Generation

Receipt numbers, invoice numbers, application numbers, payslip numbers all use the `tenant_sequences` table with row-level `SELECT ... FOR UPDATE` locking to prevent duplicates under concurrency. Format: `{prefix}-{YYYYMM}-{padded_sequence}`.

## Git Conventions

- Commit messages: conventional commits — `feat(payroll): add payroll run finalisation`

## Permanent Constraints

- No multi-currency — single currency per tenant, always
