---
description: Plan a phase implementation without executing. Usage: /plan-phase P0
---

# Plan Phase: $ARGUMENTS

You are creating an implementation plan for phase **$ARGUMENTS** of the School Operating System. You are ONLY planning — do not write any application code, do not create files outside `plans/`, do not run migrations.

## 1. Load Required Files

Read these files before planning:
- `plans/context.md` (always)
- `plans/phases-instruction/$ARGUMENTS.md` (the phase to plan)
- `plans/ui-design-brief.md` (if the phase includes any frontend work)
- Check the phase file header — if it lists adjacent phase references, load those too
- Scan `plans/phases-results/` — read ALL prior phase result files to understand what's already built (services, endpoints, tables, patterns established)

## 2. Produce the Plan

Create `plans/phases-plan/$ARGUMENTS-plan.md` containing the sections below. This file will be consumed by a SEPARATE execution session that has no memory of your planning reasoning. It must be completely self-contained.

### Section 1 — Overview
- One paragraph: what this phase delivers and its key dependencies on prior phases
- Explicit list of prior-phase services/modules this phase imports or extends

### Section 2 — Database Changes
For every table created or modified:
- Full column list with types, constraints, defaults
- All indexes (name, columns, partial conditions)
- All unique constraints and exclusion constraints
- RLS policy (standard or dual-policy)
- `set_updated_at()` trigger: yes/no with reasoning
- Foreign key relationships
- Seed data required

### Section 3 — API Endpoints
For every endpoint:
- Method, path, permission required
- Request schema (Zod shape with field types and validation rules)
- Response schema
- Business logic summary (what the service method does, step by step)
- Error cases with error codes
- Which service method handles it

### Section 4 — Service Layer
For every service class:
- Class name, module, file path
- Every public method with signature and responsibility
- Complex business logic described step-by-step (state machine transitions, multi-entity transactions, calculation formulas)
- Dependencies (other services injected)

### Section 5 — Frontend Pages and Components
For every page/component:
- File path and route
- Server component or client component
- Data fetching strategy
- Key UI elements and interactions
- Which API endpoints it calls
- Role visibility (which roles see this page)

### Section 6 — Background Jobs
For every BullMQ job:
- Job name, queue name, processor file path
- Trigger (what enqueues it)
- Payload shape
- Processing logic step-by-step
- Retry/DLQ strategy

### Section 7 — Implementation Order
Ordered list of implementation steps. Each step should be independently completable and testable. Group by:
1. Database migrations and seed data
2. Shared types and Zod schemas
3. Backend services (in dependency order)
4. Backend controllers
5. Background job processors
6. Frontend pages and components

### Section 8 — Files to Create
Complete list of every file that will be created, with full paths.

### Section 9 — Files to Modify
Complete list of every existing file that needs changes, with a summary of what changes.

### Section 10 — Key Context for Executor
Anything the execution agent needs to know that isn't obvious from the phase spec:
- Patterns established in prior phases that this phase must follow (with file path examples from the codebase)
- Gotchas, edge cases, or non-obvious requirements
- Cross-module wiring details

## 3. Validation Checklist

Before saving the plan, verify:
- [ ] Every table in the phase instruction file has a corresponding entry in Section 2
- [ ] Every functional requirement has at least one endpoint in Section 3
- [ ] Every endpoint has a service method in Section 4
- [ ] Every service method is reachable from a controller or job processor
- [ ] No tables, endpoints, or features are planned that aren't in the phase spec
- [ ] Implementation order in Section 7 has no forward dependencies (nothing references something built in a later step)

## Done

Flag "Done" when you've completed all steps above.
