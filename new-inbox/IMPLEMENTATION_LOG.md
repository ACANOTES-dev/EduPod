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

**Rule 4 — Implementations within the same wave can be coded in parallel, but deployments must be serialised.** If you are implementing task N and task N-1 (same wave) is still deploying, wait. Never deploy concurrently with another session in the same wave. Simple heuristic: before you start the deployment phase, check the log; if any implementation in your wave has `status: deploying`, wait until it flips to `completed`.

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

Each wave must complete entirely before the next wave starts. Within a wave, all listed implementations can be coded in parallel, but their deployments MUST happen in ascending implementation-number order whenever they share a service restart.

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

| #   | Title                                                | Wave | Depends on             | Status        | Completed at     | Commit SHA |
| --- | ---------------------------------------------------- | ---- | ---------------------- | ------------- | ---------------- | ---------- |
| 01  | Schema foundation                                    | 1    | —                      | `completed`   | 2026-04-11 06:55 | 2a8e307c   |
| 02  | Messaging policy engine                              | 2    | 01                     | `completed`   | 2026-04-11 07:29 | 18672264   |
| 03  | Audience engine v2                                   | 2    | 01                     | `completed`   | 2026-04-11 09:37 | f7e6d823   |
| 04  | Conversations + messages service                     | 2    | 01                     | `in-progress` | —                | —          |
| 05  | Admin oversight service                              | 2    | 01                     | `completed`   | 2026-04-11 09:36 | 0eeb8930   |
| 06  | Inbox channel provider in dispatcher                 | 3    | 01, 04                 | `pending`     | —                | —          |
| 07  | Notification fallback worker                         | 3    | 01, 04, 06             | `pending`     | —                | —          |
| 08  | Safeguarding keyword scanner                         | 3    | 01, 04                 | `pending`     | —                | —          |
| 09  | Full-text search                                     | 3    | 01, 04                 | `pending`     | —                | —          |
| 10  | Inbox shell + thread list + thread view              | 4    | 01, 02, 03, 04, 06     | `pending`     | —                | —          |
| 11  | Compose dialog + audience picker + channel selector  | 4    | 01, 02, 03, 04, 06, 10 | `pending`     | —                | —          |
| 12  | Saved audiences manager UI                           | 4    | 01, 03                 | `pending`     | —                | —          |
| 13  | Messaging policy settings page                       | 4    | 01, 02                 | `pending`     | —                | —          |
| 14  | Safeguarding settings + dashboard alerts widget      | 4    | 01, 08                 | `pending`     | —                | —          |
| 15  | Admin oversight UI + fallback settings               | 4    | 01, 05, 07             | `pending`     | —                | —          |
| 16  | Polish, translations, mobile pass, morph bar wire-up | 5    | 10–15                  | `pending`     | —                | —          |

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
