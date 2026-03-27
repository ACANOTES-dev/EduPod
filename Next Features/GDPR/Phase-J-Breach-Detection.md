# Phase J: Breach Detection & Management

**Master Plan Section:** 3.2
**Estimated Effort:** 3–4 days
**Prerequisites:** Phase G (Audit Logging Enhancement — detection rules query audit logs)
**Unlocks:** None (terminal phase)
**Wave:** 2 (starts after Phase G completes)

---

## Objective

Build a breach detection and management system with automated anomaly rules, incident lifecycle, and DPC notification workflow (72-hour window under Article 33). The enhanced audit logs from Phase G provide the data foundation — this phase adds the intelligence and response layer.

---

## Prerequisites Checklist

- [ ] Phase G complete (verified in implementation log) — read access logging, security event logging, and permission-denied logging are all active, providing the data stream for anomaly detection

---

## Scope

### J.1 — Security Incidents Table

```sql
CREATE TABLE security_incidents (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  severity                      VARCHAR(20) NOT NULL,  -- low, medium, high, critical
  incident_type                 VARCHAR(50) NOT NULL,
                                -- rls_violation, unusual_access, auth_spike,
                                -- cross_tenant_attempt, data_exfiltration,
                                -- brute_force, permission_probe
  description                   TEXT NOT NULL,
  affected_tenants              UUID[],
  affected_data_subjects_count  INT,
  data_categories_affected      TEXT[],
  containment_actions           TEXT,
  reported_to_controllers_at    TIMESTAMPTZ,
  reported_to_dpc_at            TIMESTAMPTZ,
  dpc_reference_number          VARCHAR(50),
  root_cause                    TEXT,
  remediation                   TEXT,
  status                        VARCHAR(20) NOT NULL DEFAULT 'detected',
                                -- detected, investigating, contained,
                                -- reported, resolved, closed
  created_by_user_id            UUID NOT NULL REFERENCES users(id),
  assigned_to_user_id           UUID REFERENCES users(id),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS — security incidents are platform-level (may span tenants)
CREATE INDEX idx_incidents_status ON security_incidents(status);
CREATE INDEX idx_incidents_severity ON security_incidents(severity, detected_at);
```

### J.2 — Incident Timeline

```sql
CREATE TABLE security_incident_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id         UUID NOT NULL REFERENCES security_incidents(id),
  event_type          VARCHAR(30) NOT NULL,
                      -- note, status_change, escalation, notification,
                      -- containment, evidence
  description         TEXT NOT NULL,
  created_by_user_id  UUID NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_events ON security_incident_events(incident_id, created_at);
```

### J.3 — Automated Detection Rules

Implement as a cron job: `security:anomaly-scan` (runs every 15 minutes)

| Rule | Trigger | Severity | Detection Logic |
|---|---|---|---|
| **Unusual data access** | 100+ student records accessed in 1 minute by single user | High | Query read access audit logs, group by user, count in 1-min window |
| **Failed auth spike** | 10+ failed logins for same email in 5 minutes | Medium | Query security event logs for login failures |
| **Cross-tenant attempt** | Any RLS policy violation logged | Critical | Monitor for RLS assertion failures (these should never happen) |
| **Permission probe** | 20+ permission-denied events from single user in 10 minutes | High | Query permission-denied audit logs |
| **Brute force cluster** | 5+ accounts locked out from same IP in 1 hour | High | Query lockout events, group by IP |
| **Off-hours bulk access** | 50+ records accessed between 00:00–05:00 local time | Medium | Query read access logs with time filter |
| **Data export spike** | 3+ export operations by single user in 1 hour | Medium | Query export-related audit logs |

**Implementation:**

```typescript
@Processor('security')
export class AnomalyScanProcessor extends TenantAwareJob {
  async process(job: Job) {
    const rules = this.getActiveRules();
    for (const rule of rules) {
      const violations = await rule.evaluate(this.auditLogService);
      for (const violation of violations) {
        await this.createOrUpdateIncident(violation);
      }
    }
  }
}
```

Each rule is a class implementing a common interface:

```typescript
interface DetectionRule {
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evaluate(auditLogService: AuditLogService): Promise<Violation[]>;
}
```

### J.4 — DPC Notification Workflow

Article 33 requires notification to the DPC within 72 hours of becoming aware of a breach that is likely to result in a risk to rights and freedoms.

**Workflow:**

1. **Detection:** Automated rule triggers or platform admin manually creates incident
2. **Assessment:** Assign to investigator, assess severity and scope
3. **72-hour clock starts** at `detected_at`
4. **Notifications:**
   - Immediately: platform admin notified
   - 12 hours: if not acknowledged, escalate
   - 48 hours: warning — 24 hours remaining for DPC notification
   - 72 hours: critical alert — DPC notification deadline
5. **DPC notification template:** Pre-populated form with:
   - Nature of breach
   - Categories of data subjects affected
   - Approximate number of data subjects
   - Categories of personal data records concerned
   - Likely consequences
   - Measures taken or proposed
6. **Controller notification:** Notify affected tenant admins (EduPod's obligation as processor under Article 33(2))

**Notification cron:** `security:breach-deadline` (hourly)

### J.5 — Platform Admin UI

**Incident dashboard** (platform admin only):
- List all incidents with severity, status, age
- 72-hour countdown for open incidents
- Filters: status, severity, date range
- Incident detail view: timeline, affected tenants, data categories, actions taken

**Incident management:**
- Create incident manually
- Update status through lifecycle
- Add timeline events (notes, evidence, containment actions)
- Record DPC notification details
- Record controller notification details

---

## API Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/v1/platform/security-incidents` | Platform admin | List all incidents |
| POST | `/api/v1/platform/security-incidents` | Platform admin | Create incident manually |
| GET | `/api/v1/platform/security-incidents/:id` | Platform admin | Get incident with timeline |
| PATCH | `/api/v1/platform/security-incidents/:id` | Platform admin | Update incident |
| POST | `/api/v1/platform/security-incidents/:id/events` | Platform admin | Add timeline event |
| POST | `/api/v1/platform/security-incidents/:id/notify-controllers` | Platform admin | Send controller notifications |
| POST | `/api/v1/platform/security-incidents/:id/notify-dpc` | Platform admin | Record DPC notification |

---

## Frontend Changes

1. **Platform admin incident dashboard** — incident list, severity indicators, 72-hour countdown
2. **Incident detail page** — full timeline, status management, notification tracking
3. **Alert badge** — persistent alert in platform admin nav when open incidents exist

---

## Testing Requirements

1. **Unusual access rule:** 100+ accesses in 1 minute → incident created with `high` severity
2. **Auth spike rule:** 10+ failures in 5 minutes → incident created
3. **Permission probe rule:** 20+ denials from single user → incident created
4. **No false positive on normal usage:** Normal teacher accessing 30 students in a class → no incident
5. **Deduplication:** Same anomaly detected again → updates existing incident, doesn't create duplicate
6. **72-hour countdown:** Verify notification cron fires at 12h, 48h, 72h marks
7. **Incident lifecycle:** Status transitions: detected → investigating → contained → reported → resolved → closed
8. **Controller notification:** Affected tenant admins receive notification
9. **Manual incident creation:** Platform admin can create incident with all required fields

---

## Definition of Done

- [ ] `security_incidents` table created (platform-level, no RLS)
- [ ] `security_incident_events` table created
- [ ] `security:anomaly-scan` cron registered (every 15 minutes)
- [ ] All 7 detection rules implemented
- [ ] `security:breach-deadline` cron registered (hourly)
- [ ] 72-hour DPC notification countdown with escalation
- [ ] Controller notification mechanism
- [ ] Platform admin incident dashboard
- [ ] Incident detail page with timeline
- [ ] Manual incident creation
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/event-job-catalog.md` updated with security crons
- [ ] `architecture/state-machines.md` updated with incident lifecycle
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase J: Breach Detection & Management
- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially detection rule thresholds]
- **Schema changes:** [migration name(s)]
- **New endpoints:** [list all platform admin endpoints]
- **New frontend pages:** Incident dashboard, incident detail
- **Tests added:** [count]
- **Architecture files updated:** event-job-catalog.md, state-machines.md
- **Unlocks:** None (terminal phase)
- **Notes:** [detection rule tuning notes, false positive observations]
```
