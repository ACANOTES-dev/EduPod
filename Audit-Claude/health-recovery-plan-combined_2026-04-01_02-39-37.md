# Combined Health Recovery Plan

**Date**: 2026-04-01
**Baseline**: Overall Health 6.8/10
**Target**: Overall Health 9.5+/10
**Sources**: Audit-Claude + Audit-GPT health recovery plans (merged, deduplicated)
**Scope**: All scorecard dimensions except Frontend Test Health (deferred)

---

## Column Key

- **Phase**: A (critical ops) → B (security+monitoring) → C (tests+quality) → D (architecture) → E (polish)
- **Parallel Group**: Items sharing the same group letter+number within a section can be executed simultaneously by separate agents without code conflicts. Items in different groups touch overlapping files and must be sequenced.
- **Model**: `Opus` = requires Opus 4.6 (complex reasoning, cross-cutting, security-critical). `Sonnet` = Sonnet 4.6 is capable (pattern-following, additive, config, docs, isolated tests).

---

## 1. Security (8.5 → 9.5)

| #    | Action                                                                                                                                                                                         | Phase | Parallel | Model  | Severity |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| S-01 | **Add `FORCE ROW LEVEL SECURITY` to `attendance_pattern_alerts`** — create migration, add FORCE, rename policy to `attendance_pattern_alerts_tenant_isolation`.                                | A     | S-a1     | Sonnet | Medium   |
| S-02 | **Add global API rate limiting via `@nestjs/throttler`** — register as global guard with sensible defaults (100/min/IP). Keep existing per-endpoint limits.                                    | A     | S-a2     | Sonnet | Medium   |
| S-03 | **Canonicalize all RLS policies into `policies.sql`** — add the 4 inline-only tables. Document convention: every table's RLS catalogued in policies.sql.                                       | B     | S-b1     | Sonnet | Low      |
| S-04 | **Create automated RLS catalogue audit script** — `scripts/audit-rls.ts` extracts all Prisma models with tenant_id, converts to snake_case, compares against all RLS sources. Run in CI.       | B     | S-b2     | Opus   | Medium   |
| S-05 | **Tighten CORS to HTTPS-only in production** — change regex from `https?` to `https` when `NODE_ENV === 'production'`.                                                                         | B     | S-b3     | Sonnet | Low      |
| S-06 | **Add partition name validation** — assert table/partition names match `/^[a-z_][a-z0-9_]*$/` before DDL interpolation in `partition-maintenance.processor.ts`.                                | B     | S-b4     | Sonnet | Low      |
| S-07 | **Type the `tx: any` in `invitations.service.ts`** — replace with `Prisma.TransactionClient`.                                                                                                  | B     | S-b5     | Sonnet | Low      |
| S-08 | **Add `refund` to canonical `SEQUENCE_TYPES`** — prevent future validation from breaking refund number generation (DZ-04).                                                                     | B     | S-b6     | Sonnet | Medium   |
| S-09 | **Add integration test for `gdpr_anonymisation_tokens` non-exposure** — verify no API endpoint or DSAR export returns rows from this table.                                                    | C     | S-c1     | Opus   | High     |
| S-10 | **Add integration test for `survey_responses` tenant isolation** — create as Tenant A, query as Tenant B, assert zero.                                                                         | C     | S-c2     | Opus   | High     |
| S-11 | **Verify all password-setting paths enforce `min(8)`** — audit registration, invitation, admin set, password reset. Add test per path.                                                         | B     | S-b7     | Opus   | Medium   |
| S-12 | **Add Content-Security-Policy header** — configure Helmet CSP with strict defaults, exceptions for Sentry/Stripe/CDN.                                                                          | B     | S-b3     | Sonnet | Medium   |
| S-13 | **Add `Permissions-Policy` header** — disable unused browser features: camera, microphone, geolocation, payment.                                                                               | B     | S-b3     | Sonnet | Low      |
| S-14 | **Add security headers integration test** — assert presence and values of HSTS, CSP, X-Content-Type-Options, X-Frame-Options, Permissions-Policy.                                              | C     | S-c3     | Sonnet | Low      |
| S-15 | **Add `pnpm audit` to CI** — fail on high/critical vulnerabilities.                                                                                                                            | B     | S-b8     | Sonnet | Medium   |
| S-16 | **Add secret scanning to CI** — trufflehog or gitleaks step to catch committed credentials.                                                                                                    | B     | S-b9     | Sonnet | Medium   |
| S-17 | **Run application DB role as non-superuser, non-BYPASSRLS** — verify the Prisma connection user cannot bypass RLS. If it can, create a restricted role. _(GPT)_                                | A     | S-a3     | Opus   | Critical |
| S-18 | **Add startup assertion that DB role cannot bypass RLS** — query `pg_roles` at bootstrap, exit if `rolbypassrls = true`. _(GPT)_                                                               | A     | S-a3     | Opus   | Critical |
| S-19 | **Encrypt MFA TOTP secrets at rest** — use existing `EncryptionService` or KMS wrapper. Currently stored as plaintext in the database. _(GPT)_                                                 | B     | S-b10    | Opus   | High     |
| S-20 | **Migrate existing MFA secrets to encrypted format** — write a one-time migration that encrypts all existing TOTP secrets. _(GPT)_                                                             | B     | S-b10    | Opus   | High     |
| S-21 | **Add CI tests exercising critical flows under non-bypass DB role** — run RLS integration tests with the restricted role to verify isolation holds. _(GPT)_                                    | C     | S-c4     | Opus   | High     |
| S-22 | **Create secret inventory and rotation schedule** — document all runtime secrets, encryption keys, provider credentials. Define rotation cadence per secret class. _(GPT)_                     | B     | S-b11    | Sonnet | Medium   |
| S-23 | **Require security design review for new critical features** — gate finance, payroll, GDPR, and control-plane feature PRs on a security review checklist. _(GPT)_                              | E     | S-e1     | Sonnet | Medium   |
| S-24 | **Expand audit logging to all privileged admin actions** — ensure role changes, permission edits, tenant config changes, and DPA acceptance are all logged via `SecurityAuditService`. _(GPT)_ | C     | S-c5     | Opus   | Medium   |

---

## 2. Reliability (7.0 → 9.5)

| #    | Action                                                                                                                                                                                                  | Phase | Parallel | Model  | Severity |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| R-01 | **Add Sentry to worker service** — create `apps/worker/src/instrument.ts` mirroring API. Add global BullMQ error handler reporting to Sentry.                                                           | A     | R-a1     | Sonnet | Critical |
| R-02 | **Replace all empty `catch {}` blocks with logged catches** — codemod across `apps/`. Prioritize behaviour.service.ts (4), concern.service.ts (6), all worker catches.                                  | A     | R-a2     | Sonnet | High     |
| R-03 | **Implement real worker health check** — replace stub with PostgreSQL, Redis, BullMQ connection, and queue depth checks. Return 503 if Postgres/Redis down.                                             | A     | R-a3     | Sonnet | High     |
| R-04 | **Expand API BullMQ health check to all critical queues** — inject and check: notifications, behaviour, pastoral, compliance, finance. Report stuck jobs per queue.                                     | B     | R-b1     | Sonnet | Medium   |
| R-05 | **Add `VALID_TRANSITIONS` map for `PayrollRunStatus`** — create in `packages/shared`, wire into service, test all valid + blocked transitions.                                                          | C     | R-c1     | Sonnet | Medium   |
| R-06 | **Add `VALID_TRANSITIONS` map for `PaymentStatus`** — same pattern in `packages/shared`.                                                                                                                | C     | R-c2     | Sonnet | Medium   |
| R-07 | **Add `VALID_TRANSITIONS` map for `ComplianceRequestStatus`** — same pattern.                                                                                                                           | C     | R-c3     | Sonnet | Medium   |
| R-08 | **Add forward-only constraint for SEN referral status** — prevent backward transitions.                                                                                                                 | C     | R-c4     | Sonnet | Medium   |
| R-09 | **Reduce safeguarding escalation backstop to 1 hour** — change `pastoral:overdue-actions` cron to hourly for critical/safeguarding concerns. Keep daily for non-critical.                               | B     | R-b2     | Sonnet | High     |
| R-10 | **Add dead-letter queue monitoring cron** — every 15 min, count DLQ depth across all 20 queues. Log + Sentry alert if non-zero.                                                                         | B     | R-b3     | Sonnet | Medium   |
| R-11 | **Stagger cron schedules in 02:00-04:00 UTC window** — spread heavy jobs across 01:30-03:30 to reduce concurrent PostgreSQL load.                                                                       | B     | R-b4     | Sonnet | Low      |
| R-12 | **Fix non-atomic `shareConcernWithParent`** — merge two `$transaction` blocks into single atomic transaction in concern.service.ts.                                                                     | B     | R-b5     | Opus   | Medium   |
| R-13 | **Add `automation_failed` flag to behaviour incidents** — set flag on queue-add failure, surface in UI for manual retry.                                                                                | D     | R-d1     | Opus   | Medium   |
| R-14 | **Move document generation out of DB transactions** — create placeholder in transaction, enqueue BullMQ job for Puppeteer PDF (DZ-19).                                                                  | D     | R-d2     | Opus   | Medium   |
| R-15 | **Add circuit breaker for external services** — implement for Anthropic AI, Resend, Twilio, Stripe API calls. Fail fast when service is down.                                                           | E     | R-e1     | Opus   | Low      |
| R-16 | **Standardize error context in all NestJS exception throws** — ensure all include `code` (UPPER_SNAKE) + `message` (human-readable with entity context).                                                | D     | R-d3     | Sonnet | Low      |
| R-17 | **Add behaviour notification reconciliation cron** — daily 05:00, scan for incidents with `parent_notification_status = 'pending'` older than 4h, re-enqueue.                                           | B     | R-b6     | Sonnet | Medium   |
| R-18 | **Introduce claim/lease state for notifications before dispatch** — notifications enter `claimed` status before enqueue, preventing double-dispatch under concurrency. _(GPT)_                          | D     | R-d4     | Opus   | Medium   |
| R-19 | **Add idempotency keys for outbound notification sends** — prevent duplicate SMS/email/WhatsApp sends on retry. _(GPT)_                                                                                 | D     | R-d5     | Opus   | Medium   |
| R-20 | **Add BullMQ `timeout` settings for critical worker queues** — prevent processors from running indefinitely. Set per-queue timeouts. _(GPT)_                                                            | B     | R-b7     | Sonnet | Medium   |
| R-21 | **Make approval creation + domain-state transition atomic everywhere** — ensure approval request creation and the entity state change happen in one transaction. _(GPT)_                                | D     | R-d6     | Opus   | High     |
| R-22 | **Add uniqueness guard for duplicate approval requests** — prevent multiple open approval requests for same entity/action/tenant combination. _(GPT)_                                                   | D     | R-d6     | Opus   | Medium   |
| R-23 | **Persist per-tenant cron failures to durable state** — log failures to a `cron_execution_log` table, not just console. Enables monitoring and alerting. _(GPT)_                                        | D     | R-d7     | Opus   | Medium   |
| R-24 | **Move ALL external provider sends out of Prisma transactions** — not just Puppeteer (R-14), but also Resend email, Twilio SMS, Anthropic AI calls. _(GPT)_                                             | D     | R-d8     | Opus   | Medium   |
| R-25 | **Add synthetic canary jobs in production** — scheduled job that enqueues a no-op canary through each critical queue, verifies execution, and alerts if the canary doesn't complete within SLA. _(GPT)_ | E     | R-e2     | Opus   | Low      |
| R-26 | **Add replay/reconciliation tooling for stuck approval callbacks** — admin endpoint or script to manually re-enqueue failed callbacks with audit trail. _(GPT)_                                         | D     | R-d9     | Opus   | Medium   |

---

## 3. Architecture (7.5 → 9.5)

| #    | Action                                                                                                                                                             | Phase | Parallel | Model  | Severity |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------- | ------ | -------- |
| A-01 | **Extract BehaviourModule into sub-module constellation** — BehaviourCore, Safeguarding, Discipline, Recognition, Analytics, Admin. Narrow exports from 38 to ~12. | D     | A-d1     | Opus   | High     |
| A-02 | **Split PastoralModule into focused sub-modules** — Concerns, Cases, SST, Checkins, CriticalIncidents.                                                             | D     | A-d2     | Opus   | Medium   |
| A-03 | **Split GradebookModule internally** — separate report-card generation, lifecycle, and transcript/query concerns. _(GPT)_                                          | D     | A-d3     | Opus   | Medium   |
| A-04 | **Break Pastoral↔ChildProtection circular dependency** — extract thin PastoralCoreModule with shared interfaces. Replace forwardRef.                               | D     | A-d2     | Opus   | Medium   |
| A-05 | **Break Communications↔GDPR circular dependency** — GDPR enqueues notification jobs via BullMQ instead of importing CommunicationsModule.                          | D     | A-d4     | Opus   | Medium   |
| A-06 | **Add sub-path exports to `packages/shared`** — add `exports` field with sub-paths. Shrink root barrel to core primitives only. _(enhanced by GPT)_                | D     | A-d5     | Opus   | Low      |
| A-07 | **Fix N+1 query in `ReportCardsService.generate()`** — batch-load all data before loop, single RLS transaction.                                                    | D     | A-d3     | Opus   | Medium   |
| A-08 | **Audit and reduce 100% export modules** — EarlyWarning, Engagement, SEN, Configuration, Regulatory. Target <40% export ratio.                                     | D     | A-d6     | Sonnet | Low      |
| A-09 | **Extract auth login shared logic** — deduplicate ~140 lines between `login()` and `loginWithRecoveryCode()`.                                                      | C     | A-c1     | Opus   | Medium   |
| A-10 | **Add module dependency diagram generation script** — parse `*.module.ts` imports, generate Mermaid graph to `architecture/`.                                      | E     | A-e1     | Sonnet | Low      |
| A-11 | **Create ADRs for key architectural decisions** — Prisma-direct reads, forwardRef usage, survey_responses no-RLS, TenantAwareJob raw SQL.                          | E     | A-e2     | Sonnet | Low      |
| A-12 | **Enforce maximum module size via CI** — warn at 10k LOC, error at 15k LOC per NestJS module.                                                                      | E     | A-e3     | Sonnet | Low      |
| A-13 | **Add `@Internal()` decorator for non-exported services** — custom decorator + ESLint rule preventing external imports.                                            | E     | A-e4     | Opus   | Low      |
| A-14 | **Version architecture docs with staleness detection** — CI warns if any doc not verified in >30 days.                                                             | E     | A-e5     | Sonnet | Low      |
| A-15 | **Create module ownership registry** — document owner module for every shared table family in `architecture/module-ownership.md`. _(GPT)_                          | D     | A-d7     | Sonnet | Medium   |
| A-16 | **Introduce `students` read facade** — centralized read service, migrate all non-owner consumers off direct student table reads. _(GPT)_                           | D     | A-d8     | Opus   | Medium   |
| A-17 | **Introduce `staff-profiles` read facade** — same pattern, migrate analytics and wellbeing off direct reads. _(GPT)_                                               | D     | A-d9     | Opus   | Medium   |
| A-18 | **Introduce `academic-periods-and-enrolments` read facade** — for gradebook, scheduling, reporting. _(GPT)_                                                        | D     | A-d10    | Opus   | Medium   |
| A-19 | **Introduce `attendance-summary` read facade** — for report cards, regulatory, risk-detection. _(GPT)_                                                             | D     | A-d11    | Opus   | Medium   |
| A-20 | **Add architecture test: fail when non-owner modules query protected foreign tables directly** — CI enforcement of the facade pattern. _(GPT)_                     | D     | A-d12    | Opus   | Medium   |
| A-21 | **Require ADR for every new cross-cutting dependency or global guard** — process gate for new shared contracts. _(GPT)_                                            | E     | A-e6     | Sonnet | Low      |

---

## 4. Modularity (6.5 → 9.5)

| #    | Action                                                                                                                                                                                          | Phase | Parallel | Model  | Severity |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| M-01 | **Reduce BehaviourModule export ratio to <30%** — after sub-module extraction (A-01).                                                                                                           | D     | M-d1     | Opus   | High     |
| M-02 | **Reduce EarlyWarningModule exports to <40%** — internalize signal collectors.                                                                                                                  | D     | M-d2     | Sonnet | Medium   |
| M-03 | **Reduce EngagementModule exports to <40%**.                                                                                                                                                    | D     | M-d3     | Sonnet | Medium   |
| M-04 | **Reduce SenModule exports to <40%**.                                                                                                                                                           | D     | M-d4     | Sonnet | Medium   |
| M-05 | **Reduce ConfigurationModule exports to essentials**.                                                                                                                                           | D     | M-d5     | Sonnet | Low      |
| M-06 | **Reduce RegulatoryModule exports to <30%**.                                                                                                                                                    | D     | M-d6     | Sonnet | Low      |
| M-07 | **Add module boundary enforcement ESLint rule** — prevent importing from another module's internal files.                                                                                       | D     | M-d7     | Opus   | Medium   |
| M-08 | **Create explicit public API barrels per module** — index.ts exporting only public services.                                                                                                    | D     | M-d8     | Sonnet | Medium   |
| M-09 | **Audit Prisma-direct cross-module reads** — verify blast-radius doc accuracy, add new consumers.                                                                                               | D     | M-d9     | Sonnet | Low      |
| M-10 | **Route all ReportsModule cross-module reads through data access service**.                                                                                                                     | D     | M-d10    | Opus   | Low      |
| M-11 | **Add module cohesion metrics to CI** — flag modules >50 files or >15k LOC.                                                                                                                     | E     | M-e1     | Sonnet | Low      |
| M-12 | **Extract BehaviourPolicyEngine into own module** — self-contained rule engine with clear I/O.                                                                                                  | D     | M-d1     | Opus   | Medium   |
| M-13 | **Extract PdfRenderingModule consumers to use a queue** — enqueue PDF jobs instead of synchronous Puppeteer imports.                                                                            | D     | M-d11    | Opus   | Medium   |
| M-14 | **Extract SequenceService into lightweight SequenceModule** — reduce 14 modules importing TenantsModule.                                                                                        | D     | M-d12    | Sonnet | Low      |
| M-15 | **Document and enforce module tiers** — formalize tier system, CI check preventing Tier 1→Tier 3/4 dependencies.                                                                                | E     | M-e2     | Opus   | Low      |
| M-16 | **Separate command-side and query-side in hotspot modules** — CQRS-lite split in behaviour, pastoral, gradebook. _(GPT)_                                                                        | D     | M-d13    | Opus   | Medium   |
| M-17 | **Move queue-emission behind module-local side-effect services** — domain services don't scatter `.add()` calls; a dedicated `BehaviourSideEffectsService` handles all BullMQ dispatch. _(GPT)_ | D     | M-d1     | Opus   | Medium   |
| M-18 | **Fail CI when new cross-module dependencies appear without architecture update** — automated enforcement. _(GPT)_                                                                              | E     | M-e3     | Opus   | Medium   |
| M-19 | **Add module-level READMEs** — document purpose, inbound/outbound dependencies, queue/event side effects per module. _(GPT)_                                                                    | E     | M-e4     | Sonnet | Low      |
| M-20 | **Establish module exit criteria for future extraction** — document what conditions make a module ready for microservice extraction. _(GPT)_                                                    | E     | M-e5     | Sonnet | Low      |
| M-21 | **Add contract tests for public module facades** — once facades exist, test their interfaces. _(GPT)_                                                                                           | D     | M-d14    | Opus   | Medium   |
| M-22 | **Prevent new global singletons without blast-radius review** — process gate + CI check. _(GPT)_                                                                                                | E     | M-e6     | Sonnet | Low      |

---

## 5. Code Quality (7.5 → 9.5)

| #     | Action                                                                                                                                                                                  | Phase | Parallel | Model  | Severity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| CQ-01 | **Add ESLint rule for empty catch blocks** — error on `catch {}` without at least one statement.                                                                                        | B     | CQ-b1    | Sonnet | High     |
| CQ-02 | **Fix all 15 `as any` casts in production code** — use proper Prisma enum types or typed helpers.                                                                                       | C     | CQ-c1    | Sonnet | Medium   |
| CQ-03 | **Create typed `withRls()` helper** — encapsulate RLS client creation + transaction + the one permitted cast. All services use this.                                                    | D     | CQ-d1    | Opus   | Medium   |
| CQ-04 | **Migrate guardian-restrictions page to `react-hook-form`** — reference implementation for form migration.                                                                              | D     | CQ-d2    | Sonnet | Medium   |
| CQ-05 | **Create react-hook-form migration guide** — before/after examples in `docs/conventions/form-migration.md`.                                                                             | D     | CQ-d3    | Sonnet | Low      |
| CQ-06 | **Migrate top 10 most-used forms to `react-hook-form`** — incident, sanction, student, invoice, staff, leave, announcement, class, assessment, report card template.                    | D     | CQ-d4    | Sonnet | Medium   |
| CQ-07 | **Fix i18n gaps in behaviour module frontend** — extract hardcoded English to translation keys.                                                                                         | D     | CQ-d5    | Sonnet | Medium   |
| CQ-08 | **Fix i18n gaps in engagement module frontend**.                                                                                                                                        | D     | CQ-d6    | Sonnet | Medium   |
| CQ-09 | **Standardize `formatDate` usage** — remove local definitions, use shared `@/lib/format-date` everywhere.                                                                               | C     | CQ-c2    | Sonnet | Low      |
| CQ-10 | **Tighten `no-console` to error level** — allow only `console.error`/`console.warn`. Replace `console.log` with structured logger.                                                      | C     | CQ-c3    | Sonnet | Low      |
| CQ-11 | **Extract large frontend pages into sub-components** — any page >800 LOC gets `_components/` extraction.                                                                                | D     | CQ-d7    | Sonnet | Low      |
| CQ-12 | **Add JSDoc to all exported service methods** — public API methods only.                                                                                                                | E     | CQ-e1    | Sonnet | Low      |
| CQ-13 | **Eliminate notification template `as any` duplication** — create `toNotificationChannel()` helper.                                                                                     | C     | CQ-c4    | Sonnet | Low      |
| CQ-14 | **Verify `strict: true` in all tsconfig files**.                                                                                                                                        | C     | CQ-c5    | Sonnet | Low      |
| CQ-15 | **Enforce maximum file length via ESLint** — warn 500/error 1000 for services, warn 600/error 1200 for pages.                                                                           | E     | CQ-e2    | Sonnet | Low      |
| CQ-16 | **Promote `import/order` from warning to error** — stop structural drift landing quietly. _(GPT)_                                                                                       | B     | CQ-b2    | Sonnet | Low      |
| CQ-17 | **Expand raw-SQL ESLint rule to cover `$queryRaw` and `$executeRaw`** — not only `Unsafe` variants. Allowlist the RLS middleware and TenantAwareJob. _(GPT)_                            | B     | CQ-b3    | Opus   | Medium   |
| CQ-18 | **Add lint gate blocking new hand-rolled forms** — warn or error when `useState` pattern is used for form fields in new code. _(GPT)_                                                   | D     | CQ-d8    | Opus   | Medium   |
| CQ-19 | **Add lint gate for untranslated human-facing strings** — detect hardcoded quoted strings in JSX that aren't wrapped in `t()`. _(GPT)_                                                  | D     | CQ-d9    | Opus   | Medium   |
| CQ-20 | **Standardize logger naming and structured context fields** — consistent `private readonly logger = new Logger(ClassName.name)` pattern + always include `tenantId` in context. _(GPT)_ | C     | CQ-c6    | Sonnet | Low      |
| CQ-21 | **Add public-method-count budget for services** — warn if a service class has >15 public methods. Prevents new god classes. _(GPT)_                                                     | E     | CQ-e3    | Sonnet | Low      |
| CQ-22 | **Move complex mapping/projection logic into dedicated helpers** — extract from large services into `*.helpers.ts` or `*.builders.ts` files. _(GPT)_                                    | D     | CQ-d10   | Sonnet | Low      |
| CQ-23 | **Add hotspot-focused code review checklists** — per-module checklists for behaviour, pastoral, auth, finance. _(GPT)_                                                                  | E     | CQ-e4    | Sonnet | Low      |

---

## 6. Maintainability (7.0 → 9.5)

| #     | Action                                                                                                                                             | Phase | Parallel | Model  | Severity |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| MT-01 | **Complete i18n audit for all frontend modules** — scan for hardcoded English, generate report, fix top 20 files.                                  | D     | MT-d1    | Sonnet | Medium   |
| MT-02 | **Add automated i18n completeness check** — compare `t()` references against both locale files, report missing keys. Run in CI.                    | E     | MT-e1    | Opus   | Medium   |
| MT-03 | **Fix 34 import/order lint warnings** — auto-fix: `pnpm turbo run lint -- --fix`.                                                                  | B     | MT-b1    | Sonnet | Low      |
| MT-04 | **Standardize controller error response shape** — shared `ApiError` factory guaranteeing `{ error: { code, message, details? } }`.                 | C     | MT-c1    | Sonnet | Medium   |
| MT-05 | **Add shared mock factories** — `buildMockPrisma()`, `buildMockRedis()`, `buildMockLogger()`, `buildMockQueue()` at API test root.                 | C     | MT-c2    | Sonnet | Medium   |
| MT-06 | **Document all BullMQ job payloads with Zod schemas** — validate at enqueue time to catch mismatches at producer, not consumer.                    | D     | MT-d2    | Opus   | Medium   |
| MT-07 | **Create onboarding developer guide** — clone→setup→seed→dev→test→contribute flow in `docs/GETTING-STARTED.md`.                                    | E     | MT-e2    | Sonnet | Low      |
| MT-08 | **Add conventional commit enforcement** — commitlint + Husky commit-msg hook.                                                                      | E     | MT-e3    | Sonnet | Low      |
| MT-09 | **Extract `window.innerWidth` mobile detection to `useIsMobile()` hook** — replace brittle resize listeners.                                       | D     | MT-d3    | Sonnet | Low      |
| MT-10 | **Standardize toast error messages from API errors** — shared `handleApiError()` utility for frontend.                                             | D     | MT-d4    | Sonnet | Medium   |
| MT-11 | **Add architecture doc table of contents** — `architecture/README.md` indexing all docs.                                                           | E     | MT-e4    | Sonnet | Low      |
| MT-12 | **Clean up TODO/FIXME markers** — resolve or convert to tracked issues.                                                                            | C     | MT-c3    | Sonnet | Low      |
| MT-13 | **Document API versioning strategy** — when to introduce `/v2/`, how to handle breaking changes.                                                   | E     | MT-e5    | Sonnet | Low      |
| MT-14 | **Standardize page-level error boundary pattern** — shared `ErrorBoundary` + `useApiQuery()` hook for loading/error/empty states.                  | D     | MT-d5    | Opus   | Medium   |
| MT-15 | **Add PR template with checklist** — tests, no `any`, RLS verified, architecture docs updated, danger zones checked.                               | E     | MT-e6    | Sonnet | Low      |
| MT-16 | **Break `ConcernService` into lifecycle, sharing, CP-integration slices** — 1,274 LOC service decomposition. _(GPT)_                               | D     | MT-d6    | Opus   | Medium   |
| MT-17 | **Break `BehaviourStudentsService` into query, analytics, parent-view slices** — 1,230 LOC decomposition. _(GPT)_                                  | D     | MT-d7    | Opus   | Medium   |
| MT-18 | **Break `WorkloadComputeService` into personal, aggregate, trend slices** — 1,336 LOC decomposition. _(GPT)_                                       | D     | MT-d8    | Opus   | Medium   |
| MT-19 | **Break `ReportCardsService` into generation, lifecycle, query slices** — 983 LOC decomposition. _(GPT)_                                           | D     | MT-d9    | Opus   | Medium   |
| MT-20 | **Add complexity budgets via static analysis** — cyclomatic complexity threshold per function, fail CI on new violations in hotspot areas. _(GPT)_ | E     | MT-e7    | Opus   | Medium   |
| MT-21 | **Remove commented-out code and dead branches from critical modules** — audit behaviour, pastoral, auth, finance. _(GPT)_                          | C     | MT-c4    | Sonnet | Low      |
| MT-22 | **Add CODEOWNERS file** — route PRs for critical modules (auth, behaviour, finance, GDPR) to appropriate reviewers. _(GPT)_                        | E     | MT-e8    | Sonnet | Low      |
| MT-23 | **Add "change cost" review notes for hotspot modules** — documented blast-radius impact in PR template for high-risk modules. _(GPT)_              | E     | MT-e9    | Sonnet | Low      |
| MT-24 | **Recompute and publish hotspot metrics after each wave** — track reduction over time, not just at audit. _(GPT)_                                  | E     | MT-e10   | Sonnet | Low      |

---

## 7. Backend Test Health (7.0 → 9.5)

| #     | Action                                                                                                                                                           | Phase | Parallel | Model  | Severity |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| BT-01 | **Add jest coverage measurement + thresholds** — `collectCoverage: true`, set initial thresholds at current baseline minus 5%, ratchet up.                       | B     | BT-b1    | Sonnet | High     |
| BT-02 | **Write `safeguarding-concerns.service.spec.ts`** — 30+ tests: creation, escalation, transitions, tier access, CP grants, break-glass, sealing.                  | B     | BT-b2    | Opus   | Critical |
| BT-03 | **Write `safeguarding-reporting.service.spec.ts`** — mandatory reporting logic, report generation, access restrictions.                                          | B     | BT-b3    | Opus   | High     |
| BT-04 | **Write `import-executor.service.spec.ts`** — row processing, validation, partial failure, rollback.                                                             | C     | BT-c1    | Opus   | High     |
| BT-05 | **Write `application-state-machine.service.spec.ts`** — all valid + all blocked transitions.                                                                     | C     | BT-c2    | Opus   | High     |
| BT-06 | **Write `attendance-session.service.spec.ts`** — session creation, marking, auto-lock, permissions.                                                              | C     | BT-c3    | Sonnet | Medium   |
| BT-07 | **Write `attendance.controller.spec.ts`** — permission-denied tests per endpoint.                                                                                | C     | BT-c4    | Sonnet | Medium   |
| BT-08 | **Enable RLS integration tests in CI** — remove exclusion or add `test:integration` CI step with Docker DB.                                                      | B     | BT-b4    | Opus   | High     |
| BT-09 | **Create systematic RLS smoke test** — iterate ALL tenant-scoped models, create as A, query as B, assert invisible. Cover 248 tables.                            | B     | BT-b5    | Opus   | High     |
| BT-10 | **Add RLS tests for top 20 highest-risk tables** — students, invoices, payments, attendance, behaviour incidents, safeguarding, staff, payroll, etc.             | C     | BT-c5    | Opus   | High     |
| BT-11 | **Upgrade error assertions to verify error codes** — `toMatchObject({ response: { code: 'EXPECTED' } })` instead of just exception class.                        | C     | BT-c6    | Sonnet | Medium   |
| BT-12 | **Add permission-denied tests to thin controller specs** — 23 controllers with <=3 tests need at least one 403 test.                                             | C     | BT-c7    | Sonnet | Medium   |
| BT-13 | **Write `critical-incident.service.spec.ts`** — incident creation, affected persons, transitions, notifications.                                                 | C     | BT-c8    | Opus   | Medium   |
| BT-14 | **Write `pastoral-dsar.service.spec.ts`** — DSAR traversal, export, redaction.                                                                                   | C     | BT-c9    | Opus   | Medium   |
| BT-15 | **Add coverage ratchet script** — fail CI if any coverage metric decreases by >0.5% vs previous commit.                                                          | D     | BT-d1    | Sonnet | Medium   |
| BT-16 | **Write `behaviour-admin.service.spec.ts`** — admin ops, legal holds, export, cohort analysis.                                                                   | C     | BT-c10   | Sonnet | Medium   |
| BT-17 | **Write `behaviour-export.service.spec.ts`** — export logic, filtering, formatting.                                                                              | C     | BT-c11   | Sonnet | Low      |
| BT-18 | **Add concurrency tests for finance sequence generation and payment allocation** — verify row-level locking under parallel requests. _(GPT)_                     | C     | BT-c12   | Opus   | Medium   |
| BT-19 | **Add fixture builders for deterministic tenant-separated datasets** — reusable `createTenantFixture()` to make multi-tenant tests easier to write. _(GPT)_      | C     | BT-c13   | Opus   | Medium   |
| BT-20 | **Replace time-dependent assertions with fixed clocks** — use `jest.useFakeTimers()` or injected clock in time-sensitive specs. _(GPT)_                          | C     | BT-c14   | Sonnet | Low      |
| BT-21 | **Create canonical "backend health" command** — single `pnpm test:health` that runs unit + integration + RLS + performance sanity + e2e-critical suites. _(GPT)_ | B     | BT-b6    | Sonnet | Medium   |

---

## 8. Worker Test Health (4.0 → 9.5)

| #     | Action                                                                                                                                                          | Phase | Parallel | Model  | Severity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| WT-01 | **Write `evaluate-policy.processor.spec.ts`** — five-stage pipeline, idempotency, dedup, cooldown, failure handling. 674 LOC.                                   | B     | WT-b1    | Opus   | Critical |
| WT-02 | **Write `gradebook-risk-detection.processor.spec.ts`** — risk thresholds, alert creation, tenant iteration. 690 LOC.                                            | C     | WT-c1    | Opus   | High     |
| WT-03 | **Write `signal-collection.utils.spec.ts`** — all 5 signal collectors, aggregation, thresholds. 1,099 LOC.                                                      | C     | WT-c2    | Opus   | High     |
| WT-04 | **Write `critical-escalation.processor.spec.ts`** — DLP chain, step escalation, termination, re-enqueue.                                                        | B     | WT-b2    | Opus   | High     |
| WT-05 | **Write `detect-patterns.processor.spec.ts`** — pattern detection, thresholds, alerts. 597 LOC.                                                                 | C     | WT-c3    | Opus   | Medium   |
| WT-06 | **Write specs for all 5 regulatory processors** — tusla, deadline, DES, ppod-import, ppod-sync.                                                                 | C     | WT-c4    | Sonnet | High     |
| WT-07 | **Write specs for all 3 import processors** — file-cleanup, validation, processing.                                                                             | C     | WT-c5    | Sonnet | Medium   |
| WT-08 | **Write specs for all 3 payroll processors** — mass-export, session-gen, approval-callback.                                                                     | C     | WT-c6    | Sonnet | High     |
| WT-09 | **Write specs for remaining 12 behaviour processors** — check-awards through retention-check.                                                                   | C     | WT-c7    | Sonnet | Medium   |
| WT-10 | **Write specs for remaining 7 pastoral processors** — overdue-actions through notify-concern.                                                                   | C     | WT-c8    | Sonnet | Medium   |
| WT-11 | **Write specs for remaining 3 attendance processors**.                                                                                                          | C     | WT-c9    | Sonnet | Medium   |
| WT-12 | **Write specs for all 3 early-warning processors** — compute-daily, compute-student, weekly-digest.                                                             | C     | WT-c10   | Sonnet | Medium   |
| WT-13 | **Write specs for remaining 6 engagement processors**.                                                                                                          | C     | WT-c11   | Sonnet | Low      |
| WT-14 | **Write specs for remaining 6 communications processors**.                                                                                                      | C     | WT-c12   | Sonnet | Low      |
| WT-15 | **Write specs for remaining 3 gradebook processors**.                                                                                                           | C     | WT-c13   | Sonnet | Medium   |
| WT-16 | **Add worker test coverage measurement** — `collectCoverage: true` in worker jest config. Set thresholds.                                                       | B     | WT-b3    | Sonnet | Medium   |
| WT-17 | **Write `solver-v2.processor.spec.ts`** — scheduling solver processor.                                                                                          | C     | WT-c14   | Opus   | Medium   |
| WT-18 | **Create processor coverage registry** — list every processor, owner, spec status in `architecture/processor-registry.md`. _(GPT)_                              | B     | WT-b4    | Sonnet | Low      |
| WT-19 | **Require spec before merge for new processors** — CI check that every `*.processor.ts` has a matching `*.processor.spec.ts`. _(GPT)_                           | D     | WT-d1    | Sonnet | Medium   |
| WT-20 | **Add tenant-isolation tests for cross-tenant processors** — verify processors that manually iterate tenants (not via TenantAwareJob) cannot leak data. _(GPT)_ | C     | WT-c15   | Opus   | High     |
| WT-21 | **Add retry-exhaustion and failure-path tests as standard checklist** — template test for: max retries hit, backoff verified, DLQ entry created. _(GPT)_        | C     | WT-c16   | Sonnet | Medium   |
| WT-22 | **Add idempotency rerun tests** — processors that produce side effects (email, SMS, PDF) must be safe to run twice on the same job payload. _(GPT)_             | C     | WT-c17   | Opus   | Medium   |
| WT-23 | **Add worker integration tests against real Redis/Postgres** — for critical queues (notifications, behaviour, compliance). _(GPT)_                              | D     | WT-d2    | Opus   | Medium   |

---

## 9. Developer Experience (8.0 → 9.5)

| #     | Action                                                                                                                                 | Phase | Parallel | Model  | Severity |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| DX-01 | **Add `ecosystem.config.js` to repo** — version-control PM2 process definitions.                                                       | B     | DX-b1    | Sonnet | Medium   |
| DX-02 | **Add E2E Playwright tests to CI** — visual regression tests in CI pipeline.                                                           | D     | DX-d1    | Opus   | Medium   |
| DX-03 | **Add integration test CI step** — separate job with Docker PostgreSQL service container.                                              | B     | DX-b2    | Opus   | High     |
| DX-04 | **Add Makefile with common tasks** — setup, dev, test, lint, build, seed, migrate, audit-rls.                                          | E     | DX-e1    | Sonnet | Low      |
| DX-05 | **Add database migration safety check** — pre-deploy script flagging destructive operations (DROP TABLE/COLUMN).                       | D     | DX-d2    | Opus   | Medium   |
| DX-06 | **Add TypeScript build caching** — Turborepo remote or persistent local caching.                                                       | E     | DX-e2    | Sonnet | Low      |
| DX-07 | **Add `pnpm test:affected`** — run only tests for changed packages: `turbo run test --filter=...[HEAD~1]`.                             | E     | DX-e3    | Sonnet | Low      |
| DX-08 | **Add Dockerfile for production parity** — multi-stage Dockerfile matching production runtime.                                         | D     | DX-d3    | Sonnet | Medium   |
| DX-09 | **Add PgBouncer to local Docker Compose** — catch PgBouncer-incompatible queries locally.                                              | D     | DX-d4    | Sonnet | Medium   |
| DX-10 | **Add BullMQ Dashboard to local dev** — bull-board admin route for queue visibility.                                                   | D     | DX-d5    | Sonnet | Low      |
| DX-11 | **Add git hook for architecture doc freshness reminder**.                                                                              | E     | DX-e4    | Sonnet | Low      |
| DX-12 | **Add automated changelog generation** — conventional-changelog from commit history.                                                   | E     | DX-e5    | Sonnet | Low      |
| DX-13 | **Add IDE workspace settings** — `.vscode/settings.json` + recommended extensions.                                                     | E     | DX-e6    | Sonnet | Low      |
| DX-14 | **Add database seed idempotency** — re-runnable `seed-demo.sh` with `--reset` flag.                                                    | E     | DX-e7    | Sonnet | Low      |
| DX-15 | **Add API request/response logging in development** — dev-only middleware logging method, path, status, duration.                      | E     | DX-e8    | Sonnet | Low      |
| DX-16 | **Add `pnpm doctor` command** — validates env, dependencies, local services, generated artifacts in one check. _(GPT)_                 | E     | DX-e9    | Opus   | Low      |
| DX-17 | **Add developer docs for worker debugging and failed-job replay** — how to inspect queues, replay DLQ jobs, check cron status. _(GPT)_ | E     | DX-e10   | Sonnet | Low      |
| DX-18 | **Align local and CI validation commands** — reduce surprise differences between local `pnpm test` and CI test execution. _(GPT)_      | D     | DX-d6    | Sonnet | Low      |

---

## 10. Operational Readiness (6.0 → 9.5)

| #     | Action                                                                                                                                        | Phase | Parallel | Model  | Severity |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| OR-01 | **Gate deployment on CI passing** — merge into single workflow with `needs: [ci]`, or branch protection.                                      | A     | OR-a1    | Sonnet | Critical |
| OR-02 | **Add automated rollback on deploy failure** — checkout HEAD~1, rebuild, restart on smoke test failure.                                       | A     | OR-a1    | Opus   | High     |
| OR-03 | **Add off-site backup replication** — pg_dump → S3-compatible object storage. Monthly restore drill from remote.                              | A     | OR-a2    | Opus   | High     |
| OR-04 | **Add pre-deploy database backup** — pg_dump before migrations in deploy script.                                                              | A     | OR-a1    | Sonnet | High     |
| OR-05 | **Fix `cancel-in-progress` on deploy** — change to `false` so deploys queue instead of cancel.                                                | A     | OR-a1    | Sonnet | Medium   |
| OR-06 | **Add `app.enableShutdownHooks()` to worker** — plus graceful BullMQ drain period.                                                            | A     | OR-a3    | Sonnet | Medium   |
| OR-07 | **Remove `pnpm install` fallback in production** — only `--frozen-lockfile`, fail if out of sync.                                             | A     | OR-a1    | Sonnet | Medium   |
| OR-08 | **Add centralized log aggregation** — log shipper (Vector/Promtail) → Grafana Loki or hosted platform.                                        | B     | OR-b1    | Opus   | Medium   |
| OR-09 | **Add zero-downtime deployment** — PM2 `reload` (cluster mode) for API/web, graceful drain for worker.                                        | B     | OR-b2    | Opus   | Medium   |
| OR-10 | **Fix backup drill script for actual Hetzner infrastructure** — rewrite from AWS RDS to Docker PostgreSQL.                                    | B     | OR-b3    | Sonnet | Medium   |
| OR-11 | **Optimize post-migration SQL re-application** — track applied scripts, only apply new ones.                                                  | D     | OR-d1    | Opus   | Low      |
| OR-12 | **Add deploy notification** — Sentry release + Slack/Telegram notification on success/failure.                                                | B     | OR-b4    | Sonnet | Low      |
| OR-13 | **Add uptime monitoring for worker service** — UptimeRobot on worker health endpoint, 5-min interval.                                         | B     | OR-b5    | Sonnet | Medium   |
| OR-14 | **Add database connection pool monitoring** — health check reporting PgBouncer utilization, alert >80%.                                       | D     | OR-d2    | Opus   | Medium   |
| OR-15 | **Add Redis memory monitoring** — health check reporting usage vs maxmemory, alert >80%.                                                      | D     | OR-d3    | Sonnet | Low      |
| OR-16 | **Expand production smoke test suite** — API health, auth endpoint, worker health, Redis ping, DB query via API.                              | B     | OR-b6    | Sonnet | Medium   |
| OR-17 | **Add Sentry release tracking** — source maps, commit SHA tagging, error→release linking.                                                     | B     | OR-b7    | Sonnet | Low      |
| OR-18 | **Deploy pinned commit SHA instead of `git pull`** — checkout specific SHA in deploy script for reproducibility. _(GPT)_                      | B     | OR-b2    | Opus   | High     |
| OR-19 | **Add worker env validation equivalent to API's startup validation** — Zod schema for worker-specific env vars, exit on failure. _(GPT)_      | A     | OR-a3    | Sonnet | Medium   |
| OR-20 | **Add deploy preflight verifying DB, Redis, migrations, secrets** — pre-deploy connectivity checks before building. _(GPT)_                   | B     | OR-b8    | Opus   | Medium   |
| OR-21 | **Add post-migration verification step** — confirm critical RLS policies, triggers, and queue tables are intact after migrate deploy. _(GPT)_ | B     | OR-b9    | Opus   | Medium   |
| OR-22 | **Run regular restore and rollback drills with recorded recovery times** — quarterly minimum, track RTO/RPO. _(GPT)_                          | E     | OR-e1    | Sonnet | Medium   |
| OR-23 | **Add operational dashboards** — API health, worker health, queue health, search health, delivery provider health. _(GPT)_                    | D     | OR-d4    | Opus   | Medium   |
| OR-24 | **Establish weekly operational review** — alerts, failed jobs, deploy outcomes, unresolved degradations. _(GPT)_                              | E     | OR-e2    | Sonnet | Low      |
| OR-25 | **Add queue-depth, retry, failure, and stuck-job alerts** — for all critical queues, not just health check monitoring. _(GPT)_                | B     | OR-b10   | Opus   | Medium   |

---

## 11. Refactor Safety (5.5 → 9.5)

| #     | Action                                                                                                                                                                                                   | Phase | Parallel | Model  | Severity |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| RS-01 | **Achieve >80% backend line coverage** — ratchet up 5% per sprint from current baseline.                                                                                                                 | C     | RS-c1    | Sonnet | High     |
| RS-02 | **Achieve >70% worker line coverage** — same ratchet pattern.                                                                                                                                            | C     | RS-c2    | Sonnet | High     |
| RS-03 | **Write tests for all state machine transition services** — every `VALID_TRANSITIONS` map has matching spec.                                                                                             | C     | RS-c3    | Sonnet | High     |
| RS-04 | **Add mutation testing for critical services** — stryker-mutator on auth, sanctions, invoices, safeguarding.                                                                                             | E     | RS-e1    | Opus   | Medium   |
| RS-05 | **Create refactoring safety checklist** — pre-refactoring process in `architecture/refactoring-checklist.md`.                                                                                            | D     | RS-d1    | Sonnet | Low      |
| RS-06 | **Add snapshot tests for complex Prisma query structures** — catch unintended query changes during refactoring.                                                                                          | D     | RS-d2    | Sonnet | Medium   |
| RS-07 | **Add contract tests between API and frontend** — Zod schemas from shared as the contract for top 20 endpoints.                                                                                          | D     | RS-d3    | Opus   | Medium   |
| RS-08 | **Establish convention: every bug fix includes a regression test**.                                                                                                                                      | E     | RS-e2    | Sonnet | Low      |
| RS-09 | **Create module-level test coverage dashboard** — CI artifact with per-module coverage.                                                                                                                  | D     | RS-d4    | Sonnet | Low      |
| RS-10 | **Add `test:changed` command** — jest `--changedSince` or `--findRelatedTests` for fast feedback.                                                                                                        | D     | RS-d5    | Sonnet | Low      |
| RS-11 | **Write integration tests for top 5 cross-module flows** — enrollment→invoice→payment, incident→sanction→notification, attendance→pattern→early-warning, payroll→payslip→PDF, DSAR→export→anonymisation. | D     | RS-d6    | Opus   | High     |
| RS-12 | **Add automated API schema validation** — generate OpenAPI spec from controllers, snapshot and diff on PR.                                                                                               | D     | RS-d7    | Opus   | Medium   |
| RS-13 | **Add database schema snapshot test** — `prisma db pull` snapshot, diff on PR.                                                                                                                           | D     | RS-d8    | Sonnet | Low      |
| RS-14 | **Add "test before refactor" CI gate** — block PRs modifying files with <50% coverage unless new tests added.                                                                                            | E     | RS-e3    | Opus   | Medium   |
| RS-15 | **Create refactoring log** — `architecture/refactoring-log.md` tracking decisions, changes, tests added.                                                                                                 | E     | RS-e4    | Sonnet | Low      |
| RS-16 | **Define refactor risk matrix** — required safeguards by risk class (low/medium/high/critical). _(GPT)_                                                                                                  | D     | RS-d9    | Sonnet | Medium   |
| RS-17 | **Require characterization tests before changing any hotspot service** — capture existing behavior before modifying. _(GPT)_                                                                             | D     | RS-d10   | Opus   | Medium   |
| RS-18 | **Use feature flags for risky behavioral refactors** — tenant-scoped rollout switches. _(GPT)_                                                                                                           | D     | RS-d11   | Opus   | Medium   |
| RS-19 | **Create schema-change playbook** — ownership impact analysis + cross-module read impact checklist. _(GPT)_                                                                                              | D     | RS-d12   | Sonnet | Medium   |
| RS-20 | **Add shadow-read/dual-read validation for risky query replacements** — run old and new query, compare results, alert on divergence. _(GPT)_                                                             | D     | RS-d13   | Opus   | Medium   |
| RS-21 | **Benchmark critical performance paths before/after major refactors** — track latency regressions. _(GPT)_                                                                                               | D     | RS-d14   | Opus   | Medium   |
| RS-22 | **Schedule mini re-audits after each major wave** — don't wait for final all-or-nothing review. _(GPT)_                                                                                                  | E     | RS-e5    | Opus   | Medium   |

---

## 12. Overall Health & Governance _(NEW — from GPT)_

Process and governance items that sustain health improvements over time.

| #     | Action                                                                                                                           | Phase | Parallel | Model  | Severity |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------ | -------- |
| OH-01 | **Turn risk ledger into tracked recovery backlog** — assign owners, due dates, evidence-of-done fields.                          | A     | OH-a1    | Sonnet | High     |
| OH-02 | **Re-rank roadmap work against health backlog** — high-risk debt must not be crowded out by features.                            | A     | OH-a2    | Sonnet | High     |
| OH-03 | **Reserve fixed delivery capacity for health work** — until re-audit target is met.                                              | A     | OH-a3    | Sonnet | High     |
| OH-04 | **Publish monthly scorecard update** — tied to actual evidence, not sentiment.                                                   | E     | OH-e1    | Sonnet | Medium   |
| OH-05 | **Re-run static health audit after Wave 1, Wave 3, and final completion**.                                                       | E     | OH-e2    | Opus   | High     |
| OH-06 | **Add "no new debt without written tradeoff" rule** — architecture, testing, and ops shortcuts require documented justification. | B     | OH-b1    | Sonnet | Medium   |
| OH-07 | **Require every critical/high risk to have retirement plan + due date**.                                                         | B     | OH-b2    | Sonnet | Medium   |
| OH-08 | **Track time-to-detect and time-to-recover as health KPIs**.                                                                     | D     | OH-d1    | Sonnet | Medium   |
| OH-09 | **Track hotspot count, queue-failure count, flaky-test count, direct-foreign-read count** — as top-level health metrics.         | D     | OH-d2    | Sonnet | Medium   |
| OH-10 | **Block major expansion work until Phase A and B items complete**.                                                               | A     | OH-a4    | Sonnet | Critical |
| OH-11 | **Require proof of regression protection before declaring any risk retired**.                                                    | B     | OH-b3    | Sonnet | Medium   |
| OH-12 | **Hold weekly health review until system exits high-risk band**.                                                                 | B     | OH-b4    | Sonnet | Medium   |
| OH-13 | **Treat every new critical workflow as incomplete until code + tests + ops + docs + rollback all exist**.                        | B     | OH-b5    | Sonnet | Medium   |
| OH-14 | **Run final independent re-audit only after all Now/Next items verified**.                                                       | E     | OH-e3    | Opus   | High     |
| OH-15 | **Keep architecture docs, runbooks, scorecard in repo** — health is versioned with code.                                         | B     | OH-b6    | Sonnet | Low      |

---

## Totals

| Dimension             | Original | Added from GPT | Combined Total |
| --------------------- | -------- | -------------- | -------------- |
| Security              | 16       | 8              | **24**         |
| Reliability           | 17       | 9              | **26**         |
| Architecture          | 15       | 6              | **21**         |
| Modularity            | 15       | 7              | **22**         |
| Code Quality          | 15       | 8              | **23**         |
| Maintainability       | 15       | 9              | **24**         |
| Backend Test Health   | 17       | 4              | **21**         |
| Worker Test Health    | 17       | 6              | **23**         |
| Developer Experience  | 15       | 3              | **18**         |
| Operational Readiness | 17       | 8              | **25**         |
| Refactor Safety       | 15       | 7              | **22**         |
| Overall Health (NEW)  | 0        | 15             | **15**         |
| **Grand Total**       | **174**  | **90**         | **264**        |

---

## Phase Summary (Combined)

| Phase     | Focus                                    | Item Count |
| --------- | ---------------------------------------- | ---------- |
| **A**     | Critical ops + safety                    | ~22        |
| **B**     | Security + monitoring + test foundations | ~55        |
| **C**     | Test coverage + code quality             | ~60        |
| **D**     | Architecture + modularity + refactoring  | ~85        |
| **E**     | Polish + maturity + governance           | ~42        |
| **Total** |                                          | **264**    |

---

## Parallel Execution Guide

Within each phase, items sharing the same parallel group code can be run simultaneously. Example maximum parallelism for **Phase A**:

| Group | Items                             | Description                                              |
| ----- | --------------------------------- | -------------------------------------------------------- |
| OR-a1 | OR-01, OR-02, OR-04, OR-05, OR-07 | Deploy workflow changes (same file) — must be sequential |
| OR-a2 | OR-03                             | Backup replication (server config)                       |
| OR-a3 | OR-06, OR-19                      | Worker bootstrap (same file)                             |
| R-a1  | R-01                              | Worker Sentry (new file)                                 |
| R-a2  | R-02                              | Empty catch codemod (many files, non-conflicting)        |
| R-a3  | R-03                              | Worker health controller (own file)                      |
| S-a1  | S-01                              | Migration file (new file)                                |
| S-a2  | S-02                              | API main.ts (throttler)                                  |
| S-a3  | S-17, S-18                        | DB role verification (same concern)                      |

**Phase A max parallel agents**: 9 groups = up to 9 agents working simultaneously.

---

## Model Recommendation Summary

| Model          | Count | Typical Use                                                                                                                                          |
| -------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opus 4.6**   | ~95   | Security-critical, cross-module refactoring, complex state machines, integration tests, facade design, architectural decisions                       |
| **Sonnet 4.6** | ~169  | Test writing (following patterns), config changes, ESLint rules, documentation, migrations, lint fixes, single-file changes, UI component extraction |
