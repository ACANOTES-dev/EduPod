# Getting Started

This guide is the fastest path from a fresh clone to a working local School Operating System environment.

## 1. Prerequisites

- Node.js 24 or newer
- pnpm 9.15.4 or newer
- Docker Desktop
- Git

Optional for payment-related work:

- Stripe CLI

You can bootstrap the local toolchain on macOS with:

```bash
bash scripts/setup.sh
```

## 2. Clone the Repository

```bash
git clone https://github.com/ACANOTES-dev/EduPod.git
cd EduPod
```

If the repo is missing dependencies because iCloud evicted cached files, rerun:

```bash
pnpm install --frozen-lockfile
```

## 3. Install Dependencies and Git Hooks

```bash
pnpm install --frozen-lockfile
```

This installs workspace dependencies and prepares Husky, which enables both pre-commit and commit-message checks.

## 4. Configure Environment Variables

```bash
cp .env.example .env
```

Fill in the values required for the features you are working on. At minimum, local development usually needs database, Redis, and app auth settings. Do not invent secrets in committed files.

## 5. Start Local Services

```bash
docker compose up -d
```

Local defaults:

- Web: `http://localhost:5551`
- API: `http://localhost:5552`
- PostgreSQL: `localhost:5553`
- Redis: `localhost:5554`

## 6. Generate Prisma Client

```bash
pnpm --filter @school/prisma exec prisma generate
```

Run this again after Prisma schema changes.

## 7. Seed Local Data

```bash
pnpm db:seed
```

If you need the demo data flow described in the repo scripts:

```bash
pnpm seed:demo
```

## 8. Run the App

```bash
pnpm dev
```

This starts the web app, API, and worker through Turborepo.

## 9. Verify the Baseline

Before changing code, make sure the current branch is healthy:

```bash
pnpm turbo run type-check
pnpm turbo run lint
pnpm turbo run test
pnpm i18n:check
pnpm hotspots:check
```

## 10. Day-to-Day Development Workflow

1. Read `Plans/context.md` and `architecture/pre-flight-checklist.md` before meaningful changes.
2. Check `architecture/module-blast-radius.md` and `architecture/danger-zones.md` for touched modules.
3. Make focused changes without drifting beyond the request.
4. Run targeted tests while iterating.
5. Run the full verification set before pushing or opening a PR.
6. Refresh hotspot metrics if you changed a tracked hotspot module.

## 11. Working with Tenancy and RLS

- Tenant-scoped writes must use Prisma interactive transactions.
- Sequential `prisma.$transaction([...])` is not allowed for tenant data.
- BullMQ payloads must include `tenant_id`.
- Raw SQL is only allowed in the sanctioned RLS middleware path.

## 12. Contributing Expectations

- Commit messages must follow Conventional Commits. Example: `feat(payroll): add payroll run finalisation`
- PRs should use the repository template and include change-cost notes for hotspot modules.
- Architecture documentation is part of the code change whenever coupling or behavior changes.
- New frontend forms should use `react-hook-form` with `zodResolver` and shared schemas.
- Human-facing UI strings belong in `apps/web/messages/en.json` and `apps/web/messages/ar.json`.

## 13. Useful Commands

```bash
pnpm turbo run lint
pnpm turbo run type-check
pnpm turbo run test
pnpm i18n:check
pnpm hotspots:check
pnpm hotspots:report
```

## 14. Troubleshooting

- Missing dependencies after sync or storage cleanup: rerun `pnpm install --frozen-lockfile`
- Prisma client errors after schema changes: rerun `pnpm --filter @school/prisma exec prisma generate`
- Hooks not firing: rerun `pnpm exec husky`
- Local `.app` domain issues: use `localhost`, not `.app`, because HSTS is preloaded
