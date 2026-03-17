---
description: Run all tests for a phase and fix any bugs found. Usage: /test-phase P0
---

# Test Phase: $ARGUMENTS

You are testing phase **$ARGUMENTS** of the School Operating System.

Follow this exact sequence:

## 1. Load Required Files

Read these files before writing any tests:
- `plans/context.md` (always)
- `plans/phases-instruction/$ARGUMENTS.md` (what was supposed to be built)
- `plans/phases-plan/$ARGUMENTS-plan.md` (the implementation plan — has service method details and edge cases)
- `plans/phases-results/$ARGUMENTS-results.md` (what was actually built)
- `plans/phases-testing-instruction/$ARGUMENTS-testing.md` (the test plan to execute)

## 2. Execute Every Test

Work through the testing instruction file section by section:

**Unit Tests** → Write each test, run it, record pass/fail.
**Integration Tests** → Write each test, run it, record pass/fail.
**RLS Leakage Tests** → Write each test, run it, record pass/fail.

For each test:
1. Implement the test exactly as specified
2. Run it
3. If it **passes**: record as `PASS` and move on
4. If it **fails**: diagnose the bug, fix the application code, re-run the test, re-run any related tests to check for regressions, record as `FIXED`
5. To fix **fails**: you may run any bash required or install MCP and CLI packages as required and you do not need to ask for permission to do so. For this, you have full autonomy.

## 3. Fix Everything

Do NOT leave failing tests. For every failure:
1. Identify root cause
2. Fix the application code (not the test — unless the test itself is wrong)
3. Re-run the fixed test — confirm `PASS`
4. Re-run adjacent tests — confirm no regressions
5. Document: what broke, why, what you changed, which files

## 4. Generate / Update Testing Result File

Create `plans/phases-testing-result/$ARGUMENTS-testing-result.md` with:

- **Test run summary**: Total tests | Passed | Fixed | Failed | Unresolved
- **Unit test results**: Each test with `PASS` / `FIXED` / `FAIL`
- **Integration test results**: Each test with `PASS` / `FIXED` / `FAIL`
- **RLS leakage test results**: Each test with `PASS` / `FIXED` / `FAIL`
- **Bugs found and fixed**: What the test exposed → root cause → fix applied → files changed
- **Bugs found and unresolved**: Why it can't be fixed now, what's needed
- **Regressions**: Tests from prior phases that broke (should be zero — flag loudly if not)
- **Manual QA notes**: Observations on the QA checklist; verify programmatically where possible

## 5. Keep Results Current

This file is a living document. Every bug fix means:
- Update test status from `FAIL` → `FIXED`
- Move bug from "unresolved" to "found and fixed"
- Update summary counts
- The final file must reflect the TRUE current state of all tests

## Done

Confirm completion with: total tests run, pass count, fixed count, any remaining failures.
