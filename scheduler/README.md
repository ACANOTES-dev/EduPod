# Scheduler Rebuild — Orchestration Package

This folder coordinates the staged rebuild of the scheduling module. Every session working on this effort — human or AI — starts here.

## What to read, in order, before doing anything

1. **`IMPLEMENTATION_LOG.md`** — shared state across sessions. Tells you which stages are complete, which is next, and what previous sessions discovered. **Never skip this.**
2. **`PLAN.md`** — the overall architecture and the stage graph. Explains _why_ the work is shaped this way.
3. **`implementations/stage-N.md`** — the stage you are assigned. Self-contained: you should be able to do the stage with just this document plus the log.

## The hard rules (apply to every stage)

### Never push to GitHub. Never create a PR.

All commits are local only. Any deploy happens by rsync + SSH directly to the production server. Server access is granted for this work.

**Why:** The repo has ~16,000 unit tests today. A single CI run through GitHub Actions takes roughly three hours, and each run typically surfaces one or two conflicts that need another push-and-wait cycle. Development would grind to a halt. The current workflow is: commit locally, deploy directly, and every two days the user does a single large rebase to bring `main` up to the head — which itself takes five or six hours of conflict resolution.

If you see yourself about to run `git push`, `gh pr create`, or similar — stop.

### Don't claim completion without testing.

A stage is not done until it is proven to work:

- **Unit / integration tests** for every meaningful code change. Coverage must not regress.
- **Playwright browser testing** for anything with a user-facing surface. If the stage touches frontend or an API behind a frontend, you must open the page in a real browser (via the Playwright MCP tools), exercise the flow, and confirm it works on the production tenant `nhqs.edupod.app`.
- Schema / migration stages cannot be browser-tested; they are proven by running the migration on the server, querying the resulting shape, and running the existing test suite against the new schema.

If it's not tested, the stage is not finished. The completion log entry must list the tests that were run.

### Follow all existing project conventions.

Every scheduling table is tenant-scoped with RLS enforced (see `CLAUDE.md` → "RLS — The #1 Rule"). All interactive DB writes go through `createRlsClient(...).$transaction(async (tx) => { ... })`. TypeScript strict mode, no `any`, no `@ts-ignore`. Run `turbo lint` and `turbo type-check` before committing.

### Commit messages use conventional commits.

`feat(scheduling): ...`, `fix(scheduling): ...`, `refactor(scheduling): ...`, etc. Every commit must end with the `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>` footer.

### Update the log the moment you finish.

The log is useless if it lags. When your stage is genuinely done (tested, deployed, verified), append your completion entry to `IMPLEMENTATION_LOG.md` immediately in the same session. Never defer that write.

## What happens at session boundaries

Each session that picks up this work is expected to:

1. Open `IMPLEMENTATION_LOG.md` and read it in full.
2. Identify the next stage whose prerequisites are all marked complete.
3. Open `implementations/stage-N.md` for that stage.
4. Do the work.
5. Append the completion entry to the log.
6. Stop.

Do not start a stage whose prerequisites are incomplete. The log will tell you the dependency order. This is enforced in the plan.

## File map

```
scheduler/
├── README.md                ← you are here
├── PLAN.md                  ← architecture, stage graph, shared conventions
├── IMPLEMENTATION_LOG.md    ← running state; updated by every session
└── implementations/
    ├── stage-1-schema-migration.md
    ├── stage-2-solver-core.md
    ├── stage-3-api-surface.md
    ├── stage-4-competencies-ui.md
    ├── stage-5-seed-nhqs-data.md
    ├── stage-6-generate-end-to-end.md
    ├── stage-7-substitutes-page.md
    └── stage-8-downstream-rewire.md
```
