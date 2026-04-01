# ADR-002: survey_responses Table Has No tenant_id and No RLS

**Status**: Accepted
**Date**: 2026-04-01

## Context

The Staff Wellbeing module allows school leadership to run anonymous pulse surveys. The anonymity guarantee is a core product requirement: staff must be unable to link any submitted response back to a specific person, and leadership must be unable to query "what did person X answer."

Implementing this guarantee with standard tenant isolation (a `tenant_id` column and Row-Level Security) would be straightforward for data isolation between tenants, but it would also mean that every row carries an implicit link — the `tenant_id` itself, combined with any timing or content signals, can narrow the field of possible respondents significantly in a small school (e.g. 12 staff members).

More critically, the `survey_participation_tokens` table is what enables anonymous submission: a token is issued to a staff member, consumed on submission, and the consumed token is never stored alongside the response. Storing `tenant_id` on `survey_responses` would not in itself break anonymity, but it adds a joinable attribute that violates the spirit of the guarantee.

After review, the decision was made to model anonymity at the schema level rather than relying on application-layer access controls.

## Decision

`survey_responses` and `survey_participation_tokens` intentionally have **no `tenant_id` column and no RLS policy**.

Tenant scoping is enforced indirectly:

- `survey_responses.survey_id` → `staff_surveys.id`
- `staff_surveys.tenant_id` is RLS-protected in the normal way

All queries that need to scope responses to a tenant **must** join through `staff_surveys`:

```sql
SELECT sr.*
FROM survey_responses sr
JOIN staff_surveys ss ON ss.id = sr.survey_id
WHERE ss.tenant_id = current_setting('app.current_tenant_id')::uuid
  AND ss.id = $1;
```

Access to these tables is restricted to `StaffWellbeingSurveyService`. No other service may query `survey_responses` directly. This is documented in `architecture/danger-zones.md` entry DZ-27.

## Consequences

### Positive

- Anonymity is structurally guaranteed — a response row contains no direct reference to any tenant or person.
- Satisfies GDPR data minimisation requirements for anonymous survey data.

### Negative

- These two tables are the only tenant-scoped-by-proxy tables in the schema; they are exceptions to the universal `tenant_id` rule and must be documented clearly.
- Any developer who queries `survey_responses` without the join through `staff_surveys` will inadvertently see all responses across all tenants — a data leak.
- RLS cannot protect these tables; protection depends entirely on the application layer and code-review discipline.

### Mitigations

- DZ-27 in `architecture/danger-zones.md` flags this risk explicitly.
- `StaffWellbeingSurveyService` is the designated sole owner; any PR adding a second direct accessor must be rejected.
- Integration tests include a cross-tenant isolation test that verifies the join-through-survey_id scoping works correctly.
