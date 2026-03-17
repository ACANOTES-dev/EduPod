# Phase 7 Results — Communications, CMS, and Parent Inquiries

## Summary

Phase 7 delivered the full communications layer for the School Operating System: a targeted announcement system with approval-gated and scheduled publishing, a multi-channel notification dispatch engine (email via Resend, WhatsApp via Twilio, in-app) with automatic channel fallback and retry logic, a public website CMS with bilingual page management and a spam-protected contact form, and a structured parent inquiry messaging system with threaded conversations and stale detection. Seven new database tables were created across three NestJS modules (Communications, ParentInquiries, Website), six BullMQ background job processors were registered, and fifteen frontend pages plus two shared UI components were built covering admin, parent portal, and public-facing routes.

---

## Database Migrations

**Migration directory:** `packages/prisma/migrations/20260316240000_add_p7_communications_cms/`

Files: `migration.sql` (schema), `post_migrate.sql` (triggers, RLS policies, indexes)

### Tables Created

| Table | Columns | Notes |
|---|---|---|
| `announcements` | 13 | Tenant-scoped; statuses: draft, pending_approval, scheduled, published, archived |
| `notification_templates` | 11 | Nullable `tenant_id` — platform-level (NULL) or tenant-level |
| `notifications` | 19 | Append-heavy; no `updated_at`; indexed for retry and recipient queries |
| `parent_inquiries` | 8 | Tenant-scoped; statuses: open, in_progress, closed |
| `parent_inquiry_messages` | 7 | Append-only; no `updated_at` |
| `website_pages` | 17 | Tenant-scoped; homepage partial unique index enforces one published home per locale |
| `contact_form_submissions` | 11 | Tenant-scoped; `source_ip` nulled by nightly cron after 90 days |

### New Enums (9)

`AnnouncementStatus`, `AnnouncementScope`, `NotificationChannel`, `NotificationStatus`, `ParentInquiryStatus`, `InquiryAuthorType`, `WebsitePageType`, `WebsitePageStatus`, `ContactFormStatus`

### RLS Policies

All 7 tables have RLS enabled and forced. `notification_templates` uses the dual-policy pattern (allows rows where `tenant_id IS NULL` for platform-level templates). All others use the standard single-tenant isolation pattern.

### Triggers

`set_updated_at()` triggers applied to: `announcements`, `notification_templates`, `parent_inquiries`, `website_pages`, `contact_form_submissions`. Not applied to `notifications` or `parent_inquiry_messages` (no `updated_at` column — append-only design).

---

## API Endpoints

### Announcements (`/api/v1/announcements`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/announcements` | Required | `communications.view` |
| GET | `/api/v1/announcements/my` | Required | `parent.view_announcements` |
| GET | `/api/v1/announcements/:id` | Required | `communications.view` |
| GET | `/api/v1/announcements/:id/delivery-status` | Required | `communications.view` |
| POST | `/api/v1/announcements` | Required | `communications.manage` |
| PATCH | `/api/v1/announcements/:id` | Required | `communications.manage` |
| POST | `/api/v1/announcements/:id/publish` | Required | `communications.send` |
| POST | `/api/v1/announcements/:id/archive` | Required | `communications.manage` |

### Notifications (`/api/v1/notifications`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/notifications` | Required | Any authenticated user (own only) |
| GET | `/api/v1/notifications/unread-count` | Required | Any authenticated user |
| GET | `/api/v1/notifications/admin/failed` | Required | `communications.view` |
| PATCH | `/api/v1/notifications/:id/read` | Required | Any authenticated user (own only) |
| POST | `/api/v1/notifications/mark-all-read` | Required | Any authenticated user |

### Notification Templates (`/api/v1/notification-templates`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/notification-templates` | Required | `communications.manage` |
| GET | `/api/v1/notification-templates/:id` | Required | `communications.manage` |
| POST | `/api/v1/notification-templates` | Required | `communications.manage` |
| PATCH | `/api/v1/notification-templates/:id` | Required | `communications.manage` |

### Parent Inquiries (`/api/v1/inquiries`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/inquiries` | Required | `inquiries.view` |
| GET | `/api/v1/inquiries/my` | Required | `parent.submit_inquiry` |
| GET | `/api/v1/inquiries/:id` | Required | `inquiries.view` |
| GET | `/api/v1/inquiries/:id/parent` | Required | `parent.submit_inquiry` |
| POST | `/api/v1/inquiries` | Required | `parent.submit_inquiry` |
| POST | `/api/v1/inquiries/:id/messages` | Required | `inquiries.respond` |
| POST | `/api/v1/inquiries/:id/messages/parent` | Required | `parent.submit_inquiry` |
| POST | `/api/v1/inquiries/:id/close` | Required | `inquiries.respond` |

### Website CMS (`/api/v1/website`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/website/pages` | Required | `website.manage` |
| GET | `/api/v1/website/navigation` | Required | `website.manage` |
| GET | `/api/v1/website/pages/:id` | Required | `website.manage` |
| POST | `/api/v1/website/pages` | Required | `website.manage` |
| PATCH | `/api/v1/website/pages/:id` | Required | `website.manage` |
| POST | `/api/v1/website/pages/:id/publish` | Required | `website.manage` |
| POST | `/api/v1/website/pages/:id/unpublish` | Required | `website.manage` |
| DELETE | `/api/v1/website/pages/:id` | Required | `website.manage` |

### Contact Form Submissions (`/api/v1/contact-submissions`)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/contact-submissions` | Required | `communications.view` |
| PATCH | `/api/v1/contact-submissions/:id/status` | Required | `communications.manage` |

### Public Endpoints (no auth)

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | `/api/v1/public/pages` | None | Public (tenant resolved from domain) |
| GET | `/api/v1/public/pages/:slug` | None | Public |
| POST | `/api/v1/public/contact` | None | Public (rate-limited: 5/IP/hour via Redis) |

### Webhooks

| Method | Path | Auth | Permission |
|--------|------|------|------------|
| POST | `/api/v1/webhooks/resend` | Svix signature | None (signature-verified) |
| POST | `/api/v1/webhooks/twilio` | Twilio signature | None (signature-verified) |

---

## Services

| Service | File | Responsibilities |
|---------|------|-----------------|
| `AnnouncementsService` | `apps/api/src/modules/communications/announcements.service.ts` | Announcement CRUD, publish lifecycle (approval check, schedule, immediate), audience dispatch, delivery status aggregation, parent view |
| `AudienceResolutionService` | `apps/api/src/modules/communications/audience-resolution.service.ts` | Resolves announcement scope (school/year_group/class/household/custom) to deduplicated list of `{ user_id, locale, channels }` |
| `NotificationsService` | `apps/api/src/modules/communications/notifications.service.ts` | Per-user notification CRUD, unread count (Redis cache with 30s TTL, DB fallback), mark-read, mark-all-read, failed notification admin view |
| `NotificationDispatchService` | `apps/api/src/modules/communications/notification-dispatch.service.ts` | Channel dispatch (email via Resend, WhatsApp via Twilio, in-app immediate), fallback chain (WhatsApp → email → in_app), exponential backoff on failure |
| `NotificationTemplatesService` | `apps/api/src/modules/communications/notification-templates.service.ts` | Template CRUD, tenant-level override of platform templates, resolution with tenant-first fallback to platform-level |
| `WebhookService` | `apps/api/src/modules/communications/webhook.service.ts` | Handles Resend delivery/bounce/complaint callbacks and Twilio status callbacks; updates notification status; triggers email fallback on Twilio failure |
| `ParentInquiriesService` | `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts` | Inquiry and message CRUD, admin vs parent views (admin messages anonymised as "School Administration" for parents), state machine (open → in_progress → closed), notification enqueue on new messages |
| `WebsitePagesService` | `apps/api/src/modules/website/website-pages.service.ts` | Page CRUD, HTML sanitisation, publish/unpublish with homepage enforcement (atomic transaction swaps published home pages), navigation query |
| `PublicWebsiteService` | `apps/api/src/modules/website/public-website.service.ts` | Serves published pages by slug for public routes; navigation list |
| `ContactFormService` | `apps/api/src/modules/website/contact-form.service.ts` | Contact form submission with Redis rate limiting (5/IP/hour), honeypot spam detection, status transition validation |

---

## Frontend

### Admin / School Shell Pages

| Route | File |
|-------|------|
| `/communications` | `apps/web/src/app/[locale]/(school)/communications/page.tsx` |
| `/communications/new` | `apps/web/src/app/[locale]/(school)/communications/new/page.tsx` |
| `/communications/:id` | `apps/web/src/app/[locale]/(school)/communications/[id]/page.tsx` |
| `/communications/inquiries` | `apps/web/src/app/[locale]/(school)/communications/inquiries/page.tsx` |
| `/communications/inquiries/:id` | `apps/web/src/app/[locale]/(school)/communications/inquiries/[id]/page.tsx` |
| `/website` | `apps/web/src/app/[locale]/(school)/website/page.tsx` |
| `/website/new` | `apps/web/src/app/[locale]/(school)/website/new/page.tsx` |
| `/website/:id` | `apps/web/src/app/[locale]/(school)/website/[id]/page.tsx` |
| `/website/contact-submissions` | `apps/web/src/app/[locale]/(school)/website/contact-submissions/page.tsx` |

### Parent Portal Pages

| Route | File |
|-------|------|
| `/inquiries` | `apps/web/src/app/[locale]/(school)/inquiries/page.tsx` |
| `/inquiries/new` | `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx` |
| `/inquiries/:id` | `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx` |
| `/announcements` | `apps/web/src/app/[locale]/(school)/announcements/page.tsx` |

### Public Shell Pages

| Route | File |
|-------|------|
| `/:slug` | `apps/web/src/app/[locale]/(public)/[slug]/page.tsx` |
| `/contact` | `apps/web/src/app/[locale]/(public)/contact/page.tsx` |

### Shared UI Components

| Component | File | Description |
|-----------|------|-------------|
| `TiptapEditor` | `packages/ui/src/components/tiptap-editor.tsx` | Rich text editor with BiDi support, RTL/LTR direction toggle per block, toolbar, DOMPurify output sanitisation |
| `NotificationPanel` | `apps/web/src/components/notifications/notification-panel.tsx` | Bell icon with unread badge, slide-down panel, grouped by date, mark-all-read, navigates to source entity on click |

---

## Background Jobs

All six processors are registered in the `NOTIFICATIONS` queue (`QUEUE_NAMES.NOTIFICATIONS`).

| Job Name | Processor File | Queue | Trigger |
|----------|---------------|-------|---------|
| `communications:publish-announcement` | `apps/worker/src/processors/communications/publish-announcement.processor.ts` | `notifications` | Enqueued by `AnnouncementsService.publish()` (immediate or delayed for scheduled) |
| `communications:dispatch-notifications` | `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` | `notifications` | Enqueued by publish-announcement processor (batches of 100) and inquiry/contact notification paths |
| `communications:retry-failed-notifications` | `apps/worker/src/processors/communications/retry-failed.processor.ts` | `notifications` | Repeatable cron every 5 minutes; cross-tenant; queries failed notifications with `next_retry_at <= now()` |
| `communications:inquiry-notification` | `apps/worker/src/processors/communications/inquiry-notification.processor.ts` | `notifications` | Enqueued by `ParentInquiriesService` on new inquiry or new message |
| `communications:stale-inquiry-detection` | `apps/worker/src/processors/communications/stale-inquiry-detection.processor.ts` | `notifications` | Repeatable cron every hour; iterates all tenants; caches stale count in Redis |
| `communications:ip-cleanup` | `apps/worker/src/processors/communications/ip-cleanup.processor.ts` | `notifications` | Repeatable cron nightly at 02:00; NULLs `source_ip` on `contact_form_submissions` older than 90 days |

**Note:** `retry-failed`, `stale-inquiry-detection`, and `ip-cleanup` are cross-tenant cron processors — they do NOT extend `TenantAwareJob` and query the DB without RLS context, which is appropriate for their operational role.

---

## Configuration

### New Permissions Seeded

| Permission | Tier | Assigned to System Roles |
|------------|------|--------------------------|
| `inquiries.view` | admin | school_owner, school_admin |
| `inquiries.respond` | admin | school_owner, school_admin |

### Platform-Level Notification Templates Seeded

Added to `packages/prisma/seed.ts` (tenant_id = NULL, is_system = true):

| Template Key | Channels | Locales |
|---|---|---|
| `announcement.published` | email, in_app | en, ar |
| `inquiry.new_message` | email, in_app | en, ar |
| `approval.requested` | email, in_app | en, ar |
| `approval.decided` | email, in_app | en, ar |

Templates use Handlebars-style variables: `{{school_name}}`, `{{recipient_name}}`, `{{title}}`, `{{body}}`, `{{inquiry_subject}}`, etc.

### New Constants

- `packages/shared/src/constants/notification-types.ts` — notification type constant registry
- `packages/shared/src/constants/permissions.ts` — extended with `inquiries.view`, `inquiries.respond`

### Translation Files Updated

- `apps/web/messages/en.json` — added keys for `communications`, `announcements`, `inquiries`, `website`, notification panel, contact form
- `apps/web/messages/ar.json` — Arabic translations for all P7 keys

---

## Files Created

### Prisma / Database
- `packages/prisma/migrations/20260316240000_add_p7_communications_cms/migration.sql`
- `packages/prisma/migrations/20260316240000_add_p7_communications_cms/post_migrate.sql`

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
- `packages/shared/src/constants/notification-types.ts`

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
- `apps/api/src/modules/website/contact-submissions.controller.ts`
- `apps/api/src/modules/website/public-contact.controller.ts`
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

### Frontend — Shared Components
- `packages/ui/src/components/tiptap-editor.tsx`
- `apps/web/src/components/notifications/notification-panel.tsx`

### Frontend — Admin Pages
- `apps/web/src/app/[locale]/(school)/communications/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/inquiries/page.tsx`
- `apps/web/src/app/[locale]/(school)/communications/inquiries/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/website/contact-submissions/page.tsx`

### Frontend — Parent Portal Pages
- `apps/web/src/app/[locale]/(school)/inquiries/page.tsx`
- `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/announcements/page.tsx`

### Frontend — Public Pages
- `apps/web/src/app/[locale]/(public)/[slug]/page.tsx`
- `apps/web/src/app/[locale]/(public)/contact/page.tsx`

---

## Files Modified

| File | Change |
|------|--------|
| `packages/prisma/schema.prisma` | Added 9 new enums and 7 new models |
| `packages/prisma/rls/policies.sql` | Added RLS policies for all 7 new tables |
| `packages/prisma/seed.ts` | Added platform-level notification template seeding; new permissions seeding |
| `packages/shared/src/constants/permissions.ts` | Added `inquiries.view`, `inquiries.respond` to `PERMISSIONS`, `PERMISSION_TIER_MAP`, and `SYSTEM_ROLE_PERMISSIONS` |
| `packages/shared/src/index.ts` | Exported all 6 new type files and 6 new schema files |
| `apps/api/src/app.module.ts` | Registered `CommunicationsModule`, `ParentInquiriesModule`, `WebsiteModule` |
| `apps/worker/src/worker.module.ts` | Imported and registered all 6 new processors |
| `apps/web/messages/en.json` | Added P7 translation keys |
| `apps/web/messages/ar.json` | Added P7 Arabic translations |

---

## Known Limitations

- **Notification partitioning deferred:** The `notifications` table is created as a regular table. Monthly partitioning by `created_at` (mentioned in the spec) is an operational migration that can be applied later without code changes.
- **WhatsApp template registration:** Twilio WhatsApp requires pre-approved message templates for production use. The dispatch service constructs messages, but template approval with Twilio is an operational task outside code scope.
- **No real-time push for in-app notifications:** In-app notifications are pull-based (poll `/api/v1/notifications/unread-count`). Server-sent events or WebSocket push is not implemented in this phase.
- **Email bounce flagging:** On Resend bounce webhook, the service logs the bounce but the spec's "flag parent email for admin review" is recorded via audit log rather than a dedicated `email_bounced` field on the parent record (no such column exists in the P2 `parents` table).
- **Planned component sub-directories not created:** The plan listed separate component files (`apps/web/src/components/communications/scope-target-picker.tsx`, `delivery-status-panel.tsx`, `apps/web/src/components/inquiries/inquiry-thread.tsx`, `message-bubble.tsx`, `notifications/notification-card.tsx`) — these are implemented inline within their respective page components rather than as standalone exported components.

---

## Deviations from Plan

- **`contact-submissions.controller.ts` vs `contact-form.controller.ts`:** The plan listed `contact-form.controller.ts` for the admin endpoints (Section 8). The actual file is `contact-submissions.controller.ts` — a more accurate name since it handles `ContactFormService.list()` and `ContactFormService.updateStatus()` for submitted forms. The public submission endpoint was split into a separate `public-contact.controller.ts`, matching the controller class structure.
- **Cross-tenant processors use raw Prisma without RLS:** `retry-failed`, `stale-inquiry-detection`, and `ip-cleanup` bypass `TenantAwareJob` by design (confirmed in plan Section 6.3 note). This is correct — they are platform-level operational jobs.
- **Announcement `inquiry.new_message` template seeded for both `en` and `ar`:** The plan's seed list (Section 2.9) specified `email + in_app` × `en + ar` for `inquiry.new_message`. This was implemented exactly as specified.
