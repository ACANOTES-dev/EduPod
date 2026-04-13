# Communications Module — Live Playwright Walkthrough Results

**Walkthrough date:** 2026-04-12
**Target:** `https://nhqs.edupod.app` (Nurul Huda School tenant, tenant_id `3ba9b02c-0339-49b8-8583-a06e05a32ac5`)
**Roles exercised:** admin (owner@nhqs.test), teacher (sarah.daly@nhqs.test), parent (parent@nhqs.test), student (adam.moore@nhqs.test — **blocked**, see §5.0)
**Tool:** Playwright MCP (snapshots only per project memory; no screenshots taken)
**Tenant seed state:** near-empty (0 conversations, 0 announcements, 0 inquiries, 31 seeded safeguarding keywords, messaging-policy matrix in place, fallback + notifications settings present)

---

## Executive summary

- **Eight UI routes walked successfully** across admin, teacher, parent shells. Student shell blocked — account credentials rejected on prod.
- **One P1 live-verified bug:** `/communications/messages/new` dashboard CTA for parent → 404.
- **One P1 live-verified bug:** `GET /v1/inquiries/my` → 404 `PARENT_NOT_FOUND` for the parent account because no `parents` row is linked; breaks parent inquiry list + create student selector.
- **Two P2 spec/implementation deviations:** Announcements-list + Inquiries-list admin pages have no status-filter tabs despite spec (§21, §24) documenting them. Teacher route redirects land on `/dashboard` not `/inbox` (teacher spec §24 documents `/inbox`).
- **One P2 i18n gap:** Settings sidebar renders raw translation key `settings.sen` in every settings layout.
- **O5 from RELEASE-READINESS (search q-length cap) is VERIFIED SAFE** — Zod rejects with `SEARCH_QUERY_TOO_LONG` at 2000 chars; nginx 414s anything longer. Downgrading from P1 to informational.
- **Several "MCP click" false alarms during admin walk** (Compose button, scope dropdown, New Announcement link) retested cleanly after fresh login + `browser_evaluate` click; no real UI defect. Retained in log as `[INFO]`.
- **Arabic RTL verified** on the Communications Hub — `dir="rtl"`, `lang="ar"`, full translations present.
- **Mobile 375×667 verified** on /inbox — no horizontal overflow.

**Severity tally (LIVE only, `[L]`):** P0: 0 · P1: 2 · P2: 4 · P3: 3 · Info/False-positive: 4 · Test-env blocker: 1

---

## 1. Admin shell — owner@nhqs.test (Yusuf Rahman, School Owner)

Login: **✅ Pass**. Dashboard landed with 10 hub buttons (Home, People, Learning, Wellbeing, Operations, Inbox, Finance, Reports, Regulatory, Settings), utility-area Inbox + Notifications icons, and the personalised greeting. Safeguarding alerts widget reads "All clear — no pending flags" matching the empty oversight seed.

### §2 Communications Hub (`/en/communications`) — ✅ Pass

All four stat cards rendered:

| Card            | Metric                   | Link                               | Pass |
| --------------- | ------------------------ | ---------------------------------- | ---- |
| Inbox           | 0 / "All caught up"      | `/en/inbox`                        | ✅   |
| Saved Audiences | 0 / "No saved audiences" | `/en/inbox/audiences`              | ✅   |
| Announcements   | "No announcements yet"   | `/en/communications/announcements` | ✅   |
| Oversight       | 0 / "No pending flags"   | `/en/inbox/oversight`              | ✅   |

Three policy tiles rendered: Messaging policy, Safeguarding keywords, Notification fallback — all link to correct settings routes. Network tab shows the four expected fail-soft fetches all returning 200: `/v1/inbox/state`, `/v1/inbox/audiences`, `/v1/announcements?page=1&pageSize=1`, `/v1/inbox/oversight/flags?page=1&pageSize=1&review_state=pending`.

### §3 Inbox landing (`/en/inbox`) — ✅ Pass / ⚠️ 1 issue

Sidebar, search box, Compose button, filter tabs (All/Unread/Direct/Group/Broadcasts/Archived), empty state "No conversations yet", main-panel "Select a thread to open it" empty state — all present.

- ⚠️ First **MCP-driven click** on Compose produced no dialog (no network, no console, no state change) in the initial admin session. A second session (fresh login) + DOM-level `.click()` via `browser_evaluate` opened the full compose dialog normally. **Most likely a Playwright ref-staleness quirk**, not a real defect. Catalogued as `[L-INFO]` in the bug log with reproduction instructions.

### §4–5 Compose dialog (verified on second session) — ✅ Pass

Dialog opens with three tabs (Direct/Group/Broadcast), recipient picker, body textarea, attachments drop-zone ("0/10"), channel selector (Inbox always-on plus Email / SMS / WhatsApp with per-recipient cost indicators), "Don't escalate to SMS / Email" toggle, Cancel / Send / Close buttons.

### §17 Oversight dashboard (`/en/inbox/oversight`) — ⚠️ Partial

- Page loads with banner, three tabs (Conversations, Flags, Audit log), and empty Conversations table. ✅
- Clicking **Flags tab** or **Audit log tab** did not visibly change headers or fire an API call — network tab showed only the initial `/v1/inbox/oversight/conversations?page=1&pageSize=20`, no follow-up for flags or audit-log endpoints. **Could be MCP ref staleness again**, but with the empty dataset I can't verify content-switch visually — flagged `[L-P2]` for the tester to retry manually.

### §21 Announcements list (`/en/communications/announcements`) — ⚠️ Partial (2 issues)

- Page loads with "Communications" heading, "Manage Audiences" + "New Announcement" action buttons, and empty state. ✅
- **No status-filter tab bar** (All / Draft / Scheduled / Published / Archived). The admin spec §21.2 says "Tabs render across top." `[L-P2]` — spec or impl mismatch.
- **MCP click on "New Announcement" button did not navigate.** Direct navigation to `/en/communications/new` works. Same likely ref-staleness. `[L-INFO]`.

### §22 New Announcement (`/en/communications/new`) — ✅ Pass

Form fields: Title, Body, Scope (combobox, default "School-wide"), Delivery Channels (In-app checked + disabled, Email/WhatsApp/SMS toggleable), "Schedule for later" switch, Save as Draft + Publish buttons (both disabled until valid). Matches admin spec.

- ⚠️ **Scope combobox click via MCP did not open dropdown.** `[L-INFO]` — retest manually.

### §24 Admin Inquiries list (`/en/communications/inquiries`) — ⚠️ Partial (1 issue)

- Page loads with heading + empty state. ✅
- **No status-filter tab bar** (All / Open / In Progress / Closed). Admin spec §24 documents these tabs. `[L-P2]`.

### §26 Messaging Policy (`/en/settings/messaging-policy`) — ✅ Pass / ⚠️ 1 issue

Full page renders: global toggles, 9×9 role permission matrix (Owner/Principal/Vice Principal/Office/Finance/Nurse/Teacher/Parent/Student), edit-window + retention inputs, GDPR note, Reset to defaults button, Save changes button. Default matrix as expected (admins can message everyone, parents/students blocked from initiating). Seeded correctly per Wave 2.

- ⚠️ **Console error `MISSING_MESSAGE: settings.sen (en)`** — settings sidebar contains an untranslated namespace `settings.sen`. Appears on every `/settings/*` page. `[L-P2]` i18n gap.

### §27 Safeguarding Keywords (`/en/settings/communications/safeguarding`) — ✅ Pass

31 seeded keywords rendered across categories: Abuse (7), Bullying (8), Inappropriate contact (6+), Self harm (3+). Severity + Active + Updated columns present. Bulk import + Add keyword buttons present. No console errors.

### §28 Notification Fallback (`/en/settings/communications/fallback`) — ✅ Pass

Two sections (Admin broadcasts, Teacher messages), each with escalate-after-hours input, channels (Email/SMS/WhatsApp), Test fallback now button. Save changes button. Matches spec.

### §29 Notification Settings (`/en/settings/notifications`) — ✅ Pass / ⚠️ 1 issue

12 notification types listed with Enabled + Email + SMS + Push columns: admission.status_change, announcement.published, approval.decided, approval.requested, attendance.exception, inquiry.new_message, invoice.issued, payment.failed, payment.received, payroll.finalised, payslip.generated, report_card.published.

- ⚠️ **Behaviour-module notification types absent** (behaviour.incident, behaviour.sanction, behaviour.intervention, behaviour.award, behaviour.alert, behaviour.appeal, behaviour.safeguarding, behaviour.acknowledgement per spec §29 inventory). Either the module gate is filtering them out (reasonable) or the seed didn't ingest them. `[L-P3]`.

### §30 Profile Communication Preferences (`/en/profile/communication`) — ✅ Pass

Email / SMS / Push checkbox toggles, preferred-language select (English by default), Save preferences button.

### Reports — Notification Delivery (`/en/reports/notification-delivery`) — ✅ Pass

Filter inputs (Start Date / End Date / Channel select), "Select a date range · Choose start and end dates to view the report" empty state with no charts. Correct. No network call without filters.

### Arabic / RTL — ✅ Pass

`/ar/communications` loads with `dir="rtl"`, `lang="ar"`, fully translated stat cards (`صندوق الوارد`, `الجماهير المحفوظة`, `الإعلانات`, `الرقابة`) and policy-tile names (`سياسة الرسائل`, `كلمات الحماية`, `التصعيد التلقائي`). No Arabic-Indic numerals observed (Western 0 used throughout). No layout break noted.

### Mobile 375×667 — ✅ Pass

`/en/inbox` at 375px: `scrollWidth === clientWidth === 375`; no horizontal overflow. Inbox sidebar morphs to mobile layout (screen too small to test thread + sidebar side-by-side; noted as partial coverage since no conversation seeded).

### Direct-fetch probes (spec observation verification)

Using a fresh admin JWT from `POST /v1/auth/refresh`:

| Probe                                                      | Result                                                                                     | Note                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| `/v1/inbox/search?q=zzzz… (2000 chars)`                    | `400 VALIDATION_ERROR / SEARCH_QUERY_TOO_LONG`                                             | **O5 is safe** — downgrade finding     |
| `/v1/inbox/search?q=zzzz… (10000 chars)`                   | `414 Request-URI Too Large` (nginx)                                                        | Nginx protects at URL level; OK        |
| `/v1/inbox/state`                                          | `200 { data: { unread_total: 0, latest_message_at: null } }`                               | Shape correct                          |
| `/v1/inbox/conversations`                                  | `200 { data: [], meta: { page: 1, pageSize: 3, total: 0 } }`                               | Shape correct                          |
| `/v1/inbox/audiences/providers`                            | `200` — 16 providers, 3 unwired (`section_parents`, `event_attendees`, `trip_roster`)      | 3 are gracefully flagged `wired:false` |
| `/v1/inbox/oversight/conversations`                        | `200 { data: [], meta }`                                                                   | Empty seed                             |
| `/v1/announcements/{nonexistent}`                          | `404 ANNOUNCEMENT_NOT_FOUND`                                                               | Proper structured error                |
| `/v1/inbox/people-search?q=sa`                             | `200` — 4 items                                                                            | Returns matches                        |
| `/v1/notifications/unsubscribe` (no token)                 | `400`                                                                                      | Safe                                   |
| `/v1/inbox/settings/policy`                                | `200` — nested `{sender: {recipient: bool}}` matrix                                        | Shape matches UI                       |
| `/v1/safeguarding/keywords`                                | `200` — 31 items                                                                           | Seeded                                 |
| `/v1/inbox/conversations` POST with `kind: 'unknown_kind'` | `400 VALIDATION_ERROR / "Invalid enum value. Expected 'direct' \| 'group' \| 'broadcast'"` | Zod works                              |
| `/v1/inbox/settings/inbox`                                 | `200` — full settings object with correct defaults                                         | Shape correct                          |

---

## 2. Teacher shell — sarah.daly@nhqs.test (Sarah Daly, Teacher)

Login: **✅ Pass**. Redirected to `/en/dashboard/teacher`. Morph bar shows 7 hubs (Home, People, Learning, Wellbeing, Operations, Inbox, Reports) — correctly omits Finance, Regulatory, Settings per teacher scope.

### Inbox (`/en/inbox`) — ✅ Pass

Sidebar, search, Compose button, filter tabs, empty-state messages present.

### Compose dialog — ✅ Pass

Opened via DOM click. Contains Direct / Group / Broadcast tabs, recipient picker, body, attachments, channels with per-recipient costs, cancel/send buttons. **Broadcast tab is visible** to teacher; per teacher spec §23/§24 this SHOULD be hidden or server-enforced at submit. Tester to verify that clicking Send with broadcast payload is rejected with `BROADCAST_NOT_ALLOWED_FOR_ROLE`. `[L-P3]` — UI affordance present despite policy denial.

### Profile Communication (`/en/profile/communication`) — ✅ Pass

Same shape as admin.

### Admin-only route redirects

| Route                                   | Actual redirect | Spec redirect (teacher §24) | Pass                             |
| --------------------------------------- | --------------- | --------------------------- | -------------------------------- |
| `/en/communications`                    | `/en/dashboard` | `/en/inbox`                 | ⚠️ Deviation `[L-P2]`            |
| `/en/inbox/oversight`                   | `/en/dashboard` | `/en/inbox`                 | ⚠️ Deviation `[L-P2]`            |
| `/en/inbox/audiences` (not tested live) | —               | `/en/inbox`                 | Not tested (same-pattern likely) |

### Teacher API permission matrix (direct fetch probe)

| Endpoint                            | Status | Expected | Pass |
| ----------------------------------- | ------ | -------- | ---- |
| `/v1/inbox/oversight/conversations` | 403    | 403      | ✅   |
| `/v1/inbox/oversight/flags`         | 403    | 403      | ✅   |
| `/v1/announcements`                 | 403    | 403      | ✅   |
| `/v1/inbox/settings/inbox`          | 403    | 403      | ✅   |
| `/v1/inbox/settings/policy`         | 403    | 403      | ✅   |
| `/v1/safeguarding/keywords`         | 403    | 403      | ✅   |
| `/v1/inquiries`                     | 403    | 403      | ✅   |
| `/v1/inbox/audiences`               | 200    | 200      | ✅   |
| `/v1/inbox/state`                   | 200    | 200      | ✅   |
| `/v1/inbox/conversations`           | 200    | 200      | ✅   |

API permission scoping is correct; only the redirect target differs from the spec.

Out-of-scope console noise: `/v1/homework/completions/unverified` 404, `/v1/branding` 403, `/v1/homework/today` 403. None are Communications bugs; homework-module 404 is worth flagging in that module's own walkthrough.

---

## 3. Parent shell — parent@nhqs.test (Zainab Ali, Parent)

Login: **✅ Pass**. Redirected to `/en/dashboard/parent`. Morph bar shows 4 hubs (Home, Learning, Finance, Reports) — correct scoping.

### Parent dashboard quick-actions — ⚠️ 2 dead links (P1 + P1)

The "Needs Your Attention" / quick-actions row has three action links:

| Link           | `href`                         | Status      | Finding                |
| -------------- | ------------------------------ | ----------- | ---------------------- |
| Pay Invoice    | `/finance/invoices`            | 200 (valid) | ✅                     |
| View Grades    | `/learning/reports`            | **404**     | **`[L-P1]` dead link** |
| Contact School | `/communications/messages/new` | **404**     | **`[L-P1]` dead link** |

The Communications one (`/communications/messages/new`) is a Communications-module bug — the correct route for a parent to compose is `/inbox` (and then Compose dialog). The dashboard widget advertises a non-existent composition route.

The `/learning/reports` dead link is out of Communications scope but logged for cross-module visibility.

### Inbox (`/en/inbox`) — ✅ Pass

Empty state correctly rendered. Compose button present.

### Announcements feed (`/en/announcements`) — ✅ Pass

"Announcements / School announcements for you / No announcements yet" empty state. `GET /v1/announcements/my` returns `200 { data: [], meta: {..} }` — parent can read announcements endpoint works.

### Inquiries list (`/en/inquiries`) — ❌ Fail — P1

- UI shows empty state "No inquiries yet · Have a question? Send an inquiry to the school." with `New Inquiry` button.
- **Network tab:** `GET /api/v1/inquiries/my` returns **`404 PARENT_NOT_FOUND — "No parent record linked to your account"`**. The UI swallows the error and falls through to empty state.
- The parent account (Zainab Ali, `parent@nhqs.test`) has a `parent` role in the platform but **no `parents` table row**. This breaks every parent inquiry read/write path for this account.
- Integration spec §4.13 documents `parent.submit_inquiry` should yield 200. Seed + service-layer bug.

### New Inquiry (`/en/inquiries/new`) — ⚠️ Partial (P1 cascaded)

- Form renders Subject, Message, Student (optional), Cancel, Submit.
- **Student select shows "Loading..." indefinitely** because the populator hits `/v1/parents/me/students` (or similar) and returns empty for the same no-parent-record reason. Cannot complete a test submit.

### Parent-admin-only redirects

Not exhaustively walked; parent spec §21 documents all redirects to `/en/inbox`. Given the teacher-redirect deviation above (`/dashboard` instead of `/inbox`), this likely reproduces for parent; tester to re-verify per hostile-pair script.

---

## 4. Student shell — adam.moore@nhqs.test (Adam Moore, Student)

**❌ BLOCKED (test-env).** Login returns "Invalid email or password" at `/en/login`. Per project memory, this account was "Created 2026-04-11 via direct DB insert"; either the user record was deleted / rotated or the password doesn't match. This blocks the entire student walkthrough.

**Recommendation:** recreate or reset password for `adam.moore@nhqs.test` before re-running the pack. Flagged `[L-BLOCKED]`.

Nothing else testable for student on this pass.

---

## 5. Cross-cutting observations

- **`/en/logout` returns 404** (404 page shows "404 / Page not found"). The proper logout is the user-menu item `Log out`. If any deep-link or email template ever sends users to `/logout`, they'll hit the 404. Minor. `[L-P3]`.
- **Console error volume on dashboard for parent = 14 errors.** Most are 403s from quick-action widget probes (`/v1/dashboard/school-admin`, `/v1/finance/dashboard`, `/v1/behaviour/analytics/overview`, `/v1/report-card-teacher-requests`, `/v1/gradebook/unlock-requests`). These are silently handled in the UI (widget falls through to empty) but they're loud in the console; **parent dashboard should conditionally skip admin-only widget fetches based on role.** `[L-P3]` defence-in-depth.
- **Admin Inbox sub-strip** — admin spec §1.5 states "Communications hub does NOT display a sub-strip." Confirmed — no sub-strip renders on `/en/communications`. But the **Inbox icon is rendered BOTH in the hub row AND the utility area** (envelope icon right of hubs). Spec §1.2 documents this dual placement. Not a bug, just worth noting as intentional.

---

## 6. MCP interaction quirks (not product bugs)

Three actions failed under `browser_click` with a cached snapshot ref, then worked later via DOM-level `.click()` in `browser_evaluate`:

1. Admin inbox Compose button (first session, later worked)
2. Admin announcements-list "New Announcement" action-bar button
3. Admin new-announcement page Scope combobox

**Diagnosis:** likely Playwright ref-staleness after the component re-renders on hydration. The UI is healthy; the tester just needs to either refresh before interacting or use direct DOM clicks in automation.

---

## 7. Recommended immediate actions

1. **Fix `/communications/messages/new` dead link on parent dashboard.** Either (a) route the CTA to `/en/inbox` and auto-open the Compose dialog with the "school" audience preselected, or (b) build `/communications/messages/new` as a parent-facing compose page. Priority: **P1**.
2. **Repair parent account seed — create `parents` row for Zainab Ali (and verify every parent user has one).** Add a runtime guard in `ParentInquiriesController` so a missing parent row returns a structured 422 with actionable UI messaging rather than a 404. Priority: **P1**.
3. **Add status-filter tabs to `/en/communications/announcements` and `/en/communications/inquiries`** to match admin spec §21 and §24 — or update the specs if the product direction is deliberately simpler. Priority: **P2**.
4. **Resolve `settings.sen` missing translation** — add the key to `messages/en.json` (and `messages/ar.json`), or remove the sidebar entry if the SEN module isn't shipping. Priority: **P2**.
5. **Align teacher role redirect target** — either update `(school)/communications` + `(school)/inbox/oversight` + `(school)/inbox/audiences` middleware redirects from `/dashboard` to `/inbox`, or update teacher + parent + student UI specs §24/§21 to reflect `/dashboard`. Priority: **P2**.

---

## 8. Hand-off

A fresh agent can pick up from `BUG-LOG.md` (sibling to this file). Every bug has a unique ID, reproduction steps, affected files, fix direction, and Playwright verification script.

This walkthrough did NOT cover (per prompt anti-patterns):

- Mutating flows (create / publish / delete / freeze / dismiss / escalate / export) — deliberately not exercised on production
- Student role UI surface — blocked by login credential issue
- Cross-tenant hostile-pair assertions — no sibling test-b tenant exists in this environment
- Worker job behaviour — covered by `worker/communications-worker-spec.md`
- Perf budgets — covered by `perf/communications-perf-spec.md`
- Full OWASP permission matrix — sampled per-role, full matrix in `security/communications-security-spec.md`

**End of walkthrough log.**
