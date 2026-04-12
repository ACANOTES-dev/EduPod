# Integration Test Specification: Communications Module

> **Leg 2 of the `/e2e-full` release-readiness pack.** This spec exercises everything the UI specs (leg 1) structurally cannot validate: Row-Level Security isolation, API contract (every endpoint × every role × every Zod boundary), webhook signature and replay handling, DB invariants in machine-executable form, and concurrency / race conditions. Runnable by a Jest + Supertest harness against a staging API with two provisioned tenants and direct DB + Redis access.

**Module:** Communications (inbox, announcements, notifications, parent inquiries, safeguarding keywords, oversight)
**Target executor:** Jest / Supertest / pg-promise scripts with direct DB + Redis access
**Base API URL:** `https://api-staging.edupod.app` (or local `http://localhost:3001`)
**Tenants required:** `nhqs` (A) and `test-b` (B) — see `admin_view/communications-e2e-spec.md` Prerequisites for full seed requirements.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [RLS Isolation Matrix — tenant-scoped tables](#3-rls-isolation-matrix)
4. [API Contract Matrix — every endpoint × every role](#4-api-contract-matrix)
5. [Webhook Signature & Replay — Resend](#5-webhook-signature-replay-resend)
6. [Webhook Signature & Replay — Twilio SMS + WhatsApp](#6-webhook-signature-replay-twilio)
7. [Zod Validation Edge Cases](#7-zod-validation-edge-cases)
8. [State-Machine Transitions](#8-state-machine-transitions)
9. [Machine-Executable Data Invariants](#9-machine-executable-data-invariants)
10. [Concurrency / Race Conditions](#10-concurrency-races)
11. [Encrypted / Sensitive Field Handling](#11-encrypted-fields)
12. [Audit Log Integrity](#12-audit-log-integrity)
13. [Unsubscribe Token & Public Endpoints](#13-unsubscribe-token)
14. [Sign-off](#14-sign-off)

---

## 1. Prerequisites

**Environment:**

- Two tenants provisioned: `nhqs` (tenant_id `<A>`), `test-b` (tenant_id `<B>`)
- `FORCE ROW LEVEL SECURITY` on all 19 tenant-scoped tables listed in §3
- JWT signing secrets identical between API and test harness
- Redis / BullMQ reachable — tests read `bull:notifications:*` keys to assert enqueue
- Resend + Twilio sandbox keys; webhook secrets set so signatures can be generated inside tests
- `INBOX_ALLOW_TEST_FALLBACK=true` for §5 test-fallback endpoint
- Test harness has credentials for `pg_dump`, `psql`, and direct `SELECT` queries with both tenant contexts

**Tables covered:**

The 19 tenant-scoped communications tables:

1. `conversations`
2. `conversation_participants`
3. `messages`
4. `message_reads`
5. `message_edits`
6. `message_attachments`
7. `broadcast_audience_definitions`
8. `broadcast_audience_snapshots`
9. `saved_audiences`
10. `tenant_messaging_policy`
11. `tenant_settings_inbox`
12. `safeguarding_keywords`
13. `message_flags`
14. `oversight_access_log`
15. `announcements`
16. `notification_templates` (dual — nullable tenant_id)
17. `notifications`
18. `parent_inquiries`
19. `parent_inquiry_messages`

**Roles exercised** (per tenant):

- school_owner (admin-tier, full inbox oversight + communications)
- school_principal (admin-tier)
- school_vice_principal (admin-tier)
- admin (non-tier admin — NO oversight)
- teacher
- parent
- student
- front_office (staff, no oversight, no comms-manage)
- accounting (staff, no oversight, no comms-manage)

**Endpoint inventory (40+ endpoints across 6 controllers):**

| #   | Controller                        | Endpoint count |
| --- | --------------------------------- | -------------- |
| 1   | `AnnouncementsController`         | 8              |
| 2   | `NotificationsController`         | 5              |
| 3   | `NotificationTemplatesController` | 4              |
| 4   | `UnsubscribeController` (public)  | 1              |
| 5   | `WebhookController`               | 2              |
| 6   | `ConversationsController`         | 9              |
| 7   | `MessagesController`              | 2              |
| 8   | `InboxSettingsController`         | 6              |
| 9   | `InboxOversightController`        | 10             |
| 10  | `SavedAudiencesController`        | 8              |
| 11  | `InboxAttachmentsController`      | 1              |
| 12  | `InboxSearchController`           | 1              |
| 13  | `InboxPeopleSearchController`     | 1              |
| 14  | `ParentInquiriesController`       | 8              |
| 15  | `SafeguardingKeywordsController`  | 6              |

---

## 2. Out of Scope

This spec covers integration-level API contract + RLS + webhooks + invariants + concurrency. It does **NOT** cover:

- UI behaviour, translations, RTL, form interactions — see the four leg-1 UI specs
- BullMQ processor correctness (retry, dead-letter, cron dedup) — see `worker/communications-worker-spec.md`
- Performance budgets and load — see `perf/communications-perf-spec.md`
- OWASP categories, adversarial security, CSP/HSTS, encryption-key leak — see `security/communications-security-spec.md`

---

## 3. RLS Isolation Matrix — Tenant-Scoped Tables

For every tenant-scoped table, the tester (or Jest harness) executes the four assertions below for both read and write operations, for every applicable API endpoint **and** via direct DB access when reasonably possible.

### 3.1 Standard RLS pattern (baseline per table)

For each of the 19 tables listed in §1:

| #     | What to assert                                                                                                                                | Expected result                                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 3.1.1 | Insert one row into the table via service layer as Tenant A; verify `tenant_id = <A>` on the persisted row                                    | Row persists with `tenant_id = <A>`                                          |           |
| 3.1.2 | Logged in as Tenant B, `SELECT * FROM <table> WHERE id = '<row_id_from_3.1.1>'` with `SET app.current_tenant_id = '<B>'` → zero rows returned | Empty result set                                                             |           |
| 3.1.3 | Logged in as Tenant B, attempt to UPDATE Tenant A's row → RLS rejects (zero rows updated)                                                     | `UPDATE ... WHERE id = '<A_row>'` → 0 rows affected; `RAISE NOTICE` possible |           |
| 3.1.4 | Logged in as Tenant B, attempt to DELETE Tenant A's row → RLS rejects (zero rows deleted)                                                     | 0 rows affected                                                              |           |

### 3.2 Per-table RLS assertion rows

**Legend:** For each table row below, run assertions 3.1.1 → 3.1.4. Write your observation per table.

| #      | Table                            | Notes                                                                                | 3.1.1 | 3.1.2 | 3.1.3 | 3.1.4 |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------ | ----- | ----- | ----- | ----- |
| 3.2.1  | `conversations`                  | Baseline                                                                             |       |       |       |       |
| 3.2.2  | `conversation_participants`      | Insert requires valid conversation_id in same tenant                                 |       |       |       |       |
| 3.2.3  | `messages`                       | Tenant A message never visible via `conversation_id` path when authed as Tenant B    |       |       |       |       |
| 3.2.4  | `message_reads`                  | Cannot mark Tenant A's message as read while authed as Tenant B                      |       |       |       |       |
| 3.2.5  | `message_edits`                  | Edit history never leaks                                                             |       |       |       |       |
| 3.2.6  | `message_attachments`            | Attachment metadata never leaks; S3 key prefixed with tenant_id                      |       |       |       |       |
| 3.2.7  | `broadcast_audience_definitions` | Definition JSON never leaks                                                          |       |       |       |       |
| 3.2.8  | `broadcast_audience_snapshots`   | Recipient list is tenant-scoped                                                      |       |       |       |       |
| 3.2.9  | `saved_audiences`                | Unique constraint (`tenant_id, name`) allows same name across tenants                |       |       |       |       |
| 3.2.10 | `tenant_messaging_policy`        | Always exactly 81 rows per tenant; B's rows invisible to A                           |       |       |       |       |
| 3.2.11 | `tenant_settings_inbox`          | Unique on (tenant_id); auto-upsert on read                                           |       |       |       |       |
| 3.2.12 | `safeguarding_keywords`          | Unique (tenant_id, keyword); same keyword allowed across tenants                     |       |       |       |       |
| 3.2.13 | `message_flags`                  | Tenant A flag never visible to Tenant B                                              |       |       |       |       |
| 3.2.14 | `oversight_access_log`           | Log entries never cross                                                              |       |       |       |       |
| 3.2.15 | `announcements`                  | Baseline                                                                             |       |       |       |       |
| 3.2.16 | `notification_templates`         | **Dual policy** — `tenant_id IS NULL OR matches`; platform templates visible to both |       |       |       |       |
| 3.2.17 | `notifications`                  | Baseline                                                                             |       |       |       |       |
| 3.2.18 | `parent_inquiries`               | Baseline                                                                             |       |       |       |       |
| 3.2.19 | `parent_inquiry_messages`        | Tenant A message never visible to Tenant B                                           |       |       |       |       |

### 3.3 Platform / nullable-tenant edge case: `notification_templates`

This table allows `tenant_id IS NULL` (platform-level default templates) alongside tenant-scoped overrides.

| #     | What to assert                                                                                                                                   | Expected result                                   | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------- |
| 3.3.1 | A row with `tenant_id IS NULL` is visible to both Tenant A and Tenant B                                                                          | Row returned under both tenant contexts           |           |
| 3.3.2 | A row with `tenant_id = <A>` overrides the platform default for Tenant A lookups                                                                 | TemplateRenderer picks A's row over platform      |           |
| 3.3.3 | A row with `tenant_id = <A>` is invisible to Tenant B; Tenant B still sees the platform default                                                  | Tenant B's render uses the platform row           |           |
| 3.3.4 | Creating a template with `tenant_id IS NULL` from an authenticated request is REJECTED (only a platform migration may insert such rows)          | 403 or 422 from `POST /v1/notification-templates` |           |
| 3.3.5 | `RLS USING` clause for `notification_templates` is literally `(tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid)` | `\d+ notification_templates` in psql shows this   |           |

### 3.4 RLS enforcement on foreign-key chains

A Tenant B user attempting to read a child row via its Tenant A parent's ID must be denied at every level.

| #      | What to assert                                                                           | Expected result | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------- | --------------- | --------- |
| 3.4.1  | `GET /v1/inbox/conversations/{A_conv_id}` as Tenant B user → 404                         | 404 + no body   |           |
| 3.4.2  | `GET /v1/inbox/conversations/{A_conv_id}?page=1&pageSize=20` as Tenant B → 404           | 404             |           |
| 3.4.3  | `POST /v1/inbox/conversations/{A_conv_id}/messages` as Tenant B → 404                    | 404             |           |
| 3.4.4  | `POST /v1/inbox/messages/{A_msg_id}` (edit) as Tenant B → 404                            | 404             |           |
| 3.4.5  | `DELETE /v1/inbox/messages/{A_msg_id}` as Tenant B → 404                                 | 404             |           |
| 3.4.6  | `GET /v1/inbox/audiences/{A_audience_id}` as Tenant B → 404                              | 404             |           |
| 3.4.7  | `GET /v1/inbox/audiences/{A_audience_id}/resolve` as Tenant B → 404                      | 404             |           |
| 3.4.8  | `GET /v1/announcements/{A_announcement_id}` as Tenant B → 404                            | 404             |           |
| 3.4.9  | `POST /v1/announcements/{A_announcement_id}/publish` as Tenant B → 404                   | 404             |           |
| 3.4.10 | `GET /v1/inquiries/{A_inquiry_id}` as Tenant B → 404                                     | 404             |           |
| 3.4.11 | `POST /v1/inquiries/{A_inquiry_id}/messages` as Tenant B → 404                           | 404             |           |
| 3.4.12 | `POST /v1/inbox/oversight/conversations/{A_conv_id}/freeze` as Tenant B admin-tier → 404 | 404             |           |
| 3.4.13 | `POST /v1/inbox/oversight/conversations/{A_conv_id}/export` as Tenant B admin-tier → 404 | 404             |           |
| 3.4.14 | `POST /v1/inbox/oversight/flags/{A_flag_id}/dismiss` as Tenant B admin-tier → 404        | 404             |           |
| 3.4.15 | `POST /v1/safeguarding/keywords/{A_keyword_id}` (PATCH) as Tenant B admin-tier → 404     | 404             |           |

### 3.5 RLS bypass attempts via SQL injection in filters

Tests that confirm Zod and Prisma parameter binding defend against attempts to break out of the tenant filter.

| #     | Attempt                                                                                                                   | Expected result                                                                                                          | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.5.1 | `GET /v1/inbox/conversations?kind='; DROP TABLE conversations;--`                                                         | 422 Zod rejection (enum mismatch); DB untouched                                                                          |           |
| 3.5.2 | `GET /v1/announcements?sort=title%20UNION%20SELECT%20*%20FROM%20users`                                                    | 422 Zod rejection (enum mismatch)                                                                                        |           |
| 3.5.3 | `GET /v1/inbox/audiences?kind=dynamic' OR '1'='1`                                                                         | 422 or empty result (URL-encoded, but must fail)                                                                         |           |
| 3.5.4 | `POST /v1/inbox/conversations` with body containing Prisma relation-filter injection (`tenant_id: { in: [...]` attempted) | Zod discards extra properties; field not honoured                                                                        |           |
| 3.5.5 | Direct SQL via logged `$queryRawUnsafe` — there must be none in the codebase (lint-enforced)                              | `grep -r '$executeRawUnsafe\|$queryRawUnsafe' apps/api/src/modules/` excludes `common/middleware/rls.middleware.ts` only |           |

---

## 4. API Contract Matrix — Every Endpoint × Every Role

For each of the 80+ endpoints below, the harness executes the request as **every role** and compares against the expected status code. A green cell = expected, red cell = regression. Rows have explicit role breakdowns to prevent shorthand.

**Roles column key:**

- `O` = school_owner, `P` = school_principal, `VP` = school_vice_principal, `A` = admin (non-tier)
- `T` = teacher, `FO` = front_office, `AC` = accounting
- `PA` = parent, `ST` = student
- `U` = unauthenticated
- `X` = expected 403 or 401; `✓` = expected 2xx; `404` = expected 404; `422` = Zod rejects

### 4.1 Announcements — `/v1/announcements`

| #     | Method | Path                                    | Permission                  | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                                                             |
| ----- | ------ | --------------------------------------- | --------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------------------------------------------------------------------- |
| 4.1.1 | GET    | `/v1/announcements`                     | `communications.view`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.2 | GET    | `/v1/announcements/my`                  | `parent.view_announcements` | X\* | X\* | X\* | X\* | X   | X   | X   | ✓   | X   | 401 | (\*admin is granted via inheritance on the seed; verify current seed) |
| 4.1.3 | GET    | `/v1/announcements/:id`                 | `communications.view`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.4 | GET    | `/v1/announcements/:id/delivery-status` | `communications.view`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.5 | POST   | `/v1/announcements`                     | `communications.manage`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.6 | PATCH  | `/v1/announcements/:id`                 | `communications.manage`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.7 | POST   | `/v1/announcements/:id/publish`         | `communications.send`       | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |
| 4.1.8 | POST   | `/v1/announcements/:id/archive`         | `communications.manage`     | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                                       |

### 4.2 Notifications — `/v1/notifications`

| #     | Method | Path                              | Permission              | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                             |
| ----- | ------ | --------------------------------- | ----------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------------------------------------- |
| 4.2.1 | GET    | `/v1/notifications`               | (none — own only)       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                       |
| 4.2.2 | GET    | `/v1/notifications/unread-count`  | (none)                  | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                       |
| 4.2.3 | GET    | `/v1/notifications/admin/failed`  | `communications.view`   | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                       |
| 4.2.4 | PATCH  | `/v1/notifications/:id/read`      | (own notification only) | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 | (\* must be recipient; otherwise 404) |
| 4.2.5 | POST   | `/v1/notifications/mark-all-read` | (own only)              | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                       |

### 4.3 Notification Templates — `/v1/notification-templates`

| #     | Method | Path                             | Permission              | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail |
| ----- | ------ | -------------------------------- | ----------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| 4.3.1 | GET    | `/v1/notification-templates`     | `communications.manage` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |           |
| 4.3.2 | GET    | `/v1/notification-templates/:id` | `communications.manage` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |           |
| 4.3.3 | POST   | `/v1/notification-templates`     | `communications.manage` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |           |
| 4.3.4 | PATCH  | `/v1/notification-templates/:id` | `communications.manage` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |           |

### 4.4 Unsubscribe (public) — `/v1/notifications/unsubscribe`

| #     | Method | Path                                             | Permission | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail |
| ----- | ------ | ------------------------------------------------ | ---------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| 4.4.1 | GET    | `/v1/notifications/unsubscribe?token=<valid>`    | none       | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   |           |
| 4.4.2 | GET    | `/v1/notifications/unsubscribe?token=<tampered>` | none       | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |           |
| 4.4.3 | GET    | `/v1/notifications/unsubscribe?token=<expired>`  | none       | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 | 400 |           |

### 4.5 Webhooks — `/v1/webhooks/resend`, `/v1/webhooks/twilio`

Covered separately in §§5 and 6.

### 4.6 Conversations — `/v1/inbox`

| #      | Method | Path                                   | Permission                 | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                                                   |
| ------ | ------ | -------------------------------------- | -------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----------------------------------------------------------- |
| 4.6.1  | POST   | `/v1/inbox/conversations` (direct)     | `inbox.send`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓\* | ✓\* | 401 | (\*subject to policy engine; may 403 `INITIATION_DISABLED`) |
| 4.6.2  | POST   | `/v1/inbox/conversations` (group)      | `inbox.send`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓\* | ✓\* | 401 |                                                             |
| 4.6.3  | POST   | `/v1/inbox/conversations` (broadcast)  | `inbox.send`               | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 | (role-policy: only admin-tier broadcasts)                   |
| 4.6.4  | POST   | `/v1/inbox/conversations/:id/messages` | `inbox.send` + participant | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 |                                                             |
| 4.6.5  | POST   | `/v1/inbox/conversations/read-all`     | `inbox.read`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                             |
| 4.6.6  | POST   | `/v1/inbox/conversations/:id/read`     | `inbox.read` + participant | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 |                                                             |
| 4.6.7  | PATCH  | `/v1/inbox/conversations/:id/mute`     | `inbox.read` + participant | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 |                                                             |
| 4.6.8  | PATCH  | `/v1/inbox/conversations/:id/archive`  | `inbox.read` + participant | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 |                                                             |
| 4.6.9  | GET    | `/v1/inbox/conversations`              | `inbox.read`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                             |
| 4.6.10 | GET    | `/v1/inbox/conversations/:id`          | `inbox.read` + participant | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | ✓\* | 401 | (\* else 404 — RLS, not 403)                                |
| 4.6.11 | GET    | `/v1/inbox/state`                      | `inbox.read`               | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                             |

### 4.7 Messages — `/v1/inbox/messages`

| #     | Method | Path                     | Permission                  | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                |
| ----- | ------ | ------------------------ | --------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------------------------ |
| 4.7.1 | PATCH  | `/v1/inbox/messages/:id` | `inbox.send` + own + window | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | X   | 401 | (students cannot edit)   |
| 4.7.2 | DELETE | `/v1/inbox/messages/:id` | `inbox.send` + own          | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | X   | 401 | (students cannot delete) |

### 4.8 Inbox Settings — `/v1/inbox/settings`

| #     | Method | Path                               | Permission                                                | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                    |
| ----- | ------ | ---------------------------------- | --------------------------------------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---------------------------- |
| 4.8.1 | GET    | `/v1/inbox/settings/policy`        | `inbox.settings.read`                                     | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 | (admin-tier only per Wave 2) |
| 4.8.2 | GET    | `/v1/inbox/settings/inbox`         | `inbox.settings.read`                                     | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |                              |
| 4.8.3 | PUT    | `/v1/inbox/settings/inbox`         | `inbox.settings.write`                                    | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |                              |
| 4.8.4 | PUT    | `/v1/inbox/settings/policy`        | `inbox.settings.write`                                    | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |                              |
| 4.8.5 | POST   | `/v1/inbox/settings/policy/reset`  | `inbox.settings.write`                                    | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |                              |
| 4.8.6 | POST   | `/v1/inbox/settings/fallback/test` | `inbox.settings.write` + `INBOX_ALLOW_TEST_FALLBACK=true` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |                              |

### 4.9 Inbox Oversight — `/v1/inbox/oversight`

All 10 endpoints require `inbox.oversight.read` or `inbox.oversight.write` AND `AdminTierOnlyGuard`. Non-admin-tier roles (including `admin` role) receive 403.

| #      | Method | Path                                             | Permission              | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail |
| ------ | ------ | ------------------------------------------------ | ----------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| 4.9.1  | GET    | `/v1/inbox/oversight/conversations`              | `inbox.oversight.read`  | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.2  | GET    | `/v1/inbox/oversight/conversations/:id`          | `inbox.oversight.read`  | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.3  | GET    | `/v1/inbox/oversight/search`                     | `inbox.oversight.read`  | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.4  | POST   | `/v1/inbox/oversight/conversations/:id/freeze`   | `inbox.oversight.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.5  | POST   | `/v1/inbox/oversight/conversations/:id/unfreeze` | `inbox.oversight.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.6  | POST   | `/v1/inbox/oversight/conversations/:id/export`   | `inbox.oversight.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.7  | GET    | `/v1/inbox/oversight/flags`                      | `inbox.oversight.read`  | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.8  | POST   | `/v1/inbox/oversight/flags/:id/dismiss`          | `inbox.oversight.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.9  | POST   | `/v1/inbox/oversight/flags/:id/escalate`         | `inbox.oversight.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.9.10 | GET    | `/v1/inbox/oversight/audit-log`                  | `inbox.oversight.read`  | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |

### 4.10 Saved Audiences — `/v1/inbox/audiences`

| #      | Method | Path                              | Permission   | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                                         |
| ------ | ------ | --------------------------------- | ------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------------------------------------------------- |
| 4.10.1 | GET    | `/v1/inbox/audiences/providers`   | `inbox.send` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                   |
| 4.10.2 | POST   | `/v1/inbox/audiences/preview`     | `inbox.send` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                   |
| 4.10.3 | GET    | `/v1/inbox/audiences`             | `inbox.send` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |                                                   |
| 4.10.4 | POST   | `/v1/inbox/audiences`             | `inbox.send` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 | (policy-restricted to admin-tier in seed; verify) |
| 4.10.5 | GET    | `/v1/inbox/audiences/:id`         | `inbox.send` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                   |
| 4.10.6 | PATCH  | `/v1/inbox/audiences/:id`         | `inbox.send` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                   |
| 4.10.7 | DELETE | `/v1/inbox/audiences/:id`         | `inbox.send` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                   |
| 4.10.8 | GET    | `/v1/inbox/audiences/:id/resolve` | `inbox.send` | ✓   | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | 401 |                                                   |

### 4.11 Attachments — `/v1/inbox/attachments`

| #      | Method | Path                    | Permission   | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                                 |
| ------ | ------ | ----------------------- | ------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ----------------------------------------- |
| 4.11.1 | POST   | `/v1/inbox/attachments` | `inbox.send` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 | (file upload, size ≤ 25 MB, allowed MIME) |

### 4.12 Search — `/v1/inbox/search`, `/v1/inbox/people-search`

| #      | Method | Path                      | Permission   | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail |
| ------ | ------ | ------------------------- | ------------ | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| 4.12.1 | GET    | `/v1/inbox/search`        | `inbox.read` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |           |
| 4.12.2 | GET    | `/v1/inbox/people-search` | `inbox.send` | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | ✓   | 401 |           |

### 4.13 Parent Inquiries — `/v1/inquiries`

| #      | Method | Path                                | Permission                  | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail                            |
| ------ | ------ | ----------------------------------- | --------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ------------------------------------ |
| 4.13.1 | GET    | `/v1/inquiries`                     | `inquiries.view`            | ✓   | ✓   | ✓   | ✓   | X   | ✓\* | X   | X   | X   | 401 | (\*front_office has access per seed) |
| 4.13.2 | GET    | `/v1/inquiries/my`                  | `parent.submit_inquiry`     | X   | X   | X   | X   | X   | X   | X   | ✓   | X   | 401 |                                      |
| 4.13.3 | GET    | `/v1/inquiries/:id`                 | `inquiries.view`            | ✓   | ✓   | ✓   | ✓   | X   | ✓\* | X   | X   | X   | 401 |                                      |
| 4.13.4 | GET    | `/v1/inquiries/:id/parent`          | `parent.submit_inquiry`+own | X   | X   | X   | X   | X   | X   | X   | ✓\* | X   | 401 | (\* only parent's own)               |
| 4.13.5 | POST   | `/v1/inquiries`                     | `parent.submit_inquiry`     | X   | X   | X   | X   | X   | X   | X   | ✓   | X   | 401 |                                      |
| 4.13.6 | POST   | `/v1/inquiries/:id/messages`        | `inquiries.respond`         | ✓   | ✓   | ✓   | ✓   | X   | ✓\* | X   | X   | X   | 401 |                                      |
| 4.13.7 | POST   | `/v1/inquiries/:id/messages/parent` | `parent.submit_inquiry`+own | X   | X   | X   | X   | X   | X   | X   | ✓\* | X   | 401 |                                      |
| 4.13.8 | POST   | `/v1/inquiries/:id/close`           | `inquiries.respond`         | ✓   | ✓   | ✓   | ✓   | X   | ✓\* | X   | X   | X   | 401 |                                      |

### 4.14 Safeguarding Keywords — `/v1/safeguarding/keywords`

Requires `safeguarding.keywords.write` AND `AdminTierOnlyGuard`.

| #      | Method | Path                                    | Permission                    | O   | P   | VP  | A   | T   | FO  | AC  | PA  | ST  | U   | Pass/Fail |
| ------ | ------ | --------------------------------------- | ----------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --------- |
| 4.14.1 | GET    | `/v1/safeguarding/keywords`             | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.14.2 | POST   | `/v1/safeguarding/keywords`             | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.14.3 | POST   | `/v1/safeguarding/keywords/bulk-import` | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.14.4 | PATCH  | `/v1/safeguarding/keywords/:id`         | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.14.5 | PATCH  | `/v1/safeguarding/keywords/:id/active`  | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |
| 4.14.6 | DELETE | `/v1/safeguarding/keywords/:id`         | `safeguarding.keywords.write` | ✓   | ✓   | ✓   | X   | X   | X   | X   | X   | X   | 401 |           |

### 4.15 Response shape assertions (per endpoint group)

For every 2xx response, the harness asserts the response matches the expected Zod schema shape:

| #      | Endpoint group                        | Response shape assertions                                                                                                    | Pass/Fail |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.15.1 | List endpoints                        | `{ data: Array<T>, meta: { page: number, pageSize: number, total: number } }` — no extra fields, all three meta keys present |           |
| 4.15.2 | Detail endpoints                      | Object with `id`, `tenant_id`, `created_at`, `updated_at` (where applicable); `tenant_id` never null for tenant-scoped       |           |
| 4.15.3 | Error responses                       | `{ error: { code: string, message: string, details?: object } }` — code is UPPER_SNAKE_CASE                                  |           |
| 4.15.4 | Notification response                 | Includes `status`, `channel`, `idempotency_key?`, never includes `provider_api_key` or full `payload_json` if sensitive      |           |
| 4.15.5 | Conversation response                 | Includes `kind`, `allow_replies`, `frozen_at` (may be null), but not `freeze_reason` for non-admin roles                     |           |
| 4.15.6 | Message response                      | Includes `body` (unless `deleted_at` set, in which case `body = '[message deleted]'` for non-admin; full for admin-tier)     |           |
| 4.15.7 | Announcement delivery-status response | Includes counts per status: queued, sent, delivered, failed, read                                                            |           |

---

## 5. Webhook Signature & Replay — Resend

Webhook endpoint: `POST /v1/webhooks/resend`. Signature scheme: Svix HMAC-SHA256 (base64-encoded secret; headers `svix-id`, `svix-timestamp`, `svix-signature`).

### 5.1 Signature verification

| #     | Scenario                                                            | Expected result                                      | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 5.1.1 | Valid signature with correctly-computed HMAC                        | 200 OK, event processed                              |           |
| 5.1.2 | Signature header missing                                            | 400 `WEBHOOK_SIGNATURE_INVALID` (or 401 if per spec) |           |
| 5.1.3 | Signature computed with wrong secret                                | 400 `WEBHOOK_SIGNATURE_INVALID`                      |           |
| 5.1.4 | Signature computed over different body than posted                  | 400 `WEBHOOK_SIGNATURE_INVALID`                      |           |
| 5.1.5 | Signature over correct body but svix-timestamp older than 5 minutes | 400 `WEBHOOK_TIMESTAMP_EXPIRED`                      |           |
| 5.1.6 | Signature format malformed (not `v1,<base64>`)                      | 400 `WEBHOOK_SIGNATURE_INVALID`                      |           |
| 5.1.7 | Secret not configured in env (`RESEND_WEBHOOK_SECRET` absent)       | 501 `WEBHOOK_NOT_CONFIGURED` (safer than silent 200) |           |

### 5.2 Replay / idempotency

| #     | Scenario                                                                                     | Expected result                                                | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------- |
| 5.2.1 | Same `svix-id` posted twice within 5 min                                                     | Second post returns 200 (idempotent), no duplicate DB mutation |           |
| 5.2.2 | Each event has `svix-id` stored in `webhook_idempotency` table (or similar) to enforce dedup | Row present after first call                                   |           |
| 5.2.3 | Event with `svix-id` seen > 24 h ago: reprocess or reject — check chosen policy              | Defined behaviour documented                                   |           |

### 5.3 Event routing

Resend webhook events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.complained`, `email.bounced`, `email.opened`, `email.clicked`.

| #     | Event type                                                                            | Expected DB mutation                                                      | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 5.3.1 | `email.sent`                                                                          | `notifications.status = 'sent'`, `sent_at` = event.timestamp              |           |
| 5.3.2 | `email.delivered`                                                                     | `notifications.status = 'delivered'`, `delivered_at` = event.timestamp    |           |
| 5.3.3 | `email.bounced`                                                                       | `notifications.status = 'failed'`, `failure_reason = 'bounce: <...>'`     |           |
| 5.3.4 | `email.complained`                                                                    | `notifications.status = 'failed'` + mark recipient for unsubscribe review |           |
| 5.3.5 | `email.opened`                                                                        | Optional `read_at` or analytics sink; does NOT change `status`            |           |
| 5.3.6 | `email.clicked`                                                                       | Optional analytics sink; does NOT change `status`                         |           |
| 5.3.7 | Unknown event type                                                                    | 200 OK, silently ignored (resilient to new Resend events)                 |           |
| 5.3.8 | `provider_message_id` in payload matches existing `notifications.provider_message_id` | Correct row updated                                                       |           |
| 5.3.9 | `provider_message_id` matches no row (test data or cross-tenant)                      | 200 OK, ignored silently; no error; no orphan row                         |           |

### 5.4 Cross-tenant safety

| #     | Scenario                                                                                                       | Expected result                                         | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 5.4.1 | Webhook references `provider_message_id` that belongs to Tenant A → writes to Tenant A's notification row only | Row update scoped to tenant_id of matching notification |           |
| 5.4.2 | Handler does NOT impersonate a tenant context; uses admin-level lookup by `provider_message_id`                | Handler authenticated via webhook signature, not JWT    |           |

### 5.5 Handler environment & observability

| #     | Scenario                                                                       | Expected result        | Pass/Fail |
| ----- | ------------------------------------------------------------------------------ | ---------------------- | --------- |
| 5.5.1 | Handler logs `[ResendWebhook] event=<type> notification_id=<...> status=<...>` | Log line present       |           |
| 5.5.2 | Handler emits Sentry breadcrumb on `email.bounced` and `email.complained`      | Sentry payload visible |           |
| 5.5.3 | Handler does NOT log the full body (may contain recipient email + payload)     | Log line omits PII     |           |

---

## 6. Webhook Signature & Replay — Twilio SMS + WhatsApp

Webhook endpoint: `POST /v1/webhooks/twilio`. Signature scheme: HMAC-SHA1 (header `X-Twilio-Signature`).

### 6.1 Signature verification

| #     | Scenario                                                                                 | Expected result                                  | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| 6.1.1 | Valid signature: HMAC-SHA1(URL + sorted POST params, auth_token) matches header          | 200 OK                                           |           |
| 6.1.2 | Signature header missing                                                                 | 400 `WEBHOOK_SIGNATURE_INVALID`                  |           |
| 6.1.3 | Signature computed over query string not sorted                                          | 400 (Twilio sorts alphabetically before signing) |           |
| 6.1.4 | Signature over URL without `https://` scheme                                             | 400 (scheme must match exactly)                  |           |
| 6.1.5 | Signature over URL with different host (e.g., `http://localhost` vs production hostname) | 400                                              |           |
| 6.1.6 | Auth token not configured (`TWILIO_AUTH_TOKEN` absent)                                   | 501 `WEBHOOK_NOT_CONFIGURED`                     |           |

### 6.2 Event routing (MessageStatus values)

Twilio webhooks send `MessageStatus` ∈ { accepted, queued, sending, sent, failed, delivered, undelivered, receiving, received, read }.

| #     | MessageStatus                   | Expected DB mutation                                                             | Pass/Fail |
| ----- | ------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 6.2.1 | `sent`                          | `notifications.status = 'sent'`, `sent_at` = now                                 |           |
| 6.2.2 | `delivered`                     | `notifications.status = 'delivered'`, `delivered_at` = now                       |           |
| 6.2.3 | `failed`                        | `notifications.status = 'failed'`, `failure_reason = 'ErrorCode: <Twilio code>'` |           |
| 6.2.4 | `undelivered`                   | `notifications.status = 'failed'`, `failure_reason = 'undelivered: <code>'`      |           |
| 6.2.5 | `read` (WhatsApp only)          | `notifications.read_at = now`                                                    |           |
| 6.2.6 | `queued`, `sending`, `accepted` | Ignored (already tracked)                                                        |           |

### 6.3 Replay / idempotency

| #     | Scenario                                                                                               | Expected result                         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------- |
| 6.3.1 | Same `MessageSid` posted twice — second post must be no-op                                             | No duplicate mutation                   |           |
| 6.3.2 | Out-of-order events (delivered received before sent) — status transitions honour forward-only ordering | Final status reflects latest real state |           |

### 6.4 WhatsApp-specific events

| #     | Scenario                                                                                                        | Expected result                 | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 6.4.1 | Twilio posts WhatsApp message with `From = whatsapp:+...`                                                       | Handler routes to WhatsApp lane |           |
| 6.4.2 | 24-hour session window expired — Twilio returns `63016`; `notifications.failure_reason = '24h_session_expired'` | Matching error code stored      |           |
| 6.4.3 | Template not approved — `63003`; failure surfaced                                                               | Error stored                    |           |

---

## 7. Zod Validation Edge Cases

Each row tests a boundary of a Zod schema in `packages/shared/src/inbox/schemas/` or `packages/shared/src/schemas/`.

### 7.1 `createAnnouncementSchema`

| #      | Payload fragment                                                       | Expected result                                                   | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 7.1.1  | Missing `title`                                                        | 422 `title: Required`                                             |           |
| 7.1.2  | `title` = '' (empty)                                                   | 422 `title: minimum 1 char`                                       |           |
| 7.1.3  | `title` = 256 chars                                                    | 422 `title: maximum 255`                                          |           |
| 7.1.4  | `title` = 255 chars                                                    | 200 / 201 accepted                                                |           |
| 7.1.5  | `body_html` with `<script>` tag                                        | 422 — body_html rejected or sanitized; exact behaviour documented |           |
| 7.1.6  | `scope` = 'unknown_scope'                                              | 422 enum mismatch                                                 |           |
| 7.1.7  | `scope` = 'year_group' without `target_payload.year_group_id`          | 422 refine failure                                                |           |
| 7.1.8  | `scope` = 'school' with extra `target_payload` (e.g., `year_group_id`) | Accepted but extras ignored (Zod strips unknown keys)             |           |
| 7.1.9  | `scheduled_publish_at` in the past                                     | 422 refine: must be future                                        |           |
| 7.1.10 | `delivery_channels` = [] (empty)                                       | 422 refine: at least one channel                                  |           |
| 7.1.11 | `delivery_channels` = ['in_app', 'invalid']                            | 422 enum mismatch                                                 |           |

### 7.2 `createConversationSchema` (discriminated union)

| #      | Payload fragment                                                  | Expected result                                           | Pass/Fail |
| ------ | ----------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 7.2.1  | `kind` = 'unknown_kind'                                           | 422 discriminator mismatch                                |           |
| 7.2.2  | `kind` = 'direct' without `recipient_user_id`                     | 422 required field                                        |           |
| 7.2.3  | `kind` = 'direct' with `recipient_user_id` = own user_id          | 422 refine: cannot message self                           |           |
| 7.2.4  | `kind` = 'group' with `participant_user_ids` = [] (empty)         | 422 refine: at least 2 participants                       |           |
| 7.2.5  | `kind` = 'group' with `participant_user_ids` = 50 items           | 422 refine: max 49                                        |           |
| 7.2.6  | `kind` = 'group' with duplicate IDs in `participant_user_ids`     | 422 refine: no duplicates                                 |           |
| 7.2.7  | `kind` = 'group' without `subject`                                | 422 required                                              |           |
| 7.2.8  | `kind` = 'broadcast' with both `audience` AND `saved_audience_id` | 422 refine: exactly one of the two                        |           |
| 7.2.9  | `kind` = 'broadcast' with neither                                 | 422 refine                                                |           |
| 7.2.10 | `kind` = 'broadcast' without `body`                               | 422 required                                              |           |
| 7.2.11 | `body` = '' (empty)                                               | 422 min 1 char                                            |           |
| 7.2.12 | `body` = 100000 chars                                             | 422 max length (check actual max — likely 10000 or 50000) |           |
| 7.2.13 | `attachments` = 11 items (over max 10)                            | 422 refine                                                |           |
| 7.2.14 | `extra_channels` = ['in_app']                                     | 422 — in_app is implicit, not allowed in extra            |           |
| 7.2.15 | `extra_channels` = ['invalid_channel']                            | 422 enum mismatch                                         |           |

### 7.3 `audienceDefinitionSchema` (nested discriminated union)

| #      | Definition                                                            | Expected result                                        | Pass/Fail |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 7.3.1  | `{ provider: 'school' }` (no params)                                  | Accepted                                               |           |
| 7.3.2  | `{ provider: 'class_parents', params: { class_id: <valid> } }`        | Accepted                                               |           |
| 7.3.3  | `{ provider: 'class_parents' }` (no params)                           | 422 required `class_id`                                |           |
| 7.3.4  | `{ provider: 'handpicked', params: { user_ids: [] } }`                | 422 refine min 1                                       |           |
| 7.3.5  | `{ provider: 'saved_group', params: { saved_audience_id: <valid> } }` | Accepted; resolved transitively                        |           |
| 7.3.6  | `{ provider: 'saved_group' }` with cross-tenant saved_audience_id     | 404 on resolve (RLS); accepted at schema level         |           |
| 7.3.7  | Nested tree: `{ provider: 'union', params: { children: [A, B] } }`    | Accepted if union provider is wired                    |           |
| 7.3.8  | Cycle: saved_group A refers to saved_group B refers to A              | Resolver detects cycle → 409 `AUDIENCE_CYCLE_DETECTED` |           |
| 7.3.9  | Unknown provider key                                                  | 422 discriminator mismatch                             |           |
| 7.3.10 | Deep nesting beyond safe limit                                        | 422 refine or 500 stack-overflow safeguard             |           |

### 7.4 `attachmentInputSchema`

| #     | Attachment                                          | Expected result                            | Pass/Fail |
| ----- | --------------------------------------------------- | ------------------------------------------ | --------- |
| 7.4.1 | `mime_type` = 'application/pdf'                     | Accepted                                   |           |
| 7.4.2 | `mime_type` = 'image/gif'                           | 422 — not in ALLOWED_ATTACHMENT_MIME_TYPES |           |
| 7.4.3 | `mime_type` = 'application/x-msdownload' (exe)      | 422                                        |           |
| 7.4.4 | `size_bytes` = 26 _ 1024 _ 1024 (> 25 MB)           | 422 max size                               |           |
| 7.4.5 | `size_bytes` = 0                                    | 422 min > 0                                |           |
| 7.4.6 | `storage_key` without tenant prefix                 | 422 refine or 403 from AttachmentValidator |           |
| 7.4.7 | `filename` = 256 chars                              | 422 max 255                                |           |
| 7.4.8 | `filename` with path traversal (`../../etc/passwd`) | 422 or stripped by validator               |           |

### 7.5 `safeguardingKeywordSchema`

| #     | Payload                                               | Expected result                                 | Pass/Fail |
| ----- | ----------------------------------------------------- | ----------------------------------------------- | --------- |
| 7.5.1 | `keyword` = '' (empty)                                | 422 min 1                                       |           |
| 7.5.2 | `keyword` = 256 chars                                 | 422 max 255                                     |           |
| 7.5.3 | `severity` = 'critical'                               | 422 enum mismatch                               |           |
| 7.5.4 | Bulk import 2001 keywords                             | 422 refine max 2000                             |           |
| 7.5.5 | Bulk import with duplicate keywords in payload        | 422 refine or database-level unique rejection   |           |
| 7.5.6 | Keyword containing regex special chars (e.g., `.*+?`) | Accepted; scanner regex-escapes before matching |           |

### 7.6 `updateInboxSettingsSchema`

| #     | Payload                                                     | Expected result                    | Pass/Fail |
| ----- | ----------------------------------------------------------- | ---------------------------------- | --------- |
| 7.6.1 | `edit_window_minutes` = 61                                  | 422 max 60                         |           |
| 7.6.2 | `edit_window_minutes` = -1                                  | 422 min 0                          |           |
| 7.6.3 | `retention_days` = 29                                       | 422 refine min 30                  |           |
| 7.6.4 | `retention_days` = 3651                                     | 422 refine max 3650                |           |
| 7.6.5 | `retention_days` = null                                     | Accepted (retention disabled)      |           |
| 7.6.6 | `fallback_admin_enabled=true`, `fallback_admin_channels=[]` | 422 refine: non-empty when enabled |           |
| 7.6.7 | `fallback_admin_after_hours` = 0                            | 422 min 1                          |           |
| 7.6.8 | `fallback_admin_after_hours` = 169                          | 422 max 168                        |           |

---

## 8. State-Machine Transitions

### 8.1 Announcement status

Valid transitions: `draft → pending_approval → scheduled`, `draft → scheduled`, `draft/scheduled → published`, `any → archived`.

| #      | Transition               | Method of invocation                            | Expected                       | Pass/Fail |
| ------ | ------------------------ | ----------------------------------------------- | ------------------------------ | --------- |
| 8.1.1  | draft → draft            | PATCH body only                                 | Accepted                       |           |
| 8.1.2  | draft → pending_approval | (If approval workflow wired)                    | Accepted via approvals module  |           |
| 8.1.3  | draft → scheduled        | POST publish with future `scheduled_publish_at` | Accepted; cron dedupe key set  |           |
| 8.1.4  | draft → published        | POST publish without scheduled_publish_at       | Accepted; `published_at = now` |           |
| 8.1.5  | scheduled → published    | Cron fires or manual publish                    | Accepted                       |           |
| 8.1.6  | published → archived     | POST archive                                    | Accepted                       |           |
| 8.1.7  | archived → published     | POST publish                                    | 409 `INVALID_STATE_TRANSITION` |           |
| 8.1.8  | published → draft        | PATCH                                           | 409 `CANNOT_EDIT_PUBLISHED`    |           |
| 8.1.9  | published → published    | POST publish again                              | 409 `ALREADY_PUBLISHED`        |           |
| 8.1.10 | archived → archived      | POST archive                                    | 409 `ALREADY_ARCHIVED`         |           |

### 8.2 Notification status

Valid transitions: `queued → sent → delivered → read` (email/sms/whatsapp); `queued → delivered → read` (in_app); any state → `failed` on error.

| #     | Transition                | Expected                                          | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------- | --------- |
| 8.2.1 | queued → sent             | Dispatch processor updates                        |           |
| 8.2.2 | sent → delivered          | Webhook event updates                             |           |
| 8.2.3 | delivered → read (in_app) | User reads via `PATCH /v1/notifications/:id/read` |           |
| 8.2.4 | delivered → failed        | Illegal — not a valid backward transition         |           |
| 8.2.5 | queued → failed           | Dispatch error                                    |           |
| 8.2.6 | sent → failed             | Bounce webhook                                    |           |
| 8.2.7 | failed → queued           | Retry mechanism                                   |           |

### 8.3 ParentInquiry status

Valid transitions: `open → in_progress → closed`.

| #     | Transition                          | Expected                       | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------ | --------- |
| 8.3.1 | open → in_progress                  | Automatic on first admin reply |           |
| 8.3.2 | in_progress → closed                | Manual close by admin          |           |
| 8.3.3 | open → closed (without admin reply) | Accepted                       |           |
| 8.3.4 | closed → open                       | Not supported in current API   |           |
| 8.3.5 | closed → in_progress                | Not supported                  |           |

### 8.4 MessageFlag review_state

Valid transitions: `pending → dismissed`, `pending → escalated`, `escalated → frozen`.

| #     | Transition            | Expected                                       | Pass/Fail |
| ----- | --------------------- | ---------------------------------------------- | --------- |
| 8.4.1 | pending → dismissed   | POST dismiss                                   |           |
| 8.4.2 | pending → escalated   | POST escalate                                  |           |
| 8.4.3 | dismissed → escalated | 409 `INVALID_FLAG_TRANSITION`                  |           |
| 8.4.4 | escalated → frozen    | Automatic if corresponding conversation frozen |           |
| 8.4.5 | frozen → any          | 409 — terminal                                 |           |

### 8.5 Conversation freeze state

Valid: `unfrozen ↔ frozen`.

| #     | Transition          | Expected                                 | Pass/Fail |
| ----- | ------------------- | ---------------------------------------- | --------- |
| 8.5.1 | unfrozen → frozen   | POST freeze with reason                  |           |
| 8.5.2 | frozen → unfrozen   | POST unfreeze                            |           |
| 8.5.3 | frozen → frozen     | POST freeze again → 409 `ALREADY_FROZEN` |           |
| 8.5.4 | unfrozen → unfrozen | POST unfreeze → 409 `NOT_FROZEN`         |           |

---

## 9. Machine-Executable Data Invariants

These are the SQL queries that the Jest harness executes automatically after each flow. They complement (not replace) the UI spec's invariants — this is the exhaustive version.

### 9.1 Global tenant invariant

| #     | Query                                                                                             | Expected                        | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------- | ------------------------------- | --------- |
| 9.1.1 | `SELECT COUNT(*) FROM conversations WHERE tenant_id IS NULL`                                      | 0                               |           |
| 9.1.2 | Same for messages, conversation_participants, message_reads, message_edits, message_attachments   | 0 each                          |           |
| 9.1.3 | Same for announcements, notifications, parent_inquiries, parent_inquiry_messages, saved_audiences | 0 each                          |           |
| 9.1.4 | Same for broadcast*\*, tenant*\*, safeguarding_keywords, message_flags, oversight_access_log      | 0 each                          |           |
| 9.1.5 | `notification_templates` with `tenant_id IS NULL` — only permitted for system-flagged rows        | `is_system = true` for all such |           |

### 9.2 Referential integrity (orphan-row sweep)

| #      | Query                                                                                        | Expected | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------- | -------- | --------- |
| 9.2.1  | `conversation_participants` without `conversations`                                          | 0        |           |
| 9.2.2  | `messages` without `conversations`                                                           | 0        |           |
| 9.2.3  | `message_reads` without `messages`                                                           | 0        |           |
| 9.2.4  | `message_edits` without `messages`                                                           | 0        |           |
| 9.2.5  | `message_attachments` without `messages`                                                     | 0        |           |
| 9.2.6  | `broadcast_audience_definitions` without `conversations`                                     | 0        |           |
| 9.2.7  | `broadcast_audience_snapshots` without `conversations`                                       | 0        |           |
| 9.2.8  | `message_flags` without `messages`                                                           | 0        |           |
| 9.2.9  | `parent_inquiry_messages` without `parent_inquiries`                                         | 0        |           |
| 9.2.10 | `notifications.source_entity_id` (type `announcement`) referencing non-existent announcement | 0        |           |

### 9.3 Uniqueness

| #     | Query                                                                              | Expected      | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------- | ------------- | --------- |
| 9.3.1 | `(conversation_id, user_id)` is unique in `conversation_participants`              | No duplicates |           |
| 9.3.2 | `(message_id, user_id)` is unique in `message_reads`                               | No duplicates |           |
| 9.3.3 | `(tenant_id, keyword)` is unique in `safeguarding_keywords`                        | No duplicates |           |
| 9.3.4 | `(tenant_id, name)` is unique in `saved_audiences`                                 | No duplicates |           |
| 9.3.5 | `(tenant_id, sender_role, recipient_role)` is unique in `tenant_messaging_policy`  | No duplicates |           |
| 9.3.6 | `(tenant_id, idempotency_key)` is unique in `notifications` (when key is non-null) | No duplicates |           |

### 9.4 Denormalized counters

| #     | Query                                                                                                                                  | Expected       | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 9.4.1 | `conversations.last_message_at` equals max(`messages.created_at`) for that conversation                                                | Equal (±1 sec) |           |
| 9.4.2 | `conversation_participants.unread_count` equals count of messages in conversation where `created_at > last_read_at` and sender != user | Equal          |           |
| 9.4.3 | `messages.attachment_count` equals count of `message_attachments` for that message                                                     | Equal          |           |
| 9.4.4 | `broadcast_audience_snapshots.resolved_count` equals `array_length(recipient_user_ids, 1)`                                             | Equal          |           |

### 9.5 Cross-check: message_reads vs unread_count after mark-read

| #     | Flow                                                                                                    | Invariant | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------- | --------- | --------- |
| 9.5.1 | Send 5 messages to user U in conversation C; confirm `conversation_participants.unread_count = 5` for U | Yes       |           |
| 9.5.2 | POST `/v1/inbox/conversations/C/read` → `unread_count = 0`, 5 rows in `message_reads`                   | Yes       |           |
| 9.5.3 | Send 3 more messages → `unread_count = 3`                                                               | Yes       |           |

### 9.6 Sequence / audit integrity

| #     | Query                                                                                                                                                 | Expected | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| 9.6.1 | For every `conversations.frozen_at` set: there is an `oversight_access_log` row with `action='freeze'` and matching `conversation_id`                 | Yes      |           |
| 9.6.2 | For every `conversations.frozen_at = NULL` after being set: there is an `oversight_access_log` row with `action='unfreeze'`                           | Yes      |           |
| 9.6.3 | For every `oversight_access_log` row: `actor_user_id` has a valid role in an admin-tier role at the time (check via user_roles snapshot if available) | Yes      |           |
| 9.6.4 | No `oversight_access_log` rows authored by SYSTEM_USER_SENTINEL unless explicitly allowed (freeze-by-system path)                                     | Yes      |           |

---

## 10. Concurrency / Race Conditions

### 10.1 Parallel publish

| #      | Scenario                                                                           | Expected                                                                        | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Two admins simultaneously `POST /v1/announcements/{id}/publish` for the same draft | One 200, one 409 `ALREADY_PUBLISHED`; exactly one publish job enqueued          |           |
| 10.1.2 | Publish with scheduled_publish_at + cron fires at same moment                      | Idempotency via jobId dedupe: only one job runs, one notification batch emitted |           |
| 10.1.3 | Race: publish → archive mid-flight                                                 | Archive after publish completes; no orphan notifications                        |           |

### 10.2 Parallel compose / send

| #      | Scenario                                                                                   | Expected                                                                               | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | 10 messages sent concurrently to the same conversation                                     | All 10 persisted with unique IDs; `last_message_at` equals max timestamp               |           |
| 10.2.2 | `unread_count` after 10 concurrent sends from N different senders to one receiver = N × 10 | Exact — counter update is atomic (transactional)                                       |           |
| 10.2.3 | Parallel send + mark-read                                                                  | Final state deterministic: `unread_count` reflects messages created after last_read_at |           |

### 10.3 Parallel freeze

| #      | Scenario                                                                                                 | Expected                                                                                    | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | Two admins simultaneously freeze the same conversation                                                   | One 200, one 409 `ALREADY_FROZEN`; two `oversight_access_log` rows (one freeze, one denied) |           |
| 10.3.2 | Freeze during in-flight send: message persisted just before freeze stays; after freeze, sends return 409 | Transactional consistency                                                                   |           |

### 10.4 Parallel saved-audience update

| #      | Scenario                                        | Expected                                              | Pass/Fail |
| ------ | ----------------------------------------------- | ----------------------------------------------------- | --------- |
| 10.4.1 | Two PATCHes to the same audience simultaneously | Last write wins; `updated_at` reflects latest         |           |
| 10.4.2 | Concurrent resolve during PATCH                 | Resolve reads either old or new definition atomically |           |

### 10.5 Parallel flag action

| #      | Scenario                                                   | Expected                                                                 | Pass/Fail |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| 10.5.1 | Two admins simultaneously dismiss the same flag            | One 200, one 409 `FLAG_ALREADY_REVIEWED`                                 |           |
| 10.5.2 | Admin dismisses while a new message (same keyword) arrives | New flag row created for the new message; dismissed flag stays dismissed |           |

### 10.6 Parallel policy reset

| #      | Scenario                                                         | Expected                                                                   | Pass/Fail |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 10.6.1 | Two admins simultaneously `POST /v1/inbox/settings/policy/reset` | Both succeed (idempotent); matrix equals defaults                          |           |
| 10.6.2 | Save + reset race                                                | One wins; final state is either reset-defaults or user's save, never a mix |           |

### 10.7 Notification idempotency under retry

| #      | Scenario                                                                  | Expected                                                                  | Pass/Fail |
| ------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 10.7.1 | Worker retries a job after partial success (email sent, DB update failed) | Subsequent retry is idempotent — `idempotency_key` prevents duplicate row |           |
| 10.7.2 | Two worker replicas pick up the same job (BullMQ + lock)                  | Only one runs; other is rejected or waits                                 |           |

### 10.8 Broadcast audience snapshot atomicity

| #      | Scenario                                                                                                                  | Expected                                          | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 10.8.1 | Admin broadcast → snapshot created → participants added; new user joining the class mid-flight is NOT retroactively added | Snapshot is frozen at broadcast time              |           |
| 10.8.2 | Concurrent broadcast from two admins using the same dynamic audience                                                      | Two separate snapshots, each frozen independently |           |

---

## 11. Encrypted / Sensitive Field Handling

### 11.1 `provider_message_id` exposure

| #      | Scenario                                                                | Expected                             | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | ------------------------------------ | --------- |
| 11.1.1 | `GET /v1/notifications` response includes `provider_message_id`?        | No — internal only; omitted from DTO |           |
| 11.1.2 | Admin can see `provider_message_id` in `/v1/notifications/admin/failed` | Yes — for debugging                  |           |
| 11.1.3 | Parent can see `provider_message_id`                                    | No                                   |           |

### 11.2 Twilio / Resend API keys

| #      | Scenario                                                                             | Expected                         | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------- | --------- |
| 11.2.1 | API logs after a send request do NOT include `TWILIO_AUTH_TOKEN` or `RESEND_API_KEY` | Log line shows only last 4 chars |           |
| 11.2.2 | `GET /api/v1/configuration` or similar endpoint never returns the keys               | 404 or filtered                  |           |
| 11.2.3 | Sentry breadcrumbs do NOT include the keys                                           | Verified                         |           |

### 11.3 Unsubscribe token

| #      | Scenario                                                                                    | Expected                                                              | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 11.3.1 | Unsubscribe tokens are HMAC-signed with a server secret                                     | Yes — `UnsubscribeService` uses `crypto.createHmac('sha256', secret)` |           |
| 11.3.2 | Tokens are URL-safe base64 + signature                                                      | Yes                                                                   |           |
| 11.3.3 | Token includes `user_id + template_key + expiry`, signature over all                        | Yes                                                                   |           |
| 11.3.4 | Tampered token → 400 rejection                                                              | Yes                                                                   |           |
| 11.3.5 | Expired token → 400 rejection                                                               | Yes                                                                   |           |
| 11.3.6 | Token cannot be used to unsubscribe a different user (user_id embedded, signature protects) | Yes                                                                   |           |

### 11.4 Attachment storage_key

| #      | Scenario                                                                                | Expected                                  | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 11.4.1 | `storage_key` is always prefixed with `{tenant_id}/inbox/attachments/{uuid}-{filename}` | Yes — `AttachmentValidator` checks prefix |           |
| 11.4.2 | Attempt to attach a `storage_key` from another tenant                                   | 403 `ATTACHMENT_CROSS_TENANT`             |           |
| 11.4.3 | Presigned URL for download is short-lived (≤ 15 min)                                    | Yes                                       |           |
| 11.4.4 | Presigned URL cannot be used cross-tenant (verified by S3 bucket policy)                | Yes                                       |           |

---

## 12. Audit Log Integrity

### 12.1 OversightAccessLog

| #      | Assertion                                                                                              | Expected                       | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | ------------------------------ | --------- |
| 12.1.1 | Every call to `GET /v1/inbox/oversight/conversations/:id` writes one row with `action='read_thread'`   | Yes                            |           |
| 12.1.2 | Every `GET /v1/inbox/oversight/search?q=...` writes one row with `action='search'`                     | Yes                            |           |
| 12.1.3 | Every freeze writes one row with `action='freeze'`, and unfreeze writes `action='unfreeze'`            | Yes                            |           |
| 12.1.4 | Every flag dismiss/escalate writes a row                                                               | Yes                            |           |
| 12.1.5 | Every export writes a row with `action='export_thread'`                                                | Yes                            |           |
| 12.1.6 | Audit log rows are **immutable** — no UPDATE or DELETE should ever succeed                             | DB: no trigger allows mutation |           |
| 12.1.7 | Admin-tier who attempts to write an oversight_access_log row directly is rejected (no public endpoint) | 404                            |           |

### 12.2 Message edit history

| #      | Assertion                                                                      | Expected | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | -------- | --------- |
| 12.2.1 | Every `PATCH /v1/inbox/messages/:id` appends one `message_edits` row           | Yes      |           |
| 12.2.2 | `message_edits.previous_body` equals the `messages.body` value before the edit | Yes      |           |
| 12.2.3 | `message_edits` rows are immutable (no API to modify once persisted)           | Yes      |           |

### 12.3 Admin inquiry reply audit

| #      | Assertion                                                                                              | Expected | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | -------- | --------- |
| 12.3.1 | Every admin reply appends a `parent_inquiry_messages` row with `author_type='staff'`, `author_user_id` | Yes      |           |
| 12.3.2 | Status auto-transition `open → in_progress` logged (if audit module tracks this)                       | Yes      |           |

---

## 13. Unsubscribe Token & Public Endpoints

### 13.1 `GET /v1/notifications/unsubscribe`

| #      | Scenario                                                                                          | Expected                                 | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------- | --------- |
| 13.1.1 | Valid token for `user_id + template_key + expiry` → 302 redirect to `/unsubscribed`               | 302 + `Location: {APP_URL}/unsubscribed` |           |
| 13.1.2 | DB row `notification_preferences` set (or equivalent) with `opt_out = true` for that template_key | Row present                              |           |
| 13.1.3 | Invalid signature → 400                                                                           | 400                                      |           |
| 13.1.4 | Expired token (beyond expiry) → 400                                                               | 400                                      |           |
| 13.1.5 | Token for deleted user → 400 or graceful redirect                                                 | Defined behaviour                        |           |
| 13.1.6 | Token is URL-safe — no `+` `/` `=` that break email-client links                                  | Yes                                      |           |
| 13.1.7 | Replay: valid token used twice → both 302; second call is idempotent (no duplicate row)           | Yes                                      |           |
| 13.1.8 | This endpoint has NO auth — any unauthenticated client can hit it                                 | 302 or 400 only, never 401               |           |

---

## 14. Sign-off

| Section                | Reviewer | Date | Pass | Fail | Notes |
| ---------------------- | -------- | ---- | ---- | ---- | ----- |
| 3. RLS matrix          |          |      |      |      |       |
| 4. API contract matrix |          |      |      |      |       |
| 5. Resend webhook      |          |      |      |      |       |
| 6. Twilio webhook      |          |      |      |      |       |
| 7. Zod validation      |          |      |      |      |       |
| 8. State machines      |          |      |      |      |       |
| 9. Data invariants     |          |      |      |      |       |
| 10. Concurrency        |          |      |      |      |       |
| 11. Encrypted fields   |          |      |      |      |       |
| 12. Audit log          |          |      |      |      |       |
| 13. Unsubscribe        |          |      |      |      |       |

**Integration spec is release-ready when all 11 sections are signed off at Pass with zero P0/P1 findings outstanding. A single 422 instead of 403 (or vice versa) in §4 is a P1 regression that blocks release.**
