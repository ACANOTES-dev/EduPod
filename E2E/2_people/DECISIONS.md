# People Module — Bug Fix Decisions

**Session:** 2026-04-16
**Agent:** Claude Opus 4.6

---

- PEOPLE-001 (2026-04-16): Replaced 87 `[AR]` placeholder translations across students/households/parents namespaces. Also replaced hardcoded English strings in students list page component with i18n keys (subtitle, column headers, status badges, pagination). — Claude Opus 4.6
- PEOPLE-002 (2026-04-16): Used `useIsAdmin()` hook to gate Edit and Change Status buttons. Backend enforces `students.manage` as the hard gate; frontend hides controls for non-admin roles. — Claude Opus 4.6
- PEOPLE-005 (2026-04-16): Added `toast.error(tCommon('fetchError'))` in the students list catch block. Minimal change — no error state component, just a toast. — Claude Opus 4.6
- PEOPLE-006 (2026-04-16): Used `useIsAdminTier()` (school_owner, school_principal, school_vice_principal) to gate Bank Details tab. The frontend auth context doesn't expose granular permissions, only roles. Backend still enforces `payroll.view_bank_details`. — Claude Opus 4.6
- PEOPLE-009 (2026-04-16): Added missing `staff.fieldUser` key to en.json ("User") and ar.json ("المستخدم"). — Claude Opus 4.6
- PEOPLE-010 (2026-04-16): Added "New Household" button in PageHeader actions, linking to /households/new. Same pattern as staff list. — Claude Opus 4.6
- PEOPLE-011 (2026-04-16): Added Unlink icon button with native `confirm()` dialog on each guardian list item. Uses existing `DELETE /households/:id/parents/:parentId` endpoint. — Claude Opus 4.6
- PEOPLE-012 (2026-04-16): On re-activation (status → active), `exit_date` is set to null. Class enrolment re-enrollment is NOT automatic — would require user to re-enroll manually. — Claude Opus 4.6
- PEOPLE-013 (2026-04-16): Defined `VALID_STATUS_TRANSITIONS` map: archived is terminal (prevents merge-source revival). Throws `BadRequestException` with code `INVALID_STATUS_TRANSITION`. — Claude Opus 4.6
- PEOPLE-014 (2026-04-16): Won't Fix — search is not live. The search-sync queue and processors exist but Meilisearch is not wired. Wiring producers now would be dead code. — Claude Opus 4.6
- PEOPLE-018 (2026-04-16): Changed all preview cache keys from `preview:{entity}:{id}` to `preview:{entity}:{tenant_id}:{id}`. Defence-in-depth against theoretical UUID collision in multi-tenant scenario. — Claude Opus 4.6
- PEOPLE-019 (2026-04-16): Pre-validates parent_ids belong to source household before executing split. Returns 400 `INVALID_PARENT_IDS`. — Claude Opus 4.6
- PEOPLE-020 (2026-04-16): Added `toast.info` in `RequireRole` component before redirect. Brief "You don't have access to that page" toast. — Claude Opus 4.6

## Blocked — need input

- PEOPLE-003: Requires product decision — should teachers see full student roster or only students in their assigned classes?
- PEOPLE-004: Linked to PEOPLE-003. Export scope depends on same product decision.
- PEOPLE-007: Requires product + GDPR compliance decision — should medical data be scoped to assigned classes, gated by new permission, or left as-is?
- PEOPLE-008: Requires product decision — should inactive staff be blocked from logging in? Some schools let inactive staff view payslips.
- PEOPLE-015: Requires schema migration (`password_changed_at` column) + new middleware. Infrastructure scope beyond code fix.
- PEOPLE-016: Requires DB admin role changes. Cannot be done from application code alone.
- PEOPLE-017: Requires AWS Secrets Manager or KDF key hierarchy. Infrastructure/security scope.
- PEOPLE-021: Requires product decision — should teachers see homework analytics, should the tab be hidden, or should it show a graceful message?
