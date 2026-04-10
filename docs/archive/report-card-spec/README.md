# Report Cards Redesign — Spec & Implementation Index

This folder contains the full design and implementation plan for the Report Cards redesign. Use this file as the entry point.

## Files in this folder

```
report-card-spec/
├── README.md                           ← you are here — index + dependency graph
├── design-spec.md                      ← complete product + architecture design
├── implementation-log.md               ← running log of completed implementations (agents write here)
└── implementations/
    ├── 00-common-knowledge.md          ← MUST READ FIRST — shared policies, rules, conventions
    ├── 01-database-foundation.md       ← schema changes, migrations, RLS, Zod schemas, seeds
    ├── 02-comment-system-backend.md    ← comment windows, subject comments, overall comments, AI draft
    ├── 03-settings-and-templates.md    ← tenant settings service + content-scope template refactor
    ├── 04-generation-backend.md        ← generation service refactor + worker processor + wizard APIs
    ├── 05-teacher-requests-backend.md  ← teacher request submission + principal approval flow
    ├── 06-matrix-and-library-backend.md ← matrix query endpoint + library endpoint + old overview removal
    ├── 07-frontend-overview-library.md ← landing (class cards by year), class matrix view, library
    ├── 08-frontend-report-comments.md  ← Report Comments pages + 3-column editor + window banner
    ├── 09-frontend-wizard-settings.md  ← generation wizard multi-step UI + tenant settings page
    ├── 10-frontend-teacher-requests.md ← teacher request submission + principal review queue
    ├── 11-pdf-template-rendering.md    ← PDF template contract + placeholder renderer (visual TBD)
    └── 12-cleanup-and-docs.md          ← old endpoint removal, architecture doc updates, final regression
```

## How to use these docs

1. **Before starting any implementation**, read `design-spec.md` from top to bottom. It is the authoritative source of truth for what is being built and why.
2. **Then read `implementations/00-common-knowledge.md`** — it captures the repo-wide rules (TypeScript strict, RLS, testing, commits, architecture updates, etc.) that every implementation must follow. Do not skip this.
3. **Pick up an implementation file** (01 through 12) based on the dependency graph below.
4. **Execute the implementation** following its task breakdown. Run tests. Verify acceptance criteria.
5. **Log completion** by appending an entry to `implementation-log.md` using the template defined in that file.
6. **Check architecture updates** — each implementation file lists which `docs/architecture/*.md` files may need updating.

## Dependency graph

```
                       ┌─────────────────────────────┐
                       │ 01: Database Foundation     │
                       │  (schema + RLS + Zod)       │
                       └──────────────┬──────────────┘
                                      │ blocks everything
          ┌────────────┬───────────┬──┼──────────────┬────────────┐
          ▼            ▼           ▼  ▼              ▼            ▼
┌──────────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ 02: Comment  │ │ 03: Set  │ │ 04: Gen    │ │ 05: Reqs   │ │ 06: Matrix │
│    system    │ │    tings │ │    backend │ │    backend │ │  & library │
│    backend   │ │    + tpl │ │            │ │            │ │    backend │
└──────┬───────┘ └─────┬────┘ └──────┬─────┘ └──────┬─────┘ └──────┬─────┘
       │               │             │              │              │
       │               ▼             ▼              │              │
       │         ┌───────────────────────┐          │              │
       │         │ 04 depends on 03      │          │              │
       │         │ (templates needed by  │          │              │
       │         │  generator)           │          │              │
       │         └───────────────────────┘          │              │
       │                                            │              │
       ▼                                            ▼              ▼
┌──────────────┐  ┌─────────────────────┐  ┌────────────────┐ ┌──────────┐
│ 08: Frontend │  │ 09: Frontend wizard │  │ 10: Frontend   │ │ 07: FE   │
│    comments  │  │    + settings       │  │    requests    │ │  overview│
└──────────────┘  └─────────────────────┘  └────────────────┘ └──────────┘
                                                                    │
                              ┌─────────────────────────────────────┘
                              ▼
                   ┌──────────────────────┐
                   │ 11: PDF template     │
                   │ (held for user       │
                   │  visual design)      │
                   └──────────┬───────────┘
                              │
                              ▼
                   ┌──────────────────────┐
                   │ 12: Cleanup & docs   │
                   │ (old endpoint delete,│
                   │  architecture docs)  │
                   └──────────────────────┘
```

## Parallelisation matrix

Implementations that can be worked on **in parallel** (no shared files, no sequential dependencies between them):

| Wave                          | Implementations | Can run in parallel?                                 | Gating factor                                          |
| ----------------------------- | --------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| **Wave 1**                    | 01 alone        | No — must be first                                   | Schema gates everything                                |
| **Wave 2 (backend fan-out)**  | 02, 03, 05, 06  | **Yes** — all four can run in parallel once 01 lands | None among these                                       |
| **Wave 2 (generation)**       | 04              | After 03 only                                        | 04 depends on template changes in 03                   |
| **Wave 3 (frontend fan-out)** | 07, 08, 09, 10  | **Yes** — all four can run in parallel               | Each waits for its respective backend wave 2 to finish |
| **Wave 4 (PDF)**              | 11              | After 04                                             | Needs the generation service's render contract         |
| **Wave 5 (cleanup)**          | 12              | Last                                                 | Needs all prior implementations merged                 |

### Practical parallelisation for a single developer or Claude-assisted workflow

- You (or one agent) can only edit one file at a time, but **agents dispatched to non-overlapping file sets can run concurrently**.
- 02, 03, 05, 06 touch **distinct backend service files** and can absolutely be parallelised by dispatching four agents.
- 07, 08, 09, 10 touch **distinct frontend page folders** and can likewise be parallelised.
- 04 and 11 involve deeper coordination with the generation flow and are better done sequentially.

## Current status

See `implementation-log.md` for the running status of each implementation and which ones have been completed.

## Related reference docs

| Doc                                                               | Why it matters                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `/Users/ram/Desktop/SDB/CLAUDE.md`                                | Project-wide rules (TypeScript strict, RLS, regression testing, commits, etc.) |
| `/Users/ram/Desktop/SDB/.claude/rules/backend.md`                 | NestJS controller/service patterns                                             |
| `/Users/ram/Desktop/SDB/.claude/rules/frontend.md`                | Next.js / RTL / mobile rules                                                   |
| `/Users/ram/Desktop/SDB/.claude/rules/prisma.md`                  | Schema, migration, column conventions                                          |
| `/Users/ram/Desktop/SDB/.claude/rules/testing.md`                 | Testing requirements (RLS leakage, coverage)                                   |
| `/Users/ram/Desktop/SDB/.claude/rules/code-quality.md`            | Lint, type-check, import ordering                                              |
| `/Users/ram/Desktop/SDB/.claude/rules/architecture-policing.md`   | When to update `docs/architecture/*.md`                                        |
| `/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md` | Cross-module dependencies — update when you add one                            |
| `/Users/ram/Desktop/SDB/docs/architecture/event-job-catalog.md`   | BullMQ job catalog — update when you add/change a job                          |
| `/Users/ram/Desktop/SDB/docs/architecture/state-machines.md`      | Lifecycle state machines — update when you add one                             |
| `/Users/ram/Desktop/SDB/docs/plans/context.md`                    | Architecture, RLS, auth context                                                |
| `/Users/ram/Desktop/SDB/docs/plans/ux-redesign-final-spec.md`     | Frontend source of truth (morphing shell, tokens)                              |
