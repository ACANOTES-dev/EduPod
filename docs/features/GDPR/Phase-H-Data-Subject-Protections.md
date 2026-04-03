# Phase H: Data Subject Protections

**Master Plan Sections:** 2.5, 2.6
**Estimated Effort:** 2 days
**Prerequisites:** Phase F (DSAR Overhaul — age-gated rights integrate with DSAR flow)
**Unlocks:** None (terminal phase)
**Wave:** 4 (starts after Phase F completes)

---

## Objective

Add protective guardrails for the most vulnerable data subjects: prevent schools from collecting special category data during pre-enrolment (DPC August 2025 guidance), and implement age-gated data rights so students aged 17+ can exercise their own GDPR rights per the DPC Toolkit.

---

## Prerequisites Checklist

- [ ] Phase F complete (verified in implementation log) — DSAR traversal supports all subject types, deadline tracking is active, student as DSAR submitter type is needed for age-gated rights

---

## Scope

### H.1 — Admissions Form Data Minimisation Guardrails (Master Plan 2.5)

**The problem:** EduPod's admissions form builder allows arbitrary fields with no warnings. The DPC's August 2025 guidance specifically flags schools collecting special category data (health, religion, ethnicity) at the pre-enrolment stage as a common violation. Data minimisation is strictly enforced at pre-enrolment.

**Implementation:**

#### Keyword Detection Engine

When a tenant admin adds or edits a field in the admissions form builder, check the field label/key against a keyword list:

```typescript
const SPECIAL_CATEGORY_KEYWORDS = [
  // Health
  'health',
  'medical',
  'allergy',
  'allergies',
  'medication',
  'disability',
  'diagnosis',
  'condition',
  'illness',
  'hospital',
  'doctor',
  'gp',
  'immunisation',
  'vaccination',
  'special needs',
  'sen',
  // Religion
  'religion',
  'religious',
  'faith',
  'church',
  'mosque',
  'parish',
  'denomination',
  'baptism',
  'communion',
  // Ethnicity / Race
  'ethnicity',
  'ethnic',
  'race',
  'racial',
  'traveller',
  'roma',
  // Other Article 9
  'sexual orientation',
  'political',
  'trade union',
  'biometric',
  'genetic',
];
```

#### Warning Display

When a keyword match is detected:

```
⚠  Data Minimisation Warning

The DPC advises against collecting health, religious, or ethnic data at the
pre-enrolment stage. This type of information should only be collected
post-enrolment with explicit consent.

Field: [field name]
Matched keyword: [keyword]

Options:
  [Remove Field]  [Keep with Justification]
```

If admin chooses "Keep with Justification":

- Require free-text reason (mandatory)
- Log the override in `audit_logs` with the admin's justification
- Show a persistent warning badge on the field in the form builder

#### Form-Level Summary

When saving an admissions form that contains flagged fields, show a summary:

```
This form contains 3 fields flagged for data minimisation review:
- "Religion" (religious data)
- "Medical Conditions" (health data)
- "Ethnicity" (ethnic origin data)

Each has been justified and logged. These fields will be clearly marked
in the applicant-facing form.
```

### H.2 — Age-Gated Data Rights (Master Plan 2.6)

**The problem:** The DPC Toolkit confirms that students aged 17+ exercise their own data protection rights. EduPod stores student DOB but has no age-gated logic.

**Implementation:**

#### Age Calculation Service

```typescript
@Injectable()
export class AgeGateService {
  isStudentAgeGated(student: { date_of_birth: Date }): boolean {
    const age = differenceInYears(new Date(), student.date_of_birth);
    return age >= 17;
  }
}
```

#### DSAR Flow Changes

| Scenario                             | Current Behaviour                  | New Behaviour                                                                                                                                                              |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DSAR for student aged < 17           | Parent submits, processed normally | No change                                                                                                                                                                  |
| DSAR for student aged 17+ by parent  | Parent submits, processed normally | Flag for school review: "This student is 17+. Per DPC guidance, please confirm processing is in the student's best interest." School must confirm before DSAR is processed |
| DSAR for student aged 17+ by student | Not supported                      | Add `student` as direct DSAR submitter type. Student can submit own DSAR through a portal or form                                                                          |

#### Schema Change

```sql
-- compliance_requests already has subject_type and requester info
-- Add a flag for age-gated review
ALTER TABLE compliance_requests ADD COLUMN age_gated_review BOOLEAN DEFAULT false;
ALTER TABLE compliance_requests ADD COLUMN age_gated_confirmed_by UUID REFERENCES users(id);
ALTER TABLE compliance_requests ADD COLUMN age_gated_confirmed_at TIMESTAMPTZ;
```

#### Parent Portal Visibility (Future Consideration)

For students aged 17+:

- Flag in parent portal: "Your child is 17 or older. Under DPC guidance, they may exercise their own data protection rights."
- This is informational only — do not restrict parent portal access (that's a controller decision for the school)

#### Student DSAR Submission

Create a lightweight DSAR submission form accessible to authenticated students (if student portal exists) or via a public form with identity verification:

- Student provides: name, student number, school, DOB, request type
- School receives and verifies identity before processing
- Same deadline tracking as parent/admin-submitted DSARs

---

## API Changes

| Method | Path                                               | Permission          | Description                                 |
| ------ | -------------------------------------------------- | ------------------- | ------------------------------------------- |
| POST   | `/api/v1/admissions/forms/:id/validate-fields`     | `admissions.manage` | Check fields for data minimisation warnings |
| POST   | `/api/v1/compliance-requests/:id/confirm-age-gate` | `compliance.manage` | Confirm age-gated DSAR processing           |

**Existing endpoints enhanced:**

- `POST /api/v1/compliance-requests` — auto-set `age_gated_review = true` when subject is 17+ and requester is parent

---

## Frontend Changes

1. **Form builder:** Warning UI when special category keywords detected, justification modal, persistent badges
2. **Form-level summary:** Warning summary when saving forms with flagged fields
3. **DSAR dashboard:** Age-gated review indicator, confirmation button for school
4. **Parent portal:** Informational banner for 17+ students

---

## Testing Requirements

1. **Keyword detection:** Field label "Medical Conditions" triggers warning
2. **Keyword detection:** Field label "Student Name" does NOT trigger warning
3. **Override with justification:** Admin can keep flagged field with mandatory reason, logged in audit
4. **Age gate calculation:** Student born exactly 17 years ago → age-gated = true
5. **Age gate calculation:** Student born 16 years, 11 months ago → age-gated = false
6. **Parent DSAR for 17+ student:** Request auto-flagged for school review
7. **Parent DSAR for 16-year-old:** No age gate flag
8. **School confirmation:** Confirm age-gate → DSAR proceeds to processing
9. **Student self-DSAR:** Student can submit own DSAR (if supported)

---

## Definition of Done

- [ ] Keyword detection engine for admissions form builder
- [ ] Warning UI with justification override
- [ ] Override logging in audit trail
- [ ] Form-level summary for flagged fields
- [ ] `AgeGateService` implemented
- [ ] DSAR auto-flags age-gated cases
- [ ] School confirmation workflow for age-gated DSARs
- [ ] `age_gated_review` columns added to `compliance_requests`
- [ ] Parent portal informational banner for 17+ students
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase H: Data Subject Protections

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially student self-DSAR submission approach]
- **Schema changes:** [migration name]
- **New endpoints:** [list]
- **New frontend pages:** [form builder warnings, age-gate UI]
- **Tests added:** [count]
- **Architecture files updated:** [if any]
- **Unlocks:** None (terminal phase — all Phase 2 items complete)
- **Notes:** [any edge cases discovered with age calculation, keyword false positives]
```
