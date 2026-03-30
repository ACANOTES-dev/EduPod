# Phase G — Remaining Tasks

**Status**: In Progress (High Priority Items Complete)
**Last Updated**: 2026-03-30

## Completed ✅

1. **Edge Case: Academic Year Validation** ✅
   - Prevents creating homework for archived years
   - Implemented in `homework.service.ts`

2. **Edge Case: Class Enrolment Check** ✅
   - Validates class has students before creating homework
   - Throws descriptive error if no enrolled students

3. **Edge Case: Recurring Homework Unique Constraint** ✅
   - Added database-level unique constraint on `(tenant_id, recurrence_rule_id, due_date)`
   - Prevents race condition duplicates

4. **Edge Case: Student Withdrawal** ✅
   - List completions filters for active enrolments only
   - Bulk mark validates student is actively enrolled

5. **Edge Case: Concurrent Updates** ✅
   - Added `version` field to HomeworkCompletion for optimistic locking
   - Schema updated in `packages/prisma/schema.prisma`

6. **RLS Integration Tests** ✅
   - Comprehensive tests for all 6 tables
   - Verifies tenant isolation
   - File: `apps/api/src/modules/homework/homework.rls.spec.ts`

7. **Architecture Documentation** ✅
   - Updated `feature-map.md` with Homework module
   - Updated `module-blast-radius.md` with dependencies
   - Added danger zones DZ-33 to DZ-36
   - Updated `PRE-LAUNCH-CHECKLIST.md` with Phase G items

## Remaining Tasks ⏳

### Performance Testing (Medium Priority)

**Task**: Load test homework analytics queries

- **Target**: 200 students × 50 homework assignments
- **Expected Response Time**: < 500ms for completion rate aggregation
- **File**: Create performance test script
- **Status**: Not started

### UI Polish (Low Priority - Can Defer)

#### Dark Mode Audit

- Check all homework pages render correctly in dark mode
- Verify charts, tables, forms have proper contrast
- Pages to audit:
  - `/homework` (dashboard)
  - `/homework/new` (create form)
  - `/homework/[id]` (detail view)
  - `/homework/[id]/completions` (bulk marking)
  - `/homework/templates` (templates page)
  - `/homework/analytics` (analytics dashboard)
  - `/homework/analytics/load` (load heatmap)
  - `/homework/parent/*` (parent portal pages)

#### RTL Layout Audit

- Verify all homework pages support Arabic RTL
- Check text alignment and icon positioning
- Ensure logical CSS properties are used (start/end, not left/right)

#### Mobile Responsiveness

- Test homework dashboard on tablet view
- Ensure touch targets are adequate (min 44px)
- Check form inputs are usable on mobile

#### Loading States

- Add skeleton loaders for async operations:
  - Homework list loading
  - Analytics charts loading
  - Completion grid loading
  - Parent homework list loading

#### Empty States

- Create empty state components for:
  - No homework assignments
  - No completions (class has no students)
  - No diary notes
  - No analytics data
  - No templates available

#### Error Toast Messages

- Ensure all API failure paths show user-friendly error toasts
- Verify error messages are translatable (i18n)

## Summary

**Phase G Status**: 70% Complete

**Critical Items Done**: ✅

- All edge cases handled
- RLS tests written
- Architecture docs updated
- Schema hardened

**Remaining Work**:

- Performance testing (recommended before launch)
- UI polish (can be deferred, existing components follow patterns)

**Recommendation**: Deploy current Phase G changes. Performance tests can be run post-deployment. UI polish can be done incrementally in maintenance cycles.

**Current Branch**: `agentx/homework-phase-d`
**Commits Ready**:

- `f46359f` - Edge cases and schema updates
- `f0e3ee7` - RLS integration tests
