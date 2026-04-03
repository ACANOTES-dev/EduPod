# Subagent 1 Architecture Review

## A. Facts

- The canonical fact pack states that `apps/api` contains `56` modules; the largest by non-test TypeScript LOC are `behaviour` (`25,291`), `pastoral` (`19,369`), and `gradebook` (`15,146`), and the top cross-module import hotspots are `gradebook` (`25`), `staff-wellbeing` (`21`), `pastoral` (`19`), `behaviour` (`19`), and `gdpr` (`18`).
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts) imports almost every domain module directly in one composition root at lines `74-147`, including `BehaviourModule`, `PastoralModule`, `GradebookModule`, `GdprModule`, `RegulatoryModule`, and `StaffWellbeingModule`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts) contains `110` `export *` statements and re-exports common constants/types/schemas as well as domain entry points for `behaviour`, `pastoral`, `sen`, `staff-wellbeing`, `gdpr`, `security`, `regulatory`, `early-warning`, `engagement`, `homework`, and scheduler helpers.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) documents `BehaviourModule` with `28` exported services, `17` controllers, `214` endpoints, two queues, and many direct reads of foreign tables at lines `197-241`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.module.ts) imports `ApprovalsModule`, `ChildProtectionModule`, `GdprModule`, `PastoralModule`, `PdfRenderingModule`, `S3Module`, `TenantsModule`, and three queues at lines `75-87`, and registers a large controller/provider/export surface at lines `88-191`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts) is `1,230` LOC. It exposes public methods for list/profile/timeline/points/tasks/preview/analytics/sanctions/interventions/awards/AI summary/parent view, and private analytics helpers. It reads `student`, `behaviourIncidentParticipant`, `behaviourIncident`, `behaviourSanction`, `behaviourRecognitionAward`, `behaviourParentAcknowledgement`, and raw SQL from `mv_student_behaviour_summary` at lines `83-179` and `632-860`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) documents `PastoralModule` with `17` exported services, `14` controllers, direct reads of many foreign tables, and an intentional `forwardRef()` cycle with `ChildProtectionModule` at lines `349-363`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/pastoral.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/pastoral.module.ts) still imports `forwardRef(() => ChildProtectionModule)` at lines `55-58`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts) is `1,274` LOC. In `create()` it creates `pastoralConcern`, optional involved-student links, an initial narrative version, and a `cpRecord` directly when the effective tier is `3` at lines `184-247`. The same service also handles tier escalation, sharing with parents, permission checks, queue enqueueing, queue job removal, and audit/event writes at lines `599-979`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/gradebook.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/gradebook.module.ts) imports `AcademicsModule`, `CommunicationsModule`, `ConfigurationModule`, `GdprModule`, `PdfRenderingModule`, `RedisModule`, and the `gradebook` queue at lines `56-64`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts) is `983` LOC. It validates academic periods and students, reads tenant locale, period snapshots, assessments, attendance summaries, class enrolments, GPA snapshots, and report cards, and it also updates, publishes, revises, bulk-generates, bulk-publishes, invalidates Redis cache, and builds transcripts at lines `33-220` and `361-920`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts) is `1,336` LOC. Its class comment says it is a "Thin facade" at lines `146-150`, but it directly queries `schedule`, `schedulePeriodTemplate`, `staffProfile`, `teacherAbsence`, and `substitutionRecord`, iterates over all staff in several methods, and also computes personal, aggregate, fairness, timetable-quality, absence, substitution-pressure, and correlation outputs at lines `165-260` and `340-1150`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) documents `StaffWellbeingModule` as reading from scheduling, substitution, staff profiles, payroll, communications, and configuration at lines `280-295`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) documents `GdprModule` exports that are consumed by gradebook, scheduling, attendance, behaviour, reports, and the global DPA guard at lines `35-62`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr.module.ts) imports `forwardRef(() => CommunicationsModule)` and registers `DpaAcceptedGuard` as `APP_GUARD` at lines `24-47`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts) is `541` LOC. It handles grant/withdraw/has/list/bulk/parent-portal flows and validates subject existence by directly querying `student`, `parent`, `staffProfile`, and `application` at lines `54-259` and `447-500`. Its parent-portal flow also queries `parent` and `studentParent` at lines `262-445`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory.module.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory.module.ts) imports only `AuthModule` and `S3Module` at lines `26-27`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts) is `293` LOC with two public methods and focused private helpers. It reads mostly regulatory tables plus `attendancePatternAlert` for the Tusla summary at lines `70-292`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md) still marks Prisma-direct cross-module queries as only partially mitigated at lines `26-52`, and it still documents the `PastoralModule` <-> `ChildProtectionModule` circular dependency and the pastoral escalation self-chain at lines `566-598`.
- [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json) defines generic `build`, `dev`, `lint`, `type-check`, and `test` tasks only.

## B. Strong Signals

- The Nest module graph is explicit, but the real architectural coupling is concentrated in direct Prisma access to foreign tables and in queue side effects rather than in constructor-injected cross-module services.
- The most important hotspots all combine three properties: high AppModule centrality, large module/service size, and direct reads or writes against tables owned by other domains.
- `Behaviour`, `Pastoral`, and `Gradebook` are not just large modules; they each mix workflow, projections, notifications, analytics, and parent-facing shaping in the same module or service surfaces.
- `GdprModule` and `StaffWellbeingModule` show two different cross-cutting patterns: downstream shared-policy dependencies and upstream analytics aggregation over many domains.
- The architecture documentation is materially aligned with the sampled code. The docs are describing live exceptions, not stale history.
- The repo also contains cleaner counterexamples. `RegulatoryModule` and `RegulatoryDashboardService` are much tighter in cohesion and dependency shape than the major hotspots.

## C. Inferences

- This repository is a modular monolith in packaging and runtime composition, but not in strict data ownership. A more accurate description is "explicit Nest modules over a shared relational model with porous read boundaries."
- The biggest refactor risk is schema evolution, not dependency injection. The import graph understates blast radius because many cross-domain consumers bypass owning services.
- The right extraction path is internal first: submodules, read facades, and narrowed public surfaces inside the monolith. Nothing in the sample suggests that the first move should be standalone services.
- `GdprModule` is intentionally central and likely should remain so; the bigger structural issue is not its existence, but the lack of similarly explicit ownership boundaries for shared reads elsewhere.
- The clean contrast in `regulatory` suggests the codebase can support tighter module boundaries without an architectural rewrite. The problem is uneven enforcement, not missing framework support.

## D. Top Findings

### 1. Data ownership is the main boundary leak

- Severity: High
- Confidence: High
- Why it matters: Refactors that look local in the Nest module graph are not local in practice. Schema changes can break many consumers that are invisible at the service-injection layer, which raises the cost and risk of routine extension work.
- Evidence: `DZ-02` still says Prisma-direct cross-module reads are only partially mitigated and explicitly warns not to trust the import graph ([/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md) `26-52`). The cross-module query table in [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) `256-276` lists the same pattern. Sampled code confirms it in `BehaviourStudentsService` (`student` and other foreign reads at `83-179`, parent-facing projections and raw MV fallback at `632-860`), `ReportCardsService` (students, periods, attendance, enrolments, GPA, report cards at `33-220` and `526-920`), `WorkloadComputeService` (scheduling/staff/substitution data across many methods at `165-260` and `340-1150`), `ConsentService` (subject checks across four domains at `447-500`), and even the cleaner `RegulatoryDashboardService` (`attendancePatternAlert` at `148-186`).
- Fix direction: Introduce owner-based query facades for foreign table families, starting with `students`, `staff_profiles`, `class_enrolments`, `academic_periods`, and attendance summaries. Keep the existing reports facade model as the template. Add an architecture check that blocks new direct foreign-table reads outside approved facades.

### 2. Behaviour and Pastoral act as internal god modules

- Severity: High
- Confidence: High
- Why it matters: These modules are large enough that the module boundary itself no longer gives much safety. Too many workflows, controllers, and side effects are concentrated behind one import, which makes local reasoning hard and extraction harder.
- Evidence: The fact pack marks `behaviour` as the largest module (`25,291` LOC) and `pastoral` as the second largest (`19,369` LOC). [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md) describes `BehaviourModule` with `28` exported services, `17` controllers, `214` endpoints, two queues, and many cross-domain reads at `197-241`, and `PastoralModule` with `17` exported services, `14` controllers, direct foreign-table reads, queues, and a child-protection cycle at `349-363`. The actual module files mirror that breadth: `behaviour.module.ts` imports multiple external modules and queues while exposing a very large provider/export surface at `74-191`, and `pastoral.module.ts` still pulls in the CP `forwardRef()` and many services/controllers at `54-128`.
- Fix direction: Split these domains into internal submodules with one facade per subdomain. For `behaviour`, likely cuts are incident core, sanctions/appeals/exclusions, safeguarding, analytics, and documents/notifications. For `pastoral`, likely cuts are concerns/cases, interventions/check-ins, reporting/DSAR, and child-protection integration. Reduce exports to narrower facades rather than exporting most services.

### 3. Several hotspot services have poor cohesion even after modularization

- Severity: High
- Confidence: High
- Why it matters: Large services with many reasons to change become the day-to-day refactor bottleneck. They are harder to test, easier to regress, and they accumulate hidden invariants faster than the surrounding module structure can compensate.
- Evidence: `BehaviourStudentsService` (`1,230` LOC) bundles listing, profile, timeline, tasks, sanctions, interventions, awards, parent-view shaping, and analytics projection logic, plus raw materialized-view fallback. `ConcernService` (`1,274` LOC) handles concern creation, involved-student syncing, child-protection record creation, tier escalation, parent-sharing policy, queue enqueueing, queue cancellation, and event/audit writes. `ReportCardsService` (`983` LOC) owns generation, updates, publish/revise state changes, batch snapshot building, bulk publish, transcript generation, and Redis cache invalidation. `WorkloadComputeService` (`1,336` LOC) advertises itself as a thin facade but still performs substantial data access, cross-staff iteration, statistical aggregation, and trend logic in one class.
- Fix direction: Split by responsibility, not by line count alone. Good first cuts are `BehaviourStudentQueryService` plus `BehaviourStudentAnalyticsService`; `ConcernWorkflowService` plus `ConcernSharingService` plus a CP integration facade; `ReportCardGenerationService`, `ReportCardLifecycleService`, and `TranscriptQueryService`; `WorkloadPersonalService`, `WorkloadAggregateService`, and `WorkloadTrendService`. Keep thin facades only if they truly delegate.

### 4. `packages/shared` has become a cross-domain public surface

- Severity: Medium
- Confidence: High
- Why it matters: A single root barrel that re-exports every domain contract makes it easy to import across boundaries casually. That increases shared-package sprawl, obscures ownership, and widens the blast radius of "shared" changes.
- Evidence: `/packages/shared/src/index.ts` re-exports `110` symbols or subpaths from one file. The root barrel includes both truly common primitives and domain-specific contracts for `behaviour`, `pastoral`, `sen`, `staff-wellbeing`, `gdpr`, `regulatory`, `early-warning`, `engagement`, `homework`, and scheduler helpers at lines `134-178`.
- Fix direction: Keep the root barrel for a very small common core only. Add domain entry points such as `@school/shared/gdpr`, `@school/shared/gradebook`, and `@school/shared/pastoral`, then add lint guidance that forbids pulling domain-specific symbols from `@school/shared` root.

### 5. The highest-risk danger zones are documented correctly, but enforcement is still mostly social

- Severity: Medium
- Confidence: Medium
- Why it matters: The repo already knows where the architecture bends, which is a strength. The remaining risk is that these exceptions still rely on discipline and documentation more than on enforceable guardrails.
- Evidence: `DZ-02` is still live and matches sampled code. `DZ-35` still matches the code because `pastoral.module.ts` retains `forwardRef(() => ChildProtectionModule)` at `55-58`, matching [/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md](#/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md) `566-585`. `ConcernService.acknowledge()` still removes pastoral escalation jobs by explicit job id at `947-955`, which is consistent with the queue-chain fragility described in `DZ-36` `589-598`. `GdprModule` still installs `DpaAcceptedGuard` as a global guard at `35-47`, which matches the blast-radius warning in `/architecture/module-blast-radius.md` `57-62`.
- Fix direction: Convert the most important danger zones into automated checks. Add architecture tests for forbidden foreign-table access, a Nest startup smoke test that exercises the Pastoral/ChildProtection cycle, and queue-chain tests for pastoral escalation and similar self-reenqueue workflows.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/pastoral.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/gradebook.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts`

## F. Additional Commands Run

```bash
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts'
rg -n "^### (BehaviourModule|GradebookModule|GdprModule|RegulatoryModule|PastoralModule|StaffWellbeingModule|FinanceModule)" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
rg -n "^## DZ-(02|04|06|07|13|14)|^## DZ-" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'
rg -n "^export \\* from" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts' | wc -l
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src' -maxdepth 1 -type d | sort
rg -n "Gradebook|Pastoral|Gdpr|StaffWellbeing|Finance" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md' | head -n 80
sed -n '560,660p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'
sed -n '197,340p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
sed -n '1,200p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.module.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/gradebook.module.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr.module.ts'
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory.module.ts'
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour' | rg 'service\\.ts$' | tr '\n' '\0' | xargs -0 wc -l | sort -nr | head -n 12
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts'
rg -n "^  (async|private async|private |public )" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts'
sed -n '620,980p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts'
sed -n '560,980p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts'
sed -n '360,920p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts'
sed -n '260,1260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts'
sed -n '240,560p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts' | sed -n '1,190p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts' | sed -n '1,180p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts' | sed -n '70,180p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts' | sed -n '632,860p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts' | sed -n '150,260p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts' | sed -n '590,980p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts' | sed -n '1,220p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts' | sed -n '360,920p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts' | sed -n '130,260p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts' | sed -n '330,1150p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts' | sed -n '1,240p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/consent.service.ts' | sed -n '240,560p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-dashboard.service.ts' | sed -n '1,320p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md' | sed -n '30,110p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md' | sed -n '197,340p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md' | sed -n '340,390p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md' | sed -n '26,80p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md' | sed -n '560,610p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.module.ts' | sed -n '1,220p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/gradebook.module.ts' | sed -n '1,220p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr.module.ts' | sed -n '1,220p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory.module.ts' | sed -n '1,220p'
nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/pastoral.module.ts' | sed -n '1,220p'
test -e '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/subagent-01-architecture_2026-04-01_02-39-13.md' && echo exists || echo missing
```

## G. Score

- Score: 6/10
- Justification: The repo has real modular-monolith strengths: explicit Nest modules, a clear composition root, unusually good architecture documentation, and at least one noticeably cleaner module shape (`regulatory`). The score stops at `6` because data ownership is still porous across many domains, the biggest business modules are oversized, several sampled services are workflow/query god classes, and the root shared package has become a broad cross-domain API surface. This is workable, but refactors in hotspot domains require care rather than being naturally low-risk.

## H. Confidence in this review

- Confidence: Medium
- What limited certainty: I used the fact pack as canonical and sampled representative hotspots rather than re-running a full repo-wide graph analysis. I did not inspect every worker processor or every downstream consumer of the documented danger zones, so some blast-radius conclusions remain sample-based even though the sampled code strongly supports them.
