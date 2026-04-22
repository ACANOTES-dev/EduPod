# Pre-Launch Gaps — School Operating System

> Enumerates product surfaces that are built in code but not yet shippable to a first tenant, either because:
> (a) the backend is complete but there is no user-facing UI at all, or
> (b) the UI is complete but unreachable from the morph bar, so users would have to type URLs.
>
> **Generated**: 2026-04-22.
> **Source of truth for what exists**: `docs/architecture/feature-map.md` (verified 2026-04-21).
> **Maintenance**: Remove an entry once the gap is closed. This file should eventually be empty.

---

## Category A — Modules with working backend but no user-facing UI

These are feature-complete server-side but have zero (or near-zero) pages. They cannot be handed to a tenant as-is.

### A1. Child Protection

- **Backend**: `apps/api/src/modules/child-protection/` — 12 endpoints across `cp-records`, `cp-export` (preview / generate / signed-token download), `cp-access` (grant / revoke / list / check), and `mandated-report.service`.
- **Frontend**: None. Feature map §35 explicitly states: _"No dedicated standalone page group yet."_
- **What's needed**:
  - Records list + detail view (under or adjacent to `/safeguarding`)
  - Export flow (preview → generate → download)
  - Access-grant management with audit log
  - Mandated-report submission surface
- **Who is blocked**: DLP / safeguarding leads. Regulatory-critical in IE/UK.

### A2. Queue Admin

- **Backend**: `apps/api/src/modules/queue-admin/` — `/v1/admin/queues/*` for BullMQ inspection, retry, and delete.
- **Frontend**: None. Today the only way in is cURL/SSH.
- **What's needed**: an `/admin/queues` page under platform admin showing per-queue depth, failed / delayed / completed counts, and click-through to job detail with retry / delete actions.
- **Audience**: platform operators, not tenants. Can slip post-launch but highly valuable for prod ops.

### A3. Wellbeing-Notifications — Per-Event Channel Config

- **Backend**: `modules/wellbeing-notifications/` writes to `tenant_notification_preferences.wellbeing_channels` (JSONB). Event catalogue includes `incident.logged`, `concern.raised`, `sla.breach`, `critical.declared`, `appeal.*`, `recognition.awarded`, etc. (14+ keys.)
- **Frontend**: No settings page. The JSONB is only mutable via direct SQL today.
- **What's needed**: `/settings/wellbeing-notifications` — a grid of events × channels (in-app / email / SMS / WhatsApp) with per-event toggles and severity thresholds. Ideally a link from the main `/settings` dashboard.

### A4. AI Audit Records

- **Backend**: `modules/compliance/` exposes AI audit stats + records endpoints (token counts, prompts, model versions).
- **Frontend**: No visible tile or page.
- **What's needed**: an AI Audit section under `/settings/compliance` or `/regulatory/compliance` showing prompts sent, tokens consumed, model versions, per-feature breakdown, and retention policy. Needed for GDPR Art. 22 and EU AI Act reporting.

---

## Category B — Built and polished, just unreachable via nav

The pages exist and work. They need hub-dashboard tiles so users don't have to memorise URLs.

### B1. Payroll — no tile on `/finance` hub

- **Routes (all built)**: `/payroll`, `/payroll/runs`, `/payroll/compensation`, `/payroll/staff-attendance`, `/payroll/class-delivery`, `/payroll/reports`, `/payroll/exports`, `/payroll/history`, `/payroll/my-payslips`.
- **Current state**: Finance hub `basePaths` include `/payroll` (so active-hub highlighting works), but `/finance` dashboard tiles only cover `/finance/overview`, `/finance/fee-generation`, `/finance/payments/new`, `/finance/invoices`, `/finance/statements`. No payroll tile.
- **Blocks**: `school_owner`, `school_principal`. Payroll is a monthly non-negotiable.
- **Fix**: add a Payroll tile to `/finance`. Consider promoting Payroll to its own top-level hub if monthly usage warrants it.

### B2. SEN — no tile on `/wellbeing` hub

- **Routes (all built)**: `/sen`, `/sen/students`, `/sen/students/[studentId]`, `/sen/plans/[planId]`, `/sen/plans/[planId]/goals/new`, `/sen/resource-allocation`, `/sen/sna-assignments`, `/sen/reports`, `/parent/sen`, `/parent/sen/[planId]`.
- **Current state**: Wellbeing hub `basePaths` include `/sen`, but `/wellbeing` dashboard tiles only cover Behaviour, Pastoral, Safeguarding, Early Warning, and Staff Wellbeing.
- **Blocks**: SENCO, teachers assigned to SEN students, parents with SEN children.
- **Fix**: add a SEN tile to `/wellbeing`. The SEN sub-routes then discover naturally from `/sen`.

### B3. Parent Portal Cohesion

Parents land on `/dashboard/parent`. Today it only links to `/engagement/parent/events`, `/homework/parent`, `/privacy-consent`, and `/privacy-notice`. Everything else is URL-only for parents.

Missing links from the parent dashboard:

- `/applications` — their submitted admissions applications
- `/inquiries` — parent ↔ admin threaded messaging
- `/announcements` — school announcements
- `/parent/sen` — their child's SEN plan
- `/behaviour/parent-portal` + `/behaviour/parent-portal/recognition` — behaviour + recognition view
- `/inbox` — the new default messaging surface (already in the morph bar, but a dashboard tile helps discoverability)

**Fix**: redesign `/dashboard/parent` as a proper hub with a full set of tiles, or introduce a parent-specific morph bar.

---

## Category C — Leave Management (partial; needs finishing)

The leave module is built on the backend and partly surfaced, but the payroll-side integration and staff self-service are incomplete.

- **Already surfaced**:
  - `/scheduling/leave-requests` — admin approve / reject
  - `/dashboard/teacher/leave` — staff self-service request entry
- **Missing**:
  - `/settings/leave-types` — tenant leave-type catalogue is only writable via DB today
  - `/payroll/absences` (or similar) — `GET /v1/payroll/absence-periods?period=YYYY-MM` has no consuming UI, so school owner / principal running month-end can't view monthly absence summaries without cURL
  - `/leave` staff hub — no unified view of an individual staff member's leave history, remaining balance, or pending requests
- **Also missing**: the leave module is entirely undocumented in `docs/architecture/feature-map.md`. Add a new §40 Leave Management section when the UI ships.

---

## Category D — Documentation drift to fix before launch

### D1. Dead sidebar nav code

`apps/web/src/lib/nav-config.ts:33-236` exports `navSectionConfigs` — a 14-section sidebar structure with 50+ items including direct entries for SEN and Payroll. The live `layout.tsx` no longer imports it; only `layout.spec.ts` does.

This is the root cause of B1 and B2: SEN and Payroll were reachable in the pre-morph-redesign sidebar, so when the sidebar was deleted the tiles never got ported forward.

Before launch:

- **Delete** `navSectionConfigs` + its test coverage, OR
- **Restore** it as a secondary nav if hub dashboards can't cover all entry points.

### D2. Feature map gaps

- Leave module not documented (see Category C).
- Stub modules (`events/`, `trips/`, `critical-incidents/`, `pastoral-checkins/`, `pastoral-dsar/`) not explicitly called out as intentional wrappers where the real logic lives in `engagement/` or `pastoral/`.

---

## Explicitly NOT in this list (to avoid confusion)

The following were suspected gaps on an earlier pass but are actually reachable via nav:

- **Subjects, Curriculum Matrix, Class Assignments, Promotion** — reachable via `/learning` → Classes tile (class list + assignments + promotion) or Curriculum tile (subjects + matrix).
- **Gradebook, Grade Analytics** — reachable via `/learning` → Assessments tile.
- **Report Comments, Comment Library, Teacher Requests** — reachable via `/learning` → Report Cards tile.
- **Safeguarding Keywords** — reachable via `/inbox` → Policy Configuration.

---

## Summary — launch blockers

| #   | Item                           | Blocker for first tenant?                   |
| --- | ------------------------------ | ------------------------------------------- |
| A1  | Child Protection UI            | **Yes** — regulatory                        |
| A2  | Queue Admin UI                 | No — ops-only, can slip                     |
| A3  | Wellbeing notifications config | **Yes** — tenants must be able to configure |
| A4  | AI Audit UI                    | **Yes** — GDPR / AI Act                     |
| B1  | Payroll tile on Finance hub    | **Yes** — must-have for owner / principal   |
| B2  | SEN tile on Wellbeing hub      | **Yes** — must-have for SENCO               |
| B3  | Parent portal cohesion         | **Yes** — parents can't navigate            |
| C   | Leave management finish        | **Yes for payroll absences**; rest partial  |
| D1  | Dead sidebar nav cleanup       | No — code hygiene                           |
| D2  | Feature map updates            | No — docs hygiene                           |

All blockers above are contained; none require architectural changes, database migrations, or schema changes. They are all add-tile / add-page work inside the existing morph-bar + hub-dashboard pattern.
