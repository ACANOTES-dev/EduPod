# A. Facts

- I read the canonical fact pack first and used it as the baseline: [fact-pack_20260403T130928+0100.md](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md).
- I did not repeat repo-wide lint, type-check, or debt scans. I used the fact-pack results that lint passed with `296` warnings and that warning concentration already includes `school/no-untranslated-strings`, `max-lines`, and `school/no-cross-module-internal-import`: [fact-pack_20260403T130928+0100.md#L139](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md#L139).
- Hotspot backend files reviewed:
  - [behaviour.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts)
  - [intervention.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts)
  - [workload-compute.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts)
- Frontend flow files reviewed:
  - [page.tsx](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx>)
  - [page.tsx](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx>)
- Backend contrast files reviewed:
  - [classes.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.service.ts)
  - [period-grid.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/period-grid/period-grid.service.ts)
- Lint/custom-rule packages reviewed:
  - [next.js](/Users/ram/Desktop/SDB/packages/eslint-config/next.js)
  - [nest.js](/Users/ram/Desktop/SDB/packages/eslint-config/nest.js)
  - [no-hand-rolled-forms.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js)
  - [no-untranslated-strings.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-untranslated-strings.js)
  - [no-hand-rolled-forms.test.js](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-hand-rolled-forms.test.js)
  - [no-untranslated-strings.test.js](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-untranslated-strings.test.js)
  - [raw-sql-allowlist.json](/Users/ram/Desktop/SDB/packages/eslint-config/raw-sql-allowlist.json)

# B. Strong Signals

- The repo has real maintainability intent, not just style rules. The custom lint layer targets architecture and safety concerns that matter in this codebase: interactive transactions, raw SQL governance, RTL-safe CSS, i18n, and hand-rolled forms: [next.js#L1](/Users/ram/Desktop/SDB/packages/eslint-config/next.js#L1), [nest.js#L1](/Users/ram/Desktop/SDB/packages/eslint-config/nest.js#L1), [raw-sql-allowlist.json#L1](/Users/ram/Desktop/SDB/packages/eslint-config/raw-sql-allowlist.json#L1).
- The healthier contrast services show that good local structure is achievable here. [classes.service.ts#L45](/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.service.ts#L45) and [period-grid.service.ts#L37](/Users/ram/Desktop/SDB/apps/api/src/modules/period-grid/period-grid.service.ts#L37) stay focused on one domain, keep errors structured, and use small helpers instead of mixing multiple orchestration concerns into every method.
- [intervention.service.ts#L153](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts#L153) is still large, but it is easier to follow than the behaviour hotspot because the file is sectioned by use case, keeps side-effects explicit, and contains clear private helpers for reminders/settings: [intervention.service.ts#L859](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts#L859).
- On the frontend, [SupportPlanDetailPage](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx>) is materially healthier than the sampled appeal page: it consistently uses `t(...)`, logs background-fetch failures, and groups actions into clearer sections/dialogs: [page.tsx#L169](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx#L169>), [page.tsx#L730](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx#L730>).

# C. Inferences

- Maintainability risk is concentrated rather than uniform. The sampled contrast files are workable, but a small number of hotspot files already carry disproportionate cognitive load and refactor friction.
- Convention enforcement is stronger for backend data-safety than for frontend maintainability/i18n. The repo blocks dangerous transaction/raw-SQL mistakes more aggressively than it blocks untranslated UX strings or state-heavy page components.
- The main issue is drift in high-change surfaces, not absence of standards. The healthier files demonstrate that the team has a workable style; the problem is that governance currently tolerates exceptions in the places where complexity is already highest.

# D. Top Findings

1. Title: Behaviour incident orchestration has become a god service
   Severity: High
   Confidence: High
   Why it matters: Changes to incidents now require editing one file that mixes validation, sequence generation, context snapshots, participant snapshots, history recording, task creation, queue side-effects, permission projection, and state transitions. That makes routine changes expensive and increases drift between adjacent flows.
   Evidence: [behaviour.service.ts#L65](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L65) contains a single transaction that performs idempotency, validation, lookups, snapshot construction, writes, history, task creation, and side-effect dispatch. The same file also owns update diffing and withdrawal orchestration: [behaviour.service.ts#L542](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L542), [behaviour.service.ts#L655](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L655). Student snapshot construction is duplicated in two separate flows at [behaviour.service.ts#L220](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L220) and [behaviour.service.ts#L824](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L824).
   Fix direction: Split the file by command/use-case boundary rather than by “all incident logic in one class”. Extract snapshot builders and history-diff helpers, then keep a thin facade only if controller stability requires it.

2. Title: Appeal detail page is a maintainability and i18n outlier in an important user flow
   Severity: High
   Confidence: High
   Why it matters: This page is large, state-heavy, and manually manages several mini-forms in one component. It also leaks untranslated user-facing copy into a bilingual product. That combination makes the page harder to reason about, harder to test, and more likely to regress when appeal workflows expand.
   Evidence: [page.tsx#L223](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L223>) through [page.tsx#L246](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L246>) defines many independent state cells for reviewer assignment, hearing details, decision entry, amendments, withdrawal, and history. Action handlers are all inline in the page at [page.tsx#L250](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L250>) through [page.tsx#L375](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L375>). The rendered UI still contains untranslated labels/placeholders such as [page.tsx#L518](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L518>), [page.tsx#L544](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L544>), [page.tsx#L588](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L588>), [page.tsx#L621](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L621>), [page.tsx#L639](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L639>), [page.tsx#L705](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L705>), [page.tsx#L730](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L730>), and [page.tsx#L861](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L861>).
   Fix direction: Split the page into focused subcomponents for reviewer, hearing, decision, history, and withdrawal. Migrate the editable sections to `react-hook-form` with shared schemas, and move all user-facing copy into translations, including toast/error strings.

3. Title: Frontend lint rules express the right goals but miss the shapes that are actually drifting
   Severity: Medium
   Confidence: High
   Why it matters: The rules currently document the team’s intent more than they enforce it. That means large stateful pages and untranslated runtime copy can pass CI even when they violate the product’s bilingual/form conventions.
   Evidence: `school/no-untranslated-strings` is only a warning in [next.js#L6](/Users/ram/Desktop/SDB/packages/eslint-config/next.js#L6), and the fact pack already records abundant warnings rather than hard failures: [fact-pack_20260403T130928+0100.md#L141](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md#L141). The rule itself only inspects JSX-context strings at [no-untranslated-strings.js#L193](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-untranslated-strings.js#L193), while its test suite explicitly treats non-JSX strings as valid at [no-untranslated-strings.test.js#L48](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-untranslated-strings.test.js#L48). That leaves runtime copy such as the appeal-page toast strings at [page.tsx#L260](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L260>) through [page.tsx#L373](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L373>) outside enforcement. `school/no-hand-rolled-forms` is an error in config, but the implementation only reports when it sees 3+ `useState` fields plus a function literally named `onSubmit` or `handleSubmit`: [no-hand-rolled-forms.js#L45](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js#L45), [no-hand-rolled-forms.js#L97](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js#L97), [no-hand-rolled-forms.test.js#L32](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-hand-rolled-forms.test.js#L32). The sampled appeal page has many field states and custom submit handlers, but they are named `handleDecide`, `handleWithdraw`, and `handleUpdateAppeal`, so the rule can miss the page entirely: [page.tsx#L223](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L223>), [page.tsx#L300](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx#L300>).
   Fix direction: Expand the rules to cover runtime UX strings and broader form heuristics, then raise the consequence level for school-route violations. The current rules are useful as diagnostics, but they are too narrow and too soft to keep hotspot pages aligned.

4. Title: Type-safety discipline weakens in the hotspot services that need it most
   Severity: Medium
   Confidence: High
   Why it matters: The repo’s policy is strict TypeScript with very limited exceptions, but the sampled hotspot files still fall back to shape-erasing casts. That reduces refactor safety precisely in the files with the most change surface.
   Evidence: [behaviour.service.ts#L548](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L548) and [behaviour.service.ts#L550](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts#L550) cast `incident` through `unknown` to diff DTO fields dynamically. [intervention.service.ts#L546](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts#L546) casts `target_outcomes` through `unknown` during update construction. Even the healthier contrast service [classes.service.ts#L66](/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.service.ts#L66) reaches for `Record<string, unknown>` to access extra DTO shape.
   Fix direction: Replace dynamic object diffing and ad hoc `Record<string, unknown>` access with typed field maps or dedicated DTO-to-update translators. Where shared JSON fields are involved, expose explicit helper types from `@school/shared` instead of casting through `unknown`.

5. Title: WorkloadComputeService no longer matches its “thin facade” abstraction
   Severity: Medium
   Confidence: High
   Why it matters: This file presents itself as a facade, but it directly instantiates helpers, runs repeated staff-wide query loops, and carries a large static compatibility surface. That increases the blast radius of any workload analytics change and makes the class costly to decompose later.
   Evidence: The class comment says it is a thin facade at [workload-compute.service.ts#L150](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L150), but it manually constructs collaborators outside DI at [workload-compute.service.ts#L156](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L156) and also injects `metricsService` without using it at [workload-compute.service.ts#L162](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L162). The file repeats staff-wide loops in several methods at [workload-compute.service.ts#L400](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L400), [workload-compute.service.ts#L484](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L484), and [workload-compute.service.ts#L645](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L645), then adds a large static delegation bridge at [workload-compute.service.ts#L1073](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts#L1073).
   Fix direction: Move staff-wide aggregation/query plans into dedicated injected services, centralize repeated data loading, and isolate the static backward-compatibility bridge behind a separate adapter or deprecation layer.

# E. Files Reviewed

- [fact-pack_20260403T130928+0100.md](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md)
- [behaviour.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts)
- [intervention.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/pastoral/services/intervention.service.ts)
- [workload-compute.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts)
- [classes.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/classes/classes.service.ts)
- [period-grid.service.ts](/Users/ram/Desktop/SDB/apps/api/src/modules/period-grid/period-grid.service.ts)
- [page.tsx](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx>)
- [page.tsx](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx>)
- [next.js](/Users/ram/Desktop/SDB/packages/eslint-config/next.js)
- [nest.js](/Users/ram/Desktop/SDB/packages/eslint-config/nest.js)
- [plugin.js](/Users/ram/Desktop/SDB/packages/eslint-config/plugin.js)
- [no-hand-rolled-forms.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js)
- [no-untranslated-strings.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-untranslated-strings.js)
- [no-physical-css-direction.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-physical-css-direction.js)
- [no-cross-module-internal-import.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-cross-module-internal-import.js)
- [no-sequential-transaction.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-sequential-transaction.js)
- [no-raw-sql-outside-rls.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js)
- [max-public-methods.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/max-public-methods.js)
- [no-empty-catch.js](/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-empty-catch.js)
- [no-hand-rolled-forms.test.js](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-hand-rolled-forms.test.js)
- [no-untranslated-strings.test.js](/Users/ram/Desktop/SDB/packages/eslint-config/tests/no-untranslated-strings.test.js)
- [max-public-methods.test.js](/Users/ram/Desktop/SDB/packages/eslint-config/tests/max-public-methods.test.js)
- [raw-sql-allowlist.json](/Users/ram/Desktop/SDB/packages/eslint-config/raw-sql-allowlist.json)

# F. Additional Commands Run

- `wc -l /Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `sed -n '1,260p' /Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `rg --files apps/api/src/modules | rg 'service\\.ts$' | xargs wc -l | sort -nr | sed -n '1,80p'`
- `rg --files apps/web/src/app | rg 'page\\.tsx$' | xargs wc -l | sort -nr | sed -n '1,40p'`
- `rg --files packages/eslint-config packages/eslint-plugin-school`
- `sed -n ...` on each sampled backend/frontend/rule file to read full sections
- `rg -n ...` on sampled files to isolate method boundaries, state usage, toast/i18n strings, and rule heuristics
- `nl -ba ... | sed -n ...` on sampled files and lint rules to capture exact evidence lines

# G. Score

- `6/10` sample-based maintainability score. The repo has strong conventions and some genuinely healthy service/page patterns, but the sampled hotspot files are already expensive to change and the current lint posture still tolerates too much frontend/i18n drift.

# H. Confidence in this review

- Medium-high for the sampled files and rule-enforcement analysis.
- Moderate for repo-wide generalization, because this was a targeted hotspot/contrast sample rather than full coverage of all modules and routes.
