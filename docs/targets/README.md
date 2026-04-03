# 95% Coverage Program

> **Objective:** Reach `95%+` for every percentage metric currently shown in the API and Worker coverage reports by the end of `P3`.
> **Date:** 2026-04-02
> **Status:** Proposed execution plan

---

## 1. Scope

This program treats **"95% everywhere"** as:

- API global `statements`, `branches`, `functions`, and `lines` are all `>=95%`
- Worker global `statements`, `branches`, `functions`, and `lines` are all `>=95%`
- Every API module row in the per-module coverage report is `>=95%` for `lines`
- Every API module row in the per-module coverage report is `>=95%` for `branches`
- Every Worker processor-group row in the per-group coverage report is `>=95%` for `lines`
- Every Worker processor-group row in the per-group coverage report is `>=95%` for `branches`

This plan is intentionally stricter than "good global coverage." It aims for **uniform depth**, not just a strong average.

---

## 2. Baseline

### Package globals

| Package | Stmts | Branch | Funcs | Lines |
| ------- | ----: | -----: | ----: | ----: |
| API     | 81.8% |  63.3% | 83.1% | 82.5% |
| Worker  | 79.5% |  57.1% | 82.9% | 80.3% |

### Gap to 95%

| Package | Stmts gap | Branch gap | Funcs gap | Lines gap |
| ------- | --------: | ---------: | --------: | --------: |
| API     |     5,206 |      6,814 |       827 |     4,578 |
| Worker  |     1,167 |      1,122 |        99 |     1,014 |

### Structural reality

- The hardest metric is `branch coverage`, not `line coverage`
- Many modules already have strong line coverage but still carry major branch debt
- The largest remaining lift sits in orchestration-heavy areas: `behaviour`, `gradebook`, `pastoral`, `payroll`, `reports`, `scheduling`, `finance`, `imports`, `attendance`, and several worker groups
- This is not just a "missing spec files" problem; much of the remaining work is deep negative-path and edge-path testing

---

## 3. Phase Map

| Phase | Goal                                                    | Headline outcome                                                               |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `P1`  | Build the coverage operating system and raise the floor | No weak zones remain; every measured area reaches at least a credible baseline |
| `P2`  | Attack the largest module and processor-group gaps      | Most of the repo converges into the high-coverage band                         |
| `P3`  | Close the last branch-heavy gaps and lock the gates     | `95%+` everywhere, enforced by CI                                              |

### Suggested duration

- `P1`: `2-4` weeks
- `P2`: `4-6` weeks
- `P3`: `4-6` weeks

These are indicative solo-founder estimates, assuming the work is interleaved with normal product maintenance.

---

## 4. Program Rules

- No coverage gained through `istanbul ignore` directives unless the branch is truly unreachable and documented
- Prefer characterization tests before refactors in high-risk modules
- Every coverage improvement must preserve tenant isolation, RLS discipline, and current behaviour
- External integrations must be tested with local substitutes or mocks, never live services
- Coverage must be ratcheted upward phase by phase; it must not rely on memory or manual discipline
- By `P3`, CI must fail on any regression that would break the `95%` target

---

## 5. Execution Order

- Start with missing harnesses and untested infrastructure because they unlock many modules cheaply
- Next, clear the weakest modules and groups so the floor rises quickly
- Then focus on the largest uncovered-branch clusters
- Leave branch-polish work in already-high-line modules for `P3`, because that work is slower and more specialized

---

## 6. Phase Documents

- [P1-foundation-and-floor.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/95_target/P1-foundation-and-floor.md)
- [P2-depth-and-convergence.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/95_target/P2-depth-and-convergence.md)
- [P3-final-lock-to-95.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/95_target/P3-final-lock-to-95.md)
