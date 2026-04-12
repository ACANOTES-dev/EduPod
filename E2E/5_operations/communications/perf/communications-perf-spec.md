# Performance Test Specification: Communications Module

> **Leg 4 of the `/e2e-full` release-readiness pack.** This spec exercises what the UI, integration, and worker specs cannot: request latency under load, endpoint scaling at realistic data volumes, bundle / page-weight budgets, and contention on shared resources. Runnable by k6 / Artillery / Lighthouse against a staging environment seeded at scale.

**Module:** Communications
**Target executor:** k6 (load), Lighthouse (page), BullMQ load script (worker), `pg_stat_statements` + EXPLAIN ANALYZE (DB)
**Baseline tenant:** `nhqs`, seeded per §3 **Perf Seed** below.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [Perf seed baseline](#3-perf-seed-baseline)
4. [Endpoint latency budgets](#4-endpoint-latency-budgets)
5. [Scale matrix — list endpoints on 10k+ rows](#5-scale-matrix)
6. [Full-text search performance](#6-fts-performance)
7. [Audience resolution performance](#7-audience-resolution)
8. [PDF export render time](#8-pdf-export)
9. [Worker throughput](#9-worker-throughput)
10. [Page-weight + bundle budgets (Lighthouse)](#10-page-weight)
11. [Contention & concurrency under load](#11-contention)
12. [Cold-start and connection-pool behaviour](#12-cold-start)
13. [DB query analysis (EXPLAIN + pg_stat_statements)](#13-db-query-analysis)
14. [Redis / BullMQ memory footprint](#14-redis-memory)
15. [Endpoints without budgets (coverage hole)](#15-coverage-hole)
16. [Sign-off](#16-sign-off)

---

## 1. Prerequisites

- Staging environment: 1 API instance (2 vCPU, 4 GB), 1 worker (2 vCPU, 2 GB), Postgres (2 vCPU, 4 GB, pg_stat_statements ON), Redis (1 GB memory)
- Seeded to match §3
- k6 or Artillery installed locally
- Lighthouse CI available (`npx @lhci/cli`)
- Playwright with `--trace on` for per-page network + CPU profiling
- Direct DB access for `EXPLAIN ANALYZE` and `pg_stat_statements` queries
- Redis access for BullMQ size / lag measurements

---

## 2. Out of Scope

This spec covers performance. It does **NOT** cover:

- Functional correctness — see leg-1 UI specs
- API contract / RLS — see `integration/communications-integration-spec.md`
- Worker correctness — see `worker/communications-worker-spec.md`
- Security (rate-limit abuse, DoS with malicious payloads) — see `security/communications-security-spec.md`
- Production-peak simulation (100k+ concurrent users) — deferred to pre-launch load-testing cycle

---

## 3. Perf Seed Baseline

For `nhqs` tenant, seed the DB with:

| Entity                         | Count                          | Notes                                                              |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------ |
| Users                          | 2,500                          | 200 staff, 1,800 parents, 500 students                             |
| Conversations                  | 10,000                         | mix: 6,000 direct, 3,000 group, 1,000 broadcast                    |
| Messages                       | 80,000                         | ~8 per conversation on average; 500 messages in the largest thread |
| conversation_participants      | 35,000                         |                                                                    |
| message_reads                  | 150,000                        |                                                                    |
| message_edits                  | 5,000                          |                                                                    |
| message_attachments            | 6,000                          |                                                                    |
| saved_audiences                | 50                             | mix 30 static, 20 dynamic                                          |
| broadcast_audience_definitions | 1,000                          |                                                                    |
| broadcast_audience_snapshots   | 1,000                          |                                                                    |
| announcements                  | 2,000                          | 1,500 published, 300 draft, 100 scheduled, 100 archived            |
| notifications                  | 50,000                         | mix of channels, status                                            |
| parent_inquiries               | 500                            |                                                                    |
| parent_inquiry_messages        | 3,000                          |                                                                    |
| message_flags                  | 800                            |                                                                    |
| oversight_access_log           | 3,000                          |                                                                    |
| safeguarding_keywords          | 50                             |                                                                    |
| notification_templates         | 20 tenant-scoped + 10 platform | English + Arabic                                                   |

Seeder script path: `apps/api/scripts/perf-seed.ts` (build this if absent; documented target).

---

## 4. Endpoint Latency Budgets

Test each endpoint at p50, p95, p99 using k6 with 10 virtual users for 60 s. All endpoints are tested under the `nhqs` seed above.

### 4.1 Inbox — list / detail / create

| #      | Endpoint                                                  | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                                                               | Pass/Fail |
| ------ | --------------------------------------------------------- | ------ | ------ | ------ | ----------------------------------------------------------------------------------- | --------- |
| 4.1.1  | `GET /v1/inbox/conversations` (page 1, 20 rows)           | 120 ms | 300 ms | 600 ms | Common list; needs index on (tenant_id, user_id, archived_at, last_message_at DESC) |           |
| 4.1.2  | `GET /v1/inbox/conversations` (page 50, 20 rows)          | 200 ms | 500 ms | 900 ms | Deep pagination; keyset recommended                                                 |           |
| 4.1.3  | `GET /v1/inbox/conversations?unread_only=true`            | 150 ms | 350 ms | 700 ms | Filtered                                                                            |           |
| 4.1.4  | `GET /v1/inbox/conversations?kind=broadcast`              | 150 ms | 350 ms | 700 ms |                                                                                     |           |
| 4.1.5  | `GET /v1/inbox/conversations/:id` (thread with 500 msgs)  | 300 ms | 700 ms | 1.2 s  | Must paginate messages; test verifies default `pageSize=50`                         |           |
| 4.1.6  | `GET /v1/inbox/state`                                     | 50 ms  | 150 ms | 300 ms | Highly frequent — polled every 30 s                                                 |           |
| 4.1.7  | `POST /v1/inbox/conversations` (direct)                   | 250 ms | 500 ms | 900 ms | Policy + relational scope check + DB insert                                         |           |
| 4.1.8  | `POST /v1/inbox/conversations` (broadcast 500 recipients) | 800 ms | 1.5 s  | 2.5 s  | Audience resolve + snapshot + 500 participants insert                               |           |
| 4.1.9  | `POST /v1/inbox/conversations/:id/messages`               | 180 ms | 400 ms | 800 ms | Insert + policy + outbox enqueue                                                    |           |
| 4.1.10 | `POST /v1/inbox/conversations/:id/read`                   | 100 ms | 250 ms | 500 ms | Batch insert into message_reads                                                     |           |
| 4.1.11 | `POST /v1/inbox/conversations/read-all`                   | 500 ms | 1 s    | 2 s    | Potentially large write                                                             |           |
| 4.1.12 | `PATCH /v1/inbox/conversations/:id/mute`                  | 100 ms | 250 ms | 500 ms |                                                                                     |           |
| 4.1.13 | `PATCH /v1/inbox/conversations/:id/archive`               | 100 ms | 250 ms | 500 ms |                                                                                     |           |
| 4.1.14 | `PATCH /v1/inbox/messages/:id` (edit)                     | 150 ms | 350 ms | 700 ms |                                                                                     |           |
| 4.1.15 | `DELETE /v1/inbox/messages/:id`                           | 100 ms | 250 ms | 500 ms |                                                                                     |           |

### 4.2 Announcements

| #     | Endpoint                                                        | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                                       | Pass/Fail |
| ----- | --------------------------------------------------------------- | ------ | ------ | ------ | ----------------------------------------------------------- | --------- |
| 4.2.1 | `GET /v1/announcements?page=1&pageSize=20`                      | 150 ms | 350 ms | 700 ms |                                                             |           |
| 4.2.2 | `GET /v1/announcements?page=50&pageSize=20`                     | 300 ms | 600 ms | 1 s    | Deep pagination                                             |           |
| 4.2.3 | `GET /v1/announcements?status=scheduled`                        | 200 ms | 400 ms | 800 ms |                                                             |           |
| 4.2.4 | `GET /v1/announcements/my` (parent, 100 relevant announcements) | 250 ms | 500 ms | 1 s    |                                                             |           |
| 4.2.5 | `GET /v1/announcements/:id`                                     | 100 ms | 250 ms | 500 ms |                                                             |           |
| 4.2.6 | `GET /v1/announcements/:id/delivery-status` (1,000 recipients)  | 300 ms | 700 ms | 1.2 s  | GROUP BY status query                                       |           |
| 4.2.7 | `POST /v1/announcements` (draft)                                | 200 ms | 400 ms | 800 ms |                                                             |           |
| 4.2.8 | `POST /v1/announcements/:id/publish` (500 recipients)           | 1.5 s  | 3 s    | 5 s    | Transaction + bulk notification insert. Async job separate. |           |
| 4.2.9 | `POST /v1/announcements/:id/archive`                            | 150 ms | 350 ms | 700 ms |                                                             |           |

### 4.3 Oversight

| #      | Endpoint                                              | p50 ≤  | p95 ≤  | p99 ≤  | Notes                                                | Pass/Fail |
| ------ | ----------------------------------------------------- | ------ | ------ | ------ | ---------------------------------------------------- | --------- |
| 4.3.1  | `GET /v1/inbox/oversight/conversations?page=1`        | 250 ms | 500 ms | 1 s    |                                                      |           |
| 4.3.2  | `GET /v1/inbox/oversight/conversations/:id`           | 400 ms | 800 ms | 1.5 s  | Loads messages + participants + flags + edit history |           |
| 4.3.3  | `GET /v1/inbox/oversight/search?q=bully`              | 500 ms | 1 s    | 2 s    | Full-text across messages                            |           |
| 4.3.4  | `GET /v1/inbox/oversight/flags?review_state=pending`  | 200 ms | 400 ms | 800 ms |                                                      |           |
| 4.3.5  | `GET /v1/inbox/oversight/audit-log?page=1`            | 200 ms | 400 ms | 800 ms |                                                      |           |
| 4.3.6  | `POST /v1/inbox/oversight/conversations/:id/freeze`   | 200 ms | 400 ms | 800 ms |                                                      |           |
| 4.3.7  | `POST /v1/inbox/oversight/conversations/:id/unfreeze` | 200 ms | 400 ms | 800 ms |                                                      |           |
| 4.3.8  | `POST /v1/inbox/oversight/conversations/:id/export`   | 3 s    | 8 s    | 12 s   | PDF render; see §8 for detail                        |           |
| 4.3.9  | `POST /v1/inbox/oversight/flags/:id/dismiss`          | 200 ms | 400 ms | 800 ms |                                                      |           |
| 4.3.10 | `POST /v1/inbox/oversight/flags/:id/escalate`         | 200 ms | 400 ms | 800 ms |                                                      |           |

### 4.4 Audiences

| #     | Endpoint                                                        | p50 ≤  | p95 ≤  | p99 ≤  | Notes | Pass/Fail |
| ----- | --------------------------------------------------------------- | ------ | ------ | ------ | ----- | --------- |
| 4.4.1 | `GET /v1/inbox/audiences`                                       | 150 ms | 350 ms | 700 ms |       |           |
| 4.4.2 | `GET /v1/inbox/audiences/providers`                             | 100 ms | 250 ms | 500 ms |       |           |
| 4.4.3 | `POST /v1/inbox/audiences/preview` (school scope, ~2,000 users) | 400 ms | 800 ms | 1.5 s  |       |           |
| 4.4.4 | `POST /v1/inbox/audiences/preview` (class_parents, ~30 users)   | 200 ms | 400 ms | 800 ms |       |           |
| 4.4.5 | `POST /v1/inbox/audiences` (static, 50 user_ids)                | 200 ms | 400 ms | 800 ms |       |           |
| 4.4.6 | `GET /v1/inbox/audiences/:id/resolve` (dynamic)                 | 400 ms | 800 ms | 1.5 s  |       |           |

### 4.5 Inquiries

| #     | Endpoint                          | p50 ≤  | p95 ≤  | p99 ≤  | Notes                           | Pass/Fail |
| ----- | --------------------------------- | ------ | ------ | ------ | ------------------------------- | --------- |
| 4.5.1 | `GET /v1/inquiries`               | 150 ms | 350 ms | 700 ms |                                 |           |
| 4.5.2 | `GET /v1/inquiries/my`            | 150 ms | 350 ms | 700 ms |                                 |           |
| 4.5.3 | `GET /v1/inquiries/:id`           | 150 ms | 350 ms | 700 ms |                                 |           |
| 4.5.4 | `POST /v1/inquiries`              | 250 ms | 500 ms | 1 s    | Creates inquiry + first message |           |
| 4.5.5 | `POST /v1/inquiries/:id/messages` | 200 ms | 400 ms | 800 ms |                                 |           |
| 4.5.6 | `POST /v1/inquiries/:id/close`    | 150 ms | 350 ms | 700 ms |                                 |           |

### 4.6 Search

| #     | Endpoint                                                | p50 ≤                                  | p95 ≤  | p99 ≤  | Notes                            | Pass/Fail |
| ----- | ------------------------------------------------------- | -------------------------------------- | ------ | ------ | -------------------------------- | --------- |
| 4.6.1 | `GET /v1/inbox/search?q=<simple>` (1-word, user-scoped) | 250 ms                                 | 500 ms | 1 s    | tsvector @@ websearch_to_tsquery |           |
| 4.6.2 | `GET /v1/inbox/search?q=<3-word phrase>`                | 300 ms                                 | 600 ms | 1.2 s  |                                  |           |
| 4.6.3 | `GET /v1/inbox/people-search?q=<2+ chars>`              | 150 ms                                 | 350 ms | 700 ms |                                  |           |
| 4.6.4 | Concurrent 20 search requests (different queries)       | no degradation of p95 by more than 50% |        |        |                                  |           |

### 4.7 Settings

| #     | Endpoint                                | p50 ≤  | p95 ≤  | p99 ≤  | Notes                | Pass/Fail |
| ----- | --------------------------------------- | ------ | ------ | ------ | -------------------- | --------- |
| 4.7.1 | `GET /v1/inbox/settings/inbox`          | 80 ms  | 200 ms | 400 ms | Small table, cached  |           |
| 4.7.2 | `GET /v1/inbox/settings/policy`         | 100 ms | 250 ms | 500 ms | 81 rows              |           |
| 4.7.3 | `PUT /v1/inbox/settings/inbox`          | 150 ms | 350 ms | 700 ms |                      |           |
| 4.7.4 | `PUT /v1/inbox/settings/policy`         | 300 ms | 600 ms | 1.2 s  | Batch upsert 81 rows |           |
| 4.7.5 | `GET /v1/notification-settings`         | 80 ms  | 200 ms | 400 ms |                      |           |
| 4.7.6 | `PATCH /v1/notification-settings/:type` | 100 ms | 250 ms | 500 ms |                      |           |

### 4.8 Safeguarding keywords

| #     | Endpoint                                                    | p50 ≤  | p95 ≤  | p99 ≤  | Notes       | Pass/Fail |
| ----- | ----------------------------------------------------------- | ------ | ------ | ------ | ----------- | --------- |
| 4.8.1 | `GET /v1/safeguarding/keywords` (50 keywords)               | 100 ms | 250 ms | 500 ms |             |           |
| 4.8.2 | `POST /v1/safeguarding/keywords`                            | 150 ms | 350 ms | 700 ms |             |           |
| 4.8.3 | `POST /v1/safeguarding/keywords/bulk-import` (500 keywords) | 800 ms | 1.5 s  | 2.5 s  | Bulk upsert |           |
| 4.8.4 | `PATCH /v1/safeguarding/keywords/:id`                       | 100 ms | 250 ms | 500 ms |             |           |
| 4.8.5 | `DELETE /v1/safeguarding/keywords/:id`                      | 100 ms | 250 ms | 500 ms |             |           |

### 4.9 Attachments

| #     | Endpoint                                           | p50 ≤  | p95 ≤  | p99 ≤  | Notes                              | Pass/Fail |
| ----- | -------------------------------------------------- | ------ | ------ | ------ | ---------------------------------- | --------- |
| 4.9.1 | `POST /v1/inbox/attachments` (1 MB PDF)            | 400 ms | 900 ms | 1.8 s  | S3 upload + DB insert              |           |
| 4.9.2 | `POST /v1/inbox/attachments` (25 MB PDF, max size) | 3 s    | 8 s    | 15 s   | Edge case                          |           |
| 4.9.3 | `POST /v1/inbox/attachments` (26 MB, over limit)   | 100 ms | 200 ms | 400 ms | Should 422 before upload attempted |           |

### 4.10 Webhooks (synchronous path)

| #      | Endpoint                   | p50 ≤ | p95 ≤  | p99 ≤  | Notes                                         | Pass/Fail |
| ------ | -------------------------- | ----- | ------ | ------ | --------------------------------------------- | --------- |
| 4.10.1 | `POST /v1/webhooks/resend` | 50 ms | 150 ms | 300 ms | Webhook must ack quickly or Resend will retry |           |
| 4.10.2 | `POST /v1/webhooks/twilio` | 50 ms | 150 ms | 300 ms |                                               |           |

---

## 5. Scale Matrix — List Endpoints on 10k+ rows

| #    | Endpoint                                               | 1k rows p95 | 10k rows p95 | 50k rows p95 | Degradation acceptable? | Pass/Fail |
| ---- | ------------------------------------------------------ | ----------- | ------------ | ------------ | ----------------------- | --------- |
| 5.1  | `GET /v1/inbox/conversations` (user with 1k threads)   | 300 ms      | 400 ms       | 500 ms       | Linear; must use keyset |           |
| 5.2  | `GET /v1/inbox/conversations/:id?page=1` (1k messages) | 500 ms      | 700 ms       | 1 s          | Cursor-paginate         |           |
| 5.3  | `GET /v1/announcements`                                | 300 ms      | 350 ms       | 400 ms       | Flat with index         |           |
| 5.4  | `GET /v1/inbox/oversight/conversations`                | 400 ms      | 600 ms       | 1 s          |                         |           |
| 5.5  | `GET /v1/inbox/oversight/flags`                        | 300 ms      | 500 ms       | 800 ms       |                         |           |
| 5.6  | `GET /v1/inbox/oversight/audit-log`                    | 300 ms      | 500 ms       | 800 ms       |                         |           |
| 5.7  | `GET /v1/notifications?unread_only=true`               | 200 ms      | 250 ms       | 300 ms       |                         |           |
| 5.8  | `GET /v1/inquiries`                                    | 300 ms      | 400 ms       | 500 ms       |                         |           |
| 5.9  | `GET /v1/inbox/search?q=<common>`                      | 400 ms      | 700 ms       | 1.2 s        | tsvector + GIN index    |           |
| 5.10 | `GET /v1/inbox/oversight/search?q=<common>`            | 500 ms      | 900 ms       | 1.5 s        |                         |           |

---

## 6. Full-Text Search Performance

### 6.1 Index assertions

| #     | Assertion                                                                                    | Expected                                          | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------- |
| 6.1.1 | `messages.body_search` is a generated tsvector column                                        | `\d+ messages` shows generated expression         |           |
| 6.1.2 | GIN index on `messages.body_search`                                                          | `pg_indexes` shows `idx_messages_body_search_gin` |           |
| 6.1.3 | Query plan for `WHERE body_search @@ websearch_to_tsquery(...)` uses bitmap heap scan on GIN | `EXPLAIN ANALYZE` shows Bitmap Index Scan         |           |
| 6.1.4 | Query plan is tenant-scoped via RLS + WHERE tenant_id                                        | Filter applied                                    |           |

### 6.2 Query patterns

| #     | Query                         | p50 ≤                                            | p95 ≤  | Pass/Fail |
| ----- | ----------------------------- | ------------------------------------------------ | ------ | --------- |
| 6.2.1 | 1-word query, ≤ 100 matches   | 200 ms                                           | 500 ms |           |
| 6.2.2 | 3-word phrase                 | 300 ms                                           | 700 ms |           |
| 6.2.3 | Query with arabic input       | 400 ms                                           | 900 ms |           |
| 6.2.4 | Query with non-existent word  | 100 ms                                           | 300 ms |           |
| 6.2.5 | Query matching > 1000 results | — must still paginate; only 20 returned per page |        |

---

## 7. Audience Resolution Performance

### 7.1 Provider benchmarks

| #     | Provider                                             | Scope            | Expected resolve time | Pass/Fail |
| ----- | ---------------------------------------------------- | ---------------- | --------------------- | --------- |
| 7.1.1 | `school`                                             | 1,800 parents    | ≤ 500 ms              |           |
| 7.1.2 | `staff_all`                                          | 200 staff        | ≤ 200 ms              |           |
| 7.1.3 | `year_group_parents`                                 | ~200 parents     | ≤ 300 ms              |           |
| 7.1.4 | `class_parents`                                      | ~30 parents      | ≤ 200 ms              |           |
| 7.1.5 | `class_students`                                     | ~30 students     | ≤ 200 ms              |           |
| 7.1.6 | `handpicked` (50 user_ids)                           | 50 users         | ≤ 150 ms              |           |
| 7.1.7 | `saved_group` (references dynamic definition)        | depends on child | ≤ child × 1.2         |           |
| 7.1.8 | Nested union: class_parents UNION year_group_parents | ~250 parents     | ≤ 500 ms              |           |

### 7.2 Preview vs send

| #     | Scenario                                         | Expected                                            | Pass/Fail |
| ----- | ------------------------------------------------ | --------------------------------------------------- | --------- |
| 7.2.1 | Preview on save-modal = same query as send       | ≤ 10% divergence in latency; cache preview for 30 s |           |
| 7.2.2 | Preview large school-wide audience (1,800 users) | ≤ 800 ms                                            |           |

---

## 8. PDF Export Render Time

### 8.1 Oversight thread export (`POST /v1/inbox/oversight/conversations/:id/export`)

| #     | Thread size                                         | Render time (p50 ≤) | Render time (p95 ≤) | Pass/Fail |
| ----- | --------------------------------------------------- | ------------------- | ------------------- | --------- |
| 8.1.1 | 10 messages                                         | 1 s                 | 2 s                 |           |
| 8.1.2 | 100 messages                                        | 2 s                 | 4 s                 |           |
| 8.1.3 | 500 messages                                        | 5 s                 | 10 s                |           |
| 8.1.4 | 500 messages + 10 attachments (embedded thumbnails) | 8 s                 | 15 s                |           |

### 8.2 PDF characteristics

| #     | Assertion                              | Expected                                                   | Pass/Fail |
| ----- | -------------------------------------- | ---------------------------------------------------------- | --------- |
| 8.2.1 | PDF streamed, not fully held in memory | Memory footprint stays under 100 MB for 500-message export |           |
| 8.2.2 | S3 upload to storage key               | Presigned URL returned with 15-min expiry                  |           |
| 8.2.3 | Concurrency: 5 simultaneous exports    | No worker starvation; all complete                         |           |

---

## 9. Worker Throughput

### 9.1 `notifications:dispatch-queued` cron throughput

| #     | Scenario                                  | Expected                                                                                           | Pass/Fail |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | 500 queued notifications across 5 tenants | Fan-out job runs in ≤ 2 s; dispatches 5 tenant jobs                                                |           |
| 9.1.2 | 5,000 queued notifications                | Batches of 50 per tenant; 100 dispatch jobs enqueued; queue drains in ≤ 5 min with sandbox latency |           |

### 9.2 `communications:dispatch-notifications` per-channel throughput

| #     | Channel               | Throughput (notifications per worker per minute) | Pass/Fail |
| ----- | --------------------- | ------------------------------------------------ | --------- |
| 9.2.1 | in_app                | ≥ 1,000 / min (DB-bound only)                    |           |
| 9.2.2 | email (via Resend)    | ≥ 300 / min (rate-limited by Resend)             |           |
| 9.2.3 | sms (via Twilio)      | ≥ 100 / min                                      |           |
| 9.2.4 | whatsapp (via Twilio) | ≥ 100 / min                                      |           |

### 9.3 `communications:publish-announcement` throughput

| #     | Recipients per announcement | Expected end-to-end time (publish → last in_app delivered) | Pass/Fail |
| ----- | --------------------------- | ---------------------------------------------------------- | --------- |
| 9.3.1 | 100                         | ≤ 5 s                                                      |           |
| 9.3.2 | 1,000                       | ≤ 30 s                                                     |           |
| 9.3.3 | 10,000                      | ≤ 3 min                                                    |           |

### 9.4 `safeguarding:scan-message` throughput

| #     | Scenario                      | Expected                                      | Pass/Fail |
| ----- | ----------------------------- | --------------------------------------------- | --------- |
| 9.4.1 | 100 messages/sec incoming     | Scanner keeps up (no queue lag growth > 10 s) |           |
| 9.4.2 | Average scan time per message | ≤ 50 ms                                       |           |

### 9.5 `inbox:fallback-check` cron

| #     | Scenario                                                             | Expected                    | Pass/Fail |
| ----- | -------------------------------------------------------------------- | --------------------------- | --------- |
| 9.5.1 | 10k messages past SLA across all tenants                             | Fan-out completes in ≤ 30 s |           |
| 9.5.2 | Per-tenant `inbox:fallback-scan-tenant` run time (up to 2k messages) | ≤ 60 s                      |           |

---

## 10. Page-Weight + Bundle Budgets (Lighthouse)

Test each page in the admin shell with Lighthouse, running against `https://staging.edupod.app`.

### 10.1 Performance scores

| #       | Page                                                   | Performance ≥ | LCP ≤ | CLS ≤ | TBT ≤  | Pass/Fail |
| ------- | ------------------------------------------------------ | ------------- | ----- | ----- | ------ | --------- |
| 10.1.1  | `/communications` (hub dashboard)                      | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.2  | `/inbox` (empty state)                                 | 90            | 2 s   | 0.1   | 150 ms |           |
| 10.1.3  | `/inbox/threads/[id]` (500-msg thread)                 | 80            | 3 s   | 0.1   | 300 ms |           |
| 10.1.4  | `/inbox/search` (20 results)                           | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.5  | `/inbox/audiences`                                     | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.6  | `/inbox/audiences/new`                                 | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.7  | `/inbox/oversight`                                     | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.8  | `/inbox/oversight/threads/[id]`                        | 80            | 3 s   | 0.1   | 300 ms |           |
| 10.1.9  | `/communications/announcements`                        | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.10 | `/communications/new`                                  | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.11 | `/communications/[id]` (published with 500 recipients) | 80            | 3 s   | 0.1   | 300 ms |           |
| 10.1.12 | `/communications/inquiries`                            | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.13 | `/communications/inquiries/[id]`                       | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.14 | `/settings/messaging-policy`                           | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.15 | `/settings/communications/safeguarding` (50 keywords)  | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.16 | `/settings/communications/fallback`                    | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.17 | `/settings/notifications`                              | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.18 | `/reports/notification-delivery`                       | 80            | 3 s   | 0.1   | 300 ms |           |
| 10.1.19 | `/announcements` (parent feed)                         | 90            | 2 s   | 0.1   | 150 ms |           |
| 10.1.20 | `/inquiries` (parent list)                             | 85            | 2.5 s | 0.1   | 200 ms |           |
| 10.1.21 | `/profile/communication`                               | 90            | 2 s   | 0.1   | 150 ms |           |

### 10.2 Bundle budgets (JS per route)

| #      | Route group                             | JS budget (gz) | Notes                            | Pass/Fail |
| ------ | --------------------------------------- | -------------- | -------------------------------- | --------- |
| 10.2.1 | `/communications` root chunk            | ≤ 200 KB       | Includes Recharts if charts here |           |
| 10.2.2 | `/inbox` per-route                      | ≤ 250 KB       | Includes TipTap if rich text     |           |
| 10.2.3 | `/inbox/oversight` per-route            | ≤ 150 KB       | No editor                        |           |
| 10.2.4 | `/settings/*` per-route                 | ≤ 100 KB       | Basic forms                      |           |
| 10.2.5 | `/reports/notification-delivery`        | ≤ 180 KB       | Includes Recharts                |           |
| 10.2.6 | Shared vendor chunk (across all routes) | ≤ 350 KB       | React + Next + Radix + lucide    |           |

### 10.3 Image budgets

| #      | Image category        | Expected                                 | Pass/Fail |
| ------ | --------------------- | ---------------------------------------- | --------- |
| 10.3.1 | Avatars in inbox list | Lazy loaded; served as WebP ≤ 10 KB each |           |
| 10.3.2 | Attachment thumbnails | Lazy loaded; ≤ 50 KB each                |           |

---

## 11. Contention & Concurrency Under Load

### 11.1 Mass send to same conversation

| #      | Scenario                                                        | Expected                                                                             | Pass/Fail |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 11.1.1 | 20 users sending to the same conversation at once               | No locking; all 20 messages persisted; `last_message_at` equals the latest timestamp |           |
| 11.1.2 | 50 users in one group conversation all typing + reading at once | Unread-counter updates happen without deadlock; p95 send ≤ 500 ms                    |           |

### 11.2 Cron-induced spike

| #      | Scenario                                                                          | Expected                                                    | Pass/Fail |
| ------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 11.2.1 | 30-second dispatch-queued cron fires while 10 admins are publishing announcements | No noticeable UI latency spike; API p95 stays within budget |           |
| 11.2.2 | Fallback-check cron fires during peak hour                                        | API latency unaffected                                      |           |

### 11.3 DB connection-pool saturation

| #      | Scenario                   | Expected                                                                 | Pass/Fail |
| ------ | -------------------------- | ------------------------------------------------------------------------ | --------- |
| 11.3.1 | 100 concurrent inbox loads | Pool does not exhaust; requests queue, p99 ≤ 2 s                         |           |
| 11.3.2 | Worker + API both active   | Shared pool via pgBouncer; RLS context does not leak across transactions |           |

### 11.4 Long-running oversight export vs inbox polling

| #      | Scenario                                                                          | Expected                               | Pass/Fail |
| ------ | --------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| 11.4.1 | An 8-second PDF export running while 50 clients poll `/v1/inbox/state` every 30 s | Polls remain under p95 budget (150 ms) |           |

---

## 12. Cold-Start and Connection-Pool Behaviour

| #    | Assertion                                                                                       | Expected                                                  | Pass/Fail |
| ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 12.1 | First request after API boot hits caches warming                                                | First `/v1/inbox/state` ≤ 1 s (vs p50 50 ms steady-state) |           |
| 12.2 | Prisma client initializes inside the first request, not blocked                                 | No 5+ second cold start                                   |           |
| 12.3 | Worker cold-start: first job picks up within 5 s of worker boot                                 | Verified                                                  |           |
| 12.4 | PgBouncer in transaction mode: no stale connections; no `ERROR: current transaction is aborted` | Zero occurrences in 1 hr of load                          |           |

---

## 13. DB Query Analysis (EXPLAIN + pg_stat_statements)

### 13.1 Required indexes

| #       | Table + column                                                                  | Index present?                         | Used by planner? | Pass/Fail |
| ------- | ------------------------------------------------------------------------------- | -------------------------------------- | ---------------- | --------- |
| 13.1.1  | `conversations(tenant_id, kind, last_message_at DESC)`                          | `idx_conversations_tenant_kind_recent` | Yes              |           |
| 13.1.2  | `conversations(tenant_id, frozen_at)`                                           | `idx_conversations_frozen`             | Yes              |           |
| 13.1.3  | `conversation_participants(conversation_id, user_id)`                           | Unique `uniq_conversation_user`        | Yes              |           |
| 13.1.4  | `conversation_participants(tenant_id, user_id, archived_at, unread_count DESC)` | `idx_participants_user_inbox`          | Yes              |           |
| 13.1.5  | `messages(tenant_id, conversation_id, created_at DESC)`                         | `idx_messages_thread_recent`           | Yes              |           |
| 13.1.6  | `messages(tenant_id, sender_user_id, created_at DESC)`                          | `idx_messages_sender`                  | Yes              |           |
| 13.1.7  | `messages(tenant_id, fallback_dispatched_at, created_at)`                       | `idx_messages_fallback_scan`           | Yes              |           |
| 13.1.8  | `messages.body_search` GIN index                                                | `idx_messages_body_search_gin`         | Yes              |           |
| 13.1.9  | `message_reads(message_id, user_id)` unique                                     | `uniq_message_user_read`               | Yes              |           |
| 13.1.10 | `message_flags(tenant_id, review_state, created_at DESC)`                       | `idx_message_flags_review_queue`       | Yes              |           |
| 13.1.11 | `oversight_access_log(tenant_id, actor_user_id, created_at DESC)`               | `idx_oversight_log_actor`              | Yes              |           |
| 13.1.12 | `announcements(tenant_id, status)`                                              | `idx_announcements_tenant_status`      | Yes              |           |
| 13.1.13 | `notifications(tenant_id, recipient_user_id, status)`                           | `idx_notifications_tenant_recipient`   | Yes              |           |
| 13.1.14 | `notifications(tenant_id, idempotency_key)` unique                              | `idx_notifications_idempotency`        | Yes              |           |
| 13.1.15 | `parent_inquiries(tenant_id, status)`                                           | `idx_parent_inquiries_tenant_status`   | Yes              |           |
| 13.1.16 | `saved_audiences(tenant_id, kind)`                                              | `idx_saved_audiences_kind`             | Yes              |           |
| 13.1.17 | `safeguarding_keywords(tenant_id, active)`                                      | `idx_safeguarding_keywords_active`     | Yes              |           |

### 13.2 N+1 query detection

| #      | Flow                                                  | Expected                                                                            | Pass/Fail |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 13.2.1 | `GET /v1/inbox/conversations` (20 rows)               | ≤ 5 queries total (conversations, participants in one IN query, last message peeks) |           |
| 13.2.2 | `GET /v1/inbox/conversations/:id` with messages page  | ≤ 4 queries                                                                         |           |
| 13.2.3 | `GET /v1/inbox/oversight/conversations/:id`           | ≤ 6 queries                                                                         |           |
| 13.2.4 | `GET /v1/announcements/:id/delivery-status`           | ≤ 2 queries (announcement + GROUP BY status)                                        |           |
| 13.2.5 | `POST /v1/announcements/:id/publish` (500 recipients) | Uses bulk insert (`createMany`); not 500 single inserts                             |           |

### 13.3 pg_stat_statements top-10

After 1 hour of load, the top-10 queries by total time must all be expected communications workload (conversations list, messages get, search, notifications list). No unexpected queries should appear.

| #      | Assertion                                                                      | Expected              | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | --------------------- | --------- |
| 13.3.1 | Top-10 by total_time contains no unbounded `SELECT * FROM ...` without WHERE   | Verified              |           |
| 13.3.2 | No query is > 50% of total_time (indicates a hot path that needs optimisation) | Balanced distribution |           |
| 13.3.3 | Average execution time of each top-10 query ≤ budget (500 ms)                  | Verified              |           |

---

## 14. Redis / BullMQ Memory Footprint

| #    | Assertion                                                              | Expected                                            | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------- | --------- |
| 14.1 | `bull:notifications:wait` size at steady state                         | ≤ 100 items during normal load                      |           |
| 14.2 | `bull:notifications:delayed` (scheduled publish jobs + retries) size   | Bounded by number of future announcements + retries |           |
| 14.3 | `bull:notifications:failed` size                                       | ≤ 50 (retention policy)                             |           |
| 14.4 | `bull:safeguarding:wait` size                                          | ≤ 50 during normal load                             |           |
| 14.5 | Total Redis memory for BullMQ comms queues                             | ≤ 100 MB in steady state                            |           |
| 14.6 | Job payload size (notifications:dispatch-notifications with 50 IDs)    | ≤ 5 KB per job                                      |           |
| 14.7 | No orphaned locks (`bull:notifications:<jobId>:lock` with TTL expired) | Zero after 24 h                                     |           |

---

## 15. Endpoints Without Budgets (Coverage Hole Flag)

Review §4; any endpoint in the Backend Endpoint Map (admin UI spec §38) that is NOT listed in §4 must either get a budget here or be documented as "no perf target — low traffic" with justification.

| #    | Endpoint                               | Reason for no explicit budget                                              | Pass/Fail |
| ---- | -------------------------------------- | -------------------------------------------------------------------------- | --------- |
| 15.1 | `PATCH /v1/notifications/:id/read`     | Single-row update, implicitly covered by general p95 budget (≤ 100 ms p50) |           |
| 15.2 | `GET /v1/notifications/unread-count`   | Polled every 30 s — budget implicit ≤ 100 ms p50                           |           |
| 15.3 | `POST /v1/notifications/mark-all-read` | Batch write — budget implicit ≤ 500 ms p95                                 |           |
| 15.4 | `GET /v1/notifications/admin/failed`   | Admin page, low traffic                                                    |           |
| 15.5 | `GET /v1/notification-templates`       | Admin-only, rarely loaded                                                  |           |
| 15.6 | `POST /v1/notification-templates`      | Admin-only                                                                 |           |
| 15.7 | Every webhook in §4.10 — covered       | —                                                                          |           |

**Action:** If new endpoints are added to the module after this spec, add a row to §4 AND to this §15 within the same PR.

---

## 16. Sign-off

| Section                | Reviewer | Date | Pass | Fail | Notes |
| ---------------------- | -------- | ---- | ---- | ---- | ----- |
| 4. Endpoint budgets    |          |      |      |      |       |
| 5. Scale matrix        |          |      |      |      |       |
| 6. FTS                 |          |      |      |      |       |
| 7. Audience resolution |          |      |      |      |       |
| 8. PDF export          |          |      |      |      |       |
| 9. Worker throughput   |          |      |      |      |       |
| 10. Page budgets       |          |      |      |      |       |
| 11. Contention         |          |      |      |      |       |
| 12. Cold start         |          |      |      |      |       |
| 13. DB queries         |          |      |      |      |       |
| 14. Redis footprint    |          |      |      |      |       |

**Perf spec is release-ready when every endpoint is within budget at p95. One endpoint above p99 budget = P1 investigation. Missing index (13.1) is a P0.**
