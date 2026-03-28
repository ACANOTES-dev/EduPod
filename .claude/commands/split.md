# /split — Decompose a Spec into Phases + Implementation Log

You are a software architect. Read a raw feature spec, decompose it into focused, minimal-overlap phases, write one spec file per phase, then generate an `IMPLEMENTATION-LOG.md` that maps waves, deploy order, and execution tracking — ready for `/agentx` to execute.

---

## Input

User provides a path to the feature/initiative spec:

```
/split Plans/GDPR-INTEGRATION-PLAN.md
/split "Next Features/Payments/payment-gateway-spec.md"
```

---

## Stage 1 — Read & Analyse the Spec

1. Read the spec file in full.
2. Extract every distinct feature, capability, and system concern mentioned.
3. Categorise by layer:
   - **Schema** — new tables, migrations, RLS policies, seed data
   - **Shared types** — Zod schemas, enums, constants in `packages/shared`
   - **API** — service layer, CRUD endpoints, business logic, DTOs
   - **Background jobs** — BullMQ processors, cron schedulers, async side-effects
   - **Frontend** — pages, forms, UI components, i18n strings
   - **Integrations** — third-party APIs, webhooks, outbound calls
   - **Notifications** — email templates, push, in-app
   - **Admin / Reporting** — platform admin views, audit exports, analytics
   - **Hardening** — edge-case handling, extra test coverage, performance tuning
4. Note cross-cutting concerns that span multiple layers (e.g., a new entity that needs schema + API + frontend + jobs).
5. Note any concerns that are explicitly **excluded** from the spec.

---

## Stage 2 — Define Phases

Group the extracted features into phases using these principles:

| Principle | Rule |
|-----------|------|
| **Focused scope** | Each phase covers one cohesive system concern. Not "everything related to X". |
| **Minimal overlap** | Phases do not duplicate files or logic. If overlap is unavoidable, note it explicitly. |
| **Independently deployable** | Each phase, when deployed on its own, must not break the live system. |
| **Dependency-aware** | If Phase B requires a schema or service from Phase A, B explicitly depends on A. |
| **Appropriately sized** | A phase should be achievable by a parallel agent team in a single session. |

**Typical groupings** (adapt to what the spec actually needs — do not invent phases for concerns not in the spec):

| Phase type | What belongs here |
|------------|------------------|
| Foundation | Tables, migrations, RLS policies, shared types, seed data |
| Core API | Service layer, endpoints, business logic, DTOs |
| Background jobs | BullMQ processors, cron jobs |
| Frontend | Pages, forms, components, i18n |
| Integrations | Third-party APIs, webhooks |
| Notifications | Email, push, in-app |
| Admin / Reporting | Admin views, audit exports, reports |
| Hardening | Edge cases, extra test coverage, performance |

**Overlap rules:**
- If two phases both need a table defined elsewhere, that table belongs to whichever phase creates it — the other phase lists it as a dependency.
- If unavoidable shared work exists (e.g., one migration that serves two features), put it in the earlier phase and note it in the later phase's "Dependencies" section.

---

## Stage 3 — Assign Dependencies, Waves, and Deploy Order

### Dependencies

For each phase, determine which other phases it depends on:
- Phase consumes a DB table defined in another phase → depends on it
- Phase imports a Zod schema, service, or constant defined in another phase → depends on it
- Frontend phases typically depend on their corresponding API phases
- Jobs writing to a table created in a Foundation phase depend on that phase
- No dependency → candidate for Wave 1

### Waves

Assign using topological sort:
- **Wave 1**: phases with zero dependencies
- **Wave 2**: phases whose dependencies are entirely in Wave 1
- **Wave N**: phases whose dependencies are entirely in Waves 1 through N−1

### Deploy order

Assign a **globally sequential** deploy number `d1, d2, d3…` across ALL phases and ALL waves (no two phases share a d-number). Within a wave, use this priority to determine d-order:

1. **Shared infrastructure first** — migrations, guards, middleware, global schemas get lower d-numbers; other phases in the same wave may rely on them at deploy-time even if not at build-time
2. **Higher fan-out first** — phases that unblock more downstream work deploy earlier (fail fast on infrastructure problems)
3. **Smaller scope first** — among otherwise-equal phases, deploy shorter ones first to reduce queue length
4. **Alphabetical tiebreaker**

Wave N always receives higher d-numbers than Wave N−1.

---

## Stage 4 — Write Phase Spec Files

Create one spec file per phase in the **same directory as the master spec**.

**Filename**: `Phase-[Identifier]-[Short-Title].md`
Examples: `Phase-A-Foundation.md`, `Phase-D-Frontend.md`

Use capital letters (A, B, C…) as identifiers.

Each file MUST use exactly this structure:

```markdown
# Phase [X] — [Title]

**Wave**: [N]
**Deploy Order**: d[N]
**Depends On**: [Comma-separated phase identifiers, or "None"]

## Scope

[2–4 sentences describing what this phase delivers and why it is a coherent, focused unit]

## Deliverables

[Bullet list of every concrete output: file paths, endpoints, pages, jobs, migrations, test files]

## Out of Scope

[Explicitly list what is NOT in this phase — prevents scope creep and agent confusion]

## Dependencies

[If Depends On is not None: what specifically from each dependency is required and why]

## Implementation Notes

[Non-obvious considerations: cross-module dependencies, RLS requirements, state machine impacts,
shared infrastructure, ordering constraints within the phase]
```

---

## Stage 5 — Write the Implementation Log

Create `IMPLEMENTATION-LOG.md` in the **same directory as the master spec**.

**This file is written once by `/split` and is read-only for all phase agents.** Agents never edit it. Status is tracked via files in the `.status/` subfolder (see below).

### Section 1 — Header

```markdown
# [Initiative Name] Implementation Log

**Created**: [today's date]
**Master Spec**: [relative path to master spec]
**Status files**: `.status/` subfolder (one file per phase — written by agents, never edit this log)

---
```

### Section 2 — Dependency Graph

ASCII art showing the full dependency chain. Arrows mean "must complete before":

```
Phase A ──► Phase C ──► Phase E
Phase B ──► Phase D ──►┘
Phase F  (independent — schedulable any time)
```

Phases at the same horizontal level with no arrows between them can build in parallel.

### Section 3 — Deployment Waves

One sub-section per wave. Each contains a table followed by a shorthand summary line.

```markdown
### Wave 1 — [Description]

| Subplan | Title | Deploy Order | Depends On | Spec File |
|---------|-------|--------------|------------|-----------|
| A | Foundation | d1 | None | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |
| B | Shared Types | d2 | None | [Phase-B-Shared-Types.md](./Phase-B-Shared-Types.md) |

Build parallel: A, B — Deploy order: A (d1) → B (d2)
```

**The Spec File column is mandatory.** `/agentx` uses it to identify which subplan it is working on when checking the deploy gate. Use relative paths from the implementation log's directory.

### Section 4 — Phase Registry

```markdown
## Phase Registry

| Phase | Title | Wave | d# | Depends On | Unlocks | Spec File |
|-------|-------|------|----|------------|---------|-----------|
| A | Foundation | 1 | d1 | None | B, C | [Phase-A-Foundation.md](./Phase-A-Foundation.md) |
```

This table is a static reference. Phase status is tracked via `.status/` files, not here.

### Section 5 — Status File Protocol

```markdown
## Status File Protocol

Phase agents write status files to the `.status/` subfolder (sibling of this file).
This log is never modified after creation.

| Event | File written | Content |
|-------|-------------|---------|
| Build complete, awaiting deploy gate | `.status/Phase-A.built` | ISO timestamp |
| Deployed and CI passed | `.status/Phase-A.complete` | commit hash, ISO timestamp, optional notes |

To check if Phase A is complete: check whether `.status/Phase-A.complete` exists.
To check if Phase A has built: check whether `.status/Phase-A.built` exists.

No two agents write to the same file. Concurrent sessions are safe.
```

---

## Stage 6 — Validate

Re-read all created files and verify:

1. Every deliverable from the master spec appears in exactly one phase
2. No deliverable is missing (nothing from the spec was accidentally dropped)
3. No phase's dependencies are in the same or a later wave
4. d-numbers are globally unique and sequential from d1 with no gaps
5. Every phase file's Wave and Deploy Order match the implementation log
6. Every Spec File link in the log matches a file you created
7. The Phase Registry "Unlocks" column correctly reflects what depends on each phase

Report any inconsistency before declaring the work done.

---

## Stage 7 — Output Summary

Print:

```
Plan decomposed: [initiative name]

Phases:        [N] phases
Waves:         [N] waves
d-order:       d1 → d2 → ... → dN
Critical path: [longest dependency chain] ([N] waves minimum)

Phases per wave:
  Wave 1: [A, B]     — deploy: A(d1) → B(d2)
  Wave 2: [C, D, E]  — deploy: C(d3) → D(d4) → E(d5)
  ...

Files written:
  [list each phase spec file]
  IMPLEMENTATION-LOG.md
```

---

Now read the spec provided and begin Stage 1.
