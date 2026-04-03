# Phase G: Security Verification & Hardening — Results

## Summary

Phase G delivers the cross-cutting security and privacy verification suite for the Staff Wellbeing module. 7 new test files with 111 tests covering cross-tenant isolation, impersonation blocking, anonymous submission integrity, threshold enforcement, batch release, audit log verification, and permission model verification. 6 controller files hardened with class-level `@BlockImpersonation()` guards. Architecture documentation updated (survey lifecycle added to state-machines.md). Manual security audit completed (8/9 items pass).

## Test Files Created: 7

| File                                      | Tests | Deliverable                                               |
| ----------------------------------------- | ----- | --------------------------------------------------------- |
| `tests/g1-cross-tenant-isolation.spec.ts` | 9     | G1 — verifies no API path leaks data across tenants       |
| `tests/g2-impersonation-block.spec.ts`    | 51    | G2 — verifies all 26 endpoints block impersonation        |
| `tests/g3-anonymous-integrity.spec.ts`    | 9     | G3 — verifies survey_responses has no linkable fields     |
| `tests/g4-threshold-enforcement.spec.ts`  | 6     | G4 — threshold enforcement end-to-end                     |
| `tests/g5-batch-release.spec.ts`          | 4     | G5 — batch release enforcement end-to-end                 |
| `tests/g6-audit-log.spec.ts`              | 13    | G6 — audit log verification for privacy-sensitive actions |
| `tests/g7-permission-model.spec.ts`       | 19    | G7 — permission model verification per endpoint           |

**Total new tests: 111**

## Controller Files Modified: 6

All 6 staff-wellbeing controllers now have class-level `@BlockImpersonation()` + `BlockImpersonationGuard`:

| Controller                         | Change                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `survey.controller.ts`             | Added class-level guard, removed redundant method-level on submitResponse |
| `survey-results.controller.ts`     | Added class-level guard (was missing entirely)                            |
| `personal-workload.controller.ts`  | Added class-level guard, removed redundant method-level on all 3 methods  |
| `aggregate-workload.controller.ts` | Added class-level guard (was missing entirely)                            |
| `board-report.controller.ts`       | Added class-level guard (was missing entirely)                            |
| `resource.controller.ts`           | Added class-level guard (was missing entirely)                            |

## Existing Test Files Modified: 2

| File                                   | Change                                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| `personal-workload.controller.spec.ts` | Updated 3 method-level @BlockImpersonation assertions to class-level |
| `survey.controller.spec.ts`            | Updated method-level @BlockImpersonation assertion to class-level    |

## Architecture Files Modified: 1

| File                             | Change                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `architecture/state-machines.md` | Added SurveyStatus lifecycle (draft→active→closed→archived) and ModerationStatus lifecycle (pending→approved/flagged/redacted) |

## Architecture Documentation Verification (G8)

| File                                  | Status                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `architecture/module-blast-radius.md` | COMPLETE — StaffWellbeingModule listed with all deps                                                             |
| `architecture/event-job-catalog.md`   | COMPLETE — all 6 jobs documented (7th `release-survey-results` doesn't exist — results released inline on close) |
| `architecture/state-machines.md`      | COMPLETE — survey + moderation lifecycles added                                                                  |
| `architecture/danger-zones.md`        | COMPLETE — DZ-27 documented as CRITICAL with all required fields                                                 |

## Manual Security Audit Results (9 items)

| #   | Check                                                | Result                                                                   |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | No API endpoint returns raw survey_response rows     | PASS                                                                     |
| 2   | No log statement logs user_id alongside survey_id    | PASS                                                                     |
| 3   | HMAC secret never appears in logs/responses/errors   | PASS                                                                     |
| 4   | No console.log leaks participation tokens            | PASS                                                                     |
| 5   | Error responses don't leak user identity             | PASS                                                                     |
| 6   | No timing side-channel on double-vote check          | MINOR — duplicate path exits early before DB writes (low practical risk) |
| 7   | Redacted text is truly overwritten                   | PASS                                                                     |
| 8   | Frontend doesn't store responses in browser state    | PASS                                                                     |
| 9   | Active survey indicator doesn't leak response status | PASS                                                                     |

## Known Gaps (documented, not blockers for V1)

### 6 Missing Audit Log Calls for Privacy-Sensitive READ Actions

The following actions should generate explicit audit log entries but currently do not:

1. **SurveyResultsService.getResults()** — principal viewing aggregated staff sentiment
2. **SurveyResultsService.getModeratedComments()** — principal viewing individual freeform responses
3. **BoardReportService.generateTermlySummary()** — board report generation (service doesn't inject AuditLogService)
4. **Threshold enforcement triggered** — when cross-filter blocking fires
5. **Aggregate dashboard views** — 6 aggregate endpoints have no read audit
6. **BlockImpersonationGuard** — blocked attempts not audit-logged

These are documented in `g6-audit-log.spec.ts` with expected audit call signatures for implementation.

### Minor Timing Side-Channel

Double-vote detection has a measurable timing difference (duplicate path exits before DB writes). Low practical risk — requires network position to measure response times for specific users.

## Regression Testing

- `turbo type-check --filter=@school/api` — CLEAN (0 errors)
- `turbo lint --filter=@school/api` — CLEAN (0 errors, 18 pre-existing warnings in unrelated modules)
- Staff wellbeing tests: **20 suites, 339 tests, ALL PASSING**
- Full API suite: **390 suites passing, 8 pre-existing failures in unrelated modules (tenants, RBAC, communications, behaviour-admin, imports, safeguarding, child-protection-rls)**
- Zero regressions from Phase G
