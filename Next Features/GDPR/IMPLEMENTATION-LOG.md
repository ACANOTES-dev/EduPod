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
| E     | Legal & Privacy Infra    | NOT STARTED | B          | —       | 4–5 days    | [Phase-E](./Phase-E-Legal-Privacy-Infrastructure.md) |
| F     | DSAR Overhaul            | NOT STARTED | B, C, D    | H       | 4–5 days    | [Phase-F](./Phase-F-DSAR-Overhaul.md)                |
| G     | Audit Logging            | COMPLETE    | —          | J       | 2–3 days    | [Phase-G](./Phase-G-Audit-Logging.md)                |
| H     | Data Subject Protections | NOT STARTED | F          | —       | 2 days      | [Phase-H](./Phase-H-Data-Subject-Protections.md)     |
| I     | Retention Engine         | NOT STARTED | C          | —       | 3–4 days    | [Phase-I](./Phase-I-Retention-Engine.md)             |
| J     | Breach Detection         | NOT STARTED | G          | —       | 3–4 days    | [Phase-J](./Phase-J-Breach-Detection.md)             |
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
