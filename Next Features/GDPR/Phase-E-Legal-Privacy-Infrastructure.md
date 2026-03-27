# Phase E: Legal & Privacy Infrastructure

**Master Plan Sections:** 1.4, 1.5, 1.7
**Estimated Effort:** 4–5 days
**Prerequisites:** Phase B (Tokenisation Gateway — sub-processor register must reflect post-tokenisation data flows)
**Unlocks:** None directly (but privacy_notice_versions FK gets added to consent_records from Phase D)
**Wave:** 2 (starts after Phase B completes)

---

## Objective

Build the legal compliance documentation infrastructure: Data Processing Agreement (DPA) acceptance workflow, versioned privacy notices with acknowledgement tracking, and the public sub-processor register. These are the legal scaffolding that Irish schools' boards of management require before engaging EduPod as a processor.

---

## Prerequisites Checklist

- [ ] Phase B complete (verified in implementation log) — tokenisation gateway is live, so the sub-processor register and privacy notices can accurately describe post-tokenisation data flows (e.g., "Anthropic receives tokenised data only — no identifiable student information")

---

## Scope

### E.1 — Data Processing Agreement (DPA) Acceptance Workflow (Master Plan 1.4)

**The gap:** No DPA template or acceptance workflow exists. Tenant onboarding creates a school with zero legal documentation. No school's board of management in Ireland can legally engage a processor without a signed DPA.

#### Data Model

```sql
CREATE TABLE data_processing_agreements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  dpa_version         VARCHAR(20) NOT NULL,
  accepted_by_user_id UUID NOT NULL REFERENCES users(id),
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  dpa_content_hash    VARCHAR(128) NOT NULL,  -- SHA-256 of the DPA content at acceptance time
  ip_address          VARCHAR(45),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dpa_tenant ON data_processing_agreements(tenant_id);

ALTER TABLE data_processing_agreements ENABLE ROW LEVEL SECURITY;
CREATE POLICY dpa_tenant_isolation ON data_processing_agreements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

#### DPA Version Storage

```sql
CREATE TABLE dpa_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version             VARCHAR(20) NOT NULL UNIQUE,
  content_html        TEXT NOT NULL,
  content_hash        VARCHAR(128) NOT NULL,  -- SHA-256
  effective_date      DATE NOT NULL,
  superseded_at       DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Note:** `dpa_versions` is platform-level (no tenant_id, no RLS) — the same DPA applies to all tenants.

#### DpaAcceptedGuard

A NestJS guard that checks whether the current tenant has accepted the current DPA version. Applied to all tenant-scoped endpoints.

```typescript
@Injectable()
export class DpaAcceptedGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const tenantId = /* extract from request */;
    const currentDpa = await this.dpaService.getCurrentVersion();
    const accepted = await this.dpaService.hasAccepted(tenantId, currentDpa.version);
    if (!accepted) {
      throw new ForbiddenException({
        code: 'DPA_NOT_ACCEPTED',
        message: 'Your school must accept the current Data Processing Agreement before accessing this service.',
        redirect: '/settings/legal/dpa',
      });
    }
    return true;
  }
}
```

**Important:** The guard returns a redirect hint, not a hard block on the entire app. Schools must still be able to navigate to the DPA acceptance page and settings.

#### DPA Content Requirements (for legal team)

The DPA template must cover (Article 28 requirements):
- Processing scope: all 38 modules' data categories
- Sub-processor list with change notification mechanism
- Breach notification SLA: EduPod notifies controller within 24 hours
- DSAR assistance obligations
- Data return/deletion on termination
- Audit rights
- International transfer mechanisms (SCCs for US sub-processors)
- Tokenisation gateway description as a safeguard

### E.2 — Privacy Notice Template & Infrastructure (Master Plan 1.5)

#### Data Model

```sql
CREATE TABLE privacy_notice_versions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  version_number        INT NOT NULL,
  content_html          TEXT NOT NULL,
  content_html_ar       TEXT,         -- Arabic translation
  effective_date        DATE NOT NULL,
  published_at          TIMESTAMPTZ,
  created_by_user_id    UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, version_number)
);

ALTER TABLE privacy_notice_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_notice_tenant_isolation ON privacy_notice_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE TABLE privacy_notice_acknowledgements (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  user_id                     UUID NOT NULL REFERENCES users(id),
  privacy_notice_version_id   UUID NOT NULL REFERENCES privacy_notice_versions(id),
  acknowledged_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address                  VARCHAR(45),
  UNIQUE(tenant_id, user_id, privacy_notice_version_id)
);

ALTER TABLE privacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_ack_tenant_isolation ON privacy_notice_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

#### Privacy Notice Features

- **Pre-populated template** (English + Arabic) covering: all processing activities, sub-processors, data categories, lawful bases, retention periods, data subject rights, AI processing disclosure (including tokenisation), cross-border transfer details
- **Parent portal:** "How we use your data" persistent link
- **Update notification:** When privacy notice is updated, notify all users
- **Re-acknowledgement:** Required when substantive changes are made (new version published)
- **Version history:** Schools can view all previous versions

#### FK Addition to consent_records

If Phase D has been completed, add the FK constraint:
```sql
ALTER TABLE consent_records
  ADD CONSTRAINT fk_consent_privacy_notice
  FOREIGN KEY (privacy_notice_version_id)
  REFERENCES privacy_notice_versions(id);
```

### E.3 — Sub-Processor Register (Master Plan 1.7)

**A public-facing page listing all sub-processors.**

| Sub-processor | Purpose | Data Categories | Location | Transfer Mechanism |
|---|---|---|---|---|
| Hetzner | VPS hosting | All categories | Germany (EU) | None needed |
| Anthropic | AI processing | **Tokenised only** — no identifiable student data | US | SCCs + DPF + DPIA |
| Stripe | Payments | Household IDs, amounts (no names) | US/EU | Stripe DPA |
| Sentry | Error monitoring | IP, error context (auth scrubbed) | US | SCCs + DPF |
| Cloudflare | CDN, SSL, WAF | Request metadata, IPs | Global | Cloudflare DPA |
| Resend (planned) | Email delivery | Email, names, message content | US | SCCs + DPF |
| Twilio (planned) | WhatsApp | Phone numbers, message content | US | SCCs + DPF |
| AWS S3 | File storage | Import files, payslips, exports | EU (eu-west-1) | None needed |
| Meilisearch | Search | Names, emails, student numbers | Self-hosted | None needed |

**Key point:** The Anthropic entry now reads "Tokenised only" — this is a material change from the pre-tokenisation state and is a direct result of Phase B.

**Features:**
- Public page accessible without authentication (linked from school websites)
- Change notification to all tenant admins when sub-processor list changes
- 30-day objection period for new sub-processor additions
- Version history of changes

---

## API Endpoints

### DPA
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/v1/legal/dpa/current` | `legal.view` | Get current DPA version |
| POST | `/api/v1/legal/dpa/accept` | `legal.manage` | Accept current DPA |
| GET | `/api/v1/legal/dpa/status` | `legal.view` | Check DPA acceptance status |

### Privacy Notices
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/v1/privacy-notices` | `privacy.view` | List all versions |
| POST | `/api/v1/privacy-notices` | `privacy.manage` | Create new version |
| POST | `/api/v1/privacy-notices/:id/publish` | `privacy.manage` | Publish a version |
| POST | `/api/v1/privacy-notices/acknowledge` | Authenticated | Acknowledge current version |
| GET | `/api/v1/parent-portal/privacy-notice` | Parent auth | Get current privacy notice |

### Sub-Processor Register
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/public/sub-processors` | None (public) | Get current sub-processor list |

---

## Frontend Changes

1. **DPA acceptance page** (`/settings/legal/dpa`) — display DPA content, accept button, acceptance history
2. **Privacy notice management** (`/settings/legal/privacy-notices`) — create, edit, publish versions
3. **Privacy notice acknowledgement banner** — shown to users who haven't acknowledged the latest version
4. **Parent portal** — "How we use your data" link to current privacy notice
5. **Sub-processor register** — public page, no auth required

---

## Testing Requirements

1. **DPA guard:** Tenant without accepted DPA gets 403 with redirect
2. **DPA acceptance:** Accept DPA, verify guard passes on next request
3. **DPA versioning:** New DPA version invalidates previous acceptance
4. **Privacy notice versioning:** Create, publish, verify users prompted for re-acknowledgement
5. **Privacy notice acknowledgement:** Acknowledge, verify not prompted again until new version
6. **Sub-processor register:** Public endpoint returns correct list, no auth required
7. **RLS:** Tenant A cannot see Tenant B's DPA acceptance or privacy notice acknowledgements

---

## Definition of Done

- [ ] `dpa_versions` and `data_processing_agreements` tables created
- [ ] `DpaAcceptedGuard` implemented and applied to tenant-scoped routes
- [ ] DPA acceptance page and workflow
- [ ] `privacy_notice_versions` and `privacy_notice_acknowledgements` tables created
- [ ] Privacy notice CRUD endpoints
- [ ] Privacy notice acknowledgement flow with re-acknowledgement on new version
- [ ] FK added to `consent_records.privacy_notice_version_id` (if Phase D complete)
- [ ] Sub-processor register public endpoint and page
- [ ] Parent portal privacy notice link
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/module-blast-radius.md` updated
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase E: Legal & Privacy Infrastructure
- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially DPA content status (legal team dependency)]
- **Schema changes:** [migration name(s)]
- **New endpoints:** [list all legal, privacy notice, sub-processor endpoints]
- **New frontend pages:** DPA acceptance, privacy notice management, sub-processor register, parent portal link
- **Tests added:** [count]
- **Architecture files updated:** module-blast-radius.md
- **Unlocks:** None directly (but consent_records FK now active)
- **Notes:** [DPA content status — template ready or pending legal review; privacy notice template status]
```
