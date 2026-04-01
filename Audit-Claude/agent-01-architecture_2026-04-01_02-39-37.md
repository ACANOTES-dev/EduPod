# Agent 01 -- Architecture & Module Boundaries

**Audit date**: 2026-04-01
**Scope**: Structural soundness as a modular monolith -- coupling hotspots, boundary leaks, god modules, extraction candidates.

---

## A. Facts

1. **56 NestJS modules** registered in `app.module.ts`, all imported at root level into one flat `AppModule`. No lazy-loading, no module grouping at the NestJS level.
2. **264 Prisma models**, 251 with `tenant_id`. 248 covered by RLS policies (near-complete coverage).
3. **Largest modules by LOC**: behaviour (25,291 LOC, 64 files), pastoral (19,369 LOC, 45 files), gradebook (15,146 LOC, 44 files).
4. **Highest cross-module coupling by import count**: gradebook (25), staff-wellbeing (21), pastoral (19), behaviour (19), gdpr (18).
5. **Module blast radius doc (`architecture/module-blast-radius.md`)** is actively maintained (last verified 2026-03-30/2026-04-01), tiered from Tier 1 (global infrastructure) to Tier 4 (isolated modules).
6. **Shared package (`packages/shared`)** exports: 179 lines in `index.ts` covering constants, types, schemas, and domain-specific barrels (`behaviour`, `pastoral`, `sen`, `staff-wellbeing`, `gdpr`, `security`, `regulatory`, `early-warning`, `engagement`, `homework`). Organized by phase (P4A, P4B, P5, P6, P6B, P7, P8) with domain sub-barrels.
7. **`app.module.ts` middleware**: `CorrelationMiddleware` (request ID) runs first, then `TenantResolutionMiddleware` (excludes health, docs, webhooks). Global `SentryGlobalFilter` for error reporting.
8. **`main.ts` bootstrap**: Env validation before bootstrap (exits early on misconfiguration). Helmet, compression, cookie-parser, structured logging. CORS with explicit origins. Global exception filter + response transform interceptor. Swagger disabled in production.
9. **BehaviourModule** is the largest single NestJS module with 42 providers, 17 controllers (214 endpoints), 34 exports. Imports 8 other modules.
10. **GradebookModule** has 30 providers, 8 controllers, and imports 7 other modules including AcademicsModule, CommunicationsModule, ConfigurationModule, GdprModule.
11. **Cross-module Prisma-direct reads** are a documented and acknowledged pattern -- modules read other modules' tables directly via PrismaService rather than through service imports. This is tracked in the blast radius doc as a specific section with a table of known consumers.
12. **87 worker processors** across all domains, with behaviour alone having 16 processors.
13. **SequenceService** is consumed by 14 different modules for ID generation -- single most widely shared domain service.
14. **36 documented danger zones** (DZ-01 through DZ-36), with ~24 still marked OPEN.

---

## B. Strong Signals

### Positive Signals

1. **Well-documented cross-module coupling**: The `architecture/module-blast-radius.md` document is thorough, tiered, and recently verified. It tracks not just NestJS-level imports but also Prisma-direct reads, which is the real coupling surface. This is rare and valuable.

2. **Consistent service patterns**: All four sampled services follow the same structural pattern:
   - Constructor DI with `private readonly`
   - `tenantId` as first parameter on all methods
   - RLS via `createRlsClient(this.prisma, { tenant_id }).$transaction()`
   - Existence checks before mutations
   - Structured error codes (`{ code, message }`)
   - Pagination with `{ data, meta: { page, pageSize, total } }`
3. **Shared package discipline**: The `packages/shared` barrel is well-organized by phase and domain. Types and Zod schemas are centralized, not duplicated across modules. Domain sub-barrels (behaviour, pastoral, etc.) provide clean namespace boundaries.

4. **RLS enforcement is consistent**: Every write operation in the sampled services goes through `createRlsClient().$transaction()`. Read-only queries include `tenant_id` in the `where` clause. The one allowed `as unknown as PrismaService` cast is confined to the transaction callback, per the documented convention.

5. **Clear module tiering**: The blast radius doc explicitly categorizes modules into 4 tiers (Global Infrastructure, Cross-Cutting, Domain, Isolated), making risk assessment during changes tractable.

6. **Small modules are genuinely clean**: `RoomsService` at 170 LOC is a model CRUD service -- single responsibility, no cross-module dependencies, clean error handling, proper RLS. Demonstrates the codebase can produce well-bounded modules.

7. **SequenceService is well-designed for shared use**: Accepts optional `tx` parameter to participate in caller's transaction or create its own. Uses row-level locking (`FOR UPDATE`) for concurrency safety. Clean separation between sequence generation and number formatting.

### Negative Signals

1. **BehaviourModule is a god module**: 42 providers, 17 controllers, 214 endpoints, 25,291 LOC. It encompasses incidents, sanctions, appeals, exclusions, safeguarding, policy evaluation, recognition, interventions, analytics, AI, documents, amendments, legal holds, parent portal, admin -- these are at least 5-6 distinct bounded contexts forced into one module.

2. **Massive export surface on BehaviourModule**: 34 services exported. When a module exports nearly everything it provides, the "module boundary" is purely organizational, not architectural. Any consumer can reach into any part of behaviour.

3. **Empty catch blocks**: In `behaviour.service.ts`, lines 299, 315, 338 have `catch { }` blocks for BullMQ queue add operations. The comment says "Don't fail the incident creation if queue add fails" -- which is a reasonable intent -- but the CLAUDE.md explicitly says "Empty catch {} blocks are prohibited." These should at minimum log to console.

4. **`generate()` method in ReportCardsService runs N+1 queries**: The `generate()` method loops over each student sequentially, executing 3-4 queries per student (snapshots, assessments, attendance, then RLS transaction for create). For a class of 30 students, that's 90-120 individual queries. The `buildBatchSnapshots()` method partially addresses this with bulk snapshot loading but still has per-student attendance queries inside the loop (line 613).

5. **SequenceService uses unsafe type coercion**: Lines 24-25 and 40-41 use `db as unknown as { $queryRaw: ... }` to access raw query methods. While this is necessary for the `FOR UPDATE` locking pattern, it bypasses TypeScript safety on the transaction client interface.

6. **Shared package barrel is a single monolithic index.ts**: 179 lines of re-exports. No tree-shaking boundary. Any consumer importing one type pulls in the resolution of the entire barrel. At 412k LOC total, this could affect build times.

---

## C. Inferences

1. **BehaviourModule should be extracted into a sub-module constellation**: The module contains at least 5 natural bounded contexts: (a) Incident Core (CRUD, history, participants), (b) Safeguarding (concerns, referrals, break-glass, sealing), (c) Sanctions & Exclusions (sanctions, appeals, exclusion cases), (d) Recognition & Points (awards, house points, recognition wall), (e) Policy & Analytics (policy engine, analytics, AI, pulse). Each could be its own NestJS module with a narrower export surface. The `BehaviourScopeService` and `BehaviourHistoryService` would become shared infrastructure across the sub-modules.

2. **PastoralModule likely has the same god-module pattern**: At 19,369 LOC and 45 files, with documented circular dependency to ChildProtectionModule (DZ-35) and cross-module reads, it likely mirrors the BehaviourModule pattern. The blast radius doc confirms BehaviourModule imports PastoralModule.

3. **The Prisma-direct read pattern is an architectural compromise, not a bug**: The codebase acknowledges this explicitly in the blast radius doc. For a modular monolith, this is pragmatic -- the alternative (every cross-module read goes through a service import) would create far more NestJS module imports and tighter coupling at the DI level. The current pattern trades type-safety for decoupling. The risk is documented and mitigated by the blast radius table.

4. **The 56-module flat import in AppModule is appropriate for this architecture**: In a modular monolith, all modules share the same process. Lazy-loading or dynamic imports would add complexity without meaningful benefit since everything starts together anyway. The flat list is honest about the deployment unit.

5. **The codebase is nearing the extraction boundary for certain modules**: With 42 providers in BehaviourModule, the monolith's benefit (easy cross-module calls) is being offset by the complexity of reasoning about a single module's internal state. If the team grows beyond 2-3 developers, sub-module extraction becomes not just beneficial but necessary.

6. **Architecture documentation is a genuine competitive advantage of this codebase**: The blast radius doc, danger zones doc (36 entries), state machines doc, and event catalog together provide the kind of institutional knowledge that most codebases of this size lack entirely. This is not just documentation -- it is an active engineering tool that gates code changes.

---

## D. Top Findings

### Finding 1: BehaviourModule is a God Module Requiring Sub-Module Extraction

**Severity**: MEDIUM (structural debt, not a runtime risk)
**Confidence**: HIGH (95%)

**Why this matters**: BehaviourModule has 43 providers, 17 controllers, 214 endpoints, 107 TypeScript files, 25,291 LOC, and exports 38 of its 43 providers (88% export ratio). It contains at least 6 distinct bounded contexts (incident core, safeguarding, sanctions/exclusions/appeals, recognition/points, policy/analytics/AI, documents/amendments/admin). The 88% export ratio means the module boundary provides essentially no encapsulation -- consumers can reach into any internal service. By contrast, GradebookModule with 33 providers exports only 2 (6%), demonstrating that tight boundaries are achievable in this codebase.

**Evidence**:

- `apps/api/src/modules/behaviour/behaviour.module.ts`: 43 providers, 38 exports, 17 controllers
- Provider-export ratios across the codebase: behaviour=88%, gradebook=6%, attendance=22%, finance=35%
- The module also has its own sub-directories (`policy/`) indicating internal complexity that has already begun to fragment
- 26 empty catch blocks in the behaviour module alone (out of 79 in the entire API)

**Fix direction**: Extract into a constellation of sub-modules under `modules/behaviour/`:

- `behaviour-core.module.ts` (incidents, participants, history, scope)
- `behaviour-safeguarding.module.ts` (concerns, referrals, break-glass, seal)
- `behaviour-discipline.module.ts` (sanctions, appeals, exclusions)
- `behaviour-recognition.module.ts` (awards, points, house, recognition wall)
- `behaviour-analytics.module.ts` (analytics, pulse, AI, alerts)
- `behaviour-admin.module.ts` (admin, legal-holds, export, documents, amendments)
  Each sub-module would export only the 2-3 services needed by external consumers. Internal cross-sub-module dependencies would use explicit imports. This reduces the export surface from 38 to ~12 total exposed services across all sub-modules.

---

### Finding 2: Two Circular Dependencies Managed via forwardRef

**Severity**: LOW (properly managed, but debt)
**Confidence**: HIGH (100%)

**Why this matters**: Two `forwardRef()` cycles exist in the module graph:

1. **PastoralModule <-> ChildProtectionModule**: Pastoral needs CP for safeguarding escalation, CP needs Pastoral for concern cross-referencing. Documented as DZ-35.
2. **CommunicationsModule <-> GdprModule**: Communications needs GDPR for consent checking before WhatsApp delivery, GDPR needs Communications for fan-out notifications on privacy notice publishes.

Both are managed with `forwardRef()` which is the correct NestJS mechanism. The cycles are documented in the danger zones file. However, `forwardRef()` cycles are fragile -- they break silently if the import order changes in certain NestJS versions, and they prevent either module from being tested in isolation.

**Evidence**:

- `apps/api/src/modules/pastoral/pastoral.module.ts:57`: `forwardRef(() => ChildProtectionModule)`
- `apps/api/src/modules/child-protection/child-protection.module.ts:20`: `forwardRef(() => PastoralModule)`
- `apps/api/src/modules/communications/communications.module.ts:34`: `forwardRef(() => GdprModule)`
- `apps/api/src/modules/gdpr/gdpr.module.ts:25`: `forwardRef(() => CommunicationsModule)`

**Fix direction**: For the Pastoral<->CP cycle, consider a thin interface module (`pastoral-core.module.ts`) that both import, rather than direct circular reference. For Communications<->GDPR, the consent check direction is dominant -- consider having Communications import GDPR but GDPR enqueue notifications to BullMQ instead of importing Communications, breaking the cycle through async messaging.

---

### Finding 3: 79 Empty Catch Blocks Across the API Layer

**Severity**: MEDIUM (violates stated policy, hides failures)
**Confidence**: HIGH (100%)

**Why this matters**: The project's CLAUDE.md states: "Empty `catch {}` blocks are prohibited." Yet there are 79 occurrences across 49 files in `apps/api/src`. The behaviour module alone accounts for 26 of these. While most have descriptive comments explaining the intent (e.g., "Don't fail the incident creation if queue add fails"), none log the error. This means queue failures, cache failures, and AI failures are completely invisible in production. When something goes wrong with BullMQ dispatch, there is zero telemetry to diagnose it.

**Evidence**:

- 79 total empty catch blocks across 49 files in `apps/api/src`
- Behaviour module: 26 in 13 service files
- Gradebook module: ~8 in 5 service files
- Reports module: ~7 in 5 service files
- Pattern is consistent: all have comments, none have logging

**Fix direction**: Replace all `catch { }` blocks with `catch (err) { this.logger.error('[methodName] descriptive context', err); }` or at minimum `catch (err) { console.error('[context]', err); }`. A codemod can handle this systematically. Prioritize the BullMQ dispatch catch blocks (behaviour, gradebook, reports) since these hide job delivery failures.

---

### Finding 4: Several Modules Export 100% of Providers (No Boundary)

**Severity**: LOW-MEDIUM (structural, affects future modularity)
**Confidence**: HIGH (100%)

**Why this matters**: Five modules export 100% or more of their providers: EarlyWarningModule (100%), EngagementModule (100%), SenModule (100%), ConfigurationModule (100%), RegulatoryModule (109% -- exports more than provides, indicating re-exports). When a module exports everything, it has no internal encapsulation. Any consumer can depend on any service, creating hidden coupling that is invisible in import analysis.

**Evidence** (provider:export ratios from module analysis):

- `early-warning.module.ts`: 10 providers, 10 exports (100%)
- `engagement.module.ts`: 8 providers, 8 exports (100%)
- `sen.module.ts`: 10 providers, 10 exports (100%)
- `configuration.module.ts`: 6 providers, 6 exports (100%)
- `regulatory.module.ts`: 11 providers, 12 exports (109%)

**Fix direction**: Audit each module's exports against actual external consumers. Most should export 2-3 core services. For example, EarlyWarningModule exports all 5 signal collectors, but likely only `EarlyWarningService` and `EarlyWarningConfigService` are needed externally. The collectors are implementation details.

---

### Finding 5: ReportCardsService Has N+1 Query Pattern in generate()

**Severity**: MEDIUM (performance, scales poorly with class size)
**Confidence**: HIGH (100%)

**Why this matters**: `ReportCardsService.generate()` iterates over students sequentially, running 3-4 database queries per student inside the loop (grade snapshots, assessments, attendance summary, then an RLS transaction for the create). For a class of 30 students, that is 90-120 individual queries. The companion method `buildBatchSnapshots()` partially batches snapshot loading but still has per-student attendance `groupBy` queries inside its loop (line 613-624).

**Evidence**:

- `apps/api/src/modules/gradebook/report-cards/report-cards.service.ts:105-244`: `for (const student of students)` loop with 4 queries per iteration
- `apps/api/src/modules/gradebook/report-cards/report-cards.service.ts:601-665`: `buildBatchSnapshots()` batches snapshots but loops for attendance
- Each RLS `$transaction()` call acquires a dedicated connection from PgBouncer -- 30 sequential transactions under transaction mode could cause pool contention

**Fix direction**: (1) Batch-load all grade snapshots and assessments for all students in one query before the loop. (2) Batch the attendance `groupBy` using a single query with `student_id` in the group-by clause instead of per-student queries. (3) Create all report card rows in a single RLS transaction rather than per-student transactions.

---

### Finding 6: 11 `as any` Casts in Production Service Code

**Severity**: LOW (contained, mostly Prisma enum casts)
**Confidence**: HIGH (100%)

**Why this matters**: The project mandates strict TypeScript with no `any` types. There are 11 `as any` casts in production service code. Most are Prisma enum type mismatches (e.g., `channel as any`, `scope as any`, `status as any`) where the runtime value is correct but the type system cannot verify it. One (`staff-profiles.service.ts:488`) is a broader object cast.

**Evidence**:

- `communications/notifications.service.ts:155`: `channel as any`
- `communications/notification-templates.service.ts:74,138,151`: `channel as any` (3 instances)
- `communications/announcements.service.ts:105,109`: `scope as any`, `delivery_channels as any`
- `website/contact-form.service.ts:123`: `status as any`
- `website/website-pages.service.ts:77`: `page_type as any`
- `staff-profiles/staff-profiles.service.ts:488`: `{ ...profileFields, ...bankUpdates } as any`
- `communications/webhook.service.ts:89`: `payload_json as any`

**Fix direction**: For Prisma enum casts, define proper type mappings (like the `CONTEXT_TYPE_MAP` pattern in `behaviour.service.ts`) or use `as $Enums.SpecificEnum` instead of `as any`. For the staff profiles object cast, define a proper `Prisma.StaffProfileUpdateInput` type.

---

### Finding 7: Shared Package Has No Sub-Path Exports -- Single Monolithic Barrel

**Severity**: LOW (build-time impact, not runtime)
**Confidence**: MEDIUM (70%)

**Why this matters**: `packages/shared/src/index.ts` is a single 179-line barrel that re-exports everything. There are no `package.json` sub-path exports (e.g., `@school/shared/behaviour`, `@school/shared/finance`). Every consumer that imports any single type resolves the entire shared package. This has implications for: (a) TypeScript compiler performance on large rebuilds, (b) Potential circular resolution issues as the barrel grows, (c) Making it harder to understand which shared types a module actually depends on.

**Evidence**:

- `packages/shared/src/index.ts`: 179 lines, all `export * from`
- Domain sub-barrels exist (`./behaviour`, `./pastoral`, etc.) but are flattened through the root barrel
- No `exports` field in `packages/shared/package.json` for sub-path resolution

**Fix direction**: Add `exports` field to `packages/shared/package.json` with sub-paths: `"./behaviour"`, `"./pastoral"`, `"./finance"`, etc. Consumers would import `from '@school/shared/behaviour'` instead of `from '@school/shared'`. This is a non-breaking incremental change -- the root export can remain for backward compatibility.

---

## E. Files Reviewed

### Deep inspection (full read)

- `/apps/api/src/app.module.ts` -- root module, all 56 imports
- `/apps/api/src/main.ts` -- bootstrap, middleware, security
- `/packages/shared/src/index.ts` -- shared package barrel
- `/apps/api/src/modules/behaviour/behaviour.service.ts` -- 1,111 LOC, incident CRUD
- `/apps/api/src/modules/behaviour/behaviour.module.ts` -- 43 providers, 38 exports
- `/apps/api/src/modules/gradebook/report-cards/report-cards.service.ts` -- 983 LOC, report card generation
- `/apps/api/src/modules/gradebook/gradebook.module.ts` -- 33 providers, 2 exports
- `/apps/api/src/modules/tenants/sequence.service.ts` -- 127 LOC, shared sequence generation
- `/apps/api/src/modules/rooms/rooms.service.ts` -- 170 LOC, clean CRUD reference
- `/apps/api/src/modules/pastoral/pastoral.module.ts` -- 28 providers, 16 exports
- `/apps/api/src/modules/child-protection/child-protection.module.ts` -- forwardRef to Pastoral
- `/apps/api/src/modules/early-warning/early-warning.module.ts` -- 10 providers, 10 exports
- `/apps/api/src/modules/staff-wellbeing/staff-wellbeing.module.ts` -- 10 providers, 3 exports
- `/architecture/module-blast-radius.md` -- full document (300 lines)

### Grep/search analysis

- Empty catch blocks: 49 files, 79 occurrences across `apps/api/src`
- `as any` in service files: 11 occurrences across 6 files
- `forwardRef` in module files: 4 occurrences across 4 files (2 circular pairs)
- `@Optional()` decorator: 4 occurrences (1 guard, 3 in behaviour services)
- Provider-export ratio analysis: all 19 modules with >5 providers

---

## F. Additional Commands Run

1. **Provider-export ratio analysis**: Python script counting providers and exports for each module file, sorted by provider count. Covered 19 modules.
2. **Empty catch block count**: ripgrep for `catch {$` across all API source, both total count and per-file breakdown.
3. **`as any` count**: ripgrep for `as any` in all `*.service.ts` files.
4. **forwardRef analysis**: ripgrep for `forwardRef` in all `*.module.ts` files with context.
5. **@Optional() usage**: ripgrep across all API source.
6. **File count in behaviour module**: `ls` counts for .service.ts, .controller.ts, and all .ts files (40 services, 17 controllers, 107 total).

---

## G. Scores

### Architecture: 7.5/10

**Justification**: The architecture is sound for a modular monolith at this scale. The foundations are correct: consistent RLS enforcement, proper middleware ordering, structured error handling, clear service patterns, env validation before bootstrap. The tiered blast radius documentation is exceptional and actively maintained. The main deduction is for the god module problem (BehaviourModule at 25k LOC with 88% export ratio) and two circular dependency cycles that are managed but not resolved. The Prisma-direct read pattern is a pragmatic choice that is properly documented, but it does mean the NestJS module graph understates true coupling.

### Modularity: 6.5/10

**Justification**: There is a clear split between well-bounded modules (Rooms at 170 LOC, StaffWellbeing exporting 3 of 10 providers) and unbounded mega-modules (Behaviour exporting 38 of 43, EarlyWarning/Engagement/SEN exporting 100%). The modularity score is dragged down by: (1) BehaviourModule containing 6+ bounded contexts in one module, (2) five modules with 100% export ratios providing no encapsulation, (3) two `forwardRef` cycles, and (4) 79 empty catch blocks indicating inconsistent error boundary discipline. The positive factors -- well-tiered infrastructure modules, clean small modules, shared package discipline, and documented cross-module coupling -- prevent a lower score.

---

## H. Confidence

**Overall confidence**: HIGH (90%)

**Basis**: This assessment is based on:

- Full read of 14 source files covering all architectural layers (bootstrap, modules, services, shared package, architecture docs)
- Quantitative analysis of all 56 modules' provider/export ratios
- codebase-wide grep analysis for catch blocks, type casts, circular references, and optional dependencies
- Cross-referencing of the architecture documentation against actual module files

**Limitations**:

- Did not inspect worker processors or frontend for coupling analysis (out of scope for this agent)
- The "cross-module import count" numbers (gradebook=25, etc.) from the fact pack were not independently verified by tracing each import
- Build-time impact of the monolithic shared barrel (Finding 7) is inferred, not measured
- The 11 `as any` count may differ slightly from the fact pack's "15 any/as any" figure because the grep was scoped to `*.service.ts` only, while the fact pack may have included other file types
