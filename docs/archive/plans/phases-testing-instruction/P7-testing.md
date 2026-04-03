# Phase 7 Testing Instructions — Communications, CMS, and Parent Inquiries

---

## Overview

This document covers all tests required to validate Phase 7 deliverables. Tests are co-located with source files unless otherwise noted. Integration tests live in `apps/api/test/`. Follow the naming conventions in `.claude/rules/testing.md`.

**Scope of tables requiring RLS tests:** `announcements`, `notification_templates`, `notifications`, `parent_inquiries`, `parent_inquiry_messages`, `website_pages`, `contact_form_submissions`

---

## Section 1 — Unit Tests

Unit tests use Jest with mocked dependencies (mock `PrismaService`, `RedisService`, and external API clients). Test files are co-located with their service files.

---

### 1.1 `AnnouncementsService`

**File:** `apps/api/src/modules/communications/announcements.service.spec.ts`

#### `create()`

| Test                                                            | Input                                                    | Expected Output                                               |
| --------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| should create announcement with status draft                    | Valid DTO with `scope = 'school'`, `target_payload = {}` | Record created with `status = 'draft'`, `body_html` sanitised |
| should sanitise body_html on create                             | Body with `<script>alert(1)</script>` injected           | Script tag stripped from stored `body_html`                   |
| should create with scope year_group and valid target_payload    | `{ year_group_ids: ['uuid1', 'uuid2'] }`                 | Record created, target_payload stored verbatim                |
| should create with scope class and valid target_payload         | `{ class_ids: ['uuid1'] }`                               | Record created                                                |
| should create with scope household                              | `{ household_ids: ['uuid1'] }`                           | Record created                                                |
| should create with scope custom and user_ids                    | `{ user_ids: ['uuid1', 'uuid2'] }`                       | Record created                                                |
| edge: should throw if year_group scope has empty year_group_ids | `scope = 'year_group'`, `target_payload = {}`            | Throws 400 validation error                                   |
| edge: should throw if target IDs do not exist in tenant         | Non-existent year_group_id                               | Throws 400 `TARGET_NOT_FOUND`                                 |

#### `update()`

| Test                                                            | Input                                              | Expected Output                     |
| --------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| should update draft announcement title                          | `{ title: 'New Title' }` on draft record           | Record updated, `title` changed     |
| should sanitise body_html on update                             | Body with injected script                          | Script tag stripped                 |
| should throw ANNOUNCEMENT_NOT_DRAFT when updating non-draft     | Announcement with `status = 'published'`           | Throws 400 `ANNOUNCEMENT_NOT_DRAFT` |
| should throw ANNOUNCEMENT_NOT_FOUND when ID missing             | Random UUID                                        | Throws 404 `ANNOUNCEMENT_NOT_FOUND` |
| edge: should allow updating target_payload when scope unchanged | New class_ids on existing class-scope announcement | Updated correctly                   |

#### `publish()` — without approval required

| Test                                                        | Input                                                                                    | Expected Output                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| should publish immediately when no approval and no schedule | Draft announcement, `requireApprovalForAnnouncements = false`, no `scheduled_publish_at` | `status = 'published'`, `published_at` set, dispatch job enqueued |
| should schedule when scheduled_publish_at is in the future  | `scheduled_publish_at = tomorrow`                                                        | `status = 'scheduled'`, delayed BullMQ job enqueued               |
| should throw ANNOUNCEMENT_NOT_DRAFT when already published  | Announcement with `status = 'published'`                                                 | Throws 400 `ANNOUNCEMENT_NOT_DRAFT`                               |

#### `publish()` — with approval required

| Test                                                                | Input                                                                                             | Expected Output                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| should transition to pending_approval when approval required        | `requireApprovalForAnnouncements = true`, `ApprovalRequestsService` returns `{ approved: false }` | `status = 'pending_approval'`, `approval_request_id` set, returns `{ approval_required: true }` |
| should publish immediately when approval required but auto-approved | `requireApprovalForAnnouncements = true`, `ApprovalRequestsService` returns `{ approved: true }`  | `status = 'published'`, dispatch job enqueued                                                   |
| edge: requester cannot approve own request                          | Same user as author triggers publish                                                              | `ApprovalRequestsService` called with `canSelfApprove = false`                                  |

#### `executePublish()`

| Test                                                                             | Input                         | Expected Output                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| should set status to published and call AudienceResolutionService                | Draft announcement            | `status = 'published'`, `published_at` set, `AudienceResolutionService.resolve()` called with correct scope/payload |
| should create notification records in batches of 100                             | 250 resolved audience targets | 3 notification batches created (100 + 100 + 50), 3 dispatch jobs enqueued                                           |
| should create notifications with correct source_entity_type and source_entity_id | Any audience                  | `source_entity_type = 'announcement'`, `source_entity_id = announcement.id`                                         |

#### `archive()`

| Test                                                            | Input                         | Expected Output                        |
| --------------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| should archive published announcement                           | `status = 'published'`        | `status = 'archived'`                  |
| should archive draft announcement                               | `status = 'draft'`            | `status = 'archived'`                  |
| edge: should throw when archiving pending_approval announcement | `status = 'pending_approval'` | Throws 400 `INVALID_STATUS_TRANSITION` |

#### `getDeliveryStatus()`

| Test                                                       | Input                                             | Expected Output                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| should aggregate notification statuses for an announcement | 10 queued, 5 sent, 20 delivered, 2 failed, 1 read | Returns `{ total: 38, queued: 10, sent: 5, delivered: 20, failed: 2, read: 1 }` |
| should return all-zero counts when no notifications exist  | Announcement with no notifications                | Returns `{ total: 0, queued: 0, sent: 0, delivered: 0, failed: 0, read: 0 }`    |

#### `listForParent()`

| Test                                                                    | Input                                  | Expected Output                 |
| ----------------------------------------------------------------------- | -------------------------------------- | ------------------------------- |
| should return only announcements the parent received a notification for | User with 3 announcement notifications | 3 announcement records returned |
| should not return announcements from other users' notifications         | User B queries, data belongs to User A | Empty result                    |

---

### 1.2 `AudienceResolutionService`

**File:** `apps/api/src/modules/communications/audience-resolution.service.spec.ts`

#### `resolve()` — by scope

| Test                                                                    | Input                                                                      | Expected Output                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| should resolve school scope to all parents with user accounts           | `scope = 'school'`, tenant has 5 parents with `user_id`                    | Returns 5 `AudienceTarget` records             |
| should exclude parents without user_id from school scope                | `scope = 'school'`, 2 of 5 parents have no `user_id`                       | Returns 3 records (only parents with accounts) |
| should resolve year_group scope via students in that year group         | `scope = 'year_group'`, `year_group_ids = [uuid1]`, 3 students → 3 parents | Returns 3 targets                              |
| should resolve class scope via active enrolments                        | `scope = 'class'`, `class_ids = [uuid1]`, only active enrolments counted   | Returns targets for active enrolments only     |
| should resolve household scope via household_parents                    | `scope = 'household'`, `household_ids = [uuid1]`, 2 parents in household   | Returns 2 targets                              |
| should resolve custom scope directly from user_ids                      | `scope = 'custom'`, `user_ids = ['u1', 'u2']`                              | Returns 2 targets with those user IDs          |
| edge: de-duplication — parent linked to multiple students in same class | 1 parent with 2 students in same class                                     | Returns 1 `AudienceTarget`, not 2              |
| edge: parent linked across multiple year groups in target list          | 1 parent with students in 2 targeted year groups                           | Returns 1 `AudienceTarget`                     |
| edge: should return empty list when no matching parents found           | `scope = 'year_group'` with no students enrolled                           | Returns `[]`                                   |

#### Channel resolution per parent

| Test                                                                  | Input                                                           | Expected Output                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| should always include in_app when parent has a user account           | Parent with `user_id`, `preferred_contact_channels = ['email']` | Target includes `in_app` in channels                        |
| should intersect parent preferences with tenant notification settings | Tenant has whatsapp enabled, parent prefers email only          | Target channels = `['email', 'in_app']` (whatsapp excluded) |
| should exclude channel if disabled at tenant level                    | Tenant has `announcement.published.whatsapp = disabled`         | No whatsapp channel for any target                          |

---

### 1.3 `NotificationsService`

**File:** `apps/api/src/modules/communications/notifications.service.spec.ts`

#### `listForUser()`

| Test                                                        | Input                                       | Expected Output                              |
| ----------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| should return paginated notifications for current user only | User with 25 notifications, `pageSize = 20` | 20 notifications returned, `meta.total = 25` |
| should filter by unread_only                                | User with 5 unread, 10 read                 | 5 notifications when `unread_only = true`    |
| should return empty list when user has no notifications     | User with no notifications                  | `{ data: [], meta: { total: 0 } }`           |
| should order by created_at descending                       | Notifications at different times            | Most recent first                            |

#### `getUnreadCount()` — cache hit/miss

| Test                                                  | Input                                                  | Expected Output                       |
| ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| should return cached count when Redis key exists      | Redis has `tenant:t1:user:u1:unread_notifications = 5` | Returns 5, no DB query                |
| should count from DB and cache when Redis miss        | Redis miss, DB has 3 unread                            | Returns 3, Redis key set with 30s TTL |
| should return 0 when user has no unread notifications | DB has 0 unread, Redis miss                            | Returns 0, caches 0                   |

#### `markAsRead()`

| Test                                                     | Input                                             | Expected Output                                                  |
| -------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| should mark notification as read and update read_at      | Unread notification belonging to user             | `status = 'read'`, `read_at` set, Redis unread count decremented |
| should throw when notification belongs to different user | Notification owned by user B, requested by user A | Throws 404 `NOTIFICATION_NOT_FOUND`                              |
| edge: should not decrement Redis count below 0           | Redis count is 0, mark as read                    | Redis count stays at 0                                           |

#### `markAllAsRead()`

| Test                                         | Input                                                 | Expected Output                                           |
| -------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| should mark all unread notifications as read | User with 10 unread notifications across all channels | All 10 updated to `status = 'read'`, Redis key reset to 0 |
| should only mark this user's notifications   | Two users share tenant                                | Only requesting user's notifications updated              |

#### `createBatch()`

| Test                                                   | Input                                     | Expected Output                                      |
| ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------- |
| should bulk insert notification records                | Array of 50 notification DTOs             | 50 records created in DB                             |
| should increment Redis unread count for each recipient | 3 recipients each getting 2 notifications | Each recipient's Redis unread count incremented by 2 |

---

### 1.4 `NotificationDispatchService`

**File:** `apps/api/src/modules/communications/notification-dispatch.service.spec.ts`

#### `dispatchWithFallback()` — email channel

| Test                                                             | Input                                  | Expected Output                                                    |
| ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| should send email via Resend and update status to sent           | Valid email notification               | Resend API called, `status = 'sent'`, `provider_message_id` stored |
| should retry with exponential backoff on email failure           | Email send fails once                  | `attempt_count = 1`, `next_retry_at` set to ~60s from now          |
| should dead-letter after max_attempts exhausted                  | `attempt_count = 3`, email fails again | `status = 'failed'`, no `next_retry_at` set                        |
| should fall back to in_app when email fails and user has account | Email fails, recipient has `user_id`   | New `in_app` notification record created                           |

#### `dispatchWithFallback()` — whatsapp channel

| Test                                                                              | Input                                        | Expected Output                                   |
| --------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------- |
| should send WhatsApp via Twilio and update status to sent                         | Valid whatsapp notification with valid phone | Twilio API called, `status = 'sent'`              |
| should skip WhatsApp and create email fallback when template not found for locale | `locale = 'fr'`, no template exists          | Email notification created as fallback            |
| should skip WhatsApp and create email fallback when phone number invalid          | Invalid phone format                         | Email notification created, WhatsApp skipped      |
| should create email fallback when WhatsApp send fails                             | Twilio API throws                            | Email notification record created                 |
| edge: both WhatsApp and email unavailable — should create in_app                  | No phone, email also fails                   | `in_app` notification created if user has account |

#### `dispatchWithFallback()` — in_app channel

| Test                                                     | Input                | Expected Output                                      |
| -------------------------------------------------------- | -------------------- | ---------------------------------------------------- |
| should mark in_app notification as delivered immediately | `channel = 'in_app'` | `status = 'delivered'` without any external API call |

---

### 1.5 `NotificationTemplatesService`

**File:** `apps/api/src/modules/communications/notification-templates.service.spec.ts`

#### `resolveTemplate()`

| Test                                                                                  | Input                                                               | Expected Output                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------- |
| should return tenant-level template when it exists                                    | Tenant has custom template for `announcement.published/email/en`    | Returns tenant-level template      |
| should fall back to platform-level template when no tenant override                   | No tenant template, platform template exists for key/channel/locale | Returns platform-level template    |
| should return null when no template found at any level                                | No tenant or platform template                                      | Returns `null`                     |
| edge: tenant template for wrong channel returns platform fallback for correct channel | Tenant has email template only, request is for whatsapp             | Returns platform whatsapp template |

#### `update()`

| Test                                                               | Input                            | Expected Output                       |
| ------------------------------------------------------------------ | -------------------------------- | ------------------------------------- |
| should update tenant-level template body                           | Valid body_template change       | Template updated                      |
| should throw SYSTEM_TEMPLATE_READONLY when editing system template | Template with `is_system = true` | Throws 403 `SYSTEM_TEMPLATE_READONLY` |

---

### 1.6 `ParentInquiriesService`

**File:** `apps/api/src/modules/parent-inquiries/parent-inquiries.service.spec.ts`

#### `create()`

| Test                                                    | Input                                                  | Expected Output                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| should create inquiry without student link              | `{ subject, message }`, no `student_id`                | Inquiry created with `status = 'open'`, first message stored, admin notification job enqueued |
| should create inquiry with valid student link           | `student_id` belonging to parent via `student_parents` | Inquiry created with `student_id` set                                                         |
| should throw when student_id does not belong to parent  | `student_id` from a different parent                   | Throws 400 `STUDENT_NOT_LINKED`                                                               |
| edge: should throw when no parent record found for user | User is not a parent                                   | Throws 404 `PARENT_NOT_FOUND`                                                                 |

#### `addAdminMessage()`

| Test                                                                 | Input                                         | Expected Output                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| should add admin message and auto-transition open to in_progress     | Inquiry with `status = 'open'`, admin replies | Message created with `author_type = 'admin'`, inquiry `status = 'in_progress'`          |
| should add admin message without transition when already in_progress | Inquiry with `status = 'in_progress'`         | Message created, status unchanged                                                       |
| should throw INQUIRY_CLOSED when inquiry is closed                   | Inquiry with `status = 'closed'`              | Throws 400 `INQUIRY_CLOSED`                                                             |
| should enqueue parent notification on admin reply                    | Admin posts message                           | `communications:inquiry-notification` job enqueued with `notify_type = 'parent_notify'` |

#### `addParentMessage()`

| Test                                                  | Input                                      | Expected Output                                                                        |
| ----------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| should add parent message when inquiry is open        | Inquiry owned by parent, `status = 'open'` | Message created with `author_type = 'parent'`                                          |
| should add parent message when inquiry is in_progress | `status = 'in_progress'`                   | Message created                                                                        |
| should throw INQUIRY_CLOSED for closed inquiry        | `status = 'closed'`                        | Throws 400 `INQUIRY_CLOSED`                                                            |
| should throw when parent does not own inquiry         | Inquiry belongs to different parent        | Throws 404 `INQUIRY_NOT_FOUND`                                                         |
| should enqueue admin notification on parent reply     | Parent posts message                       | `communications:inquiry-notification` job enqueued with `notify_type = 'admin_notify'` |

#### `close()`

| Test                                                   | Input                    | Expected Output                        |
| ------------------------------------------------------ | ------------------------ | -------------------------------------- |
| should close open inquiry                              | `status = 'open'`        | `status = 'closed'`                    |
| should close in_progress inquiry                       | `status = 'in_progress'` | `status = 'closed'`                    |
| edge: should throw when closing already closed inquiry | `status = 'closed'`      | Throws 400 `INVALID_STATUS_TRANSITION` |

#### `getByIdForParent()`

| Test                                                              | Input                                             | Expected Output                                             |
| ----------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| should replace admin author details with "School Administration"  | Inquiry with admin message from user "John Smith" | Message `author_name = 'School Administration'` in response |
| should show actual author details for parent messages             | Parent message exists                             | Parent's own name shown                                     |
| should throw when parent tries to access another parent's inquiry | Different parent_id                               | Throws 404 `INQUIRY_NOT_FOUND`                              |

---

### 1.7 `WebsitePagesService`

**File:** `apps/api/src/modules/website/website-pages.service.spec.ts`

#### `publish()`

| Test                                                                 | Input                                    | Expected Output                                                    |
| -------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| should publish a page and set published_at                           | Draft page                               | `status = 'published'`, `published_at` set                         |
| should unpublish existing homepage when publishing new homepage      | Two home pages: one published, one draft | Old page `status = 'unpublished'`, new page `status = 'published'` |
| should use interactive transaction for homepage enforcement          | Homepage publish                         | Transaction used (verifies atomicity)                              |
| edge: publishing a non-home page should not affect existing homepage | `page_type = 'about'` published          | Existing homepage untouched                                        |

#### `delete()`

| Test                                      | Input                    | Expected Output                             |
| ----------------------------------------- | ------------------------ | ------------------------------------------- |
| should delete draft page                  | `status = 'draft'`       | Record deleted                              |
| should delete unpublished page            | `status = 'unpublished'` | Record deleted                              |
| should throw when deleting published page | `status = 'published'`   | Throws 400 `PAGE_MUST_BE_UNPUBLISHED_FIRST` |

---

### 1.8 `ContactFormService`

**File:** `apps/api/src/modules/website/contact-form.service.spec.ts`

#### `submit()`

| Test                                                            | Input                                                  | Expected Output                                              |
| --------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| should create submission with status new                        | Valid form, empty honeypot, first submission from IP   | Submission created with `status = 'new'`, `source_ip` stored |
| should store as spam when honeypot field is filled              | `_honeypot = 'bot@spam.com'`                           | Submission created with `status = 'spam'`                    |
| should throw RATE_LIMIT_EXCEEDED on 6th submission from same IP | 6th call from same IP within 1 hour                    | Throws 429 `RATE_LIMIT_EXCEEDED`                             |
| should allow 5 submissions from same IP                         | 5 calls from same IP                                   | All 5 succeed                                                |
| edge: honeypot submission still stored (not silently rejected)  | Honeypot filled                                        | Submission record exists in DB with `status = 'spam'`        |
| edge: rate limit resets after 1 hour                            | 5 submissions, wait 1h (mock TTL expiry), submit again | 6th submission succeeds                                      |

#### `updateStatus()`

Valid transitions:

| Test                                 | Input                                           | Expected Output       |
| ------------------------------------ | ----------------------------------------------- | --------------------- |
| should transition new to reviewed    | `current = 'new'`, `new_status = 'reviewed'`    | `status = 'reviewed'` |
| should transition new to closed      | `current = 'new'`, `new_status = 'closed'`      | `status = 'closed'`   |
| should transition new to spam        | `current = 'new'`, `new_status = 'spam'`        | `status = 'spam'`     |
| should transition reviewed to closed | `current = 'reviewed'`, `new_status = 'closed'` | `status = 'closed'`   |
| should transition reviewed to spam   | `current = 'reviewed'`, `new_status = 'spam'`   | `status = 'spam'`     |

Invalid transitions:

| Test                                              | Input                                        | Expected Output                        |
| ------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| edge: should throw when transitioning from closed | `current = 'closed'`, any new_status         | Throws 400 `INVALID_STATUS_TRANSITION` |
| edge: should throw when transitioning from spam   | `current = 'spam'`, any new_status           | Throws 400 `INVALID_STATUS_TRANSITION` |
| edge: should throw when trying reviewed → new     | `current = 'reviewed'`, `new_status = 'new'` | Throws 400 `INVALID_STATUS_TRANSITION` |

---

### 1.9 `WebhookService`

**File:** `apps/api/src/modules/communications/webhook.service.spec.ts`

#### `handleResendEvent()`

| Test                                                             | Input                                                       | Expected Output                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| should update notification status to delivered on delivery event | Resend `email.delivered` event, valid `provider_message_id` | Notification `status = 'delivered'`, `delivered_at` set |
| should update notification status to failed on bounce            | Resend `email.bounced` event                                | Notification `status = 'failed'`, `failure_reason` set  |
| should flag parent email for admin review on bounce              | Bounce event, notification linked to a parent user          | Parent record flagged (audit log or flag field)         |
| should handle complaint event by marking failed                  | Resend `email.complained` event                             | Notification `status = 'failed'`                        |
| edge: should handle unknown provider_message_id gracefully       | Event with ID not in DB                                     | No error thrown, event ignored                          |

#### `handleTwilioEvent()`

| Test                                                                | Input                              | Expected Output                                                           |
| ------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| should update notification status to delivered                      | Twilio `delivered` status callback | Notification `status = 'delivered'`                                       |
| should update status to failed and create email fallback on failure | Twilio `failed` callback           | Notification `status = 'failed'`, new `email` notification record created |
| should update status to failed on undelivered                       | Twilio `undelivered` callback      | Notification `status = 'failed'`                                          |
| edge: fallback email notification has correct tenant_id             | Twilio failure triggers fallback   | New email notification has same `tenant_id` as original                   |

---

## Section 2 — Integration Tests

Integration tests run against a test database with tenant isolation. Use Supertest to exercise the full HTTP stack. File location: `apps/api/test/p7/`.

---

### 2.1 Announcements Endpoints

**File:** `apps/api/test/p7/announcements.e2e-spec.ts`

#### `POST /api/v1/announcements`

| Test                                        | Setup                                 | Request                                                              | Expected                                                  |
| ------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| happy path — school scope                   | Admin with `communications.manage`    | `{ title, body_html, scope: 'school', target_payload: {} }`          | 201, `{ data: { id, status: 'draft', scope: 'school' } }` |
| happy path — year_group scope               | Admin, valid year_group_ids           | `{ scope: 'year_group', target_payload: { year_group_ids: [...] } }` | 201, record with correct target_payload                   |
| happy path — class scope                    | Admin, valid class_ids                | `{ scope: 'class', target_payload: { class_ids: [...] } }`           | 201                                                       |
| happy path — household scope                | Admin, valid household_ids            | `{ scope: 'household', target_payload: { household_ids: [...] } }`   | 201                                                       |
| happy path — custom scope                   | Admin, valid user_ids                 | `{ scope: 'custom', target_payload: { user_ids: [...] } }`           | 201                                                       |
| auth failure                                | No token                              | Any valid body                                                       | 401                                                       |
| permission failure — wrong permission       | Admin with `communications.view` only | Any valid body                                                       | 403                                                       |
| permission failure — parent role            | Parent JWT                            | Any valid body                                                       | 403                                                       |
| validation failure — missing title          | Admin                                 | `{ body_html, scope }` (no title)                                    | 400                                                       |
| validation failure — scope/payload mismatch | Admin                                 | `{ scope: 'year_group', target_payload: {} }`                        | 400                                                       |
| validation failure — malicious body_html    | Admin                                 | `{ body_html: '<script>alert(1)</script>content' }`                  | 201, but script stripped in stored record                 |

#### `PATCH /api/v1/announcements/:id`

| Test                                   | Setup                      | Request                      | Expected                     |
| -------------------------------------- | -------------------------- | ---------------------------- | ---------------------------- |
| happy path                             | Admin, draft announcement  | `{ title: 'Updated Title' }` | 200, updated record          |
| auth failure                           | No token                   | Any                          | 401                          |
| permission failure                     | `communications.view` only | Any                          | 403                          |
| not found                              | Random UUID                | `{ title: 'x' }`             | 404                          |
| validation failure — editing non-draft | Published announcement     | `{ title: 'x' }`             | 400 `ANNOUNCEMENT_NOT_DRAFT` |

#### `POST /api/v1/announcements/:id/publish`

| Test                                           | Setup                                   | Request                                         | Expected                                                                 |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| happy path — immediate publish, no approval    | Draft announcement, approval disabled   | `{}`                                            | 200, `{ data: { status: 'published' }, approval_required: false }`       |
| happy path — scheduled publish                 | Draft announcement                      | `{ scheduled_publish_at: '<future ISO date>' }` | 200, `{ data: { status: 'scheduled' } }`                                 |
| happy path — approval required                 | Draft, approval enabled in settings     | `{}`                                            | 200, `{ data: { status: 'pending_approval' }, approval_required: true }` |
| auth failure                                   | No token                                | Any                                             | 401                                                                      |
| permission failure — needs communications.send | Admin with `communications.manage` only | Any                                             | 403                                                                      |
| not found                                      | Random UUID                             | `{}`                                            | 404                                                                      |
| validation failure — already published         | Published announcement                  | `{}`                                            | 400 `ANNOUNCEMENT_NOT_DRAFT`                                             |

#### `POST /api/v1/announcements/:id/archive`

| Test                           | Setup                      | Request | Expected                                |
| ------------------------------ | -------------------------- | ------- | --------------------------------------- |
| happy path — archive published | Published announcement     | `{}`    | 200, `{ data: { status: 'archived' } }` |
| happy path — archive draft     | Draft announcement         | `{}`    | 200, `{ data: { status: 'archived' } }` |
| auth failure                   | No token                   | —       | 401                                     |
| permission failure             | `communications.view` only | —       | 403                                     |
| not found                      | Random UUID                | —       | 404                                     |

#### `GET /api/v1/announcements/:id/delivery-status`

| Test               | Setup                                     | Expected                                                            |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------- |
| happy path         | Published announcement with notifications | 200, `{ total, queued, sent, delivered, failed, read }` all numeric |
| auth failure       | No token                                  | 401                                                                 |
| permission failure | No `communications.view`                  | 403                                                                 |
| not found          | Random UUID                               | 404                                                                 |

#### `GET /api/v1/announcements/my`

| Test                                                         | Setup                                    | Expected                      |
| ------------------------------------------------------------ | ---------------------------------------- | ----------------------------- |
| happy path                                                   | Parent with 3 announcement notifications | 200, 3 announcements returned |
| auth failure                                                 | No token                                 | 401                           |
| permission failure — admin without parent.view_announcements | Admin JWT                                | 403                           |
| returns empty for parent with no notifications               | Parent with no notifications             | 200, `{ data: [] }`           |

---

### 2.2 Notifications Endpoints

**File:** `apps/api/test/p7/notifications.e2e-spec.ts`

#### `GET /api/v1/notifications`

| Test                                                              | Setup                           | Expected                                      |
| ----------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| happy path — returns current user's notifications                 | User with 5 notifications       | 200, 5 records, all belong to requesting user |
| pagination — default page size                                    | User with 25 notifications      | 200, 20 records, `meta.total = 25`            |
| filter by unread_only                                             | 5 unread, 10 read notifications | With `?unread_only=true`: 5 records           |
| auth failure                                                      | No token                        | 401                                           |
| cross-user isolation — does not return other users' notifications | Two users in same tenant        | Each user sees only their own notifications   |

#### `GET /api/v1/notifications/unread-count`

| Test                       | Setup                     | Expected                      |
| -------------------------- | ------------------------- | ----------------------------- |
| happy path — returns count | User with 3 unread in-app | 200, `{ data: { count: 3 } }` |
| returns 0 when no unread   | User with all read        | 200, `{ data: { count: 0 } }` |
| auth failure               | No token                  | 401                           |

#### `PATCH /api/v1/notifications/:id/read`

| Test                                               | Setup                                 | Expected                                |
| -------------------------------------------------- | ------------------------------------- | --------------------------------------- |
| happy path                                         | Unread notification belonging to user | 200, notification status becomes `read` |
| auth failure                                       | No token                              | 401                                     |
| not found — notification belongs to different user | Different user's notification         | 404                                     |

#### `POST /api/v1/notifications/mark-all-read`

| Test                                       | Setup                       | Expected                                     |
| ------------------------------------------ | --------------------------- | -------------------------------------------- |
| happy path                                 | User with 10 unread         | 200, all notifications read                  |
| auth failure                               | No token                    | 401                                          |
| does not affect other users' notifications | Two users, both with unread | Only requesting user's notifications updated |

#### `GET /api/v1/notifications/admin/failed`

| Test                   | Setup                             | Expected                              |
| ---------------------- | --------------------------------- | ------------------------------------- |
| happy path             | 5 failed notifications in tenant  | 200, 5 records with recipient details |
| auth failure           | No token                          | 401                                   |
| permission failure     | No `communications.view`          | 403                                   |
| cross-tenant isolation | Tenant A has failed notifications | Tenant B admin sees 0                 |

---

### 2.3 Notification Templates Endpoints

**File:** `apps/api/test/p7/notification-templates.e2e-spec.ts`

#### `GET /api/v1/notification-templates`

| Test                   | Setup                                               | Expected                                         |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------ |
| happy path             | Tenant with 2 custom templates + platform templates | 200, both tenant and platform templates returned |
| filter by template_key | `?template_key=announcement.published`              | Only templates with that key                     |
| auth failure           | No token                                            | 401                                              |
| permission failure     | `communications.view` only                          | 403 (requires `communications.manage`)           |

#### `POST /api/v1/notification-templates`

| Test               | Setup                                             | Request                                                                                             | Expected                           |
| ------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------- |
| happy path         | Admin with `communications.manage`                | `{ channel: 'email', template_key: 'custom.alert', locale: 'en', body_template: 'Hello {{name}}' }` | 201, template with `tenant_id` set |
| auth failure       | No token                                          | Any                                                                                                 | 401                                |
| permission failure | `communications.view` only                        | Any                                                                                                 | 403                                |
| duplicate conflict | Same key/channel/locale already exists for tenant | Same body as above                                                                                  | 409                                |

#### `PATCH /api/v1/notification-templates/:id`

| Test                        | Setup                                | Request                             | Expected                       |
| --------------------------- | ------------------------------------ | ----------------------------------- | ------------------------------ |
| happy path                  | Admin, tenant-owned template         | `{ body_template: 'Updated body' }` | 200, updated template          |
| auth failure                | No token                             | Any                                 | 401                            |
| permission failure          | `communications.view`                | Any                                 | 403                            |
| not found                   | Random UUID                          | Any                                 | 404                            |
| cannot edit system template | System template (`is_system = true`) | Any                                 | 403 `SYSTEM_TEMPLATE_READONLY` |

---

### 2.4 Parent Inquiries Endpoints

**File:** `apps/api/test/p7/parent-inquiries.e2e-spec.ts`

#### `POST /api/v1/inquiries` (Parent)

| Test                                              | Setup                                  | Request                                               | Expected                                                  |
| ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| happy path — without student                      | Parent JWT, valid parent record        | `{ subject: 'Question', message: 'Body text' }`       | 201, inquiry with `status: 'open'`, first message created |
| happy path — with student link                    | Parent with linked student             | `{ subject, message, student_id: '<own student>' }`   | 201, `student_id` populated                               |
| auth failure                                      | No token                               | Any                                                   | 401                                                       |
| permission failure — admin JWT                    | Admin JWT (no `parent.submit_inquiry`) | Any                                                   | 403                                                       |
| validation failure — student not linked to parent | `student_id` from different parent     | `{ subject, message, student_id: '<other student>' }` | 400 `STUDENT_NOT_LINKED`                                  |
| validation failure — missing subject              | No subject                             | `{ message: 'x' }`                                    | 400                                                       |

#### `POST /api/v1/inquiries/:id/messages` (Admin)

| Test                                                | Setup                                        | Request                        | Expected                                                   |
| --------------------------------------------------- | -------------------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| happy path — auto-transition open to in_progress    | Open inquiry, admin with `inquiries.respond` | `{ message: 'Admin reply' }`   | 201, message created, inquiry status becomes `in_progress` |
| happy path — no transition when already in_progress | In-progress inquiry                          | `{ message: 'Another reply' }` | 201, status unchanged                                      |
| auth failure                                        | No token                                     | Any                            | 401                                                        |
| permission failure — needs inquiries.respond        | Admin with `inquiries.view` only             | Any                            | 403                                                        |
| permission failure — parent JWT                     | Parent JWT                                   | Any                            | 403                                                        |
| closed inquiry                                      | Closed inquiry                               | `{ message: 'text' }`          | 400 `INQUIRY_CLOSED`                                       |
| not found                                           | Random UUID                                  | Any                            | 404                                                        |

#### `GET /api/v1/inquiries/:id/parent` (Parent)

| Test                                      | Setup                                        | Expected                                                         |
| ----------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| happy path — admin author masked          | Inquiry with admin message from "Jane Admin" | 200, admin message shows `author_name = 'School Administration'` |
| parent message shows real author          | Inquiry with parent message                  | Parent's own name shown                                          |
| auth failure                              | No token                                     | 401                                                              |
| parent cannot view other parent's inquiry | Different parent JWT                         | 404 `INQUIRY_NOT_FOUND`                                          |

#### `POST /api/v1/inquiries/:id/close` (Admin)

| Test                                         | Setup                 | Expected                        |
| -------------------------------------------- | --------------------- | ------------------------------- |
| happy path — close open inquiry              | Open inquiry          | 200, `status = 'closed'`        |
| happy path — close in_progress inquiry       | In-progress inquiry   | 200, `status = 'closed'`        |
| auth failure                                 | No token              | 401                             |
| permission failure — needs inquiries.respond | `inquiries.view` only | 403                             |
| cannot close already-closed inquiry          | Closed inquiry        | 400 `INVALID_STATUS_TRANSITION` |

#### `POST /api/v1/inquiries/:id/messages/parent` (Parent)

| Test                                              | Setup                        | Request                    | Expected                                   |
| ------------------------------------------------- | ---------------------------- | -------------------------- | ------------------------------------------ |
| happy path                                        | Open inquiry, parent owns it | `{ message: 'Follow up' }` | 201, message with `author_type = 'parent'` |
| parent cannot message on closed inquiry           | Closed inquiry               | `{ message: 'x' }`         | 400 `INQUIRY_CLOSED`                       |
| parent cannot message on another parent's inquiry | Different parent JWT         | `{ message: 'x' }`         | 404                                        |
| auth failure                                      | No token                     | Any                        | 401                                        |

---

### 2.5 Website CMS Endpoints

**File:** `apps/api/test/p7/website-pages.e2e-spec.ts`

#### `POST /api/v1/website/pages`

| Test                     | Setup                           | Request                                                                           | Expected               |
| ------------------------ | ------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| happy path — home page   | Admin with `website.manage`     | `{ page_type: 'home', slug: 'home', title: 'Home', body_html: '<p>Welcome</p>' }` | 201, `status: 'draft'` |
| happy path — custom page | Admin                           | `{ page_type: 'custom', slug: 'news', title: 'News', ... }`                       | 201                    |
| auth failure             | No token                        | Any                                                                               | 401                    |
| permission failure       | No `website.manage`             | Any                                                                               | 403                    |
| duplicate slug conflict  | Same slug/locale already exists | Same slug                                                                         | 409                    |
| invalid slug format      | Admin                           | `{ slug: 'My Page!' }` (spaces, special chars)                                    | 400                    |
| malicious HTML sanitised | Admin                           | `{ body_html: '<script>evil()</script><p>content</p>' }`                          | 201, script removed    |

#### `POST /api/v1/website/pages/:id/publish`

| Test                                                 | Setup                                    | Expected                                                                        |
| ---------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| happy path — publish non-homepage                    | Draft page with `page_type = 'about'`    | 200, `status = 'published'`, `published_at` set                                 |
| homepage enforcement — unpublishes previous homepage | Two home pages: one published, one draft | 200, old homepage `status = 'unpublished'`, new homepage `status = 'published'` |
| auth failure                                         | No token                                 | 401                                                                             |
| permission failure                                   | No `website.manage`                      | 403                                                                             |
| not found                                            | Random UUID                              | 404                                                                             |

#### `DELETE /api/v1/website/pages/:id`

| Test                            | Setup               | Expected                             |
| ------------------------------- | ------------------- | ------------------------------------ |
| happy path — delete draft       | Draft page          | 200 or 204, page deleted             |
| happy path — delete unpublished | Unpublished page    | 200 or 204                           |
| auth failure                    | No token            | 401                                  |
| permission failure              | No `website.manage` | 403                                  |
| cannot delete published page    | Published page      | 400 `PAGE_MUST_BE_UNPUBLISHED_FIRST` |
| not found                       | Random UUID         | 404                                  |

---

### 2.6 Public Website Endpoints

**File:** `apps/api/test/p7/public-website.e2e-spec.ts`

#### `GET /api/v1/public/pages`

| Test                         | Setup                                     | Expected                                 |
| ---------------------------- | ----------------------------------------- | ---------------------------------------- |
| happy path                   | Tenant with 3 published pages             | 200, 3 pages returned (no auth required) |
| does not return draft pages  | Tenant has 2 published, 1 draft           | 200, only 2 pages                        |
| tenant isolation from domain | Two tenants, request from Tenant A domain | Only Tenant A's pages returned           |

#### `GET /api/v1/public/pages/:slug`

| Test                                           | Setup                             | Expected               |
| ---------------------------------------------- | --------------------------------- | ---------------------- |
| happy path                                     | Published page with slug `about`  | 200, full page content |
| not found — draft page                         | Draft page with same slug         | 404 `PAGE_NOT_FOUND`   |
| not found — published page in different tenant | Correct slug, wrong tenant domain | 404                    |

#### `POST /api/v1/public/contact`

| Test                                  | Setup                                      | Request                                   | Expected                              |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------- | ------------------------------------- |
| happy path                            | No prior submissions from IP               | `{ name, email, message, _honeypot: '' }` | 201, submission with `status: 'new'`  |
| honeypot filled — stored as spam      | First submission, `_honeypot` non-empty    | `{ ..., _honeypot: 'bot@spam.com' }`      | 201, submission with `status: 'spam'` |
| rate limit exceeded                   | 5 prior submissions from same IP within 1h | 6th submission                            | 429 `RATE_LIMIT_EXCEEDED`             |
| 5th submission succeeds               | 4 prior submissions                        | 5th submission                            | 201                                   |
| validation failure — invalid email    | —                                          | `{ email: 'not-an-email' }`               | 400                                   |
| validation failure — message too long | —                                          | Message > 5000 chars                      | 400                                   |

---

### 2.7 Contact Submissions Admin Endpoints

**File:** `apps/api/test/p7/contact-submissions.e2e-spec.ts`

#### `GET /api/v1/contact-submissions`

| Test                                    | Setup                    | Expected                       |
| --------------------------------------- | ------------------------ | ------------------------------ |
| happy path — excludes spam by default   | Tenant has 3 new, 1 spam | 200, 3 records (spam excluded) |
| includes spam when explicitly requested | `?status=spam`           | Returns spam records           |
| auth failure                            | No token                 | 401                            |
| permission failure                      | No `communications.view` | 403                            |

#### `PATCH /api/v1/contact-submissions/:id/status`

| Test                                             | Setup                            | Request                  | Expected                        |
| ------------------------------------------------ | -------------------------------- | ------------------------ | ------------------------------- |
| happy path — new to reviewed                     | Submission with `status = 'new'` | `{ status: 'reviewed' }` | 200, `status = 'reviewed'`      |
| happy path — new to closed                       | `status = 'new'`                 | `{ status: 'closed' }`   | 200                             |
| happy path — reviewed to spam                    | `status = 'reviewed'`            | `{ status: 'spam' }`     | 200                             |
| invalid transition — closed to reviewed          | `status = 'closed'`              | `{ status: 'reviewed' }` | 400 `INVALID_STATUS_TRANSITION` |
| invalid transition — spam to closed              | `status = 'spam'`                | `{ status: 'closed' }`   | 400 `INVALID_STATUS_TRANSITION` |
| auth failure                                     | No token                         | Any                      | 401                             |
| permission failure — needs communications.manage | `communications.view` only       | Any                      | 403                             |
| not found                                        | Random UUID                      | Any                      | 404                             |

---

### 2.8 Webhook Endpoints

**File:** `apps/api/test/p7/webhooks.e2e-spec.ts`

#### `POST /api/v1/webhooks/resend`

| Test                        | Setup                                               | Request                                      | Expected                                              |
| --------------------------- | --------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| happy path — delivery event | Notification with `provider_message_id = 'msg-123'` | Valid Resend delivery event with matching ID | 200, notification `status = 'delivered'`              |
| bounce event                | Notification with matching ID                       | Resend bounce event                          | 200, notification `status = 'failed'`, parent flagged |
| complaint event             | Notification with matching ID                       | Resend complaint event                       | 200, notification `status = 'failed'`                 |
| invalid signature           | Any notification                                    | Request with invalid Resend signature        | 401 or 400                                            |
| unknown provider_message_id | No matching notification                            | Delivery event with unknown ID               | 200 (ignored gracefully)                              |

#### `POST /api/v1/webhooks/twilio`

| Test                             | Setup                                             | Request                        | Expected                                                              |
| -------------------------------- | ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| happy path — delivered           | Notification with `provider_message_id = 'SM123'` | Twilio `delivered` callback    | 200, notification `status = 'delivered'`                              |
| failed — triggers email fallback | WhatsApp notification with matching ID            | Twilio `failed` callback       | 200, notification `status = 'failed'`, new email notification created |
| undelivered                      | WhatsApp notification                             | Twilio `undelivered` callback  | 200, notification `status = 'failed'`                                 |
| invalid Twilio signature         | Any                                               | Request with invalid signature | 401 or 400                                                            |

---

## Section 3 — RLS Leakage Tests

Every test follows the pattern from `.claude/rules/testing.md`:

1. Create data as Tenant A
2. Authenticate as Tenant B
3. Query and assert Tenant B sees nothing.

**File:** `apps/api/test/p7/rls-leakage.e2e-spec.ts`

---

### 3.1 `announcements` Table

**Test: should not expose Tenant A announcements to Tenant B**

Setup:

- Tenant A: create 3 announcements (draft, published, archived)
- Tenant B: admin with `communications.view`

Assertions:

- `GET /api/v1/announcements` as Tenant B → `data` array is empty
- `GET /api/v1/announcements/:id` (Tenant A's ID) as Tenant B → 404

---

### 3.2 `notification_templates` Table

**Test: should not expose Tenant A custom templates to Tenant B**

Setup:

- Tenant A: create 2 custom notification templates
- Tenant B: admin with `communications.manage`

Assertions:

- `GET /api/v1/notification-templates` as Tenant B → returns only platform-level templates (tenant_id IS NULL), never Tenant A's templates
- `GET /api/v1/notification-templates/:id` (Tenant A's template ID) as Tenant B → 404

---

### 3.3 `notifications` Table

**Test: should not expose Tenant A notifications to Tenant B users**

Setup:

- Tenant A: create 5 in-app notifications for Tenant A's user
- Tenant B: authenticate as Tenant B user (different user_id)

Assertions:

- `GET /api/v1/notifications` as Tenant B user → `data` array is empty
- `GET /api/v1/notifications/unread-count` as Tenant B user → `count: 0`
- `GET /api/v1/notifications/admin/failed` as Tenant B admin → no Tenant A notifications in result

**Test: should not allow marking Tenant A notification as read via Tenant B context**

Setup:

- Tenant A: 1 unread notification for Tenant A's user

Assertions:

- `PATCH /api/v1/notifications/:id/read` (Tenant A's notification ID) as Tenant B user → 404

---

### 3.4 `parent_inquiries` Table

**Test: should not expose Tenant A inquiries to Tenant B admins**

Setup:

- Tenant A: create 3 parent inquiries
- Tenant B: admin with `inquiries.view`

Assertions:

- `GET /api/v1/inquiries` as Tenant B → empty result
- `GET /api/v1/inquiries/:id` (Tenant A's inquiry ID) as Tenant B → 404

**Test: should not allow Tenant B parent to view Tenant A parent's inquiry**

Setup:

- Tenant A parent: create inquiry
- Tenant B parent: authenticate

Assertions:

- `GET /api/v1/inquiries/:id/parent` (Tenant A's ID) as Tenant B parent → 404

---

### 3.5 `parent_inquiry_messages` Table

**Test: messages cannot be retrieved across tenant boundary**

Setup:

- Tenant A parent: create inquiry with 3 messages
- Tenant B admin: `inquiries.view`

Assertions:

- `GET /api/v1/inquiries/:id` (Tenant A's inquiry) as Tenant B → 404 (inquiry not visible, therefore messages not visible)
- Direct DB query as Tenant B's RLS context (in integration test setup) returns 0 rows for Tenant A's messages

---

### 3.6 `website_pages` Table

**Test: should not expose Tenant A pages to Tenant B admins**

Setup:

- Tenant A: 2 published pages, 1 draft
- Tenant B: admin with `website.manage`

Assertions:

- `GET /api/v1/website/pages` as Tenant B → empty result (or only Tenant B's own pages if any)
- `GET /api/v1/website/pages/:id` (Tenant A's page ID) as Tenant B → 404

**Test: public endpoints serve only the correct tenant's pages**

Setup:

- Tenant A: published page with slug `about`
- Tenant B: published page with same slug `about`, different content

Assertions:

- `GET /api/v1/public/pages/about` with Tenant A's domain → returns Tenant A's page content only
- Content does not include Tenant B's body text

---

### 3.7 `contact_form_submissions` Table

**Test: should not expose Tenant A contact submissions to Tenant B admins**

Setup:

- Tenant A: 5 contact form submissions (via public endpoint, or direct DB seed)
- Tenant B: admin with `communications.view`

Assertions:

- `GET /api/v1/contact-submissions` as Tenant B → empty result
- `PATCH /api/v1/contact-submissions/:id/status` (Tenant A's submission ID) as Tenant B → 404

---

### 3.8 Endpoint-Level RLS Checks (Additional)

**Test: delivery status endpoint is tenant-scoped**

- Tenant A: published announcement with 10 notifications
- Tenant B: admin queries `GET /api/v1/announcements/:id/delivery-status` using Tenant A's announcement ID
- Expected: 404

**Test: admin inquiry list never leaks across tenants**

- Tenant A: 5 open inquiries
- Tenant B: `GET /api/v1/inquiries?status=open`
- Expected: 0 results for Tenant B

---

## Section 4 — Manual QA Checklist

These tests require a running development environment. Test in the browser. Both English and Arabic interfaces must be verified for each workflow.

---

### 4.1 Communications — Announcement Flow

**Prerequisites:** Two admin users in a tenant. One with `communications.manage` and `communications.send`, one without. At least one parent user with linked students enrolled in classes.

**Steps:**

1. Log in as admin with `communications.manage`.
2. Navigate to **Communications** in the sidebar.
3. Click **New Announcement**.
4. Enter a title: "Test School Announcement".
5. Use the TipTap editor to write body content. Verify toolbar shows: bold, italic, H2, H3, bullet list, ordered list, link, blockquote, code block, HR, undo/redo.
6. Verify the RTL/LTR direction toggle works per block. Toggle a paragraph to RTL — verify `dir="rtl"` is applied to that block only.
7. Select **Scope: School-wide**.
8. Click **Save as Draft**. Verify redirect to announcement detail, status badge shows "Draft".
9. Return to announcements list. Verify draft appears in the list under the Draft tab.

**Test Scope Targeting:**

10. Create a new announcement with **Scope: Year Group**. Verify a multi-select for year groups appears. Select one year group. Save as draft.
11. Create a new announcement with **Scope: Class**. Verify a class multi-select appears. Select a class. Save as draft.
12. Create a new announcement with **Scope: Household**. Select a household. Save as draft.
13. Create a new announcement with **Scope: Custom**. Search for a user by name. Select them. Save as draft.

**Test Publish Without Approval:**

14. Ensure `requireApprovalForAnnouncements = false` in tenant settings.
15. Open the school-wide draft announcement. Click **Publish**.
16. Verify status changes to "Published", `published_at` is set.
17. Verify the delivery status panel appears showing notification counts (queued/sent/delivered/failed/read).
18. Verify counts increment over time as BullMQ processes notifications.

**Test Publish With Approval:**

19. Enable `requireApprovalForAnnouncements = true` in tenant settings.
20. Create a new draft announcement. Click **Publish** (or "Submit for Approval").
21. Verify status changes to "Pending Approval". Verify an approval banner appears.
22. Log in as the approver admin. Navigate to pending approvals. Approve the announcement.
23. Verify announcement status changes to "Published" after approval.
24. Verify the original requester cannot approve their own submission (approval UI should not allow self-approval).

**Test Scheduled Announcement:**

25. Create a new draft announcement. Enable the schedule toggle. Set `scheduled_publish_at` to 5 minutes from now.
26. Click **Publish** (or **Schedule**). Verify status changes to "Scheduled".
27. Wait 5 minutes. Verify status changes to "Published" and delivery begins.

**Test Parent View:**

28. Log in as a parent user who was in the target audience of the published school-wide announcement.
29. Navigate to **Announcements** in the parent portal sidebar.
30. Verify the announcement appears in the list.
31. Click to open and verify full body content renders correctly (including any RTL blocks).

---

### 4.2 Parent Inquiry Flow

**Prerequisites:** One parent user with at least one linked student. Admin users with `inquiries.view` and `inquiries.respond` permissions.

**Steps — Parent Side:**

1. Log in as parent. Navigate to **Inquiries** in the sidebar.
2. Click **New Inquiry**.
3. Verify a student selector dropdown appears showing only the parent's linked students.
4. Enter a subject: "Question about fees".
5. Optionally select a student.
6. Enter a message body.
7. Click **Submit**. Verify redirect to inquiry thread.
8. Verify the inquiry shows `status: Open`.
9. Verify the parent's message appears in the thread (left-aligned / start-aligned per RTL layout rules).

**Steps — Admin Side:**

10. Log in as admin with `inquiries.view`.
11. Navigate to **Communications → Inquiries**.
12. Verify the new inquiry appears in the list under the **Open** tab.
13. Verify the inquiry shows parent name, linked student name (if applicable), message count, last activity time.
14. Verify stale indicator (amber dot) does NOT appear yet (inquiry is fresh).
15. Click the inquiry to open the thread.
16. Verify admin sees the parent's message with the parent's real name.
17. As admin with `inquiries.respond`: type a reply in the reply textarea and send.
18. Verify the reply appears in the thread with the admin's actual name.
19. Verify inquiry status automatically changes to **In Progress**.

**Admin Author Masking:**

20. Log back in as parent. Refresh the inquiry thread.
21. Verify the admin's reply shows **"School Administration"** as the author — NOT the admin's real name.
22. Verify the parent's original message still shows the parent's name (not masked).

**Continued Conversation:**

23. As parent: add a follow-up message.
24. As admin: verify the notification for new parent message was received (in-app bell).
25. As admin: reply again.
26. Verify both parties can see the full thread.

**Inquiry Closure:**

27. As admin: click **Close Inquiry**. Verify status changes to **Closed**.
28. Verify the reply textarea is disabled/hidden on the closed inquiry for both admin and parent.
29. Attempt to add a message via API to the closed inquiry — verify 400 `INQUIRY_CLOSED`.

---

### 4.3 Website CMS Flow

**Prerequisites:** Admin with `website.manage` permission.

**Steps:**

1. Log in as admin. Navigate to **Website** in the sidebar.
2. Click **New Page**.
3. Select **Page Type: Home**. Enter title "Welcome to Our School", auto-slug should generate as `welcome-to-our-school` (or similar). Edit the slug if needed.
4. Use TipTap to write body content. Verify BiDi support works (per Section 4.1 step 6).
5. Click **Save as Draft**. Verify page appears in list with status "Draft".

**Test Each Page Type:** 6. Create pages of each type: `home`, `about`, `admissions`, `contact`, `custom`.

**Test Publish:** 7. Open the draft home page. Click **Publish**. Verify `status = 'published'`, `published_at` set.

**Test Homepage Enforcement:** 8. Create a second home page (different title and slug). Publish it. 9. Verify the first home page's status automatically changes to **Unpublished**. 10. Verify only one homepage shows as published at any time.

**Test Navigation:** 11. Edit a published page. Enable **Show in Nav** toggle. Set Nav Order to 1. 12. Navigate to the public website. Verify the page appears in the navigation menu in the correct order.

**Test Duplicate Slug:** 13. Attempt to create a page with the same slug as an existing page in the same locale. 14. Verify the API returns an error (409 conflict) and the UI shows an appropriate validation message.

**Test Delete:** 15. Create a draft page. Delete it. Verify it disappears from the list. 16. Attempt to delete a published page. Verify the UI blocks this with an error message. Unpublish it first, then delete.

---

### 4.4 Contact Form Flow

**Prerequisites:** Public website accessible. Admin with `communications.view` and `communications.manage`.

**Steps:**

1. Navigate to the public contact page (`/contact` under the school's public domain).
2. Fill in name, email, optional phone, and message.
3. Ensure the honeypot field is empty (it should be hidden from real users).
4. Click **Submit**. Verify success message appears.
5. Log in as admin. Navigate to **Website → Contact Submissions**.
6. Verify the submission appears with `status: New`.
7. Open the submission. Verify all fields are populated correctly.

**Rate Limiting:** 8. Submit the contact form 5 times from the same IP (use browser or script). 9. Submit a 6th time. Verify the response is an error message about rate limiting (429). 10. Verify the first 5 submissions are in the admin panel. The 6th should NOT appear.

**Honeypot Test:** 11. Manually submit the form with the `_honeypot` field populated (via browser dev tools or API call). 12. Verify the submission IS stored (not silently dropped) with `status: Spam`. 13. Verify it does NOT appear in the default admin view (spam is hidden by default). 14. In the admin panel, enable the **Show Spam** toggle. Verify the spam submission appears.

**Status Transitions:** 15. Mark a **New** submission as **Reviewed**. Verify status changes. 16. Mark a **Reviewed** submission as **Closed**. Verify status changes. 17. Attempt to mark a **Closed** submission as anything. Verify the action is blocked. 18. Mark a **New** submission as **Spam** directly. Verify status changes. 19. Attempt to mark a **Spam** submission. Verify blocked. 20. Reclassify a **Spam** submission — verify this requires a specific "reclassify" action if implemented, or verify it is intentionally blocked per spec.

---

### 4.5 Notification Panel

**Prerequisites:** User account with at least one notification delivered (trigger by publishing an announcement targeting this user).

**Steps:**

1. Log in as a user who has received a notification.
2. Verify the bell icon in the top bar shows an unread count badge (e.g., "3").
3. Click the bell icon. Verify the notification panel slides open.
4. Verify notifications are grouped by **Today / Yesterday / Earlier** (if applicable).
5. Verify each notification shows: an icon, a bold action line, a context line, and a relative timestamp.
6. Verify unread notifications have a visible indicator (dot or highlight).
7. Click a notification. Verify it navigates to the source entity (e.g., the announcement) and the unread dot disappears.
8. Verify the unread count in the bell decrements by 1.
9. Click **Mark all read** in the panel header. Verify all notifications are marked as read and the badge disappears (count = 0).
10. Close and reopen the panel. Verify the read state persists.

---

### 4.6 Both Locales

Repeat the following flows in **Arabic (ar)** locale:

1. Create and publish a school-wide announcement. Verify the body renders correctly in RTL when the content is in Arabic.
2. Submit a parent inquiry in Arabic. Verify the thread displays with RTL layout.
3. View the notification panel in Arabic. Verify text is RTL-aligned.
4. Navigate to a public website page in Arabic locale. Verify content renders correctly.

Verify that all UI elements use logical CSS classes (`ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`) and that the layout inverts correctly in RTL — no physical `ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right` present in any P7 component.

---

### 4.7 Role-Based Access Control

**Verify the following access rules by logging in as users with different role configurations:**

#### Communications Permissions

| Role / Permission                | Create Announcement | Edit Announcement | Publish Announcement | View Delivery Status |
| -------------------------------- | ------------------- | ----------------- | -------------------- | -------------------- |
| `communications.view` only       | Blocked (403)       | Blocked (403)     | Blocked (403)        | Allowed              |
| `communications.manage`          | Allowed             | Allowed           | Blocked (403)        | Allowed              |
| `communications.send` (+ manage) | Allowed             | Allowed           | Allowed              | Allowed              |
| Parent role                      | Blocked (403)       | Blocked (403)     | Blocked (403)        | Blocked (403)        |

#### Inquiry Permissions

| Role / Permission                   | See inquiry list        | Reply to inquiry | Close inquiry | Create inquiry (parent) |
| ----------------------------------- | ----------------------- | ---------------- | ------------- | ----------------------- |
| `inquiries.view`                    | Allowed                 | Blocked (403)    | Blocked (403) | Blocked                 |
| `inquiries.respond` (+ view)        | Allowed                 | Allowed          | Allowed       | Blocked                 |
| Parent with `parent.submit_inquiry` | Blocked from admin list | N/A              | N/A           | Allowed                 |
| Admin with no inquiry permissions   | Blocked (403)           | Blocked (403)    | Blocked (403) | N/A                     |

**Verify cross-endpoint isolation:**

- Parent cannot access `GET /api/v1/inquiries` (admin list endpoint) — must receive 403.
- Parent can only see their own inquiries via `GET /api/v1/inquiries/my`.
- Parent viewing `GET /api/v1/inquiries/:id/parent` for a different parent's inquiry gets 404.

#### Website Permissions

| Role / Permission                      | View pages list | Create/Edit pages | Publish page  | Delete page   |
| -------------------------------------- | --------------- | ----------------- | ------------- | ------------- |
| `website.manage`                       | Allowed         | Allowed           | Allowed       | Allowed       |
| No `website.manage`                    | Blocked (403)   | Blocked (403)     | Blocked (403) | Blocked (403) |
| Any authenticated user (no permission) | Blocked (403)   | Blocked (403)     | Blocked (403) | Blocked (403) |

**Verify:**

- Admin without `website.manage` cannot access any `/api/v1/website/pages` endpoints.
- Public `/api/v1/public/pages` endpoints are accessible without authentication.

---

## Appendix — Test File Locations

| Test Type                          | File Path                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| AnnouncementsService unit          | `apps/api/src/modules/communications/announcements.service.spec.ts`          |
| AudienceResolutionService unit     | `apps/api/src/modules/communications/audience-resolution.service.spec.ts`    |
| NotificationsService unit          | `apps/api/src/modules/communications/notifications.service.spec.ts`          |
| NotificationDispatchService unit   | `apps/api/src/modules/communications/notification-dispatch.service.spec.ts`  |
| NotificationTemplatesService unit  | `apps/api/src/modules/communications/notification-templates.service.spec.ts` |
| ParentInquiriesService unit        | `apps/api/src/modules/parent-inquiries/parent-inquiries.service.spec.ts`     |
| WebsitePagesService unit           | `apps/api/src/modules/website/website-pages.service.spec.ts`                 |
| ContactFormService unit            | `apps/api/src/modules/website/contact-form.service.spec.ts`                  |
| WebhookService unit                | `apps/api/src/modules/communications/webhook.service.spec.ts`                |
| Announcements integration          | `apps/api/test/p7/announcements.e2e-spec.ts`                                 |
| Notifications integration          | `apps/api/test/p7/notifications.e2e-spec.ts`                                 |
| Notification templates integration | `apps/api/test/p7/notification-templates.e2e-spec.ts`                        |
| Parent inquiries integration       | `apps/api/test/p7/parent-inquiries.e2e-spec.ts`                              |
| Website pages integration          | `apps/api/test/p7/website-pages.e2e-spec.ts`                                 |
| Public website integration         | `apps/api/test/p7/public-website.e2e-spec.ts`                                |
| Contact submissions integration    | `apps/api/test/p7/contact-submissions.e2e-spec.ts`                           |
| Webhooks integration               | `apps/api/test/p7/webhooks.e2e-spec.ts`                                      |
| RLS leakage (all tables)           | `apps/api/test/p7/rls-leakage.e2e-spec.ts`                                   |
