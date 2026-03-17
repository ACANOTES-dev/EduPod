---
description: Enforces test coverage requirements and RLS leakage test patterns
globs: ["**/*.spec.ts", "**/*.test.ts", "apps/api/test/**", "apps/web/e2e/**"]
---

# Testing Rules

## Mandatory Coverage
- Every API endpoint: at least one happy-path test AND one permission-denied test
- Every tenant-scoped table: at least one RLS leakage test
- Every calculation (payroll, grades, payments): unit tests with exact expected outputs
- Every state machine: test all valid transitions AND verify blocked transitions throw

## RLS Leakage Test Pattern
Every RLS test must follow this structure:
1. Create data as Tenant A
2. Authenticate as Tenant B
3. Attempt to read/query the data
4. Assert: data is NOT returned (empty result or 404 — never Tenant A's data)

Do this for EVERY tenant-scoped table and EVERY tenant-scoped API endpoint in the phase.

## Test File Location
- Co-located with source: `payroll.service.spec.ts` next to `payroll.service.ts`
- API integration tests: `apps/api/test/`
- E2E tests: `apps/web/e2e/`

## Test Naming
- Describe blocks: name of the service/controller
- Test names: plain English describing the behaviour — e.g., "should return 403 when user lacks payroll.view permission"
- Edge case tests: prefix with "edge:" — e.g., "edge: should block division by zero when total_working_days = 0"
