A. Facts

- I used `docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md` as the baseline for repo-scale counts, hotspot counts, and validation results.
- The API composition root is centralized in `apps/api/src/app.module.ts:69-154`, which wires global infra plus 59 feature modules. `apps/api/src/main.ts:16-92` is structurally clean: env validation before bootstrap, security middleware, global prefix, global filters/interceptors, graceful shutdown.
- Fact-pack hotspot data says the largest backend modules are `behaviour` (24,104 lines), `pastoral` (19,810), `gradebook` (15,635), `finance` (7,637), and `scheduling` (7,393). The highest cross-module import hotspots are `gradebook` (32), `pastoral` (23), `staff-wellbeing` (21), `gdpr` (21), and `behaviour` (20).
- `packages/shared/src/index.ts:1-171` is a large root barrel with 105 `export *` lines. `packages/shared/package.json:7-82` defines 11 domain subpath exports (`behaviour`, `pastoral`, `sen`, `gdpr`, etc.), but targeted scans still found 606 `from '@school/shared'` imports versus 325 domain-subpath imports across `apps/` and `packages/`.
- `packages/shared/src` currently contains 256 files.
- I sampled these services:
- `apps/api/src/modules/finance/invoices.service.ts` as the most business-critical workflow sample.
- `apps/api/src/modules/gradebook/analytics/analytics.service.ts` as the largest service in the most coupled hotspot.
- `apps/api/src/modules/gdpr/consent.service.ts` as the largest sampled shared/core domain service.
- `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts` as a cleaner contrast module.
- I also sampled `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts` because the fact pack identifies `behaviour` as the largest and highest-risk domain hotspot, and its service shape materially affects the architecture assessment.
- `apps/api/src/modules/configuration/settings.service.ts:76-295` confirms that DZ-05 is genuinely mitigated in code: tenant settings are now read from and written to per-module rows with legacy blob fallback/sync.
- `apps/api/src/modules/reports/reports-data-access.service.ts:5-30` shows a working pattern for centralizing cross-module reads rather than scattering direct Prisma access.
- Boundary enforcement exists, but the current check is not reliable enough to call strong enforcement.
- `.github/workflows/ci.yml:93-97` still runs `pnpm check:boundaries -- --max-violations 235`.
- `scripts/check-module-boundaries.ts:5-11` says the tool is advisory, and `scripts/check-module-boundaries.ts:23-25` still points to `architecture/module-ownership.json`.
- In this checkout, the registry actually lives at `docs/architecture/module-ownership.json`, and `pnpm check:boundaries -- --max-violations 9999` failed locally with `ERROR: Module ownership registry not found`.

B. Strong Signals

- The repo is still recognizably a modular monolith, not an accidental big ball of mud. The top-level API wiring is explicit, and cross-cutting concerns are concentrated in predictable places (`AppModule`, `main.ts`, `GdprModule`, configuration, reports).
- Large domains are at least being decomposed internally. `apps/api/src/modules/behaviour/behaviour.module.ts:11-30` and `apps/api/src/modules/pastoral/pastoral.module.ts:11-34` are thin aggregators over focused sub-modules rather than single giant Nest modules.
- `InvoicesService` is large but still mostly cohesive. Its constructor surface is small (`PrismaService`, `SequenceService`, `ApprovalRequestsService`, `SettingsService`), and the methods stay centered on invoice lifecycle work in one bounded context.
- `ConsentService` is appropriately cross-cutting rather than sloppy. It touches parent/student/staff/applicant records, but all of that work is in service of a single concept: consent state and access control.
- `ParentInquiriesService` is the cleanest contrast sample. It uses a narrow table set (`parent`, `studentParent`, `parentInquiry`, `parentInquiryMessage`) plus one notification queue, and the state changes are easy to follow.
- The main structural weakness is not missing modules. It is that read boundaries are still porous. The fact pack, `module-blast-radius`, `module-ownership.json`, and the sampled analytics/behaviour files all point to direct Prisma reads as the dominant leak.

C. Inferences

- The repository is structurally viable as a modular monolith, but only moderately so. The module map is real, yet enforcement is still softer than the domain complexity now requires.
- The composition root is not the main problem. `AppModule` is large because the product is large. The harder architectural issue is that cross-module data access bypasses the Nest dependency graph, so the codebase is more coupled than the module tree suggests.
- The cleanest extraction candidates are internal first, not service-to-service or microservice splits:
- behaviour discipline workflows (`sanctions`, `appeals`, `exclusions`, `documents`, `notifications`)
- analytics/read-model pipelines spanning gradebook/classes/academics
- shared contract packaging (`@school/shared` root barrel versus domain subpaths)
- boundary governance tooling (`check-module-boundaries`, ownership registry, doc consistency)
- Documented danger zones are only partly current.
- DZ-02 is still valid. Direct Prisma cross-module reads remain a first-order architectural risk.
- DZ-07 is still valid. `apps/api/src/modules/classes/classes.module.ts:20-28` still uses `ModuleRef` lazy injection for `SchedulesService`.
- DZ-05 appears genuinely resolved in code.
- The documented Pastoral/Child Protection `forwardRef` cycle is stale in current code and should no longer be treated as an active danger zone in its documented form.

D. Top Findings

### 1. Boundary enforcement is still advisory, debt-budgeted, and locally miswired

Severity: High

Confidence: High

Why it matters: A modular monolith only stays modular if boundary rules are enforced by tooling. Right now the repo has boundary guardrails on paper, but they are permissive enough and brittle enough that architectural erosion can continue without a hard stop.

Evidence: `.github/workflows/ci.yml:93-97` allows 235 boundary violations. `scripts/check-module-boundaries.ts:5-11` explicitly describes the tool as advisory, and `scripts/check-module-boundaries.ts:23-25` still resolves the ownership registry from a non-existent `architecture/` directory. In this checkout the real file is `docs/architecture/module-ownership.json`, and running `pnpm check:boundaries -- --max-violations 9999` failed immediately with a missing-registry error. `docs/architecture/module-ownership.json:31-35` also shows that `classes` still has no read facade, which limits what the checker can even enforce.

Fix direction: Repair the registry path first. Then ratchet the max-violation budget down in CI instead of holding a large standing allowance. After that, add read facades or approved read models for the highest-leak domains (`classes`, `academics`, gradebook analytics surfaces) so the checker has real contracts to enforce.

### 2. Behaviour’s discipline slice is still an internal mini-monolith despite the root module split

Severity: High

Confidence: Medium-high

Why it matters: `behaviour` is the largest backend domain in the fact pack and one of the highest coupling hotspots. If its main discipline services continue to mix domain rules, orchestration, documents, queues, scheduling, and follow-on workflows, every change in that slice stays high risk.

Evidence: The fact pack identifies `behaviour` as the largest backend module at 24,104 lines and a top-five cross-module hotspot. `apps/api/src/modules/behaviour/behaviour.module.ts:11-30` shows good module-level decomposition, but `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts:41-47` already injects five collaborators, and `behaviour-sanctions.service.ts:51-218` mixes incident/student validation, sequence generation, settings reads, suspension-day calculation, history writes, optional document generation, parent notification enqueueing, and exclusion auto-creation in a single create path. The same service also owns policy-engine entry (`224-295`), query/list/detail work (`299-405`), update plus amendment orchestration (`409+`), status transitions (`522-579`), and scheduling/conflict logic later in the file.

Fix direction: Keep the root module split, but split the sanction slice further into internal application services: `CreateSanctionWorkflow`, `SanctionQueryService`, `SanctionTransitionService`, `SanctionSchedulingService`, and `SanctionDocumentOrchestrator`. The behavioural state machine should remain central, while best-effort notifications/documents should be pushed further toward side-effect handlers.

### 3. Gradebook analytics is coupling through direct table access and per-teacher orchestration instead of a stable read model

Severity: High

Confidence: High

Why it matters: `gradebook` is the single most coupled hotspot in the fact pack. The analytics service deepens that coupling by reaching into class-staff data directly and building analytics with a query-per-class-teacher loop. That is bad for both boundary clarity and long-term performance.

Evidence: The fact pack reports 32 cross-module import hotspots for `gradebook`, the highest in the repo. `apps/api/src/modules/gradebook/analytics/analytics.service.ts:388-406` reads `classStaff` directly, which is class-domain data. `analytics.service.ts:418-434` then issues an assessment query inside a loop over each class-staff row. The service also reads `class`, `assessment`, `grade`, and `periodGradeSnapshot` directly. `docs/architecture/module-ownership.json:31-35` confirms that `classes` still has no facade, while `apps/api/src/modules/gradebook/gradebook.module.ts:101-104` only exports `GradebookReadFacade` outward rather than solving this analytics-side inward coupling.

Fix direction: Move teacher consistency and similar cross-domain analytics onto a dedicated read model. That can be a single analytics facade backed by materialized views or batched aggregate queries, but it should stop depending on ad hoc direct reads from `classStaff` plus per-row follow-up queries.

### 4. `@school/shared` is still too broad to function as a tight shared kernel

Severity: Medium

Confidence: High

Why it matters: A wide convenience barrel blurs ownership boundaries. It makes it easy for modules to import more than they should, and it raises the cost of future extraction because unrelated contracts look co-owned.

Evidence: `packages/shared/src/index.ts:1-171` exports 105 wildcard entries across core types, schemas, finance, payroll, reports, homework, and helpers. `packages/shared/package.json:7-82` already offers domain subpaths, but adoption is partial: targeted scans found 606 root-barrel imports versus 325 domain-subpath imports. In the sample set, `apps/api/src/modules/finance/invoices.service.ts:8-13` still imports from the root barrel, while `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts:10-27` and `apps/api/src/modules/gdpr/consent.service.ts:8-19` use domain subpaths.

Fix direction: Freeze new root-barrel exports except true shared-kernel primitives. Require domain contracts to come from subpaths. If needed, split the current root surface into a smaller `shared-kernel` contract set plus domain-specific entrypoints, and add linting to discourage `from '@school/shared'` in domain code.

### 5. Architecture docs have drifted from the actual module graph in a place developers are told to trust

Severity: Medium

Confidence: High

Why it matters: This repo explicitly depends on architecture docs to stay operable at scale. If the blast-radius docs and module READMEs are stale around live coupling, they stop being controls and start being traps.

Evidence: `docs/architecture/module-blast-radius.md:410-440` still describes `PastoralModule` and `ChildProtectionModule` as a `forwardRef` circular dependency. `apps/api/src/modules/pastoral/README.md:26-63` repeats the same story. The current code says otherwise: `apps/api/src/modules/pastoral/pastoral.module.ts:11-34` is a thin aggregator, `apps/api/src/modules/pastoral/pastoral-core.module.ts:19-29` explicitly says it is a leaf and does not import `ChildProtectionModule`, and `apps/api/src/modules/pastoral/pastoral-admin.module.ts:20-27` states that the cycle is broken and imports `ChildProtectionModule` directly. The boundary-check script path drift is a second example of the same problem.

Fix direction: Treat architecture docs and architecture scripts as release artifacts. Any module-graph refactor should update `module-blast-radius`, the module README, and any architecture scripts in the same change. Add a lightweight consistency check for known architecture file paths and declared module cycles.

E. Files Reviewed

- `docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `apps/api/src/app.module.ts`
- `docs/architecture/module-blast-radius.md`
- `docs/architecture/danger-zones.md`
- `apps/api/src/main.ts`
- `turbo.json`
- `packages/shared/src/index.ts`
- `packages/shared/package.json`
- `apps/api/src/modules/finance/invoices.service.ts`
- `apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`
- `apps/api/src/modules/gradebook/analytics/analytics.service.ts`
- `apps/api/src/modules/gdpr/consent.service.ts`
- `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts`
- `apps/api/src/modules/configuration/settings.service.ts`
- `apps/api/src/modules/reports/reports-data-access.service.ts`
- `apps/api/src/modules/gradebook/gradebook.module.ts`
- `apps/api/src/modules/gdpr/gdpr.module.ts`
- `apps/api/src/modules/behaviour/behaviour.module.ts`
- `apps/api/src/modules/pastoral/pastoral.module.ts`
- `apps/api/src/modules/pastoral/pastoral-admin.module.ts`
- `apps/api/src/modules/pastoral/pastoral-core.module.ts`
- `apps/api/src/modules/pastoral/README.md`
- `apps/api/src/modules/child-protection/child-protection.module.ts`
- `apps/api/src/modules/classes/classes.module.ts`
- `docs/architecture/module-ownership.json`
- `scripts/check-module-boundaries.ts`
- `.github/workflows/ci.yml`

F. Additional Commands Run

- `rg --files apps/api/src/modules/<module> | rg 'service\\.ts$' | xargs wc -l | sort -nr | head` for `behaviour`, `gradebook`, `finance`, `gdpr/configuration/common`, and cleaner contrast modules.
- `rg -n "from '@school/shared'" apps packages --glob '!**/dist/**' | wc -l`
- `rg -n "from '@school/shared/(behaviour|pastoral|sen|staff-wellbeing|gdpr|security|regulatory|early-warning|engagement|ai|scheduler)'" apps packages --glob '!**/dist/**' | wc -l`
- `find packages/shared/src -type f | wc -l`
- `rg -c '^export \\*' packages/shared/src/index.ts`
- `rg -o "(?:this\\.prisma|db|tx)\\.[A-Za-z0-9_]+" <sampled-service>` to identify table/model touch points.
- `rg -n "forwardRef|ModuleRef|Optional\\(|InjectQueue|BullModule.registerQueue|APP_GUARD"` across hotspot modules to verify coupling mechanisms.
- `pnpm check:boundaries -- --max-violations 9999` to test the boundary guardrail in this checkout. It failed because the script points at the wrong registry path.

G. Score

6/10. This is still a real modular monolith, with meaningful domain partitioning and some good internal decomposition, but the boundary system is not enforced hard enough for the size and risk profile of the codebase. The biggest domains still behave like internal monoliths, and direct read coupling remains the main structural drag.

H. Confidence in this review

Medium-high. I am confident in the hotspot-level conclusions because they are grounded in the canonical fact pack, the required architecture docs, the composition root, and focused sampling of the largest and cleanest representative services. I did not do full-file analysis of all 59 backend modules, so this should be treated as a strong hotspot review rather than exhaustive whole-repo certification.
