---
name: Student Wellbeing Implementation
description: 13 sub-phase implementation plan (SW-1A through SW-5A), orchestrator pattern with 4-10 Opus sub-agents per phase, /SW command, progress tracked at Next_Feature/student-wellbeing/implementation-progress.md
type: project
---

Student Wellbeing module implementation uses `/SW` command (`.claude/commands/SW.md`).

**Master spec**: `Next_Feature/student-wellbeing/master-spec.md` (v4)
**Sub-phase specs**: `Next_Feature/student-wellbeing/phase-sw-*.md` (13 files)
**Progress log**: `Next_Feature/student-wellbeing/implementation-progress.md`
**Results**: `Plans/phases-results/SW-{id}-results.md`
**Plans**: `Plans/phases-plan/SW-{id}-plan.md`
**Tests**: `Plans/phases-testing-instruction/SW-{id}-testing.md`

**Why:** 3-month timeline for full delivery. Most architecturally demanding module (defence-in-depth CP access, immutable audit, dual RLS, trigger-enforced immutability).

**How to apply:**
- Use `/SW 1A` to execute a sub-phase
- Each execution dispatches 4-10 Opus 4.6 sub-agents (Sonnet REJECTED)
- Orchestrator pattern: main agent coordinates, sub-agents implement
- SSH access granted to all agents (must follow server rules)
- 100% deliverable requirement — every spec item must be implemented
- Progress log must be checked before starting any sub-phase (dependency validation)
- Concurrent sessions handle git conflicts via pull --rebase + retry
