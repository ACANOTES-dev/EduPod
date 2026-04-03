# Re-Audit Schedule

> Defines when and how to run focused health re-audits after each wave of recovery work.

## Purpose

After completing a wave of health recovery work (Phases A through E per dimension), run a focused re-audit to verify:

- The completed items actually improved the dimension score
- No regression occurred in other dimensions
- Tests and tooling are actually being used in practice, not just installed

Re-audits prevent drift between perceived progress and real health. Without them, recovery items get marked done but the codebase does not measurably improve.

---

## Wave Schedule

Each wave corresponds to a set of completed phases across multiple dimensions. Re-audits run at each milestone.

| Wave   | Trigger                                     | Scope                                              | Expected Duration |
| ------ | ------------------------------------------- | -------------------------------------------------- | ----------------- |
| Wave 1 | Phases A + B complete across all dimensions | Full re-audit: all 11 dimensions                   | 2-3 hours         |
| Wave 2 | Phase C complete                            | Focused: backend-tests, worker-tests, code-quality | 1-2 hours         |
| Wave 3 | Phase D complete                            | Focused: architecture, modularity, refactor-safety | 1-2 hours         |
| Final  | Phase E complete                            | Full independent re-audit: all 11 dimensions       | 3-4 hours         |

### Wave 1 (Phases A + B): Foundation

Phases A and B lay groundwork (coverage thresholds, lint rules, basic tests, CI gates). The Wave 1 re-audit confirms the foundation is solid before building on it.

- Re-audit every dimension
- Verify all CI gates are active and enforced (not just configured)
- Confirm baseline metrics are captured in `architecture/health-scorecard.md`

### Wave 2 (Phase C): Core Quality

Phase C focuses on deeper coverage, contract tests, and state machine specs. Wave 2 re-audits the dimensions most affected.

- backend-tests: coverage numbers, new test counts, mock quality
- worker-tests: queue coverage, tenant isolation, retry/DLQ testing
- code-quality: lint error counts, empty catch blocks, type coverage

### Wave 3 (Phase D): Structural Integrity

Phase D addresses integration tests, contract snapshots, feature flags, and cross-module safety. Wave 3 re-audits structural dimensions.

- architecture: blast radius accuracy, event catalog completeness, danger zone coverage
- modularity: export surface ratios, circular dependency counts, module boundary enforcement
- refactor-safety: `VALID_TRANSITIONS` coverage, contract test counts, snapshot coverage

### Final (Phase E): Independent Verification

Phase E adds mutation testing, regression conventions, and this re-audit process itself. The final re-audit is a full independent pass.

- Run by the same agent types that performed the original audit
- Compare every dimension against the original baseline
- Produce a final scorecard with evidence for each score change
- Document any items that remain unresolved and why

---

## Mini Re-Audit Checklist (Per Dimension)

Run this checklist for each dimension included in the wave.

- [ ] **Automated checks**: Run the dimension's automated tooling (coverage reports, lint rules, CI gates) and record output
- [ ] **Completion verification**: Confirm each recovery plan item was actually completed using `git log` evidence (commit hashes, PRs merged)
- [ ] **Regression check**: Verify no implemented items have regressed (e.g., coverage dropped back, new empty catches appeared, disabled lint rules)
- [ ] **Full test suite**: Run `turbo test` and confirm no regressions across the entire codebase
- [ ] **Comparison**: Compare current state against the original audit findings for this dimension
- [ ] **Scorecard update**: Update `architecture/health-scorecard.md` with new scores, evidence, and date

---

## Evidence Requirements

Every re-audit must produce concrete, measurable evidence. Subjective assessments are not sufficient.

### Universal Metrics (Every Dimension)

| Metric                            | How to Collect                             |
| --------------------------------- | ------------------------------------------ |
| Test suite count (suites / tests) | `turbo test` summary output                |
| Coverage percentage               | `turbo test -- --coverage` per package     |
| Lint error count                  | `turbo lint 2>&1 \| grep -c 'error'`       |
| Lint warning count                | `turbo lint 2>&1 \| grep -c 'warning'`     |
| CI pass rate                      | Last 10 runs via `gh run list --limit 10`  |
| Type-check errors                 | `turbo type-check 2>&1 \| grep -c 'error'` |

### Dimension-Specific Metrics

| Dimension             | Key Metric                                             | How to Collect                                      |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| Security              | RLS policy count vs tenant-scoped table count          | Query `pg_policies` and `information_schema.tables` |
| Reliability           | Error handler coverage (no empty catches)              | Grep for empty `catch` blocks                       |
| Architecture          | Architecture doc freshness                             | `git log --since` on `architecture/` files          |
| Modularity            | Module export surface ratio                            | Count exported vs internal symbols per module       |
| Code Quality          | Zod schema coverage vs API endpoints                   | Count schemas in `packages/shared` vs controllers   |
| Maintainability       | JSDoc coverage on non-obvious methods                  | Grep for `@description` or `/**` in service files   |
| Backend Test Health   | Line coverage per module                               | Jest `--coverage` output                            |
| Worker Test Health    | Processor test coverage                                | Count `.spec.ts` files vs `.processor.ts` files     |
| Developer Experience  | CI pipeline duration                                   | `gh run view` timing                                |
| Operational Readiness | Monitoring/alerting coverage                           | Check configured alerts vs critical paths           |
| Refactor Safety       | `VALID_TRANSITIONS` test coverage, contract test count | Grep for transition maps and their specs            |

---

## Scorecard Template

Track progress across waves in `architecture/health-scorecard.md` using this format:

```markdown
| Dimension             | Baseline | Wave 1 | Wave 2 | Wave 3 | Final |
| --------------------- | -------- | ------ | ------ | ------ | ----- |
| Security              | 8.5      |        |        |        |       |
| Reliability           | 7.0      |        |        |        |       |
| Architecture          | 7.5      |        |        |        |       |
| Modularity            | 6.5      |        |        |        |       |
| Code Quality          | 7.5      |        |        |        |       |
| Maintainability       | 7.0      |        |        |        |       |
| Backend Test Health   | 7.0      |        |        |        |       |
| Worker Test Health    | 4.0      |        |        |        |       |
| Developer Experience  | 8.0      |        |        |        |       |
| Operational Readiness | 6.0      |        |        |        |       |
| Refactor Safety       | 5.5      |        |        |        |       |
| Overall Health        | 6.8      |        |        |        |       |
```

Each cell records the score and a date: `7.5 (2026-04-15)`. Supporting evidence goes in the Evidence Log section of the scorecard.

---

## Who Runs Re-Audits

Re-audits use the same agent types and methodology as the original audit to ensure consistency.

| Dimension Group                                   | Agent  | Rationale                                               |
| ------------------------------------------------- | ------ | ------------------------------------------------------- |
| Security, Architecture, Refactor Safety           | Opus   | Requires deep reasoning about cross-module implications |
| Backend Tests, Worker Tests, Code Quality         | Sonnet | Metric-driven, pattern-matching across many files       |
| Modularity, Maintainability, Developer Experience | Sonnet | Structural analysis, file counting, convention checking |
| Operational Readiness, Reliability                | Opus   | Requires reasoning about failure modes and edge cases   |

### Re-Audit Agent Instructions

1. Load the original audit report for the dimension
2. Load the recovery plan items for the current wave
3. Run the mini re-audit checklist above
4. Produce a structured report with: score change, evidence, regressions found, items still outstanding
5. Update `architecture/health-scorecard.md`

---

## Cross-References

- **Recovery plans**: `Plans/` directory, per-dimension recovery items
- **Health scorecard**: `architecture/health-scorecard.md` -- the living tracking file
- **Pre-flight checklist**: `architecture/pre-flight-checklist.md` -- run before any code change
- **Danger zones**: `architecture/danger-zones.md` -- non-obvious risks to watch during re-audit
- **Refactoring log**: `architecture/refactoring-log.md` -- historical record of refactors and their outcomes
