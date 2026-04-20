# Wellbeing Rebuild — Execution Guide

> Per-implementation difficulty rating, time estimate, recommended Claude model, and thinking-effort level.
>
> Companion to `PLAN.md` and `IMPLEMENTATION_LOG.md`. Use this when deciding which model to launch each `/WBR NN` session against and how much thinking-budget to allocate.

---

## How to read this guide

**Difficulty (1–5).** A rough cognitive-load rating. Calibrated against past rebuilds in this repo:

- **1** — trivial fix, obvious shape, low blast radius
- **2** — small feature or fix, some moving parts, contained scope
- **3** — medium feature, cross-file coordination, moderate blast radius
- **4** — substantial feature, multiple sub-features bundled or rich design work, large blast radius
- **5** — flagship-grade or privacy-critical, multi-week-style design intensity packed into one impl

**Hours estimate.** A range, assuming an experienced Claude session with the impl file in context, the prerequisites already shipped, and the dev loop running. Does not include time spent waiting for prerequisites, deploys, or human review.

**Recommended model.**

- **Sonnet 4.6** — fast, capable for low-to-medium difficulty mechanical work. Use for fixes, small endpoints, simple admin pages.
- **Opus 4.6** — better for medium-complex work that benefits from longer reasoning chains, especially when multiple files coordinate. Cheaper than 4.7.
- **Opus 4.7** — top model. Use for flagship UI design, complex backend services, privacy-critical surfaces, statutory workflows, and anything that demands "WOW" quality.

**Thinking effort.**

- **High** — default extended thinking, sufficient for most mechanical work.
- **XHigh** — heavier thinking budget for cross-file reasoning and design choices.
- **Max** — saturated thinking budget for flagship work where every design decision compounds.
- **Ultrathink** — the highest budget; reserved for privacy-critical, dangerous-data-ops, and the two hardest flagship landings (early-warnings, safeguarding hidden + admin).

**Difficulty → effort mapping (default).** Difficulty 1–2 → High. Difficulty 3 → XHigh. Difficulty 4 → Max. Difficulty 5 → Ultrathink. Override per-row when the work is privacy-critical regardless of cognitive load.

---

## Per-implementation table

| #   | Title                                                 | Wave | Difficulty | Hours   | Model      | Effort     |
| --- | ----------------------------------------------------- | ---- | :--------: | ------- | ---------- | ---------- |
| 01  | Schema foundation + default seeds                     | 1    |   **3**    | 5 – 7   | Opus 4.7   | Max        |
| 02  | Fix broken behaviour endpoints                        | 2    |   **2**    | 3 – 4   | Sonnet 4.6 | High       |
| 03  | Wellbeing dashboard-summary aggregator                | 2    |   **3**    | 4 – 5   | Opus 4.6   | XHigh      |
| 04  | AI flag service + notification routing                | 2    |   **3**    | 5 – 6   | Opus 4.6   | XHigh      |
| 05  | Behaviour AI services                                 | 3    |   **4**    | 6 – 8   | Opus 4.7   | Max        |
| 06  | Document generation lifecycle                         | 3    |   **4**    | 8 – 10  | Opus 4.7   | Max        |
| 07  | Exclusion + amendment + ack services                  | 3    |   **4**    | 7 – 9   | Opus 4.7   | Max        |
| 08  | Pastoral hidden services (DSAR, import, SST AI, etc.) | 3    |   **4**    | 7 – 9   | Opus 4.6   | Max        |
| 09  | Safeguarding, admin repair, policy engine ops         | 3    |   **5**    | 9 – 12  | Opus 4.7   | Ultrathink |
| 10  | Page crash fixes (5 pages)                            | 4    |   **2**    | 3 – 4   | Sonnet 4.6 | High       |
| 11  | Behaviour analytics URL fix + endpoint reconnects     | 4    |   **2**    | 2 – 3   | Sonnet 4.6 | High       |
| 12  | Translation backfill (en + ar)                        | 4    |   **3**    | 5 – 7   | Opus 4.6   | XHigh      |
| 13  | Wellbeing super-hub + sub-strip removal               | 5    |   **4**    | 7 – 10  | Opus 4.7   | Max        |
| 14  | Behaviour sub-hub                                     | 5    |   **4**    | 6 – 8   | Opus 4.7   | Max        |
| 15  | Staff wellbeing folded sub-hub                        | 5    |   **4**    | 7 – 9   | Opus 4.7   | Max        |
| 16  | Early-warnings flagship sub-hub                       | 5    |   **5**    | 10 – 14 | Opus 4.7   | Ultrathink |
| 17  | Safeguarding sub-hub                                  | 5    |   **4**    | 6 – 8   | Opus 4.7   | Max        |
| 18  | Tenant admin → AI flags page                          | 5    |   **2**    | 3 – 4   | Sonnet 4.6 | High       |
| 19  | AI features UI                                        | 6    |   **4**    | 7 – 9   | Opus 4.7   | Max        |
| 20  | Document generation UI                                | 6    |   **4**    | 7 – 9   | Opus 4.7   | Max        |
| 21  | Exclusion + restrictions + amendments + ack UI        | 6    |   **4**    | 8 – 10  | Opus 4.7   | Max        |
| 22  | Pastoral hidden-feature UI                            | 6    |   **4**    | 8 – 10  | Opus 4.7   | Max        |
| 23  | Safeguarding hidden + recognition + policy + admin UI | 6    |   **5**    | 10 – 12 | Opus 4.7   | Ultrathink |
| 24  | Polish, Playwright multi-role sweep, docs             | 7    |   **4**    | 10 – 14 | Opus 4.7   | Max        |

---

## Wave totals

| Wave | Impls             | Hours range | Model mix                   | Notes                                    |
| ---- | ----------------- | ----------- | --------------------------- | ---------------------------------------- |
| 1    | 01                | 5 – 7       | Opus 4.7                    | Foundational; one shot, get it right.    |
| 2    | 02 03 04          | 12 – 15     | 1× Sonnet 4.6 + 2× Opus 4.6 | Backend stop-the-bleeding.               |
| 3    | 05 06 07 08 09    | 37 – 48     | 4× Opus 4.7 + 1× Opus 4.6   | Heavy backend lift.                      |
| 4    | 10 11 12          | 10 – 14     | 2× Sonnet 4.6 + 1× Opus 4.6 | First parallel-risky wave; rules H1–H10. |
| 5    | 13 14 15 16 17 18 | 39 – 53     | 5× Opus 4.7 + 1× Sonnet 4.6 | Flagship UI wave; longest; rules H1–H10. |
| 6    | 19 20 21 22 23    | 40 – 50     | 5× Opus 4.7                 | Hidden-feature surfacing; rules H1–H10.  |
| 7    | 24                | 10 – 14     | Opus 4.7                    | Verification + docs.                     |

**Total estimate: 153 – 201 hours.**

At 8 focused hours per day, that's **19 – 25 working days** for a single executor. Running waves in parallel where the rules permit shaves about 25–35% off, bringing it to **3 – 4 calendar weeks** in line with the user's "days or a couple of weeks" expectation.

---

## Recommended execution rhythm

1. **Wave 1 alone, one session.** Schema is the contract every later impl reads against; do it carefully, do it once, deploy it, take a break.
2. **Wave 2 fan-out.** Three sessions in parallel. None block each other. Different models per session is fine.
3. **Wave 3 fan-out.** Five sessions in parallel; this is the biggest backend wave. Stagger by ~15 minutes if you can — the parallel API restart serialisation in Step 6a means a stagger reduces wall-clock wait.
4. **Wave 4 cautious parallel.** Three frontend sessions touching `messages/en.json` + `ar.json`. Apply rules H1–H10. Consider serialising 12 (translation backfill) before 10/11 begin if you find concurrency painful.
5. **Wave 5 staggered parallel.** Six sub-hub builds, all parallel-risky. Stagger starts by 10–15 minutes. Keep rules H1–H10 visible.
6. **Wave 6 staggered parallel.** Five sessions. Same hardening rules. The hidden-feature UI work has the most file diversity (each impl touches a different module's pages), so collisions are less frequent than Wave 5 but still possible.
7. **Wave 7 alone, last session.** Verification sweep + doc updates. Single executor.

## Override notes

- **If the user is doing partial reviews between impls,** prefer Sonnet 4.6 for low-difficulty work to keep wall time low and review easier. Opus 4.7 for the showpiece pages (13, 14, 15, 16, 17) regardless of cost.
- **If something goes wrong mid-wave** — sibling collision, lint-staged stash incident, broken deploy — drop to Opus 4.7 + Ultrathink for the recovery session. Recovery is high-stakes; spend the budget.
- **Wave 6 impls 19–23 each bundle multiple sub-features** (e.g. impl 21 = exclusion + restrictions + amendments + ack). If during execution any one of those sub-features balloons, **split it into a follow-up impl** rather than over-running. Add the split to the log under the original record's "Follow-ups".
