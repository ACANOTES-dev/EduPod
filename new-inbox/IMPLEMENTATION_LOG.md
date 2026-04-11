# New Inbox — Implementation Log

> **What this is:** The single source of truth for the new Inbox / Messaging module build. Every session that executes an implementation MUST read this file first, verify prerequisites, record completion, and deploy to production before signing off.

---

## 1. Work summary (read this first)

We are building the **first-class in-app messaging system** for the school platform. Today the platform has outbound dispatch (SMS / Email / WhatsApp) and a narrow parent-inquiry thread but **no in-app inbox**. There is no place where school-wide announcements "land", no direct messaging between staff and parents, no group chats, no read receipts, no reply control, no safeguarding oversight, and no shared destination for the future mobile app.

This rebuild adds the missing piece: **the inbox is the cheapest, default-on, audited fourth channel** that sits alongside SMS / Email / WhatsApp and is always selected by default. Every announcement and every direct message lands in user inboxes; SMS / Email / WhatsApp become opt-in escalations on top.

The system supports **three conversation types** — `direct`, `group`, `broadcast` — with three orthogonal pillars: a **tenant-configurable permission matrix**, **admin oversight + freeze**, and a **safeguarding keyword scanner**. Smart audiences (saved static and dynamic groups, AND/OR/NOT composition, cross-module providers like `fees_in_arrears`) drive every broadcast.

By default, parents and students are **inbox-only**. They can only reply on threads where the sender ticked `Allow replies`. This eliminates parent↔parent, student↔student, and student↔parent peer messaging without any extra rules. See `PLAN.md` for the full spec, conversation model, permission matrix, and component map.

**Scope of the rebuild (16 implementations, 5 waves):**

- Schema foundation (one big migration: conversations, messages, participants, reads, edits, attachments, broadcast snapshots, saved audiences, messaging policy grid, inbox tenant settings, safeguarding keywords, message flags, oversight audit log)
- Backend services (messaging policy chokepoint, audience engine v2 with providers + saved groups + composition, conversations service, admin oversight)
- Backend integrations (inbox channel provider in the dispatcher, fallback worker cron, safeguarding scanner worker, full-text search)
- Frontend (inbox shell + thread list + thread view, compose dialog with audience picker, saved audiences manager, messaging policy settings, safeguarding settings, oversight UI)
- Polish (translations, mobile responsiveness pass, morph bar unread badge, smoke tests, docs)

**Untouched by this rebuild:** the existing `ParentInquiry` model (left in place; a later phase can fold it into the inbox), the existing announcement dispatcher (extended with a new channel provider, not replaced), the existing SMS / Email / WhatsApp providers.

---

## 2. Rules every session must follow

**Rule 1 — Read this file before starting any implementation.** The whole log. Not just your wave. You need to see what's been done and what's in flight.

**Rule 2 — Verify prerequisites.** Look at the Wave Status table in §4. For the implementation you've been asked to run, every item in its "Depends on" column must have `status: completed`. If any prerequisite is `pending` or `in-progress`, STOP and tell the user which prerequisite is missing. Do not execute.

**Rule 3 — Read the summaries of completed prerequisites.** Look in §5 (Completion Records) for each prerequisite implementation. Read the summary. You need to know what exists before you build on top of it.

**Rule 4 — Implementations within the same wave code in parallel; only deployments serialise, and only when they share a service restart target.** Deploy order is **first-come-first-served, not by implementation number**. If you're running task 04 and it finishes coding before task 02, task 04 deploys first. The only constraint: before entering the deploy phase, re-read the log; if another implementation in your wave is currently `deploying` AND shares a service restart target (API / worker / web — consult §3's deployment matrix), wait (poll every 3 minutes) until it flips to `completed`, then proceed. If it doesn't share a restart target, you can deploy concurrently without conflict.

**Rule 5 — NEVER push to GitHub.** Commit locally only. The CI gate takes 3-4 hours; pushing during this rebuild would grind everything to a halt. The human owner pushes at the end of the rebuild manually. No `git push`. No `gh pr create`. No exceptions.

**Rule 6 — Deploy directly to production after every implementation.** SSH access is granted for the duration of this rebuild. The deployment flow is:

1.  Commit locally.
2.  Generate a patch with `git format-patch -1 HEAD --stdout > /tmp/inbox-NN.patch`.
3.  `scp` the patch to `root@46.62.244.139:/tmp/inbox-NN.patch`.
4.  SSH and apply as the `edupod` user: `sudo -u edupod bash -lc 'cd /opt/edupod/app && git -c user.name=ACANOTES-dev -c user.email=info@acanotes.com am /tmp/inbox-NN.patch'`.
5.  For schema changes: run `pnpm db:migrate` on the server (as `edupod`), then `pnpm db:post-migrate`.
6.  For backend changes: `pnpm turbo run build --filter=@school/api` then `sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api --update-env`.
7.  For worker changes: `pnpm turbo run build --filter=@school/worker` then `pm2 restart worker --update-env`.
8.  For web changes: clear `.next`, `pnpm turbo run build --filter=@school/web`, then `pm2 restart web --update-env`.
9.  Smoke test against production URLs.
10. Update this log.

The production repo at `/opt/edupod/app` lives on `main` but is already many commits ahead of `origin/main`. Your patch adds one more. Do not run `git pull` or `git fetch origin main` on the server — you will revert everything.

**Rule 7 — Update this log at the end of your implementation.** Append a new Completion Record in §5 with: implementation ID, completion timestamp, a paragraph summary of what actually shipped (not what the plan said — what you actually did), any deviations from the plan with rationale, any follow-up notes for subsequent waves, and the production commit SHA. Flip the row in the Wave Status table (§4) from `in-progress` to `completed`.

**Rule 8 — Regression tests are mandatory.** Before deploying, run `pnpm turbo run test --filter=<affected packages>`. If existing tests fail, fix the regression before deploying. Do NOT deploy a breaking change and come back to it later.

**Rule 9 — Follow the `.claude/rules/*` conventions.** RLS on new tables (`FORCE ROW LEVEL SECURITY` with a tenant isolation policy), no raw SQL outside the RLS middleware, interactive `$transaction(async (tx) => ...)` for all writes, strict TypeScript (no `any`, no `@ts-ignore`), logical CSS properties on frontend, `react-hook-form` + Zod for new forms. The `CLAUDE.md` file in the repo root is the ground truth.

**Rule 10 — If you hit a blocker you cannot resolve, STOP and update the log.** Do not make up state. Do not delete "unrecognised" code. Add a `🛑 BLOCKED` record to §5 explaining what you tried and what you need.

**Rule 11 — Never weaken the permission matrix or relational scopes.** The hard-coded relational scopes in `relational-scope.resolver.ts` are privacy invariants. If a test or feature seems to require loosening them, STOP and ask the user. The default tenant matrix (parents and students entirely OFF) is a safety baseline — do not change defaults without explicit user instruction.

**Rule 12 — Inbox is always-on as a channel.** Any code path in the dispatcher that fans out a message must include the inbox provider unconditionally. If a sender ticks `email` or `sms` or `whatsapp`, those channels are added **on top of** the inbox, never instead. If you find a code path that lets a sender bypass the inbox, fix it.

---

## 3. Wave structure & dependencies

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations code in parallel AND deploy on a first-come-first-served basis — **not** in implementation-number order. Whichever implementation reaches the deploy phase first takes the slot. Deployment only serialises (pollling every 3 minutes) when another sibling is already `deploying` **and** shares a service restart target (API / worker / web, per the matrix below).

| Wave       | Implementations        | Hard dependency | Rationale                                                                                                                                                                                                   |
| ---------- | ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 1** | 01                     | None            | Schema foundation — every table the rebuild needs lands in one coordinated migration. Must complete before any backend or frontend work.                                                                    |
| **Wave 2** | 02, 03, 04, 05         | Wave 1 complete | Backend services. Policy engine, audience engine, conversations + messages service, oversight service. All touch the API; deployments serialise on `pm2 restart api`.                                       |
| **Wave 3** | 06, 07, 08, 09         | Wave 2 complete | Backend integrations. Inbox channel provider in the dispatcher, fallback cron worker, safeguarding scanner worker, full-text search. Mixed restart matrix (API + worker).                                   |
| **Wave 4** | 10, 11, 12, 13, 14, 15 | Wave 3 complete | Frontend. Inbox shell, compose, saved audiences, messaging policy settings, safeguarding settings + dashboard widget, oversight UI. All deploy with `pm2 restart web` so deploys serialise within the wave. |
| **Wave 5** | 16                     | Wave 4 complete | Polish. Translations, mobile responsiveness, morph bar unread badge wire, smoke tests, docs update. Single implementation.                                                                                  |

### Deployment targets per implementation

This matrix is what you consult before deploying. "Who restarts" determines the serialisation rule.

| Impl | Migration | API restart | Worker restart | Web restart |
| ---- | --------- | ----------- | -------------- | ----------- |
| 01   | ✅        | ✅          | ✅             | ✅          |
| 02   | ❌        | ✅          | ❌             | ❌          |
| 03   | ❌        | ✅          | ❌             | ❌          |
| 04   | ❌        | ✅          | ❌             | ❌          |
| 05   | ❌        | ✅          | ❌             | ❌          |
| 06   | ❌        | ✅          | ❌             | ❌          |
| 07   | ❌        | ❌          | ✅             | ❌          |
| 08   | ❌        | ✅          | ✅             | ❌          |
| 09   | ❌        | ✅          | ❌             | ❌          |
| 10   | ❌        | ❌          | ❌             | ✅          |
| 11   | ❌        | ❌          | ❌             | ✅          |
| 12   | ❌        | ❌          | ❌             | ✅          |
| 13   | ❌        | ❌          | ❌             | ✅          |
| 14   | ❌        | ❌          | ❌             | ✅          |
| 15   | ❌        | ❌          | ❌             | ✅          |
| 16   | ❌        | ❌          | ❌             | ✅          |

---

## 4. Wave status (update as you execute)

Legend: `pending` • `in-progress` • `deploying` • `completed` • `🛑 blocked`

| #   | Title                                                | Wave | Depends on             | Status      | Completed at     | Commit SHA |
| --- | ---------------------------------------------------- | ---- | ---------------------- | ----------- | ---------------- | ---------- |
| 01  | Schema foundation                                    | 1    | —                      | `completed` | 2026-04-11 06:55 | 2a8e307c   |
| 02  | Messaging policy engine                              | 2    | 01                     | `completed` | 2026-04-11 07:29 | 18672264   |
| 03  | Audience engine v2                                   | 2    | 01                     | `completed` | 2026-04-11 09:37 | f7e6d823   |
| 04  | Conversations + messages service                     | 2    | 01                     | `completed` | 2026-04-11 11:01 | 6be890d6   |
| 05  | Admin oversight service                              | 2    | 01                     | `completed` | 2026-04-11 09:36 | 0eeb8930   |
| 06  | Inbox channel provider in dispatcher                 | 3    | 01, 04                 | `completed` | 2026-04-11 11:45 | b11a3b02   |
| 07  | Notification fallback worker                         | 3    | 01, 04, 06             | `completed` | 2026-04-11 11:26 | 3362bc12   |
| 08  | Safeguarding keyword scanner                         | 3    | 01, 04                 | `completed` | 2026-04-11 11:46 | 565d35b1   |
| 09  | Full-text search                                     | 3    | 01, 04                 | `completed` | 2026-04-11 11:25 | 9b77fd16   |
| 10  | Inbox shell + thread list + thread view              | 4    | 01, 02, 03, 04, 06     | `pending`   | —                | —          |
| 11  | Compose dialog + audience picker + channel selector  | 4    | 01, 02, 03, 04, 06, 10 | `pending`   | —                | —          |
| 12  | Saved audiences manager UI                           | 4    | 01, 03                 | `pending`   | —                | —          |
| 13  | Messaging policy settings page                       | 4    | 01, 02                 | `pending`   | —                | —          |
| 14  | Safeguarding settings + dashboard alerts widget      | 4    | 01, 08                 | `pending`   | —                | —          |
| 15  | Admin oversight UI + fallback settings               | 4    | 01, 05, 07             | `pending`   | —                | —          |
| 16  | Polish, translations, mobile pass, morph bar wire-up | 5    | 10–15                  | `pending`   | —                | —          |

Note: "Depends on" lists the minimum set of implementations that must be `completed` before this one can start. In strict wave order these are automatically satisfied — the column exists so the slash command and the human can double-check.

---

## 5. Completion records

Append new records below in chronological order. Format:

```
### [IMPL NN] — <title>
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Commit:** <sha>
- **Deployed to production:** yes / no (if no, explain)
- **Summary (≤ 200 words):**
  What was actually built. Names of new files, endpoints, services. Key design
  decisions made during implementation that subsequent waves need to know about.
  Any trade-offs or deviations from the plan.
- **Follow-ups:** anything that needs to happen later, with owner.
- **Session notes (optional):** anything weird or surprising.
```

<!-- ─── Append records below this line ─── -->

### [IMPL 01] — Schema foundation

- **Completed:** 2026-04-11T06:55+01:00 Europe/Dublin
- **Commit:** `2a8e307c` (local `07a74c01`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed 14 new Prisma models and 6 enums for the inbox rebuild:
  `conversations`, `conversation_participants`, `messages`,
  `message_reads`, `message_edits`, `message_attachments`,
  `broadcast_audience_definitions`, `broadcast_audience_snapshots`,
  `saved_audiences`, `tenant_messaging_policy`, `tenant_settings_inbox`,
  `safeguarding_keywords`, `message_flags`, `oversight_access_log`.
  Every tenant-scoped table has `FORCE ROW LEVEL SECURITY` +
  `tenant_isolation` policy (installed via `post_migrate.sql` and
  mirrored in `rls/policies.sql`). `messages.body_search` is a
  generated `tsvector STORED` column with GIN index (simple dictionary
  so Arabic tokenises). The defaults seeder lives in
  `packages/prisma/src/inbox-defaults.ts` (callable via `@school/prisma`
  from both the global seed and `TenantsService.createTenant`); the
  sibling migration `20260411100100_seed_inbox_defaults` embeds the same
  defaults as pure SQL with `ON CONFLICT DO NOTHING` so fresh DBs are
  self-sufficient. Per tenant: 1 `tenant_settings_inbox` row, 81
  `tenant_messaging_policy` rows (parents/students entirely OFF), 31
  starter `safeguarding_keywords`. Shared types and Zod schemas now
  live under `@school/shared/inbox` (new subpath export).
- **Follow-ups:**
  - Wave 2 (impls 02–05) consumes these tables. `messaging-policy.service`,
    `audience-resolution.service`, `conversations.service`, and
    `inbox-oversight.service` all have stub `.spec.ts` placeholders
    (`describe.skip`) under `apps/api/src/modules/inbox/`.
  - Wave 2 should also flesh out `role-mapping.ts` long-tail (librarian,
    substitute teacher, etc.). Current map covers the core seeded roles.
  - Wave 3 impl 09 is the only consumer of `messages.body_search` — it
    MUST use raw SQL inside the RLS middleware because Prisma
    `Unsupported("tsvector")` is client-unreadable.
  - Production had stale file ownership on `packages/shared/tsconfig.tsbuildinfo`,
    `apps/api/dist`, `apps/worker/dist`, and the Prisma client dir —
    chowned back to `edupod:edupod` during the deploy. If the next
    deploy hits the same, same fix applies.
- **Session notes:** Used `pnpm --filter @school/prisma migrate:deploy`
  on prod (not `pnpm db:migrate`, which runs `migrate:dev` and offers
  to reset the database on drift). Verification counts: 4 tenants ×
  81 = 324 policy rows, 4 settings rows, 124 keywords. API/worker/web
  all restarted clean; health endpoint 200; nhqs login page 200.

### [IMPL 02] — Messaging policy engine

- **Completed:** 2026-04-11T07:29+01:00 Europe/Dublin
- **Commit:** `18672264` (local `20f6eb58`) on top of `19b2fca8` (local `9a739fb1`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the single-chokepoint `MessagingPolicyService` with
  `canStartConversation` and `canReplyToConversation`. The algorithm
  applies kill switches → tenant matrix cell → symmetric kill switches
  → relational scope in order, with one batched scope call per
  (sender, recipient-role) bucket. Hard-coded relational scopes live in
  `RelationalScopeResolver` (teacher→parent via taught-class rosters,
  parent→teacher via child-class staff; student branches return
  unreachable because Student.user_id does not yet exist).
  `RoleMappingService` folds platform roles into the 9-bucket
  `MessagingRole` via `RbacReadFacade.findActiveMembershipRolesByUserIds`
  (new batch method on the facade). `TenantMessagingPolicyRepository`
  wraps `tenant_messaging_policy` with a 5-minute per-tenant matrix
  cache and RLS-scoped writes. Read-only `InboxSettingsController`
  exposes `GET /v1/inbox/settings/policy` and `/inbox` behind
  `inbox.settings.read`. `InboxPermissionsInit` runs at startup and
  idempotently backfills the five new permissions and wires them to
  existing roles (admin tier gets all five, send-only for everyone
  else) — needed because Wave 2 ships no migration. `InboxModule`
  registered in `AppModule`.
- **Follow-ups:**
  - Wave 3 impl 06 will reuse `MessagingPolicyService.canStartConversation`
    / `canReplyToConversation` from the dispatcher, passing
    `skipRelationalCheck: true` on broadcast fans where the audience
    engine has already pre-filtered the recipients.
  - Wave 4 impl 13 will reuse `TenantMessagingPolicyRepository.setCell`
    / `resetToDefaults` + `InboxSettingsService` from the settings UI.
  - Student → teacher and teacher → student relational branches are
    intentionally stubs until students are provisioned as platform
    users in a later wave.
  - The RLS policies on `roles` / `role_permissions` cast
    `current_setting('app.current_tenant_id')::uuid` even with
    `missing_ok=true` — deploy-time backfills that touch those tables
    MUST run inside `runWithRlsContext(prisma, { tenant_id })`, not a
    bare `prisma.$transaction`. See `InboxPermissionsInit.backfill` for
    the two-pass pattern.
- **Session notes:** First deploy attempt of the backfill failed with
  Postgres 22P02 (empty uuid cast) because I ran the upserts inside a
  bare `$transaction` without tenant context; fix-forward commit
  (`18672264`) split into a global permission-upsert pass and a
  per-tenant `runWithRlsContext` role-permission pass. Smoke tests:
  `GET /v1/inbox/settings/policy` as owner@nhqs.test returned the
  expected 9x9 matrix (parent/student rows all `false`);
  `GET /v1/inbox/settings/inbox` returned the seeded defaults
  (`messaging_enabled: true`, fallbacks 24h/3h). Backfill log on boot:
  `Inbox permissions ensured — 4 tenants, 8 admin-tier roles, 24
send-only roles.`

### [IMPL 03] — Audience engine v2

- **Completed:** 2026-04-11T09:37+01:00 Europe/Dublin
- **Commit:** `f7e6d823` (local `ab5d70c6`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the smart-audience engine under
  `apps/api/src/modules/inbox/audience/`. `AudienceProviderRegistry`
  is a process-wide singleton; 13 inbox-owned providers register via
  `InboxAudienceProvidersInit` at boot
  ("Registered 13 inbox-owned audience providers."). Cross-module
  providers: `FeesInArrearsProvider` lives in `FinanceModule` and
  resolves households → parents → user_ids (added
  `FinanceReadFacade.findHouseholdIdsWithOverdueInvoices`; invoices
  are household-scoped so the spec's student_ids path was replaced).
  `EventAttendeesProvider` / `TripRosterProvider` are v1 stubs in
  new placeholder `EventsModule` / `TripsModule` that throw
  `AUDIENCE_PROVIDER_NOT_WIRED`. `section_parents` and the two student
  providers (`year_group_students`, `class_students`) also ship as
  registered stubs (no Sections model yet; students have no `user_id`).
  `AudienceComposer` walks the definition tree with set algebra, caches
  the NOT universe per walk, and intercepts `saved_group` leaves to
  handle cycle detection (`SAVED_AUDIENCE_CYCLE_DETECTED`). Depth limit
  is enforced at 5 by `audienceDefinitionSchema` in `@school/shared`.
  `AudienceResolutionService` exposes `resolve`, `resolveSavedAudience`,
  `previewCount` (deterministic 5-user sample). `SavedAudiencesService`
  - `SavedAudiencesController` ship full CRUD under
    `/v1/inbox/audiences` behind `inbox.send`: list / get / create /
    update / delete / preview / resolve / providers. All writes go
    through `SavedAudiencesRepository` with RLS-scoped `$transaction`.
    80 unit tests (13 provider specs + composer + registry + resolution
  - saved-audiences service + fees-in-arrears).
- **Follow-ups:**
  - Wave 4 impl 12 (saved audiences manager UI) consumes the controller
    and `listProviders` → the `wired: false` flag disables stub chips.
  - When a real `events` / `trips` / `sections` domain lands, each stub
    provider is the single touch point to wire the resolver.
  - When students become first-class users, `year_group_students` /
    `class_students` and `AudienceUserIdResolver.buildTenantUniverse`
    are the two places to extend.
  - `FeesInArrearsProvider` uses households, not students — the impl
    spec pseudo-code was updated inline with a deviation note.
  - Deployment bundled impl 05 with impl 03 because impl 05's commit
    (`3107bf2e` local → `0eeb8930` prod) was ahead of impl 03 in the
    local git and production did not yet have it. A single API rebuild
    - `pm2 restart api` served both. Impl 05's log row is still
      `in-progress` — the owning session should flip it to `completed`
      against commit `0eeb8930` during reconciliation.
- **Session notes:** The lint rule `school/no-cross-module-internal-import`
  fires warnings (not errors) on the registry imports from
  `events/events.module.ts`, `trips/trips.module.ts`, and
  `finance/finance.module.ts`. These are deliberate — the registry
  singleton pattern is how cross-module provider registration is
  expected to work, and the providers live in their owning modules to
  satisfy `no-cross-module-prisma-access`. Warnings left in place
  rather than suppressing to keep the signal visible.

### [IMPL 05] — Admin oversight service

- **Completed:** 2026-04-11T09:36+01:00 Europe/Dublin
- **Commit:** `0eeb8930` (local `3107bf2e`)
- **Deployed to production:** yes (bundled with impl 03's API rebuild —
  my commit was already on `HEAD~1` when impl 03 deployed, so a single
  `pm2 restart api` served both. Verified on prod at commit
  `0eeb8930`: routes registered, `InboxSystemUserInit` ran, permissions
  backfill completed.)
- **Summary (≤ 200 words):**
  Landed the privileged oversight surface for Owner / Principal /
  Vice Principal under `apps/api/src/modules/inbox/oversight/`:
  `InboxOversightService` (listAllConversations, getThread, freeze /
  unfreeze, listPendingFlags, dismissFlag, escalateFlag, exportThread,
  listAuditLog, and a `searchAll` stub that throws
  `INBOX_SEARCH_NOT_READY` 503 until impl 09 wires FTS). Every read and
  every mutation writes an `oversight_access_log` row in the same
  RLS-scoped `$transaction` as the underlying query — a successful
  oversight action with a missing audit row is impossible.
  `OversightAuditService` is the only writer. `OversightPdfService`
  uses `pdf-lib` (Helvetica, ASCII-sanitised) to generate text-oriented
  thread exports uploaded via `S3Service` with a 1-hour presigned URL.
  `InboxOversightController` exposes `/v1/inbox/oversight/*` behind
  `AuthGuard + PermissionGuard + AdminTierOnlyGuard`; the new guard in
  `common/admin-tier-only.guard.ts` reuses
  `PermissionCacheService.isOwner` so the hardcoded admin-tier role
  list stays a single source of truth. `InboxSystemUserInit`
  idempotently upserts `users(SYSTEM_USER_SENTINEL)` at startup so
  freeze/unfreeze system messages satisfy the `messages.sender_user_id`
  FK. Zod request schemas in
  `@school/shared/inbox/schemas/oversight.schema.ts`. 21 unit tests
  cover privileged-read, audit-log coupling, idempotent freeze/unfreeze,
  flag actions, PDF export path, search stub, and pagination.
- **Follow-ups:**
  - Wave 3 impl 09 (full-text search) must swap `searchAll`'s 503 stub
    for a real call to the forthcoming
    `InboxSearchService.search(tenantId, q, pagination, { scope: 'tenant' })`.
  - Wave 4 impl 15 (oversight UI + fallback settings) consumes this
    controller. The `review_url` field on flag summaries is already
    shaped for the frontend deep link
    (`/inbox/oversight/conversations/:id?flag=:flagId`).
  - `PermissionCacheService.isOwner` backs `AdminTierOnlyGuard` — if
    any future wave adds a new admin-tier `role_key`, update
    `PermissionCacheService.OWNER_ROLE_KEYS` and both gates follow.
- **Session notes:** Wall-clock deploy serialisation was resolved by
  impl 03's session: their API rebuild picked up both commits because
  my commit (`3107bf2e` local → `0eeb8930` prod) was already on
  `HEAD~1` when their patch landed. Verification on prod: `/api/health`
  200; `/api/v1/inbox/oversight/{conversations,audit-log,flags}` all
  return 401 `UNAUTHORIZED` (route registered and guarded). Startup log
  shows `InboxOversightController {/api/v1/inbox/oversight}:` from
  `RoutesResolver`, `Platform system-user row ensured.` from
  `InboxSystemUserInit`, and the permissions backfill line.

### [IMPL 04] — Conversations + messages service

- **Completed:** 2026-04-11T11:01+01:00 Europe/Dublin
- **Commit:** `6be890d6` (local `e93e2d91`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the core inbox write path under
  `apps/api/src/modules/inbox/{conversations,messages,common}/`.
  `ConversationsService` owns `createDirect` (with
  non-archived dedupe), `createGroup` (hard-fail on any
  per-recipient denial; 2–49 recipients), `createBroadcast`
  (admin-tier + staff only — parents/students always rejected;
  soft-filters denied recipients; persists both
  `broadcast_audience_definitions` and a frozen
  `broadcast_audience_snapshot`), `sendReply` (spawns a private
  1↔1 direct thread the first time a broadcast recipient replies
  and appends on subsequent replies — spawn link lives in the
  new thread's `subject` marker `broadcast:<id>` until a
  `messages.metadata_json` column lands), `markRead`/`markAllRead`,
  `listInbox`, `setMuted`/`setArchived`, and `getInboxState`.
  `ConversationsReadFacade` handles the privacy-gated reads:
  staff senders see `read_count`/`total_recipients` on their own
  messages; parents/students never do. Deleted messages surface
  as `[message deleted]` tombstones for non-admin viewers.
  `MessagesService` handles edit (10-min tenant-overridable
  window, staff roles only, `message_edits` snapshot) and
  soft-delete. `InboxOutboxService` stubs the post-message
  side-effect hand-off — structured logs only in v1, Wave 3
  impls 06 / 08 replace the stub with real BullMQ producers so
  impl 04 ships API-only. `AttachmentValidator` enforces tenant
  ownership via the S3 key prefix convention. Routes mount
  under `/v1/inbox/{conversations,messages,state}` behind
  `AuthGuard + PermissionGuard`; added new `inbox.read`
  permission with backfill to admin tier + parent/student/staff
  send-only roles. Shared Zod: new `attachment-input.schema.ts`
  with 10-file / 25 MB / mime-allowlist guard; refreshed
  `create-conversation` + `send-message` schemas to take inline
  attachment objects (`storage_key`, `filename`, `mime_type`,
  `size_bytes`) instead of the impl-01 placeholder
  `attachment_ids` field; added `list-inbox`, `get-thread`,
  `mute`, `archive` query schemas.
- **Follow-ups:**
  - Wave 3 impl 06 (inbox channel provider in dispatcher) must
    replace `InboxOutboxService.notifyMessageCreated` with a
    real BullMQ enqueue on a dedicated inbox queue. The stub
    is deliberately a single-file swap.
  - Wave 3 impl 08 (safeguarding scanner) must replace
    `InboxOutboxService.notifyNeedsSafeguardingScan` with an
    enqueue onto the safeguarding worker queue. Impl 04 already
    calls it from both `create*` paths AND from `editMessage`
    so the re-scan path is wired.
  - The broadcast-reply-spawn link uses the spawned thread's
    `subject` field (`broadcast:<id>`) as a marker. When the
    schema gets the planned `messages.metadata_json` column, move
    the pointer there so spawned subjects can hold human-readable
    text instead.
  - `max-lines` ESLint warnings on `conversations.service.ts`
    (979 lines) and its spec (578). Acceptable — consistent with
    existing large services in the repo; splitting the service
    would scatter the transactional boundaries across files.
  - Wave 4 impl 11 (compose dialog) imports the refreshed
    `create-conversation.schema` and must populate the inline
    attachments array. The frontend's upload flow should set
    `storage_key` to the `{tenantId}/...` S3 key returned by
    the existing upload endpoint.
- **Session notes:** Coded in parallel with in-flight impls 03
  and 05 rather than serialising the whole wave; deployment
  was serialised via the normal patch flow. Prod smoke: mapped
  routes visible in the startup log
  (`Mapped {/api/v1/inbox/conversations, POST}` etc.),
  `ConversationsController {/api/v1/inbox}:` and
  `MessagesController {/api/v1/inbox/messages}:` in
  `RoutesResolver`, `Inbox permissions ensured — 4 tenants,
8 admin-tier roles, 24 send-only roles.` (the send-only count
  grew from 5 to 24 because the new `inbox.read` permission
  doubled grants for parent + student + the 4 staff send-only
  roles across the 4 tenants). Curls: `/api/health` 200;
  `/api/v1/inbox/{state,conversations}` with a tenant host
  header return 401 `UNAUTHORIZED` (guarded); without the host
  header return 404 (pre-existing tenant-resolver behaviour,
  unchanged by this impl).

### [IMPL 09] — Full-text search

- **Completed:** 2026-04-11T11:25+01:00 Europe/Dublin
- **Commit:** `9b77fd16` (local `78ad4c4f`) on top of `9339e98a`
  (local `aca45090`)
- **Deployed to production:** yes (API rebuild + `pm2 restart api`)
- **Summary (≤ 200 words):**
  Landed `InboxSearchService` + `InboxSearchController` under
  `apps/api/src/modules/inbox/search/`. Search runs `plainto_tsquery(
'simple', $q)` against the `messages.body_search` tsvector column
  (impl 01's GIN-backed `idx_messages_body_search`), ordered by
  `ts_rank` then recency, and wraps matches with
  `ts_headline StartSel=<mark>, StopSel=</mark>, MaxFragments=2,
MaxWords=20, MinWords=5`. The SQL is hand-rolled `$queryRaw` inside an
  interactive RLS transaction (Prisma's query builder cannot express
  `tsvector @@ tsquery` — the column is `Unsupported("tsvector")`).
  Both user and tenant scopes share one SQL shape; scope `user` adds an
  `EXISTS (conversation_participants...)` clause, scope `tenant` omits
  it. The user controller `GET /v1/inbox/search` hard-wires
  `scope: 'user'` — there is no request parameter that can widen the
  scope. `InboxOversightService.searchAll` stops throwing
  `INBOX_SEARCH_NOT_READY` and now delegates with `scope: 'tenant'`,
  still writing the audit row in its own RLS transaction before the
  search runs. Guards: query length 2–200, pageSize ≤ 50,
  punctuation-only queries short-circuit to an empty page without a DB
  hit. Shared: `inboxSearchQuerySchema` in `@school/shared/inbox`. 34
  unit tests (service + controller + oversight delegation).
- **Follow-ups:**
  - Wave 4 impl 10 renders the `body_snippet` field; it must sanitise
    through a `<mark>`-only allowlist before dangerously setting the
    HTML.
  - Wave 4 impl 15 (oversight UI) consumes the oversight search route;
    the response shape is now the full `InboxSearchHit` (the stub's
    `OversightSearchHit` is a type alias).
  - Arabic search currently tokenises by whitespace under the `simple`
    config. v2 can switch to a multilingual config or per-locale
    tsvectors.
  - Impl 09's first deploy (`9339e98a`) mixed in parallel impl 06 WIP
    (`BullModule.registerQueue` + `forwardRef(CommunicationsModule)`
    in `inbox.module.ts`) and the circular dep
    `AppModule→AdmissionsModule→FinanceModule→InboxModule→`
    `CommunicationsModule→ClassesModule→AdmissionsModule` crashed the
    API boot. Fix-forward commit `9b77fd16` stripped those lines back
    to the impl-05 shape; the committed `InboxOutboxService` (impl 04
    stub) does not inject the notifications queue so no API code path
    needs the Bull registration yet. When impl 06 lands for real, its
    own patch should re-introduce the BullMQ wiring alongside its
    own producer.
- **Session notes:** Saw 480 API restarts on prod between the two
  deploys (crash loop from the circular dep). After `9b77fd16` +
  rebuild + `pm2 restart api`, API stabilised at `Nest application
successfully started`. Smoke: `/api/health` 200; `/api/v1/inbox/
search?q=test` with nhqs host header → 401 `UNAUTHORIZED` (route
  registered and guarded); `/api/v1/inbox/oversight/search?q=test` →
  401 `UNAUTHORIZED` (also registered, no longer the 503 stub). The
  parallel impl 07 session had also deployed a fallback-worker patch
  (`95c7350d`) between my two deploys, which is still running and
  unrelated to 09.

### [IMPL 07] — Notification fallback worker

- **Completed:** 2026-04-11T11:26+01:00 Europe/Dublin
- **Commit:** `95c7350d` (feature) + `3362bc12` (RLS fix-forward) on prod; local `9456cd3c` + `9e136376`
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the inbox fallback escalation pipeline under
  `apps/worker/src/processors/inbox/`. `InboxFallbackCheckProcessor`
  is a 15-minute cron on `QUEUE_NAMES.NOTIFICATIONS` that fans out one
  `inbox:fallback-scan-tenant` job per tenant with messaging + any
  fallback bucket enabled. `InboxFallbackScanTenantProcessor` runs
  inside an RLS-scoped `$transaction`: loads `tenant_settings_inbox`,
  short-circuits on disabled state, runs a single bounded
  `message.findMany` (500-row cap, filters `fallback_dispatched_at IS
NULL`, `disable_fallback = false`, `deleted_at IS NULL`, frozen
  conversation exclusion, `created_at < min(adminMs, teacherMs)`),
  batch-resolves sender `MessagingRole` via `tenantMembership` +
  shared `PLATFORM_ROLE_TO_MESSAGING_ROLE`, partitions into admin /
  teacher buckets with per-bucket age filtering, materialises
  `notification` rows for every unread recipient × configured channel
  (skipping recipients with no contact for that channel + never the
  sender), and stamps `messages.fallback_dispatched_at` in a
  tenant-scoped `updateMany`. Integration path: rows enter the
  existing `dispatch-queued` → `DispatchNotificationsProcessor`
  pipeline via a new platform-level `inbox_message_fallback`
  template set (6 rows — email / sms / whatsapp × en / ar) seeded
  idempotently at worker start by `InboxFallbackTemplatesInit`. Cron
  registration added to `CronSchedulerService.registerInboxCronJobs`.
  Two-file raw-sql allowlist bump. 23 unit tests.
- **Follow-ups:**
  - Wave 4 impl 15 (admin oversight UI + fallback settings) binds the
    six fallback columns on `tenant_settings_inbox` to a settings
    form. No service work required — the worker already consumes
    them.
  - Smoke-test recipe: temporarily set `fallback_admin_after_hours =
0` on a test tenant, send a Principal broadcast, wait 16 minutes,
    verify `messages.fallback_dispatched_at` stamped and a
    `notifications` row with `template_key = 'inbox_message_fallback'`
    exists. Reset override afterwards.
  - If a real tenant accumulates >500 unread staff messages in one
    bucket, the scan drains across cycles at 500/15min — a tenant
    with 10k backlog needs ~5h to drain. Flag as a telemetry
    follow-up when a tenant hits it.
  - Parent / student senders are intentionally never escalated (the
    fallback is a staff-outbound escalation mechanism). If a future
    wave changes this, the per-bucket role partition in
    `scanTenant` is the single touch point.
- **Session notes:** First prod boot after the feature commit
  (`95c7350d`) crashed in `InboxFallbackTemplatesInit.onModuleInit`
  with `22P02 invalid input syntax for type uuid: ""` — the
  `notification_templates` RLS policy casts
  `current_setting('app.current_tenant_id')::uuid` unconditionally
  (same class of bug impl 02 hit on `roles` / `role_permissions`).
  Fix-forward (`3362bc12`) wraps the seed in a `$transaction` that
  sets `app.current_tenant_id = SYSTEM_USER_SENTINEL` before
  `findFirst` — the `tenant_id IS NULL` branch of the OR then
  resolves the policy for platform rows without leaking tenant data.
  Second boot logged `Inbox fallback templates ensured — created 6
new platform-level row(s).` and every subsequent boot logs
  `Inbox fallback templates already present — skipping seed.`
  `Registered repeatable cron: inbox:fallback-check (every 15 min)`
  confirmed on both boots. Coded and deployed in parallel with impls
  06 / 08 / 09 — worker-only deploy had no serialisation conflict
  with impl 09's concurrent API-only deploy.

### [IMPL 06] — Inbox channel provider in dispatcher

- **Completed:** 2026-04-11T11:45+01:00 Europe/Dublin
- **Commit:** `b11a3b02` (local `0c4824b5` on top of `f63e2d31`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Makes the inbox the default-on fourth channel. New files under
  `apps/api/src/modules/communications/`: `InboxChannelProvider`
  (no-op send; exists as the future mobile-push hook point),
  `InboxBridgeService` (single hand-off from
  `AnnouncementsService.executePublish` into
  `ConversationsService.createBroadcast`, translating the five legacy
  `AnnouncementScope` values into `AudienceDefinition` leaves —
  `parents_school`, `year_group_parents`, `class_parents`,
  `household`, `handpicked`). The bridge resolves `ConversationsService`
  lazily via `ModuleRef.get(..., { strict: false })` rather than a
  constructor inject — constructor injection creates a runtime
  circular dep chain AppModule → AdmissionsModule → FinanceModule →
  InboxModule → CommunicationsModule → ClassesModule → AdmissionsModule
  that `forwardRef` cannot unwind (commit `9b77fd16 / 78ad4c4f` was
  the earlier revert of that dead-end). `InboxOutboxService` swaps its
  Wave-2 stub for a real BullMQ producer: `notifyMessageCreated`
  enqueues `inbox:dispatch-channels` on the `notifications` queue when
  the sender picks email/sms/whatsapp, validated by
  `inboxDispatchChannelsJobPayloadSchema` (new in `@school/shared`).
  The worker's new `InboxDispatchChannelsProcessor` bulk-inserts
  `Notification` rows with `source_entity_type='inbox_message'` and
  hands off to the existing `DispatchNotificationsProcessor` via
  `communications:dispatch-notifications` so template / rate-limit /
  fallback-chain logic is reused, not duplicated.
  `AnnouncementsService.executePublish` now calls the bridge inside a
  try/catch — legacy SMS/Email/WhatsApp fan-out via the existing
  `Notification` pipeline stays intact, and a bridge failure never
  breaks the publish. 76 new unit tests across bridge, provider,
  outbox, worker processor, and announcements spec.
- **Follow-ups:**
  - Wave 4 impl 11 (compose dialog) will drive the new
    `createBroadcast` path directly; no further work needed on the
    dispatcher glue.
  - The worker's `InboxDispatchChannelsProcessor` routes all external
    channels through the existing `Notification` rows pipeline. When a
    future wave introduces mobile push, add it as a new provider in
    `DispatchNotificationsProcessor` rather than building a second
    dispatcher — the channel list is already in one place.
  - `AnnouncementsService.executePublish` continues to run its own
    audience resolution (via `AudienceResolutionService`) alongside
    the bridge's v2 resolution. When legacy announcements are
    migrated off the `Notification`-row path entirely, drop the
    legacy resolver and keep only the bridge. Out of scope for Wave 3.
- **Session notes:** Deploy required a broader patch than just this
  commit — production's equivalent of local `f63e2d31` (which had
  bundled my earlier impl 06 file scaffolding) was missing, so the
  deploy patch covered both commits via a single `git diff 9e136376
..HEAD` applied on the server. Impl 08's in-progress `worker.module
.ts` additions (SafeguardingScanMessageProcessor + NotifyReviewers
  imports + the `QUEUE_NAMES.SAFEGUARDING` registration) were also
  pulled in by the diff; stripped them on the server with a one-shot
  sed/python script before the worker build so impl 08 can re-add
  them cleanly when it lands. `/api/health` returns 200 after
  restart; `/api/v1/inbox/conversations` returns 401 (route
  registered, auth guard active). Worker boot log shows
  `NestApplication successfully started` and the existing
  `InboxFallbackCheckProcessor` cron firing on schedule.

### [IMPL 08] — Safeguarding keyword scanner

- **Completed:** 2026-04-11T11:46+01:00 Europe/Dublin
- **Commit:** `565d35b1` (local `4fe75b4f`)
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  Landed the tenant-configurable keyword scanner on a new
  `safeguarding` BullMQ queue. `KeywordSafeguardingScanner` (API,
  `apps/api/src/modules/safeguarding/scanner/`) implements the
  `SafeguardingScanner` interface with an escapeRegex + word-boundary
  loop and a 5-minute per-tenant active-keyword cache via
  `SafeguardingKeywordsRepository`. Word-boundary guards drop the
  leading/trailing `\b` for non-word-char keywords (e.g. `c++`). CRUD
  surface at `/v1/safeguarding/keywords` behind `AuthGuard +
PermissionGuard + AdminTierOnlyGuard` and the new
  `safeguarding.keywords.write` permission (seeded by
  `SafeguardingPermissionsInit` — "Safeguarding permissions ensured —
  4 tenants, 8 admin-tier grants"). `SafeguardingModule` extends the
  existing Phase-D module and imports `InboxModule` to pick up
  `AdminTierOnlyGuard` (now exported). Worker processors
  `SafeguardingScanMessageProcessor` (inlines a worker-local scanner
  clone — can't reach API DI), and
  `SafeguardingNotifyReviewersProcessor` (idempotent in-app
  `Notification` rows keyed `safeguarding:<flag>:<user>`).
  `notifyNeedsSafeguardingScan` fire-and-forgets onto the new queue.
  Shared Zod: `bulkImportSafeguardingKeywordsSchema`,
  `setSafeguardingKeywordActiveSchema`. 38 new unit tests; queue-config
  drift check updated to 23 queues.
- **Follow-ups:**
  - Wave 4 impl 14 (safeguarding settings + dashboard widget)
    consumes `GET /v1/safeguarding/keywords` for CRUD and reads
    `Notification` rows where `channel = 'in_app'`,
    `template_key = 'safeguarding.flag.new'` for the dashboard
    alerts. `payload_json.review_url` points at
    `/inbox/oversight/conversations?flag=<id>` for the deep link.
  - The worker processor inlines the scanner (keyword fetch +
    regex loop) rather than injecting `KeywordSafeguardingScanner`
    from the API's DI graph — the worker is a separate Nest
    application and cannot cross into API internals. The regex
    logic is duplicated in two places; when a v2 ML scanner lands,
    both sites must be updated together.
  - The `message_flags` table has no unique constraint on
    `message_id`. The processor uses a manual `findFirst` +
    `create`-or-`update` pattern inside the RLS transaction
    instead of `upsert`. If the scanner ever parallelises (v2),
    add `uniq_message_flags_message_id` in a follow-up migration.
  - Word-boundary ASCII-only limitation documented in the v1
    scanner's header comment. A future multilingual rework will
    need to reconsider boundary detection for Arabic content.
- **Session notes:** Coded in parallel with impls 06/07/09.
  During execution the working tree churned heavily because
  parallel sessions were editing the same shared files
  (`inbox-outbox.service.ts`, `inbox.module.ts`,
  `worker.module.ts`) — my final commit excludes those shared
  files entirely; impl 06's commit (`b11a3b02` prod /
  `0c4824b5` local) already carried my `worker.module.ts`
  additions (SafeguardingScanMessageProcessor /
  NotifyReviewersProcessor imports + providers + `SAFEGUARDING`
  queue registration) because a linter merged the two sets of
  edits mid-flight. On prod, a manual `sed` had removed those
  lines from `worker.module.ts` when impl 06 deployed first (the
  processor source files weren't present yet), so the deploy
  applied my patch and then `git checkout HEAD --
apps/worker/src/worker.module.ts` to restore the references
  before rebuilding. API/worker restart clean;
  `SafeguardingPermissionsInit` backfill completed;
  `/api/v1/safeguarding/keywords` returns 401 (route registered,
  guards active); `/api/health` 200.
