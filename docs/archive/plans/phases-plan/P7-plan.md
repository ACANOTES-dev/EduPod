# Phase 7 Implementation Plan — Communications, CMS, and Parent Inquiries

---

## Section 1 — Overview

Phase 7 builds the communications layer (announcements with audience targeting, approval-gated publish, scheduled publish, notification dispatch with retry and channel fallback), the public website CMS (page management, homepage enforcement, contact form with spam protection), and the parent inquiry messaging system (multi-turn threaded conversations with stale detection). After this phase, schools can send targeted communications via email/WhatsApp/in-app with automatic fallback, manage their public website content, and handle parent inquiries through a structured messaging system.

**Key dependencies on prior phases:**

- **Phase 1 (P1)**: RBAC system (`permissions`, `roles`, `role_permissions`, `tenant_memberships`), approval engine (`approval_requests`, `approval_workflows`, `ApprovalRequestsService.checkAndCreateIfNeeded()`), auth guards (`AuthGuard`, `PermissionGuard`), `@RequiresPermission` decorator, `@ModuleEnabled` guard, `AuditLogInterceptor`, tenant resolution middleware, RLS middleware (`createRlsClient`), Redis service, tenant settings (`TenantSetting` with `communications` and `general` sections)
- **Phase 2 (P2)**: Parent records (`parents` table with `preferred_contact_channels`, `whatsapp_phone`, `email`, `user_id`), households, students, `household_parents`, `student_parents`, year groups, classes, class enrolments — needed for audience resolution (scope → students → parents → users)
- **Worker infrastructure**: `TenantAwareJob` base class, `QUEUE_NAMES` constants, `WorkerModule` registration pattern, BullMQ processor pattern (see `attendance-pending-detection.processor.ts`)

**Prior-phase services/modules this phase imports or extends:**

| Module          | What we use                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approvals`     | `ApprovalRequestsService.checkAndCreateIfNeeded()` for announcement publish approval                                                                                                                          |
| `configuration` | `NotificationSettingsService` for checking if notification type is enabled and which channels; `SettingsService` for reading `communications.requireApprovalForAnnouncements` and `general.inquiryStaleHours` |
| `prisma`        | `PrismaService` for all DB operations                                                                                                                                                                         |
| `redis`         | `RedisService` for rate limiting, caching, in-app notification badge counts                                                                                                                                   |
| `parents`       | `ParentsService` for parent record lookups during audience resolution                                                                                                                                         |
| `students`      | Student/class/enrolment data for audience resolution                                                                                                                                                          |
| `households`    | Household data for household-scoped announcements                                                                                                                                                             |
| `auth`          | JWT payload for `author_user_id` extraction                                                                                                                                                                   |

---

## Section 2 — Database Changes

### 2.1 New Enums

#### `AnnouncementStatus`

```
draft, pending_approval, scheduled, published, archived
```

#### `AnnouncementScope`

```
school, year_group, class, household, custom
```

#### `NotificationChannel`

```
email, whatsapp, in_app
```

#### `NotificationStatus`

```
queued, sent, delivered, failed, read
```

#### `ParentInquiryStatus`

```
open, in_progress, closed
```

#### `InquiryAuthorType`

```
parent, admin
```

#### `WebsitePageType`

```
home, about, admissions, contact, custom
```

#### `WebsitePageStatus`

```
draft, published, unpublished
```

#### `ContactFormStatus`

```
new, reviewed, closed, spam
```

### 2.2 Table: `announcements`

| Column               | Type               | Constraints                                      |
| -------------------- | ------------------ | ------------------------------------------------ |
| id                   | UUID               | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id            | UUID               | FK → tenants, NOT NULL                           |
| title                | VARCHAR(255)       | NOT NULL                                         |
| body_html            | TEXT               | NOT NULL                                         |
| status               | AnnouncementStatus | NOT NULL, default `draft`                        |
| scope                | AnnouncementScope  | NOT NULL                                         |
| target_payload       | JSONB              | NOT NULL                                         |
| scheduled_publish_at | TIMESTAMPTZ        | NULL                                             |
| published_at         | TIMESTAMPTZ        | NULL                                             |
| author_user_id       | UUID               | FK → users, NOT NULL                             |
| approval_request_id  | UUID               | NULL, FK → approval_requests                     |
| created_at           | TIMESTAMPTZ        | NOT NULL, default `now()`                        |
| updated_at           | TIMESTAMPTZ        | NOT NULL, default `now()`, `@updatedAt`          |

**Indexes:**

- `idx_announcements_tenant_status` ON `announcements(tenant_id, status)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes — status changes and edits update the record.
**Foreign keys:** `tenant_id → tenants(id)`, `author_user_id → users(id)`, `approval_request_id → approval_requests(id)` (nullable).

### 2.3 Table: `notification_templates`

| Column           | Type                | Constraints                                         |
| ---------------- | ------------------- | --------------------------------------------------- |
| id               | UUID                | PK, `@default(dbgenerated("gen_random_uuid()"))`    |
| tenant_id        | UUID                | NULL (NULL = platform-level template), FK → tenants |
| channel          | NotificationChannel | NOT NULL                                            |
| template_key     | VARCHAR(100)        | NOT NULL                                            |
| locale           | VARCHAR(10)         | NOT NULL                                            |
| subject_template | TEXT                | NULL                                                |
| body_template    | TEXT                | NOT NULL                                            |
| is_system        | BOOLEAN             | NOT NULL, default `false`                           |
| created_at       | TIMESTAMPTZ         | NOT NULL, default `now()`                           |
| updated_at       | TIMESTAMPTZ         | NOT NULL, default `now()`, `@updatedAt`             |

**Indexes:**

- `idx_notification_templates_unique` UNIQUE ON `(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), template_key, channel, locale)`

**RLS:** Dual-policy pattern (tenant-scoped rows + platform-level rows where `tenant_id IS NULL`).
**`set_updated_at()` trigger:** Yes — templates are editable.

### 2.4 Table: `notifications`

| Column              | Type                | Constraints                                      |
| ------------------- | ------------------- | ------------------------------------------------ |
| id                  | UUID                | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id           | UUID                | FK → tenants, NOT NULL                           |
| recipient_user_id   | UUID                | FK → users, NOT NULL                             |
| channel             | NotificationChannel | NOT NULL                                         |
| template_key        | VARCHAR(100)        | NULL                                             |
| locale              | VARCHAR(10)         | NOT NULL                                         |
| status              | NotificationStatus  | NOT NULL, default `queued`                       |
| provider_message_id | VARCHAR(255)        | NULL                                             |
| payload_json        | JSONB               | NOT NULL                                         |
| source_entity_type  | VARCHAR(100)        | NULL                                             |
| source_entity_id    | UUID                | NULL                                             |
| failure_reason      | TEXT                | NULL                                             |
| attempt_count       | SMALLINT            | NOT NULL, default `0`                            |
| max_attempts        | SMALLINT            | NOT NULL, default `3`                            |
| next_retry_at       | TIMESTAMPTZ         | NULL                                             |
| created_at          | TIMESTAMPTZ         | NOT NULL, default `now()`                        |
| sent_at             | TIMESTAMPTZ         | NULL                                             |
| delivered_at        | TIMESTAMPTZ         | NULL                                             |
| read_at             | TIMESTAMPTZ         | NULL                                             |

**Indexes:**

- `idx_notifications_tenant_recipient` ON `notifications(tenant_id, recipient_user_id, status)`
- `idx_notifications_retry` ON `notifications(status, next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL`
- `idx_notifications_source` ON `notifications(tenant_id, source_entity_type, source_entity_id) WHERE source_entity_type IS NOT NULL`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** No — this is an append-heavy table with targeted column updates (`status`, `sent_at`, etc.). No `updated_at` column in spec.

**Note on partitioning:** The spec mentions monthly partitioning by `created_at`. For Phase 7, we will create the table as a regular table. Partitioning is an operational concern that can be added via a migration later without code changes (the Prisma schema and queries remain identical). The indexes are designed to support future partitioning.

### 2.5 Table: `parent_inquiries`

| Column     | Type                | Constraints                                      |
| ---------- | ------------------- | ------------------------------------------------ |
| id         | UUID                | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id  | UUID                | FK → tenants, NOT NULL                           |
| parent_id  | UUID                | FK → parents, NOT NULL                           |
| student_id | UUID                | NULL, FK → students                              |
| subject    | VARCHAR(255)        | NOT NULL                                         |
| status     | ParentInquiryStatus | NOT NULL, default `open`                         |
| created_at | TIMESTAMPTZ         | NOT NULL, default `now()`                        |
| updated_at | TIMESTAMPTZ         | NOT NULL, default `now()`, `@updatedAt`          |

**Indexes:**

- `idx_parent_inquiries_tenant_status` ON `parent_inquiries(tenant_id, status)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes — status changes.

### 2.6 Table: `parent_inquiry_messages`

| Column         | Type              | Constraints                                      |
| -------------- | ----------------- | ------------------------------------------------ |
| id             | UUID              | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id      | UUID              | FK → tenants, NOT NULL                           |
| inquiry_id     | UUID              | FK → parent_inquiries, NOT NULL                  |
| author_type    | InquiryAuthorType | NOT NULL                                         |
| author_user_id | UUID              | FK → users, NOT NULL                             |
| message        | TEXT              | NOT NULL                                         |
| created_at     | TIMESTAMPTZ       | NOT NULL, default `now()`                        |

**Indexes:**

- `idx_parent_inquiry_messages_inquiry` ON `parent_inquiry_messages(inquiry_id)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** No — append-only table, no `updated_at` column per spec (Section 3.0 conventions).

### 2.7 Table: `website_pages`

| Column           | Type              | Constraints                                      |
| ---------------- | ----------------- | ------------------------------------------------ |
| id               | UUID              | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id        | UUID              | FK → tenants, NOT NULL                           |
| locale           | VARCHAR(10)       | NOT NULL, default `'en'`                         |
| page_type        | WebsitePageType   | NOT NULL                                         |
| slug             | VARCHAR(150)      | NOT NULL                                         |
| title            | VARCHAR(255)      | NOT NULL                                         |
| meta_title       | VARCHAR(255)      | NULL                                             |
| meta_description | TEXT              | NULL                                             |
| body_html        | TEXT              | NOT NULL                                         |
| status           | WebsitePageStatus | NOT NULL, default `draft`                        |
| show_in_nav      | BOOLEAN           | NOT NULL, default `false`                        |
| nav_order        | INT               | NOT NULL, default `0`                            |
| author_user_id   | UUID              | FK → users, NOT NULL                             |
| published_at     | TIMESTAMPTZ       | NULL                                             |
| created_at       | TIMESTAMPTZ       | NOT NULL, default `now()`                        |
| updated_at       | TIMESTAMPTZ       | NOT NULL, default `now()`, `@updatedAt`          |

**Indexes:**

- `idx_website_pages_tenant_locale` ON `website_pages(tenant_id, locale, status)`
- `idx_website_pages_slug` UNIQUE ON `website_pages(tenant_id, slug, locale)`
- `idx_website_pages_homepage` UNIQUE ON `website_pages(tenant_id, locale) WHERE page_type = 'home' AND status = 'published'`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes — pages are editable.

### 2.8 Table: `contact_form_submissions`

| Column     | Type              | Constraints                                      |
| ---------- | ----------------- | ------------------------------------------------ |
| id         | UUID              | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| tenant_id  | UUID              | FK → tenants, NOT NULL                           |
| name       | VARCHAR(255)      | NOT NULL                                         |
| email      | CITEXT            | NOT NULL                                         |
| phone      | VARCHAR(50)       | NULL                                             |
| message    | TEXT              | NOT NULL                                         |
| source_ip  | INET              | NULL                                             |
| status     | ContactFormStatus | NOT NULL, default `new`                          |
| created_at | TIMESTAMPTZ       | NOT NULL, default `now()`                        |
| updated_at | TIMESTAMPTZ       | NOT NULL, default `now()`, `@updatedAt`          |

**Indexes:**

- `idx_contact_submissions_tenant` ON `contact_form_submissions(tenant_id, status)`

**RLS:** Standard tenant isolation policy.
**`set_updated_at()` trigger:** Yes — status changes.

### 2.9 Seed Data

**Notification templates** (platform-level, seeded in `seed.ts`):
Create platform-level notification templates for each notification type × channel × locale combination. Template keys:

- `announcement.published` — email + in_app, en + ar
- `inquiry.new_message` — email + in_app, en + ar
- `approval.requested` — email + in_app, en + ar
- `approval.decided` — email + in_app, en + ar

Templates use Handlebars-style variable substitution: `{{school_name}}`, `{{recipient_name}}`, `{{announcement_title}}`, `{{inquiry_subject}}`, etc.

**New permissions to seed** (add to `permissions.ts` and seed):

- `inquiries.view` (admin tier) — view and manage parent inquiries
- `inquiries.respond` (admin tier) — respond to parent inquiries

These are needed because the spec says "in-app notification to all users with `inquiries.view` permission" on parent message.

---

## Section 3 — API Endpoints

### 3.1 Announcements Module

#### `GET /api/v1/announcements`

- **Permission:** `communications.view`
- **Module guard:** `communications`
- **Query params:** `page`, `pageSize`, `status` (optional filter), `sort`, `order`
- **Response:** `{ data: Announcement[], meta: { page, pageSize, total } }`
- **Service method:** `AnnouncementsService.list()`

#### `GET /api/v1/announcements/:id`

- **Permission:** `communications.view`
- **Module guard:** `communications`
- **Response:** `{ data: Announcement }` (includes author user details)
- **Service method:** `AnnouncementsService.getById()`
- **Error:** `ANNOUNCEMENT_NOT_FOUND` (404)

#### `POST /api/v1/announcements`

- **Permission:** `communications.manage`
- **Module guard:** `communications`
- **Request schema:**
  ```typescript
  createAnnouncementSchema = z.object({
    title: z.string().min(1).max(255),
    body_html: z.string().min(1),
    scope: z.enum(['school', 'year_group', 'class', 'household', 'custom']),
    target_payload: z.record(z.unknown()), // validated by scope-specific refinement
    scheduled_publish_at: z.string().datetime().nullable().optional(),
  });
  ```
  With refinements:
  - `scope = 'year_group'` → `target_payload` must have `year_group_ids: string[]`
  - `scope = 'class'` → `target_payload` must have `class_ids: string[]`
  - `scope = 'household'` → `target_payload` must have `household_ids: string[]`
  - `scope = 'custom'` → `target_payload` must have `user_ids: string[]`
  - `scope = 'school'` → `target_payload` must be `{}`
- **Response:** `{ data: Announcement }` with status `draft`
- **Business logic:**
  1. Sanitise `body_html` with DOMPurify server-side
  2. Validate target IDs exist in tenant (year_groups, classes, households, or users)
  3. Create announcement with status `draft`
- **Service method:** `AnnouncementsService.create()`

#### `PATCH /api/v1/announcements/:id`

- **Permission:** `communications.manage`
- **Module guard:** `communications`
- **Request schema:**
  ```typescript
  updateAnnouncementSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    body_html: z.string().min(1).optional(),
    scope: z.enum(['school', 'year_group', 'class', 'household', 'custom']).optional(),
    target_payload: z.record(z.unknown()).optional(),
    scheduled_publish_at: z.string().datetime().nullable().optional(),
  });
  ```
- **Business logic:**
  1. Only `draft` announcements can be edited
  2. Sanitise `body_html` if provided
  3. Validate target IDs if scope/target_payload changed
- **Error:** `ANNOUNCEMENT_NOT_DRAFT` (400), `ANNOUNCEMENT_NOT_FOUND` (404)
- **Service method:** `AnnouncementsService.update()`

#### `POST /api/v1/announcements/:id/publish`

- **Permission:** `communications.send`
- **Module guard:** `communications`
- **Request schema:**
  ```typescript
  publishAnnouncementSchema = z.object({
    scheduled_publish_at: z.string().datetime().nullable().optional(),
  });
  ```
- **Business logic:**
  1. Announcement must be in `draft` status
  2. Check `tenant_settings.communications.requireApprovalForAnnouncements`
  3. If approval required: call `ApprovalRequestsService.checkAndCreateIfNeeded()` with `action_type = 'announcement_publish'`. If not auto-approved, set status to `pending_approval`, link `approval_request_id`, return `{ data: announcement, approval_required: true }`
  4. If no approval needed or auto-approved:
     - If `scheduled_publish_at` is set and in the future: set status to `scheduled`, enqueue BullMQ delayed job
     - If no schedule: set status to `published`, set `published_at = now()`, trigger audience resolution and notification dispatch (enqueue `communications:publish-announcement` job)
- **Error:** `ANNOUNCEMENT_NOT_DRAFT` (400), `ANNOUNCEMENT_NOT_FOUND` (404)
- **Service method:** `AnnouncementsService.publish()`

#### `POST /api/v1/announcements/:id/archive`

- **Permission:** `communications.manage`
- **Module guard:** `communications`
- **Business logic:** Set status to `archived`. Only `published` or `draft` can be archived.
- **Service method:** `AnnouncementsService.archive()`

#### `GET /api/v1/announcements/:id/delivery-status`

- **Permission:** `communications.view`
- **Module guard:** `communications`
- **Response:** Aggregated delivery stats: `{ total, queued, sent, delivered, failed, read }`
- **Service method:** `AnnouncementsService.getDeliveryStatus()`

### 3.2 Notifications Module

#### `GET /api/v1/notifications`

- **Permission:** Authenticated (any role). Returns only the current user's notifications.
- **Query params:** `page`, `pageSize`, `status` (optional), `unread_only` (boolean, optional)
- **Response:** `{ data: Notification[], meta: { page, pageSize, total } }`
- **Service method:** `NotificationsService.listForUser()`

#### `GET /api/v1/notifications/unread-count`

- **Permission:** Authenticated (any role).
- **Response:** `{ data: { count: number } }`
- **Business logic:** Count from Redis cache (30s TTL), fallback to DB.
- **Service method:** `NotificationsService.getUnreadCount()`

#### `PATCH /api/v1/notifications/:id/read`

- **Permission:** Authenticated (current user must be the recipient).
- **Business logic:** Set `status = 'read'`, `read_at = now()`. Decrement Redis unread count.
- **Service method:** `NotificationsService.markAsRead()`

#### `POST /api/v1/notifications/mark-all-read`

- **Permission:** Authenticated.
- **Business logic:** Update all unread notifications for current user to `read`. Reset Redis unread count to 0.
- **Service method:** `NotificationsService.markAllAsRead()`

#### `GET /api/v1/notifications/admin/failed`

- **Permission:** `communications.view`
- **Module guard:** `communications`
- **Query params:** `page`, `pageSize`
- **Response:** Failed notifications with recipient and source details.
- **Service method:** `NotificationsService.listFailed()`

### 3.3 Notification Templates Module

#### `GET /api/v1/notification-templates`

- **Permission:** `communications.manage`
- **Module guard:** `communications`
- **Query params:** `template_key` (optional), `channel` (optional), `locale` (optional)
- **Response:** `{ data: NotificationTemplate[] }`
- **Service method:** `NotificationTemplatesService.list()`

#### `GET /api/v1/notification-templates/:id`

- **Permission:** `communications.manage`
- **Response:** `{ data: NotificationTemplate }`
- **Service method:** `NotificationTemplatesService.getById()`

#### `POST /api/v1/notification-templates`

- **Permission:** `communications.manage`
- **Request schema:**
  ```typescript
  createNotificationTemplateSchema = z.object({
    channel: z.enum(['email', 'whatsapp', 'in_app']),
    template_key: z.string().min(1).max(100),
    locale: z.string().min(1).max(10),
    subject_template: z.string().nullable().optional(),
    body_template: z.string().min(1),
  });
  ```
- **Business logic:** Creates tenant-level template (sets `tenant_id` from context). Unique constraint prevents duplicates.
- **Service method:** `NotificationTemplatesService.create()`

#### `PATCH /api/v1/notification-templates/:id`

- **Permission:** `communications.manage`
- **Request schema:**
  ```typescript
  updateNotificationTemplateSchema = z.object({
    subject_template: z.string().nullable().optional(),
    body_template: z.string().min(1).optional(),
  });
  ```
- **Business logic:** Only tenant-level templates can be edited (not system templates).
- **Error:** `SYSTEM_TEMPLATE_READONLY` (403)
- **Service method:** `NotificationTemplatesService.update()`

### 3.4 Parent Inquiries Module

#### `GET /api/v1/inquiries` (Admin)

- **Permission:** `inquiries.view`
- **Module guard:** `parent_inquiries`
- **Query params:** `page`, `pageSize`, `status` (optional)
- **Response:** `{ data: ParentInquiry[], meta: { page, pageSize, total } }` — includes parent name, student name, message count, latest message timestamp
- **Service method:** `ParentInquiriesService.listForAdmin()`

#### `GET /api/v1/inquiries/my` (Parent)

- **Permission:** `parent.submit_inquiry`
- **Module guard:** `parent_inquiries`
- **Response:** `{ data: ParentInquiry[], meta: { page, pageSize, total } }` — only inquiries for the current parent
- **Service method:** `ParentInquiriesService.listForParent()`

#### `GET /api/v1/inquiries/:id` (Admin)

- **Permission:** `inquiries.view`
- **Module guard:** `parent_inquiries`
- **Response:** `{ data: ParentInquiry }` with all messages. Admin sees actual author names on admin messages.
- **Service method:** `ParentInquiriesService.getByIdForAdmin()`

#### `GET /api/v1/inquiries/:id/parent` (Parent)

- **Permission:** `parent.submit_inquiry`
- **Module guard:** `parent_inquiries`
- **Response:** `{ data: ParentInquiry }` with all messages. Admin author details replaced with "School Administration".
- **Service method:** `ParentInquiriesService.getByIdForParent()`
- **Error:** Parent can only view own inquiries. `INQUIRY_NOT_FOUND` (404) if not theirs.

#### `POST /api/v1/inquiries` (Parent)

- **Permission:** `parent.submit_inquiry`
- **Module guard:** `parent_inquiries`
- **Request schema:**
  ```typescript
  createInquirySchema = z.object({
    subject: z.string().min(1).max(255),
    message: z.string().min(1),
    student_id: z.string().uuid().nullable().optional(),
  });
  ```
- **Business logic:**
  1. Resolve parent record from current user's `user_id` → `parents.user_id`
  2. If `student_id` provided, verify it belongs to this parent (via `student_parents`)
  3. Create `parent_inquiry` with status `open`
  4. Create first `parent_inquiry_message` with `author_type = 'parent'`
  5. Enqueue notification job: notify all users with `inquiries.view` permission (in-app)
- **Service method:** `ParentInquiriesService.create()`

#### `POST /api/v1/inquiries/:id/messages` (Admin)

- **Permission:** `inquiries.respond`
- **Module guard:** `parent_inquiries`
- **Request schema:**
  ```typescript
  createInquiryMessageSchema = z.object({
    message: z.string().min(1),
  });
  ```
- **Business logic:**
  1. Inquiry must not be `closed`
  2. Create message with `author_type = 'admin'`
  3. If inquiry status is `open`, auto-transition to `in_progress`
  4. Enqueue notification to parent per their communication preferences
- **Error:** `INQUIRY_CLOSED` (400), `INQUIRY_NOT_FOUND` (404)
- **Service method:** `ParentInquiriesService.addAdminMessage()`

#### `POST /api/v1/inquiries/:id/messages/parent` (Parent)

- **Permission:** `parent.submit_inquiry`
- **Module guard:** `parent_inquiries`
- **Request schema:** Same as admin message schema
- **Business logic:**
  1. Inquiry must not be `closed`
  2. Parent must own this inquiry
  3. Create message with `author_type = 'parent'`
  4. Enqueue notification to all users with `inquiries.view` permission (in-app)
- **Service method:** `ParentInquiriesService.addParentMessage()`

#### `POST /api/v1/inquiries/:id/close` (Admin)

- **Permission:** `inquiries.respond`
- **Module guard:** `parent_inquiries`
- **Business logic:** Set status to `closed`. Only `open` or `in_progress` can be closed.
- **Service method:** `ParentInquiriesService.close()`

### 3.5 Website CMS Module

#### `GET /api/v1/website/pages`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Query params:** `page`, `pageSize`, `status` (optional), `locale` (optional, default `en`), `page_type` (optional)
- **Response:** `{ data: WebsitePage[], meta: { page, pageSize, total } }`
- **Service method:** `WebsitePagesService.list()`

#### `GET /api/v1/website/pages/:id`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Response:** `{ data: WebsitePage }`
- **Service method:** `WebsitePagesService.getById()`

#### `POST /api/v1/website/pages`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Request schema:**
  ```typescript
  createWebsitePageSchema = z.object({
    locale: z.string().max(10).default('en'),
    page_type: z.enum(['home', 'about', 'admissions', 'contact', 'custom']),
    slug: z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(255),
    meta_title: z.string().max(255).nullable().optional(),
    meta_description: z.string().nullable().optional(),
    body_html: z.string().min(1),
    show_in_nav: z.boolean().default(false),
    nav_order: z.number().int().default(0),
  });
  ```
- **Business logic:**
  1. Sanitise `body_html` with DOMPurify
  2. Create page with status `draft`
  3. Unique constraint on `(tenant_id, slug, locale)` prevents duplicates
- **Service method:** `WebsitePagesService.create()`

#### `PATCH /api/v1/website/pages/:id`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Request schema:**
  ```typescript
  updateWebsitePageSchema = z.object({
    title: z.string().min(1).max(255).optional(),
    slug: z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional(),
    meta_title: z.string().max(255).nullable().optional(),
    meta_description: z.string().nullable().optional(),
    body_html: z.string().min(1).optional(),
    show_in_nav: z.boolean().optional(),
    nav_order: z.number().int().optional(),
  });
  ```
- **Business logic:** Sanitise `body_html` if provided. Cannot change `page_type` or `locale` after creation.
- **Service method:** `WebsitePagesService.update()`

#### `POST /api/v1/website/pages/:id/publish`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Business logic:**
  1. If `page_type = 'home'`: find current published homepage for same tenant+locale, set to `unpublished`
  2. Set page status to `published`, `published_at = now()`
- **Error:** `PAGE_NOT_FOUND` (404)
- **Service method:** `WebsitePagesService.publish()`

#### `POST /api/v1/website/pages/:id/unpublish`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Business logic:** Set status to `unpublished`.
- **Service method:** `WebsitePagesService.unpublish()`

#### `DELETE /api/v1/website/pages/:id`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Business logic:** Only `draft` or `unpublished` pages can be deleted. Published pages must be unpublished first.
- **Service method:** `WebsitePagesService.delete()`

#### `GET /api/v1/website/pages/:id/preview`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Response:** Full page HTML content for preview rendering.
- **Service method:** `WebsitePagesService.getById()` (same as detail endpoint — frontend renders preview)

#### `GET /api/v1/website/navigation`

- **Permission:** `website.manage`
- **Module guard:** `website`
- **Response:** `{ data: WebsitePage[] }` — published pages with `show_in_nav = true`, ordered by `nav_order`
- **Service method:** `WebsitePagesService.getNavigation()`

### 3.6 Public Website Endpoints (No auth required, tenant resolved from domain)

#### `GET /api/v1/public/pages`

- **Permission:** None (public)
- **Response:** Published pages for tenant, with `show_in_nav` pages for navigation
- **Service method:** `PublicWebsiteService.getPublishedPages()`

#### `GET /api/v1/public/pages/:slug`

- **Permission:** None (public)
- **Response:** Single published page by slug (for the current tenant + locale)
- **Error:** `PAGE_NOT_FOUND` (404) if not published
- **Service method:** `PublicWebsiteService.getPageBySlug()`

#### `POST /api/v1/public/contact`

- **Permission:** None (public, but rate-limited)
- **Request schema:**
  ```typescript
  contactFormSchema = z.object({
    name: z.string().min(1).max(255),
    email: z.string().email(),
    phone: z.string().max(50).nullable().optional(),
    message: z.string().min(1).max(5000),
    _honeypot: z.string().max(0).optional(), // honeypot field — must be empty
  });
  ```
- **Business logic:**
  1. Rate limit: 5 submissions per IP per hour (Redis counter with TTL)
  2. If `_honeypot` is non-empty: store submission with `status = 'spam'` (not rejected — stored for analysis)
  3. Store submission with `status = 'new'`, capture `source_ip` from request
  4. Enqueue notification to users with `communications.view` permission (optional: low-priority)
- **Error:** `RATE_LIMIT_EXCEEDED` (429)
- **Service method:** `ContactFormService.submit()`

### 3.7 Contact Form Admin Endpoints

#### `GET /api/v1/contact-submissions`

- **Permission:** `communications.view`
- **Module guard:** `website`
- **Query params:** `page`, `pageSize`, `status` (optional, default excludes `spam`)
- **Response:** `{ data: ContactFormSubmission[], meta: { page, pageSize, total } }`
- **Service method:** `ContactFormService.list()`

#### `PATCH /api/v1/contact-submissions/:id/status`

- **Permission:** `communications.manage`
- **Module guard:** `website`
- **Request schema:**
  ```typescript
  updateContactStatusSchema = z.object({
    status: z.enum(['reviewed', 'closed', 'spam']),
  });
  ```
- **Business logic:**
  Valid transitions: `new → reviewed`, `new → closed`, `new → spam`, `reviewed → closed`, `reviewed → spam`. No transitions out of `closed` or `spam`.
- **Error:** `INVALID_STATUS_TRANSITION` (400)
- **Service method:** `ContactFormService.updateStatus()`

### 3.8 Webhook Endpoints (Provider callbacks)

#### `POST /api/v1/webhooks/resend`

- **Permission:** None (verified by Resend webhook signature)
- **Business logic:** Parse Resend webhook event (delivery, bounce, complaint, open). Look up notification by `provider_message_id`. Update notification `status` accordingly. On bounce: flag parent email for admin review.
- **Service method:** `WebhookService.handleResendEvent()`

#### `POST /api/v1/webhooks/twilio`

- **Permission:** None (verified by Twilio request signature)
- **Business logic:** Parse Twilio status callback. Look up notification by `provider_message_id`. Update notification `status`. On failure: trigger email fallback.
- **Service method:** `WebhookService.handleTwilioEvent()`

### 3.9 Parent Announcements Endpoint

#### `GET /api/v1/announcements/my`

- **Permission:** `parent.view_announcements`
- **Query params:** `page`, `pageSize`
- **Response:** Published announcements that targeted the current parent (resolved via notifications with `source_entity_type = 'announcement'`)
- **Service method:** `AnnouncementsService.listForParent()`

---

## Section 4 — Service Layer

### 4.1 `AnnouncementsService`

**Class:** `AnnouncementsService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/announcements.service.ts`
**Dependencies:** `PrismaService`, `ApprovalRequestsService`, `SettingsService` (from configuration), `AudienceResolutionService`, `Queue` (BullMQ injection for notifications queue)

**Public methods:**

- `list(tenantId: string, filters: ListAnnouncementsFilters): Promise<PaginatedResult<Announcement>>`
  - Query with pagination, optional status filter
  - Include author user name

- `getById(tenantId: string, id: string): Promise<Announcement>`
  - Fetch with author, approval_request includes
  - Throw `ANNOUNCEMENT_NOT_FOUND` if missing

- `create(tenantId: string, userId: string, dto: CreateAnnouncementDto): Promise<Announcement>`
  - Sanitise `body_html` via DOMPurify
  - Validate target IDs exist (scope-dependent)
  - Create with status `draft`

- `update(tenantId: string, id: string, dto: UpdateAnnouncementDto): Promise<Announcement>`
  - Verify status is `draft`
  - Sanitise body if provided
  - Validate target IDs if scope changed

- `publish(tenantId: string, userId: string, id: string, dto: PublishAnnouncementDto): Promise<{ data: Announcement; approval_required: boolean }>`
  1. Verify status is `draft`
  2. Read `tenant_settings.communications.requireApprovalForAnnouncements`
  3. If approval required → `ApprovalRequestsService.checkAndCreateIfNeeded(tenantId, 'announcement_publish', 'announcement', id, userId, false)`
  4. If `{ approved: false }` → update status to `pending_approval`, set `approval_request_id`, return `{ approval_required: true }`
  5. If approved and `scheduled_publish_at` in future → update status to `scheduled`, enqueue delayed job `communications:publish-announcement` with delay
  6. If approved and no schedule → call `executePublish(tenantId, id)`

- `executePublish(tenantId: string, id: string): Promise<void>` (also called by worker)
  1. Update status to `published`, set `published_at`
  2. Call `AudienceResolutionService.resolve(tenantId, scope, target_payload)` → list of `{ user_id, parent_id?, channels, locale }`
  3. Create notification records in batches of 100
  4. Enqueue `communications:dispatch-notifications` job for each batch

- `archive(tenantId: string, id: string): Promise<Announcement>`

- `getDeliveryStatus(tenantId: string, id: string): Promise<DeliveryStatusSummary>`
  - Aggregate `notifications` where `source_entity_type = 'announcement'` AND `source_entity_id = id`
  - Group by status, return counts

- `listForParent(tenantId: string, userId: string, filters): Promise<PaginatedResult<Announcement>>`
  - Find notifications for user with `source_entity_type = 'announcement'`
  - Join back to announcements for display

### 4.2 `AudienceResolutionService`

**Class:** `AudienceResolutionService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/audience-resolution.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

- `resolve(tenantId: string, scope: AnnouncementScope, targetPayload: Record<string, unknown>): Promise<AudienceTarget[]>`

  Returns a list of `{ user_id: string, locale: string, channels: string[] }`. Logic by scope:
  1. **school**: Find all parents with `user_id IS NOT NULL` in tenant → resolve their preferred channels and locale
  2. **year_group**: Find students in given year groups → find their parents via `student_parents` → resolve
  3. **class**: Find students enrolled (active) in given classes → find their parents → resolve
  4. **household**: Find parents in given households via `household_parents` → resolve
  5. **custom**: Directly use the `user_ids` from target_payload. Look up user preferred locale.

  De-duplication: A parent linked to multiple students in the same class gets ONE notification, not one per student.

  Channel resolution per parent:
  - Check `TenantNotificationSetting` for `announcement.published` — is it enabled? Which channels?
  - Intersect with parent's `preferred_contact_channels`
  - Always add `in_app` if user has an account (`user_id IS NOT NULL`)

### 4.3 `NotificationsService`

**Class:** `NotificationsService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/notifications.service.ts`
**Dependencies:** `PrismaService`, `RedisService`

**Public methods:**

- `listForUser(tenantId: string, userId: string, filters): Promise<PaginatedResult<Notification>>`
  - Paginated, ordered by `created_at desc`
  - Optionally filter by `unread_only`

- `getUnreadCount(tenantId: string, userId: string): Promise<number>`
  - Check Redis key `tenant:{tenantId}:user:{userId}:unread_notifications`
  - If miss, count from DB, cache with 30s TTL

- `markAsRead(tenantId: string, userId: string, notificationId: string): Promise<void>`
  - Verify notification belongs to user
  - Update status to `read`, set `read_at`
  - Decrement Redis unread count

- `markAllAsRead(tenantId: string, userId: string): Promise<void>`
  - Bulk update all `queued`/`sent`/`delivered` notifications to `read`
  - Reset Redis unread count to 0

- `listFailed(tenantId: string, filters): Promise<PaginatedResult<Notification>>`
  - Admin view of failed notifications with recipient details

- `createBatch(tenantId: string, notifications: CreateNotificationDto[]): Promise<void>`
  - Bulk insert notification records
  - Increment Redis unread counts for each recipient

### 4.4 `NotificationDispatchService`

**Class:** `NotificationDispatchService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/notification-dispatch.service.ts`
**Dependencies:** `PrismaService`, `NotificationTemplatesService`, `RedisService`

This service contains the dispatch logic called by the worker. It is NOT a controller-facing service.

**Public methods:**

- `dispatch(notification: Notification): Promise<void>`
  1. Resolve template: find template by `template_key`, `channel`, `locale` (tenant-level first, then platform-level)
  2. Render template with `payload_json` variables
  3. Dispatch based on channel:
     - `email`: Call Resend API → store `provider_message_id`, update status to `sent`
     - `whatsapp`: Validate phone, check template exists for locale → call Twilio API → store `provider_message_id`, update status to `sent`
     - `in_app`: Status immediately `delivered` (no external dispatch — it's stored in DB and read via the notifications API)
  4. On failure: increment `attempt_count`, calculate `next_retry_at` with exponential backoff (base 60s × 2^attempt), update `failure_reason`
  5. If `attempt_count >= max_attempts`: dead-letter (status stays `failed`, no more retries)

- `dispatchWithFallback(notification: Notification): Promise<void>`
  The WhatsApp-to-email fallback chain:
  1. If channel is `whatsapp`:
     a. Check template exists for locale → if not, skip WhatsApp, go to email
     b. Check `whatsapp_phone` is valid → if not, skip WhatsApp, go to email
     c. Attempt WhatsApp send
     d. If send fails → create new email notification record as fallback
  2. If channel is `email`:
     a. Attempt email send
     b. If send fails → create in_app notification if user account exists
     c. Mark original as `failed`, surface to admin
  3. If channel is `in_app`:
     a. Mark as `delivered` immediately

### 4.5 `NotificationTemplatesService`

**Class:** `NotificationTemplatesService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/notification-templates.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

- `list(tenantId: string, filters): Promise<NotificationTemplate[]>`
  - Returns both tenant-level and platform-level templates visible to this tenant

- `getById(tenantId: string, id: string): Promise<NotificationTemplate>`

- `create(tenantId: string, dto: CreateNotificationTemplateDto): Promise<NotificationTemplate>`
  - Creates with `tenant_id` set (tenant-level template)

- `update(tenantId: string, id: string, dto: UpdateNotificationTemplateDto): Promise<NotificationTemplate>`
  - Blocks editing system templates (`is_system = true`)

- `resolveTemplate(tenantId: string, templateKey: string, channel: NotificationChannel, locale: string): Promise<NotificationTemplate | null>`
  - Tenant-level template first, then platform-level fallback
  - Returns null if no template found

### 4.6 `ParentInquiriesService`

**Class:** `ParentInquiriesService`
**Module:** `ParentInquiriesModule`
**File:** `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts`
**Dependencies:** `PrismaService`, `Queue` (BullMQ injection for notifications queue)

**Public methods:**

- `listForAdmin(tenantId: string, filters): Promise<PaginatedResult<ParentInquiry>>`
  - Include parent name, student name if linked, message count, latest message timestamp
  - Paginated with optional status filter

- `listForParent(tenantId: string, userId: string, filters): Promise<PaginatedResult<ParentInquiry>>`
  - Resolve parent from `userId` via `parents.user_id`
  - Only return inquiries where `parent_id` matches

- `getByIdForAdmin(tenantId: string, id: string): Promise<ParentInquiry>`
  - Include all messages with actual author names

- `getByIdForParent(tenantId: string, userId: string, id: string): Promise<ParentInquiry>`
  - Verify parent owns this inquiry
  - Include all messages, but replace admin author details with "School Administration"

- `create(tenantId: string, userId: string, dto: CreateInquiryDto): Promise<ParentInquiry>`
  1. Resolve parent record from `userId`
  2. If `student_id`, verify parent is linked via `student_parents`
  3. Create inquiry with status `open`
  4. Create first message with `author_type = 'parent'`
  5. Enqueue `communications:inquiry-notification` job to notify admins with `inquiries.view` permission

- `addAdminMessage(tenantId: string, userId: string, inquiryId: string, dto: CreateInquiryMessageDto): Promise<ParentInquiryMessage>`
  1. Verify inquiry exists and is not `closed`
  2. Create message with `author_type = 'admin'`
  3. If status is `open`, update to `in_progress`
  4. Enqueue notification to parent per their communication preferences

- `addParentMessage(tenantId: string, userId: string, inquiryId: string, dto: CreateInquiryMessageDto): Promise<ParentInquiryMessage>`
  1. Verify parent owns inquiry
  2. Verify inquiry is not `closed`
  3. Create message with `author_type = 'parent'`
  4. Enqueue notification to admins with `inquiries.view` permission

- `close(tenantId: string, inquiryId: string): Promise<ParentInquiry>`
  - Only `open` or `in_progress` can transition to `closed`

### 4.7 `WebsitePagesService`

**Class:** `WebsitePagesService`
**Module:** `WebsiteModule`
**File:** `apps/api/src/modules/website/website-pages.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

- `list(tenantId: string, filters): Promise<PaginatedResult<WebsitePage>>`
- `getById(tenantId: string, id: string): Promise<WebsitePage>`
- `create(tenantId: string, userId: string, dto: CreateWebsitePageDto): Promise<WebsitePage>`
  - Sanitise `body_html` with DOMPurify
  - Create with status `draft`
- `update(tenantId: string, id: string, dto: UpdateWebsitePageDto): Promise<WebsitePage>`
  - Sanitise body if provided
- `publish(tenantId: string, id: string): Promise<WebsitePage>`
  - Homepage enforcement: if `page_type = 'home'`, find existing published homepage for same tenant+locale, set to `unpublished`
  - Set status `published`, `published_at = now()`
  - Uses interactive transaction for atomicity
- `unpublish(tenantId: string, id: string): Promise<WebsitePage>`
- `delete(tenantId: string, id: string): Promise<void>`
  - Only `draft` or `unpublished` pages
- `getNavigation(tenantId: string, locale: string): Promise<WebsitePage[]>`
  - Published pages with `show_in_nav = true`, ordered by `nav_order`

### 4.8 `PublicWebsiteService`

**Class:** `PublicWebsiteService`
**Module:** `WebsiteModule`
**File:** `apps/api/src/modules/website/public-website.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

- `getPublishedPages(tenantId: string, locale: string): Promise<WebsitePage[]>`
  - Published pages with navigation info
- `getPageBySlug(tenantId: string, slug: string, locale: string): Promise<WebsitePage>`
  - Published page by slug for current tenant+locale

### 4.9 `ContactFormService`

**Class:** `ContactFormService`
**Module:** `WebsiteModule`
**File:** `apps/api/src/modules/website/contact-form.service.ts`
**Dependencies:** `PrismaService`, `RedisService`

**Public methods:**

- `submit(tenantId: string, dto: ContactFormDto, sourceIp: string | null): Promise<ContactFormSubmission>`
  1. Rate limit check: Redis key `rate:contact:{tenantId}:{ip}` with TTL 3600, increment. If > 5, throw `RATE_LIMIT_EXCEEDED`
  2. If honeypot field non-empty: create with `status = 'spam'`
  3. Else: create with `status = 'new'`
- `list(tenantId: string, filters): Promise<PaginatedResult<ContactFormSubmission>>`
  - Default filter excludes `spam` unless explicitly requested
- `updateStatus(tenantId: string, id: string, newStatus: ContactFormStatus): Promise<ContactFormSubmission>`
  - Validate transition: `new → reviewed|closed|spam`, `reviewed → closed|spam`. Block transitions from `closed` or `spam`.

### 4.10 `WebhookService`

**Class:** `WebhookService`
**Module:** `CommunicationsModule`
**File:** `apps/api/src/modules/communications/webhook.service.ts`
**Dependencies:** `PrismaService`

**Public methods:**

- `handleResendEvent(event: ResendWebhookEvent): Promise<void>`
  1. Parse event type (delivery, bounce, complaint, open)
  2. Find notification by `provider_message_id`
  3. Update status: delivery → `delivered`, bounce → `failed` (set failure_reason), complaint → `failed`
  4. On bounce: find the parent record associated with the recipient → flag email for admin review (set a field or create an audit log entry)

- `handleTwilioEvent(event: TwilioStatusCallback): Promise<void>`
  1. Parse status (delivered, failed, undelivered)
  2. Find notification by `provider_message_id`
  3. Update status accordingly
  4. On failure: trigger email fallback by creating a new notification record with channel `email`

---

## Section 5 — Frontend Pages and Components

### 5.1 Announcements List Page

**File:** `apps/web/src/app/[locale]/(school)/communications/page.tsx`
**Route:** `/communications`
**Type:** Client component
**Data:** `GET /api/v1/announcements`
**Roles:** Admin/staff with `communications.view`
**Key UI:**

- Page header with "Communications" title and "New Announcement" primary action button
- Data table with columns: Title, Scope, Status (badge), Published At, Author
- Status filter tabs: All, Draft, Scheduled, Published, Archived
- Row click navigates to detail

### 5.2 Announcement Detail / Editor Page

**File:** `apps/web/src/app/[locale]/(school)/communications/[id]/page.tsx`
**Route:** `/communications/:id`
**Type:** Client component
**Data:** `GET /api/v1/announcements/:id`
**Key UI:**

- Record hub pattern: header with title, status badge, author
- **Draft mode:** Editable form with TipTap rich text editor (BiDi support), scope selector, target picker (multi-select for year groups/classes/households/users depending on scope), schedule date picker
- **Published mode:** Read-only display with delivery status panel showing notification counts by status (queued/sent/delivered/failed/read)
- Actions: Save Draft, Publish (or Submit for Approval), Archive
- Approval status banner when `pending_approval`

### 5.3 New Announcement Page

**File:** `apps/web/src/app/[locale]/(school)/communications/new/page.tsx`
**Route:** `/communications/new`
**Type:** Client component
**Key UI:**

- Title input
- TipTap rich text editor with BiDi support
- Scope selector (radio/select): School-wide, Year Group, Class, Household, Custom
- Target picker (dynamic based on scope): multi-select dropdown populated from API
- Schedule toggle with date/time picker
- "Save as Draft" and "Publish" buttons

### 5.4 Parent Inquiries Admin Page

**File:** `apps/web/src/app/[locale]/(school)/communications/inquiries/page.tsx`
**Route:** `/communications/inquiries`
**Type:** Client component
**Data:** `GET /api/v1/inquiries`
**Roles:** Admin with `inquiries.view`
**Key UI:**

- Data table: Subject, Parent Name, Student (if linked), Status (badge), Last Message, Messages Count
- Status filter tabs: All, Open, In Progress, Closed
- Stale indicator (amber dot) on inquiries exceeding `inquiryStaleHours`
- Row click opens inquiry thread

### 5.5 Inquiry Thread Page (Admin)

**File:** `apps/web/src/app/[locale]/(school)/communications/inquiries/[id]/page.tsx`
**Route:** `/communications/inquiries/:id`
**Type:** Client component
**Data:** `GET /api/v1/inquiries/:id`
**Key UI:**

- Header: subject, parent name, student name (if linked), status badge
- Message thread: chat-style layout with messages from parent (start-aligned) and admin (end-aligned)
- Each admin message shows actual author name
- Reply textarea at bottom (disabled if closed)
- Close inquiry button

### 5.6 Parent Inquiry Page (Parent Portal)

**File:** `apps/web/src/app/[locale]/(school)/inquiries/page.tsx`
**Route:** `/inquiries`
**Type:** Client component
**Data:** `GET /api/v1/inquiries/my`
**Roles:** Parent
**Key UI:**

- List of parent's inquiries with subject, status, last message preview
- "New Inquiry" button
- Row click opens thread

### 5.7 Parent Inquiry Thread (Parent Portal)

**File:** `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx`
**Route:** `/inquiries/:id`
**Type:** Client component
**Data:** `GET /api/v1/inquiries/:id/parent`
**Key UI:**

- Same chat layout as admin, but admin author shows "School Administration"
- Reply textarea (disabled if closed)

### 5.8 New Inquiry Page (Parent Portal)

**File:** `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx`
**Route:** `/inquiries/new`
**Type:** Client component
**Key UI:**

- Subject input
- Optional student selector (dropdown of parent's linked students)
- Message textarea
- Submit button

### 5.9 Website Pages Admin

**File:** `apps/web/src/app/[locale]/(school)/website/page.tsx`
**Route:** `/website`
**Type:** Client component
**Data:** `GET /api/v1/website/pages`
**Roles:** Admin with `website.manage`
**Key UI:**

- Data table: Title, Slug, Type (badge), Status (badge), In Nav, Nav Order, Published At
- Filter by status and page type
- "New Page" primary action
- Row click opens page editor

### 5.10 Website Page Editor

**File:** `apps/web/src/app/[locale]/(school)/website/[id]/page.tsx`
**Route:** `/website/:id`
**Type:** Client component
**Data:** `GET /api/v1/website/pages/:id`
**Key UI:**

- Form: title, slug (auto-generated from title, editable), page type (read-only after creation), meta title, meta description
- TipTap rich text editor for body content
- Navigation settings: show in nav toggle, nav order input
- Actions: Save, Publish, Unpublish, Delete (conditional)
- Preview button: opens page preview in a modal or new tab

### 5.11 New Website Page

**File:** `apps/web/src/app/[locale]/(school)/website/new/page.tsx`
**Route:** `/website/new`
**Type:** Client component
**Key UI:**

- Page type selector
- Title, slug, meta fields
- TipTap editor
- Save as Draft button

### 5.12 Contact Form Submissions Admin

**File:** `apps/web/src/app/[locale]/(school)/website/contact-submissions/page.tsx`
**Route:** `/website/contact-submissions`
**Type:** Client component
**Data:** `GET /api/v1/contact-submissions`
**Roles:** Admin with `communications.view`
**Key UI:**

- Data table: Name, Email, Phone, Status (badge), Submitted At
- Status filter tabs: New, Reviewed, Closed (Spam hidden by default, toggleable)
- Click to expand or modal with full message
- Status transition buttons: Mark Reviewed, Close, Mark Spam

### 5.13 Notification Panel Component

**File:** `apps/web/src/components/notifications/notification-panel.tsx`
**Type:** Client component
**Data:** `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`
**Key UI:**

- Bell icon in top bar with unread count badge
- Slide-down panel (320px wide, max-height 480px, scrollable)
- Header: "Notifications" + "Mark all read" action
- Grouped by: Today / Yesterday / Earlier
- Each notification: icon (type-specific), action line (bold), context line (tertiary), relative timestamp, unread dot
- Click → navigate to source entity and mark as read
- Follows the exact pattern described in `ui-design-brief.md` Section 3.2b

### 5.14 TipTap Rich Text Editor Component

**File:** `packages/ui/src/components/tiptap-editor.tsx`
**Type:** Client component (shared across CMS and announcements)
**Key features:**

- BiDi support: `dir` attribute preserved per block
- Toolbar: bold, italic, heading (H2, H3), bullet list, ordered list, link, image (URL only — no upload), blockquote, code block, horizontal rule, undo/redo
- RTL/LTR direction toggle per block
- DOMPurify sanitisation on output (also done server-side, but client-side for preview)
- Emits `body_html` string on change

### 5.15 Public Website Pages (Next.js dynamic routes)

**File:** `apps/web/src/app/[locale]/(public)/[slug]/page.tsx`
**Route:** `/:slug` (under public shell)
**Type:** Server component
**Data:** `GET /api/v1/public/pages/:slug`
**Key UI:**

- Renders page HTML content
- Navigation from `GET /api/v1/public/pages`
- Contact page renders the contact form component

### 5.16 Public Contact Form Component

**File:** `apps/web/src/app/[locale]/(public)/contact/page.tsx`
**Route:** `/contact` (under public shell)
**Type:** Client component
**Data:** `POST /api/v1/public/contact`
**Key UI:**

- Name, email, phone (optional), message fields
- Hidden honeypot field
- Submit button with loading state
- Success/error feedback
- Rate limit error message

### 5.17 Parent Announcements Page

**File:** `apps/web/src/app/[locale]/(school)/announcements/page.tsx`
**Route:** `/announcements`
**Type:** Client component
**Data:** `GET /api/v1/announcements/my`
**Roles:** Parent
**Key UI:**

- List of announcements targeted at the parent
- Each card: title, date, preview snippet
- Click to view full announcement body

---

## Section 6 — Background Jobs

### 6.1 `communications:publish-announcement`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/publish-announcement.processor.ts`
**Trigger:** Enqueued by `AnnouncementsService.publish()` when scheduled or immediate
**Payload:**

```typescript
interface PublishAnnouncementPayload extends TenantJobPayload {
  announcement_id: string;
}
```

**Processing logic:**

1. Load announcement, verify status is `scheduled` (or `published` for immediate re-dispatch)
2. Call `AudienceResolutionService.resolve()` (audience resolution logic duplicated in worker or extracted to shared)
3. Create notification records in batches of 100
4. For each batch, enqueue `communications:dispatch-notifications`
5. Update announcement status to `published`, set `published_at`

**Retry:** 3 attempts, exponential backoff. On failure, announcement stays in current status — admin can retry.
**DLQ:** Yes, standard.

### 6.2 `communications:dispatch-notifications`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
**Trigger:** Enqueued by publish-announcement processor or directly by services
**Payload:**

```typescript
interface DispatchNotificationsPayload extends TenantJobPayload {
  notification_ids: string[];
}
```

**Processing logic:**

1. Load notifications by IDs
2. For each notification: call `NotificationDispatchService.dispatchWithFallback()`
3. Failed individual dispatches don't fail the job — they're tracked per-notification via `attempt_count` and `failure_reason`

**Retry:** 3 attempts for the job itself (covers transient failures). Individual notification retries are tracked separately.
**DLQ:** Yes.

### 6.3 `communications:retry-failed-notifications`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/retry-failed.processor.ts`
**Trigger:** Repeatable cron job (every 5 minutes)
**Payload:**

```typescript
interface RetryFailedPayload extends TenantJobPayload {
  // tenant_id is actually not needed for this — it processes cross-tenant
  // But we still require it. Use a special "system" tenant ID or make this a non-tenant-aware job.
}
```

**Alternative approach:** This is a cross-tenant job. Instead of TenantAwareJob, this processor queries notifications table directly (bypassing RLS) looking for `status = 'failed' AND next_retry_at <= now() AND attempt_count < max_attempts`. For each found notification, it enqueues a `communications:dispatch-notifications` job with the correct `tenant_id`.

**Processing logic:**

1. Query notifications where `status = 'failed'` AND `next_retry_at <= now()` AND `attempt_count < max_attempts`
2. Group by `tenant_id`
3. For each tenant group, enqueue `communications:dispatch-notifications` job with those notification IDs

**Retry:** N/A (repeatable job, runs on schedule)

### 6.4 `communications:inquiry-notification`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/inquiry-notification.processor.ts`
**Trigger:** Enqueued by `ParentInquiriesService` on new message
**Payload:**

```typescript
interface InquiryNotificationPayload extends TenantJobPayload {
  inquiry_id: string;
  message_id: string;
  notify_type: 'admin_notify' | 'parent_notify';
}
```

**Processing logic:**

- If `notify_type = 'admin_notify'`: find all users with `inquiries.view` permission in tenant, create `in_app` notification records
- If `notify_type = 'parent_notify'`: find parent record from inquiry, create notification per parent's `preferred_contact_channels`

**Retry:** 3 attempts, exponential backoff.
**DLQ:** Yes.

### 6.5 `communications:stale-inquiry-detection`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/stale-inquiry-detection.processor.ts`
**Trigger:** Repeatable cron job (every hour)
**Payload:** Not tenant-specific — processes all tenants.

**Processing logic:**

1. For each active tenant:
   a. Read `tenant_settings.general.inquiryStaleHours`
   b. Find inquiries in `open` or `in_progress` status where the latest `parent_inquiry_message.created_at` is older than `inquiryStaleHours` hours
   c. Cache the stale count in Redis: `tenant:{tenantId}:stale_inquiries_count`
   d. Optionally notify admins (in_app) if newly stale (not already flagged)

**Retry:** N/A (repeatable job).

### 6.6 `communications:ip-cleanup`

**Queue:** `QUEUE_NAMES.NOTIFICATIONS`
**Processor file:** `apps/worker/src/processors/communications/ip-cleanup.processor.ts`
**Trigger:** Repeatable cron job (nightly at 02:00)
**Payload:** Not tenant-specific.

**Processing logic:**

1. Update `contact_form_submissions SET source_ip = NULL WHERE source_ip IS NOT NULL AND created_at < now() - interval '90 days'`
2. Uses raw SQL via the system-level Prisma client (not tenant-scoped, GDPR operational task)

**Retry:** N/A (repeatable job).

---

## Section 7 — Implementation Order

### Step 1: Database Migration and Seed Data

1. Add new enums to Prisma schema
2. Add `announcements` model
3. Add `notification_templates` model
4. Add `notifications` model
5. Add `parent_inquiries` model
6. Add `parent_inquiry_messages` model
7. Add `website_pages` model
8. Add `contact_form_submissions` model
9. Generate Prisma migration: `npx prisma migrate dev --name add-p7-communications-cms`
10. Create `post_migrate.sql` with:
    - RLS policies for all 7 new tables (standard pattern for 6, dual-policy for `notification_templates`)
    - `set_updated_at()` triggers for: `announcements`, `notification_templates`, `parent_inquiries`, `website_pages`, `contact_form_submissions`
    - All indexes listed in Section 2
    - Homepage enforcement partial unique index
11. Add new permissions to `packages/shared/src/constants/permissions.ts`: `inquiries.view`, `inquiries.respond`
12. Update `PERMISSION_TIER_MAP` and `SYSTEM_ROLE_PERMISSIONS` (add inquiry permissions to school_owner and school_admin)
13. Update seed: add platform-level notification templates, add new permissions
14. Add new queue names to `QUEUE_NAMES` if needed (reuse `NOTIFICATIONS`)

### Step 2: Shared Types and Zod Schemas

1. Add types for announcements, notifications, notification templates, parent inquiries, website pages, contact form submissions to `packages/shared/src/types/`
2. Add Zod schemas for all DTOs to `packages/shared/src/schemas/`:
   - `announcement.schema.ts`: create, update, publish, target_payload validation
   - `notification.schema.ts`: filter schemas
   - `notification-template.schema.ts`: create, update
   - `parent-inquiry.schema.ts`: create inquiry, create message
   - `website-page.schema.ts`: create, update
   - `contact-form.schema.ts`: submit, update status

### Step 3: Backend Services (in dependency order)

1. **DOMPurify utility**: `apps/api/src/common/utils/sanitise-html.ts` — server-side HTML sanitisation helper
2. **NotificationTemplatesService**: template CRUD and resolution (no external deps beyond Prisma)
3. **NotificationsService**: notification CRUD, unread counts, mark-as-read (depends on Redis)
4. **NotificationDispatchService**: dispatch logic with channel-specific senders and fallback chain (depends on NotificationTemplatesService)
5. **AudienceResolutionService**: scope → users resolution (depends on Prisma, reads parents/students/enrolments)
6. **AnnouncementsService**: full announcement lifecycle (depends on AudienceResolutionService, NotificationsService, ApprovalRequestsService, BullMQ)
7. **ParentInquiriesService**: inquiry CRUD and messaging (depends on BullMQ for notifications)
8. **WebsitePagesService**: CMS page management (depends on DOMPurify utility)
9. **PublicWebsiteService**: public page serving (depends on Prisma)
10. **ContactFormService**: contact form with rate limiting (depends on Redis)
11. **WebhookService**: Resend and Twilio webhook handlers (depends on Prisma)

### Step 4: Backend Controllers

1. **AnnouncementsController**: `apps/api/src/modules/communications/announcements.controller.ts`
2. **NotificationsController**: `apps/api/src/modules/communications/notifications.controller.ts`
3. **NotificationTemplatesController**: `apps/api/src/modules/communications/notification-templates.controller.ts`
4. **ParentInquiriesController**: `apps/api/src/modules/parent-inquiries/parent-inquiries.controller.ts`
5. **WebsitePagesController**: `apps/api/src/modules/website/website-pages.controller.ts`
6. **PublicWebsiteController**: `apps/api/src/modules/website/public-website.controller.ts`
7. **ContactFormController**: `apps/api/src/modules/website/contact-form.controller.ts`
8. **WebhookController**: `apps/api/src/modules/communications/webhook.controller.ts`

### Step 5: NestJS Modules

1. **CommunicationsModule**: announcements, notifications, notification templates, dispatch, audience resolution, webhooks
2. **ParentInquiriesModule**: parent inquiries and messages
3. **WebsiteModule**: website pages, public website, contact form
4. Register modules in `AppModule`

### Step 6: Background Job Processors

1. `publish-announcement.processor.ts`
2. `dispatch-notifications.processor.ts`
3. `retry-failed.processor.ts`
4. `inquiry-notification.processor.ts`
5. `stale-inquiry-detection.processor.ts`
6. `ip-cleanup.processor.ts`
7. Register all processors in `WorkerModule`

### Step 7: Frontend — Shared Components

1. TipTap rich text editor component (`packages/ui/src/components/tiptap-editor.tsx`)
2. Notification panel component (`apps/web/src/components/notifications/notification-panel.tsx`)
3. Wire notification bell into the existing top bar / layout

### Step 8: Frontend — Communications Pages

1. Announcements list page
2. New announcement page
3. Announcement detail/editor page
4. Parent announcements page (parent portal)
5. Parent inquiries admin list page
6. Inquiry thread page (admin)
7. Parent inquiry list page (parent portal)
8. Parent inquiry thread page (parent portal)
9. New inquiry page (parent portal)

### Step 9: Frontend — Website CMS Pages

1. Website pages admin list
2. New page editor
3. Page detail/editor
4. Contact form submissions admin page
5. Public website page rendering (dynamic route)
6. Public contact form page

### Step 10: Frontend — Navigation Updates

1. Add "Communications" to sidebar (under OPERATIONS)
2. Add "Website" to sidebar (under SCHOOL)
3. Add "Inquiries" to parent portal sidebar
4. Add "Announcements" to parent portal sidebar
5. Update dashboard with recent announcements section and stale inquiries count

---

## Section 8 — Files to Create

### Prisma / Database

- `packages/prisma/migrations/YYYYMMDDHHMMSS_add_p7_communications_cms/migration.sql` (auto-generated)
- `packages/prisma/migrations/YYYYMMDDHHMMSS_add_p7_communications_cms/post_migrate.sql`

### Shared Package

- `packages/shared/src/types/announcement.ts`
- `packages/shared/src/types/notification.ts`
- `packages/shared/src/types/notification-template.ts`
- `packages/shared/src/types/parent-inquiry.ts`
- `packages/shared/src/types/website-page.ts`
- `packages/shared/src/types/contact-form.ts`
- `packages/shared/src/schemas/announcement.schema.ts`
- `packages/shared/src/schemas/notification.schema.ts`
- `packages/shared/src/schemas/notification-template.schema.ts`
- `packages/shared/src/schemas/parent-inquiry.schema.ts`
- `packages/shared/src/schemas/website-page.schema.ts`
- `packages/shared/src/schemas/contact-form.schema.ts`

### Backend — Communications Module

- `apps/api/src/modules/communications/communications.module.ts`
- `apps/api/src/modules/communications/announcements.controller.ts`
- `apps/api/src/modules/communications/announcements.service.ts`
- `apps/api/src/modules/communications/audience-resolution.service.ts`
- `apps/api/src/modules/communications/notifications.controller.ts`
- `apps/api/src/modules/communications/notifications.service.ts`
- `apps/api/src/modules/communications/notification-dispatch.service.ts`
- `apps/api/src/modules/communications/notification-templates.controller.ts`
- `apps/api/src/modules/communications/notification-templates.service.ts`
- `apps/api/src/modules/communications/webhook.controller.ts`
- `apps/api/src/modules/communications/webhook.service.ts`

### Backend — Parent Inquiries Module

- `apps/api/src/modules/parent-inquiries/parent-inquiries.module.ts`
- `apps/api/src/modules/parent-inquiries/parent-inquiries.controller.ts`
- `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts`

### Backend — Website Module

- `apps/api/src/modules/website/website.module.ts`
- `apps/api/src/modules/website/website-pages.controller.ts`
- `apps/api/src/modules/website/website-pages.service.ts`
- `apps/api/src/modules/website/public-website.controller.ts`
- `apps/api/src/modules/website/public-website.service.ts`
- `apps/api/src/modules/website/contact-form.controller.ts`
- `apps/api/src/modules/website/contact-form.service.ts`

### Backend — Common Utilities

- `apps/api/src/common/utils/sanitise-html.ts`

### Worker — Job Processors

- `apps/worker/src/processors/communications/publish-announcement.processor.ts`
- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `apps/worker/src/processors/communications/retry-failed.processor.ts`
- `apps/worker/src/processors/communications/inquiry-notification.processor.ts`
- `apps/worker/src/processors/communications/stale-inquiry-detection.processor.ts`
- `apps/worker/src/processors/communications/ip-cleanup.processor.ts`

### Frontend — Components

- `packages/ui/src/components/tiptap-editor.tsx`
- `apps/web/src/components/notifications/notification-panel.tsx`
- `apps/web/src/components/notifications/notification-card.tsx`
- `apps/web/src/components/communications/scope-target-picker.tsx`
- `apps/web/src/components/communications/delivery-status-panel.tsx`
- `apps/web/src/components/inquiries/inquiry-thread.tsx`
- `apps/web/src/components/inquiries/message-bubble.tsx`

### Frontend — Pages

- `apps/web/src/app/[locale]/(school)/communications/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/inquiries/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/inquiries/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/contact-submissions/page.tsx`
- `apps/web/src/app/[locale]/(school)/inquiries/page.tsx`
- `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/announcements/page.tsx`
- `apps/web/src/app/[locale]/(public)/[slug]/page.tsx`
- `apps/web/src/app/[locale]/(public)/contact/page.tsx`

### Frontend — Layout Files (if needed)

- `apps/web/src/app/[locale]/(school)/communications/layout.tsx` (optional, for shared layout)

### Translation Files

- Updates to `apps/web/messages/en.json`
- Updates to `apps/web/messages/ar.json`

---

## Section 9 — Files to Modify

### Prisma Schema

- `packages/prisma/schema.prisma` — Add 9 new enums and 7 new models (announcements, notification_templates, notifications, parent_inquiries, parent_inquiry_messages, website_pages, contact_form_submissions)

### Shared Package

- `packages/shared/src/constants/permissions.ts` — Add `inquiries.view`, `inquiries.respond` permissions, update tier map and system role assignments
- `packages/shared/src/types/index.ts` — Export new types
- `packages/shared/src/schemas/index.ts` — Export new schemas

### Backend

- `apps/api/src/app.module.ts` — Import and register `CommunicationsModule`, `ParentInquiriesModule`, `WebsiteModule`
- `apps/api/src/modules/approvals/approvals.module.ts` — Ensure `ApprovalRequestsService` is exported (already done, but verify)

### Worker

- `apps/worker/src/worker.module.ts` — Import and register all 6 new processors, add `communications` queue if not reusing `NOTIFICATIONS`
- `apps/worker/src/base/queue.constants.ts` — Add `COMMUNICATIONS` queue name if needed (evaluate whether to reuse `NOTIFICATIONS` or add separate queue)

### Seed Data

- `packages/prisma/seed.ts` — Add platform-level notification template seeding, add new permission seeding
- `packages/prisma/seed/permissions.ts` — Add `inquiries.view`, `inquiries.respond`
- `packages/prisma/seed/system-roles.ts` — Add inquiry permissions to school_owner and school_admin roles

### RLS Policies

- `packages/prisma/rls/policies.sql` — Add RLS policies for all 7 new tables

### Frontend

- `apps/web/src/app/[locale]/(school)/layout.tsx` or sidebar component — Add Communications, Website, Inquiries nav items
- `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` — Add recent announcements and stale inquiries count
- Top bar / layout component — Wire in notification bell with notification panel
- `apps/web/messages/en.json` — Add translation keys for communications, inquiries, website, notifications
- `apps/web/messages/ar.json` — Add Arabic translations

---

## Section 10 — Key Context for Executor

### Pattern References (with file paths)

1. **Controller pattern** — Follow exactly: `apps/api/src/modules/admissions/admissions.controller.ts` or `apps/api/src/modules/approvals/approval-requests.controller.ts`
   - `@Controller('v1/...')`, `@UseGuards(AuthGuard, PermissionGuard)`, `@RequiresPermission(...)`, `@ModuleEnabled(...)` decorators
   - `@CurrentTenant()`, `@CurrentUser()` parameter decorators
   - `new ZodValidationPipe(schema)` for body/query validation

2. **Service pattern** — Follow: `apps/api/src/modules/approvals/approval-requests.service.ts`
   - Constructor injection of `PrismaService`
   - `findMany`/`count` in parallel for pagination
   - Typed NestJS exceptions (`NotFoundException`, `BadRequestException`, `ForbiddenException`)
   - Error objects: `{ code: 'ERROR_CODE', message: 'Human readable' }`

3. **Worker processor pattern** — Follow: `apps/worker/src/processors/attendance-pending-detection.processor.ts`
   - `@Processor(QUEUE_NAMES.XXX)` + `extends WorkerHost`
   - `@Inject('PRISMA_CLIENT')` for Prisma
   - Job name check in `process()` method
   - Inner class extending `TenantAwareJob` for RLS-aware processing

4. **Module registration** — Follow: `apps/worker/src/worker.module.ts` for worker registration; `apps/api/src/app.module.ts` for API module registration

5. **Zod schema pattern** — Follow: `packages/shared/src/schemas/parent.schema.ts`
   - Schema definition → type inference → export both

6. **Frontend page pattern** — Follow: `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`
   - `'use client'` for interactive pages
   - `useTranslations()` hook
   - `apiClient` from `@/lib/api-client`
   - Tailwind logical utilities (ms-, me-, ps-, pe-, start-, end-)

7. **RLS policy in post_migrate.sql** — Follow: `packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql`
   - Standard: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`
   - Dual-policy for nullable tenant_id: `USING (tenant_id IS NULL OR tenant_id = current_setting(...)::uuid)`

### Gotchas and Edge Cases

1. **DOMPurify on server**: Install `isomorphic-dompurify` or `dompurify` + `jsdom` for server-side HTML sanitisation. DOMPurify requires a DOM environment. Use `isomorphic-dompurify` which handles this.

2. **Approval integration for announcements**: The `ApprovalRequestsService.checkAndCreateIfNeeded()` method exists and works. The `action_type` enum already includes `announcement_publish`. When an announcement is approved externally (via the approvals workflow), the executor needs a mechanism to trigger the actual publish. Options:
   - **Recommended**: Add a hook in `ApprovalRequestsService.approve()` that enqueues a `communications:publish-announcement` job when the action_type is `announcement_publish`. OR:
   - The announcements service polls or the approval service emits an event.
   - The cleanest approach: after approval, the approval controller calls a callback. Check how other modules handle post-approval execution — currently `checkAndCreateIfNeeded` just returns `{ approved: false, request_id }` and the caller transitions to pending. A separate "execute after approval" mechanism is needed. **The executor should implement a callback pattern: when the approval is approved, the approval service calls back to the communications module to execute the publish.** Add an `onApproved` callback registration or an event-based approach.

3. **Notification templates — platform vs tenant**: Platform templates have `tenant_id = NULL`. The dual-policy RLS pattern means queries running with a tenant context can see both their own templates AND platform templates. The `COALESCE` trick in the unique index handles the NULL comparison.

4. **Audience resolution de-duplication**: A parent linked to 3 students in the same class should get ONE notification. De-duplicate by `user_id` after resolving the full audience.

5. **WhatsApp templates are platform-level only**: Schools cannot create WhatsApp templates (they're pre-approved via Twilio). The template management endpoints are for email and in_app templates only at the tenant level. WhatsApp templates are seeded as platform-level with `is_system = true`.

6. **Retry-failed notifications processor is cross-tenant**: It needs to query across all tenants. It should NOT use `TenantAwareJob`. Instead, query the notifications table directly (without RLS context) and then enqueue per-tenant jobs for the actual dispatch.

7. **Contact form IP cleanup is GDPR-required**: The nightly job must NULL out `source_ip` after 90 days. This is a compliance requirement, not optional.

8. **In-app notifications need no external provider**: They're stored in the `notifications` table and served via the notifications API. Status goes directly to `delivered` on creation.

9. **Homepage enforcement must be atomic**: When publishing a new homepage, the unpublish of the old homepage and publish of the new one must happen in the same transaction. Use Prisma interactive transaction.

10. **Contact form rate limiting**: Use Redis INCR with EXPIRE. Key: `rate:contact:{tenantId}:{ip}`, TTL: 3600 seconds. If INCR result > 5, reject.

11. **TipTap BiDi support**: The TipTap editor must support mixed-direction content. Each block element should have a `dir` attribute. The spec says "TipTap preserves block dir attribute, supports mixed-direction content." Use the `@tiptap/extension-text-direction` extension or equivalent.

12. **Public website endpoints bypass auth**: The `PublicWebsiteController` and `ContactFormController` for public routes should NOT have `AuthGuard`. They still resolve tenant from the domain (via tenant resolution middleware) but don't require JWT.

13. **Stale inquiry detection**: "Stale" means no new messages for longer than `inquiryStaleHours`, not just no admin response. This applies to both `open` (no response yet) AND `in_progress` (conversation stalled). The check is against the latest `parent_inquiry_messages.created_at` for the inquiry.

14. **Parent inquiry — author masking**: When serving inquiry messages to a parent, admin messages should have their `author_user_id` and author name replaced with a generic "School Administration" label. The actual author info is still stored in DB and visible to admins.

15. **Queue naming**: The existing `QUEUE_NAMES.NOTIFICATIONS` is available but currently unused by any processor. All P7 communication jobs should use this queue. Add a `COMMUNICATIONS` queue name constant or reuse `NOTIFICATIONS` — the latter is fine since that queue was provisioned for this purpose.
