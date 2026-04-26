# Regulatory Module Redesign

**Status:** shipped · Phases 1–12 complete · BUGS-INVENTORY signed off 2026-04-24
**Branch:** `main` (each phase shipped directly via CI)
**Owner:** Ram

This folder is the canonical plan for rebuilding the Regulatory module from the ground up so it matches the Morphing Shell pattern established by Wellbeing, Finance, and Safeguarding.

---

## Why this redesign

Regulatory is the last school-facing hub still running on the legacy pattern. A full Playwright walk of NHQS production on 2026-04-23 found 6 pages crashing with the Next.js error boundary, 100+ missing translation keys surfacing as raw `REGULATORY.PPOD.COLUMNSTUDENTNAME` strings in the UI, and a shell that violates §14.13 of `docs/plans/ux-redesign-final-spec.md` (the spec explicitly names regulatory as the only offender still using a sub-strip).

The user-facing goal: make one of the most regulation-heavy, potentially dry parts of the product feel **polished, approachable, and delightful**. Regulatory compliance should not look like a tax form.

Full breakdown of live bugs: [BUGS-INVENTORY.md](BUGS-INVENTORY.md).
Pattern reference extracted from Wellbeing + Finance + Safeguarding: [PATTERNS.md](PATTERNS.md).
Design system rules this module must honour: [00-DESIGN-SYSTEM.md](00-DESIGN-SYSTEM.md).

---

## Phase index

Phases are sequential. Each phase is its own feature branch, its own PR, its own CI run, its own prod-verification pass before the next phase starts.

| #   | Phase                                                                          | Scope                                                                  | Target output                                                |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | [Foundation](01-foundation.md)                                                 | Tokens, nav wiring, remove sub-strip, teal identity in spec            | Module ready to receive new pages                            |
| 2   | [Super Dashboard `/regulatory`](02-super-dashboard.md)                         | Rewrite hub page end-to-end                                            | Beautiful landing that makes sense of every sub-module       |
| 3   | [Tusla Hub](03-tusla-hub.md)                                                   | `/regulatory/tusla` + SAR / AAR / reduced-days / mappings              | Tusla is a full mini-product                                 |
| 4   | [P-POD / POD Hub](04-ppod-hub.md)                                              | `/regulatory/ppod` + students + sync-log + import + export             | PPOD sub-hub with its own dashboard                          |
| 5   | [DES Returns Hub](05-des-returns-hub.md)                                       | `/regulatory/des-returns` + subject-mappings + generate                | DES submission workflow feels guided                         |
| 6   | [October Returns Hub](06-october-returns-hub.md)                               | `/regulatory/october-returns` + readiness + issues                     | Annual October census workflow                               |
| 7   | [Calendar + Submissions Hubs](07-calendar-submissions-hubs.md)                 | `/regulatory/calendar`, `/regulatory/submissions`                      | Deadline scheduler + audit log, both as sub-hubs             |
| 8   | [Anti-Bullying + CBA + Transfers Hubs](08-anti-bullying-cba-transfers-hubs.md) | `/regulatory/anti-bullying`, CBA split-out, transfers split-out        | Three real sub-hubs, not redirect stubs                      |
| 9   | [Safeguarding Regulatory Hub](09-safeguarding-hub.md)                          | `/regulatory/safeguarding` as a compliance-oriented dashboard          | Real oversight surface (distinct from the standalone module) |
| 10  | [GDPR / Privacy Hub](10-gdpr-hub.md)                                           | `/regulatory/gdpr` consolidating DSAR + DPA + data-retention + privacy | One unified privacy-and-rights sub-hub                       |
| 11  | [Arabic i18n coverage](11-i18n-arabic.md)                                      | Full AR translation pass, RTL QA                                       | Parity with EN across every new/changed string               |
| 12  | [QA + polish](12-qa-polish.md)                                                 | Regression sweep, mobile, a11y, copy review                            | Ready to be part of the demo story                           |

Phases 3–10 each ship their own sub-dashboard (this is the "super-dashboard everywhere" rule). Every sub-dashboard has hub tiles leading to deeper pages, just like `/wellbeing` does today.

---

## Decisions locked 2026-04-23

- **Module accent:** Teal. Gradient `from-teal-400 via-teal-500 to-teal-600`, icon bg `bg-teal-100 text-teal-700`. Added to `docs/plans/ux-redesign-final-spec.md` §14.4 in Phase 1.
- **Super-dashboard everywhere:** Hub → sub-hub → list/detail. Every intermediate level is its own dashboard with KPI strip + hub tiles. No dead-end redirect stubs.
- **Back button:** every page reachable from another renders an explicit back link (via `PageHeader`'s `back` prop). Browser back is a fallback, never a plan.
- **Stubs get promoted:** Safeguarding and Anti-Bullying are no longer redirect cards — they become real regulatory-oversight sub-hubs. They _link out_ to the owning modules (Behaviour, Safeguarding) for deep actions, but they own their own regulatory narrative.
- **GDPR stays under `/regulatory`:** consolidated into a single `/regulatory/gdpr` sub-hub covering DSAR, DPA, data retention, privacy notices. These are four separate pages today; they become one sub-hub + four sub-pages.
- **No demo deadline pressure:** quality first. Demo ships when it's polished.
- **Deploy route:** GitHub Actions CI/CD (no rsync). One phase, one PR, one deploy, one prod verification.

---

## CI/CD timing (measured from last 8 `main` runs, 2026-04-23)

| Run type                                 | Duration     | Example                                                                 |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------- |
| Small targeted fix (1-file, warm cache)  | **~7m 15s**  | `fix(sen): expose role + start_date aliases` (2026-04-23 04:55 → 05:03) |
| Cross-package fix (med. cache hit)       | **~9m 45s**  | `fix(sen): translate role badge`                                        |
| Medium feature (partial cache miss)      | **~11m 20s** | `feat(leave): Category C UI`                                            |
| Large feature with broad deps (cold-ish) | **~19m 40s** | `fix(leave): unwrap /v1/leave/balance envelope` — last run on main      |

Expect **7–12 minutes** for most regulatory PRs (each phase lands as a scoped UI change = warm cache territory). First PR on a new branch will likely be the slowest; subsequent pushes reuse Turbo cache and land in the 6–8 minute range.

---

## Working rhythm

For each phase:

1. Branch off `main`: `git checkout -b regulatory-redesign/phase-N-slug`.
2. Implement against the phase doc's **Concrete changes** list.
3. Run `turbo lint`, `turbo type-check`, relevant `turbo test` packages locally.
4. Commit (conventional commits, `feat(regulatory):` / `fix(regulatory):` scope).
5. Open PR. Watch CI via `gh run watch`.
6. On green: merge, watch deploy, verify on NHQS prod with Playwright.
7. Check off the phase's **Success criteria** in its doc before moving on.

If a phase doc's scope grows mid-flight, split it — don't let phases bloat.

---

## Supporting docs in this folder

- [00-DESIGN-SYSTEM.md](00-DESIGN-SYSTEM.md) — the rules every phase must obey
- [BUGS-INVENTORY.md](BUGS-INVENTORY.md) — every live bug captured during the 2026-04-23 Playwright walk
- [PATTERNS.md](PATTERNS.md) — wellbeing + finance blueprint for copy-paste reference
- `01-foundation.md` through `12-qa-polish.md` — the phase playbooks
