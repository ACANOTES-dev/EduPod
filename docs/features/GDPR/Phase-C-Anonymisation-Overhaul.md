# Phase C: Anonymisation Overhaul

**Master Plan Sections:** 1.2, 2.2
**Estimated Effort:** 3 days
**Prerequisites:** None
**Unlocks:** Phase F (DSAR Overhaul — also requires B + D), Phase I (Retention Engine)
**Wave:** 1 (can start immediately)

---

## Objective

Merge the two divergent anonymisation code paths into a single canonical implementation, then extend anonymisation coverage to ALL personal data fields and secondary systems (Meilisearch, Redis, S3, tokenisation table). After this phase, erasure is comprehensive — no re-identifiable quasi-identifiers remain.

---

## Scope

### C.1 — Merge Dual Anonymisation Implementation (Master Plan 1.2)

**The problem.** Two separate anonymisation code paths exist with different logic:

| Aspect                | API Service (`anonymisation.service.ts`) | Worker Processor (`compliance-execution.processor.ts`) |
| --------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Tag format            | `ANONYMISED-{entityId}`                  | `ANONYMISED-{randomUUID}`                              |
| Report card snapshots | Handles                                  | Skips                                                  |
| Payslip snapshots     | Handles                                  | Skips                                                  |
| Idempotency           | Has checks                               | No checks                                              |
| Callers               | Active (used by compliance module)       | None (no `compliance:execute` jobs enqueued)           |

**The fix:**

1. Extract `AnonymisationService` core logic to a shared, importable service
2. Delete the duplicate anonymisation methods from the compliance-execution worker processor
3. Have the worker processor delegate to the shared service (if needed in future for bulk async erasure)
4. Standardise on `ANONYMISED-{entityId}` tag format (deterministic, idempotent)
5. Ensure report card snapshots, payslip snapshots, and idempotency checks are in the shared path

**Safety:** The worker's anonymisation methods have zero callers. The API path is the active execution path. This merge improves the situation — if someone later routes erasure through the worker, it uses the complete implementation.

### C.2 — Fix Anonymisation Completeness (Master Plan 2.2)

**The problem.** Current anonymisation leaves re-identifiable quasi-identifiers. Combined attributes (DOB + gender + nationality) can re-identify individuals.

**Fields NOT currently anonymised but MUST be:**

| Entity    | Field                              | Risk                                               | Fix                                       |
| --------- | ---------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| Student   | `date_of_birth`                    | Combined with gender+nationality = re-identifiable | Set to year-only (`YYYY-01-01`)           |
| Student   | `national_id`                      | Unique identifier                                  | Set to `NULL`                             |
| Student   | `middle_name`                      | Not attempted                                      | Anonymise with tag                        |
| Student   | `gender`                           | Quasi-identifier                                   | Set to `NULL`                             |
| Student   | `nationality`                      | Quasi-identifier                                   | Set to `NULL`                             |
| Student   | `city_of_birth`                    | Quasi-identifier                                   | Set to `NULL`                             |
| Household | `address_line_1`, `address_line_2` | Full address                                       | Set to `NULL`                             |
| Household | `city`                             | Part of address                                    | Set to `NULL`                             |
| Household | `country`                          | Part of address                                    | Set to `NULL`                             |
| Household | `postal_code`                      | Part of address                                    | Set to `NULL`                             |
| Staff     | `bank_account_number_encrypted`    | Encrypted but not cleared                          | Set to `NULL`                             |
| Staff     | `bank_iban_encrypted`              | Encrypted but not cleared                          | Set to `NULL`                             |
| Staff     | `staff_number`                     | Identifier                                         | Anonymise with tag                        |
| All       | Attendance records                 | Linked by student_id                               | Anonymise student_id reference or cascade |
| All       | Grades                             | Linked by student_id                               | Anonymise student_id reference or cascade |
| All       | Behaviour records (future)         | Not touched at all                                 | Full cascade anonymisation                |
| All       | Admissions data                    | Not touched                                        | Anonymise application data                |
| All       | Notification records               | Not touched                                        | Anonymise delivery records                |
| All       | Parent inquiry messages            | Not touched                                        | Anonymise messages                        |

### C.3 — Secondary System Cleanup

Anonymisation MUST also cascade to secondary systems. Add to the anonymisation pipeline:

| System                 | Action                          | Implementation                                                                                                         |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Meilisearch**        | Remove entity from search index | Call `removeEntity()` for the anonymised subject                                                                       |
| **Redis**              | Invalidate cached data          | Clear preview cards, session data, permission cache for subject                                                        |
| **S3**                 | Delete compliance export files  | Delete any previous DSAR/export files for this subject                                                                 |
| **Tokenisation table** | Delete all token mappings       | Delete from `gdpr_anonymisation_tokens` where `entity_id` matches (if Phase B is complete; otherwise defer to Phase F) |

**Note on tokenisation table cleanup:** If Phase B (Tokenisation Gateway) has been completed before this phase, include token deletion in the anonymisation cascade. If Phase C runs before Phase B, add a TODO marker and document that Phase F must add this step.

---

## Data Model Changes

No new tables. This phase modifies the anonymisation logic to touch additional existing columns.

**Fields added to anonymisation scope** (modify the anonymisation service):

```typescript
// Student anonymisation — expanded scope
student.middle_name = `ANONYMISED-${student.id}`;
student.date_of_birth = new Date(student.date_of_birth.getFullYear(), 0, 1); // Year-only
student.national_id = null;
student.gender = null;
student.nationality = null;
student.city_of_birth = null;

// Household anonymisation — expanded scope
household.address_line_1 = null;
household.address_line_2 = null;
household.city = null;
household.country = null;
household.postal_code = null;

// Staff anonymisation — expanded scope
staffProfile.bank_account_number_encrypted = null;
staffProfile.bank_iban_encrypted = null;
staffProfile.staff_number = `ANONYMISED-${staffProfile.id}`;

// Cascade to related records
// Anonymise notification delivery records for the subject
// Anonymise parent inquiry messages for the subject
// Anonymise admission application data for the subject
```

---

## Testing Requirements

1. **Merge verification:** After merge, run all existing compliance/anonymisation tests — they must pass unchanged
2. **Idempotency:** Run anonymisation twice on the same entity — second run should be a no-op
3. **Quasi-identifier elimination:** After anonymisation, verify:
   - Student DOB is year-only (month=01, day=01)
   - `national_id`, `gender`, `nationality`, `city_of_birth` are NULL
   - `middle_name` is tagged
   - Household address fields are all NULL
   - Staff bank details are NULL, staff_number is tagged
4. **Cascade coverage:**
   - Verify Meilisearch entry is removed for anonymised entity
   - Verify Redis cache is invalidated
   - Verify related notification records are anonymised
   - Verify related inquiry messages are anonymised
   - Verify admission application data is anonymised
5. **RLS leakage:** Ensure anonymisation operations respect tenant isolation
6. **No collateral damage:** Anonymising Student A does not affect Student B's records in any way

---

## Definition of Done

- [ ] Single anonymisation code path — worker delegates to shared service
- [ ] All quasi-identifier fields added to anonymisation scope
- [ ] Household address fields cleared on anonymisation
- [ ] Staff encrypted bank details cleared on anonymisation
- [ ] Meilisearch cleanup integrated into anonymisation pipeline
- [ ] Redis cache invalidation integrated into anonymisation pipeline
- [ ] S3 compliance export cleanup integrated
- [ ] Token table cleanup integrated (or TODO marker if Phase B not yet complete)
- [ ] Notification records anonymised for subject
- [ ] Inquiry messages anonymised for subject
- [ ] Admission data anonymised for subject
- [ ] Idempotency verified
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase C: Anonymisation Overhaul

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [any deviations — especially note if token table cleanup was deferred]
- **Schema changes:** None (logic changes only)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** [count]
- **Architecture files updated:** [if any cross-module deps changed]
- **Unlocks:** Phase I (Retention Engine), and contributes to Phase F (DSAR — also needs B + D)
- **Notes:** [list any deferred items, especially token table cleanup status]
```
