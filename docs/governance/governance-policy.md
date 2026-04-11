# Health Governance Policy

> Last updated: 2026-04-01
> Applies to: architecture shortcuts, testing shortcuts, operational shortcuts, and risk-retirement decisions

## 1. No new debt without written tradeoff

Do not accept new architecture, testing, or operational debt on memory alone.

A written tradeoff is required when a change does any of the following:

- ships with reduced test coverage or a missing planned test
- defers an architecture update, boundary cleanup, or state-machine hardening step
- accepts an ops shortcut such as manual-only recovery, missing alerting, or incomplete rollback coverage
- introduces a temporary exception to a standing repo rule

The written tradeoff must record:

- what was deferred or weakened
- why it could not be completed now
- what compensating control exists in the meantime
- owner
- expiry date
- exact follow-up backlog item

Tradeoff records live in this file until volume justifies a dedicated register. Append each active tradeoff under a dated sub-heading so the pre-flight checklist can point to one canonical location.

Until a tradeoff is written, the shortcut is not approved.

## 2. Risk retirement requires regression proof

No risk may move to `retired` in the health backlog until the closing change records proof that the failure mode is now defended.

Accepted proof can include:

- automated test coverage added or strengthened
- lint or CI gate added
- smoke or drill evidence
- architecture or runbook update that closes an operational blind spot
- explicit verification logs captured in the closing report

Statements such as "fixed locally" or "looks good now" do not retire a risk.

## 3. Critical workflow completeness rule

A new or materially changed critical workflow is incomplete until all five surfaces exist:

1. code
2. automated regression protection
3. operational handling or runbook coverage
4. user-facing or architecture documentation
5. rollback or containment path

Treat a workflow as critical if it touches one or more of these areas:

- authentication or tenant resolution
- safeguarding, behaviour, or child-protection actions
- billing, payments, payroll, or refunds
- admissions, registration, or data import
- regulatory submission or compliance execution
- multi-step background job chains
- document generation that schools rely on operationally

## 4. Expected evidence in closing notes

When a health-risk change closes, the closing note should identify:

- backlog item or risk ID
- tests or checks run
- docs updated
- rollback or containment path confirmed
- any remaining suggestion-level follow-up

## Active tradeoffs

### 2026-04-11 - Temporary Next.js GHSA-q4gf-8mx6-v5v3 audit exception

- what was deferred or weakened
  - The `audit:security` gate now ignores `GHSA-q4gf-8mx6-v5v3` for the current `next@14.2.x` line instead of forcing an immediate upgrade to the patched `15.5.15+` major.
- why it could not be completed now
  - The repo is carrying 100+ local commits that need to be pushed and verified tonight. A same-session Next major upgrade would materially increase regression risk across the App Router frontend, visual smoke coverage, and deployment path.
- what compensating control exists in the meantime
  - The app already uses the existing explicit Next.js audit exception process, this new exception is documented in version control, the rest of the fast security gate remains enforced, and the transitive `basic-ftp` high-severity finding is being patched rather than ignored.
- owner
  - Ram
- expiry date
  - 2026-05-31
- exact follow-up backlog item
  - `AUD-029` in `docs/governance/recovery-backlog.md`
