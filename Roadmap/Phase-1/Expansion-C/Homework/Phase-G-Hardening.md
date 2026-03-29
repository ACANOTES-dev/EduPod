# Phase G — Hardening & Polish

**Wave**: 4
**Deploy Order**: d7
**Depends On**: B, C, D, E, F

## Scope

End-to-end testing, performance tuning, edge-case handling, architecture documentation updates, and production readiness for the homework module. This phase runs after all functional phases are complete and focuses on quality, not new features.

## Deliverables

### Architecture Documentation
- [ ] Update `architecture/feature-map.md` — add Homework/Diary module entries
- [ ] Update `architecture/module-blast-radius.md` — add homework cross-module dependencies
- [ ] Update `architecture/event-job-catalog.md` — add 4 homework job entries
- [ ] Update `architecture/state-machines.md` — add HomeworkStatus lifecycle
- [ ] Update `architecture/danger-zones.md` — add any non-obvious risks discovered during implementation

### Edge Case Handling
- [ ] Handle class with 0 enrolled students (no completions to create)
- [ ] Handle archived academic year — prevent creating homework for past years
- [ ] Handle student withdrawal mid-homework (student status → withdrawn while homework is pending)
- [ ] Handle subject deletion while homework references it (SetNull FK — verify display handles null subject)
- [ ] Handle concurrent bulk completion updates (optimistic locking via `expected_updated_at`)
- [ ] Handle S3 upload failure (rollback assignment creation or leave as draft)
- [ ] Handle recurring rule for date that falls on school closure
- [ ] Validate that parent can only see homework for actively enrolled children (not withdrawn students)

### Performance
- [ ] Add database index review — verify query plans for:
  - Homework list by class + status + date range
  - Completion rate aggregation across students
  - Analytics: completion rates per class/subject over time periods
  - Parent multi-child homework aggregation
- [ ] Load test: simulate 200 students × 50 homework assignments and verify response times
- [ ] Verify digest job performance with large tenant (500+ students, 20+ daily homework items)

### RLS Verification Tests
- [ ] Write integration tests confirming tenant isolation for all 6 tables
- [ ] Verify cross-tenant queries return empty results

### Regression Testing
- [ ] Run full `turbo test` suite
- [ ] Run `turbo type-check` and `turbo lint`
- [ ] Verify no existing tests broken by schema additions (relation additions to User, Student, Class, etc.)

### UI Polish
- [ ] Dark mode audit for all homework/diary pages
- [ ] RTL layout audit for all pages
- [ ] Mobile responsiveness check (even though mobile app is Phase 3, web should be usable on tablets)
- [ ] Loading states for all async operations
- [ ] Empty states for: no homework set, no completions, no diary notes, no analytics data
- [ ] Error toast messages for all failure paths

### Pre-Launch Checklist
- [ ] Add any deferred items to `Manuals/PRE-LAUNCH-CHECKLIST.md` → Part 5

## Out of Scope

- New features (no scope creep — this phase is purely quality)
- Gradebook integration (deferred to future Phase 4 in the master plan)
- Early Warning integration (deferred to future Phase 5 in the master plan)
- Mobile app optimisations (Phase 3 roadmap)

## Dependencies

- **Phase B**: All API endpoints must be implemented and passing tests
- **Phase C**: All worker jobs must be registered and tested
- **Phase D**: All teacher frontend pages must be built
- **Phase E**: All parent frontend pages must be built
- **Phase F**: All diary pages must be built

## Implementation Notes

- **Architecture updates are mandatory** (per AGENTS.md #1 rule). Every code change must be assessed for architecture file impact. This phase explicitly handles all documentation updates.
- **Pre-flight checklist**: read `architecture/pre-flight-checklist.md` before starting this phase.
- **Danger zone candidates**: if any non-obvious coupling is discovered during implementation (e.g., homework completions affecting behaviour analytics, or diary notes conflicting with existing pastoral notes), document it in `danger-zones.md`.
- **Event job catalog**: document all 4 homework jobs with the full side-effect chain format, matching the detail level of existing entries.
- **State machine doc**: add HomeworkStatus with the same format as other state machines (valid transitions, terminal states, side effects, guarded-by reference).
- **Testing strategy**: unit tests cover business logic, spec tests cover permission enforcement, RLS tests cover tenant isolation. No E2E tests in V1 — that's a mobile app concern.
