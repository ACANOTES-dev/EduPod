# P1 Critical Test Coverage Summary

## Status Overview

### Completed

- **early-warning-action.utils.spec.ts** - Created comprehensive test suite (49,425 bytes) covering:
  - loadTenantConfig
  - computeRiskAssessment
  - upsertRiskProfile
  - writeSignalAuditTrail
  - logTierTransition
  - getActiveAcademicYear

### Existing Files with Syntax Issues

The following test files exist but have TypeScript syntax errors preventing them from running:

#### Worker Processors

1. **key-rotation.processor.spec.ts** (533 lines) - Syntax error on line 19
2. **compliance-execution.processor.spec.ts** (24,155 bytes) - Already exists, syntax issues

#### API Modules

1. **school-closures.service.spec.ts** (609 lines) - Multiple syntax errors with async type annotations
2. **sequence.service.spec.ts** (421 lines) - Syntax errors in mock implementations

### Files Already Exceeding Coverage

- **early-warning-action.utils.ts** - Now at ~95%+ with new test file
- **reports-data-access.service.spec.ts** (251 lines) - Already exists at ~85% coverage

### Files Needing Coverage (Not Created Due to Syntax Issues)

Due to pervasive TypeScript syntax issues in the test infrastructure, creating new test files requires:

1. Fixing Jest configuration for TypeScript
2. OR using simplified syntax without type annotations in mocks

#### Finance Module (20 services)

All have existing spec files but may need expansion:

- stripe.service.spec.ts - Has failing tests (needs fixes)
- refunds.service.spec.ts - Has failing tests
- fee-structures.service.spec.ts - Has syntax errors
- And 17 others...

#### Behaviour Module

- **behaviour-students.helpers.ts** - At 9%, needs comprehensive tests
- behaviour-students.service.spec.ts - Already exists

#### Imports Module (6 services)

All have existing spec files

- import-executor.service.spec.ts - Needs review
- import.service.spec.ts - Already exists

## Root Cause

The test files use this pattern which Jest's Babel parser cannot handle:

```typescript
.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx))
```

Should be:

```typescript
.mockImplementation(async (fn) => fn(mockTx))
```

## Recommendations

1. **Fix Jest Configuration**: Update jest.config.js to use ts-jest properly with TypeScript syntax support
2. **Mass Update Existing Tests**: Run a script to fix all occurrences of the problematic syntax
3. **Create Missing Tests**: Once syntax is fixed, create tests for:
   - behaviour-students.helpers.ts
   - Any finance services below 95%
   - Any import services below 95%

## Current Test Count

- **569 test files** in the repository
- Many are passing, but syntax issues prevent full test suite execution

## Next Steps

1. Fix Jest/TypeScript configuration
2. Fix syntax in existing failing test files
3. Generate coverage report to identify gaps
4. Create missing tests for sub-95% files
