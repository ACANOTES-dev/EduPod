---
description: 'Create a full rebuild orchestration package (PLAN.md + implementations/*.md + IMPLEMENTATION_LOG.md + matching execution slash command) for a new module or feature. Accounts for frontend-parallelisation failure modes learned from the new-inbox Wave 4 incident. Usage: /log <module-slug>'
---

# Create Rebuild Orchestration — $ARGUMENTS

You are creating a full rebuild orchestration package for **$ARGUMENTS**. This command encapsulates the pattern used for `new-admissions` and `new-inbox`: decompose a spec into waves → write a master plan → split into per-implementation files → write an implementation log → write an execution slash command. The output must also account for the parallelisation failures we saw on `new-inbox` Wave 4 — this is the hardened template.

## Step 0 · Ground rules before you start

This command operates at project root. The output structure you create is:

```
$ARGUMENTS/
├── PLAN.md                    # Master plan (vision, architecture, design decisions)
├── IMPLEMENTATION_LOG.md      # Wave structure, rules, status table, completion records
└── implementations/
    ├── 01-<slug>.md
    ├── 02-<slug>.md
    └── ...
.claude/commands/$ARGUMENTS.md # The execution slash command (matches the one in new-admissions / inbox)
```

The `<module-slug>` in `$ARGUMENTS` becomes the folder name and the execution-command name. Use kebab-case (`new-homework`, not `New Homework` or `new_homework`).

**Do not execute any implementations.** This command is a creator, not an executor. Your deliverable is the orchestration package. The user runs the individual implementations later via `/$ARGUMENTS 01`, `/$ARGUMENTS 02`, etc.

## Step 1 · Locate or brainstorm the plan

Before writing anything, the user must have a clear spec. Two branches:

**Branch A — the user already has a plan.** Ask them: "Where is the spec? Point me at a file or paste it inline." Read it carefully. Confirm you understand the scope in a short paragraph. If anything is unclear, ask targeted questions before proceeding.

**Branch B — the user has an idea but no spec.** This is expensive — it means you need to have a design conversation first. Walk them through the important design decisions using the same approach we used for the inbox rebuild:

- What's the user-facing problem this solves?
- What existing modules will this touch or reuse?
- Who are the actors (roles, permissions)?
- What are the load-bearing design decisions (data model, state machine, privacy boundaries)?
- What is explicitly out of scope?
- What are the open questions that would be hard to reverse later?

Resolve every hard-to-reverse design decision WITH the user before you write PLAN.md. Execution decisions are yours; design decisions are theirs. This is the same rule we followed for the inbox.

Do not start writing files until the user confirms the design.

## Step 2 · Decompose into implementations and classify each one

Once the plan is locked, break it into implementation units. Each unit should be ~0.5–1 day of focused work. Aim for **8–20 implementations**. Fewer than 8 and you're under-decomposing (each impl will be too large). More than 20 and you're over-decomposing (coordination overhead will eat the gains).

For each implementation, classify it as one of:

| Classification | Meaning                                                                            | Parallelisation behaviour                             |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `schema`       | Prisma schema changes, migrations, seed defaults, shared types. Usually exactly 1. | Serial. Wave 1 is almost always a single schema impl. |
| `backend`      | API services, controllers, repositories inside one module directory                | Parallel-safe. Each impl owns its directory.          |
| `worker`       | BullMQ processors, cron jobs                                                       | Parallel-safe. Each impl owns its file(s).            |
| `integration`  | Cross-module wiring (bridges, module registration, legacy adapters)                | Parallel-safe with care. Flag shared module files.    |
| `frontend`     | Next.js pages, components, settings, shell touches                                 | **PARALLEL-RISKY.** Apply Wave 4 hardening rules.     |
| `polish`       | Translations, mobile pass, docs, smoke tests, cleanup                              | Serial. Usually the last wave.                        |

The classification determines the wave rules this impl gets. Frontend impls get the hardened rules; backend impls get the simpler parallel rules.

## Step 3 · Group into waves

Waves group impls that can start simultaneously. Rules:

- **Wave 1 is the schema foundation.** Always serial, always first.
- **Subsequent waves group by dependency depth.** An impl goes into the earliest wave where all its prerequisites are in prior waves.
- **Frontend impls should be in their own wave**, not mixed with backend. This is important because the hardened rules apply to the whole wave. A Wave 4 that mixes API work and frontend work has to apply frontend rules to the backend sub-wave too, which wastes effort.
- **Polish is the last wave, always serial.**

Name each wave's theme in one phrase ("Backend services", "Frontend shell", etc.).

## Step 4 · For every implementation, identify shared files

This is the step that did not exist in the inbox rebuild and is the main reason Wave 4 failed. For every implementation, enumerate the **shared files** it will need to touch — files that other implementations in the same wave will also need to touch. Common shared-file hot zones (this is not exhaustive — think hard about the specific project):

**Translations and i18n:**

- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`
- Any other locale files the project uses

**App shell and navigation:**

- Morph bar / top-bar component files
- Module sub-strip / navigation definitions
- Root layout files
- Shell provider / context files
- Mobile nav overlays

**Shared dashboards and home pages:**

- The home dashboard grid (where widgets live)
- Role-specific home components (e.g. `admin-home.tsx`)

**Shared component files:**

- `_components/` folders that multiple impls reference
- Shared UI primitives if the impl adds to them

**Shared backend module files:**

- `inbox.module.ts` / `communications.module.ts` — where providers / controllers get registered
- Module-level DI graphs

**Shared seed and config:**

- `packages/prisma/seed/system-roles.ts` (permissions)
- Tenant settings seeds
- Feature-flag tables

**The orchestration file itself:**

- `IMPLEMENTATION_LOG.md` — every impl writes to it, must be committed in isolation

For each implementation's file, add a **"Shared files this impl touches"** section listing every shared file with a one-line description of what this impl adds to it. If an impl shares 3+ files with another impl in the same wave, flag it — you may need to serialise those two or negotiate ownership.

## Step 5 · Write the master plan (`$ARGUMENTS/PLAN.md`)

Structure follows the `new-inbox/PLAN.md` and `new-admissions/PLAN.md` pattern. Sections:

1. **Why we're building this** — the user-facing problem in a paragraph
2. **The core model** — the primary data/state shape (conversation model, state machine, capacity math, whatever anchors the feature)
3. **Architecture** — the modules, data flow, integration points
4. **Permission / privacy rules** — who can do what, with invariants
5. **Data model overview** — table names and brief purpose (full schema in impl 01)
6. **Component map** — file tree sketch of what will exist
7. **Wave breakdown** — summary table (full detail in IMPLEMENTATION_LOG.md §3)
8. **Out of scope** — explicit non-goals
9. **Why this shape** — closing argument for the design choices

The plan is the user-facing source of truth for the design. Implementation files are the executor-facing source of truth for the code.

## Step 6 · Write each implementation file (`$ARGUMENTS/implementations/NN-<slug>.md`)

Use this template for every impl:

```markdown
# Implementation NN — <Title>

> **Wave:** <N> (<serial | parallel with X, Y, Z>)
> **Classification:** <schema | backend | worker | integration | frontend | polish>
> **Depends on:** <NN, NN or "nothing">
> **Deploys:** <migration + API + worker + web restart | API only | worker only | web only>

---

## Goal

<1–2 paragraphs: what this impl accomplishes and why.>

## Shared files this impl touches

List every shared file this impl writes to. For each, say WHAT this impl adds and WHEN (early in the impl, late, or in the final commit window).

- `apps/web/messages/en.json` — adds `<module>.<section>.*` keys. Edit in the final commit window.
- `apps/web/messages/ar.json` — same keys, Arabic translations. Edit in the final commit window.
- `<shell file>` — adds nav entry for X. Edit in the final commit window.
- `<module>.module.ts` — registers `<Service>`. Edit in the final commit window.
- `<any seed file>` — adds permission/role/defaults. Edit in the final commit window.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit, after all other commits.

If this impl has zero shared files, say so explicitly: "Shared files: none — this impl owns its entire footprint." That is the signal to the executor that they can work without Wave 4 hardening.

## What to build

<The detailed recipe: files to create, data model changes, service methods, controller routes, tests. Same style as new-inbox implementation files.>

## Tests

<Minimum coverage list — describe blocks and scenarios. Include RLS leakage tests for tenant-scoped tables.>

## Watch out for

<Gotchas specific to this impl: circular deps, cache invalidation, performance concerns, cross-module access rules, etc.>

## Deployment notes

<What restarts, what smoke tests, expected prod verification steps.>
```

The **Shared files** section is mandatory and is the single most important addition vs. the new-inbox template.

## Step 7 · Write `$ARGUMENTS/IMPLEMENTATION_LOG.md`

Copy the structure from `new-inbox/IMPLEMENTATION_LOG.md` but apply the hardened Wave 4 rules. Specifically, the rules section must include:

### Baseline rules (from new-inbox)

1. Read this file before starting any implementation
2. Verify cross-wave prerequisites
3. Read summaries of completed prerequisites
4. Implementations within the same wave code in parallel; only deployments serialise (first-come-first-served, not numeric order); shared restart target serialises via 3-minute poll
5. NEVER push to GitHub during the rebuild
6. Deploy directly to production via SSH patch flow
7. Update the log at the end of your implementation
8. Regression tests are mandatory
9. Follow `.claude/rules/*` conventions
10. If blocked, STOP and update the log
11. Never weaken privacy invariants

### Hardened rules for parallel coding (new, from Wave 4 learnings)

Add the following rules — these are the specific failure modes Wave 4 exposed:

**Rule — Read the "Shared files" section of your implementation file FIRST.** Every impl file has a `## Shared files this impl touches` section. Read it. It lists the hot zones where you will conflict with sibling sessions.

**Rule — Commit at every sub-step, not at the end.** The implementation file's `## What to build` has numbered sub-steps. Commit after each one that produces a working state. Four or five commits per impl is normal. DO NOT sit on hours of uncommitted work — it is exposed to every other session's edits and to lint-staged's stash behaviour.

**Rule — Stage by explicit pathspec, never `git add .` or `git add -A`.** Every `git add` must list the exact files you want to stage:

```bash
git add apps/api/src/modules/inbox/policy/messaging-policy.service.ts \
        apps/api/src/modules/inbox/policy/messaging-policy.service.spec.ts
```

If you default to `git add .` you will sweep up sibling sessions' untracked work and attribute it to your commit, triggering a revert war.

**Rule — Run `git status` before every commit and inspect it.** If you see files you did not touch, ABORT the commit. A sibling session has written into your working tree. Stash your own changes, investigate, and only commit once the working tree contains exactly what you intended.

**Rule — Shared files go LAST.** When your implementation's `## What to build` has sub-steps that touch shared files (translations, shell, seeds, module registration), do those sub-steps LAST, as close to your commit as possible. This minimises the window of exposure during which a sibling session can overwrite your edits. The ideal pattern: complete every isolated sub-step first, commit them, then do all shared-file edits in a single final commit.

**Rule — Beware lint-staged auto-stash.** Husky + lint-staged stashes unstaged and untracked files before running pre-commit checks, then restores them. If a sibling session has untracked files in the working tree at the moment you commit, they can be destroyed during the stash/restore cycle. Before running `git commit`, verify `git status` shows ONLY files you intend to commit. Anything untracked or unstaged that belongs to a sibling session must be left out by staging only your own pathspecs.

**Rule — The `IMPLEMENTATION_LOG.md` is a shared file and always goes in its OWN separate commit.** Never bundle log updates with code changes. The pattern is:

```
feat(<module>): <impl title>         <- code commit(s), pathspec'd
docs(<module>): log completion of implementation NN   <- log commit, alone
```

Multiple sessions writing to the log at the same time cause merge noise, but isolating the log commit limits the blast radius.

**Rule — If you are a frontend impl touching translations, add the translation keys FIRST into a local buffer (memo file, scratch file) and write them into `en.json`/`ar.json` only in your final commit window.** The moment you touch `en.json`, you are racing every other frontend sibling. Keep the window short.

**Rule — Deep-merge `en.json`/`ar.json` edits, never replace the file.** If you edit these files, read the current content first, merge your additions into the existing structure, write the result. Do not assume the file content you loaded 30 minutes ago is still current — re-read immediately before writing.

**Rule — If you discover a conflict you cannot resolve (sibling wiped your work, lint-staged destroyed untracked files), STOP and file a follow-up note in the log. Do not blindly re-apply — you may overwrite a fix someone else just made.**

### Wave structure section

Follow the new-inbox format but add a column to the wave table: `Parallelisation mode`. Values:

- `serial` — must run one at a time (schema, polish)
- `parallel-safe` — each impl owns its directory, no shared files or only `<module>.module.ts`
- `parallel-risky` — shared files exist; hardened rules apply

### Deployment matrix

Same as new-inbox: rows per impl, columns for Migration / API / Worker / Web restart.

### Wave status table

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`. Columns: `#`, `Title`, `Wave`, `Classification`, `Parallelisation mode`, `Depends on`, `Status`, `Completed at`, `Commit SHA`.

### Completion records template

Same as new-inbox: ISO timestamp, commit, deployed state, 200-word summary, follow-ups, session notes.

## Step 8 · Write the execution slash command (`.claude/commands/$ARGUMENTS.md`)

Copy the structure from `.claude/commands/inbox.md` but with the hardened Wave 4 rules embedded into the Step 4 (Execute) section. The slash command must include:

1. Step 0 — read the context (log, plan, impl file)
2. Step 1 — validate cross-wave prerequisites with 30-minute-no-timeout polling
3. Step 2 — read completion records of prerequisite impls
4. Step 3 — mark yourself `in-progress` in the log (separate commit)
5. **Step 4 — Execute the implementation — with explicit parallel-coding hardening**
6. Step 5 — commit locally (pathspec staging required)
7. Step 6a — pre-deploy serialisation check (3-minute poll, no timeout, first-come-first-served)
8. Step 6b — apply and restart
9. Step 7 — update the log in a SEPARATE commit
10. Step 8 — report to the user

In **Step 4**, add this block verbatim (it is the main hardening delta from the inbox command):

```
## Step 4 · Execute the implementation

Before writing any code:

1. Re-read your implementation file's "Shared files this impl touches" section.
   List them mentally — these are your conflict zones with sibling sessions.

2. Plan your commit cadence. The implementation file's sub-steps define natural
   commit boundaries. Aim for 3–5 commits per impl, not 1. Isolated sub-steps
   (your own directory, your own service) commit early. Shared-file sub-steps
   (translations, shell, seeds, module registration) commit LAST in one final
   commit.

3. Follow these rules at every commit:

   - Run `git status` before staging. Inspect the output. If you see files
     you did not touch, STOP — a sibling session has written into your working
     tree. Investigate before proceeding.

   - Stage ONLY your own files by explicit pathspec:
       git add path/to/your/file.ts path/to/your/spec.ts
     Never `git add .` or `git add -A`. Sweeping up sibling work causes revert wars.

   - If the sub-step involves translations, re-read en.json/ar.json immediately
     before writing your additions — deep-merge your keys into the current content,
     do not overwrite the file with a 30-minute-stale version.

   - Never bundle log updates with code commits. Log updates get their own commit
     in Step 7 after the code is deployed.

4. Run the implementation file's recipe. Commit after each sub-step that produces
   a working state.

5. Before entering Step 5 (the final commit), do ALL shared-file edits that you
   deferred. This is the minimum-exposure window.
```

Paste the rest of the command from the `inbox.md` template with project-specific substitutions (`inbox` → `$ARGUMENTS`, patch filename prefix, commit message scope, etc.).

## Step 9 · Verify and report to the user

After writing all files:

1. Confirm the file tree exists under `$ARGUMENTS/`:
   - `PLAN.md`
   - `IMPLEMENTATION_LOG.md`
   - `implementations/01-*.md` through `implementations/NN-*.md`
2. Confirm the slash command exists at `.claude/commands/$ARGUMENTS.md`.
3. Print a summary to the user:

```
✅ Orchestration package created for $ARGUMENTS.

- Plan: $ARGUMENTS/PLAN.md (<word count>)
- Implementations: <N> files across <W> waves
  - Wave 1: <impl numbers> (<classification>)
  - Wave 2: <impl numbers> (<classification>)
  - ...
- Log: $ARGUMENTS/IMPLEMENTATION_LOG.md (hardened Wave-4 rules applied)
- Execution: /$ARGUMENTS NN

Hot zones flagged:
- <list of implementations that touch 3+ shared files>

To kick off: run `/$ARGUMENTS 01` in a new session.
```

4. If any Wave has parallel-risky impls touching overlapping shared files, call it out explicitly. The user should know which impls will be the painful ones before they start.

---

## Rules you must never break when running this command

1. **Never skip the design conversation for Branch B.** If the user doesn't have a spec yet, have the design conversation. Do not make up requirements.
2. **Never create files outside `$ARGUMENTS/` and `.claude/commands/$ARGUMENTS.md`.** This command does not touch source code.
3. **Never forget the Shared files section in an implementation file.** Even if a backend impl has no shared files, write `Shared files: none` explicitly.
4. **Never write an execution slash command that lacks the Step 4 hardening block.** The whole point of this command is to prevent another Wave 4 incident.
5. **Never set a timeout on any polling loop in the execution slash command.** Prerequisites polling and deploy-serialisation polling must be infinite (until done or blocked). The user can always interrupt.
6. **Never enforce numeric deploy order within a wave.** First-come-first-served for deployments, gated only by shared restart target.
7. **Never classify a frontend impl as `parallel-safe`.** Frontend impls always get `parallel-risky` unless you can prove zero shared files.
8. **Never invent a rebuild spec the user didn't ask for.** The user owns the design; you own the execution template.
