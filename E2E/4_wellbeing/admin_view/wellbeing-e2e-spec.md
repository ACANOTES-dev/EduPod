# Wellbeing — E2E Test Specification (Admin / Owner / Principal / Vice-Principal / School Admin)

> **Generated:** 2026-04-21
> **Module slug:** `wellbeing`
> **Perspective:** Admin tier — `school_owner`, `school_principal`, `school_vice_principal`, `school_admin`. All admin-tier users assumed to have **full access to every wellbeing surface** per the user's directive (the current role-permission grants are not fully wired; the tester treats admin as omnipotent inside the wellbeing umbrella, except where dual-control still gates an action — e.g. safeguarding seal approval requires a second admin).
> **Pages covered:** 79 pages across six sub-hubs — wellbeing super-hub (8), behaviour (30), pastoral (24), safeguarding (10), early warnings (4), staff wellbeing (1 folded) — plus 10 settings + 2 platform-admin pages.
> **Base URL:** `https://nhqs.edupod.app`
> **Test fixture tenant:** Nurul Huda School (NHQS), slug `nhqs`
> **Companion specs:** `teacher_view/`, `parent_view/`, `student_view/`, `integration/`, `worker/`, `perf/`, `security/` — see `RELEASE-READINESS.md` for the full pack.

---

## How to use this spec

Every row is one observable check. Mark **Pass / Fail / Blocked** in the rightmost column. A `Fail` on any row where severity is unspecified is a release blocker. Rows explicitly labelled `(info)` are diagnostic and do not block release.

Run this spec top-to-bottom in a fresh browser session per locale (once in `/en/*`, once in `/ar/*`). The tester should keep DevTools open with the **Network** and **Console** tabs visible — both are asserted on.

**Admin role rotation.** Several flows (safeguarding seal, exclusion finalisation, publication approval) are **dual-control** — they need a second admin to approve. The tester should have **two admin logins** available (`owner@nhqs.test` and `principal@nhqs.test`) and rotate between them where the spec calls for it.

---

## Table of contents

1. [Prerequisites & multi-tenant fixture](#1-prerequisites--multi-tenant-fixture)
2. [Out of scope for this spec](#2-out-of-scope-for-this-spec)
3. [Morph bar — Wellbeing pill & navigation](#3-morph-bar--wellbeing-pill--navigation)
4. [Wellbeing super-hub `/wellbeing`](#4-wellbeing-super-hub-wellbeing)
5. [Behaviour sub-hub `/behaviour`](#5-behaviour-sub-hub-behaviour)
6. [Behaviour — incidents (list, new, detail, status, attachments, history)](#6-behaviour--incidents)
7. [Behaviour — sanctions (list, today, calendar, serve, parent meeting)](#7-behaviour--sanctions)
8. [Behaviour — exclusions (case lifecycle, board pack, decision)](#8-behaviour--exclusions)
9. [Behaviour — appeals (submit, hearing, decision, evidence bundle)](#9-behaviour--appeals)
10. [Behaviour — recognition (wall, leaderboard, houses, awards, publication approval)](#10-behaviour--recognition)
11. [Behaviour — documents (templates, generate, preview, finalise, send)](#11-behaviour--documents)
12. [Behaviour — tasks, alerts, amendments](#12-behaviour--tasks-alerts-amendments)
13. [Behaviour — guardian restrictions](#13-behaviour--guardian-restrictions)
14. [Behaviour — interventions](#14-behaviour--interventions)
15. [Behaviour — analytics + AI analytics (flag-gated)](#15-behaviour--analytics--ai-analytics-flag-gated)
16. [Behaviour — policies replay (dry-run)](#16-behaviour--policies-replay-dry-run)
17. [Behaviour — admin console + legal holds](#17-behaviour--admin-console--legal-holds)
18. [Behaviour — student profile page](#18-behaviour--student-profile-page)
19. [Pastoral sub-hub `/pastoral`](#19-pastoral-sub-hub-pastoral)
20. [Pastoral — concerns (log, escalate, share, amend narrative)](#20-pastoral--concerns)
21. [Pastoral — cases (open, link, transfer, status transitions)](#21-pastoral--cases)
22. [Pastoral — interventions + reviews](#22-pastoral--interventions--reviews)
23. [Pastoral — referrals (NEPS lifecycle)](#23-pastoral--referrals-neps-lifecycle)
24. [Pastoral — critical incidents + response plan](#24-pastoral--critical-incidents--response-plan)
25. [Pastoral — SST (roster, meetings, agenda, actions)](#25-pastoral--sst)
26. [Pastoral — check-ins (config, flagged, escalate, dismiss)](#26-pastoral--check-ins)
27. [Pastoral — DSAR review](#27-pastoral--dsar-review)
28. [Pastoral — historical import (CSV)](#28-pastoral--historical-import-csv)
29. [Safeguarding sub-hub `/safeguarding`](#29-safeguarding-sub-hub-safeguarding)
30. [Safeguarding — concerns (report, manage, status, TUSLA/Garda)](#30-safeguarding--concerns)
31. [Safeguarding — seal workflow (initiate, approve, reject, dual-control)](#31-safeguarding--seal-workflow)
32. [Safeguarding — break-glass (grant, access-log, review)](#32-safeguarding--break-glass)
33. [Safeguarding — SLA dashboard + sealed archive + reviews](#33-safeguarding--sla--sealed--reviews)
34. [Early warnings sub-hub `/early-warnings`](#34-early-warnings-sub-hub-early-warnings)
35. [Early warnings — cohort analysis + intervene + settings](#35-early-warnings--cohort--intervene--settings)
36. [Staff wellbeing folded sub-hub `/wellbeing/staff`](#36-staff-wellbeing-folded-sub-hub-wellbeingstaff)
37. [Staff wellbeing — surveys (admin create/activate/close/results/moderate)](#37-staff-wellbeing--surveys)
38. [Staff wellbeing — aggregate + board report + resources](#38-staff-wellbeing--aggregate--board-report--resources)
39. [Settings — behaviour (categories/policies/houses/awards/documents/admin/general)](#39-settings--behaviour)
40. [Settings — safeguarding + communications/safeguarding keywords](#40-settings--safeguarding--keywords)
41. [Settings — AI flags](#41-settings--ai-flags)
42. [Settings — wellbeing notification channels](#42-settings--wellbeing-notification-channels)
43. [Platform admin — security incidents](#43-platform-admin--security-incidents)
44. [Arabic / RTL walkthrough](#44-arabic--rtl-walkthrough)
45. [Mobile walkthrough (375×812)](#45-mobile-walkthrough-375812)
46. [Cross-tenant hostile checks (UI-visible)](#46-cross-tenant-hostile-checks-ui-visible)
47. [Backend endpoint map](#47-backend-endpoint-map)
48. [DevTools console & network health](#48-devtools-console--network-health)
49. [Data invariants — post-conditions per flow](#49-data-invariants--post-conditions-per-flow)
50. [Observations spotted during the walkthrough](#50-observations-spotted-during-the-walkthrough)
51. [Sign-off](#51-sign-off)

---

## 1. Prerequisites & multi-tenant fixture

Two tenants are required for cross-tenant assertions (§46). Admin seed must cover every sub-module so counters, lists, and status filters aren't empty.

| #    | What to Check                                                                                                                                                                                                                                                                                                                                                                                                                                         | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | **Tenant A — NHQS** exists with slug `nhqs`, currency `EUR`, all wellbeing modules (`behaviour`, `pastoral`, `safeguarding`, `early_warning`, `staff_wellbeing`) enabled in `tenant_modules`.                                                                                                                                                                                                                                                         | `SELECT module_key FROM tenant_modules WHERE tenant_id=<A> AND is_active=true` includes all five keys.                                                                                                                                                                                                                                                                                                                                                                                                                                       |           |
| 1.2  | **Tenant B — Acme Test School** exists with slug `acme-test`, currency `USD`, same modules enabled. Disjoint user set from Tenant A.                                                                                                                                                                                                                                                                                                                  | `SELECT COUNT(*) FROM tenants WHERE slug IN ('nhqs','acme-test')` = 2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |           |
| 1.3  | **Admin users seeded in Tenant A:** `owner@nhqs.test` (role `school_owner`), `principal@nhqs.test` (role `school_principal`), `vp@nhqs.test` (role `school_vice_principal`), `admin@nhqs.test` (role `school_admin`). Password `Password123!` for all.                                                                                                                                                                                                | 4 admin users visible in `users` joined via `tenant_memberships` to Tenant A.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |           |
| 1.4  | **Logical permission model** — each admin is granted **every** wellbeing permission listed in the companion permission reference (44 keys across behaviour, pastoral, safeguarding, early_warning, wellbeing, ai_flag, wellbeing_notifications).                                                                                                                                                                                                      | `SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.role_key IN ('school_owner','school_principal','school_vice_principal','school_admin') AND rp.permission_key LIKE ANY(ARRAY['behaviour.%','pastoral.%','safeguarding.%','early_warning.%','wellbeing.%','ai_flag.%','wellbeing_notifications.%'])` ≥ 150 (4 roles × ~44 keys, minus duplicates). **If this is <150, run the permission-backfill migration first** — admin walkthrough is otherwise expected to surface 403s that are not real regressions. |           |
| 1.5  | **Seed data for exercisable states:** ≥ 25 behaviour incidents (mix polarity, mix status), ≥ 8 sanctions scheduled today, ≥ 3 exclusion cases in different states, ≥ 2 open appeals, ≥ 5 pastoral concerns across tiers 1/2/3, ≥ 2 pastoral cases, ≥ 1 SST meeting upcoming, ≥ 3 safeguarding concerns including ≥ 1 SLA-breach, ≥ 1 critical incident declared, ≥ 10 students flagged amber/red in early-warning, ≥ 1 active staff-wellbeing survey. | `SELECT COUNT(*) FROM behaviour_incidents WHERE tenant_id=<A>` ≥ 25; `SELECT COUNT(*) FROM safeguarding_concerns WHERE tenant_id=<A>` ≥ 3; etc.                                                                                                                                                                                                                                                                                                                                                                                              |           |
| 1.6  | **Default behaviour categories seeded** on tenant create — 28 categories balanced positive/negative, mapped to severity tiers.                                                                                                                                                                                                                                                                                                                        | `SELECT COUNT(*) FROM behaviour_categories WHERE tenant_id=<A> AND is_system=true` = 28 (or ≥ 12 per PLAN §2; accept either provided the list covers positive + negative across 3 severities).                                                                                                                                                                                                                                                                                                                                               |           |
| 1.7  | **AI flags table** exists with at least one flag row per module for Tenant A; `enabled=false` by default on all.                                                                                                                                                                                                                                                                                                                                      | `SELECT module_key, enabled FROM tenant_ai_flags WHERE tenant_id=<A>` returns rows for `behaviour`, `pastoral`, `staff_wellbeing`, `early_warning`, all `enabled=false`.                                                                                                                                                                                                                                                                                                                                                                     |           |
| 1.8  | **Notification preferences** — `tenant_notification_preferences` has one row for Tenant A with `wellbeing_channels` JSONB defaults (`email:false, sms:false, whatsapp:false`).                                                                                                                                                                                                                                                                        | 1 row. JSONB shape matches.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |           |
| 1.9  | **RLS enabled** on every wellbeing table — 54 tenant-scoped tables from the integration-spec inventory all have `relrowsecurity=true` and `relforcerowsecurity=true`.                                                                                                                                                                                                                                                                                 | `SELECT COUNT(*) FROM pg_class WHERE relname = ANY($1) AND relrowsecurity=true AND relforcerowsecurity=true` = 54.                                                                                                                                                                                                                                                                                                                                                                                                                           |           |
| 1.10 | **Hostile pair:** capture a known safeguarding-concern UUID, a behaviour-incident UUID, and a pastoral-case UUID from Tenant B for the cross-tenant attempts in §46.                                                                                                                                                                                                                                                                                  | Three UUIDs saved alongside spec answers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |           |
| 1.11 | **Browser:** Chromium-based (Chrome/Edge), viewport 1440×900 for desktop; repeat §45 at 375×812 (iPhone SE emulation) for mobile.                                                                                                                                                                                                                                                                                                                     | Spec passes in both viewports.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |           |
| 1.12 | **Locales:** run twice — `/en/*` then `/ar/*`. RTL assertions in §44.                                                                                                                                                                                                                                                                                                                                                                                 | Both runs complete without console errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |           |

### 1.13 Login primer

| #      | Action                                                                                                                     | Expected                                                                           | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 1.13.1 | Navigate to `https://nhqs.edupod.app/en/login`. Sign in as `owner@nhqs.test` / `Password123!`.                             | Redirects to `/en/dashboard`. Morph bar visible with Wellbeing pill.               |           |
| 1.13.2 | Open a second browser profile / incognito, sign in as `principal@nhqs.test`.                                               | Same shell. Both sessions stay live through the spec.                              |           |
| 1.13.3 | `console.info(auth.user)` returns a user object with `tenant_id`=A and the listed role. Auth token visible only in memory. | JWT is in memory (`auth-context` value); NOT in `localStorage` / `sessionStorage`. |           |

---

## 2. Out of scope for this spec

This spec exercises the UI-visible surface of the **wellbeing umbrella** as an admin-tier user clicking through the school shell. It does **NOT** cover:

- **RLS leakage and cross-tenant isolation** → `../integration/wellbeing-integration-spec.md` (matrix over all 54 tenant-scoped tables + cross-module chains).
- **API contract edges** → `../integration/wellbeing-integration-spec.md` (every Zod boundary, every state-machine invalid transition, every permission-denial variant per endpoint).
- **Webhook signature + idempotency** → N/A: the wellbeing umbrella owns no inbound webhooks (outbound notification-provider integrations are stubbed per PLAN §3d).
- **Concurrency / race conditions** → `../integration/wellbeing-integration-spec.md` (parallel incident logging, parallel seal approvals, SST agenda pre-compute dedup).
- **BullMQ jobs, cron, dead-letter** → `../worker/wellbeing-worker-spec.md` (5 queues, 18 processors, 10 crons, chain flows).
- **Load / throughput / latency budgets** → `../perf/wellbeing-perf-spec.md`.
- **Security hardening** → `../security/wellbeing-security-spec.md` (OWASP 10/10, permission matrix across ~250 endpoints × 8 roles, injection fuzz, encrypted-field round-trip).
- **Teacher / parent / student perspectives** → `../teacher_view/`, `../parent_view/`, `../student_view/`.
- **PDF byte-level correctness** — this spec checks `Content-Type: application/pdf`, `Content-Disposition: attachment`, download completes, file opens. The integration spec parses bytes via `pdf-parse`.
- **Browser / device matrix beyond desktop Chrome + 375px iPhone SE emulation** — defer Firefox, Safari, iPad, real-device testing to a manual QA cycle.
- **Accessibility audits** — structural checks only here (`alt`, keyboard focus, aria-labels). Run `axe-core` / Lighthouse separately.
- **Visual regression** — no pixel diffs; run Percy / Chromatic separately.

---

## 3. Morph bar — Wellbeing pill & navigation

The wellbeing umbrella **does not use a sub-strip**. The Wellbeing pill drops the user onto `/wellbeing` (the super-hub) and from there navigation is via hub tiles. See PLAN §2a.

| #   | What to Check                                                                                                                                                           | Expected                                                                                                                                                                            | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Load `/en/dashboard` and inspect the morph bar.                                                                                                                         | Bar renders collapsed. Wellbeing pill is present. Icon is `Heart` / `Shield` (per redesign), label reads "Wellbeing".                                                               |           |
| 3.2 | Click **Wellbeing**.                                                                                                                                                    | URL changes to `/en/wellbeing`. The morph bar itself **does not remount** (no flash). **No sub-strip appears under the morph bar** — the super-hub is the whole navigation surface. |           |
| 3.3 | Scroll the page — the morph bar stays sticky.                                                                                                                           | Morph bar pinned to top. No layout jank.                                                                                                                                            |           |
| 3.4 | Navigate `/en/wellbeing` → click the **Behaviour** hub tile → `/en/behaviour`.                                                                                          | URL changes. Morph bar stays stable. Behaviour sub-hub renders (see §5).                                                                                                            |           |
| 3.5 | From `/behaviour`, click the browser **back** button.                                                                                                                   | URL returns to `/en/wellbeing`. Super-hub re-renders (not remount-flash).                                                                                                           |           |
| 3.6 | Press `/` (slash) to focus the command palette (if configured).                                                                                                         | Command palette opens (or, if not yet shipped, typing `g w` navigates to `/wellbeing`). **Info**: if neither opens, flag as observation, do not fail.                               |           |
| 3.7 | Tab through the morph bar with keyboard.                                                                                                                                | Focus ring visible on each pill. `Enter` activates.                                                                                                                                 |           |
| 3.8 | Check that no dead sub-strip is being rendered beneath the bar when on any `/behaviour/*`, `/pastoral/*`, `/safeguarding/*`, `/early-warnings/*`, `/wellbeing/*` route. | There is no horizontal sub-strip of child links. (The previous design's sub-strip was removed in Wave 5 Impl 13.) Flag any sighting as a regression.                                |           |

---

## 4. Wellbeing super-hub `/wellbeing`

**URL:** `/{locale}/wellbeing`
**Permission:** `wellbeing.view_dashboard` (logical: admin always)
**Primary API:** `GET /api/v1/wellbeing/dashboard-summary`

### 4.1 Page chrome

| #     | What to Check                                                                                  | Expected                                                                                             | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Page header reads **"Wellbeing & Safeguarding"** with a descriptive subtitle.                  | Translation keys `wellbeingHub.title`, `wellbeingHub.description` resolve; `document.title` updates. |           |
| 4.1.2 | The page makes exactly **one** API call on mount — `GET /api/v1/wellbeing/dashboard-summary`.  | One call, returns 200 within 500ms. No other KPI fetch (all counters come from this single payload). |           |
| 4.1.3 | Skeleton shimmers while loading (CardSkeleton for hub tiles, KPI placeholders).                | Skeletons render until `data` resolves, then swap.                                                   |           |
| 4.1.4 | On 500 / network error, an in-page error banner appears with a **Retry** button (not a toast). | Banner includes `t('wellbeingHub.loadError')`. Clicking retry re-fires the call.                     |           |

### 4.2 Pending-attention banner

| #     | What to Check                                                                                                                                                    | Expected                                                                                                       | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | If seed contains ≥ 1 SLA breach, overdue intervention, unacknowledged critical, pending appeal, or awaiting parent meeting, the banner renders.                  | Banner shows under the page header, snap-scrollable card row, up to 5 items. Sticky on mobile is NOT required. |           |
| 4.2.2 | Each card has: severity-coloured start-border (`border-s-4`), kind icon, title, detail, optional `due_at` pill ("Due 2h ago" / "Due in 3d"), deep-link on click. | All five shapes covered by the seed.                                                                           |           |
| 4.2.3 | Clicking a card navigates to the deep link (`/behaviour/tasks`, `/safeguarding/concerns/:id`, `/pastoral/critical-incidents/:id`, etc.).                         | Correct route. Query string preserved if any.                                                                  |           |
| 4.2.4 | If no pending items, the banner section is absent (not an empty block).                                                                                          | No rendered section.                                                                                           |           |
| 4.2.5 | "View more" link → `/behaviour/tasks`.                                                                                                                           | Navigates to tasks list.                                                                                       |           |

### 4.3 KPI strip (four tiles)

| #     | What to Check                                                                                                                                                                                       | Expected                                                                                                                                                         | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | **Students at Risk** — numeric value + subtitle "{amber} amber · {red} red". Amber count ≥ 1, red count ≥ 0 per seed. Accent colour `text-amber-700`. Clicking tile navigates to `/early-warnings`. | Value matches `SELECT COUNT(DISTINCT student_id) FROM student_risk_profiles WHERE tenant_id=<A> AND current_tier IN (2,3)`.                                      |           |
| 4.3.2 | **Open Incidents** — numeric total, subtitle "{positive} positive · {negative} negative". Click navigates to `/behaviour`.                                                                          | Matches `SELECT COUNT(*) FROM behaviour_incidents WHERE tenant_id=<A> AND status NOT IN ('resolved','archived')` with positive/negative breakdown by `polarity`. |           |
| 4.3.3 | **Open Cases** — numeric, no subtitle. Click navigates to `/pastoral`.                                                                                                                              | `SELECT COUNT(*) FROM pastoral_cases WHERE tenant_id=<A> AND status IN ('open','active','review_due')`.                                                          |           |
| 4.3.4 | **Overdue Actions** — numeric, subtitle "{sanctions} sanctions · {tasks} tasks · {sla_breaches} SLA breaches" (only when total > 0). Click navigates to `/behaviour/tasks`.                         | Sum of overdue sanctions + overdue behaviour tasks + safeguarding SLA breaches.                                                                                  |           |
| 4.3.5 | Each tile has a tooltip on hover (Radix tooltip, 300ms delay) with one-sentence description.                                                                                                        | All four tooltips render. Translation keys `wellbeingHub.kpis.tooltips.*` resolve.                                                                               |           |
| 4.3.6 | KPI values match the live `dashboard-summary` payload exactly — no client-side recomputation.                                                                                                       | Network tab shows the payload; sum the `kpis` object and compare to rendered numbers.                                                                            |           |

### 4.4 Quick actions

| #     | What to Check                                                                                                                                                                                                                                  | Expected                                                     | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------- |
| 4.4.1 | Four pills render: **Log Incident** → `/behaviour/incidents/new`; **Log Concern** → `/pastoral/concerns/new`; **Declare Critical Incident** → `/pastoral/critical-incidents/new` (admin-only); **Open Pastoral Case** → `/pastoral/cases/new`. | All four admin-visible; teacher spec covers the reduced set. |           |
| 4.4.2 | Each pill has gradient accent, icon, label, tooltip.                                                                                                                                                                                           | Visual polish per redesign spec.                             |           |
| 4.4.3 | Click each pill → navigates to the correct route with a fresh form.                                                                                                                                                                            | All four navigate successfully.                              |           |

### 4.5 Hub cards (6 tiles)

| #     | What to Check                                                                                                                                                                                                                                                     | Expected                                                                    | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 4.5.1 | Six cards render in admin view — **Behaviour**, **Pastoral**, **Safeguarding**, **Early Warnings**, **Staff Wellbeing**, **Settings**. Grid: 1 col on mobile, 2 on `md:`, 3 on `xl:`.                                                                             | All six visible.                                                            |           |
| 4.5.2 | Each card has a gradient accent, icon, title, description, tooltip. Animation: stagger-in on mount (60ms intervals).                                                                                                                                              | Animation visible on page load (not on hub changes).                        |           |
| 4.5.3 | Each card shows a **dynamic counter badge** sourced from `dashboard-summary.hub_counts`. Settings tile has no counter.                                                                                                                                            | Counts match payload. `hub_counts.settings` not used.                       |           |
| 4.5.4 | Hover a card — lift + glow + accent-bar pulse.                                                                                                                                                                                                                    | CSS-only; no JS performance hit. Do not break on hover-locked touch device. |           |
| 4.5.5 | Click **Behaviour** → `/behaviour`. Click **Pastoral** → `/pastoral`. Click **Safeguarding** → `/safeguarding`. Click **Early Warnings** → `/early-warnings`. Click **Staff Wellbeing** → `/wellbeing/staff`. Click **Settings** → `/settings/behaviour-general`. | All six targets correct.                                                    |           |
| 4.5.6 | If a tenant has a module disabled (e.g. `staff_wellbeing` module flag off), the tile hides. **Current behaviour per PLAN §3a**: tile visible with count=0 (module-flag-based hiding is deferred). Flag as observation; do not fail.                               | Tile visible with count=0 when module disabled.                             |           |

### 4.6 Recent activity feed

| #     | What to Check                                                                                                                                                                                                | Expected                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------- |
| 4.6.1 | Section renders under hub cards if `recent_activity.length > 0`. Title "Recent activity" + divider bar gradient.                                                                                             | Visible when seed has ≥ 1 activity row.                                      |           |
| 4.6.2 | Up to 8 items. Each row: kind icon (colour-coded per kind — incident rose, concern pink, acknowledgement emerald, escalation amber, sanction_served slate, recognition violet), title, actor, relative time. | 8 or fewer. Colours per `ACTIVITY_ICON` map in `wellbeing/page.tsx:204-213`. |           |
| 4.6.3 | Relative time is localised — "just now", "5m ago", "3h ago", "2d ago", else full date. Translation keys `wellbeingHub.recentActivity.*`.                                                                     | Values render in the user's locale.                                          |           |
| 4.6.4 | Each row is a link. Click → navigates to `href` (deep link).                                                                                                                                                 | Navigation works.                                                            |           |
| 4.6.5 | If no recent activity, the section is absent.                                                                                                                                                                | No empty block.                                                              |           |

### 4.7 Resource ribbon

| #     | What to Check                                                                                                                                                             | Expected                            | Pass/Fail                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------- | --- |
| 4.7.1 | At the bottom of `/wellbeing`, a small ribbon renders with links to Support Docs, EAP, Training (all `/wellbeing/resources?category=...`). Only rendered for staff roles. | Visible for admin (admin ⊂ staff).  |                                         |
| 4.7.2 | Click each link → navigates to `/wellbeing/resources?category={eap                                                                                                        | training}`or`/wellbeing/resources`. | Category query honoured on destination. |     |

### 4.8 Super-hub negative / empty state

| #     | What to Check                                                                                                                                                                     | Expected                        | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 4.8.1 | Seed a fresh tenant with zero incidents / concerns / surveys — the dashboard loads without error. KPIs show `0`. Hub tiles show no counters. Pending-attention + activity absent. | Page usable with empty data.    |           |
| 4.8.2 | Simulate 503 from backend (block `/api/v1/wellbeing/dashboard-summary` in devtools). Retry button reappears.                                                                      | Error banner + retry; no toast. |           |

---

## 5. Behaviour sub-hub `/behaviour`

**URL:** `/{locale}/behaviour`
**Permission:** `behaviour.view`
**Primary APIs:** `GET /api/v1/behaviour/incidents/stats`, `GET /api/v1/behaviour/recognition/leaderboard?limit=5`, `GET /api/v1/wellbeing/dashboard-summary` (hub counts)

### 5.1 Page chrome

| #     | What to Check                                                                                                                                                                                                                                                                 | Expected                                                                                                           | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.1.1 | Page header "Behaviour" + subtitle. Breadcrumb: Wellbeing → Behaviour.                                                                                                                                                                                                        | Header correct. Breadcrumb links to `/wellbeing`.                                                                  |           |
| 5.1.2 | KPI strip: **Incidents Today**, **Positive : Negative Ratio**, **Open Tasks**, **Overdue Sanctions**, **Recognition Points Awarded This Week**. 4 tiles on mobile/2 col.                                                                                                      | Tiles render. Values match DB aggregates over today's window.                                                      |           |
| 5.1.3 | Quick actions row: **Log Incident** → `/behaviour/incidents/new`; **Parse with AI** → `/behaviour/incidents/new?ai=1` (ai-flag gate on submit — tile always visible); **Generate Document** → `/behaviour/documents?generate=1`; **Open Analytics** → `/behaviour/analytics`. | All four navigate correctly.                                                                                       |           |
| 5.1.4 | Hub cards — Incidents, Sanctions, Exclusions, Appeals, Recognition, Documents, Tasks, Alerts, Amendments, Guardian Restrictions, Analytics, AI Analytics.                                                                                                                     | 12 cards visible to admin. Each has a counter badge from `hub_counts` (falls back to per-module fetch if missing). |           |
| 5.1.5 | Recent activity feed at bottom (behaviour-scoped). Up to 10 rows.                                                                                                                                                                                                             | Rows render with icons per kind.                                                                                   |           |
| 5.1.6 | Sticky Quick-Log FAB on mobile → `/behaviour/incidents/new`.                                                                                                                                                                                                                  | FAB present at 375px, click navigates.                                                                             |           |

### 5.2 Behaviour sub-hub negative path

| #     | What to Check                                                                                          | Expected                                                                                                                                                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Disable `behaviour` module flag for Tenant A via `/admin/tenants/:id/modules`. Return to `/behaviour`. | Page shows a "Module not enabled" friendly state (501) or redirects to `/wellbeing` with a banner. Flag as observation if it crashes with `MODULE_NOT_AVAILABLE` toast-storm instead. |           |
| 5.2.2 | Re-enable the flag and reload.                                                                         | Page returns to normal.                                                                                                                                                               |           |

---

## 6. Behaviour — incidents

### 6.1 `/behaviour/incidents` — list page

**Permission:** `behaviour.view`
**Primary API:** `GET /api/v1/behaviour/incidents?page=1&pageSize=20`

| #      | What to Check                                                                                                                                                                     | Expected                                                                                         | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 6.1.1  | Page renders with tabs: **All**, **Positive**, **Negative**, **Pending Approval**, **Escalated**, **My Incidents**. Active tab = All.                                             | 6 tabs. Active-state visible. URL query `?tab=all` or similar.                                   |           |
| 6.1.2  | Table columns: **Date**, **Student**, **Category**, **Polarity** (badge), **Severity**, **Status** (badge), **Reported by**, **Actions** (kebab).                                 | Columns in that order. Polarity uses colour badges (green positive, red negative, gray neutral). |           |
| 6.1.3  | Initial network: `GET /api/v1/behaviour/incidents?page=1&pageSize=20`. 200. Rows populate. Paginator shows `meta.total`.                                                          | Request fires once. Response `{data:[], meta:{page,pageSize,total}}`.                            |           |
| 6.1.4  | Filter **Category** → dropdown of all 28 default categories + any tenant custom. Selecting one fires `GET /api/v1/behaviour/incidents?category_id=<uuid>&page=1`.                 | Filter works. Result set shrinks. URL query sync preserved.                                      |           |
| 6.1.5  | Filter **Date range** → two date pickers. On change, fires `GET ...?occurred_from=YYYY-MM-DD&occurred_to=YYYY-MM-DD`.                                                             | Filter works.                                                                                    |           |
| 6.1.6  | Search by student name. Fires `?search=<string>` or scoped `?student_id=<uuid>` depending on the component.                                                                       | Debounced (≤ 1 req / 250ms). Rows filter.                                                        |           |
| 6.1.7  | Switch to **Pending Approval** tab. Fires `?approval_status=requested`.                                                                                                           | Rows show only incidents awaiting admin approval.                                                |           |
| 6.1.8  | Switch to **My Incidents**. Fires `GET /api/v1/behaviour/incidents/my`.                                                                                                           | Shows only incidents reported by the current admin.                                              |           |
| 6.1.9  | Clicking a row's Student column navigates to `/behaviour/students/:studentId` (not `/students/:id`).                                                                              | Correct route.                                                                                   |           |
| 6.1.10 | Kebab menu options: **View**, **Edit**, **Change status**, **Withdraw**, **Record follow-up**. "Withdraw" available only if status ≠ draft. Permissions hide unavailable actions. | Menu options render per state.                                                                   |           |

### 6.2 `/behaviour/incidents/new` — creation form

**Permission:** `behaviour.log`
**Primary API:** `POST /api/v1/behaviour/incidents` (standard) or `POST /api/v1/behaviour/incidents/ai-parse` + `POST /api/v1/behaviour/incidents` (AI-assisted)

| #      | What to Check                                                                                                                                                                                                                                                                                                                    | Expected                                                                                                                        | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1  | Multi-step wizard: Step 1 participants, Step 2 details, Step 3 review. Progress indicator at top.                                                                                                                                                                                                                                | 3 steps with forward/back nav.                                                                                                  |           |
| 6.2.2  | Step 1 — student picker (multi-select). Type "Ahm" → dropdown lists matching active students. Category dropdown — all 28 defaults.                                                                                                                                                                                               | Autocomplete fires against `GET /api/v1/students?search=Ahm`. Dropdown accessible via keyboard.                                 |           |
| 6.2.3  | Step 2 — description (textarea), parent_description (optional), location, occurred_at (datetime picker defaults to now), context_type.                                                                                                                                                                                           | Required fields validated via Zod `createIncidentSchema`.                                                                       |           |
| 6.2.4  | Step 3 — review the payload. Submit fires `POST /api/v1/behaviour/incidents` with full body (see integration spec §3 for contract).                                                                                                                                                                                              | 201 Created. Response includes `id`, `incident_number` (formatted `INC-YYYYMM-NNNN`).                                           |           |
| 6.2.5  | Toast: "Incident logged — INC-202604-0025". Navigates to detail page `/behaviour/incidents/:id`.                                                                                                                                                                                                                                 | Toast + nav.                                                                                                                    |           |
| 6.2.6  | Idempotency — hitting Submit twice quickly doesn't duplicate. Network tab shows second attempt returns the **same** incident id (via `idempotency_key`).                                                                                                                                                                         | No duplicate row in DB.                                                                                                         |           |
| 6.2.7  | **AI parse**: click "Parse with AI" toggle. Paste a narrative in a single field → `POST /api/v1/behaviour/incidents/ai-parse` fires → form pre-fills. If AI flag for behaviour is OFF, endpoint returns 403 `AI_DISABLED` → inline banner "AI disabled, please toggle the flag in settings" with a link to `/settings/ai-flags`. | AI parse gated. Flag off → banner. Flag on + parse OK → form populated.                                                         |           |
| 6.2.8  | **AI parse with flag on, key missing** — backend returns 503 `AI_SERVICE_UNAVAILABLE`.                                                                                                                                                                                                                                           | Banner "AI service unavailable". Form still usable manually.                                                                    |           |
| 6.2.9  | Zod validation: description < 5 chars → 400 `DESCRIPTION_TOO_SHORT`. Missing category → 400. Student not in Tenant A → 400 `STUDENT_NOT_FOUND`.                                                                                                                                                                                  | Validation errors inline under each field (react-hook-form + zodResolver pattern).                                              |           |
| 6.2.10 | Attach up to 5 files (images + PDF). `POST /api/v1/behaviour/incidents/:id/attachments` fires per file. Each attachment shows a progress bar and final signed-URL preview.                                                                                                                                                       | All 5 uploaded. Scan status `pending_scan` initially, flips to `clean` once the antivirus scan chain runs (see worker spec §4). |           |

### 6.3 `/behaviour/incidents/:id` — detail page

**Permission:** `behaviour.view`
**Primary API:** `GET /api/v1/behaviour/incidents/:id`

| #      | What to Check                                                                                                                                                                                                           | Expected                                                                                                                                            | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1  | Tabs: **Overview**, **Participants**, **Attachments**, **Sanctions**, **Acknowledgements**, **History**. Active tab = Overview.                                                                                         | 6 tabs, active-state persists through scroll.                                                                                                       |           |
| 6.3.2  | Overview shows: incident_number (monospace), polarity badge, category, severity, reporter (EntityLink), occurred_at (localised), description, parent_description (if set), location, context, follow_up_required badge. | All fields render. Null fields show "—".                                                                                                            |           |
| 6.3.3  | Status stepper at top: draft → submitted → approved → escalated. Clickable arrows between valid transitions (admin can force any transition).                                                                           | Stepper interactive. Clicking `Approve` fires `PATCH /api/v1/behaviour/incidents/:id/status {to: 'approved'}` → 200. Status badge updates in place. |           |
| 6.3.4  | **Edit** button → opens inline edit modal using `updateIncidentSchema`. Save fires `PATCH /api/v1/behaviour/incidents/:id`. Successful → toast + fields refresh.                                                        | Edit works. Fields refresh without full reload.                                                                                                     |           |
| 6.3.5  | **Withdraw** action — modal with reason field. Submit fires `POST /api/v1/behaviour/incidents/:id/withdraw`. Status flips to `withdrawn`. Parent acknowledgement requirement cleared.                                   | 200 + status update. Audit row added (visible in History tab).                                                                                      |           |
| 6.3.6  | **Record follow-up** → opens upload dialog. File upload creates attachment, follow_up_required flips to false.                                                                                                          | 201. Attachments tab count increments.                                                                                                              |           |
| 6.3.7  | **Add participant** → dialog. Select student/staff/parent, role (subject/witness/victim/other), optional notes. Save fires `POST /api/v1/behaviour/incidents/:id/participants`.                                         | 201. Participants tab updates.                                                                                                                      |           |
| 6.3.8  | **Remove participant** from Participants tab → kebab → Delete. Fires `DELETE /api/v1/behaviour/incidents/:id/participants/:pid`. Row removed with optimistic UI.                                                        | 204.                                                                                                                                                |           |
| 6.3.9  | **History** tab — audit trail from `behaviour_entity_history`. Shows change_type (created/updated/status_changed/withdrawn/etc.), changed_by, before/after diff, timestamp.                                             | `GET /api/v1/behaviour/incidents/:id/history?page=1&pageSize=50`. Rows render oldest-first or newest-first with sort control.                       |           |
| 6.3.10 | **Policy evaluation** button (admin) → opens side panel showing the rules that matched this incident (`GET /api/v1/behaviour/incidents/:id/policy-evaluation`). Shows matched rules, conditions, actions recommended.   | Panel renders. Useful for debugging the behaviour policy engine.                                                                                    |           |

### 6.4 Attachment lifecycle

| #     | What to Check                                                                                                                                                                      | Expected                                | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------- |
| 6.4.1 | Upload a 5MB image via Attachments tab. `POST /api/v1/behaviour/incidents/:id/attachments` with `multipart/form-data`. 201. Row appears in table with `scan_status: pending_scan`. | File uploads. Row present.              |           |
| 6.4.2 | Worker runs `safeguarding:attachment-scan` → scan_status flips to `clean` within 30s (or `flagged` if ClamAV detects signature). UI polls or refreshes on tab focus.               | Status updates correctly.               |           |
| 6.4.3 | Click attachment row → `GET /api/v1/behaviour/incidents/:id/attachments/:aid` → returns 302 to signed S3 URL (presigned, short TTL). New tab opens to preview.                     | Download works. URL is https + signed.  |           |
| 6.4.4 | Upload a 100MB file — server returns 413 `PAYLOAD_TOO_LARGE`. UI shows inline error on the drop zone.                                                                              | 413 rendered cleanly; no console error. |           |
| 6.4.5 | Upload `.exe` file — server returns 400 `FILE_TYPE_NOT_ALLOWED`.                                                                                                                   | Inline error.                           |           |

---

## 7. Behaviour — sanctions

### 7.1 `/behaviour/sanctions` — list

| #     | What to Check                                                                                                                                                                    | Expected                                                                         | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Page renders with tabs: **Pending**, **Scheduled Today**, **Served**, **Voided**. URL sync.                                                                                      | 4 tabs.                                                                          |           |
| 7.1.2 | Table columns: Sanction #, Student, Type, Scheduled date + time, Supervisor, Status, Actions.                                                                                    | 7 columns.                                                                       |           |
| 7.1.3 | Filter by **Type** (detention, internal_suspension, external_suspension, exclusion) and **Supervisor** (dropdown of staff users).                                                | Filters work. Query string sync.                                                 |           |
| 7.1.4 | **Calendar view** toggle → switches to a month grid. Days with sanctions show count badges. Click day → list for that day.                                                       | Toggle + grid works. `GET /api/v1/behaviour/sanctions/calendar?from=&to=` fires. |           |
| 7.1.5 | **Bulk mark served** — select multiple rows with checkboxes → "Mark Served" button → modal confirmation → `POST /api/v1/behaviour/sanctions/bulk-mark-served` with array of ids. | All selected flip to `served`. Notifications enqueue (worker spec §5).           |           |

### 7.2 `/behaviour/sanctions/today` — quick-serve

| #     | What to Check                                                                                                                                       | Expected                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------- |
| 7.2.1 | Page shows today's sanctions grouped by type. Each row has a single "Mark Served" primary button + student photo.                                   | Fast-click UI. All rows visible without scroll on desktop. |           |
| 7.2.2 | Click **Mark Served** on one row → optimistic UI + `PATCH /api/v1/behaviour/sanctions/:id/status {to: 'served'}` fires. Row moves to "Served" list. | 200. No dialog.                                            |           |
| 7.2.3 | If row's parent_meeting_required=true, record parent meeting inline → `POST /api/v1/behaviour/sanctions/:id/parent-meeting` fires.                  | 201 meeting record. Toast "Parent meeting recorded".       |           |

### 7.3 Sanction detail

| #     | What to Check                                                                                                                                                               | Expected                                                          | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 7.3.1 | Detail (modal or page) shows all fields: schedule, room, supervisor, suspension dates if type=suspension, return_conditions, parent_meeting_required, parent_meeting_notes. | All fields correct.                                               |           |
| 7.3.2 | **Edit schedule** → updates `PATCH /api/v1/behaviour/sanctions/:id` with new schedule. Valid state transitions enforced (served → cannot unset).                            | Valid edit works; invalid returns 400 `INVALID_STATE_TRANSITION`. |           |
| 7.3.3 | **Appeal outcome** — if the sanction has an associated appeal, the outcome shows inline (linked to `/behaviour/appeals/:id`).                                               | Link present.                                                     |           |

---

## 8. Behaviour — exclusions

**URLs:** `/behaviour/exclusions`, `/behaviour/exclusions/:id`
**State machine:** drafted → hearing_scheduled → hearing_held → decided → implemented → closed

### 8.1 List page

| #     | What to Check                                                                                                                    | Expected            | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------- |
| 8.1.1 | Tabs: All / Drafted / Hearing Scheduled / Hearing Held / Decided / Implemented / Closed.                                         | 7 tabs.             |           |
| 8.1.2 | Table columns: Case #, Student, Type (temporary/fixed_term/permanent), Status, Hearing date, Decision, Appeal deadline, Actions. | 8 columns.          |           |
| 8.1.3 | Filter by **Type** and **Decision** (reinstated/upheld/varied).                                                                  | Filters work.       |           |
| 8.1.4 | Rows approaching appeal deadline (< 3 days) highlighted in amber.                                                                | Visual cue visible. |           |

### 8.2 Exclusion case lifecycle

| #      | What to Check                                                                                                                                                                                                                                                     | Expected                                                                                                                          | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1  | From an incident detail page where sanction.type=exclusion, click **Start Exclusion Case**. Creates `POST /api/v1/behaviour/exclusion-cases` with `{sanction_id, student_id, type}`. Redirects to `/behaviour/exclusions/:id`.                                    | 201. Case created in `drafted` state.                                                                                             |           |
| 8.2.2  | Detail page sections: Overview, Timeline, Hearing, Documents, Decision, Appeal. Linked evidence carousel at top.                                                                                                                                                  | Sections render.                                                                                                                  |           |
| 8.2.3  | **Issue notice** → opens form. Submit `POST /api/v1/behaviour/exclusion-cases/:id/issue-notice`. State transitions drafted → hearing_scheduled (if hearing required) or drafted → implemented (if no hearing).                                                    | State transitions + document generated (behaviour_documents row with type=exclusion_notice). Document shows in Documents section. |           |
| 8.2.4  | **Schedule hearing** → form with hearing_date, attendees (JSON), venue. Submit `POST /api/v1/behaviour/exclusion-cases/:id/schedule-hearing`. Adds to timeline.                                                                                                   | 201. Timeline entry visible.                                                                                                      |           |
| 8.2.5  | **Record hearing** after the date → form with minutes, attendees present, student_representation toggle. Submit `POST /api/v1/behaviour/exclusion-cases/:id/record-hearing`.                                                                                      | 201. State → hearing_held. Minutes saved as a document.                                                                           |           |
| 8.2.6  | **Generate board pack** — button appears after record-hearing. `POST /api/v1/behaviour/exclusion-cases/:id/generate-board-pack`. Returns document link. PDF includes incident summary, previous record, intervention history, hearing minutes, proposed decision. | 202 (async). Worker enqueues PDF render; wait 10s; refresh → document available.                                                  |           |
| 8.2.7  | **Record decision** → form with decision enum (upheld/reinstated/varied), reasoning, conditions_for_return. Submit `POST /api/v1/behaviour/exclusion-cases/:id/record-decision` **OR** `POST /api/v1/behaviour/exclusion-cases/:id/finalise`.                     | 201. State → decided → implemented. Decision-letter document generated.                                                           |           |
| 8.2.8  | **Overturn** — on a decided/implemented case, click **Overturn**. Form with reason. `POST /api/v1/behaviour/exclusion-cases/:id/overturn`. State → closed with overturn audit.                                                                                    | 201. Student's sanction withdrawn; parent notified (worker chain).                                                                |           |
| 8.2.9  | Attempt an invalid transition (e.g. drafted → closed without a decision). API returns 400 `INVALID_STATE_TRANSITION`.                                                                                                                                             | 400 with code; UI shows inline error.                                                                                             |           |
| 8.2.10 | **Appeal deadline countdown** visible in header — "Appeal window closes in 2 days" when status=decided and appeal_deadline set.                                                                                                                                   | Visible. Red when < 24h.                                                                                                          |           |

---

## 9. Behaviour — appeals

**URLs:** `/behaviour/appeals`, `/behaviour/appeals/:id`

### 9.1 List & submit

| #     | What to Check                                                                                                                                       | Expected                                          | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 9.1.1 | Tabs: Draft / Submitted / Scheduled / Hearing Held / Decided.                                                                                       | 5 tabs.                                           |           |
| 9.1.2 | Columns: Appeal #, Entity type (incident/sanction), Appellant, Submitted, Hearing date, Decision, Actions.                                          | 7 columns.                                        |           |
| 9.1.3 | **New appeal** (admin on behalf of student/parent) — form with grounds, grounds_category, supporting docs. Submit `POST /api/v1/behaviour/appeals`. | 201. `appeal_number` formatted `APP-YYYYMM-NNNN`. |           |

### 9.2 Appeal detail + hearing + decision

| #     | What to Check                                                                                                                                                                      | Expected                 | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 9.2.1 | Tabs: Overview / Hearing / Evidence / Decision / Communications.                                                                                                                   | 5 tabs.                  |           |
| 9.2.2 | **Schedule hearing** → updates via `PATCH /api/v1/behaviour/appeals/:id` or a dedicated endpoint (check controller). Enqueues notifications.                                       | 200. Hearing date saved. |           |
| 9.2.3 | **Record decision** → `POST /api/v1/behaviour/appeals/:id/decide` with `{decision, decision_reasoning, resulting_amendments}`. Status → decided. Parent notified.                  | 201.                     |           |
| 9.2.4 | **Generate decision letter** → `POST /api/v1/behaviour/appeals/:id/generate-decision-letter`. Document row created. Download link appears.                                         | PDF rendered.            |           |
| 9.2.5 | **Evidence bundle** — `GET /api/v1/behaviour/appeals/:id/evidence-bundle` returns a single PDF with all attachments concatenated and an index page. Content-Type: application/pdf. | Download works.          |           |
| 9.2.6 | **Withdraw appeal** → `POST /api/v1/behaviour/appeals/:id/withdraw` with reason. Status → withdrawn.                                                                               | 201.                     |           |

---

## 10. Behaviour — recognition

**URLs:** `/behaviour/recognition`, `/behaviour/recognition/houses/:id` (if present)

### 10.1 Recognition wall

| #       | What to Check                                                                                                                                                  | Expected                                                                                 | Pass/Fail |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| 10.1.1  | `GET /api/v1/behaviour/recognition/wall?page=1&pageSize=20` returns paginated feed.                                                                            | Rows render as cards (student name, category, points awarded, reason, actor, timestamp). |           |
| 10.1.2  | Filter by **Student**, **Staff**, **Category**. Fires with query params.                                                                                       | Filters work.                                                                            |           |
| 10.1.3  | **Leaderboard** section — `GET /api/v1/behaviour/recognition/leaderboard?limit=10`. Shows top students by points (current academic year).                      | Rows sorted desc.                                                                        |           |
| 10.1.4  | **Houses** section — `GET /api/v1/behaviour/recognition/houses` returns house standings with member counts, total points.                                      | All active houses listed.                                                                |           |
| 10.1.5  | Click a house → `/behaviour/recognition/houses/:id` → member list + activity.                                                                                  | Route present.                                                                           |           |
| 10.1.6  | **Award manual** — click "Add Award" → form with student, award_type, notes. Submit `POST /api/v1/behaviour/recognition/awards`.                               | 201. Feed updates in real time (optimistic) or on refresh.                               |           |
| 10.1.7  | **Publication approval flow** — select an award → "Publish" → creates publication-approval row `POST /api/v1/behaviour/recognition/publications`.              | 201 publication pending approval.                                                        |           |
| 10.1.8  | As the **second admin**, navigate to publications queue → approve with `PATCH /api/v1/behaviour/recognition/publications/:id/approve`. Worker notifies parent. | Publication flips to approved. Parent notification job enqueued.                         |           |
| 10.1.9  | Reject a publication → `PATCH /api/v1/behaviour/recognition/publications/:id/reject` with reason. Stays hidden on public wall.                                 | 200.                                                                                     |           |
| 10.1.10 | **Bulk house assign** — admin page: select students + target house → `POST /api/v1/behaviour/recognition/houses/bulk-assign`. Response shows `{affected: N}`.  | 200.                                                                                     |           |

---

## 11. Behaviour — documents

**URL:** `/behaviour/documents`, `/behaviour/documents/:id`

### 11.1 Template library + generate

| #      | What to Check                                                                                                                                                    | Expected                                                                                               | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------- |
| 11.1.1 | `GET /api/v1/behaviour/documents/templates` returns system + tenant templates, localised (en/ar).                                                                | Rows list with type (incident_summary/sanction_letter/appeal_decision/exclusion_notice), locale, name. |           |
| 11.1.2 | Click a template → preview (merge field list visible).                                                                                                           | Preview renders.                                                                                       |           |
| 11.1.3 | **Generate document** — pick an incident/sanction/appeal/exclusion as the source entity + template + locale. Submit `POST /api/v1/behaviour/documents/generate`. | 202 (async render). BullMQ pdf-rendering job enqueued.                                                 |           |
| 11.1.4 | Wait 10s or refresh. Document row appears in list with status=generated, download link.                                                                          | Row present. `GET /api/v1/behaviour/documents/:id/download` returns signed S3 URL.                     |           |
| 11.1.5 | **Preview** without downloading — `GET /api/v1/behaviour/documents/:id/preview` returns signed URL for inline display.                                           | Preview works.                                                                                         |           |
| 11.1.6 | **Finalise** — mutates status generated → sent. `PATCH /api/v1/behaviour/documents/:id/finalise`.                                                                | Status flips.                                                                                          |           |
| 11.1.7 | **Send** document → `POST /api/v1/behaviour/documents/:id/send` with channel (email/whatsapp/print). Enqueues wellbeing-notifications-dispatch job.              | 201. `sent_at` populated. Audit row in history.                                                        |           |

### 11.2 Document supersession

| #      | What to Check                                                                                                                                                                             | Expected                 | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------- |
| 11.2.1 | Re-generate the same document for the same entity → creates a NEW row with `superseded_by_id` pointing to the original; status of original flips to `superseded`, new one is `generated`. | Chain visible in the UI. |           |

---

## 12. Behaviour — tasks, alerts, amendments

### 12.1 Tasks `/behaviour/tasks`

| #      | What to Check                                                                              | Expected   | Pass/Fail             |
| ------ | ------------------------------------------------------------------------------------------ | ---------- | --------------------- | -------------------- | --- |
| 12.1.1 | Tabs: Pending / In-progress / Completed / Overdue. URL sync.                               | 4 tabs.    |                       |
| 12.1.2 | Columns: Title, Type, Entity (link), Assigned to, Priority, Due, Status, Actions.          | 8 columns. |                       |
| 12.1.3 | Click a row → `/behaviour/{incidents                                                       | sanctions  | ...}/{id}` deep-link. | Navigates correctly. |     |
| 12.1.4 | **Complete task** from row kebab → `PATCH /api/v1/behaviour/tasks/:id` → status=completed. | 200.       |                       |
| 12.1.5 | Overdue tab rows highlighted red. Reminder + overdue-notified fields shown.                | Visible.   |                       |

### 12.2 Alerts `/behaviour/alerts`

| #      | What to Check                                                                                                                                                    | Expected                     | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| 12.2.1 | Real-time alerts panel — severity-sorted list (critical / high / medium / low). Each alert has acknowledge / escalate / dismiss action.                          | Rows render.                 |           |
| 12.2.2 | Acknowledge → `PATCH /api/v1/behaviour/alerts/:id/acknowledge` OR via recipient row `PATCH /api/v1/behaviour/alert-recipients/:id`. Row moves to "Acknowledged". | 200.                         |           |
| 12.2.3 | Escalate → creates a pastoral concern or a safeguarding concern (per alert type). Pastoral/safeguarding rows appear in their respective lists.                   | Cross-module chain triggers. |           |

### 12.3 Amendments `/behaviour/amendments`

| #      | What to Check                                                                                                                                     | Expected                                                | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 12.3.1 | Page lists every amendment_notice with entity_type / entity_id / amendment_type / changed_by / authorised_by / requires_parent_reacknowledgement. | Columns render. Filter by type / pending parent re-ack. |           |
| 12.3.2 | **Pending** queue — amendments awaiting send. Admin sends correction via `POST /api/v1/behaviour/amendments/:id/send-correction`.                 | 201. Notification enqueued to parent.                   |           |
| 12.3.3 | Parent acknowledgement timeline visible on amendment detail — shows when correction notification was sent, delivered, read, re-acknowledged.      | Timeline renders.                                       |           |

---

## 13. Behaviour — guardian restrictions

**URL:** `/behaviour/guardian-restrictions`

| #    | What to Check                                                                                                                                                        | Expected                                                                                                   | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Table columns: Student, Parent, Restriction type (contact_ban / information_restriction / pickup_ban), Effective from / until, Status, Set by, Actions.              | 7 columns.                                                                                                 |           |
| 13.2 | **Add restriction** → form with student, parent, restriction_type, legal_basis, reason, effective_from/until. Submit `POST /api/v1/behaviour/guardian-restrictions`. | 201. Parent immediately loses the matching portal access on their next request (tested in parent spec §X). |           |
| 13.3 | **Revoke restriction** → modal with revoke_reason. `PATCH /api/v1/behaviour/guardian-restrictions/:id/revoke`.                                                       | Status → expired/revoked. Parent access restored.                                                          |           |
| 13.4 | Expired restrictions auto-move to "Expired" tab based on `effective_until`. Filter by status.                                                                        | Tab + filter works.                                                                                        |           |

---

## 14. Behaviour — interventions

**URLs:** `/behaviour/interventions`, `/behaviour/interventions/new`, `/behaviour/interventions/:id`

| #    | What to Check                                                                                                                                                                                    | Expected                                                                                        | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------- |
| 14.1 | List tabs: Active / Paused / Completed / Ceased.                                                                                                                                                 | 4 tabs.                                                                                         |           |
| 14.2 | New form: intervention_number auto-generated, student picker, title, type, trigger description, goals[], strategies[], assigned_to, start/target_end dates, review_frequency_days default 14.    | `POST /api/v1/behaviour/interventions`. 201.                                                    |           |
| 14.3 | Detail page — tabs: Overview / Progress / Reviews / Linked incidents. Overview shows goals/strategies/status/next review date.                                                                   | All tabs present.                                                                               |           |
| 14.4 | **Record progress** — note textarea + `POST /api/v1/behaviour/interventions/:id/progress`.                                                                                                       | 201. Appears in Progress tab.                                                                   |           |
| 14.5 | **Record review** — form with progress enum (improving / holding / declining / concerning), goal_updates JSON, notes, next_review_date, behaviour_points_since_last, attendance_rate_since_last. | `POST /api/v1/behaviour/interventions/:id/review`. 201. next_review_date updated on parent row. |           |
| 14.6 | **Link incidents** — from Linked tab: search and add incidents via `behaviour_intervention_incidents`. Unique junction enforced.                                                                 | Duplicate add returns 409.                                                                      |           |
| 14.7 | **Close intervention** — status → completed with outcome enum (successful / partial / unsuccessful / ceased).                                                                                    | `PATCH /api/v1/behaviour/interventions/:id/status {to: 'completed', outcome: '...'}`. 200.      |           |

---

## 15. Behaviour — analytics + AI analytics (flag-gated)

**URLs:** `/behaviour/analytics`, `/behaviour/analytics/ai`

### 15.1 Core analytics

| #      | What to Check                                                                                                                                                            | Expected                                                        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------- |
| 15.1.1 | Charts: incidents over time (line), positive:negative ratio (donut), top categories (bar), top students (bar), top staff reporters (bar). Filter by date / year / class. | All charts render with data. Filters update all simultaneously. |           |
| 15.1.2 | Export to CSV / PDF → button per chart.                                                                                                                                  | Download works.                                                 |           |
| 15.1.3 | Empty state (no incidents for range) shows "No data" placeholder, not a blank chart.                                                                                     | Placeholder visible.                                            |           |
| 15.1.4 | **Polish fix verification** — `/behaviour/analytics` must not 500 on `prisma.student.count({status: 'enrolled'})`. The fix was to swap 'enrolled' → 'active'.            | No 500. Charts load. (See `SIGN_OFF.md` ISSUE-24-03.)           |           |

### 15.2 AI analytics (flag-gated)

| #      | What to Check                                                                                                                                                                                                                           | Expected                                                               | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 15.2.1 | Navigate to `/behaviour/analytics/ai` with the behaviour AI flag **off**. Page renders a banner "AI analytics disabled for this tenant" with a link to `/settings/ai-flags` (owner/principal only).                                     | Banner + link.                                                         |           |
| 15.2.2 | Toggle the flag on in `/settings/ai-flags`. Return. Page shows NL query input + history panel.                                                                                                                                          | Functional UI.                                                         |           |
| 15.2.3 | Ask "How many bullying incidents in Year 5 last term?" → `POST /api/v1/behaviour/analytics/ai-query` fires. 200 returns `{answer, citations, data_payload}`. Answer renders in the chat panel; citations link to specific incident ids. | Response rendered. History row created (`behaviour_ai_query_history`). |           |
| 15.2.4 | If `ANTHROPIC_API_KEY` missing on prod, backend returns 503 `AI_SERVICE_UNAVAILABLE`. Banner "AI service is temporarily unavailable". (See `SIGN_OFF.md` out-of-scope item 2.)                                                          | 503 rendered cleanly.                                                  |           |
| 15.2.5 | History panel — `GET /api/v1/behaviour/analytics/ai-query/history?pageSize=20` returns paginated prior questions. Click one → re-renders the answer + citations.                                                                        | Panel works.                                                           |           |
| 15.2.6 | Attempt a query on a student from Tenant B (via URL manipulation or direct API). Returns 404 / 400. Tenant A's answer never contains Tenant B data.                                                                                     | No cross-tenant leakage.                                               |           |

---

## 16. Behaviour — policies replay (dry-run)

**URL:** `/behaviour/policies/replay`

| #    | What to Check                                                                                                                                                               | Expected                                                                                                            | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Enter a draft incident payload (category, severity, student, context). Click **Dry Run** → `POST /api/v1/behaviour/policy-dry-run`.                                         | Response shows which rules would match, which actions would fire (create sanction / notify parent / auto-escalate). |           |
| 16.2 | Enter an existing incident id. Click **Replay** → `POST /api/v1/behaviour/policies/replay/preview?incident_id=<id>`. Response shows current vs hypothetical policy outcome. | Diff view render.                                                                                                   |           |
| 16.3 | Replay an incident under a prior version of a rule (select version). The response reflects the historical conditions.                                                       | Version selector works. `behaviour_policy_rule_versions` seeded for ≥ 1 rule for this to exercise.                  |           |

---

## 17. Behaviour — admin console + legal holds

**URLs:** `/behaviour/admin`, `/behaviour/admin/legal-holds`

| #    | What to Check                                                                                                                                                                    | Expected                                                                           | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 17.1 | Admin console has tiles: Bulk operations / User roles / Retention policy / Data repair / Legal holds.                                                                            | All tiles visible.                                                                 |           |
| 17.2 | **Bulk operations** — mass mark-served, mass-archive incidents older than X months. Confirm dialog per operation. Fires admin endpoints under `/api/v1/behaviour/admin/*`.       | Operations complete. Audit entries in `behaviour_entity_history`.                  |           |
| 17.3 | **Retention policy** — configure retention_status auto-archival threshold (e.g. archive after 2 years unless legal_hold). Save PATCH `/api/v1/behaviour/admin/retention-policy`. | Policy saved. Cron `behaviour:retention-check` (monthly, 1st at 01:00) applies it. |           |
| 17.4 | **Legal holds** page — list of active/released holds per entity. Filter by entity_type (incident/sanction/appeal/exclusion).                                                     | Table renders.                                                                     |           |
| 17.5 | **Set a legal hold** — pick entity, enter hold_reason + legal_basis. POST `/api/v1/behaviour/admin/legal-holds`. Entity can now not be archived/deleted.                         | 201. Attempts to archive return 400 `LEGAL_HOLD_ACTIVE`.                           |           |
| 17.6 | **Release hold** — form with release_reason. PATCH `/api/v1/behaviour/admin/legal-holds/:id/release`. Entity archival unblocked.                                                 | 200.                                                                               |           |
| 17.7 | **Data repair** — admin-only tool for orphan cleanup / idempotency-key rotation / stale lock release. Confirm dialog + audit row.                                                | Operations succeed. Audit present.                                                 |           |

---

## 18. Behaviour — student profile page

**URL:** `/behaviour/students/:studentId`

| #    | What to Check                                                                                                                                                                                        | Expected                              | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 18.1 | Header: student photo (or initial), full name, year group, class, risk tier (if any), current house, point totals (positive/negative/net).                                                           | Header renders. Values match DB.      |           |
| 18.2 | Tabs: Incidents / Sanctions / Exclusions / Recognition / Interventions / Documents / AI Summary.                                                                                                     | 7 tabs.                               |           |
| 18.3 | **AI Summary** tab (flag-gated): `GET /api/v1/behaviour/students/:studentId/ai-summary` returns a narrative summary of the student's pattern. Flag-off → banner. Flag-on → narrative with citations. | Flag gate respected.                  |           |
| 18.4 | Each tab loads its data lazily when opened.                                                                                                                                                          | No upfront fetches for unopened tabs. |           |
| 18.5 | **Quick actions** row: Log incident for this student / Open pastoral case / Add intervention / View full record.                                                                                     | Each navigates to a pre-filled form.  |           |

---

## 19. Pastoral sub-hub `/pastoral`

**Note:** per PLAN §2c, the pastoral sub-hub is NOT re-designed in the rebuild. The existing page is preserved. This spec exercises it as-shipped.

| #    | What to Check                                                                                                                                                                       | Expected                                      | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 19.1 | Page renders with its existing internal tab strip (not a new hub tile grid). Tabs cover: Concerns / Cases / Interventions / Referrals / SST / Critical / Check-ins / DSAR / Import. | Tabs render.                                  |           |
| 19.2 | Recent concerns preview, case pulse, operating rules card all present as before the rebuild.                                                                                        | Unchanged.                                    |           |
| 19.3 | `/pastoral/checkins` loads without the Wave 4 crash (polish fix Impl 10). Null-guard present.                                                                                       | Page renders even with empty checkin dataset. |           |

---

## 20. Pastoral — concerns

**URLs:** `/pastoral/concerns`, `/pastoral/concerns/new`, `/pastoral/concerns/:id`, `/pastoral/concerns/:id/edit`

### 20.1 List + log

| #      | What to Check                                                                                                                                                               | Expected                               | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 20.1.1 | Tabs: All / Tier 1 / Tier 2 / Tier 3 (CP) — Tier 3 visible only with CP access grant or owner/principal/VP per logical model. URL sync.                                     | 4 tabs visible to admin.               |           |
| 20.1.2 | Columns: Date, Student, Category, Severity, Tier, Author (or masked), Case, Status (acknowledged/active), Actions.                                                          | 9 columns.                             |           |
| 20.1.3 | Filter by severity, tier, status. Search.                                                                                                                                   | Filters work.                          |           |
| 20.1.4 | **New concern** form — student(s) (multi), category, severity, occurred_at, location, witnesses (array), actions_taken, follow_up_needed. Tier auto-computed from category. | `POST /api/v1/pastoral/concerns`. 201. |           |
| 20.1.5 | IP audit — DB row has `req.ip` captured in `pastoral_events` audit payload.                                                                                                 | SQL shows `ip_address` not null.       |           |

### 20.2 Detail + escalate

| #      | What to Check                                                                                                                                                          | Expected                                                          | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 20.2.1 | Detail page tabs: Overview / Involved students / Related / Activity / Documents.                                                                                       | 5 tabs.                                                           |           |
| 20.2.2 | Narrative shows current version + "View history" drawer (versions via `pastoral_concern_versions`).                                                                    | Drawer lists every amendment with reason.                         |           |
| 20.2.3 | **Amend narrative** → form with new text + amendment_reason. PATCH `/api/v1/pastoral/concerns/:id/narrative`. Version increments.                                      | 200. Version n+1 visible.                                         |           |
| 20.2.4 | **Escalate tier** — button. Form with new_tier + escalation_reason. POST `/api/v1/pastoral/concerns/:id/escalate`.                                                     | 201. Tier updated. Notifications enqueue to DSL (worker spec §4). |           |
| 20.2.5 | **Share with parent** — modal selects parent + message. POST `/api/v1/pastoral/concerns/:id/share-with-parent`.                                                        | 201. `parent_shareable=true`, `shared_at` set.                    |           |
| 20.2.6 | Events tab — `GET /api/v1/pastoral/concerns/:id/events` returns pastoral_events rows tied to this concern (creation, escalation, share, narrative change).             | Timeline renders chronologically.                                 |           |
| 20.2.7 | Attempt to view a Tier 3 concern without CP grant (as a vanilla admin without Tier 3 scope). Returns 403. (Admin in this spec has Tier 3 per logical model → allowed.) | Admin can view. Teacher spec verifies denial.                     |           |

### 20.3 Auto-created pastoral concern from behaviour

| #      | What to Check                                                                                                                                                            | Expected                                                     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------- |
| 20.3.1 | Log a behaviour incident with a category where `auto_create_pastoral_concern=true`. After commit, a pastoral_concern row auto-created with `behaviour_incident_id=<id>`. | Concern appears in pastoral list. Auto-created flag visible. |           |
| 20.3.2 | The chain job `pastoral:sync-behaviour-safeguarding` (if triggered) creates a matching safeguarding concern when the behaviour category `converts_to_safeguarding=true`. | Safeguarding concern appears; both concerns cross-link.      |           |

---

## 21. Pastoral — cases

**URLs:** `/pastoral/cases`, `/pastoral/cases/new`, `/pastoral/cases/[id]`

| #     | What to Check                                                                                                                                         | Expected                              | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- |
| 21.1  | List tabs: Open / Active / Review due / Closed. URL sync.                                                                                             | 4 tabs.                               |           |
| 21.2  | **My cases** tab (owner_user_id = current). `GET /api/v1/pastoral/cases/my`.                                                                          | Filters to admin's owned cases.       |           |
| 21.3  | **Orphan cases** tab — `GET /api/v1/pastoral/cases/orphans`. Cases with no owner.                                                                     | Empty or populated per seed.          |           |
| 21.4  | New form — student(s), opened_reason, tier, owner (dropdown of staff), next_review_date. `POST /api/v1/pastoral/cases`. 201. `case_number` formatted. | 201.                                  |           |
| 21.5  | Detail tabs: Overview / Students / Concerns / Interventions / SST links / Activity.                                                                   | 6 tabs.                               |           |
| 21.6  | **Link concern to case** — POST `/api/v1/pastoral/cases/:id/concerns`. Concern's case_id set.                                                         | 201.                                  |           |
| 21.7  | **Add student to case** — POST `/api/v1/pastoral/cases/:id/students`. Creates junction row.                                                           | 201. Student appears in Students tab. |           |
| 21.8  | **Transfer ownership** — modal with new_owner + reason. POST `/api/v1/pastoral/cases/:id/transfer`.                                                   | 201. Audit + notifications enqueued.  |           |
| 21.9  | **Status transitions** — open → active → review_due → closed. PATCH `/api/v1/pastoral/cases/:id/status`.                                              | Invalid transitions return 400.       |           |
| 21.10 | **Close case** — form with closure_notes. closed_at populated.                                                                                        | 200.                                  |           |

---

## 22. Pastoral — interventions + reviews

**URLs:** `/pastoral/interventions`, `/pastoral/interventions/new`, `/pastoral/interventions/:id`

| #    | What to Check                                                                                                                                                                                                            | Expected                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 22.1 | List tabs: Active / Paused / Completed / Ceased. Filters by type, assigned-to. Status enum values: `pc_active`, `pc_paused`, `pc_completed`, `pc_ceased`.                                                                | Tabs + filters. Note the `pc_` prefix ambiguity surfaced in ISSUE-24-02 polish — UI must map `active` → `pc_active` correctly. |           |
| 22.2 | **New intervention** — case (optional), student(s), type, continuum_level, target_outcomes (JSON array), review_cycle_weeks, parent_informed/consented flags, student_voice. POST `/api/v1/pastoral/interventions`. 201. | Created.                                                                                                                       |           |
| 22.3 | Detail tabs: Plan / Actions / Progress / Reviews / Related. Plan tab shows goals + strategies.                                                                                                                           | 5 tabs.                                                                                                                        |           |
| 22.4 | **Add action** — description, assigned_to, frequency, start_date, due_date. POST `/api/v1/pastoral/interventions/:id/actions` (if shipped) or inline.                                                                    | 201.                                                                                                                           |           |
| 22.5 | **Record progress** note — POST `/api/v1/pastoral/interventions/:id/progress`.                                                                                                                                           | 201.                                                                                                                           |           |
| 22.6 | **Record review** — review_date, progress enum, notes, next_review_date, send_aware flag. POST `/api/v1/pastoral/interventions/:id/review`.                                                                              | 201. next_review_date updated.                                                                                                 |           |
| 22.7 | **Status transitions** — PATCH `/api/v1/pastoral/interventions/:id/status`. Invalid returns 400. Worker cron `pastoral:overdue-actions` auto-flips overdue actions.                                                      | Correct enforcement.                                                                                                           |           |

---

## 23. Pastoral — referrals (NEPS lifecycle)

**URLs:** `/pastoral/referrals`, `/pastoral/referrals/new`, `/pastoral/referrals/:id`

| #     | What to Check                                                                                                                                                                          | Expected                                 | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- |
| 23.1  | List columns: Referral #, Student, Referral type (NEPS/external), Status, Submitted at, Acknowledged at, Report received at.                                                           | 7 columns.                               |           |
| 23.2  | **New referral** — student, referral_type, referral_body_name, reason, manual_additions. Fills from pre-populated data where possible. POST `/api/v1/pastoral/referrals`. 201 (draft). | 201.                                     |           |
| 23.3  | **Pre-populate** — button on draft → POST `/api/v1/pastoral/referrals/:id/pre-populate` returns snapshot of behaviour + pastoral + attendance data for the student.                    | Snapshot merged into the referral draft. |           |
| 23.4  | **Submit** — POST `/api/v1/pastoral/referrals/:id/submit`. Status → submitted. submitted_at populated. Notifications enqueue.                                                          | 201.                                     |           |
| 23.5  | **Acknowledge** (agency confirmed receipt) — POST `/api/v1/pastoral/referrals/:id/acknowledge`.                                                                                        | Status → acknowledged.                   |           |
| 23.6  | **Schedule assessment** — POST `/api/v1/pastoral/referrals/:id/schedule-assessment` with date.                                                                                         | Status → assessment_scheduled.           |           |
| 23.7  | **Complete assessment** — POST `/api/v1/pastoral/referrals/:id/complete-assessment`.                                                                                                   | Status → assessment_completed.           |           |
| 23.8  | **Receive report** — POST `/api/v1/pastoral/referrals/:id/receive-report` with summary + external_reference.                                                                           | Status → report_received.                |           |
| 23.9  | **Add recommendations** — POST `/api/v1/pastoral/referrals/:referralId/recommendations` per recommendation with assigned_to + review_date.                                             | 201 per recommendation.                  |           |
| 23.10 | **Update recommendation status** — PATCH `/api/v1/pastoral/referrals/:referralId/recommendations/:id` with rec_pending → in_progress → completed.                                      | 200.                                     |           |
| 23.11 | **Withdraw** — POST `/api/v1/pastoral/referrals/:id/withdraw` with reason.                                                                                                             | Status → withdrawn.                      |           |
| 23.12 | **NEPS visits** — `/pastoral/neps-visits` (subroute or tab). Create visit (psychologist_name, visit_date). POST `/api/v1/pastoral/neps-visits`.                                        | 201.                                     |           |
| 23.13 | **Add students to visit** — POST `/api/v1/pastoral/neps-visits/:visitId/students`. 201 per student.                                                                                    | 201.                                     |           |

---

## 24. Pastoral — critical incidents + response plan

**URLs:** `/pastoral/critical-incidents`, `/pastoral/critical-incidents/new`, `/pastoral/critical-incidents/:id`

| #    | What to Check                                                                                                                                                                                                                                             | Expected                                                                                      | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 24.1 | **Declare critical incident** form — type (bereavement / serious_injury / safeguarding_escalation / major_accident / other + other_text), description, occurred_at, scope (specific_student / class / year_group / whole_school), scope_ids, declared_by. | `POST /api/v1/pastoral/critical-incidents`. 201. `incident_number` formatted.                 |           |
| 24.2 | Detail page tabs: Overview / Affected / Response plan / Communications / Linked. Status badge at top (`ci_active`).                                                                                                                                       | 5 tabs.                                                                                       |           |
| 24.3 | **Add affected individual** — affected_type (student/staff), select student or staff_profile, impact_level, notes, support_offered toggle, wellbeing_flag_active + expires_at.                                                                            | 201. Affected tab row appears.                                                                |           |
| 24.4 | **Wellbeing flag** on an affected student — visible as a soft alert on their student profile (behaviour / pastoral) until expiry. Worker cron `pastoral:wellbeing-flag-expiry` (daily) deactivates expired flags.                                         | Flag present; expires at scheduled date; audit in pastoral_events (`wellbeing_flag_expired`). |           |
| 24.5 | **Record response plan** — free-text + JSON structured steps. PATCH `/api/v1/pastoral/critical-incidents/:id` with `response_plan`.                                                                                                                       | 200.                                                                                          |           |
| 24.6 | **External support log** — add entries (who, when, outcome). Stored in `external_support_log` JSON. GET `/api/v1/pastoral/critical-incidents/:id/affected/:personId/support` returns full support log per person.                                         | 200.                                                                                          |           |
| 24.7 | **Link communications** — from the Comms tab, link announcement / inbox thread IDs. `linked_communication_ids` populates.                                                                                                                                 | Links visible.                                                                                |           |
| 24.8 | **Status transitions** — ci_active → managed → resolved → closed. PATCH endpoint. Closure requires closure_notes.                                                                                                                                         | Transitions enforced.                                                                         |           |

---

## 25. Pastoral — SST

**URLs:** `/pastoral/sst`, `/pastoral/sst/:id`

| #    | What to Check                                                                                                                                                                                                                    | Expected                                                          | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 25.1 | **Roster** tab — active SST members. Add/remove members (user + role_description).                                                                                                                                               | CRUD works.                                                       |           |
| 25.2 | **Meetings** list — scheduled/held/cancelled. Filter by status.                                                                                                                                                                  | Tabs + filters.                                                   |           |
| 25.3 | **Schedule meeting** — form with scheduled_at, general_notes. `POST /api/v1/pastoral/sst/meetings`. 201.                                                                                                                         | 201.                                                              |           |
| 25.4 | Meeting detail tabs: Agenda / Attendees / Minutes / Actions. Agenda auto-populated from 6 sources (new_concerns, case_reviews, overdue_actions, early_warning, neps, intervention_reviews) via `pastoral:precompute-agenda` job. | Agenda rendered after worker completes (idempotent within 5 min). |           |
| 25.5 | **Refresh agenda (AI)** — POST `/api/v1/pastoral/sst/meetings/:id/agenda/refresh`. AI-flag gate: pastoral AI flag must be on. Re-runs the precompute job.                                                                        | 202. Status visible. If flag off: 403.                            |           |
| 25.6 | **Add agenda item manually** — free text + link to concern/case/student.                                                                                                                                                         | 201.                                                              |           |
| 25.7 | **Record actions** — for each agenda item, add action with assigned_to + due_date. Worker cron `pastoral:overdue-actions` auto-marks overdue hourly.                                                                             | Actions + overdue detection.                                      |           |
| 25.8 | **Mark meeting held** — attendees list, minutes. PATCH `/api/v1/pastoral/sst/meetings/:id/status`.                                                                                                                               | Status updates.                                                   |           |

---

## 26. Pastoral — check-ins

**URLs:** `/pastoral/checkins`, `/pastoral/checkins/flagged`

| #    | What to Check                                                                                                                                           | Expected                     | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| 26.1 | List shows check-ins with mood_score, freeform_text (if admin/counsellor), flagged badge. Filter by date + flagged.                                     | List renders.                |           |
| 26.2 | **Flagged** view — `/pastoral/checkins/flagged`. Shows check-ins where `flagged=true` AND `auto_concern_id IS NOT NULL`.                                | Only flagged rows.           |           |
| 26.3 | **Escalate a flagged check-in** — POST `/api/v1/pastoral/checkins/:id/escalate`. Creates a pastoral concern linked to the check-in. Status → escalated. | 201.                         |           |
| 26.4 | **Dismiss a flagged check-in** — POST `/api/v1/pastoral/checkins/:id/dismiss` with reason. Flag cleared.                                                | 200.                         |           |
| 26.5 | Settings (admin) — configure check-in frequency, window open/close, question prompts. Check-in configuration endpoint.                                  | Settings persist per tenant. |           |

---

## 27. Pastoral — DSAR review

**URLs:** `/pastoral/dsar`, `/pastoral/dsar/:complianceRequestId`

| #    | What to Check                                                                                                                  | Expected                                   | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | --------- |
| 27.1 | Incoming DSAR list — filtered by status / date / requester. Source data joins `compliance_requests` + `pastoral_dsar_reviews`. | Table renders.                             |           |
| 27.2 | Detail page — per entity (concern/case/intervention), tier, decision (include/redact/withhold), legal_basis, justification.    | All fields editable.                       |           |
| 27.3 | **Save decision** — PATCH `/api/v1/pastoral/dsar-reviews/:id`. Appears in audit.                                               | 200.                                       |           |
| 27.4 | **Stats** — GET `/api/v1/pastoral/dsar-reviews/stats` returns counts by decision, avg review time.                             | Stats card renders.                        |           |
| 27.5 | Tier 3 (CP record) reviews are only visible to users with pastoral.export_tier3 + pastoral.manage_cp_access.                   | Admin in this spec has both → full access. |           |

---

## 28. Pastoral — historical import (CSV)

**URL:** `/pastoral/import`

| #    | What to Check                                                                                                                                          | Expected                                                                               | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------- |
| 28.1 | Upload CSV of historical concerns with columns (student_id, category, severity, tier, occurred_at, narrative, logged_by_email).                        | Upload parses, shows preview + validation errors before commit.                        |           |
| 28.2 | **Dry-run** step shows per-row validation (student not found, email not a staff user, invalid category, etc.).                                         | Errors per row.                                                                        |           |
| 28.3 | **Commit** step fires `POST /api/v1/pastoral/import/commit` with the validated payload. Creates rows with `imported=true` and `import_hash` populated. | 202 (async for large files). Worker enqueues import chain. Status page shows progress. |           |
| 28.4 | **Idempotency** — re-uploading the same CSV (same import_hash values) silently skips duplicates.                                                       | No duplicate rows.                                                                     |           |
| 28.5 | **Audit** — each imported row has a `pastoral_events` audit entry with kind=`concern_created_imported` and the source upload_id.                       | Audit visible.                                                                         |           |

---

## 29. Safeguarding sub-hub `/safeguarding`

**Access:** `safeguarding.dedicated_view` — admin tier only (owner/principal/VP + school_admin per user's logical directive).

| #    | What to Check                                                                                                                                                                                            | Expected                        | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 29.1 | Page header "Safeguarding" + privacy banner (neutral, calm tone) explaining Tier 3 access and audit logging.                                                                                             | Banner visible.                 |           |
| 29.2 | KPI strip: Open concerns / SLA breaches / Critical concerns awaiting ack / Sealed records this year.                                                                                                     | 4 tiles with live counts.       |           |
| 29.3 | Hub tiles: Concerns / My Reports / Sealed records / Break-glass grants / SLA dashboard / Settings.                                                                                                       | 6 tiles.                        |           |
| 29.4 | **SLA breach feed** — scrollable card row of recent SLA breaches with deep links.                                                                                                                        | Renders when ≥ 1 breach exists. |           |
| 29.5 | Quick actions: Report concern / View my reports / Request break-glass / Run after-action review.                                                                                                         | 4 actions.                      |           |
| 29.6 | **ISSUE-24-01 verification** — as `school_principal`, page must NOT show 3× `safeguarding.view` 403 toasts. The migration `20260421000000_wbr_backfill_safeguarding_admin_grants` backfills permissions. | No toast storm. Clean load.     |           |

---

## 30. Safeguarding — concerns

**URLs:** `/safeguarding/concerns`, `/safeguarding/concerns/new`, `/safeguarding/concerns/:id`

### 30.1 List + report

| #      | What to Check                                                                                                                                              | Expected                                                           | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| 30.1.1 | Tabs: All / Open / Under review / Referred / Resolved / Closed. Filters: severity (low/medium/high/critical), SLA status, assigned-to.                     | Tabs + filters.                                                    |           |
| 30.1.2 | Columns: Concern #, Student, Type (physical_abuse/emotional_abuse/sexual_abuse/neglect/other), Severity, Status, SLA countdown, Reported by, Assigned to.  | 8 columns. SLA countdown colour red if within 2h of breach.        |           |
| 30.1.3 | **Report concern** form — student, concern_type, severity, description, immediate_actions_taken, designated_liaison. POST `/api/v1/safeguarding/concerns`. | 201. `concern_number` formatted. In-app notification to DSL fires. |           |
| 30.1.4 | Form reveals "Keyword flagged" banner if freeform text hits a safeguarding keyword (from `safeguarding_keywords`). Severity defaults to `high`.            | Banner renders.                                                    |           |
| 30.1.5 | AI flag gate — if safeguarding AI on, `POST /api/v1/safeguarding/ai-parse` can pre-fill (if shipped). Off → banner.                                        | Flag gate respected.                                               |           |

### 30.2 Detail + actions + referrals

| #       | What to Check                                                                                                                                             | Expected                                                                       | Pass/Fail |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| 30.2.1  | Detail tabs: Overview / Actions / Attachments / Referrals / Seal / Timeline. SLA countdown in header.                                                     | 6 tabs.                                                                        |           |
| 30.2.2  | **Assign concern** — modal with assigned_to user. POST `/api/v1/safeguarding/concerns/:id/assign`. Status may change to under_review.                     | 201. Notifications enqueue.                                                    |           |
| 30.2.3  | **Status transition** — PATCH `/api/v1/safeguarding/concerns/:id/status`. SLA-first-response-met flipped when status leaves `open`.                       | 200. `sla_first_response_met_at` populated.                                    |           |
| 30.2.4  | **Record action** — type (contact_parents/contact_tusla/contact_garda/medical_check/support_offer/safety_plan), description, metadata, due_date.          | `POST /api/v1/safeguarding/concerns/:id/actions`. 201. Actions tab increments. |           |
| 30.2.5  | **TUSLA referral** — form with tusla_reference_number, tusla_outcome, tusla_contact_name + date. POST `/api/v1/safeguarding/concerns/:id/tusla-referral`. | 201. `is_tusla_referral=true`. Audit entry.                                    |           |
| 30.2.6  | **Garda referral** — form with garda_reference_number, garda_referred_at. POST `/api/v1/safeguarding/concerns/:id/garda-referral`.                        | 201. Flags set.                                                                |           |
| 30.2.7  | **Upload attachment** — POST `/api/v1/safeguarding/concerns/:id/attachments`. 202 (async scan). Worker `safeguarding:attachment-scan` fires.              | Upload + scan chain; status flips to `clean` or `flagged`.                     |           |
| 30.2.8  | **Download attachment** — GET `/api/v1/safeguarding/concerns/:id/attachments/:aid/download` → signed S3 URL.                                              | Download works.                                                                |           |
| 30.2.9  | **Generate case file PDF** — POST `/api/v1/safeguarding/concerns/:id/case-file`. Full PDF with all actions, referrals, attachments list.                  | PDF downloaded.                                                                |           |
| 30.2.10 | **Generate redacted case file** — POST `/api/v1/safeguarding/concerns/:id/case-file/redacted`. Student name redacted, attachments omitted.                | Redacted PDF.                                                                  |           |
| 30.2.11 | **Dashboard** — `GET /api/v1/safeguarding/dashboard` returns analytics (open counts, severity mix, SLA breach stats).                                     | Dashboard tiles render.                                                        |           |

### 30.3 SLA check chain

| #      | What to Check                                                                                                                                                                   | Expected                                                 | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 30.3.1 | Create a concern at 09:00, do not respond. At 15:00 (SLA 6h e.g.), `safeguarding:sla-check` job runs and creates a behaviour_task for the assignee + in-app/email notification. | Task appears in /behaviour/tasks with reason=SLA breach. |           |
| 30.3.2 | The concern's row in the list now shows "SLA BREACHED" badge + countdown shows negative.                                                                                        | Badge visible.                                           |           |

---

## 31. Safeguarding — seal workflow

**Dual-control:** `safeguarding.seal` — owner + principal (or two admins that both hold the permission per logical directive). VP does NOT seal.

| #    | What to Check                                                                                                                                                                | Expected                                                                       | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| 31.1 | From a resolved concern, click **Initiate Seal** → form with reason, retention_until, scope. POST `/api/v1/safeguarding/concerns/:id/seal/initiate`. Creates a pending seal. | 201. Seal-status badge "Pending approval".                                     |           |
| 31.2 | Switch to the **second admin** browser session. Navigate to the same concern → **Approve seal** → POST `/api/v1/safeguarding/concerns/:id/seal/approve`.                     | 201. Concern's `sealed_at` + `sealed_by_id` + `seal_approved_by_id` populated. |           |
| 31.3 | Concern disappears from the default list and appears in `/safeguarding/sealed`. Opening it shows a minimal read-only summary (no attachments, no narrative).                 | Content locked.                                                                |           |
| 31.4 | Attempt to mutate a sealed concern (edit, record action). API returns 403 `CONCERN_SEALED`.                                                                                  | Immutable.                                                                     |           |
| 31.5 | **Seal-status** — `GET /api/v1/safeguarding/concerns/:id/seal-status` returns the full seal metadata.                                                                        | Payload correct.                                                               |           |
| 31.6 | **Reject seal** — before approval, the second admin can POST `/api/v1/safeguarding/concerns/:id/seal/reject` with reason. Seal pending state cleared.                        | 201.                                                                           |           |
| 31.7 | Attempt to seal as the **same** admin who initiated (no dual-control met) → 403 `SEAL_REQUIRES_DUAL_CONTROL`.                                                                | Blocked.                                                                       |           |
| 31.8 | Sealed concerns are visible in the dedicated `/safeguarding/sealed` archive only; no cross-link leaks to normal list filters.                                                | Archive-only access.                                                           |           |

---

## 32. Safeguarding — break-glass

**URLs:** `/safeguarding/break-glass`, `/safeguarding/break-glass/:id`

| #    | What to Check                                                                                                                                                                                   | Expected                       | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 32.1 | List shows active + expired grants. Columns: Granted to, Reason, Scope, Granted by, Granted at, Expires at, Revoked at, After-action review status.                                             | 8 columns.                     |           |
| 32.2 | **Grant break-glass** — form with granted_to user, reason, scope (all_concerns vs scoped_concern_ids), expires_at (max 72h per UI UX default). POST `/api/v1/safeguarding/break-glass`.         | 201. Audit entry.              |           |
| 32.3 | Granted user can now access a previously-sealed concern. Each access creates an audit log entry (grant detail shows the access-log).                                                            | Access audited.                |           |
| 32.4 | **Access log** — `GET /api/v1/safeguarding/break-glass/:id/access-log` returns every access event (timestamp, endpoint, ip).                                                                    | 200 + payload.                 |           |
| 32.5 | **Revoke grant** — PATCH (or DELETE) fires. `revoked_at` populated. Granted user loses access immediately.                                                                                      | Access revoked.                |           |
| 32.6 | **Expiry** — when `expires_at < now()`, grant is auto-revoked by worker cron `behaviour:break-glass-expiry` (daily). A behaviour_task `break_glass_review` is enqueued for after-action review. | Auto-revocation + review task. |           |
| 32.7 | **After-action review** — on the granted record, complete review via POST `/api/v1/safeguarding/break-glass/:id/review`. Fields: notes, appropriate_use boolean.                                | 201.                           |           |

---

## 33. Safeguarding — SLA / sealed / reviews

| #    | What to Check                                                                                                                                                   | Expected                       | Pass/Fail |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| 33.1 | `/safeguarding/sla` — dashboard shows: first-response target (e.g. 4h), completion target (e.g. 5 days), open concerns with countdown, breach count this month. | Dashboard tiles + trend chart. |           |
| 33.2 | Drill-down — click a tile → filtered list.                                                                                                                      | Filter sync.                   |           |
| 33.3 | `/safeguarding/sealed` — archive of sealed concerns. Minimal read-only info.                                                                                    | Archive renders.               |           |
| 33.4 | `/safeguarding/reviews` — after-action reviews queue. For each resolved or break-glass grant, can schedule/run AAR.                                             | Queue renders.                 |           |
| 33.5 | `/safeguarding/my-reports` — personal list filtered by `reported_by=<currentUser>`. `GET /api/v1/safeguarding/my-reports`.                                      | List renders.                  |           |

---

## 34. Early warnings sub-hub `/early-warnings`

| #    | What to Check                                                                                                                                                                                      | Expected                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 34.1 | KPI strip: **Students at amber**, **Students at red**, **New flags this week**, **Interventions triggered this week**. All sourced from `GET /api/v1/early-warnings?page=1&pageSize=100`.          | 4 tiles.                                                                     |           |
| 34.2 | At-risk student list — table with Name, Year group, Tier (amber/red/critical), Dominant indicator (attendance / grades / behaviour / wellbeing / engagement), Last reviewed, Assigned staff.       | Table renders. Sort by tier.                                                 |           |
| 34.3 | Click a student row → side panel with domain drill-down: attendance rate, grade trend, behaviour point trend, check-in mood trend, engagement flag count.                                          | Panel renders 5 domains.                                                     |           |
| 34.4 | **AI narrative** — for admin with early-warning AI flag on, a textual summary appears: "Of the 14 amber students this week, 9 are concentrated in Year 5; dominant indicator is attendance < 85%." | Flag-gated. Deterministic heuristic fallback if LLM not wired (per PLAN §8). |           |
| 34.5 | **Acknowledge** button on a profile → POST `/api/v1/early-warnings/:studentId/acknowledge`.                                                                                                        | 204. Profile's acknowledged timestamp set.                                   |           |
| 34.6 | **Assign** — POST `/api/v1/early-warnings/:studentId/assign` with assigned_staff_id.                                                                                                               | 201. Notifications enqueue (`pastoral:notify-concern` chain).                |           |
| 34.7 | **Polish verification (ISSUE-24-02)** — `/early-warnings` must not 500 on `prisma.pastoralIntervention.findMany({status:'active'})`. The fix maps 'active' → 'pc_active'.                          | No 500.                                                                      |           |

---

## 35. Early warnings — cohort + intervene + settings

| #    | What to Check                                                                                                                               | Expected              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 35.1 | `/early-warnings/cohort` — heatmap (year_group rows × domain columns). Each cell shows count of amber/red students.                         | Heatmap renders.      |           |
| 35.2 | Filter by academic period. Click a cell → drills into that cohort.                                                                          | Drill works.          |           |
| 35.3 | Trend over time (line chart) — weekly counts of amber/red for last 12 weeks.                                                                | Chart renders.        |           |
| 35.4 | `/early-warnings/intervene` — quick-create interventions from flagged students. Links to `/pastoral/interventions/new?studentId=X`.         | Links pre-fill form.  |           |
| 35.5 | `/early-warnings/settings` — sliders for domain weighting, tier threshold inputs, enable/disable. Save PUT `/api/v1/early-warnings/config`. | 200. Config persists. |           |

---

## 36. Staff wellbeing folded sub-hub `/wellbeing/staff`

The old five sub-routes (dashboard, my-workload, surveys, reports, resources) are folded into one page with anchored sections. Legacy routes redirect with hash anchors.

| #    | What to Check                                                                                                                                                                                   | Expected                                                                               | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 36.1 | Page header "Staff Wellbeing" + internal nav (in-page anchors or nav cards): My Workload / Aggregate Dashboard / Surveys & Responses / Board Report / Resources.                                | 5 sections. URL hashes `#my`, `#aggregate`, `#surveys`, `#board-report`, `#resources`. |           |
| 36.2 | **ISSUE-24-04 verification** — for non-teaching admin (owner/principal without staff_profile), the My Workload section renders a friendly "No teaching profile" empty state, not 3× 404 toasts. | Clean empty state. (Fix: `MyWorkloadSection` catches `STAFF_PROFILE_NOT_FOUND`.)       |           |
| 36.3 | Legacy routes redirect: `/wellbeing/dashboard` → `/wellbeing/staff#aggregate`; `/wellbeing/my-workload` → `#my`; `/wellbeing/reports` → `#board-report`; `/wellbeing/resources` → `#resources`. | All redirects honoured.                                                                |           |
| 36.4 | KPIs at the top: avg teaching load, cover fairness Gini, timetable quality, substitution pressure (cross-module values sourced from scheduling / staff metrics).                                | 4 tiles.                                                                               |           |

---

## 37. Staff wellbeing — surveys

### 37.1 Admin survey management

| #      | What to Check                                                                                                                                                                                 | Expected                                      | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 37.1.1 | `/wellbeing/surveys` lists surveys. Columns: Title, Status (draft/active/closed/archived), Frequency, Window open/close, Min response threshold, Dept drill-down threshold. Filter by status. | List renders.                                 |           |
| 37.1.2 | **Create survey** — POST `/api/v1/staff-wellbeing/surveys`. Multi-step wizard (metadata, questions builder, preview). Questions can be likert / text / multiple_choice / nps.                 | 201.                                          |           |
| 37.1.3 | **Clone survey** — POST `/api/v1/staff-wellbeing/surveys/:id/clone`. New survey in draft.                                                                                                     | 201.                                          |           |
| 37.1.4 | **Activate** — POST `/api/v1/staff-wellbeing/surveys/:id/activate`. Status → active. `wellbeing:survey-open-notify` job enqueues for all active members.                                      | 201. Notifications visible in member inboxes. |           |
| 37.1.5 | **Close** — POST `/api/v1/staff-wellbeing/surveys/:id/close`. Status → closed. `results_released` flag can be toggled separately.                                                             | 201.                                          |           |

### 37.2 Survey detail + results

| #      | What to Check                                                                                                                                                                                                          | Expected                        | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 37.2.1 | `/wellbeing/surveys/:id` — detail. Tabs: Overview / Questions / Results / Moderation.                                                                                                                                  | 4 tabs.                         |           |
| 37.2.2 | **Results** — aggregate charts per question. Only visible if `results_released=true` AND response count ≥ `min_response_threshold`. Department drill-down only if dept group size ≥ `dept_drill_down_threshold`.       | Privacy thresholds respected.   |           |
| 37.2.3 | **Moderation** — list of flagged responses (with moderation_status=flagged). Admin can approve / reject / redact. POST `/api/v1/staff-wellbeing/surveys/:id/moderate` per response.                                    | Moderation actions persist.     |           |
| 37.2.4 | **Anonymity invariant** — results never show respondent user_id. Raw `survey_responses` rows have NO `tenant_id` and NO user identifier. Test via SQL: `SELECT * FROM survey_responses LIMIT 1` — no identity columns. | Columns confirmed missing.      |           |
| 37.2.5 | **Moderation scan** — worker `wellbeing:moderation-scan` flags identifying content (names, rooms, subjects). Flagged rows appear in moderation tab.                                                                    | Worker chain runs correctly.    |           |
| 37.2.6 | Survey participation page `/wellbeing/survey` — admin can participate via anonymous token. Submit POST `/api/v1/staff-wellbeing/respond/:surveyId`. Response persisted without user linkage.                           | 201. No impersonation possible. |           |
| 37.2.7 | Token cleanup cron `wellbeing:cleanup-participation-tokens` (daily 05:00 UTC) deletes tokens for surveys closed > 7 days.                                                                                              | Tokens purged.                  |           |

---

## 38. Staff wellbeing — aggregate + board report + resources

| #    | What to Check                                                                                                                                                 | Expected                                        | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| 38.1 | Aggregate section — teaching load histogram, cover fairness Gini, substitution pressure per dept, survey satisfaction index (if a survey is active+released). | Charts render.                                  |           |
| 38.2 | `wellbeing:workload-metrics` cron (daily 03:30 UTC) pre-computes aggregates; cached in Redis 24h TTL. First load hits cache; manual refresh forces recompute. | Cache behaviour correct.                        |           |
| 38.3 | **Board report** section — configurable (term range, sections to include). Generate → PDF via worker. Audit trail in audit_log.                               | PDF generated.                                  |           |
| 38.4 | **Resources** — EAP details, training docs, external referral contacts. Admin can edit via PATCH `/api/v1/staff-wellbeing/resources`.                         | CRUD works. `wellbeing.manage_resources` gated. |           |
| 38.5 | **EAP staleness** — worker `wellbeing:eap-refresh-check` (daily 06:00 UTC) notifies managers when EAP details > 90 days old.                                  | Notification appears.                           |           |

---

## 39. Settings — behaviour

**URLs:** `/settings/behaviour-general`, `/settings/behaviour-categories`, `/settings/behaviour-policies`, `/settings/behaviour-houses`, `/settings/behaviour-awards`, `/settings/behaviour-documents`, `/settings/behaviour-admin`

| #    | What to Check                                                                                                                                                                                            | Expected                                    | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| 39.1 | **General** — point scales per severity, approval workflow thresholds, parent-visible-by-default toggle, auto-pastoral-concern threshold.                                                                | Save works. New incidents inherit settings. |           |
| 39.2 | **Categories** — CRUD on behaviour_categories. Add custom category (non-system). Bulk activate/deactivate. Cannot delete system categories (is_system=true).                                             | Correct enforcement. Arabic name required.  |           |
| 39.3 | **Policies** — rule editor with conditions + actions. Version control visible (each save creates `behaviour_policy_rule_versions` row). Dry-run + replay shortcuts link to `/behaviour/policies/replay`. | CRUD + versioning.                          |           |
| 39.4 | **Houses** — CRUD on house teams. Icon/colour picker. Deactivating doesn't delete memberships.                                                                                                           | CRUD works.                                 |           |
| 39.5 | **Awards** — CRUD on award types. Configure tier hierarchy (gold supersedes silver supersedes bronze). Points thresholds + repeat rules.                                                                 | Hierarchy enforced.                         |           |
| 39.6 | **Documents** — CRUD on templates. Merge field picker. Locale selector (en/ar). Preview renders with sample data.                                                                                        | Preview + save.                             |           |
| 39.7 | **Admin** — user role assignments scope (who gets `behaviour.admin`), approval workflow rules, escalation chain config.                                                                                  | Admin settings persist.                     |           |

---

## 40. Settings — safeguarding + keywords

**URLs:** `/settings/safeguarding`, `/settings/communications/safeguarding`

| #    | What to Check                                                                                                                                    | Expected                  | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | --------- |
| 40.1 | SLA targets — first-response hours, completion days. Save applies to new concerns; existing in-flight concerns keep their snapshot targets.      | Settings apply correctly. |           |
| 40.2 | Alert thresholds — "3 keyword hits in 1 day triggers critical escalation".                                                                       | Config saves.             |           |
| 40.3 | Designated safeguarding lead selector — picks a user. All safeguarding concerns auto-assign to this user on create (if not explicitly assigned). | DSL selection respected.  |           |
| 40.4 | External agency contacts — TUSLA, Garda, HSE. Used in referral pre-fill.                                                                         | Contacts persist.         |           |
| 40.5 | `/settings/communications/safeguarding` — keyword list CRUD. Test interface: paste a message, see which keywords match.                          | CRUD + test interface.    |           |
| 40.6 | Active keywords feed into `safeguarding:message-scan` worker which flags inbox messages triggering a safeguarding concern.                       | Worker chain links.       |           |

---

## 41. Settings — AI flags

**URL:** `/settings/ai-flags`

| #    | What to Check                                                                                                                                      | Expected         | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 41.1 | Page lists module keys (behaviour, pastoral, staff_wellbeing, early_warning). Each shows a toggle + last-updated timestamp + last-updated-by user. | Table renders.   |           |
| 41.2 | **Toggle** → PATCH `/api/v1/ai-flags/:moduleKey {enabled: true}`. Optimistic UI. 200.                                                              | Row updates.     |           |
| 41.3 | After enabling behaviour flag, navigate to `/behaviour/analytics/ai` → page works. Disable → banner reappears.                                     | Flag propagates. |           |
| 41.4 | `ai_flag.manage` required. For admin with full access this is satisfied. A non-admin accessing the page gets 403.                                  | Gate enforced.   |           |
| 41.5 | `GET /api/v1/ai-flags` returns all flags for the tenant.                                                                                           | 200 + list.      |           |

---

## 42. Settings — wellbeing notification channels

| #    | What to Check                                                                                                                                                            | Expected                                                                            | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 42.1 | Navigate to the notification-channels page (Settings → Communications → Wellbeing, or a dedicated `/settings/wellbeing-notifications`).                                  | Page renders.                                                                       |           |
| 42.2 | Tenant-wide defaults — toggles for email / sms / whatsapp (in-app always on, greyed out).                                                                                | UI visible.                                                                         |           |
| 42.3 | Per-event overrides — event keys like `incident.logged`, `sanction.served`, `sla.breach`, etc. Each event can override defaults.                                         | Overrides save into `tenant_notification_preferences.wellbeing_channels.overrides`. |           |
| 42.4 | Save → PATCH endpoint. JSONB structure matches PLAN §3d.                                                                                                                 | 200. Shape matches.                                                                 |           |
| 42.5 | Providers not yet wired — toggling `email=true` but the dispatcher logs `PROVIDER_NOT_WIRED`. UI should surface a "Provider pending wiring" hint for admin transparency. | Hint visible (flag as observation if missing).                                      |           |

---

## 43. Platform admin — security incidents

**URLs:** `/admin/security-incidents`, `/admin/security-incidents/:id`
**Access:** `PlatformOwnerGuard` — platform-owner only. School admin sees 403.

| #    | What to Check                                                                                                                                            | Expected       | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 43.1 | Sign in as platform_owner. Navigate to `/admin/security-incidents`. List multi-tenant security incidents with school filter, type, severity, date range. | Table renders. |           |
| 43.2 | **Create incident** — POST `/api/v1/admin/security-incidents`. Fields: affected_tenants, type, severity, description, discovered_at.                     | 201.           |           |
| 43.3 | **Add event** — timeline entry (who, what, when). POST `/api/v1/admin/security-incidents/:id/events`.                                                    | 201.           |           |
| 43.4 | **Notify controllers** — POST `/api/v1/admin/security-incidents/:id/notify-controllers` — external notification to affected tenant admins.               | 201.           |           |
| 43.5 | **Notify DPC** — POST `/api/v1/admin/security-incidents/:id/notify-dpc` (GDPR Data Protection Commission).                                               | 201.           |           |
| 43.6 | Sign in as school_principal and attempt to reach `/admin/security-incidents` → 403 or redirect to `/dashboard`.                                          | Blocked.       |           |

---

## 44. Arabic / RTL walkthrough

Run the key flows from §3 through §43 again at `/ar/*`. Assert:

| #    | What to Check                                                                                                                                                                                                                                                                    | Expected                                      | Pass/Fail |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------- |
| 44.1 | `<html dir="rtl">` on any `/ar/*` route.                                                                                                                                                                                                                                         | RTL active globally.                          |           |
| 44.2 | Morph bar mirrors: Wellbeing pill on the right, hub icons flipped via `rtl:rotate-180` utility, chevrons reversed.                                                                                                                                                               | Mirrored.                                     |           |
| 44.3 | KPI tiles + hub cards mirror correctly. Icons use `rtl:rotate-180` only where directional (ArrowRight, ChevronRight).                                                                                                                                                            | Correct mirroring.                            |           |
| 44.4 | No physical-direction classes sneak in. Grep the rendered HTML for `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` classes. **Zero** on school-facing routes.                                                                                           | Zero matches.                                 |           |
| 44.5 | Western numerals (0-9) in both locales. Gregorian dates.                                                                                                                                                                                                                         | Digits 0-9 visible; no Eastern Arabic digits. |           |
| 44.6 | All translation keys resolve. No missing-translation warnings in console (`MISSING_MESSAGE:` strings). Key namespaces: `wellbeingHub.*`, `behaviourHub.*`, `behaviour.*`, `pastoral.*`, `safeguardingHub.*`, `earlyWarnings.*`, `wellbeingStaff.*`, all present in both en + ar. | Zero missing messages.                        |           |
| 44.7 | Freeform text fields accept Arabic input (Arabic incident descriptions, pastoral narratives, concern reports). Read back stays Arabic.                                                                                                                                           | Input + read-back in Arabic.                  |           |
| 44.8 | Email addresses, URLs, phone numbers, enrolment IDs render LTR regardless of page direction (via `.ltr-text` or inline `dir="ltr"`).                                                                                                                                             | LTR enforcement on these fields.              |           |

---

## 45. Mobile walkthrough (375×812)

Run the super-hub, behaviour, pastoral, safeguarding, early-warnings, and settings flows at 375px. Assert:

| #    | What to Check                                                                                                                                               | Expected                                                                   | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 45.1 | No horizontal scroll on any page at 375px. Body `overflow-x: hidden` where needed; content uses `min-w-0` pattern.                                          | Body width == viewport. `document.body.scrollWidth === window.innerWidth`. |           |
| 45.2 | Morph bar collapses to a hamburger + Wellbeing label. Tapping hamburger opens overlay drawer.                                                               | Overlay renders.                                                           |           |
| 45.3 | Super-hub cards stack to 1 column. KPI strip becomes 2×2 grid.                                                                                              | Grid stacks.                                                               |           |
| 45.4 | Incidents list — table collapses to stacked cards with primary fields visible, actions in a kebab. Or table with `overflow-x-auto` and sticky first column. | One of the two responsive patterns.                                        |           |
| 45.5 | Forms stack fields full-width. Input font-size ≥ 16px (no iOS auto-zoom).                                                                                   | Verified via computed style.                                               |           |
| 45.6 | Every interactive element ≥ 44×44px.                                                                                                                        | Verified via DOM measure of primary buttons.                               |           |
| 45.7 | Modal dialogs (edit incident, seal initiate, break-glass grant) scroll internally and are dismissible via an `×` button and backdrop tap.                   | All modals usable.                                                         |           |
| 45.8 | Recharts charts on analytics pages collapse to mobile-height (~240px) with legend below.                                                                    | Charts legible.                                                            |           |

---

## 46. Cross-tenant hostile checks (UI-visible)

Admin in Tenant A deliberately tests UI paths against Tenant B resources.

| #    | What to Check                                                                                                       | Expected                                                                 | Pass/Fail |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| 46.1 | Navigate to `/en/behaviour/incidents/{tenantB_incident_id}` while signed in as Tenant A owner.                      | 404 page ("Incident not found"). Tenant B data NOT in the response body. |           |
| 46.2 | `/en/pastoral/cases/{tenantB_case_id}` — 404.                                                                       | 404.                                                                     |           |
| 46.3 | `/en/safeguarding/concerns/{tenantB_concern_id}` — 404.                                                             | 404.                                                                     |           |
| 46.4 | `/en/early-warnings/{tenantB_student_id}` — 404.                                                                    | 404.                                                                     |           |
| 46.5 | Attempt to seal a Tenant B concern — POST directly to API with Tenant A JWT — 404.                                  | No Tenant B mutation.                                                    |           |
| 46.6 | Global search bar: type a Tenant B student's name. Zero matches.                                                    | Search scoped correctly.                                                 |           |
| 46.7 | Attempt `GET /api/v1/wellbeing/dashboard-summary` → payload contains only Tenant A numbers; Tenant B not reachable. | Counts reflect Tenant A.                                                 |           |

---

## 47. Backend endpoint map

This spec exercises the following endpoint groups. Full per-endpoint contract testing lives in the integration spec. Cells below are summary rows.

| Module                                                                                 | Endpoints exercised in this spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Notes   |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Wellbeing aggregate                                                                    | `GET /v1/wellbeing/dashboard-summary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | §4      |
| AI flags                                                                               | `GET /v1/ai-flags`, `PATCH /v1/ai-flags/:moduleKey`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §41     |
| Behaviour incidents                                                                    | `POST /incidents`, `POST /incidents/quick`, `GET /incidents`, `GET /incidents/my`, `GET /incidents/stats`, `GET /incidents/:id`, `PATCH /incidents/:id`, `PATCH /incidents/:id/status`, `POST /incidents/:id/withdraw`, `POST /incidents/:id/follow-up`, `POST /incidents/:id/participants`, `DELETE /incidents/:id/participants/:pid`, `POST /incidents/:id/attachments`, `GET /incidents/:id/attachments`, `GET /incidents/:id/attachments/:aid`, `GET /incidents/:id/history`, `GET /incidents/:id/policy-evaluation`, `POST /incidents/ai-parse`, `GET /students/:id/ai-summary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §6, §18 |
| Behaviour sanctions                                                                    | `POST /sanctions`, `GET /sanctions`, `GET /sanctions/today`, `GET /sanctions/my-supervision`, `GET /sanctions/calendar`, `GET /sanctions/active-suspensions`, `GET /sanctions/returning-soon`, `POST /sanctions/bulk-mark-served`, `GET /sanctions/:id`, `PATCH /sanctions/:id`, `PATCH /sanctions/:id/status`, `POST /sanctions/:id/parent-meeting`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §7      |
| Behaviour exclusions                                                                   | `POST /exclusion-cases`, `GET /exclusion-cases`, `GET /exclusion-cases/:id`, `PATCH /exclusion-cases/:id`, `PATCH /exclusion-cases/:id/status`, `POST /exclusion-cases/:id/generate-notice`, `POST /exclusion-cases/:id/generate-board-pack`, `POST /exclusion-cases/:id/record-decision`, `POST /exclusion-cases/:id/issue-notice`, `POST /exclusion-cases/:id/schedule-hearing`, `POST /exclusion-cases/:id/record-hearing`, `POST /exclusion-cases/:id/finalise`, `POST /exclusion-cases/:id/overturn`, `GET /exclusion-cases/:id/timeline`, `GET /exclusion-cases/:id/documents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §8      |
| Behaviour appeals                                                                      | `POST /appeals`, `GET /appeals`, `GET /appeals/:id`, `PATCH /appeals/:id`, `POST /appeals/:id/decide`, `POST /appeals/:id/withdraw`, `POST /appeals/:id/attachments`, `GET /appeals/:id/attachments`, `POST /appeals/:id/generate-decision-letter`, `GET /appeals/:id/evidence-bundle`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | §9      |
| Behaviour recognition                                                                  | `GET /recognition`, `GET /recognition/wall`, `GET /recognition/leaderboard`, `GET /recognition/houses`, `GET /recognition/houses/:id`, `POST /recognition/awards`, `GET /recognition/awards`, `POST /recognition/publications`, `GET /recognition/publications/:id`, `PATCH /recognition/publications/:id/approve`, `PATCH /recognition/publications/:id/reject`, `GET /recognition/public/feed`, `POST /recognition/houses/bulk-assign`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §10     |
| Behaviour documents                                                                    | `POST /documents/generate`, `GET /documents`, `GET /documents/templates`, `GET /documents/templates/:id`, `GET /documents/:id`, `PATCH /documents/:id/finalise`, `POST /documents/:id/send`, `GET /documents/:id/download`, `GET /documents/:id/preview`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | §11     |
| Behaviour tasks/alerts/amendments                                                      | `/behaviour/tasks/*`, `/behaviour/alerts/*`, `/behaviour/amendments/*`, `POST /behaviour/amendments/:id/send-correction`, `/behaviour/acknowledgements/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §12     |
| Behaviour guardian restrictions / interventions / analytics / policies / admin         | `/behaviour/guardian-restrictions/*`, `/behaviour/interventions/*`, `/behaviour/analytics/*`, `/behaviour/analytics/ai/*`, `/behaviour/policies/replay/*`, `/behaviour/admin/*`, `/behaviour/admin/legal-holds/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §13–§17 |
| Pastoral concerns                                                                      | `POST /pastoral/concerns`, `GET /pastoral/concerns`, `GET /pastoral/concerns/:id`, `PATCH /pastoral/concerns/:id`, `POST /pastoral/concerns/:id/escalate`, `POST /pastoral/concerns/:id/share-with-parent`, `PATCH /pastoral/concerns/:id/narrative`, `GET /pastoral/concerns/:id/events`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §20     |
| Pastoral cases / interventions / referrals / critical / SST / checkins / DSAR / import | `/pastoral/cases/*`, `/pastoral/interventions/*`, `/pastoral/referrals/*`, `/pastoral/neps-visits/*`, `/pastoral/critical-incidents/*`, `/pastoral/sst/*`, `/pastoral/checkins/*`, `/pastoral/dsar-reviews/*`, `/pastoral/import/*`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §21–§28 |
| Safeguarding                                                                           | `POST /safeguarding/concerns`, `GET /safeguarding/my-reports`, `GET /safeguarding/concerns`, `GET /safeguarding/concerns/:id`, `PATCH /safeguarding/concerns/:id`, `PATCH /safeguarding/concerns/:id/status`, `POST /safeguarding/concerns/:id/assign`, `POST /safeguarding/concerns/:id/actions`, `GET /safeguarding/concerns/:id/actions`, `POST /safeguarding/concerns/:id/tusla-referral`, `POST /safeguarding/concerns/:id/garda-referral`, `POST /safeguarding/concerns/:id/attachments`, `GET /safeguarding/concerns/:id/attachments/:aid/download`, `POST /safeguarding/concerns/:id/case-file`, `POST /safeguarding/concerns/:id/case-file/redacted`, `POST /safeguarding/concerns/:id/seal/initiate`, `POST /safeguarding/concerns/:id/seal/approve`, `POST /safeguarding/concerns/:id/seal/reject`, `GET /safeguarding/concerns/:id/seal-status`, `POST /safeguarding/break-glass`, `GET /safeguarding/break-glass`, `GET /safeguarding/break-glass/:id`, `GET /safeguarding/break-glass/:id/access-log`, `POST /safeguarding/break-glass/:id/review`, `GET /safeguarding/dashboard` | §29–§33 |
| Early warning                                                                          | `GET /early-warnings`, `GET /early-warnings/summary`, `GET /early-warnings/cohort`, `GET /early-warnings/config`, `PUT /early-warnings/config`, `GET /early-warnings/:studentId`, `POST /early-warnings/:studentId/acknowledge`, `POST /early-warnings/:studentId/assign`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §34–§35 |
| Staff wellbeing                                                                        | `POST /staff-wellbeing/surveys`, `GET /staff-wellbeing/surveys`, `GET /staff-wellbeing/surveys/:id`, `PATCH /staff-wellbeing/surveys/:id`, `POST /staff-wellbeing/surveys/:id/clone`, `POST /staff-wellbeing/surveys/:id/activate`, `POST /staff-wellbeing/surveys/:id/close`, `POST /staff-wellbeing/respond/:surveyId`, `GET /staff-wellbeing/respond/active`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | §37     |
| Security incidents (platform)                                                          | `GET /admin/security-incidents`, `POST /admin/security-incidents`, `GET /admin/security-incidents/:id`, `PATCH /admin/security-incidents/:id`, `POST /admin/security-incidents/:id/events`, `POST /admin/security-incidents/:id/notify-controllers`, `POST /admin/security-incidents/:id/notify-dpc`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §43     |

---

## 48. DevTools console & network health

Across the full walkthrough:

| #    | What to Check                                                                                                                                                                 | Expected                           | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 48.1 | Zero `error` or `warn` severity console entries across all 45+ exercised pages. No `Missing key:`, no React warnings (missing key, key prop), no uncaught promise rejections. | Console clean.                     |           |
| 48.2 | Every API response is `200`/`201`/`202`/`204` on the happy path. No `500`. A few `401/403/404` are expected on negative rows; `400` expected on Zod violations.               | Error classes as expected per row. |           |
| 48.3 | No PII in URLs. Student names, incident narratives never appear as query-string values.                                                                                       | URL hygiene.                       |           |
| 48.4 | Every `application/json` response has the structured `{data, meta}` (list) or `{…}` (object) shape. No bare arrays.                                                           | Shape consistent.                  |           |
| 48.5 | Error responses use `{error: {code, message}}` shape.                                                                                                                         | Shape consistent.                  |           |
| 48.6 | No ad-hoc polling loop > 30s frequency. Check Network for repeating requests.                                                                                                 | No polling abuse.                  |           |

---

## 49. Data invariants — post-conditions per flow

After running the key flows above, assert:

| #     | What to run (SQL)                                                                                                                                                                      | Expected                                                  | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 49.1  | After §6.2 incident creation: `SELECT status FROM behaviour_incidents WHERE id = <new>`                                                                                                | `submitted` (or `draft` if workflow requires approval).   |           |
| 49.2  | After §7.2 mark-served: `SELECT status, served_at FROM behaviour_sanctions WHERE id = <x>`                                                                                             | `served` + timestamp.                                     |           |
| 49.3  | After §8 exclusion finalise: `SELECT status, decision FROM behaviour_exclusion_cases WHERE id = <x>`                                                                                   | `implemented` + `upheld` (or recorded decision).          |           |
| 49.4  | After §20.2.4 concern escalate: `SELECT tier FROM pastoral_concerns WHERE id = <x>`                                                                                                    | New tier value; `pastoral_events` has an `escalated` row. |           |
| 49.5  | After §31 seal approve: `SELECT sealed_at, sealed_by_id, seal_approved_by_id FROM safeguarding_concerns WHERE id = <x>`                                                                | All three set to distinct admin ids.                      |           |
| 49.6  | After §32.6 break-glass expiry cron: `SELECT revoked_at FROM safeguarding_break_glass_grants WHERE id = <x>`                                                                           | `revoked_at` populated (auto-revocation).                 |           |
| 49.7  | After §37 activate survey: `SELECT status FROM staff_surveys WHERE id = <x>` and a `wellbeing:survey-open-notify` job visible in Redis `bull:wellbeing:*`.                             | `active` + job enqueued.                                  |           |
| 49.8  | After any worker chain (§20.3, §32): `SELECT COUNT(*) FROM pastoral_events WHERE tenant_id = <A>` increased by the expected number of audit entries.                                   | Audit count matches flow.                                 |           |
| 49.9  | Zero cross-tenant leakage: `SELECT COUNT(*) FROM behaviour_incidents WHERE tenant_id = <A> AND id IN (<list of Tenant B incident ids>)` = 0.                                           | Zero.                                                     |           |
| 49.10 | All wellbeing umbrella tables force RLS: `SELECT relname FROM pg_class WHERE relname = ANY($1) AND relrowsecurity=true AND relforcerowsecurity=true` = 54.                             | 54.                                                       |           |
| 49.11 | Anonymous survey responses have no identity: `SELECT column_name FROM information_schema.columns WHERE table_name='survey_responses' AND column_name IN ('tenant_id','user_id')` = 0.  | 0 rows (confirms anonymity invariant).                    |           |
| 49.12 | Sequences are per-tenant: `SELECT current_value FROM tenant_sequences WHERE tenant_id=<A> AND sequence_type='behaviour_incident_number'` — monotonically increasing, unique in A only. | Monotonic; not reset by Tenant B activity.                |           |

---

## 50. Observations spotted during the walkthrough

Log anything the tester notices that is not a hard Fail but warrants follow-up. Seed list (populate during execution):

- **O-1** — Module-flag hard-hide on hub tiles is deferred (PLAN §8). Admin sees tiles with count=0 when a module is off. Confirm still intended, or raise product decision.
- **O-2** — EAP-staleness cron (`wellbeing:eap-refresh-check`) runs daily 06:00 UTC even for tenants with no EAP configured (emits warning log). Worth tightening to skip unconfigured tenants.
- **O-3** — `pastoral_interventions.status` enum uses `pc_active`/`pc_pending`/`pc_overdue`/`pc_completed`/`pc_ceased` prefixes due to a historic Prisma `@map` collision (DZ-Wellbeing-1). UI translations map back to user-facing labels. If a new status is added, the map MUST be updated in both places.
- **O-4** — Break-glass grant's `after_action_review_required` defaults to true but the UI does not prominently remind the grantor; the review can be missed if the grant expires without a reviewer assigned. Consider a staleness dashboard row.
- **O-5** — SST meeting agenda pre-compute (`pastoral:precompute-agenda`) has 5-minute idempotency — manual refresh < 5 min no-ops silently. Worth surfacing "Last refreshed Xm ago" on the UI.
- **O-6** — AI-flag-off banners link to `/settings/ai-flags` but non-admin staff lack `ai_flag.manage` and land on a 403 page. Banner should check the viewer's permission before rendering the link.
- **O-7** — `safeguarding_break_glass_access_log` is today projected from `safeguarding_actions` (PLAN §8 deferred). The UI shows a merged view; dedicated table is planned.
- **O-8** — No dedicated `admin_repair_runs` table — uses BullMQ job IDs. Long-term the admin console's "Data repair" tab should have its own state table.

---

## 51. Sign-off

| Reviewer | Date | Pass / Fail | Notes |
| -------- | ---- | ----------- | ----- |
|          |      |             |       |
|          |      |             |       |
|          |      |             |       |

**This spec is release-ready for the admin tier when every row above is Pass (or explicitly `(info)`), zero console errors, zero `500` on happy-path, and §49 data invariants all hold. Companion specs (`teacher_view`, `parent_view`, `student_view`, `integration`, `worker`, `perf`, `security`) must likewise be Pass before the full `/e2e-full` pack is signed off.**
