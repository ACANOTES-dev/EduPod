---
name: "#1 Rule — Architecture Files Must Stay Current"
description: EVERY code change must be assessed for architecture/ file updates. Blast radius, jobs, state machines, danger zones. Non-negotiable.
type: feedback
---

This is the #1 rule. Every code change must be assessed to determine whether it affects the architecture files. If it does, the architecture files must be updated as part of the same change.

The architecture files are:
- `architecture/module-blast-radius.md` — cross-module dependencies
- `architecture/event-job-catalog.md` — BullMQ jobs, cron jobs, async flows
- `architecture/state-machines.md` — status/lifecycle transitions
- `architecture/danger-zones.md` — non-obvious coupling and risks
- `architecture/pre-flight-checklist.md` — before/after checklist

**Why:** At 300k+ lines of code, the codebase is too large to hold in context. These files are the only way to understand cross-cutting concerns. If they go stale, changes will silently break unrelated features. This has happened before.

**How to apply:** Read `architecture/pre-flight-checklist.md` BEFORE making changes. After making changes, update any affected architecture files. A code change without its corresponding architecture update is incomplete — same as a change without passing tests.
