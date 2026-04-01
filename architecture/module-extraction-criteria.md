# Module Extraction Criteria

> **Purpose**: Define the conditions under which a module could be extracted from the monolith into an independent service, and the process for doing so.
> **Audience**: Future engineering decision-making. This document is planning guidance, not an action plan.
> **Context**: The monolith is the correct architecture now. At two tenants, extraction carries far more cost than benefit. This document exists so the decision is made deliberately when the time comes, not reactively under pressure.
> **Last verified**: 2026-04-01

---

## Part 1 — Extraction Readiness Checklist

A module must satisfy ALL of the following before extraction is considered. Each item is a hard gate, not a suggestion.

### 1.1 Dependency Isolation

- [ ] **Zero `forwardRef()` usage** — the module has no circular dependency with any other module. Circular dependencies cannot survive extraction; the cycle must be broken first (see DZ-07, DZ-35).
- [ ] **All inbound dependencies go through the public API** — other modules only interact through the module's NestJS `exports` array (barrel re-exports + `exports: [MyService]`). No other module imports this module's internal service files directly.
- [ ] **No direct Prisma reads to foreign tables** — the module reads data from other modules' tables only via service calls or API calls, not via `this.prisma.foreignTable.findMany()`. The cross-module Prisma bypass pattern documented in `module-blast-radius.md` must be fully eliminated for the candidate module before extraction is safe.

### 1.2 Data Ownership

- [ ] **The module owns its tables exclusively** — no other module writes to this module's database tables. Read-only Prisma direct access from other modules is acceptable and can be replaced with API calls post-extraction; write access from other modules is a data ownership violation that must be resolved first.
- [ ] **Tables can be cleanly separated** — the module's tables do not have foreign key constraints that reference tables in other modules, OR those constraints are soft (application-enforced, not database-enforced) and can be converted to event-driven eventual consistency.

### 1.3 Async Communication

- [ ] **All BullMQ job payloads are self-contained** — job payloads include all data needed for processing. A job must not need to perform DB lookups to other modules' tables in order to process. Every `tenant_id` is included per the existing convention.
- [ ] **Synchronous inter-module calls have been replaced with async** — any `ModuleA.service.methodX()` call that crosses the extraction boundary has been converted to a BullMQ job or an HTTP API call.

### 1.4 Test Coverage

- [ ] **Line coverage >80%** — measured by the Jest coverage report for the module's source files.
- [ ] **Contract test suite exists** (`*.contract.spec.ts`) — tests that verify the module's public API contract: input shapes, output shapes, error codes, and permission gates. These tests must pass without any knowledge of the module's internals.
- [ ] **RLS leakage tests exist** — at least one test per tenant-scoped table verifying Tenant B cannot read Tenant A's data.

### 1.5 Documentation

- [ ] **README exists in the module directory** — documents: public service API (exported methods + signatures), queue names + job types the module owns, permission keys, tenant module key (if applicable), and known cross-module dependencies.

---

## Part 2 — Extraction Process

Extraction is a multi-step process, not a big-bang deployment. Each step can be done incrementally and validated before moving to the next.

### Step 1: Achieve Zero Direct Prisma Reads Across the Boundary

For every table the candidate module reads from another module, replace the Prisma query with a service call (still in-process at this stage). This is the most labour-intensive step but the one that validates the boundary is real.

This step is already partially done for reports/dashboard via `ReportsDataAccessService`. That pattern is the model.

### Step 2: Replace Synchronous Cross-Boundary Calls with Async

Any in-process service call across the boundary becomes a BullMQ job or an HTTP API call. Use BullMQ for fire-and-forget side effects. Use HTTP only for request-response flows where the caller must block for a result.

The existing BullMQ infrastructure (one queue per domain, `TenantAwareJob` base class) already supports this pattern. New queues should follow the same naming convention: `kebab-case` queue name, `module:action` job name.

### Step 3: Create API Gateway Routes for the New Service

The new service will expose its own HTTP API. The NestJS monolith becomes a proxy for requests targeting the extracted service — either via an Nginx upstream or an API gateway layer. All existing API clients continue to hit the same URLs; routing is invisible to them.

At this stage, the module still runs as part of the monolith but its API is also exposed by the standalone service. Both are live simultaneously, allowing canary testing.

### Step 4: Migrate Database Tables to a Separate Schema or Database

This is the highest-risk step. It requires:

1. Provisioning a new PostgreSQL database (or schema) for the extracted service.
2. Running a live migration — replicating data to the new location while both systems are running.
3. Updating all consumers to point to the new data source.
4. Disabling writes to the old location and verifying replication is consistent.
5. Dropping the old tables once both the monolith and the new service have confirmed correct operation.

RLS policies must be recreated in the new database. The `TenantAwareJob` pattern must be preserved.

### Step 5: Deploy as an Independent Service with Its Own CI/CD

The extracted service gets its own Dockerfile, its own deploy workflow in `.github/workflows/`, and its own PM2 process entry on the server. Health checks, monitoring, and restart policies must be configured before the monolith's proxy is pointed at the live service.

---

## Part 3 — Module Readiness Assessment

Based on the current codebase state as of 2026-04-01.

### GREEN — Ready for Extraction (after meeting remaining criteria)

These modules have no circular dependencies and are either already self-contained or close to it. They would need test coverage verification and a README before extraction, but no architectural restructuring.

| Module                  | Why Green                                                                                                        | Remaining gaps                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RoomsModule`           | No downstream dependents. Only consumed by SchedulesModule as a read. No circular deps. Owns its tables.         | Test coverage unknown, no contract tests, no README.                                                                                                                               |
| `HealthModule`          | No DB, no tenant scope, no consumers. Pure infrastructure endpoint.                                              | Trivial to extract; questionable value in doing so.                                                                                                                                |
| `PreferencesModule`     | No downstream dependents. No circular deps.                                                                      | Test coverage and contract tests needed.                                                                                                                                           |
| `ParentInquiriesModule` | No downstream dependents. No circular deps.                                                                      | Prisma-direct read of `students` must be replaced. Test coverage unknown.                                                                                                          |
| `WebsiteModule`         | No downstream dependents. No circular deps. Primarily read-only content.                                         | Test coverage unknown.                                                                                                                                                             |
| `HomeworkModule`        | No external consumers. Imports only `AuthModule`, `S3Module`, `BullModule`. No circular deps. Owns its 6 tables. | Cross-module Prisma reads (`classes`, `students`, `subjects`, `academic_periods`, `student_parents`) must be replaced with service calls. Test coverage and contract tests needed. |

### YELLOW — 1-2 Blockers

These modules are structurally sound but have specific issues that must be resolved before extraction.

| Module                    | Blocker(s)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StaffWellbeingModule`    | (1) `survey_responses` has no `tenant_id` and no RLS — the anonymity-by-design constraint is incompatible with naive extraction since tenant isolation becomes the extracted service's responsibility entirely (see DZ-27). (2) Heavy Prisma-direct reads from `schedules`, `substitution_records`, `staff_profiles`, `compensation_records` must be replaced with service calls.                                                                        |
| `RegulatoryModule`        | (1) Extensive cross-module Prisma-direct reads (11 foreign tables: `students`, `daily_attendance_summaries`, `attendance_records`, `behaviour_sanctions`, `behaviour_exclusion_cases`, `staff_profiles`, `subjects`, `classes`, `class_enrolments`, `ppod_student_mappings`, `ppod_sync_logs`, `attendance_pattern_alerts`). These must all become service calls or API reads. (2) No downstream consumers — extraction would not unblock anything else. |
| `ComplianceModule` (GDPR) | (1) `DsarTraversalService` reads ~20 Prisma models across all modules — this is a cross-cutting concern by design and may not be extractable without a full data-mesh API layer. (2) `DpaAcceptedGuard` is registered as a global `APP_GUARD` — extracting the guard's dependency means the monolith must call the extracted service on every request (see DZ-30). (3) High blast radius: every tenant-scoped API surface is gated by this module.       |
| `SecurityIncidentsModule` | (1) Reads `audit_logs` via Prisma direct for anomaly detection — `audit_logs` is owned by `AuditLogModule`. (2) Platform-level (no tenant scope), which makes the standard RLS/tenant extraction pattern inapplicable without modification.                                                                                                                                                                                                              |

### RED — Significant Work Needed

These modules have circular dependencies, deep Prisma-direct coupling, or are too central to the monolith to extract without restructuring significant parts of the codebase.

| Module                                                  | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BehaviourModule`                                       | (1) Circular dependency: `PolicyEngineModule` ↔ `BehaviourModule` via `forwardRef()`. (2) Reads 16+ foreign tables via Prisma direct (`students`, `student_parents`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `subjects`, `rooms`, `schedules`, `tenant_settings`, `users`, `staff_profiles`, `parents`, `year_groups`, `notifications`, `behaviour_publication_approvals`). (3) 214 endpoints, 16 worker processors, 18+ queued job types — very high coordination surface. (4) Heavy coupling to `ApprovalsModule`, `PdfRenderingModule`, `S3Module`, `SequenceModule`. See module-blast-radius.md for full dependency inventory. |
| `PastoralModule`                                        | (1) Circular dependency with `ChildProtectionModule` via `forwardRef()` — the cycle exists because each module must call the other during escalation/linking flows (see DZ-35). (2) 17 exported services, 14 controllers. (3) Cross-module Prisma reads of `behaviour_incidents`, `behaviour_sanctions`, `safeguarding_concerns`, `class_enrolments`, `class_staff`, `student_parents`.                                                                                                                                                                                                                                                                             |
| `ChildProtectionModule`                                 | (1) Same circular dependency as PastoralModule — inseparable until that cycle is broken. (2) CP records are meaningless without pastoral concern context.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `FinanceModule`                                         | (1) RegistrationModule creates invoices via `InvoicesService` — tight coupling across two domains. (2) Approval callback chain routes through `ApprovalsModule` which enqueues finance jobs. (3) The parent portal reads invoice/payment data via Prisma direct. (4) Finance tables are among the most widely read across modules (`invoices`, `payments` queried by reports, dashboard, parent portal, compliance).                                                                                                                                                                                                                                                |
| `GdprModule`                                            | (1) `GdprTokenService` is consumed by 10 AI services across 4 modules — it is a cross-cutting infrastructure service, not a domain module. (2) `DpaAcceptedGuard` gates every tenant-scoped API surface. (3) `ConsentService` is called synchronously on the request path by CommunicationsModule and GradebookModule — extraction would require these calls to become synchronous API calls with all associated latency and failure modes.                                                                                                                                                                                                                         |
| `PrismaService` / `SequenceService` / `SettingsService` | These are shared infrastructure. They should never be extracted — they belong in the shared service layer of any future service mesh.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## Part 4 — Anti-Patterns to Avoid

### Do not extract a module that has heavy cross-module Prisma reads

The cross-module Prisma bypass pattern documented in `danger-zones.md` (DZ-02) means many modules read foreign tables directly without going through a service API. Extracting such a module converts these silent compile-time dependencies into runtime network calls — and every schema change in the source module now becomes a contract change across a network boundary.

The risk of missed updates is higher, not lower, after extraction. Resolve DZ-02 for the candidate module first.

### Do not extract a module involved in a circular dependency

`forwardRef()` circular dependencies (DZ-07: Classes ↔ Schedules, DZ-35: Pastoral ↔ ChildProtection) cannot survive extraction. The cycle must be broken by introducing a shared event (BullMQ) or a shared mediator module before any extraction begins.

### Do not extract before establishing a service mesh or API gateway

Without a gateway layer, extracted services require the monolith to know each service's hostname. This creates a N-to-N configuration problem. The first extraction should include building the gateway infrastructure — an Nginx upstream configuration or a lightweight NestJS gateway — so that subsequent extractions are incremental configuration changes, not code changes.

### Do not extract during active feature development in the module

If a module is actively being iterated on (new endpoints, schema changes, requirement changes), an extraction mid-cycle doubles the places where changes must be applied. Wait for a stable release point.

### Do not extract for its own sake

The monolith is the right architecture for this system at its current scale (2 tenants, ~288k LOC, single-team). Extraction is justified when:

- A specific module's resource profile (CPU, memory, connection pool) would benefit from independent scaling
- A module needs a different deployment cadence or SLA than the rest of the system
- Team structure has grown to the point where independent ownership boundaries are operationally valuable

None of these conditions apply at current scale. This document is preparation, not a roadmap.

---

## Part 5 — References

- `architecture/module-blast-radius.md` — cross-module dependency inventory; consult before any extraction planning
- `architecture/danger-zones.md` — DZ-02 (Prisma bypass), DZ-07 (Classes ↔ Schedules circular), DZ-27 (survey_responses no RLS), DZ-30 (DPA guard allowlist), DZ-35 (Pastoral ↔ CP circular)
- `architecture/event-job-catalog.md` — BullMQ job flows; the async communication pattern that would replace synchronous calls post-extraction
- `CLAUDE.md` — RLS conventions, BullMQ job payload requirements, `TenantAwareJob` base class contract
