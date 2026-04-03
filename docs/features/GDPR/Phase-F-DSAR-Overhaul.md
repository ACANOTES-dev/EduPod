# Phase F: DSAR Complete Overhaul

**Master Plan Sections:** 2.1, 2.3
**Estimated Effort:** 4–5 days
**Prerequisites:** Phase B (Tokenisation Gateway), Phase C (Anonymisation Overhaul), Phase D (Consent Records)
**Unlocks:** Phase H (Data Subject Protections)
**Wave:** 3 (starts after B + C + D all complete)

---

## Objective

Transform the existing DSAR system from a partial implementation (covering ~15–20% of personal data across 4 entity types) to a complete Article 15/17/20-compliant system that traverses all 38 modules. Add deadline tracking with automated escalation. This is the phase with the most prerequisites because it touches the most data.

---

## Prerequisites Checklist

- [ ] Phase B complete (verified in implementation log) — DSAR exports use the `never` tokenisation policy; the GDPR badge shows "Personal Data Export — Article 15 GDPR"
- [ ] Phase C complete (verified in implementation log) — anonymisation paths are merged and comprehensive; erasure requests use the unified anonymisation pipeline
- [ ] Phase D complete (verified in implementation log) — consent records are included in the DSAR data export; consent status is part of the subject's data package

---

## Scope

### F.1 — Complete DSAR Data Traversal (Master Plan 2.1)

**Current coverage vs required:**

| Data Category            | Currently Exported       | Missing Fields / Records                                           |
| ------------------------ | ------------------------ | ------------------------------------------------------------------ |
| Student profile          | Partial                  | `middle_name`, `national_id`, `DOB`, `gender`, `nationality`       |
| Student attendance       | Last 100 only            | ALL records + pattern alerts                                       |
| Student grades           | Yes                      | GPA snapshots, competency snapshots, risk alerts, progress reports |
| Student report cards     | No                       | Full `snapshot_payload_json`                                       |
| Student behaviour        | No                       | All incidents, sanctions, appeals, exclusions, recognition         |
| Student admissions       | No                       | Application data, notes, form responses                            |
| Parent profile           | Yes                      | Communication log missing                                          |
| Parent inquiries         | No                       | All inquiry messages                                               |
| Parent financial         | 50 invoices, 50 payments | ALL + refunds, credit notes, payment plans, scholarships           |
| Household                | Yes                      | Emergency contacts, fee assignments                                |
| Staff profile            | Basic only               | Payroll entries, compensation, allowances, deductions              |
| Staff bank details       | No                       | Include with masking (last 4 chars only)                           |
| Audit logs about subject | No                       | All entries referencing the subject                                |
| Notifications sent       | No                       | All delivery records for the subject                               |
| Tokenisation log         | No                       | All token usage entries for the subject                            |
| Consent records          | No                       | All consent records for the subject                                |

**New subject types to support:**

- `applicant` — pre-enrolment data (separate retention rules per DPC guidance)
- `staff` — as first-class citizen (not routed through `user`)

**Export format:**

- Primary: JSON (machine-readable, Article 20 portability)
- Secondary: CSV per data category
- No hard record limits — export ALL data for the subject
- DSAR exports use the `never` tokenisation policy — real data returned to the data subject

**Implementation approach:**
Create a `DsarTraversalService` with a method per data category. Each method:

1. Queries all records for the subject across the relevant tables
2. Returns structured data in a consistent format
3. Handles the subject type variations (student vs parent vs staff vs applicant)

```typescript
@Injectable()
export class DsarTraversalService {
  async collectAllData(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<DsarDataPackage> {
    const collectors = this.getCollectorsForSubjectType(subjectType);
    const results = await Promise.all(collectors.map((c) => c.collect(tenantId, subjectId)));
    return this.assemblePackage(results);
  }
}
```

### F.2 — DSAR Deadline Tracking (Master Plan 2.3)

**Schema additions:**

```sql
ALTER TABLE compliance_requests ADD COLUMN deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN extension_granted BOOLEAN DEFAULT false;
ALTER TABLE compliance_requests ADD COLUMN extension_reason TEXT;
ALTER TABLE compliance_requests ADD COLUMN extension_deadline_at TIMESTAMPTZ;
ALTER TABLE compliance_requests ADD COLUMN deadline_exceeded BOOLEAN DEFAULT false;
```

**Auto-set on creation:** `deadline_at = created_at + 30 days` (Article 12(3))

**Extension support:** Article 12(3) allows a 2-month extension for complex requests. When granted, `extension_deadline_at = deadline_at + 60 days`.

**New cron job:** `compliance:deadline-check` (daily at 06:00 UTC)

| Trigger                | Action                                                 |
| ---------------------- | ------------------------------------------------------ |
| 7 days before deadline | Notify compliance admin via in-app notification        |
| 3 days before deadline | Escalate — notify school owner                         |
| On deadline day        | Flag `deadline_exceeded = true`, notify platform admin |
| If extension granted   | Reset countdown against `extension_deadline_at`        |

### F.3 — Enhanced Erasure Pipeline

Building on Phase C's anonymisation overhaul, the erasure execution path must now:

1. Call the unified anonymisation service (from Phase C) for the subject
2. Delete consent records for the subject (from Phase D)
3. Delete tokenisation mappings for the subject (from Phase B)
4. Process through the `never` tokenisation policy for the DSAR response export
5. Mark the compliance request as completed with the export package reference

### F.4 — Data Portability (Article 20)

**Currently missing.** The student export pack (`GET v1/students/:id/export-pack`) is a start, but portability requires machine-readable format across ALL data categories.

**Implementation:** The `DsarTraversalService` output for `access` requests doubles as the portability export. Add a `format` parameter:

- `json` — structured JSON per data category
- `csv` — one CSV file per data category, zipped

### F.5 — Rectification Handling

**Problem:** Published report cards have frozen `snapshot_payload_json`, payslips have frozen snapshots, receipts are immutable. If a student's name is rectified, these historical snapshots contain the old name.

**Policy (simpler approach — defensible under GDPR):** Annotate immutable records with a rectification note rather than re-generating. Add:

```sql
ALTER TABLE compliance_requests ADD COLUMN rectification_note TEXT;
-- Applied to snapshots: "Original name rectified on [date] per Article 16 request [ref]"
```

The DSAR response includes both the current (rectified) data and notes on any historical snapshots.

---

## API Changes

| Method | Path                                     | Permission          | Description                             |
| ------ | ---------------------------------------- | ------------------- | --------------------------------------- |
| GET    | `/api/v1/compliance-requests/:id/export` | `compliance.manage` | Download full DSAR export (JSON or CSV) |
| POST   | `/api/v1/compliance-requests/:id/extend` | `compliance.manage` | Grant deadline extension                |
| GET    | `/api/v1/compliance-requests/overdue`    | `compliance.manage` | List overdue requests                   |

**Existing endpoints enhanced:**

- `POST /api/v1/compliance-requests` — auto-sets `deadline_at`
- `GET /api/v1/compliance-requests/:id` — includes deadline info

---

## Frontend Changes

1. **DSAR dashboard:** Show deadline countdown, overdue warnings, extension controls
2. **Export download:** Button to download full data package (JSON/CSV)
3. **Overdue indicator:** Red badge on compliance requests approaching or past deadline

---

## Testing Requirements

1. **Traversal completeness:** For each subject type (student, parent, staff, applicant), verify ALL data categories are included in the export
2. **No record limits:** Verify export includes all records, not capped at 50 or 100
3. **Deadline auto-set:** New compliance request has `deadline_at = created_at + 30 days`
4. **Deadline notifications:** Mock cron job, verify notifications sent at 7-day and 3-day marks
5. **Deadline exceeded:** Flag is set when deadline passes
6. **Extension:** Granting extension updates deadline and resets notification schedule
7. **Erasure completeness:** Erasure request anonymises all fields (per Phase C), deletes consent records, deletes tokens
8. **Portability format:** JSON and CSV exports are valid and machine-readable
9. **RLS:** DSAR export only includes data from the requesting tenant
10. **Tokenisation policy:** DSAR export uses `never` policy — real data in the export

---

## Definition of Done

- [ ] `DsarTraversalService` collects data from all 38 modules
- [ ] Support for `student`, `parent`, `staff`, `applicant` subject types
- [ ] JSON + CSV export formats
- [ ] No hard record limits on exports
- [ ] Deadline tracking columns added to `compliance_requests`
- [ ] Auto-set `deadline_at` on creation
- [ ] `compliance:deadline-check` cron job registered
- [ ] Escalation notifications at 7-day, 3-day, and deadline marks
- [ ] Extension support with reason
- [ ] Erasure pipeline includes consent records + token cleanup
- [ ] Rectification annotation for immutable records
- [ ] All existing compliance tests pass (regression)
- [ ] New tests written per testing requirements
- [ ] `architecture/event-job-catalog.md` updated with deadline-check cron
- [ ] `architecture/state-machines.md` updated if compliance request lifecycle changed
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase F: DSAR Overhaul

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially any data categories that couldn't be fully traversed]
- **Schema changes:** [migration name(s)]
- **New endpoints:** [list new/enhanced endpoints]
- **New frontend pages:** [DSAR dashboard enhancements]
- **Tests added:** [count]
- **Architecture files updated:** event-job-catalog.md, state-machines.md
- **Unlocks:** Phase H (Data Subject Protections) is now available
- **Notes:** [any data categories with partial coverage, any edge cases discovered]
```
