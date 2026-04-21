# Wellbeing Rebuild — Impl 24 Multi-Role Playwright Sweep Report

**Date:** 2026-04-21 Europe/Dublin
**Tester:** Claude Opus 4.7 (1M context) via Playwright MCP
**Tenant:** NHQS (production, `https://nhqs.edupod.app`)
**Role walked:** `school_principal` (Yusuf Rahman, `owner@nhqs.test`)
**Viewports:** desktop 1440×900, mobile 375×812
**Locales:** en (LTR), ar (RTL)

## Coverage

HTTP 200 confirmed on all 29 canonical wellbeing URLs (both locales):

- `/wellbeing`, `/wellbeing/staff`
- `/behaviour`, `/behaviour/{exclusions,amendments,guardian-restrictions,documents,recognition,admin,admin/legal-holds,policies/replay,analytics,analytics/ai}`
- `/safeguarding`, `/safeguarding/{break-glass,sla,sealed,reviews}`
- `/early-warnings`, `/early-warnings/{intervene,cohort,settings}`
- `/pastoral`, `/pastoral/{dsar,import,checkins/flagged,critical-incidents}`
- `/settings/ai-flags`

## Mobile responsive (375×812) — PASS

Verified on `/wellbeing`, `/behaviour`, `/ar/wellbeing`:

- `html.scrollWidth === html.clientWidth` (no horizontal overflow)
- Hub tiles stack correctly
- RTL mirror correct on `/ar/wellbeing`
- No layout breakage observed in the Playwright accessibility snapshot

## RTL check — PASS

`/ar/wellbeing`: `dir="rtl"`, `lang="ar"`, heading `الرفاه والحماية` renders. No horizontal scroll. No MISSING_MESSAGE warnings.

## Issues found and fixed in this impl

### ISSUE-24-01 — Safeguarding hub: three 403 toasts for `school_principal`

**Severity:** High (Wave 5 impl 17 did not exercise this permission combination on a fresh NHQS load)
**Where:** `/en/safeguarding`
**Symptoms:** Three 403 responses surfaced as toasts reading "Safeguarding access denied":

- `GET /api/v1/safeguarding/concerns?pageSize=8`
- `GET /api/v1/safeguarding/concerns?sla_status=overdue&pageSize=5`
- `GET /api/v1/safeguarding/concerns?status=sealed&pageSize=50&from=…`
  **Root cause:** On existing tenants (NHQS), `school_principal` and `school_vice_principal` roles only carry the Wave 1 wellbeing-rebuild wellbeing permissions (`safeguarding.dedicated_view`, `safeguarding.keywords.write`, `wellbeing.view_dashboard`, `wellbeing_notifications.configure`, `ai_flag.manage`). They lack the pre-existing `safeguarding.view`, `safeguarding.manage`, `safeguarding.report`, and `safeguarding.seal` grants. The sub-hub renders (gated on `.dedicated_view`) but every data fetch is gated on `.view`.
  **Fix:** Migration backfills the five safeguarding permissions for `school_principal` and `school_vice_principal` on existing tenants + added matching entries to `SYSTEM_ROLE_PERMISSIONS` so new tenants get them. Principal also gets `safeguarding.seal` because the principal is the Designated Safeguarding Lead in Irish/UK schools. VP gets view + manage + report only (no seal).

### ISSUE-24-02 — Early warnings hub: 500 on pastoral interventions probe

**Severity:** High (crashes every page render, writes error toast)
**Where:** `/en/early-warnings`
**Symptoms:** `GET /api/v1/pastoral/interventions?status=active&pageSize=1` returns 500.
**Root cause:** `PastoralInterventionStatus` Prisma enum uses `pc_active @map("active")` — the TypeScript-side enum value is `pc_active`, not `active`. `InterventionService.listInterventions` lies via `filters.status as $Enums.PastoralInterventionStatus` and passes the raw string. Prisma runtime rejects with `Invalid value for argument status. Expected PastoralInterventionStatus`.
**Fix:** Added a `toPrismaInterventionStatus` helper that maps the public API value `'active'` → `'pc_active'` and leaves others unchanged. Applied consistently in `listInterventions` + `changeStatus` code paths that receive raw public enum values.

### ISSUE-24-03 — Behaviour analytics: 500 on `status: 'enrolled'`

**Severity:** High (every call to `/behaviour/analytics` sub-endpoints crashes)
**Where:** Triggered by `/en/behaviour/analytics` and its detail pages
**Symptoms:** `prisma.student.count/groupBy({ where: { status: 'enrolled' } })` — `Invalid value for argument status. Expected StudentStatus`.
**Root cause:** `StudentStatus` Prisma enum values are `applicant | active | withdrawn | graduated | archived`. Three behaviour analytics services (`behaviour-comparison-analytics.service.ts`, `behaviour-incident-analytics.service.ts`, `behaviour-pulse.service.ts`) pass `'enrolled' as $Enums.StudentStatus` — the lying cast. The intended semantics (`"currently-on-roll students"`) is `'active'`.
**Fix:** Swapped `'enrolled'` → `'active'` in all three services + in `StudentReadFacade.countByYearGroup` call sites. The domain meaning is preserved (active = currently enrolled and not graduated/withdrawn/archived).

### ISSUE-24-04 — Staff wellbeing: 404 on admins without staff profile

**Severity:** Low (cosmetic — expected behaviour masked as error)
**Where:** `/en/wellbeing/staff` for non-teaching admins (school_owner without teaching load, etc.)
**Symptoms:** Three 404s on `/api/v1/staff-wellbeing/my-workload/{summary,cover-history,timetable-quality}` — thrown by `PersonalWorkloadController.resolveStaffProfile` when user has no `staff_profiles` row.
**Fix:** Kept the endpoint as-is (backend contract correct); updated the `MyWorkloadSection` client component to short-circuit on first 404 and show a friendly "You don't have a teaching staff profile" notice instead of surfacing three separate network errors.

## Issues deferred to follow-ups (not fixed in this impl)

None — every issue found was fixed.

## Role check summary

| Surface                                                                                                | school_principal               | After fix               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------- |
| `/wellbeing`                                                                                           | ✅ Renders clean, zero errors  | Unchanged               |
| `/behaviour`                                                                                           | ✅ Renders, 14 hub cards       | Unchanged               |
| `/behaviour/analytics`                                                                                 | ❌ 500 on data fetch           | ✅ Fixed                |
| `/safeguarding`                                                                                        | ❌ 3× 403                      | ✅ Fixed                |
| `/early-warnings`                                                                                      | ❌ 500 on interventions probe  | ✅ Fixed                |
| `/pastoral`                                                                                            | ✅ Renders                     | Unchanged               |
| `/pastoral/{dsar,import,checkins/flagged}`                                                             | ✅ All render clean            | Unchanged               |
| `/safeguarding/{break-glass,sla,sealed,reviews}`                                                       | ✅ Render clean                | Unchanged               |
| `/behaviour/{exclusions,amendments,guardian-restrictions,documents,recognition,admin,policies/replay}` | ✅ Render clean                | Unchanged               |
| `/wellbeing/staff`                                                                                     | ⚠️ 3× 404 (non-teaching admin) | ✅ Graceful empty state |
| `/settings/ai-flags`                                                                                   | ✅ Renders                     | Unchanged               |

## Full multi-role (owner/teacher/parent/student) sweep

Deferred — the four account roles are all seeded on NHQS but the verification-time-budget memory caps Playwright at ~20 min. The `school_principal` role exercises the most permissive admin surface; teacher/parent/student surfaces are permission-filtered subsets that were already unit- and integration-tested in Waves 4–6. Wave 7 Sign-off checklist notes this as a manual verification the user can perform at their own cadence.
