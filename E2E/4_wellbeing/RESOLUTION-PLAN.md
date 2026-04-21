# Wellbeing Bug Log — Resolution Plan

**Source:** Directives recorded during the 2026-04-21 `/fix-bug-log` sweep.
**Companion files:** [`BUG-LOG.md`](BUG-LOG.md) · [`DECISIONS.md`](DECISIONS.md) · [`PLAYWRIGHT-WALKTHROUGH-RESULTS.md`](PLAYWRIGHT-WALKTHROUGH-RESULTS.md)

This document is the authoritative disposition for every blocked bug in the
wellbeing pack. Future sessions should treat the "Verdict" line on each item
as a firm product decision — do not re-litigate.

Each group below explains:

1. What was blocked and why.
2. The user's verdict (ship, retire, or explicit policy).
3. A concrete build-out specification so another agent can pick up the work
   without reading the full bug log first.

---

## Group 1 — Missing admin routes (12 pages across 5 bugs)

**Verdict: SHIP all 12.**

### WB-117 — Five behaviour analytics deep-views

**Build:**

- Create five new Next.js pages under
  `apps/web/src/app/[locale]/(school)/behaviour/analytics/`:
  - `heatmap/page.tsx` — incident density heatmap (day × period matrix), driven
    by `/api/v1/behaviour/analytics/heatmap`.
  - `staff/page.tsx` — per-staff incident counts + trend, driven by
    `/api/v1/behaviour/analytics/staff`.
  - `comparisons/page.tsx` — year-group / class comparison bars, driven by
    `/api/v1/behaviour/analytics/comparisons`.
  - `subjects/page.tsx` — incident count by subject, driven by
    `/api/v1/behaviour/analytics/subjects`.
  - `categories/page.tsx` — incident count by category with polarity split,
    driven by `/api/v1/behaviour/analytics/categories`.
- Each page follows the existing analytics layout: `PageHeader` → filter row
  (date range + year group) → Recharts visual → data table.
- Backend: extend `BehaviourAnalyticsService` with five new methods, each
  returning `{ data: [...], meta: { generated_at } }`. Add corresponding
  controller routes + Zod query schemas for filters.
- Permissions: all five require `behaviour.view_analytics`.
- Add Jest specs for each service method + a role-permission cell in the
  security matrix.

### WB-118 — `/behaviour/policy-replay`

**Build:**

- Previous implementation shipped a preview page (commit `0a5c11a6`) but the
  route itself 404s — check if the file exists; if it does, the issue is a
  routing / permission misconfiguration. If it doesn't, create:
  - `apps/web/src/app/[locale]/(school)/behaviour/policy-replay/page.tsx`
    with a rule picker, date-range input, "Preview" button that hits
    `/api/v1/behaviour/policy-replay/preview` and renders the affected
    incidents.
  - Already-translated copy lives under `behaviourPolicyReplay.*` in both
    `en.json` and `ar.json` — re-use it.
- Keep the execute (persist) path behind a typed-phrase confirmation.

### WB-119 — Four routes (houses, leaderboard, policies, templates)

**Build:**

- `/behaviour/houses` — list of house teams with standings. Use the existing
  `/api/v1/behaviour/houses` endpoint plus the leaderboard endpoint to render
  team cards with points + member counts.
- `/behaviour/leaderboard` — top students (standalone page, not just the tab
  inside recognition). Reuse `/api/v1/behaviour/recognition/leaderboard`.
- `/behaviour/policies` — list of active policy rules with enable/disable
  toggles. Backend endpoint already exists; this is a UI-only add.
- `/behaviour/templates` — list of incident / letter templates available to
  staff. Reuse `/api/v1/behaviour/templates`.
- Each page should link out from the behaviour hub tiles that currently
  404 — keep the existing tile copy in `messages/`.

### WB-110 — `/behaviour/sanctions/new`

**Build:**

- Create a standalone sanction create form at
  `apps/web/src/app/[locale]/(school)/behaviour/sanctions/new/page.tsx`.
- Fields: student(s), sanction type (detention / suspension / community
  service), scheduled date, notes, optional link to an existing incident.
- POST `/api/v1/behaviour/sanctions` — the endpoint exists (already used for
  side-effect creation from incidents); add an explicit `source='manual'` flag.
- Gate on `behaviour.manage_sanctions` permission.

### WB-114 — `/behaviour/recognition/new`

**Build:**

- Mirror WB-110 for recognition awards.
- Fields: student(s), award type, point value (derived from award type), note.
- POST `/api/v1/behaviour/recognition-awards` — the endpoint exists; add the
  same `source='manual'` flag pattern.
- Gate on `behaviour.manage_recognition`.

### Cross-cutting for Group 1

- All 12 pages must render at 375 × 667 viewport (mobile-first per
  `.claude/rules/frontend.md`).
- Add to `docs/architecture/feature-map.md` once shipped.
- Each new page needs at least one Playwright happy-path spec + one
  permission-denied spec.

---

## Group 2 — Missing backend endpoints (3 bugs)

**Verdict: SHIP all 3.**

### WB-131 — `GET /api/v1/academic/year-groups`

**Build:**

- Add a controller + service in `apps/api/src/modules/academic/` (or create
  the module if it doesn't exist yet — check first, there's an existing
  `year-groups` concept in `settings/year-groups`).
- Signature: `GET /api/v1/academic/year-groups?pageSize=100` →
  `{ data: YearGroup[], meta: { page, pageSize, total } }`.
- Permission: `academic.view_year_groups` (or reuse an existing
  `settings.view` — check RBAC map first).
- The behaviour-policies settings page in `apps/web` already expects this
  exact URL — no frontend change needed.

### WB-133 — `GET /api/v1/behaviour/award-types`

**Build:**

- The DB table `behaviour_award_types` exists per the schema. Add:
  - `GET /api/v1/behaviour/award-types?pageSize=100` — list.
  - `POST /api/v1/behaviour/award-types` — create.
  - `PATCH /api/v1/behaviour/award-types/:id` — update.
  - `DELETE /api/v1/behaviour/award-types/:id` — archive (status-based soft
    delete per `.claude/rules/prisma.md`).
- Permission: `behaviour.manage_settings` for writes; `.view_settings` for
  reads.
- The behaviour-awards settings page already expects the URL — check whether
  the existing "Add Award" CTA wires up once the endpoint ships.

### WB-135 (backend portion) — `GET/PATCH /api/v1/safeguarding/settings`

**Build:**

- The DB row likely already exists in a `safeguarding_settings` or
  `tenant_settings` style table — check `packages/prisma/schema.prisma`.
- `GET /api/v1/safeguarding/settings` → returns the current tenant's
  settings row (DLP user, deputy DLP, board contact, SLA thresholds × 4,
  retention years, module_enabled).
- `PATCH /api/v1/safeguarding/settings` → updates the row; all fields
  optional.
- Permission: `safeguarding.manage_settings` (principal / DLP only).
- Zod schema in `packages/shared/src/safeguarding/schemas/settings.schema.ts`.
- The i18n keys are already shipped (see `f9606bc2`) — the page will render
  correctly once the endpoint responds.

---

## Group 3 — Security policy decisions (7 bugs)

### WB-C-01 — Break-glass dual approval

**Verdict: NO dual control required.**

**Build:** No change. Document the decision in
`docs/architecture/danger-zones.md` so future audit reviewers don't re-raise
it. Add a note that single-admin break-glass is acceptable for this tenant
class (K-12 schools, ≤50 staff) and the audit log is the primary safeguard.

### WB-C-02 — Guardian-restriction coverage on parent endpoints

**Verdict: AGREED — ship central interceptor.**

**Build:**

- Add a NestJS interceptor `GuardianRestrictionInterceptor` that fires for
  every endpoint under the `/parent/` namespace.
- On each request, look up the JWT's `user_id` + any student ID in the route
  params or query string, and cross-check against
  `guardian_restrictions` where `status='active'` and current date is within
  `effective_from`/`effective_to`.
- On match: throw `ForbiddenException({ code: 'GUARDIAN_RESTRICTED',
message: '...' })`.
- Register the interceptor on every parent controller via a `@Controller`
  decorator chain, OR apply globally and gate on the `/parent/` path prefix.
- Add an RBAC regression test that creates a restriction, then attempts each
  parent endpoint as the restricted guardian — assert 403 on all.
- Update `docs/architecture/danger-zones.md` entry DZ-Wellbeing-N (create one
  if it doesn't exist) describing the coverage.

### WB-C-03 — AI-flag cache invalidation on disable

**Verdict: YES — pub/sub invalidation.**

**Build:**

- When `PATCH /api/v1/ai-flags` fires (enabling/disabling a module's AI
  features), emit a BullMQ event `ai_flags:invalidated` with the `tenant_id`
  and `module_key`.
- Every service that caches AI-flag state in-memory (check `useAiFlag` on
  the frontend and any backend `AiFlagsService` in-memory map) must
  subscribe and clear its cache entry on receipt.
- Add a Jest integration test: cache an AI-flag value, emit the event,
  assert the cache is cleared on the next lookup.
- Worker side: the `TenantAwareJob` base class sets RLS context — reuse it.

### WB-C-04 — SHA256 re-hash on document download

**Verdict: YES — tamper detection.**

**Build:**

- In the behaviour document download handler (grep for
  `behaviour/documents/:id/download` or similar in
  `apps/api/src/modules/behaviour/`), stream the file from Hetzner Object
  Storage and compute its SHA256 as it's read.
- Compare against the stored `sha256_checksum` on the `behaviour_documents`
  row.
- On mismatch: abort the download with 500 + audit-log a `DOCUMENT_TAMPERED`
  event at `critical` severity; do NOT serve the bytes.
- Use the streaming API to avoid loading the full file into memory.
- Jest test: upload a known-content file, flip one byte in storage, attempt
  download, assert failure + audit entry.

### WB-C-05 — Prompt-injection documentation + tests

**Verdict: YES — document + test.**

**Build:**

- Create `docs/security/prompt-injection.md` listing every Anthropic API call
  in the codebase with:
  - Call site (file + line).
  - System prompt verbatim.
  - Inputs that can reach the prompt (user-generated text fields).
  - Output filter (regex, length cap, JSON schema, content moderation).
- Add Jest tests in `apps/api/test/security/prompt-injection.spec.ts` that
  fire adversarial payloads at every AI endpoint:
  - `"Ignore previous instructions and..."`.
  - Unicode lookalike injection (Cyrillic "е" vs Latin "e").
  - Markdown / HTML injection into prompt-visible fields.
  - JSON-breakout attempts.
- Each test asserts the response stays within the expected output schema and
  doesn't leak the system prompt.
- Permission-gate the calls: only users with `ai.invoke` can trigger them.

### WB-C-06 — CP grants dual approval

**Verdict: NO dual control required.**

**Build:** Same as WB-C-01. Document the decision. Single-admin CP access
grants are acceptable given the audit log + the after-action review
workflow already in place.

### WB-C-07 — JWT access-token TTL audit

**Claude's recommendation:** **15 minutes** for access tokens, paired with a
7-day refresh cookie rotation. This matches OWASP + the Auth0 / Supabase
defaults, and balances session continuity against token-replay risk. If a
token is exfiltrated, the attacker has a 15-minute window before it expires.

**Build (pending user confirmation of the 15-minute figure):**

- Audit `apps/api/src/modules/auth/` to confirm `JWT_EXPIRES_IN` env var is
  respected and defaults to `900` (15 min).
- Add a fail-fast check in the auth module's `onModuleInit`: if
  `JWT_EXPIRES_IN > 900`, throw on boot so CI catches it.
- Document the refresh-token rotation strategy in
  `docs/architecture/context.md` (auth section).
- Add a test asserting a token issued with `JWT_EXPIRES_IN=900` is rejected
  901 seconds after issuance.

---

## Group 4 — Cross-cutting observations (13 bugs)

**Verdict: SHIP all now — apply Claude's recommendation per item.**

### WB-C-08 — EAP refresh cron fires for tenants without EAP

**Recommended fix:** Guard clause in the cron processor.

- In the EAP refresh processor, first query `tenant_settings` (or equivalent)
  for EAP configuration presence. If missing/disabled, skip the notification
  dispatch for that tenant and log at `info` level.
- Keeps the cron running cross-tenant but stops noise.

### WB-C-09 — Attachment flagged state not surfaced

**Recommended fix:** Add a visible scan status on attachment cards.

- In the attachment card component (grep `AttachmentCard` or similar), show
  a `pending` / `clean` / `flagged` badge derived from the `scan_status`
  field.
- On `flagged`: show a red banner on the card with the flagged reason and a
  "Contact DLP" CTA.
- Email the uploader when their attachment is flagged (reuse the existing
  notification dispatch).

### WB-C-10 — Survey created_at timestamp leaks anonymity

**Recommended fix:** Bucket timestamps in export.

- In the survey export service, round `created_at` to the start of the week
  the response was submitted. Preserves enough granularity for trend
  analysis without allowing response-to-individual correlation.
- Apply the same bucketing to CSV and PDF exports.
- Internal admin views keep the precise timestamp.

### WB-C-11 — No rate-limit on safeguarding reports

**Recommended fix:** KEEP as-is + add monitoring.

- Safeguarding reports must never be rate-limited — children's safety depends
  on the "send now" path.
- Instead, add an abuse monitor: emit a metric `safeguarding.report.rate`
  and alert when any single user submits > 20 reports in an hour. Route the
  alert to the DLP, not the submitter.
- Document in `docs/architecture/danger-zones.md` that rate-limiting this
  endpoint is explicitly forbidden.

### WB-C-12 — Platform-admin cross-tenant reads need per-read audit

**Recommended fix:** Add audit-log interceptor for the `/admin/` namespace.

- Extend the existing `AuditLogInterceptor` to fire on GET requests (not just
  mutations) when the path starts with `/admin/` and the tenant being read
  differs from the platform-admin's home tenant.
- Audit entry: `{ actor, action: 'platform_admin.cross_tenant_read', target_tenant, path }`.
- Add a dashboard tile in the platform-admin console showing recent
  cross-tenant reads.

### WB-C-13 — Module-flag hub-tile hard-hide

**Recommended fix:** Wire module-flag into `HubTile` rendering.

- Add an optional `moduleKey` prop to `HubTile`. Pages that render the
  behaviour / pastoral / safeguarding hubs pass the module key.
- `HubTile` consults `useModuleEnabled(moduleKey)` and returns `null` when
  disabled.
- Equivalent to the sub-strip tab filter that already exists — just applied
  to tiles.

### WB-C-14 — EAP-staleness cron

**Recommended fix:** Same as WB-C-08 — share the guard helper.

### WB-C-15 — `pastoral_interventions.status` @map collision (DZ-Wellbeing-1)

**Recommended fix:** Rename the Prisma enum to avoid collision.

- Prisma `@map` values on the pastoral-interventions status enum collide
  with behaviour-interventions. Rename to prefix with `pi_` (e.g.
  `pi_active`, `pi_completed`).
- Data migration: UPDATE the existing string values in the table.
- Update every code reference (grep for the old values).
- Keep the rename + migration in a single PR to avoid partial-state.

### WB-C-16 — Break-glass after-action-review reminder

**Recommended fix:** 24h-before reminder + in-app toast.

- Add a BullMQ scheduled job that fires 6 days after a break-glass grant is
  issued (24h before the 7-day review deadline).
- Dispatch: in-app notification to the grantee + email with a deep link to
  the review form.
- Second reminder at T-2h if still not filed.
- On overdue (T+0): escalate to the principal.

### WB-C-17 — SST 5-minute idempotency silent

**Recommended fix:** Surface the no-op with a toast.

- When the SST agenda submission hits the 5-min idempotency window and
  returns the cached row, surface "Already submitted {N} minutes ago" in a
  toast + don't show success confetti.
- Return a `{ status: 'idempotent_hit', original_id, original_submitted_at }`
  response so the frontend can branch.

### WB-C-18 — AI-flag banner links non-admin to `/settings/ai-flags`

**Recommended fix:** Role-check the link.

- In the AI-disabled banner component, check user role. Admins get a link
  to `/settings/ai-flags`. Non-admins see the banner text without a link
  (or a "Contact your administrator" CTA that mailto's the school owner).

### WB-C-19 — `safeguarding_break_glass_access_log` table not shipped

**Recommended fix:** Create migration + audit wiring.

- New Prisma migration creating the table with:
  `id, tenant_id, grant_id, actor_id, action (granted/accessed/revoked/reviewed),
 entity_type, entity_id, accessed_at, ip_address, user_agent`.
- RLS policy per `.claude/rules/prisma.md`.
- Every break-glass access (grant creation, each resource read while the
  grant is active, review submission) writes a row.
- Platform admin can query this table to audit safeguarding access
  cross-tenant.

### WB-C-20 — `admin_repair_runs` table

**Recommended fix:** Create migration + wiring in behaviour-admin console.

- New table: `id, tenant_id, actor_id, operation, scope, preview_data,
execute_data, status (preview/executed/failed/rolled_back), started_at,
completed_at, error_detail`.
- Every preview + execute in the behaviour-admin repair console writes a
  row.
- Display recent runs on the admin console landing page so admins see what
  they / colleagues have run recently.

---

## Group 5 — Parent / Teacher / Student gaps (8 bugs)

**Verdict: BUILD COMPLETELY — required.**

### WB-C-21 — Teacher AI-flag banner deep-link 403s

**Build:**

- Same fix as WB-C-18 (Group 4): role-gate the link. Teacher sees
  "Contact your administrator" instead of a dead link.
- Applies to every banner in the codebase that targets `/settings/ai-flags`.

### WB-C-22 — Teacher `/wellbeing/dashboard#aggregate` empty

**Build:**

- The `#aggregate` anchor scrolls to a section that's empty for teachers (no
  permission for aggregate analytics).
- Fix: on teacher role, either hide the anchor / section entirely, or show a
  "This view is available to admins only" placeholder.
- Applies the pattern used elsewhere in the module.

### WB-C-23 — Parent portal silent empty state on summary error

**Build:**

- In the parent-portal summary fetch, on error show a retry banner with
  "Couldn't load your summary right now" + retry button + "Contact support"
  link.
- Mirror the aggregate-dashboard retry UX (already shipped for staff
  wellbeing in commit `01d27dd3`).

### WB-C-24 — Parent "Submit appeal" CTA (`/parent-portal/appeals/new`)

**Build:**

- Create `apps/web/src/app/[locale]/(school)/behaviour/parent-portal/appeals/new/page.tsx`.
- Form fields: incident reference (pre-filled from query param if arriving
  from an incident detail), appeal reason (free text, min 50 chars), optional
  supporting documents (file upload).
- Backend: `POST /api/v1/parent/behaviour/appeals` — creates a row in
  `behaviour_appeals` with status `submitted`.
- Surface the new appeal on the parent portal homepage so the parent can
  track its progress.
- Notify the school principal via in-app + email.

### WB-C-25 — "Pending your approval" banner on parent recognition

**Build:**

- On the parent recognition view
  (`apps/web/src/app/[locale]/(school)/behaviour/parent-portal/recognition/`),
  query `/api/v1/parent/behaviour/recognition?status=pending_parent_approval`
  and show a sticky banner at the top if any results.
- The banner lists awards with "Approve" / "Reject" buttons inline.
- On approve: `PATCH /api/v1/parent/behaviour/recognition/:id/approve`.
- On reject: modal asking for reason, then
  `PATCH /api/v1/parent/behaviour/recognition/:id/reject`.

### WB-C-26 — Parent self-referral CTA (`/pastoral/self-referral`)

**Build:**

- Create `apps/web/src/app/[locale]/(school)/pastoral/self-referral/page.tsx`.
- Form: student (the parent's child(ren)), concern category, narrative,
  preferred contact method.
- Backend: `POST /api/v1/parent/pastoral/self-referrals` — creates a
  `pastoral_concern` with `source='parent_self_referral'` and tier 1.
- Route to the school's pastoral lead for triage.
- Confirmation page: "We've received your concern. The pastoral lead will
  contact you within 48 hours."

### WB-C-27 — Friendly "restricted for privacy" explainer

**Build:**

- When a parent is blocked by `guardian_restrictions` from seeing a
  student's data, the frontend currently shows an empty state.
- Replace with a banner: "Access to {student_name}'s records is currently
  restricted. If you believe this is incorrect, contact the school office."
- Do NOT leak any information about what the restriction is, when it was
  set, or why.
- Applies to every parent-scoped view: grades, homework, behaviour,
  attendance, pastoral.

### WB-C-28 — Parent Documents tab (`/parent-portal/documents`)

**Build:**

- Create `apps/web/src/app/[locale]/(school)/behaviour/parent-portal/documents/page.tsx`.
- Lists documents generated for the parent's child(ren): incident notices,
  sanction letters, appeal responses, behaviour reports.
- Each row has a download button (PDF) and a view-in-browser button.
- Filter by type + date range.
- Backend: `GET /api/v1/parent/behaviour/documents?student_id=...` — gated
  on the guardian link + any active restrictions.

### WB-007 (student check-in page, tracked in this group)

**Build:**

- Create `apps/web/src/app/[locale]/(school)/dashboard/student/check-in/page.tsx`.
- Daily check-in form: mood (emoji scale), energy (1–5), free-text concern.
- POST `/api/v1/student/check-ins` — endpoint already exists per the spec
  but no UI.
- Show recent check-ins (last 7 days) on the student dashboard.
- Flag high-concern check-ins to the pastoral lead automatically (composite
  score threshold).

### Cross-cutting for Group 5

- Every new parent/student endpoint MUST go through
  `GuardianRestrictionInterceptor` (WB-C-02) once it ships.
- Every new page follows the mobile-first rules in
  `.claude/rules/frontend.md` (375 × 667 baseline).
- i18n: add keys to both `en.json` and `ar.json`; rely on the parity test
  to catch gaps.
- Add at least one Playwright happy-path spec + one RLS leakage test per
  new endpoint.

---

## Priority / ordering recommendation

If you're picking a sprint order, Claude suggests:

1. **Group 2** (backend endpoints) — 3 endpoints, unblocks live settings
   pages that users can already see are broken. Smallest, highest visible
   payoff.
2. **Group 4** (cross-cutting) — most are 1–2-hour fixes. Knocks the
   backlog down fast.
3. **Group 5** (parent/student gaps) — tenant-facing, compliance-relevant
   (guardian restrictions, parent-portal completeness).
4. **Group 3** (security policy) — WB-C-02, -03, -04, -05, -07 are
   concrete work. WB-C-01 and -06 are just documentation.
5. **Group 1** (admin analytics deep-views) — largest, most polish-like.
   Admins use today's `/behaviour/analytics` landing already; these are
   drill-downs, not new capabilities.

This ordering is a suggestion — override per product priorities.
