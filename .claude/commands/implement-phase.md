---
description: Execute a pre-planned phase implementation. Usage: /implement-phase P0
---

# Implement Phase: $ARGUMENTS

You are implementing phase **$ARGUMENTS** of the School Operating System from a pre-built plan. Do NOT enter plan mode — the planning has already been done in a separate session.

## 1. Load Required Files

Read these files in this order before writing any code:

**Always load (in this order):**
1. `plans/phases-plan/$ARGUMENTS-plan.md` — YOUR IMPLEMENTATION PLAN. This is the primary instruction file.
2. `plans/context.md` — architecture, RLS, auth, RBAC, conventions
3. `plans/phases-instruction/$ARGUMENTS.md` — the phase spec (reference for validation, not your primary instruction)

**Load if applicable:**
- `plans/ui-design-brief.md` — if the phase includes any frontend work
- Phase instruction file header may list adjacent phase references — load those too

**Load selectively from prior phases:**
- Scan `plans/phases-results/` — read result files from completed phases to understand what exists
- For the specific services/modules listed in the plan's Section 1 as dependencies, read the actual source files to understand established patterns
- Do NOT load the full `plans/masterplan.md` — the plan file already extracts what's needed

## 2. Implement

Follow the implementation order in **Section 7** of the plan file. For each step:
- Create the files listed in Section 8
- Modify the files listed in Section 9
- Follow the exact schemas, signatures, and logic described in Sections 2–6
- Follow all rules in CLAUDE.md and `.claude/rules/`

**Rules:**
- Do NOT re-plan. The plan is approved. Execute it.
- Do NOT build anything outside the phase scope.
- If something in the plan contradicts the phase spec, the phase spec wins — flag the discrepancy but follow the spec.
- If something seems missing from both the plan and the spec, flag it — do not invent.

## 3. Generate Results File

When implementation is complete, create `plans/phases-results/$ARGUMENTS-results.md` with:
- **Summary**: One paragraph on what this phase delivered
- **Database migrations**: Every table created/modified with column counts
- **API endpoints**: Every route — method, path, auth, permission
- **Services**: Every service class and its responsibilities
- **Frontend**: Every page/component/view with route paths
- **Background jobs**: Every BullMQ job type with queue name and trigger
- **Configuration**: Environment variables, feature flags, seed data added
- **Files created**: Full path list of all new files
- **Files modified**: What changed in existing files
- **Known limitations**: Anything deferred or incomplete, with reasoning
- **Deviations from plan**: Anything that differed from the plan file, with reasoning

## 4. Generate Testing Instruction File

Also create `plans/phases-testing-instruction/$ARGUMENTS-testing.md` with:

**Section 1 — Unit Tests**: Every service method, calculation, state machine needing tests. Include exact test descriptions, edge cases, expected inputs/outputs.

**Section 2 — Integration Tests**: Every API endpoint — happy path AND failure paths (auth, validation, permission, RLS). Include request payloads and expected responses.

**Section 3 — RLS Leakage Tests**: For every tenant-scoped table and endpoint — test as Tenant A, verify Tenant B data invisible.

**Section 4 — Manual QA Checklist**: Step-by-step human instructions. Cover both locales. Cover role-based access.

## Done

Flag "Done" when you've completed all steps above.
