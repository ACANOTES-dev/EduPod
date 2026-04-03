# GDPR Integration Plan — EduPod School Operating System

**Prepared:** 26 March 2026
**Revised:** 26 March 2026 (v2 — incorporates tokenisation gateway architecture)
**Basis:** Full codebase audit across 38 modules, 736 endpoints, Prisma schema, worker jobs, third-party integrations
**Regulatory context:** Ireland (DPC jurisdiction) + EU GDPR + Libya (no equivalent regime)
**Status:** Review document — no code changes made

---

## Executive Summary

EduPod is a children-first data platform operating under the direct supervision of the Irish Data Protection Commission — an authority that has made children's data protection one of its five strategic priorities and affords no transitional period to organisations processing children's data.

This plan transforms EduPod from a platform with strong security foundations into a GDPR-exemplary system through one central architectural innovation: **the GDPR Tokenisation Gateway** — a policy-driven service that intercepts every outbound data flow, replaces personal identifiers with random tokens before data leaves EduPod, and maps them back on return. Combined with the existing RLS tenant isolation, AES-256 encryption, audit logging, and DSAR lifecycle, this creates a compliance posture that no school MIS platform in the Irish market currently matches.

### What EduPod Already Has (Foundations)

- **RLS at the database layer** — tenant isolation enforced by Postgres, not application code
- **AES-256-GCM encryption** for bank details and Stripe keys with proper IV/AuthTag separation
- **Append-only audit logging** with sensitive field redaction (passwords, tokens, secrets)
- **Tiered RBAC** (platform/admin/staff/parent) with Redis-cached permission resolution
- **DSAR lifecycle** — submitted → classified → approved → completed with classification options
- **Human-in-the-loop for AI grading** — approval workflow before grades commit

### What This Plan Adds

- **GDPR Tokenisation Gateway** — centralised identity anonymisation for all outbound data flows
- **Policy-driven export classification** — always-tokenise (AI), never-tokenise (DSAR/regulatory), configurable (reports)
- **Full-spectrum audit trail** — every piece of personal data that leaves EduPod is logged: who, what, where, when, why
- **Consent records system** — granular, per-type, withdrawable, with parent portal dashboard
- **Retention policy engine** — automated enforcement with statutory basis documentation
- **Complete DSAR traversal** — all 38 modules, not just 4
- **Breach detection and management** — automated rules, 72-hour DPC notification workflow
- **AI decision audit trail** — prompt/response logging for Article 22 right to explanation
- **Privacy notice infrastructure** — versioned, bilingual, with acknowledgement tracking

---

## Table of Contents

1. [Phase 1 — Launch Blockers](#phase-1--launch-blockers)
2. [Phase 2 — Critical Compliance (30 Days)](#phase-2--critical-compliance-within-30-days)
3. [Phase 3 — Full Compliance Posture (90 Days)](#phase-3--full-compliance-posture-within-90-days)
4. [Phase 4 — Advanced & Future Modules](#phase-4--advanced--future-modules)
5. [Appendix A — Personal Data Classification Map](#appendix-a--personal-data-classification-map)
6. [Appendix B — Third-Party Data Transfer Map](#appendix-b--third-party-data-transfer-map)
7. [Appendix C — Retention Schedule](#appendix-c--retention-schedule)
8. [Appendix D — Audit Logging Gap Analysis](#appendix-d--audit-logging-gap-analysis)
9. [Appendix E — Tokenisation Gateway Technical Specification](#appendix-e--tokenisation-gateway-technical-specification)

---

## Phase 1 — Launch Blockers

These items are non-negotiable. No Irish school's board of management can legally engage a processor without them. The DPC has stated it will afford no transitional period.

---

### 1.1 GDPR Tokenisation Gateway

**The core architectural addition.** A centralised service that sits between EduPod and every external system, replacing personal identifiers with random tokens on outbound data and mapping them back on inbound responses.

#### Why This Exists

Nine third-party services receive personal data from EduPod. For services like Anthropic (AI), the recipient has no legitimate need to know who a student is — they only need the supporting data (grades, attendance) to generate comments or analysis. For services like Tusla (regulatory filing) or DSAR responses, real data is legally required. The tokenisation gateway handles both cases through policy-driven classification.

#### Data Model

```sql
-- Token mapping table (RLS-protected per tenant)
CREATE TABLE gdpr_anonymisation_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_type     VARCHAR(50) NOT NULL,  -- student, parent, staff, household
  entity_id       UUID NOT NULL,
  field_type      VARCHAR(50) NOT NULL,  -- full_name, first_name, last_name,
                                         -- student_number, staff_number,
                                         -- email, phone, national_id
  token           VARCHAR(20) NOT NULL,  -- random alphanumeric, globally unique
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_token UNIQUE (token),
  CONSTRAINT uq_entity_field UNIQUE (tenant_id, entity_type, entity_id, field_type)
);

CREATE INDEX idx_gdpr_tokens_tenant ON gdpr_anonymisation_tokens(tenant_id);
CREATE INDEX idx_gdpr_tokens_lookup ON gdpr_anonymisation_tokens(token);

-- RLS policy
ALTER TABLE gdpr_anonymisation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_tokens_tenant_isolation ON gdpr_anonymisation_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

```sql
-- Export policy table (defines behaviour per export type)
CREATE TABLE gdpr_export_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type     VARCHAR(100) NOT NULL UNIQUE,
  tokenisation    VARCHAR(20) NOT NULL DEFAULT 'always',
                  -- always: locked ON, non-toggleable (AI services)
                  -- never: locked OFF, real data required (DSAR, regulatory)
                  -- configurable: toggle available, defaults to ON
  lawful_basis    VARCHAR(100) NOT NULL,
                  -- data_minimisation, article_15_access,
                  -- legal_obligation, legitimate_interest
  description     TEXT NOT NULL,  -- shown in UI badge tooltip
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

```sql
-- Audit trail for every outbound data flow
CREATE TABLE gdpr_token_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  export_type     VARCHAR(100) NOT NULL,
  tokenised       BOOLEAN NOT NULL,      -- was data anonymised?
  policy_applied  VARCHAR(100) NOT NULL,  -- which policy governed this
  lawful_basis    VARCHAR(100),           -- why real data sent (if not tokenised)
  tokens_used     UUID[],                -- FK references to tokens involved
  entity_count    INT NOT NULL DEFAULT 0, -- how many entities processed
  triggered_by    UUID NOT NULL REFERENCES users(id),
  override_by     UUID REFERENCES users(id), -- if configurable and toggled off, WHO
  override_reason TEXT,                   -- why admin overrode default
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gdpr_usage_tenant ON gdpr_token_usage_log(tenant_id, created_at);

-- RLS policy
ALTER TABLE gdpr_token_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_usage_tenant_isolation ON gdpr_token_usage_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

#### Seed Data for Export Policies

```sql
INSERT INTO gdpr_export_policies (export_type, tokenisation, lawful_basis, description) VALUES
-- AI services: always tokenise, no exceptions
('ai_comments',           'always', 'data_minimisation', 'AI report card comment generation — student identifiers replaced with anonymous tokens'),
('ai_grading',            'always', 'data_minimisation', 'AI-assisted grading — student work assessed without identifiable information'),
('ai_grading_batch',      'always', 'data_minimisation', 'Batch AI grading — multiple students assessed anonymously'),
('ai_progress_summary',   'always', 'data_minimisation', 'AI progress summary generation — student trends analysed without identification'),
('ai_nl_query',           'always', 'data_minimisation', 'Natural language gradebook query — schema sent without student identifiers'),
('ai_report_narrator',    'always', 'data_minimisation', 'AI report narration — aggregate data summarised without student names'),
('ai_predictions',        'always', 'data_minimisation', 'AI trend prediction — historical data analysed without identification'),
('ai_substitution',       'always', 'data_minimisation', 'AI substitute teacher ranking — staff ranked without identifiable names'),
('ai_attendance_scan',    'always', 'data_minimisation', 'AI attendance OCR — sheet images processed without student identifiers'),

-- DSAR and compliance: never tokenise, real data required by law
('dsar_access_export',    'never', 'article_15_access',  'Data Subject Access Request — full personal data export required by Article 15 GDPR'),
('dsar_portability',      'never', 'article_20_portability', 'Data portability export — machine-readable personal data for data subject'),
('compliance_rectification', 'never', 'article_16_rectification', 'Data rectification — real data required for correction'),

-- Regulatory filings: never tokenise, legal obligation
('regulatory_tusla',      'never', 'legal_obligation',   'Tusla/NEWB attendance submission — real student data required by Education (Welfare) Act 2000'),
('regulatory_dept_ed',    'never', 'legal_obligation',   'Department of Education submission — real data required by statutory obligation'),
('regulatory_revenue',    'never', 'legal_obligation',   'Revenue/tax filing — real employee data required by tax law'),

-- Configurable exports: toggle available, defaults to ON
('custom_report_export',  'configurable', 'legitimate_interest', 'Custom report export — toggle GDPR protection on or off'),
('board_report_export',   'configurable', 'legitimate_interest', 'Board report export — may require real data for governance purposes'),
('student_export_pack',   'configurable', 'legitimate_interest', 'Student data export — toggle anonymisation based on purpose'),
('staff_export',          'configurable', 'legitimate_interest', 'Staff data export — toggle anonymisation based on purpose'),
('parent_data_pack',      'configurable', 'legitimate_interest', 'Parent data package — toggle based on recipient and purpose');
```

#### Service Architecture

```typescript
// GdprTokenService — the single chokepoint for all outbound personal data

@Injectable()
export class GdprTokenService {
  // OUTBOUND: tokenise personal data before it leaves EduPod
  async processOutbound(
    tenantId: string,
    exportType: string,
    data: OutboundData,
    triggeredByUserId: string,
    options?: { overrideTokenisation?: boolean; overrideReason?: string },
  ): Promise<{ processedData: OutboundData; tokenMap: TokenMap | null }> {
    const policy = await this.getPolicy(exportType);

    // NEVER tokenise: regulatory, DSAR — real data required
    if (policy.tokenisation === 'never') {
      await this.logUsage(
        tenantId,
        exportType,
        false,
        policy.lawful_basis,
        triggeredByUserId,
        null,
        data.entityCount,
      );
      return { processedData: data, tokenMap: null };
    }

    // ALWAYS tokenise: AI services — no choice
    if (policy.tokenisation === 'always') {
      const { tokenisedData, tokenMap } = await this.tokenise(tenantId, data);
      await this.logUsage(
        tenantId,
        exportType,
        true,
        'data_minimisation',
        triggeredByUserId,
        null,
        data.entityCount,
      );
      return { processedData: tokenisedData, tokenMap };
    }

    // CONFIGURABLE: check toggle
    if (options?.overrideTokenisation === false) {
      // Admin toggled OFF — log who and why
      await this.logUsage(
        tenantId,
        exportType,
        false,
        policy.lawful_basis,
        triggeredByUserId,
        triggeredByUserId,
        data.entityCount,
        options.overrideReason,
      );
      return { processedData: data, tokenMap: null };
    }

    // Configurable, default ON — tokenise
    const { tokenisedData, tokenMap } = await this.tokenise(tenantId, data);
    await this.logUsage(
      tenantId,
      exportType,
      true,
      'data_minimisation',
      triggeredByUserId,
      null,
      data.entityCount,
    );
    return { processedData: tokenisedData, tokenMap };
  }

  // INBOUND: replace tokens with real identifiers in AI responses
  async processInbound(tenantId: string, response: string, tokenMap: TokenMap): Promise<string> {
    let result = response;
    for (const [token, realValue] of tokenMap.entries()) {
      result = result.replaceAll(token, realValue);
    }
    return result;
  }

  // Generate or retrieve a token for an entity+field
  private async getOrCreateToken(
    tenantId: string,
    entityType: string,
    entityId: string,
    fieldType: string,
  ): Promise<string> {
    // Check existing
    const existing = await this.prisma.gdprAnonymisationToken.findUnique({
      where: {
        tenant_id_entity_type_entity_id_field_type: {
          tenant_id: tenantId,
          entity_type: entityType,
          entity_id: entityId,
          field_type: fieldType,
        },
      },
    });
    if (existing) {
      await this.prisma.gdprAnonymisationToken.update({
        where: { id: existing.id },
        data: { last_used_at: new Date() },
      });
      return existing.token;
    }
    // Generate new random token (14-char alphanumeric)
    const token = this.generateToken();
    await this.prisma.gdprAnonymisationToken.create({
      data: {
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        field_type: fieldType,
        token,
      },
    });
    return token;
  }

  // Random 14-character alphanumeric token
  private generateToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    const bytes = crypto.randomBytes(14);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join('');
  }
}
```

#### Integration with AI Services (3 lines per service)

Every AI service follows the same pattern. Example for AI Comments:

```typescript
// BEFORE (current — sends student name to Anthropic):
const studentName = `${reportCard.student.first_name} ${reportCard.student.last_name}`;
const prompt = this.buildPrompt(studentName, grades, attendance);
const response = await this.anthropic.messages.create({ ... });
return response.content;

// AFTER (with tokenisation gateway):
const outbound = {
  entities: [{ type: 'student', id: studentId,
               fields: { full_name: `${student.first_name} ${student.last_name}` } }],
  entityCount: 1
};
const { processedData, tokenMap } = await this.gdprTokenService.processOutbound(
  tenantId, 'ai_comments', outbound, userId
);
const prompt = this.buildPrompt(processedData.entities[0].fields.full_name, grades, attendance);
const response = await this.anthropic.messages.create({ ... });
return this.gdprTokenService.processInbound(tenantId, response.content, tokenMap);
```

Three additional lines. Same pattern for all 9 AI services.

#### UI Component

Three visual states in the frontend:

**Locked ON (always tokenise):**

```
┌─────────────────────────────────────┐
│ 🛡  GDPR Protected                  │
│ Student identifiers are anonymised  │
│ before leaving EduPod               │
│ [shield icon, greyed toggle, locked]│
└─────────────────────────────────────┘
```

**Locked OFF (never tokenise — regulatory/DSAR):**

```
┌─────────────────────────────────────┐
│ ℹ  Personal Data Export             │
│ Real data included — lawful basis:  │
│ Article 15 GDPR (Data Access Right) │
│ [info icon, no toggle]             │
└─────────────────────────────────────┘
```

**Configurable (toggle available):**

```
┌─────────────────────────────────────┐
│ 🛡  GDPR Protection  [━━━━━ ON]    │
│ Student identifiers will be         │
│ anonymised in this export           │
│ [toggle to OFF requires reason]    │
└─────────────────────────────────────┘
```

When an admin toggles OFF on a configurable export, a modal asks for a reason (free text, required). This is logged in the audit trail.

**Effort:** 5 days total (token service 1d, audit trail 0.5d, AI integrations 2d, UI 0.5d, tests 1d)

---

### 1.2 Merge Dual Anonymisation Implementation

**The problem.** Two separate anonymisation code paths exist with different logic:

- **API service** (`anonymisation.service.ts`): Uses `ANONYMISED-{entityId}` tags, handles report card snapshots, handles payslip snapshots, has idempotency checks
- **Worker processor** (`compliance-execution.processor.ts`): Uses `ANONYMISED-{randomUUID}` tags, skips report card/payslip snapshots, no idempotency

Nothing in the codebase enqueues `compliance:execute` worker jobs — the API service handles execution synchronously. The worker code is a superseded implementation.

**The fix:**

1. Extract `AnonymisationService` logic to a shared location importable by both API and worker
2. Delete the duplicate anonymisation methods from the worker processor
3. Have the worker processor delegate to the shared service
4. Add the missing fields to anonymisation scope (see 2.2 for full list)

**Will it break something?** No. The API path is the active execution path. The worker's anonymisation methods have no callers. Merging improves the situation — if someone later routes erasure through the worker (for large datasets), it'll use the complete implementation.

**Effort:** Half day

---

### 1.3 Schedule Missing Cron Jobs

**The problem.** Two cleanup processors exist as fully written code but are never registered as cron jobs in `cron-scheduler.service.ts`:

- `IpCleanupProcessor` — nullifies `source_ip` on contact form submissions older than 90 days
- `ImportFileCleanupProcessor` — deletes S3 files for completed/failed imports older than 24 hours

**The fix:** Add to `cron-scheduler.service.ts`:

```typescript
// IP address cleanup — daily 04:00 UTC
await this.notificationsQueue.add(
  IP_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 4 * * *' },
    jobId: 'cron:communications:ip-cleanup',
  },
);

// Import file cleanup — daily 05:00 UTC
await this.importsQueue.add(
  IMPORT_FILE_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 5 * * *' },
    jobId: 'cron:imports:file-cleanup',
  },
);
```

**Will it break something?** No. IP cleanup sets `source_ip` to NULL on old contact form submissions — nothing queries by `source_ip` for functionality. S3 file cleanup deletes temp files for imports already completed/failed — the files are never read again. Both processors handle edge cases (empty result sets, S3 delete failures).

**Effort:** 30 minutes

---

### 1.4 Data Processing Agreement (DPA)

**Gap:** No DPA template or acceptance workflow exists. Tenant onboarding creates a school with zero legal documentation.

**What's needed:**

- Article 28-compliant DPA template covering: processing scope (all 38 modules' data categories), sub-processor list with change notification, breach notification SLA (EduPod notifies controller within 24 hours), DSAR assistance obligations, data return/deletion on termination, audit rights, international transfer mechanisms
- DPA acceptance step in tenant onboarding workflow
- Versioned DPA storage with acceptance timestamps

**Data model:**

```sql
CREATE TABLE data_processing_agreements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  dpa_version       VARCHAR(20) NOT NULL,
  accepted_by_user_id UUID NOT NULL REFERENCES users(id),
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  dpa_content_hash  VARCHAR(128) NOT NULL,
  ip_address        VARCHAR(45),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Integration:** `DpaAcceptedGuard` checks tenant has accepted current DPA version before any data processing. Returns 403 with redirect to DPA acceptance page if not accepted.

**Owner:** Legal (draft DPA) + Engineering (acceptance workflow)
**Effort:** Medium (engineering 2-3 days; legal timeline depends on solicitor)

---

### 1.5 Privacy Notice Template & Infrastructure

**Gap:** No privacy notice template, no versioning, no tracking of which users have seen which version.

**Data model:**

```sql
CREATE TABLE privacy_notice_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  version_number    INT NOT NULL,
  content_html      TEXT NOT NULL,
  content_html_ar   TEXT,
  effective_date    DATE NOT NULL,
  published_at      TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, version_number)
);

CREATE TABLE privacy_notice_acknowledgements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  privacy_notice_version_id UUID NOT NULL REFERENCES privacy_notice_versions(id),
  acknowledged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address        VARCHAR(45),
  UNIQUE(tenant_id, user_id, privacy_notice_version_id)
);
```

**Includes:**

- Pre-populated English + Arabic template covering all processing activities, sub-processors, data categories, lawful bases, retention periods, data subject rights, AI processing disclosure (including tokenisation gateway), cross-border transfer details
- Parent portal "How we use your data" persistent link
- Notification to users when privacy notice is updated
- Re-acknowledgement required when substantive changes are made

**Effort:** Medium (engineering 2 days; content from legal)

---

### 1.6 Consent Records System

**Gap:** No `consent_records` table exists. Health data is collected without consent tracking. WhatsApp channel selection has no consent record. AI feature processing has no opt-in mechanism.

**Data model:**

```sql
CREATE TABLE consent_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  subject_type      VARCHAR(20) NOT NULL,  -- student, parent, staff, applicant
  subject_id        UUID NOT NULL,
  consent_type      VARCHAR(50) NOT NULL,
                    -- health_data, allergy_data, medical_notes, photo_use,
                    -- whatsapp_channel, email_marketing, ai_grading,
                    -- ai_comments, ai_risk_detection, ai_progress_summary,
                    -- cross_school_benchmarking, homework_diary
  status            VARCHAR(20) NOT NULL DEFAULT 'granted',  -- granted, withdrawn, expired
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at      TIMESTAMPTZ,
  granted_by_user_id UUID NOT NULL REFERENCES users(id),
  evidence_type     VARCHAR(30) NOT NULL,
                    -- in_app_modal, registration_form, paper_form, email_link
  privacy_notice_version_id UUID REFERENCES privacy_notice_versions(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_active_consent
    UNIQUE (tenant_id, subject_type, subject_id, consent_type)
    -- enforced at app layer: only one active consent per type
);

CREATE INDEX idx_consent_tenant_subject ON consent_records(tenant_id, subject_type, subject_id);
CREATE INDEX idx_consent_tenant_type ON consent_records(tenant_id, consent_type);
```

**Integration points:**

- Parent registration: consent checkboxes for health data, WhatsApp, AI features
- Parent portal: consent dashboard showing all active consents with one-click withdrawal
- Notification dispatch: check consent status before WhatsApp delivery
- AI services: check consent before processing (in addition to tokenisation)
- Admissions: consent collection during application
- Consent withdrawal cascade: immediate effect on all downstream processing

**Effort:** High (3-4 days)

---

### 1.7 Sub-Processor Register

**Gap:** No public-facing or internal sub-processor list.

**Current sub-processors identified from codebase audit:**

| Sub-processor    | Purpose          | Data Categories                                   | Location       | Transfer Mechanism |
| ---------------- | ---------------- | ------------------------------------------------- | -------------- | ------------------ |
| Hetzner          | VPS hosting      | All categories                                    | Germany (EU)   | None needed        |
| Anthropic        | AI processing    | **Tokenised only** — no identifiable student data | US             | SCCs + DPF + DPIA  |
| Stripe           | Payments         | Household IDs, amounts (no names)                 | US/EU          | Stripe DPA         |
| Sentry           | Error monitoring | IP, error context (auth scrubbed)                 | US             | SCCs + DPF         |
| Cloudflare       | CDN, SSL, WAF    | Request metadata, IPs                             | Global         | Cloudflare DPA     |
| Resend (planned) | Email delivery   | Email, names, message content                     | US             | SCCs + DPF         |
| Twilio (planned) | WhatsApp         | Phone numbers, message content                    | US             | SCCs + DPF         |
| AWS S3           | File storage     | Import files, payslips, exports                   | EU (eu-west-1) | None needed        |
| Meilisearch      | Search           | Names, emails, student numbers                    | Self-hosted    | None needed        |

**Note:** After tokenisation gateway implementation, the Anthropic entry changes from "student names, grades, attendance" to "tokenised identifiers + non-identifying academic data." This is a material improvement in the sub-processor register and the DPA.

**Implementation:** Public page accessible from school websites, change notification to all tenant admins, 30-day objection period.

**Effort:** Low (1 day)

---

### 1.8 Privacy-First Tenant Defaults

**Gap:** AI features default to ON. The GDPR principle of data protection by default (Article 25(2)) requires the opposite.

**Changes to `tenantSettingsSchema`:**

| Setting                                     | Current Default | New Default |
| ------------------------------------------- | --------------- | ----------- |
| `behaviour.ai_insights_enabled`             | `true`          | `false`     |
| `behaviour.ai_narrative_enabled`            | `true`          | `false`     |
| `behaviour.ai_nl_query_enabled`             | `true`          | `false`     |
| `behaviour.behaviour_pulse_enabled`         | `true`          | `false`     |
| `behaviour.parent_portal_behaviour_enabled` | `true`          | `false`     |
| `gradebook.riskDetection.enabled`           | `true`          | `false`     |

**New settings to add:**

```typescript
ai: z.object({
  gradingEnabled: z.boolean().default(false),
  commentsEnabled: z.boolean().default(false),
  progressSummariesEnabled: z.boolean().default(false),
  nlQueriesEnabled: z.boolean().default(false),
  reportNarrationEnabled: z.boolean().default(false),
  predictionsEnabled: z.boolean().default(false),
  substitutionRankingEnabled: z.boolean().default(false),
  attendanceScanEnabled: z.boolean().default(false),
}).default({});
```

Each AI service checks its tenant setting before processing. If disabled, returns a clear message: "This feature requires opt-in. Enable it in Settings > AI Features."

**Effort:** Low (half day)

---

## Phase 2 — Critical Compliance (Within 30 Days)

### 2.1 Complete DSAR Data Traversal

**Gap:** The access export covers 4 entity types with limited depth (~15-20% of personal data). Article 15 requires ALL personal data.

**Current coverage vs required:**

| Data Category            | Currently Exported       | Missing                                                            |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ |
| Student profile          | Partial                  | middle_name, national_id, DOB, gender, nationality                 |
| Student attendance       | Last 100                 | All records + pattern alerts                                       |
| Student grades           | Yes                      | GPA snapshots, competency snapshots, risk alerts, progress reports |
| Student report cards     | No                       | Full snapshots                                                     |
| Student behaviour        | No                       | All incidents, sanctions, appeals, exclusions, recognition         |
| Student admissions       | No                       | Application data, notes, form responses                            |
| Parent profile           | Yes                      | Communication log missing                                          |
| Parent inquiries         | No                       | All inquiry messages                                               |
| Parent financial         | 50 invoices, 50 payments | All + refunds, credit notes, payment plans, scholarships           |
| Household                | Yes                      | Emergency contacts, fee assignments                                |
| Staff profile            | Basic only               | Payroll entries, compensation, allowances, deductions              |
| Staff bank details       | No                       | Should include with masking                                        |
| Audit logs about subject | No                       | All entries referencing the subject                                |
| Notifications sent       | No                       | All delivery records                                               |
| Tokenisation log         | No                       | All token usage for the subject                                    |

**New subject types:**

- `applicant` — for pre-enrolment data (separate retention rules)
- `staff` — as first-class citizen (not routed through `user`)

**Export format:** JSON primary + CSV secondary (machine-readable, Article 20 portability). No hard record limits — export ALL data.

**DSAR exports use the `never` tokenisation policy** — real data is returned to the data subject. The UI shows "Personal Data Export — Article 15 GDPR" badge.

**Effort:** High (3-4 days)

---

### 2.2 Fix Anonymisation Completeness

**Gap:** Anonymisation leaves re-identifiable quasi-identifiers.

**Fields NOT anonymised but should be:**

| Entity    | Field                                                  | Risk                                               | Fix                                      |
| --------- | ------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------- |
| Student   | `date_of_birth`                                        | Combined with gender+nationality = re-identifiable | Set to year-only (YYYY-01-01)            |
| Student   | `national_id`                                          | Unique identifier                                  | Clear to NULL                            |
| Student   | `middle_name`                                          | Not even attempted                                 | Anonymise with tag                       |
| Student   | `gender`, `nationality`, `city_of_birth`               | Quasi-identifiers                                  | Clear to NULL                            |
| Household | `address_line_1/2`, `city`, `country`, `postal_code`   | Full address                                       | Clear to NULL                            |
| Staff     | `bank_account_number_encrypted`, `bank_iban_encrypted` | Encrypted but not cleared                          | Set to NULL                              |
| Staff     | `staff_number`                                         | Identifier                                         | Anonymise with tag                       |
| All       | Attendance records                                     | Linked by student_id                               | Anonymise student_id reference or remove |
| All       | Grades                                                 | Linked by student_id                               | Anonymise student_id reference           |
| All       | Behaviour records                                      | Not touched at all                                 | Full cascade anonymisation               |
| All       | Admissions data                                        | Not touched                                        | Anonymise application data               |
| All       | Notification records                                   | Not touched                                        | Anonymise delivery records               |
| All       | Parent inquiry messages                                | Not touched                                        | Anonymise messages                       |

**Secondary system cleanup (must be part of anonymisation):**

- Meilisearch: call `removeEntity()` for the subject
- Redis: invalidate all cached data for the subject (previews, sessions, permissions)
- S3: delete compliance export files for previous requests
- Tokenisation table: delete all tokens for the anonymised entity

**Effort:** High (2-3 days)

---

### 2.3 DSAR Deadline Tracking

**Gap:** No deadline tracking. Article 12(3): respond within 30 calendar days.

**Schema additions:**

```sql
ALTER TABLE compliance_requests ADD COLUMN deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN extension_granted BOOLEAN DEFAULT false;
ALTER TABLE compliance_requests ADD COLUMN extension_reason TEXT;
ALTER TABLE compliance_requests ADD COLUMN extension_deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN deadline_exceeded BOOLEAN DEFAULT false;
```

**New cron job:** `compliance:deadline-check` (daily)

- Auto-set `deadline_at` = `created_at + 30 days` on creation
- 7 days before deadline: notify compliance admin
- 3 days before: escalate to school owner
- On deadline: flag `deadline_exceeded`, notify platform admin

**Effort:** Low-Medium (1 day)

---

### 2.4 Audit Logging — Read Access and Security Events

**Gap:** Interceptor only logs POST/PUT/PATCH/DELETE. Zero read access logging. No security event logging.

**Priority read access logging:**

| Endpoint                                 | Category            | Implementation                                       |
| ---------------------------------------- | ------------------- | ---------------------------------------------------- |
| `GET v1/students/:id` (allergy/medical)  | Special category    | `@SensitiveDataAccess('special_category')` decorator |
| `GET v1/students/allergy-report`         | Special category    | Same decorator                                       |
| `GET v1/staff-profiles/:id/bank-details` | Financial           | Same decorator                                       |
| `GET v1/students/:id/export-pack`        | All student data    | Same decorator                                       |
| `GET v1/compliance-requests/:id/export`  | DSAR response       | Same decorator                                       |
| All report endpoints                     | Analytics/profiling | Same decorator                                       |
| Platform admin impersonation             | Cross-tenant        | Interceptor on impersonation header                  |

**Security event logging (add to AuthService):**

| Event                   | Current State                | Fix                    |
| ----------------------- | ---------------------------- | ---------------------- |
| Login success           | Only `last_login_at` updated | Add audit entry        |
| Login failure           | Only Redis counter           | Add audit entry        |
| MFA setup/disable       | Not logged                   | Add audit entry        |
| Password reset          | Not logged                   | Add audit entry        |
| Session revocation      | Not logged                   | Add audit entry        |
| Permission denied (403) | Not logged                   | Add to PermissionGuard |
| Brute force lockout     | Not logged                   | Add audit entry        |

**Effort:** Medium (2-3 days)

---

### 2.5 Admissions Form Data Minimisation Guardrails

**Gap:** Form builder allows arbitrary fields. No warnings about special category data at pre-enrolment stage. DPC August 2025 guidance specifically flags this.

**Fix:**

- Field keyword detection: when field label/key matches health, medical, religion, ethnicity, disability, race, sexual orientation → display warning
- Warning text: "The DPC advises against collecting health, religious, or ethnic data at the pre-enrolment stage. Consider collecting post-enrolment with explicit consent."
- Option to block entirely or require admin override with audit log entry

**Effort:** Low (1 day)

---

### 2.6 Age-Gated Data Rights

**Gap:** DPC Toolkit confirms students aged 17+ exercise their own rights. EduPod stores DOB but has no age-gated logic.

**Fix:**

- DSAR for student aged 17+: flag for school review before processing
- Parent DSAR for their 17+ student: require school confirmation
- Add `student` as direct DSAR submitter type
- Parent portal visibility for 17+ students: flag to school

**Effort:** Low-Medium (1 day)

---

## Phase 3 — Full Compliance Posture (Within 90 Days)

### 3.1 Retention Policy Engine

**Gap:** Most data categories have no defined retention period. Everything is kept forever.

**Data model:**

```sql
CREATE TABLE retention_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id),  -- NULL = platform default
  data_category         VARCHAR(50) NOT NULL,
  retention_months      INT NOT NULL,
  action_on_expiry      VARCHAR(20) NOT NULL DEFAULT 'anonymise',
                        -- anonymise, delete, archive
  is_overridable        BOOLEAN NOT NULL DEFAULT true,
  statutory_basis       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Default retention schedule (seeded):**

| Data Category                   | Retention                | Basis                    | Action       |
| ------------------------------- | ------------------------ | ------------------------ | ------------ |
| Active student records          | Enrolment + 84 months    | Educational + tax        | Anonymise    |
| Graduated/withdrawn             | 84 months post-departure | Statutory + references   | Anonymise    |
| Rejected admissions             | 12 months post-decision  | Appeals window           | Delete       |
| Financial records               | Current year + 72 months | Irish tax law (TCA 1997) | Anonymise    |
| Payroll records                 | Current year + 72 months | Revenue requirements     | Anonymise    |
| Staff records (post-employment) | 84 months post-departure | Employment law           | Anonymise    |
| Attendance records              | Enrolment + 24 months    | Educational records      | Anonymise    |
| Behaviour records               | Enrolment + 12 months    | Legitimate interest      | Delete       |
| Child protection / safeguarding | Indefinite               | Child protection law     | Never delete |
| Communications / notifications  | 12 months                | Operational              | Delete       |
| Audit logs                      | 36 months (configurable) | Accountability           | Delete       |
| Contact form submissions        | 12 months                | Legitimate interest      | Delete       |
| Parent inquiry messages         | 24 months                | Operational              | Delete       |
| NL query history                | 12 months                | Storage limitation       | Delete       |
| AI processing logs              | 24 months                | Accountability           | Delete       |
| Tokenisation usage logs         | 36 months                | Accountability           | Delete       |
| S3 compliance exports           | 3 months after download  | Storage limitation       | Delete       |

**Cron job:** `data-retention:enforce` (weekly) — iterates policies, identifies expired records, queues anonymisation/deletion, logs all actions.

**Effort:** High (3-4 days)

---

### 3.2 Breach Detection & Management

**Data model:**

```sql
CREATE TABLE security_incidents (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity                  VARCHAR(20) NOT NULL,  -- low, medium, high, critical
  incident_type             VARCHAR(50) NOT NULL,
  description               TEXT NOT NULL,
  affected_tenants          UUID[],
  affected_data_subjects_count INT,
  data_categories_affected  TEXT[],
  containment_actions       TEXT,
  reported_to_controllers_at TIMESTAMPTZ,
  reported_to_dpc_at        TIMESTAMPTZ,
  root_cause                TEXT,
  remediation               TEXT,
  status                    VARCHAR(20) NOT NULL DEFAULT 'detected',
  created_by_user_id        UUID NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Automated detection rules:**

- Failed RLS assertion logging
- Unusual data access patterns (100+ student records in 1 minute)
- Failed authentication spikes
- Cross-tenant data access attempts

**Platform admin workflow:** Incident creation, management, DPC notification template (72-hour window), controller notification.

**Effort:** High (3-4 days)

---

### 3.3 AI Decision Audit Trail

**Data model:**

```sql
CREATE TABLE ai_processing_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  ai_service          VARCHAR(50) NOT NULL,
  subject_type        VARCHAR(20),
  subject_id          UUID,
  model_used          VARCHAR(100),
  prompt_hash         VARCHAR(128),       -- SHA-256 of prompt (storage efficient)
  prompt_summary      TEXT,               -- truncated/redacted for review
  response_summary    TEXT,               -- truncated response
  input_data_categories TEXT[],           -- what went in: ['grades', 'attendance']
  tokenised           BOOLEAN NOT NULL,   -- was the input tokenised?
  output_used         BOOLEAN,            -- was the AI output accepted by the user?
  accepted_by_user_id UUID,
  accepted_at         TIMESTAMPTZ,
  confidence_score    DECIMAL(3,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Retention: 24 months (align with academic appeal periods).

**This table, combined with the tokenisation usage log, gives Article 22 compliance:** If a parent asks "why did you give my child this grade," the system can show: what data went to the AI (tokenised, so no identifiable data left EduPod), what the AI suggested, whether a human reviewed it, and who accepted it.

**Effort:** Medium (2 days)

---

### 3.4 Cookie Consent for Public Pages

Cookie consent banner on all public pages. No non-essential cookies before consent. IP address collection disclosure on contact form.

**Effort:** Low-Medium (1-2 days)

---

### 3.5 Sentry PII Enhancement

- Reduce `replaysOnErrorSampleRate` to 0.1 or implement PII masking in replays
- Add `beforeSendTransaction` hook to strip tenant-scoped data from transaction names
- Add explicit scrubbing for student/parent IDs in error context

**Effort:** Low (half day)

---

### 3.6 Encryption Key Management

Implement key rotation: encrypt-with-new, decrypt-with-old-or-new. Store key version alongside encrypted data. Document key management in security measures.

**Effort:** Medium (2-3 days)

---

## Phase 4 — Advanced & Future Modules

### 4.1 DPIAs Required Before Development

| Module                             | DPIA Trigger                                            | Risk Level |
| ---------------------------------- | ------------------------------------------------------- | ---------- |
| Behaviour Management               | Children's behavioural data; potential special category | High       |
| Student Wellbeing / Pastoral Care  | Tier 3 child protection records                         | Critical   |
| Predictive Early Warning           | Cross-module profiling of children                      | Critical   |
| EduPod Intelligence (benchmarking) | Cross-tenant data aggregation                           | High       |
| Digital Homework Diary             | Direct student interaction                              | Medium     |
| Smart Parent Digest                | Engagement tracking                                     | Medium     |
| Leave → Substitution Pipeline      | Staff health data                                       | Medium     |
| Tusla/Regulatory Filing            | Statutory data export (never-tokenise policy)           | Medium     |

### 4.2 Behaviour Module GDPR Integration

When built, must integrate with:

1. Consent records: `consent_type: 'behaviour_publication'`
2. Tokenisation gateway: AI behaviour insights go through `always` policy
3. Retention: enrolment + 12 months only
4. DSAR traversal: all incidents, sanctions, appeals, exclusions, recognition
5. Anonymisation cascade: full participant anonymisation
6. Audit logging: read access for all behaviour data
7. Data classification: tag as `ordinary`, `special_category`, or `child_protection`
8. Legal hold: prevent deletion of records under proceedings

### 4.3 Regulatory Filing Module

When built (Tusla attendance, Department of Education submissions):

- Export policy: `never` — real data required
- UI badge: "Regulatory Export — [statutory reference]"
- Audit trail: full logging of what was submitted, when, to whom, by whom
- Tokenisation gateway passes through without modification
- Lawful basis documented per filing type

### 4.4 Cross-Tenant Benchmarking (EduPod Intelligence)

- K-anonymity with minimum cohort size 10 (already in settings)
- Genuinely anonymised data for cross-tenant comparisons (NOT pseudonymised)
- Tokenisation not sufficient — must be statistically anonymous
- Small-cohort suppression
- Opt-in per tenant (already defaults to `false`)

---

## Appendix A — Personal Data Classification Map

### Ordinary Personal Data

| Table                          | Fields                                                                                          | RLS           | Retention         |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| `users`                        | first_name, last_name, email                                                                    | No (platform) | Indefinite        |
| `parents`                      | first_name, last_name, email, phone, whatsapp_phone                                             | Yes           | Enrolment + 7y    |
| `students`                     | first_name, last_name, full_name, \*\_ar, student_number, DOB, gender, nationality, national_id | Yes           | Enrolment + 7y    |
| `households`                   | household_name, address_line_1/2, city, country, postal_code                                    | Yes           | Enrolment + 7y    |
| `household_emergency_contacts` | name, phone, relationship                                                                       | Yes           | Tied to household |
| `staff_profiles`               | job_title, department, staff_number                                                             | Yes           | Employment + 7y   |
| `applications`                 | student names, form answers (JSONB)                                                             | Yes           | 1y post-decision  |
| `contact_form_submissions`     | name, email, phone, message, source_ip                                                          | Yes           | 12 months         |

### Special Category Data (Article 9)

| Table                            | Fields                                      | Lawful Basis                       | Safeguards                      |
| -------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------- |
| `students`                       | medical_notes, has_allergy, allergy_details | Vital interests + explicit consent | Consent record + enhanced audit |
| `behaviour_incidents` (future)   | Details referencing mental health, SEN      | Legitimate interest                | DPIA + data classification      |
| `safeguarding_concerns` (future) | Child protection records                    | Vital interests                    | DLP fortress, break-glass       |
| Staff absence records            | Absence reasons (health)                    | Contract + legal obligation        | Limited access                  |

### Financial Data

| Table                                                 | Encrypted?             | Retention        |
| ----------------------------------------------------- | ---------------------- | ---------------- |
| `staff_profiles` (bank details)                       | AES-256-GCM            | Employment + 6y  |
| `tenant_stripe_configs`                               | AES-256-GCM            | Tenant lifecycle |
| `invoices`, `payments`, `payroll_entries`, `payslips` | No (plaintext amounts) | Current + 6y     |

### Profiling / Automated Decision-Making

| Table                          | Type                         | Tokenised?        | DPIA? |
| ------------------------------ | ---------------------------- | ----------------- | ----- |
| `student_academic_risk_alerts` | Algorithmic profiling (cron) | N/A (internal)    | Yes   |
| `grades` (ai_assisted)         | AI-assisted grading          | Yes (via gateway) | Yes   |
| `report_cards` (AI comments)   | AI-generated text            | Yes (via gateway) | Yes   |
| `nl_query_history`             | NL queries                   | Yes (via gateway) | Yes   |

---

## Appendix B — Third-Party Data Transfer Map

### After Tokenisation Gateway Implementation

| Service              | Data Sent                                         | Identifiable?                                  | Transfer Mechanism |
| -------------------- | ------------------------------------------------- | ---------------------------------------------- | ------------------ |
| **Anthropic**        | Tokenised IDs + grades + attendance + work images | **No** — tokens are meaningless outside EduPod | SCCs + DPF + DPIA  |
| **Stripe**           | Household/invoice IDs + amounts (no names)        | No                                             | Stripe DPA         |
| **Sentry**           | Error context (auth scrubbed, PII disabled)       | Low risk                                       | SCCs + DPF         |
| **Cloudflare**       | Request metadata, IPs                             | Metadata only                                  | Cloudflare DPA     |
| **Resend** (planned) | Email, name, content                              | Yes (necessary for delivery)                   | SCCs + DPF         |
| **Twilio** (planned) | Phone, content                                    | Yes (necessary for delivery)                   | SCCs + DPF         |
| **AWS S3**           | Files (import CSVs, payslips, exports)            | Yes (encrypted at rest)                        | EU region          |
| **Meilisearch**      | Names, emails, student numbers                    | Yes (self-hosted, no transfer)                 | Self-hosted        |

**Key change:** Anthropic moves from "receives identifiable student data" to "receives tokenised data with no re-identification pathway." This materially changes the risk profile of the most sensitive third-party relationship.

---

## Appendix C — Retention Schedule

### Automated Enforcement

| Category                | Period                  | Action  | Cron            |
| ----------------------- | ----------------------- | ------- | --------------- |
| Contact form IPs        | 90 days                 | Nullify | Daily 04:00 UTC |
| S3 import temp files    | 24 hours                | Delete  | Daily 05:00 UTC |
| Audit logs              | 36 months               | Delete  | Weekly          |
| Notifications           | 12 months               | Delete  | Weekly          |
| Contact form content    | 12 months               | Delete  | Weekly          |
| Parent inquiry messages | 24 months               | Delete  | Weekly          |
| NL query history        | 12 months               | Delete  | Weekly          |
| AI processing logs      | 24 months               | Delete  | Weekly          |
| Tokenisation usage logs | 36 months               | Delete  | Weekly          |
| Rejected admissions     | 12 months post-decision | Delete  | Weekly          |
| S3 compliance exports   | 3 months post-download  | Delete  | Weekly          |
| Redis sessions          | 7 days                  | Expire  | Automatic TTL   |
| Redis permission cache  | 60 seconds              | Expire  | Automatic TTL   |
| Redis preview cards     | 30 seconds              | Expire  | Automatic TTL   |

---

## Appendix D — Audit Logging Gap Analysis

### Current vs Required

| Category                            | Today                        | After Implementation                  |
| ----------------------------------- | ---------------------------- | ------------------------------------- |
| Mutations (create/update/delete)    | Logged                       | Logged                                |
| Read access — special category data | Not logged                   | Logged via `@SensitiveDataAccess`     |
| Read access — financial data        | Not logged                   | Logged                                |
| Data exports                        | Not logged                   | Logged                                |
| DSAR actions                        | Logged (as generic mutation) | Logged with explicit DSAR context     |
| Login/logout                        | Not logged                   | Logged                                |
| MFA events                          | Not logged                   | Logged                                |
| Password changes                    | Not logged                   | Logged                                |
| Permission denied                   | Not logged                   | Logged                                |
| Brute force                         | Not logged                   | Logged                                |
| Platform admin impersonation        | Not logged                   | Logged                                |
| Consent grant/withdrawal            | N/A (no consent system)      | Logged                                |
| **Outbound data flows**             | Not logged                   | **Logged via tokenisation usage log** |
| **AI processing decisions**         | Not logged                   | **Logged via AI processing log**      |

---

## Appendix E — Tokenisation Gateway Technical Specification

### Token Format

- 14 characters, alphanumeric (A-Z excluding I/O, 2-9 excluding 0/1)
- Character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars, no ambiguous characters)
- Random generation via `crypto.randomBytes(14)`
- Collision space: 32^14 = 1.7 × 10^21 — effectively zero collision probability
- Example: `XR7K92MP4FN5VT`

### Token Lifecycle

1. **Created** on first outbound request involving the entity+field
2. **Reused** on subsequent requests (same entity always gets same token for consistency)
3. **Deleted** when entity is anonymised via DSAR erasure
4. **Never exported** — the mapping table stays inside EduPod

### What Gets Tokenised

| Field Type           | Example Real Value | Example Token    | Tokenised?           |
| -------------------- | ------------------ | ---------------- | -------------------- |
| Student full name    | Sarah O'Brien      | XR7K92MP4FN5VT   | Yes                  |
| Student number       | S-202609-0042      | 8NQ2WL3V9THP6K   | Yes                  |
| Staff full name      | John Murphy        | KF4RT7YN2MC8PX   | Yes                  |
| National ID          | 1234567T           | 5WG9JP3LQ6VR8N   | Yes                  |
| Email                | sarah@example.com  | (not sent to AI) | N/A                  |
| Phone                | +353 1 234 5678    | (not sent to AI) | N/A                  |
| Math grade: 85%      | 85                 | 85               | No — not identifying |
| Attendance: 94%      | 94                 | 94               | No — not identifying |
| Subject: Mathematics | Mathematics        | Mathematics      | No — not identifying |

### Policy Decision Flow

```
Export request received
    │
    ▼
Read policy for export_type
    │
    ├── tokenisation = 'always' ──────► Tokenise ──► Send ──► Log (tokenised: true)
    │   (AI services)
    │
    ├── tokenisation = 'never' ───────► Pass through ──► Send ──► Log (tokenised: false, basis: X)
    │   (DSAR, regulatory)
    │
    └── tokenisation = 'configurable' ─┬► Toggle ON ──► Tokenise ──► Send ──► Log
                                        │  (default)
                                        │
                                        └► Toggle OFF ──► Require reason ──► Send ──► Log
                                           (admin override)     (who + why recorded)
```

### Security Properties

1. **Tokens are meaningless outside EduPod.** No derivation algorithm, no pattern, no correlation to real data. Random generation from cryptographic source.
2. **Mapping table is RLS-protected.** Tenant A's tokens are invisible to Tenant B. Same isolation as every other tenant-scoped table.
3. **Mapping table never leaves EduPod.** Not included in exports, backups are encrypted, not synced to any external service.
4. **Full audit trail.** Every tokenisation/detokenisation operation is logged with: who triggered it, what service received the data, whether data was tokenised, and if not, why not.
5. **Token deletion on erasure.** When a student is anonymised via DSAR, their token mappings are deleted. Even if Anthropic retained old data, the tokens can no longer be resolved.

---

## Implementation Sequence

```
Phase 1 (Launch Blockers — ~2 weeks engineering):
  1.1 Tokenisation Gateway ─────┐ 5 days
  1.2 Merge Anonymisation ──────┤ 0.5 day
  1.3 Schedule Cron Jobs ───────┤ 0.5 day
  1.4 DPA ──────────────────────┤ 2-3 days (+ legal)
  1.5 Privacy Notice ───────────┤ 2 days (+ legal)
  1.6 Consent Records ─────────┤ 3-4 days
  1.7 Sub-processor Register ──┤ 1 day
  1.8 Privacy-First Defaults ──┘ 0.5 day

Phase 2 (Within 30 Days — ~2 weeks engineering):
  2.1 DSAR Traversal ──────────┐ 3-4 days
  2.2 Anonymisation Fix ───────┤ 2-3 days
  2.3 Deadline Tracking ───────┤ 1 day
  2.4 Audit Logging ───────────┤ 2-3 days
  2.5 Admissions Guardrails ───┤ 1 day
  2.6 Age-Gated Rights ────────┘ 1 day

Phase 3 (Within 90 Days — ~2 weeks engineering):
  3.1 Retention Engine ────────┐ 3-4 days
  3.2 Breach Detection ────────┤ 3-4 days
  3.3 AI Audit Trail ─────────┤ 2 days
  3.4 Cookie Consent ──────────┤ 1-2 days
  3.5 Sentry Enhancement ─────┤ 0.5 day
  3.6 Key Management ──────────┘ 2-3 days

Phase 4 (Before Future Modules):
  4.1 DPIAs ──── Before any new module development
  4.2 Behaviour GDPR ── Integrated during build
  4.3 Regulatory Filing ── When Tusla/DeptEd module built
  4.4 Benchmarking ── When EduPod Intelligence built
```

---

## Legal Documents Checklist

| Document                               | Owner           | Status      | Blocked By |
| -------------------------------------- | --------------- | ----------- | ---------- |
| Data Processing Agreement (DPA)        | Solicitor       | Not started | —          |
| Privacy Policy (EduPod as controller)  | Solicitor       | Not started | —          |
| Privacy Notice Template (for schools)  | Solicitor + Eng | Not started | 1.5        |
| Sub-processor List (public)            | Engineering     | Not started | 1.7        |
| Data Retention Policy                  | Solicitor + Eng | Not started | 3.1        |
| DPIA — Platform Level                  | DPO/Solicitor   | Not started | —          |
| DPIA — AI Features                     | DPO/Solicitor   | Not started | 1.1        |
| ROPA (Record of Processing Activities) | DPO             | Not started | —          |
| Breach Response Plan                   | DPO/Solicitor   | Not started | 3.2        |
| Cookie Policy                          | Solicitor       | Not started | 3.4        |
| Terms of Service                       | Solicitor       | Not started | 1.4        |

**Recommended next step:** Engage an Irish data protection solicitor. The tokenisation gateway materially strengthens every legal document — the DPA can state "student identifiable data is never transmitted to AI sub-processors," the privacy notice can explain the anonymisation mechanism, and the DPIA for AI features can document the tokenisation as a safeguard. These are not just policy statements — they're architecturally verifiable claims.

---

## What Makes This Plan Different

Most school platforms approach GDPR as a compliance checkbox: add a privacy policy page, build a DSAR form, write a cookie banner. EduPod's approach is architectural:

1. **RLS means tenant isolation is enforced by the database**, not trusted by the application
2. **The tokenisation gateway means personal data is anonymised before it leaves**, not after a breach
3. **Policy-driven export classification means the system knows why** data is leaving and applies the correct protection automatically
4. **The audit trail means every outbound data flow is logged** with who, what, where, when, and why — answerable in a single query

A DPC assessor reviewing this system would see a platform that treats children's data protection as an engineering problem with an engineering solution, not a legal afterthought with a policy document.
