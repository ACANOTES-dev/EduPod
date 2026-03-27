# Phase D: Consent Records System

**Master Plan Section:** 1.6
**Estimated Effort:** 3–4 days
**Prerequisites:** Phase A (Quick Wins — privacy-first defaults must be in place)
**Unlocks:** Phase F (DSAR Overhaul — also requires B + C)
**Wave:** 2 (starts after Phase A completes)

---

## Objective

Build a centralised consent management system. The DPC's Toolkit for Schools explicitly cautions against "bundling" consent — each consent must be specific, informed, and freely given. This phase creates the infrastructure for granular, per-type, withdrawable consent with a parent portal dashboard.

---

## Prerequisites Checklist

- [ ] Phase A complete (verified in implementation log) — privacy-first defaults are in place, so consent types align with the opt-in model

---

## Scope

### D.1 — Database Schema

```sql
CREATE TABLE consent_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  subject_type              VARCHAR(20) NOT NULL,   -- student, parent, staff, applicant
  subject_id                UUID NOT NULL,
  consent_type              VARCHAR(50) NOT NULL,
                            -- health_data, allergy_data, medical_notes, photo_use,
                            -- whatsapp_channel, email_marketing, ai_grading,
                            -- ai_comments, ai_risk_detection, ai_progress_summary,
                            -- cross_school_benchmarking, homework_diary
  status                    VARCHAR(20) NOT NULL DEFAULT 'granted',
                            -- granted, withdrawn, expired
  granted_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at              TIMESTAMPTZ,
  granted_by_user_id        UUID NOT NULL REFERENCES users(id),
  evidence_type             VARCHAR(30) NOT NULL,
                            -- in_app_modal, registration_form, paper_form, email_link
  privacy_notice_version_id UUID,  -- FK added when Phase E creates privacy_notice_versions table
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_active_consent
    UNIQUE (tenant_id, subject_type, subject_id, consent_type)
);

CREATE INDEX idx_consent_tenant_subject ON consent_records(tenant_id, subject_type, subject_id);
CREATE INDEX idx_consent_tenant_type ON consent_records(tenant_id, consent_type);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_records_tenant_isolation ON consent_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Note on `privacy_notice_version_id`:** This column references a table created in Phase E. For now, create the column as a nullable UUID without the FK constraint. Phase E will add the FK constraint via a separate migration.

### D.2 — Consent Type Registry

Define all consent types in `packages/shared/src/gdpr/consent-types.ts`:

```typescript
export const CONSENT_TYPES = {
  // Health & medical
  HEALTH_DATA: 'health_data',
  ALLERGY_DATA: 'allergy_data',
  MEDICAL_NOTES: 'medical_notes',

  // Media & communications
  PHOTO_USE: 'photo_use',
  WHATSAPP_CHANNEL: 'whatsapp_channel',
  EMAIL_MARKETING: 'email_marketing',

  // AI features (each needs separate consent)
  AI_GRADING: 'ai_grading',
  AI_COMMENTS: 'ai_comments',
  AI_RISK_DETECTION: 'ai_risk_detection',
  AI_PROGRESS_SUMMARY: 'ai_progress_summary',

  // Cross-school
  CROSS_SCHOOL_BENCHMARKING: 'cross_school_benchmarking',

  // Student-facing
  HOMEWORK_DIARY: 'homework_diary',
} as const;

export type ConsentType = typeof CONSENT_TYPES[keyof typeof CONSENT_TYPES];
```

### D.3 — Backend: Consent Service + Controller

**Service methods:**

```typescript
@Injectable()
export class ConsentService {
  // Grant a consent
  async grantConsent(tenantId, subjectType, subjectId, consentType, grantedByUserId, evidenceType, notes?): Promise<ConsentRecord>

  // Withdraw a consent (sets status to 'withdrawn', records withdrawn_at)
  async withdrawConsent(tenantId, consentId, withdrawnByUserId): Promise<ConsentRecord>

  // Check if consent is active for a subject+type
  async hasConsent(tenantId, subjectType, subjectId, consentType): Promise<boolean>

  // Get all consents for a subject
  async getConsentsForSubject(tenantId, subjectType, subjectId): Promise<ConsentRecord[]>

  // Get all consents of a type for a tenant (admin view)
  async getConsentsByType(tenantId, consentType, pagination): Promise<PaginatedResult<ConsentRecord>>

  // Bulk grant (e.g., during registration)
  async bulkGrantConsents(tenantId, subjectType, subjectId, consents: Array<{type, evidenceType}>): Promise<ConsentRecord[]>
}
```

**Controller endpoints:**

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/v1/consent` | `consent.manage` | Grant a consent |
| PATCH | `/api/v1/consent/:id/withdraw` | `consent.manage` | Withdraw a consent |
| GET | `/api/v1/consent/subject/:type/:id` | `consent.view` | Get all consents for a subject |
| GET | `/api/v1/consent/type/:consentType` | `consent.manage` | Get all consents by type (admin) |
| POST | `/api/v1/consent/bulk` | `consent.manage` | Bulk grant consents |

**Parent portal endpoints (self-service):**

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/parent-portal/consent` | Parent auth | Get own children's consent status |
| PATCH | `/api/v1/parent-portal/consent/:id/withdraw` | Parent auth | Withdraw consent for own child |

### D.4 — Consent Withdrawal Cascade

When a consent is withdrawn, the effect must be immediate across all downstream processing:

| Consent Type | Cascade Action |
|---|---|
| `whatsapp_channel` | Notification dispatch skips WhatsApp for this subject |
| `ai_grading` | AI grading service rejects requests for this student |
| `ai_comments` | AI comment service rejects requests for this student |
| `ai_risk_detection` | Risk detection cron skips this student |
| `ai_progress_summary` | Progress summary service rejects requests |
| `photo_use` | Photo/media features exclude this student |
| `cross_school_benchmarking` | Benchmarking aggregation excludes this student |

**Implementation:** Each downstream service calls `consentService.hasConsent()` before processing. This is a synchronous check — no queue/event needed since consent withdrawal must take effect immediately.

### D.5 — Frontend: Parent Portal Consent Dashboard

**Location:** Parent portal, under a "Privacy & Consent" section.

**UI requirements:**
- List all consent types relevant to the parent's children
- Each consent shows: type (human-readable label), status (granted/withdrawn), date granted, evidence type
- One-click withdraw button per consent
- Withdrawal confirmation modal: "Are you sure you want to withdraw consent for [type]? This will take effect immediately."
- Visual distinction between consent types that affect functionality (AI features) vs communication channels
- Group consents by category (Health, AI Features, Communications)

**Important UX note:** Do NOT use consent as the lawful basis for core educational processing (attendance, grades, enrolment). Those operate under legal obligation / public task. The consent dashboard should NOT include these — only genuinely consent-based processing appears here.

### D.6 — Integration Points

| Integration Point | Change Required |
|---|---|
| **Parent registration** | Add consent checkboxes for: health data, WhatsApp, AI features |
| **Admissions** | Consent collection during application (applicant subject type) |
| **Notification dispatch** | Check WhatsApp consent before delivery |
| **AI services** | Check relevant AI consent before processing |
| **Student allergy report** | Check health_data consent (for display, not collection — vital interests covers emergencies) |

---

## Testing Requirements

1. **CRUD:** Grant, withdraw, query consents — happy path
2. **Uniqueness:** Cannot grant duplicate active consent for same subject+type
3. **Withdrawal cascade:** Withdraw WhatsApp consent → verify notification dispatch skips WhatsApp
4. **Withdrawal cascade:** Withdraw AI grading consent → verify AI grading rejects the student
5. **Re-grant after withdrawal:** Can grant consent again after withdrawal (new record with `granted` status)
6. **Parent portal:** Parent can view and withdraw consents for their own children only
7. **RLS leakage:** Tenant A cannot see Tenant B's consent records
8. **Permission check:** User without `consent.manage` cannot grant/withdraw consents (except parent self-service)
9. **Bulk grant:** Registration flow creates multiple consent records in one call

---

## Definition of Done

- [ ] `consent_records` table created with RLS
- [ ] Consent type registry in `packages/shared`
- [ ] ConsentService with all methods
- [ ] Admin consent endpoints (CRUD)
- [ ] Parent portal consent endpoints (view + withdraw)
- [ ] Consent withdrawal cascade for WhatsApp, AI features
- [ ] Parent registration updated with consent checkboxes
- [ ] Parent portal consent dashboard UI
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/module-blast-radius.md` updated with ConsentModule
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase D: Consent Records
- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [any deviations — note privacy_notice_version_id FK status]
- **Schema changes:** [migration name]
- **New endpoints:** [list all consent endpoints]
- **New frontend pages:** Parent portal consent dashboard
- **Tests added:** [count]
- **Architecture files updated:** module-blast-radius.md
- **Unlocks:** Contributes to Phase F (DSAR — also needs B + C)
- **Notes:** [privacy_notice_version_id FK deferred to Phase E; any integration notes for Phase F]
```
