# Architecture & Module Boundaries Review

## A. Facts

- The canonical fact pack records `59` API modules. Its largest API modules by non-spec TypeScript lines are `behaviour` (`23,540`), `pastoral` (`19,479`), and `gradebook` (`15,229`). Its highest cross-module relative-import hotspots are `gradebook` (`32`), `pastoral` (`22`), `staff-wellbeing` (`21`), `gdpr` (`21`), and `behaviour` (`20`).
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts` is a flat composition root. A targeted count over its `imports` array returned `61` entries, and the file wires infrastructure plus almost every domain module directly into one root Nest module.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts` is comparatively small and focused on bootstrap concerns: env validation, security middleware, CORS, global filters/interceptors, Swagger, and shutdown hooks.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json` defines coarse package-level tasks only: `build`, `dev`, `lint`, `type-check`, `test`, and `test:changed`. `type-check` and `test` both depend on `^build`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts` is a `192`-line top-level barrel with `119` export statements. It re-exports constants, types, schemas, AI utilities, multiple domain namespaces (`behaviour`, `pastoral`, `sen`, `staff-wellbeing`, `gdpr`, `security`, `regulatory`, `early-warning`, `engagement`) and scheduler runtime functions (`validateSchedule`, `solveV2`, `checkHardConstraintsV2`).
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md` documents `BehaviourModule` as exporting `28` services, exposing `17` controllers and `214` endpoints, and reading many foreign tables directly via Prisma, including `students`, `student_parents`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `tenant_settings`, `staff_profiles`, and `notifications`.
- The same blast-radius document records `PastoralModule` as exporting `17` services, using `forwardRef(() => ChildProtectionModule)`, and directly reading `students`, `student_parents`, `class_enrolments`, `class_staff`, `staff_profiles`, `tenant_settings`, `behaviour_incidents`, `behaviour_sanctions`, and `safeguarding_concerns`.
- The same blast-radius document marks `PermissionCacheService` as critical global blast radius, and marks `GdprTokenService`, `AiAuditService`, and `ConsentService` as cross-cutting services consumed by several modules.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts` is `1,078` lines. A targeted method scan found `14` public async methods. The service depends on `PrismaService`, `SequenceService`, `BehaviourHistoryService`, optional `BehaviourDocumentService`, and `BehaviourSideEffectsService`. It auto-generates documents, emits parent notifications, auto-enqueues exclusion creation, reads `tenantSetting`, queries `schedule`, and uses `schoolClosure` lookups for suspension-day calculations.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts` is `654` lines. It depends on `PrismaService` and `RedisService`, caches results in Redis, and directly reads `classStaff`, `assessment`, `periodGradeSnapshot`, and `class`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts` is `1,128` lines. It contains token signing and verification, Redis session CRUD, brute-force tracking, login, refresh, logout, password reset, MFA setup/verification/recovery, tenant switching, `/me`, and session listing/revocation. It depends on `RedisService`, `PrismaService`, `SecurityAuditService`, `EncryptionService`, and `runWithRlsContext`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-calendar.service.ts` is `194` lines. It has one constructor dependency (`PrismaService`) and stays focused on CRUD plus default-event seeding for `regulatoryCalendarEvent`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md` still describe active architectural risks around Prisma-direct cross-module queries, academic-period-close cron side effects, permission cache invalidation, and encryption changes.

## B. Strong Signals

- The largest modules are not only large by line count; they also expose large public service/controller surfaces and own queues, state machines, and side effects at the same time.
- Cross-module integration is still dominated by direct Prisma reads of foreign tables rather than narrow module-owned read APIs.
- Core platform capabilities are centralized in a few high-risk places: `AppModule`, `AuthService`, the global permission cache, and GDPR services.
- `packages/shared` is acting as an omnibus dependency surface for contracts and runtime logic, not just shared DTO/schema contracts.
- Cleaner module shapes exist in the codebase. The sampled regulatory service is materially narrower in responsibility and dependency footprint than the hotspot services.

## C. Inferences

- The repository is a modular monolith in packaging and deployment shape, but its module boundaries are only partially enforced. Documentation carries more of the boundary contract than the code does.
- The architecture risk is concentrated less in bootstrap and more in a few domain/platform hotspots where orchestration, policy, state transitions, and side effects have accumulated in single services.
- The most realistic extraction path is internal decomposition first: split large modules and `packages/shared` into narrower in-monolith packages or facades before considering any service extraction.

## D. Top Findings

### 1. Behaviour and pastoral are operating as sub-platforms inside single modules
- Severity: High
- Confidence: High
- Why it matters: These modules are large enough that a change in one workflow can have hidden effects across documents, notifications, queues, state machines, and adjacent safeguarding or child-protection flows. That raises refactor risk and makes ownership boundaries fuzzy.
- Evidence: The fact pack lists `behaviour` at `23,540` lines and `pastoral` at `19,479`. The blast-radius document lists `BehaviourModule` at `28` exported services, `17` controllers, and `214` endpoints, and `PastoralModule` at `17` exported services with a `forwardRef` to `ChildProtectionModule`. The sampled `behaviour-sanctions.service.ts` alone mixes sanction creation, approval-state decisions, history, document generation, parent notification dispatch, exclusion-case triggering, conflict detection, and school-closure-aware suspension calculations.
- Fix direction: Break these modules into tighter internal bounded contexts with thin module facades. For behaviour, obvious seams are sanctions, safeguarding, documents, parent-facing flows, analytics, and admin. For pastoral, seams are concerns/cases, meetings/referrals, notifications, reporting, and DSAR/export.

### 2. Direct Prisma reads are still the main boundary leak
- Severity: High
- Confidence: High
- Why it matters: Schema coupling is broader than the Nest import graph suggests. A table change can break multiple modules that do not import each other and therefore are hard to reason about through the DI graph alone.
- Evidence: `danger-zones.md` keeps `DZ-02` active. `module-blast-radius.md` includes a long table of foreign-table consumers for `staff_profiles`, `students`, `classes`, `academic_periods`, `attendance_records`, `grades`, and other tables. The sampled `gradebook/analytics.service.ts` reads `classStaff`, `class`, `assessment`, and `periodGradeSnapshot` directly. The sampled `behaviour-sanctions.service.ts` reads `tenantSetting`, `schedule`, and `schoolClosure` directly in addition to behaviour-owned tables.
- Fix direction: Expand the `ReportsDataAccessService` pattern into owned read facades for the highest-shared tables first: `students`, `staff_profiles`, `classes/class_enrolments`, and `academic_periods/academic_years`. Treat direct Prisma access to foreign tables as an exception path that needs explicit review.

### 3. `AuthService` is a core-path god service
- Severity: High
- Confidence: High
- Why it matters: Authentication changes are already high stakes. Concentrating token logic, Redis session state, brute-force controls, password reset, MFA, tenant switching, and user-session APIs in one `1,128`-line service increases regression risk and makes targeted change review harder.
- Evidence: `auth.service.ts` contains token signing/verification, session CRUD, brute-force tracking, login, refresh, logout, password reset, MFA setup and verification, recovery-code login, tenant switching, `/me`, and session listing/revocation. It also coordinates Redis, Prisma, security audit logging, encryption, and bootstrap RLS reads.
- Fix direction: Split AuthModule internally into focused services such as token/signing, session store, credential verification, MFA, password reset, and tenant-context switching. Keep the controller-facing facade thin.

### 4. The root composition is broad and mostly flat
- Severity: Medium
- Confidence: High
- Why it matters: A modular monolith can have one root module, but when that root directly wires almost every domain peer-to-peer, the higher-level architecture becomes implicit. That makes it harder to communicate and enforce larger slices of the system.
- Evidence: `app.module.ts` wires `61` entries into one root `imports` array. The root module directly composes infrastructure, cross-cutting services, and nearly every business domain module instead of grouping them into a smaller number of higher-level slices.
- Fix direction: Introduce internal composition layers such as platform-core, student-lifecycle, academics, wellbeing/safeguarding, and finance/ops modules. This does not require microservices; it gives the monolith a clearer topography.

### 5. `packages/shared` has crossed from shared contracts into shared runtime sprawl
- Severity: Medium
- Confidence: High
- Why it matters: A single broad barrel lowers friction for accidental coupling. When schemas, domain utilities, AI helpers, security code, regulatory exports, and solver runtime all flow through the same top-level package, dependency direction becomes easier to blur.
- Evidence: `packages/shared/src/index.ts` has `119` exports and re-exports both contract-style artifacts and runtime/domain modules, including AI utilities, domain entrypoints, and solver functions like `solveV2`.
- Fix direction: Narrow the top-level shared entrypoint to stable contracts. Move runtime-heavy or domain-heavy exports behind explicit subpath entrypoints or separate packages, such as contracts, domain utilities, and scheduler runtime.

### 6. The documented danger zones still map to current structure
- Severity: Medium
- Confidence: Medium
- Why it matters: These are not stale warnings; they describe live architectural fault lines. Ignoring them during change work would still be dangerous.
- Evidence: `DZ-02` matches the sampled direct-Prisma pattern and the blast-radius consumer tables. `state-machines.md` and `event-job-catalog.md` still show academic period closure triggering later cron work, matching `DZ-06`. `module-blast-radius.md` still marks `PermissionCacheService` as critical global blast radius, matching `DZ-08`. `auth.service.ts` still depends on `EncryptionService` for MFA secret handling, matching `DZ-09`.
- Fix direction: Convert the most important danger zones into executable architecture checks where possible: boundary tests for foreign-table access, dependency checks for known circulars, and regression tests around permission-cache invalidation and encryption compatibility.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-calendar.service.ts`

## F. Additional Commands Run

```bash
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/state-machines.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts'
sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/turbo.json'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts'
rg -n "^### GradebookModule|^### AuthService|^### ReportsModule|^### RegulatoryModule|^### CommonModule|^### GdprModule|^### PastoralModule|^### StaffWellbeingModule" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 10
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 10
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/reports' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/common' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
rg -n "Gradebook|Pastoral|Gdpr|ReportsDataAccessService|PermissionCacheService|BehaviourModule|StaffWellbeingModule" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
find '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral' -name '*.service.ts' -print0 | xargs -0 wc -l | sort -nr | head -n 12
rg -n "^\s{4}[A-Za-z][A-Za-z0-9]*Module,|^\s{4}BullModule|^\s{4}SentryModule|^\s{4}ThrottlerModule|^\s{4}ConfigModule,|^\s{4}PrismaModule,|^\s{4}RedisModule,|^\s{4}CommonModule,|^\s{4}HealthModule," '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts' | wc -l
rg -c '^export' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'
sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-calendar.service.ts'
rg -n '^\s*(async )?[A-Za-z0-9_]+\(' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
rg -n '^\s*(async )?[A-Za-z0-9_]+\(' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts'
rg -n '^\s*(async )?[A-Za-z0-9_]+\(' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'
sed -n '260,620p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
sed -n '260,620p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts'
sed -n '260,620p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'
sed -n '280,410p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md'
sed -n '620,760p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts'
sed -n '620,980p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
sed -n '620,1100p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'
rg -n 'checkAutoCreateExclusionCase|createAmendmentNotice|buildClosureChecker|documentService|emitSanctionParentNotification|tenantSetting|schedule.findMany' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
rg -n 'classStaff|assessment.findMany|periodGradeSnapshot|class.findMany|RedisService|getClient\(' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts'
rg -n 'EncryptionService|SecurityAuditService|RedisService|runWithRlsContext|passwordResetToken|mfaRecoveryCode|tenantMembership|user_sessions|JWT_SECRET|JWT_REFRESH_SECRET' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'
rg -n 'createRlsClient|DEFAULT_CALENDAR_EVENTS|regulatoryCalendarEvent' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/regulatory/regulatory-calendar.service.ts'
sed -n '980,1088p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts'
wc -l '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/index.ts'
test -f '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/subagent-01-architecture_02-04-2026.md' && echo exists || echo missing
```

## G. Score

- Score: `5.5/10`
- Justification: The repository has a real modular-monolith skeleton: discrete modules, strong documented architecture, consistent RLS patterns, and some genuinely cohesive areas. The downside is that several important boundaries are porous in practice: hotspot modules are very large, Prisma-direct cross-module reads remain widespread, core services are highly centralized, and `packages/shared` is overly broad. That places the codebase in the “mixed health” band where extension is still feasible, but significant refactors require care and strong context.

## H. Confidence in this review

- Confidence: Medium
- What limited certainty: I relied on the fact pack for repo-wide inventory and only sampled the targeted root files plus four representative services. I did not generate a fresh full dependency graph, inspect every hotspot module file, or trace worker implementations beyond the documented architecture files.
