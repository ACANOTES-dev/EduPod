# Architecture Policing — Mandatory

The `architecture/` directory contains living reference documents that map cross-module dependencies, event flows, state machines, and danger zones. These files are your safety net for making changes without breaking unrelated parts of the codebase.

## Before Making Any Code Change

1. **Read the pre-flight checklist**: `architecture/pre-flight-checklist.md`
2. **Check blast radius**: Open `architecture/module-blast-radius.md` and identify ALL modules affected by your change — not just the one you're editing
3. **Check event/job flows**: If your change touches BullMQ jobs, approval flows, or async processing, open `architecture/event-job-catalog.md` and trace the full chain
4. **Check state machines**: If your change touches a status/lifecycle field, open `architecture/state-machines.md` and verify valid transitions, side effects, and where validation lives
5. **Check danger zones**: Scan `architecture/danger-zones.md` for entries related to your change area. If listed, read the full entry and follow the mitigation

## After Making Any Code Change

You MUST update the architecture files if your change:

- **Adds or removes a cross-module dependency** (one module importing another module's service) -> Update `architecture/module-blast-radius.md`
- **Adds, removes, or modifies a BullMQ job** (new queue, new job type, changed payload, changed flow) -> Update `architecture/event-job-catalog.md`
- **Adds or modifies a status/state transition** (new enum value, new transition path, new side effect) -> Update `architecture/state-machines.md`
- **Discovers a non-obvious coupling or risk** (something that looks safe but has hidden consequences) -> Add to `architecture/danger-zones.md`
- **Adds a new NestJS module** -> Add to `architecture/module-blast-radius.md` with its exports and consumers
- **Adds a new cron job** -> Add to `architecture/event-job-catalog.md`

## This Is Not Optional

Treating architecture updates as optional is how documentation rots. A code change without its corresponding architecture update is incomplete — the same way a code change without passing tests is incomplete. These files exist because at scale, the codebase becomes too large to hold in context. Without them, changes will silently break unrelated features.
