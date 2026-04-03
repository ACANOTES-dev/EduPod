# Phase I: Retention Policy Engine

**Master Plan Section:** 3.1
**Estimated Effort:** 3–4 days
**Prerequisites:** Phase C (Anonymisation Overhaul — retention engine triggers anonymisation for expired records)
**Unlocks:** None (terminal phase)
**Wave:** 2 (starts after Phase C completes)

---

## Objective

Build an automated retention policy engine that enforces storage limitation (GDPR Article 5(1)(e)). Currently, most data categories have no defined retention period — everything is kept forever. This phase creates a `retention_policies` table with a complete retention schedule, seeds it with legally-informed defaults, and runs a weekly cron job to enforce expiry through anonymisation or deletion.

---

## Prerequisites Checklist

- [ ] Phase C complete (verified in implementation log) — the unified anonymisation pipeline is in place, so the retention engine can delegate expired record processing to it

---

## Scope

### I.1 — Database Schema

```sql
CREATE TABLE retention_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id),  -- NULL = platform default
  data_category         VARCHAR(50) NOT NULL,
  retention_months      INT NOT NULL,
  action_on_expiry      VARCHAR(20) NOT NULL DEFAULT 'anonymise',
                        -- anonymise, delete, archive
  is_overridable        BOOLEAN NOT NULL DEFAULT true,
  statutory_basis       TEXT,               -- legal justification for the retention period
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retention_tenant ON retention_policies(tenant_id);
CREATE INDEX idx_retention_category ON retention_policies(data_category);

-- No RLS needed on platform defaults (tenant_id IS NULL)
-- Tenant overrides are protected by RLS
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_policies_isolation ON retention_policies
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### I.2 — Default Retention Schedule (Seeded)

| Data Category                   | Retention Period         | Statutory Basis                   | Expiry Action    |
| ------------------------------- | ------------------------ | --------------------------------- | ---------------- |
| `active_student_records`        | Enrolment + 84 months    | Educational + tax law             | Anonymise        |
| `graduated_withdrawn_students`  | 84 months post-departure | Statutory + reference obligations | Anonymise        |
| `rejected_admissions`           | 12 months post-decision  | Appeals window                    | Delete           |
| `financial_records`             | Current year + 72 months | Irish tax law (TCA 1997)          | Anonymise        |
| `payroll_records`               | Current year + 72 months | Revenue requirements              | Anonymise        |
| `staff_records_post_employment` | 84 months post-departure | Employment law                    | Anonymise        |
| `attendance_records`            | Enrolment + 24 months    | Educational records               | Anonymise        |
| `behaviour_records`             | Enrolment + 12 months    | Legitimate interest               | Delete           |
| `child_protection_safeguarding` | Indefinite               | Child protection law              | **Never delete** |
| `communications_notifications`  | 12 months                | Operational                       | Delete           |
| `audit_logs`                    | 36 months (configurable) | Accountability                    | Delete           |
| `contact_form_submissions`      | 12 months                | Legitimate interest               | Delete           |
| `parent_inquiry_messages`       | 24 months                | Operational                       | Delete           |
| `nl_query_history`              | 12 months                | Storage limitation                | Delete           |
| `ai_processing_logs`            | 24 months                | Accountability                    | Delete           |
| `tokenisation_usage_logs`       | 36 months                | Accountability                    | Delete           |
| `s3_compliance_exports`         | 3 months after download  | Storage limitation                | Delete           |

**Non-overridable policies:** `child_protection_safeguarding` (statutory obligation — schools cannot reduce this), `financial_records` and `payroll_records` (Revenue requirements).

**Overridable policies:** Schools can EXTEND retention (e.g., keep attendance records longer for historical analysis) but cannot reduce below the statutory minimum. The `is_overridable` flag + validation logic enforces this.

### I.3 — Retention Enforcement Cron Job

**Job:** `data-retention:enforce`
**Schedule:** Weekly (Sunday 03:00 UTC — low-traffic window)
**Queue:** `compliance`

**Logic:**

```typescript
@Processor('compliance')
export class RetentionEnforcementProcessor extends TenantAwareJob {
  async process(job: Job) {
    // For each tenant
    for (const tenant of await this.getAllActiveTenants()) {
      // Get effective policies (tenant override > platform default)
      const policies = await this.getEffectivePolicies(tenant.id);

      for (const policy of policies) {
        // Find records past retention period
        const expiredRecords = await this.findExpiredRecords(
          tenant.id,
          policy.data_category,
          policy.retention_months,
        );

        if (expiredRecords.length === 0) continue;

        // Apply action
        switch (policy.action_on_expiry) {
          case 'anonymise':
            await this.anonymisationService.anonymiseRecords(tenant.id, expiredRecords);
            break;
          case 'delete':
            await this.deleteRecords(tenant.id, policy.data_category, expiredRecords);
            break;
          case 'archive':
            await this.archiveRecords(tenant.id, policy.data_category, expiredRecords);
            break;
        }

        // Log all actions
        await this.logRetentionAction(tenant.id, policy, expiredRecords.length);
      }
    }
  }
}
```

**Safety mechanisms:**

- Dry-run mode: configurable flag to log what WOULD be deleted/anonymised without actually doing it
- Batch processing: process in chunks of 100 to avoid long-running transactions
- Idempotent: running twice on the same data produces the same result
- Audit trail: every retention action is logged to `audit_logs`

### I.4 — Tenant Override UI

**Admin settings page:** `Settings > Data Retention`

- Show all retention policies with current values
- Overridable policies: input field to extend retention period (cannot reduce below default)
- Non-overridable policies: greyed out with explanation ("Required by [statutory basis]")
- Preview: "If applied now, X records would be affected"
- Save confirms with the user before applying

### I.5 — Retention Hold / Legal Hold

Add support for suspending retention enforcement for specific subjects:

```sql
CREATE TABLE retention_holds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  subject_type      VARCHAR(20) NOT NULL,
  subject_id        UUID NOT NULL,
  reason            TEXT NOT NULL,         -- e.g., "Active legal proceedings"
  held_by_user_id   UUID NOT NULL REFERENCES users(id),
  held_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE retention_holds ENABLE ROW LEVEL SECURITY;
CREATE POLICY retention_holds_isolation ON retention_holds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

The enforcement cron checks for active holds and skips those subjects.

---

## API Endpoints

| Method | Path                                 | Permission          | Description                               |
| ------ | ------------------------------------ | ------------------- | ----------------------------------------- |
| GET    | `/api/v1/retention-policies`         | `compliance.manage` | List effective policies for tenant        |
| PATCH  | `/api/v1/retention-policies/:id`     | `compliance.manage` | Override a retention period (extend only) |
| POST   | `/api/v1/retention-policies/preview` | `compliance.manage` | Preview what would be affected            |
| POST   | `/api/v1/retention-holds`            | `compliance.manage` | Place a legal hold on a subject           |
| DELETE | `/api/v1/retention-holds/:id`        | `compliance.manage` | Release a legal hold                      |
| GET    | `/api/v1/retention-holds`            | `compliance.manage` | List active holds                         |

---

## Frontend Changes

1. **Retention settings page** (`/settings/compliance/retention`) — policy list, override controls, preview
2. **Legal hold management** — place/release holds, view active holds

---

## Testing Requirements

1. **Default policies seeded:** All 17 categories present after migration
2. **Enforcement cron:** Expired records are anonymised/deleted per policy
3. **Non-overridable:** Cannot reduce retention for financial/payroll/safeguarding
4. **Overridable:** Can extend retention for attendance records (e.g., 24 → 36 months)
5. **Legal hold:** Subject with active hold is skipped by enforcement cron
6. **Legal hold release:** After release, subject is eligible for enforcement
7. **Batch safety:** Large dataset doesn't cause timeout (chunked processing)
8. **Idempotency:** Running enforcement twice produces same result
9. **Audit trail:** Every retention action creates an audit log entry
10. **RLS:** Tenant A's retention overrides don't affect Tenant B

---

## Definition of Done

- [ ] `retention_policies` table created with RLS
- [ ] `retention_holds` table created with RLS
- [ ] All 17 default retention policies seeded
- [ ] `data-retention:enforce` cron job registered (weekly)
- [ ] Enforcement processor with anonymise/delete/archive actions
- [ ] Dry-run mode available
- [ ] Batch processing (chunks of 100)
- [ ] Tenant override endpoints (extend only, validate against statutory minimum)
- [ ] Legal hold CRUD
- [ ] Enforcement respects active holds
- [ ] Admin retention settings UI
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/event-job-catalog.md` updated with retention cron
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase I: Retention Engine

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially any retention periods adjusted from defaults]
- **Schema changes:** [migration name(s)]
- **New endpoints:** [list]
- **New frontend pages:** Retention settings, legal hold management
- **Tests added:** [count]
- **Architecture files updated:** event-job-catalog.md
- **Unlocks:** None (terminal phase)
- **Notes:** [dry-run results if tested against production data, any edge cases]
```
