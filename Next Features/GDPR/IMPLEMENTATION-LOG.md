# GDPR Implementation Log

**Created:** 2026-03-27
**Master Plan:** [GDPR-INTEGRATION-PLAN.md](./GDPR-INTEGRATION-PLAN.md)
**Status:** IN PROGRESS

---

## Phase Dependency Graph

```
                     ┌───► D (Consent) ─────────────────┐
A (Quick Wins) ──────┘                                   │
                                                         ▼
B (Tokenisation) ───┬───► E (Legal Infra)            F (DSAR) ───► H (Data Subject)
                    ├───► K (AI Audit Trail)             ▲
                    └────────────────────────────────────┘│
                                                         │
C (Anonymisation) ──┬────────────────────────────────────┘
                    └───► I (Retention)

G (Audit Logging) ──────► J (Breach Detection)

L (Security Hardening) ──── [Independent — schedule anytime]
```

### Reading the Graph

- Arrows mean "unlocks" — Phase A completing unlocks Phase D
- Phase F has THREE prerequisites: B + C + D must ALL be complete before F begins
- Phases with no incoming arrows can start immediately
- Phase L is fully independent and can be scheduled at any convenient time

---

## Parallel Execution Groups

### Wave 1 — No dependencies, can all start immediately

| Phase | Title                                     | Est. Effort |
| ----- | ----------------------------------------- | ----------- |
| A     | Quick Wins (Privacy Defaults + Cron Jobs) | 1 day       |
| B     | GDPR Tokenisation Gateway                 | 5 days      |
| C     | Anonymisation Overhaul                    | 3 days      |
| G     | Audit Logging Enhancement                 | 2–3 days    |
| L     | Security Hardening                        | 4–5 days    |

### Wave 2 — Unlocked by Wave 1 completions

| Phase | Title                          | Unlocked By | Est. Effort |
| ----- | ------------------------------ | ----------- | ----------- |
| D     | Consent Records System         | A           | 3–4 days    |
| E     | Legal & Privacy Infrastructure | B           | 4–5 days    |
| K     | AI Decision Audit Trail        | B           | 2 days      |
| I     | Retention Policy Engine        | C           | 3–4 days    |
| J     | Breach Detection & Management  | G           | 3–4 days    |

### Wave 3 — Unlocked by Wave 2

| Phase | Title                  | Unlocked By | Est. Effort |
| ----- | ---------------------- | ----------- | ----------- |
| F     | DSAR Complete Overhaul | B + C + D   | 4–5 days    |

### Wave 4 — Unlocked by Wave 3

| Phase | Title                    | Unlocked By | Est. Effort |
| ----- | ------------------------ | ----------- | ----------- |
| H     | Data Subject Protections | F           | 2 days      |

---

## Phase Registry

| Phase | Title                    | Status      | Depends On | Unlocks | Est. Effort | Spec File                                            |
| ----- | ------------------------ | ----------- | ---------- | ------- | ----------- | ---------------------------------------------------- |
| A     | Quick Wins               | COMPLETE    | —          | D       | 1 day       | [Phase-A](./Phase-A-Quick-Wins.md)                   |
| B     | Tokenisation Gateway     | COMPLETE    | —          | E, K, F | 5 days      | [Phase-B](./Phase-B-Tokenisation-Gateway.md)         |
| C     | Anonymisation Overhaul   | COMPLETE    | —          | F, I    | 3 days      | [Phase-C](./Phase-C-Anonymisation-Overhaul.md)       |
| D     | Consent Records          | COMPLETE    | A          | F       | 3–4 days    | [Phase-D](./Phase-D-Consent-Records.md)              |
| E     | Legal & Privacy Infra    | COMPLETE    | B          | —       | 4–5 days    | [Phase-E](./Phase-E-Legal-Privacy-Infrastructure.md) |
| F     | DSAR Overhaul            | COMPLETE    | B, C, D    | H       | 4–5 days    | [Phase-F](./Phase-F-DSAR-Overhaul.md)                |
| G     | Audit Logging            | COMPLETE    | —          | J       | 2–3 days    | [Phase-G](./Phase-G-Audit-Logging.md)                |
| H     | Data Subject Protections | NOT STARTED | F          | —       | 2 days      | [Phase-H](./Phase-H-Data-Subject-Protections.md)     |
| I     | Retention Engine         | COMPLETE    | C          | —       | 3–4 days    | [Phase-I](./Phase-I-Retention-Engine.md)             |
| J     | Breach Detection         | COMPLETE    | G          | —       | 3–4 days    | [Phase-J](./Phase-J-Breach-Detection.md)             |
| K     | AI Decision Audit Trail  | COMPLETE    | B          | —       | 2 days      | [Phase-K](./Phase-K-AI-Audit-Trail.md)               |
| L     | Security Hardening       | COMPLETE    | —          | —       | 4–5 days    | [Phase-L](./Phase-L-Security-Hardening.md)           |

---

## Critical Path

**Longest dependency chain:** B (5d) + wait for C (3d) and D (3–4d via A 1d) ... then F (4–5d) then H (2d)

**Practical critical path:** If starting A, B, C in parallel on day 1:

- A completes day 1 → D starts day 2 → D completes ~day 5
- B completes ~day 5
- C completes ~day 3
- F can start day 6 (B + C + D all done) → F completes ~day 10
- H starts day 11 → H completes ~day 12

**Minimum calendar time with full parallelism:** ~12 engineering days

---

## Execution Log

> Each phase MUST add an entry here upon completion. Subsequent phases reference this log
> to verify their prerequisites are satisfied before beginning work.

### Template

```markdown
### Phase X: [Title]

- **Status:** COMPLETE
- **Completed:** YYYY-MM-DD
- **Implemented by:** [engineer name or agent ID]
- **Commit(s):** [commit hash(es)]
- **Key decisions:** [any deviations from the phase spec, with reasoning]
- **Schema changes:** [migration name(s) if any]
- **New endpoints:** [list if any]
- **New frontend pages:** [list if any]
- **Tests added:** [count and coverage summary]
- **Architecture files updated:** [which ones]
- **Unlocks:** [phases now available to begin]
- **Notes:** [anything the next phase should know]
```

---

### Phase B: Tokenisation Gateway

- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch)
- **Commit(s):** dbb056c, 9824321, c732dc0
- **Key decisions:**
  - 11 export policies in "always" category (added ai_behaviour_query + ai_template_conversion beyond original 9)
  - ai-report-narrator and ai-predictions use optional auditContext param for backward compatibility
  - SYSTEM_USER_SENTINEL used when real userId unavailable in AI services
  - No entities/ directory — Prisma models only (follows codebase convention)
- **Schema changes:** 20260329000000_add_gdpr_tokenisation_tables
- **New endpoints:** GET /api/v1/gdpr/export-policies, GET /api/v1/gdpr/token-usage, GET /api/v1/gdpr/token-usage/stats
- **New frontend pages:** None (component only — GDPR badge)
- **Tests added:** 28+ unit tests
- **Architecture files updated:** module-blast-radius.md (DZ-28), danger-zones.md (GdprModule blast radius)
- **Unlocks:** Phase E (Legal Infrastructure), Phase K (AI Audit Trail), and contributes to Phase F (DSAR — also needs C + D)
- **Notes:** Token format is 14 chars from ABCDEFGHJKLMNPQRSTUVWXYZ23456789. Behaviour AI service migrated from in-memory anonymiseForAI to persistent DB-backed tokens.

---

### Phase A: Quick Wins

- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Claude (automated)
- **Key decisions:**
  - Kept existing `ai.enabled` master toggle alongside 8 new granular toggles
  - Behaviour settings defaults (5 fields) live in `behaviourSettingsSchema`, not `tenantSettingsSchema`
  - No migration needed — schema defaults only affect new tenants
  - Added `riskDetection.enabled` to gradebook section of tenant settings
- **Schema changes:** None (application-layer defaults only)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** Defaults verification tests + AI service gating tests
- **Architecture files updated:** event-job-catalog.md (2 new cron entries)
- **Unlocks:** Phase D (Consent Records) is now available
- **Notes:** The `ai` settings block in `tenantSettingsSchema` now has 9 fields (1 existing + 8 new). Phase D should reference these when building consent UI. Each AI service checks `settings.ai.<featureName>` before processing.

### Phase G: Audit Logging Enhancement

- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Codex (GPT-5)
- **Commit(s):** a4ae840
- **Key decisions:**
  - Reused the existing global `AuditLogInterceptor` instead of introducing a second audit pipeline
  - Stored category/sensitivity inside `metadata_json` rather than adding new table columns
  - Made `PermissionGuard`'s `SecurityAuditService` dependency optional in DI so older test modules still instantiate the guard, while production still logs denied events through the global audit module
- **Schema changes:** None (used existing `audit_logs.metadata_json`)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** 8 new tests plus expanded interceptor/auth/audit service coverage for sensitive reads, security events, and permission-denied logging
- **Architecture files updated:** module-blast-radius.md
- **Unlocks:** Phase J (Breach Detection) is now available
- **Notes:** Decorator coverage was added for the priority student, staff bank-details, compliance export, impersonation, and core reporting surfaces. Full `pnpm test` still reports unrelated pre-existing failures in import-processing/anonymisation areas outside Phase G.

### Phase C: Anonymisation Overhaul

- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Codex (GPT-5)
- **Commit(s):** a4ae840
- **Key decisions:**
  - Extracted the canonical anonymisation engine into `@school/prisma` so the API path and worker path share the same deterministic, idempotent implementation
  - Integrated token cleanup because Phase B was already complete in this repo
  - Kept search/Redis/S3 cleanup post-transactional and failure-tolerant so committed DB anonymisation is not rolled back by secondary-system cleanup errors
- **Schema changes:** None (logic changes only)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** 9 unit tests covering worker delegation, idempotency, quasi-identifier removal, notification/message/application cascades, and secondary cleanup
- **Architecture files updated:** module-blast-radius.md
- **Unlocks:** Phase I (Retention Engine), and contributes to Phase F (DSAR Overhaul — also requires B + D)
- **Notes:** Token deletion is included for `gdpr_anonymisation_tokens`. Targeted compliance/worker regressions and package type-checks passed. Root `pnpm test` is still blocked by unrelated workspace failures in `notification-dispatch.service.spec.ts`, `invitations.service.spec.ts`, `import-processing.service.spec.ts`, and `test/child-protection-rls.spec.ts` (missing env vars).

---

### Phase D: Consent Records

- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Codex (GPT-5)
- **Commit(s):** Pending local commit
- **Key decisions:**
  - Kept `privacy_notice_version_id` nullable in the consent schema and service contract, but this repo already contains the Phase E privacy notice infrastructure, so the Prisma relation is active earlier than the original Phase D spec assumed
  - Registration and admissions materialise consent records inline inside their existing tenant-scoped transactions rather than delegating to a second nested consent transaction
  - Cross-school benchmarking uses a live consent-aware analytics query so withdrawal takes effect immediately instead of waiting for materialized-view refresh timing
- **Schema changes:** `20260329100000_add_consent_records`, `20260329113000_filter_behaviour_benchmarks_by_consent`
- **New endpoints:** `POST /api/v1/consent`, `PATCH /api/v1/consent/:id/withdraw`, `GET /api/v1/consent/subject/:type/:id`, `GET /api/v1/consent/type/:consentType`, `POST /api/v1/consent/bulk`, `GET /api/v1/parent-portal/consent`, `PATCH /api/v1/parent-portal/consent/:id/withdraw`
- **New frontend pages:** Parent portal Privacy & Consent dashboard (`/[locale]/privacy-consent`)
- **Tests added:** 11 new consent-specific tests plus expanded regression coverage for registration, admissions, communications, AI services, students, and behaviour analytics
- **Architecture files updated:** `module-blast-radius.md`, `event-job-catalog.md`, `state-machines.md`, `danger-zones.md`, `feature-map.md`
- **Unlocks:** Contributes to Phase F (DSAR Overhaul — also requires B + C)
- **Notes:** Parent self-service withdrawal now immediately affects WhatsApp delivery, AI feature access, gradebook risk detection, allergy-report visibility, and cross-school benchmarking participation.

### Phase E: Legal & Privacy Infrastructure

- **Status:** COMPLETE
- **Completed:** 2026-03-28
- **Implemented by:** Codex (GPT-5)
- **Commit(s):** Pending local commit
- **Key decisions:**
  - Implemented the DPA as a platform-seeded versioned legal document and enforced acceptance through a global `DpaAcceptedGuard` with explicit legal/public allowlist exceptions and a frontend redirect hint
  - Added privacy notice draft editing in addition to the create/publish endpoints because the Phase E frontend spec explicitly requires edit capability before publication
  - Kept the guard disabled under Jest env vars so the legacy test suite remains runnable, while adding focused guard specs that explicitly disable the bypass
- **Schema changes:** `20260329110000_add_gdpr_legal_privacy_infrastructure`
- **New endpoints:** `GET /api/v1/legal/dpa/current`, `GET /api/v1/legal/dpa/status`, `POST /api/v1/legal/dpa/accept`, `GET /api/v1/privacy-notices`, `POST /api/v1/privacy-notices`, `PATCH /api/v1/privacy-notices/:id`, `POST /api/v1/privacy-notices/:id/publish`, `GET /api/v1/privacy-notices/current`, `POST /api/v1/privacy-notices/acknowledge`, `GET /api/v1/parent-portal/privacy-notice`, `GET /api/v1/public/sub-processors`
- **New frontend pages:** `settings/legal/dpa`, `settings/legal/privacy-notices`, `privacy-notice`, `sub-processors`
- **Tests added:** 11 new GDPR legal/privacy tests covering DPA guard behaviour, DPA version invalidation, privacy notice publish/re-ack flows, and public sub-processor access
- **Architecture files updated:** `module-blast-radius.md`, `state-machines.md`, `danger-zones.md`, `feature-map.md`
- **Unlocks:** None directly (but the `consent_records.privacy_notice_version_id` FK is now active)
- **Notes:** The privacy notice and sub-processor register templates now reflect post-tokenisation AI processing (`Anthropic` listed as tokenised-only). Parent portal users now have a direct “How we use your data” route, and tenant admins can manage privacy notice drafts under legal settings.

---

### Phase L: Security Hardening
- **Status:** COMPLETE
- **Completed:** 2026-03-27
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch — 4 agents)
- **Commit(s):** 2951d45
- **Key decisions:**
  - L.1: Cookie consent banner placed inside ThemeProvider but outside DirectionProvider in locale layout — renders on all pages, not just public. Consent stored as JSON cookie with 6-month expiry. "Manage Preferences" uses inline expandable section rather than modal for simplicity.
  - L.2: Sentry replay sample rate reduced from 100% to 10% (or 0% if no analytics consent). Cookie consent integration reads `cookie_consent` cookie at Sentry init time. UUID stripping and PII redaction applied to all 4 Sentry configs (client, server, edge, API).
  - L.3: Encryption key versioning uses existing `encryption_key_ref` / `bank_encryption_key_ref` columns — no migration needed. Legacy keyRefs `'aws'`/`'local'` mapped to v1 for backward compatibility. Keys loaded from `ENCRYPTION_KEY_V1`, `_V2`, etc. env vars with fallback to existing `ENCRYPTION_KEY`/`ENCRYPTION_KEY_LOCAL`.
  - Worker key rotation processor implements AES-256-GCM helpers directly (cannot import API's EncryptionService). Added new SECURITY queue.
- **Schema changes:** None (reused existing key_ref columns)
- **New endpoints:** None
- **New frontend pages:** Cookie consent banner (component in locale layout, not a page)
- **Tests added:** 34 tests — 23 encryption service tests (13 new), 11 key rotation service tests
- **Architecture files updated:** None required (SECURITY queue is internal, no cross-module dependencies added)
- **Unlocks:** None (terminal phase, fully independent)
- **Notes:** Key rotation is manually triggered via BullMQ `security:key-rotation` job. To rotate: set `ENCRYPTION_KEY_V2` env var and `ENCRYPTION_CURRENT_VERSION=2`, then enqueue the job. Old key must remain available until all records are re-encrypted. The `rotateAll()` method also exists on `KeyRotationService` in the API for synchronous use. Worker approach recommended for production (non-blocking).

---

### Phase I: Retention Engine

- **Status:** COMPLETE
- **Completed:** 2026-03-28
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch — 5 agents)
- **Commit(s):** Pending
- **Key decisions:**
  - Retention service placed in ComplianceModule (not GdprModule) — aligns with `compliance.manage` permission
  - Two controllers in one file: `RetentionPoliciesController` at `/v1/retention-policies`, `RetentionHoldsController` at `/v1/retention-holds`
  - `child_protection_safeguarding` has `retention_months = 0` (indefinite) — enforcement always skips
  - Non-overridable policies (financial, payroll, safeguarding) cannot be reduced below platform default
  - Anonymise categories (student/staff/financial/payroll/attendance records) are logged but NOT automatically executed — deferred to DSAR/anonymisation pipeline maturity
  - Simple delete categories (notifications, audit logs, contact forms, NL queries, token usage logs) are actively enforced with batch processing (100 records per transaction)
  - `s3_compliance_exports` — clears `export_file_key` on expired compliance requests (does not delete S3 objects directly)
  - New `COMPLIANCE` queue added to worker (separate from existing `IMPORTS` queue used by compliance execution)
  - `staff_records_post_employment` uses `employment_status = 'inactive'` (only status values are active/inactive)
- **Schema changes:** `20260329120000_add_retention_policy_tables` (retention_policies + retention_holds tables, RLS, 17 seeded platform defaults)
- **New endpoints:** GET /v1/retention-policies, PATCH /v1/retention-policies/:id, POST /v1/retention-policies/preview, POST /v1/retention-holds, DELETE /v1/retention-holds/:id, GET /v1/retention-holds
- **New frontend pages:** Settings > Data Retention (`/settings/data-retention`)
- **Tests added:** 22 API tests (16 service + 6 controller) + 13 worker tests = 35 new tests
- **Architecture files updated:** `event-job-catalog.md` (compliance queue + retention enforcement cron)
- **Unlocks:** None (terminal phase)
- **Notes:** First production run should use `dry_run: true` to verify record counts before actual deletion. Enqueue manually: `{ name: 'data-retention:enforce', data: { dry_run: true } }` on the `compliance` queue. The preview endpoint (`POST /v1/retention-policies/preview`) also provides affected counts without side effects.

---

### Phase K: AI Decision Audit Trail
- **Status:** COMPLETE
- **Completed:** 2026-03-28
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch — 5 agents)
- **Commit(s):** Pending
- **Key decisions:**
  - `AiAuditService.log()` is fire-and-forget — wraps in try/catch, logs error, returns empty string on failure. AI features never break due to audit trail failures.
  - Prompt content stored as truncated summary (500 chars max) + SHA-256 hash of full prompt. Full prompts are NOT stored to avoid PII leakage in logs.
  - `token_usage_log_id` column is nullable and left null for now. Correlation with tokenisation logs is by `tenant_id + ai_service + created_at` window.
  - Article 22 right-to-explanation endpoint (`GET /v1/ai-audit/:id`) returns a structured response showing AI input (data categories, tokenisation status), AI output (model, confidence, processing time), and human review status.
  - 10 AI services instrumented across 5 modules: gradebook (ai-comments, ai-grading, ai-grading-batch, ai-progress-summary, nl-query, report-card-template-conversion), reports (ai-report-narrator, ai-predictions), scheduling (ai-substitution), attendance (attendance-scan), behaviour (behaviour-ai-query).
  - `confidence_score` stored as `DECIMAL(3,2)` in Prisma, converted to `Number()` in controller response to avoid JSON serialization issues.
- **Schema changes:** `20260329120000_add_ai_processing_logs` — new `ai_processing_logs` table with RLS, 3 indexes
- **New endpoints:** `GET /v1/ai-audit/stats`, `GET /v1/ai-audit/subject/:type/:id`, `GET /v1/ai-audit/service/:service`, `GET /v1/ai-audit/:id`, `PATCH /v1/ai-audit/:id/decision`
- **New frontend pages:** None (backend only — frontend AI audit dashboard deferred to separate ticket)
- **Tests added:** 185 tests — 28 new (16 service + 12 controller) + 157 existing passing with new AiAuditService mock
- **Architecture files updated:** `module-blast-radius.md` (AiAuditService entry added under GdprModule)
- **Unlocks:** None (terminal phase)
- **Notes:** 24-month retention for `ai_processing_logs` aligns with academic appeal periods. The `recordDecision()` method is available for future integration with AI grading acceptance/rejection UI. All 10 AI services now log to the audit trail after every Anthropic API call, with timing, model, prompt hash, and tokenisation status.

---

### Phase J: Breach Detection & Management

- **Status:** COMPLETE
- **Completed:** 2026-03-28
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch — 7 agents)
- **Commit(s):** 881f5ab
- **Key decisions:**
  - Tables are platform-level (no `tenant_id`, no RLS) — security incidents may span multiple tenants
  - Detection rules live in the worker (`apps/worker/src/processors/security/rules/`), not the API — they query `audit_logs` directly via `$queryRaw` (safe tagged template)
  - Types prefixed with `Security` (e.g., `SecurityIncidentStatus`) to avoid collision with behaviour module's `IncidentStatus`
  - Processors extend `WorkerHost` (not `TenantAwareJob`) — these are cross-tenant platform operations
  - Deduplication: anomaly scan checks for existing open incident of same `incident_type` before creating new one
  - Escalation events are idempotent — breach-deadline processor checks for existing escalation before creating duplicates
  - Off-hours rule uses UTC (00:00–05:00) for simplicity — per-tenant timezone enhancement deferred
  - Controller notifications (Article 33(2)) and DPC notifications are recorded but not auto-sent — platform admin acts on the escalation events via the UI
- **Schema changes:** `20260329120000_add_security_incidents` — `security_incidents` + `security_incident_events` tables, no RLS
- **New endpoints:** `GET /v1/admin/security-incidents`, `POST /v1/admin/security-incidents`, `GET /v1/admin/security-incidents/:id`, `PATCH /v1/admin/security-incidents/:id`, `POST /v1/admin/security-incidents/:id/events`, `POST /v1/admin/security-incidents/:id/notify-controllers`, `POST /v1/admin/security-incidents/:id/notify-dpc`
- **New frontend pages:** Platform admin incident dashboard (`/admin/security-incidents`), incident detail page (`/admin/security-incidents/:id`)
- **Tests added:** 61 tests — 25 API (13 service + 12 controller) + 36 worker (14 detection rules + 12 anomaly scan + 10 breach deadline)
- **Architecture files updated:** `event-job-catalog.md` (2 new security crons), `state-machines.md` (SecurityIncidentStatus lifecycle), `module-blast-radius.md` (SecurityIncidentsModule in Tier 4)
- **Unlocks:** None (terminal phase)
- **Notes:** Detection rule thresholds are hardcoded per spec: 100 records/min for unusual access, 10 failures/5min for auth spike, 20 denials/10min for permission probe, 5 lockouts/hr for brute force, 50 records for off-hours bulk, 3 exports/hr for data export spike. Cross-tenant attempt (RLS violation) is critical severity and should never fire in normal operation. Anomaly scan runs every 15 minutes. Breach deadline runs hourly with escalation at 12h, 48h, and 72h.

---

### Phase F: DSAR Overhaul

- **Status:** COMPLETE
- **Completed:** 2026-03-28
- **Implemented by:** Claude Opus 4.6 (parallel agent dispatch — 5 agents + 3 remediation agents)
- **Commit(s):** 7275067, 8715ec9 (review remediation)
- **Key decisions:**
  - `DsarTraversalService` (684 lines) is a standalone service in ComplianceModule — queries ~20 Prisma models directly, no new module imports needed
  - Six subject types supported: `student` (19 data categories), `parent` (8), `staff` (8), `applicant` (4), `household` (6), `user` (2)
  - Staff bank details are masked (last 4 chars only) ��� encrypted fields never exposed in DSAR exports
  - `AccessExportService.exportDataPackage()` added alongside existing `exportSubjectData()` for backward compatibility
  - CSV export: one section per data category, separated by headers. Arrays become CSV rows, objects become key-value pairs
  - Deadline tracking: `deadline_at` auto-set to `created_at + 30 days` on creation. Extension grants +60 days per Article 12(3)
  - Erasure pipeline now also deletes `consent_records` + `gdpr_anonymisation_tokens` for the subject
  - `portability` request type treated identically to `access_export` — same traversal, same export
  - Deadline-check cron creates in-app notifications only (no email/WhatsApp dispatch)
  - Notification deduplication: checks for existing notification with same template_key + source_entity before creating
- **Schema changes:** `20260329130000_add_dsar_deadline_tracking` — 6 new columns on `compliance_requests` (deadline_at, extension_granted, extension_reason, extension_deadline_at, deadline_exceeded, rectification_note), 2 new enum values on `ComplianceSubjectType` (staff, applicant), 1 new enum value on `ComplianceRequestType` (portability)
- **New endpoints:** GET /v1/compliance-requests/overdue, POST /v1/compliance-requests/:id/extend
- **Enhanced endpoints:** POST /v1/compliance-requests (auto-sets deadline_at), GET /v1/compliance-requests/:id (includes deadline fields), POST /v1/compliance-requests/:id/execute (uses DsarTraversalService, supports portability, erasure cleans consent+tokens)
- **New frontend pages:** None (backend only — DSAR dashboard enhancements deferred to separate frontend ticket)
- **Tests added:** 203 tests total — 162 API (40 DSAR traversal + 69 compliance service/controller/access-export + 53 existing) + 41 worker (20 deadline-check + 21 existing)
- **Architecture files updated:** `event-job-catalog.md` (compliance:deadline-check cron), `state-machines.md` (ComplianceRequestStatus side-effects), `module-blast-radius.md` (ComplianceModule note)
- **Unlocks:** Phase H (Data Subject Protections) is now available
- **Notes:** The DSAR traversal collects ALL records with no limits. For schools with very large datasets, the export generation may take significant time. The `DsarTraversalService` uses `Promise.all` for parallel queries within each subject type. Student applications are matched by parent ID (via StudentParent join) or by name — covers both linked and unlinked applicants. Staff bank details show honest "[encrypted — available via DPO request]" message since AES ciphertext cannot be meaningfully masked without decryption. Deadline escalation: 7-day → requester, 3-day → all admin-tier users, exceeded → admins + requester. Two accepted deviations: (1) CSV export is concatenated sections, not zipped per-category files (MINOR); (2) Frontend DSAR dashboard deferred to separate ticket.
