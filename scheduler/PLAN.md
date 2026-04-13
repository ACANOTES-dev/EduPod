# Scheduler Rebuild — Plan

## Why this work exists

The existing scheduling module carries two structural problems that together make the auto-scheduler unreliable:

1. **`teacher_competencies` is year-group-grained.** A row says "Sarah is qualified for Year 2 English" — but it says nothing about _which section_ of Year 2 she actually teaches. The legacy `is_primary` boolean tried to express a preference, but it's a weak signal and produces ambiguous behaviour when multiple teachers are "primary" for the same subject/year.
2. **Everything reads from competencies, including features that should read from the live timetable.** `teaching-allocations`, `report-comment-windows`, `report-cards-queries` (auth) all reconstruct "who teaches what" by joining competencies with the curriculum matrix. The moment the real timetable diverges from that inferred picture, those features are wrong.

## The target model

- **One competencies table with nullable `class_id`.** A row with `class_id = NULL` is a **pool entry** — "Sarah is qualified for Year 2 English; the solver picks which section she teaches." A row with `class_id = <specific>` is a **pin** — "Sarah teaches 2A English; solver must honour this." Schools can use only pool, only pins, or freely mix.
- **No `is_primary` flag.** Every row is a real assignment. Tiered "primary vs secondary" logic is deleted.
- **Substitutes live in a separate table** (`substitute_teacher_competencies`, built in Stage 7) with the same shape. The substitution board reads from there, not from the primary competencies.
- **The solver no longer scores teachers by primacy.** For each `(class, subject)` in the curriculum:
  1. If a pin exists, teacher is fixed — solver searches only for time slot and room.
  2. Else, pool entries become candidate teachers — solver picks alongside time and room.
  3. Else, the prerequisite check blocks generation for that class.
- **Downstream consumers read from the live `schedules` table**, not from competencies. If a timetable has not been applied yet, those features show empty state. This is semantically correct: you cannot know who teaches a class until a timetable exists.
- **`cover-teacher.service` is deleted entirely.** The substitution board keeps manual pick until Stage 7 wires it up against the new substitutes table.

## Stage graph

All stages are **strictly sequential**. Each stage depends on every prior stage being complete. **No parallelisation.** Do not start a stage whose prerequisites are not marked complete in the log.

```
Stage 1: Schema migration + cover-teacher removal
  ↓
Stage 2: Solver core updates (solver-v2.ts, types-v2.ts, prereq logic)
  ↓
Stage 3: API surface updates (orchestration, competencies controller/service, Zod schemas)
  ↓
Stage 4: Competencies page UI rebuild
  ↓
Stage 5: Seed NHQS data (wipe + reseed curriculum, competencies, availability)
  ↓
Stage 6: Generate end-to-end on NHQS (proves the whole pipeline)
  ↓
Stage 7: Substitutes page + table
  ↓
Stage 8: Downstream rewire (teaching-allocations, report-comments, report-cards auth)
```

### Why sequential?

- Stage 2 cannot compile without Stage 1's schema.
- Stage 3 cannot compile without Stage 2's types.
- Stage 4 depends on the API surface from Stage 3.
- Stage 5 requires the migration and can only seed into the new shape.
- Stage 6 requires seeded data.
- Stage 7 is independent of 4–6 in principle, but is sequenced after so we don't pollute the first generation run with substitute-table noise.
- Stage 8 waits for a real applied timetable to read from.

## Stage summary

| Stage | Name                                     | Touches                                                                                                            | Proven by                                                                                     |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 1     | Schema migration + cover-teacher removal | Prisma schema, RLS SQL, cover-teacher module deletion                                                              | Migration runs clean on server; type-check passes; DI smoke test                              |
| 2     | Solver core                              | `packages/shared/src/scheduler/` (types-v2, solver-v2, constraints-v2, validation)                                 | Unit tests for pin-first + pool + prereqs                                                     |
| 3     | API surface                              | `scheduler-orchestration.service.ts`, `teacher-competencies.*`, Zod schemas, `scheduling-prerequisites.service.ts` | Unit + integration tests; endpoints return class-level data                                   |
| 4     | Competencies UI                          | `/scheduling/competencies/page.tsx`, `/scheduling/competency-coverage/page.tsx`                                    | Playwright: create pool entry, create pin, verify coverage matrix                             |
| 5     | Seed NHQS data                           | Direct DB inserts                                                                                                  | SQL queries confirming the expected row counts and coverage                                   |
| 6     | Generate end-to-end                      | Click Generate on prod UI                                                                                          | Playwright: run completes, entries populate, apply works; `schedules` table has expected rows |
| 7     | Substitutes page                         | New `substitute_teacher_competencies` table, new CRUD API, new UI page                                             | Unit + integration + Playwright                                                               |
| 8     | Downstream rewire                        | `teaching-allocations.service.ts`, `report-comment-windows.service.ts`, `report-cards-queries.service.ts`          | Unit + Playwright against NHQS with applied schedule                                          |

## Shared conventions (read once; apply to every stage)

### Tenant isolation and RLS

- Every tenant-scoped table in scheduling has `tenant_id UUID NOT NULL` and an RLS policy `<table>_tenant_isolation`.
- All interactive DB writes use `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`. Never the sequential `prisma.$transaction([...])` form.
- No `$executeRawUnsafe` / `$queryRawUnsafe` outside the RLS middleware.
- New tables require the standard RLS boilerplate in `post_migrate.sql`.

### TypeScript

- Strict mode. No `any`, no `@ts-ignore`, no `as unknown as X` except the single documented exception in `createRlsClient().$transaction()`.
- Error handling: `try/catch` blocks must either show a toast (user-triggered) or `console.error('[ServiceName.method]', err)` (background). Empty catches are forbidden.
- All API inputs validated with Zod schemas from `packages/shared`. DTOs are re-exports.

### Commits

- Conventional commits: `feat(scheduling): ...`, `fix(scheduling): ...`, `refactor(scheduling): ...`.
- Co-author footer: `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.
- Commit **locally only**. Never `git push`. Never `gh pr create`.

### Deployment

- Rsync source files to `/opt/edupod/app/` on `root@46.62.244.139`. Exclude `.git`, `node_modules`, `.next`, `dist`, `.env`, `.env.local`, `.turbo`, `*.tsbuildinfo`.
- After rsync: `chown -R edupod:edupod /opt/edupod/app/`.
- Rebuild as `edupod` user: `sudo -u edupod bash -lc 'cd /opt/edupod/app && pnpm --filter @school/api build'` (or `@school/web` or `@school/worker`).
- Restart PM2: `sudo -u edupod pm2 restart api` (or `web` or `worker`).
- For Prisma migrations: `sudo -u edupod bash -lc 'cd /opt/edupod/app && pnpm --filter @school/prisma migrate deploy'` — **never** `migrate dev` on the server.

### Testing

- Unit tests co-located with source (`*.spec.ts` beside `*.ts`).
- Integration / e2e tests in `apps/api/test/`.
- Playwright tests exercised against `nhqs.edupod.app` via MCP tools. Login account: `owner@nhqs.test` / `Password123!`.
- Coverage thresholds in `jest.config.js` are a floor — ratchet up, never down.

### Module registration discipline

Before pushing any change that touches a NestJS module's `imports`/`exports`/`providers`, run the DI smoke test from `CLAUDE.md`:

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

## NHQS as the canonical test tenant

All verification happens against `nhqs.edupod.app` (tenant id `3ba9b02c-0339-49b8-8583-a06e05a32ac5`). Current state as of the orchestration kickoff:

- 2 academic years, 9 year groups, 16 classes, 14 subjects, 25 rooms, 34 staff.
- Period grid: 359 slots (39 per year group × 9 year groups) — **already populated, do not overwrite**.
- Break groups: 2, with 9 year-group assignments — **already populated**.
- Curriculum: 24 rows, sparse — **wipe and reseed in Stage 5**.
- Teacher competencies: 122 rows at year-group level — **wipe and reseed in Stage 5**.
- Staff availability: 0 rows — **seed in Stage 5**.
- No room closures, no teacher configs, no preferences — leave empty for now.

## Canonical Reference Material

- `/Users/ram/Desktop/SDB/CLAUDE.md` — project-wide rules, RLS, conventions.
- `/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md` — who calls whom.
- `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md` — scheduling run states.
- `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md` — BullMQ jobs.
