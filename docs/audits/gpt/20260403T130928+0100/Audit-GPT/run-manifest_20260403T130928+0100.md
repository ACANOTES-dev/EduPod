# Run Manifest

- Timestamp: `20260403T130928+0100`
- Root path audited: `/Users/ram/Desktop/SDB`
- Orchestrator model: `gpt-5.4`
- Orchestrator reasoning effort: `xhigh`
- Intended subagent count: `7`
- Intended subagent model: `gpt-5.4`
- Intended subagent reasoning effort: `xhigh`
- Canonical fact pack: [`fact-pack_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md)
- Canonical raw command log: [`commands-run_20260403T130928+0100.txt`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/commands-run_20260403T130928+0100.txt)

## Required Output Files

- `fact-pack_20260403T130928+0100.md`
- `run-manifest_20260403T130928+0100.md`
- `commands-run_20260403T130928+0100.txt`
- `subagent-01-architecture_20260403T130928+0100.md`
- `subagent-02-backend-tests_20260403T130928+0100.md`
- `subagent-03-frontend-worker-tests_20260403T130928+0100.md`
- `subagent-04-security-rls_20260403T130928+0100.md`
- `subagent-05-code-quality_20260403T130928+0100.md`
- `subagent-06-reliability_20260403T130928+0100.md`
- `subagent-07-ops-dx_20260403T130928+0100.md`
- `module-health-matrix_20260403T130928+0100.md`
- `master-audit-report_20260403T130928+0100.md`
- `executive-summary_20260403T130928+0100.md`
- `health-recovery-plan_20260403T130928+0100.md`
- `challenge-pass_20260403T130928+0100.md`
- `risk-ledger_20260403T130928+0100.md`
- `reproducibility-appendix_20260403T130928+0100.md`

## Existence Check At Start Of Run

- Required timestamped output files already existed before this run: `no`
- Audit run directory already existed before this run: `no`

## Early Environmental Notes

- The repo prompt referenced `architecture/...`, but the files in this checkout live under `docs/architecture/...`.
- `.github/workflows/deploy.yml` is absent; deploy logic is embedded inside `.github/workflows/ci.yml`.
- Lint/build logs resolve to the repo’s iCloud canonical path in some warnings even though the working path is `/Users/ram/Desktop/SDB`.
- Two prompt-specified shell heuristics required correction before use as evidence:
  - Prisma model names vs RLS table names need `@@map(...)` parsing.
  - `: any|as any` grep matches ordinary English text in comments/identifiers.
