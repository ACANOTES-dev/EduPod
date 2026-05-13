# Deep-Dive Evidence — Batch 4 (Communications + Engagement)

> Raw agent investigation report. Saved verbatim from the deep-dive pass on 2026-05-13.
> Modules: parent_inquiries, engagement, trips, public_website (website), communications_outbound (communications).
> Includes the critical communications outbound vs inbox split recommendation.

========================================

## Module: parent_inquiries

display_name_proposal: "Parent Inquiries"
description_proposal: "Parent-initiated inquiries about student support and concerns"

### API

api_module_dir: `apps/api/src/modules/parent-inquiries`
controllers:

- parent-inquiries.controller.ts: gating=class, key='parent_inquiries', endpoints=~6
  exported_services: [ParentInquiriesService]
  consumed_by_modules: [communications (inquiry.new_message notifications)]

### Frontend

routes: [/communications/inquiries, /communications/inquiries/[id], /communications/new]
nav_locations: [nav.inquiries (parent portal at /inquiries)]
module_aware_files: [communications/inquiries/[id]/page.tsx]

### Worker

queues: [inquiry-notification]
crons: [stale-inquiry-detection (48h default via inquiryStaleHours)]
processors: [stale-inquiry-detection.processor.ts, inquiry-notification.processor.ts]

### Data

primary_tables: [ParentInquiry, ParentInquiryMessage]
table_count: ~2

### Permissions

permission_count: 2
sample_permission_keys: ['parent.submit_inquiry', 'inquiries.view']

### Notifications

notification_types: ['inquiry.new_message']

### PDF

template_keys: [none found]

### Current gating state

api_enforcement: full
frontend_enforcement: partial (nav not gated; routes exist but endpoint calls fail when disabled)
worker_enforcement: none (processors run regardless)
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- Worker processors (inquiry-notification.processor.ts, stale-inquiry-detection.processor.ts) do not check tenantModule.is_enabled before dispatch.
- Frontend nav "Inquiries" item not gated (nav-config.ts line 43) — recommend conditional hiding based on tenantModule state.

### Disable impact

hidden_when_off: [/inquiries nav item, POST/GET endpoints return 403]
data_status: Data persists; no cascading deletes
risk_if_disabled_today: medium — parents can't submit/view inquiries, but in-flight inbox conversations continue. Processors run but fail at dispatch.
risk_if_re_enabled_later: low — all inquiries + messages resume visibility; no data loss.

========================================

## Module: engagement

display_name_proposal: "Engagement"
description_proposal: "School events, parent conferences, engagement forms, consent tracking"

### API

api_module_dir: `apps/api/src/modules/engagement`
controllers:

- conferences.controller.ts: gating=class, key='engagement', endpoints=~9
- events.controller.ts: gating=class, key='engagement', endpoints=~27
- engagement-analytics.controller.ts: gating=class, key='engagement', endpoints=~3
- parent-conferences.controller.ts: gating=class, key='engagement', endpoints=~4
- parent-events.controller.ts: gating=class, key='engagement', endpoints=~4
- consent-records.controller.ts: gating=none, endpoints=~2
- form-submissions.controller.ts: gating=none, endpoints=~4
- form-templates.controller.ts: gating=none, endpoints=~8
- parent-forms.controller.ts: gating=none, endpoints=~4
  exported_services: [ConferencesService, EventsService, EngagementAnalyticsService, etc.]
  consumed_by_modules: [inbox (audience provider for TripRosterProvider)]

### Frontend

routes: [/engagement, /engagement/conferences, /engagement/events, /engagement/form-templates, /engagement/analytics, /engagement/consent-archive, /engagement/parent/*, /settings/engagement]
nav_locations: [nav.engagement (all users)]
module_aware_files: (no explicit tenantModule checks found in read files)

### Worker

queues: [engagement-queue, engagement-conferences, engagement-forms, engagement-annual-renewal, engagement-generate-trip-pack]
crons: [engagement-conference-reminders, engagement-annual-renewal (unverified cadence)]
processors: [engagement-queue.processor.ts, engagement-conference-reminders.processor.ts, engagement-distribute-forms.processor.ts, engagement-annual-renewal.processor.ts, engagement-generate-trip-pack.processor.ts]

### Data

primary_tables: [EngagementEvent, EngagementEventParticipant, EngagementEventStaff, ConferenceBooking, ConferenceTimeSlot, EngagementConsentRecord, EngagementFormTemplate, EngagementFormSubmission, EngagementIncidentReport, ConsentRecord]
table_count: ~10

### Permissions

permission_count: ~4
sample_permission_keys: ['engagement.conferences.manage', 'parent.view_engagement', 'parent.manage_engagement']

### Notifications

notification_types: [none found in fixture]

### PDF

template_keys: [none found]

### Current gating state

api_enforcement: partial (5 controllers gated; 4 ungated sub-controllers allow unfiltered access to forms/consents)
frontend_enforcement: none (nav not gated; routes unconditionally render)
worker_enforcement: none (processors run regardless; no tenantModule checks observed)
in_seed_module_keys: **NO — CRITICAL: 'engagement' missing from MODULE_KEYS array**
default_enabled: N/A (not in seed) — but guard treats missing row as DENY, so engagement is currently completely blocked for all tenants

### Gaps to fix

- **PRIMARY: Add 'engagement' to MODULE_KEYS in tenant-fixture.builder.ts line 29** (needed for seed, test fixtures, and consistency).
- Ungated controllers (form-templates, form-submissions, consent-records, parent-forms) in engagement/ should either be moved into the class-level @ModuleEnabled('engagement') or explicitly marked as not requiring gating if they're core infrastructure.
- Worker processors (all 5 in engagement/) do not check tenantModule.is_enabled. Add gating in each processor's onProcess().
- Frontend nav item not gated (nav-config.ts) — recommend conditional rendering based on tenantModule state.

### Disable impact

hidden_when_off: [/engagement nav item; all event/conference/form endpoints return 403; analytics inaccessible]
data_status: Data persists; ungated form endpoints still allow read/write if directly called
risk_if_disabled_today: high — ungated sub-controllers allow bypass; workers continue dispatching forms/reminders; no enforcement consistency. Plus engagement is currently blocked entirely (missing seed).
risk_if_re_enabled_later: low — all events/forms/conferences resume visibility

========================================

## Module: trips

display_name_proposal: "Trips (Placeholder)"
description_proposal: "Placeholder for future trips module — currently only an audience provider"

### API

api_module_dir: `apps/api/src/modules/trips`
controllers: [none]
exported_services: [TripRosterProvider (inbox audience only)]
consumed_by_modules: [inbox (audience provider registry)]

### Frontend

routes: [none]
nav_locations: [none]
module_aware_files: [none]

### Worker

queues: [none]
crons: [none]
processors: [none]

### Data

primary_tables: [none — stub only]
table_count: ~0

### Permissions

permission_count: 0
sample_permission_keys: []

### Notifications

notification_types: [none]

### PDF

template_keys: [none]

### Current gating state

api_enforcement: none (stub only)
frontend_enforcement: none
worker_enforcement: none
in_seed_module_keys: no
default_enabled: N/A

### Gaps to fix

- If trips remain a stub, consider removing from gating scope entirely or deferring proposal until real trips module lands.
- If trips will be a real toggle: create controllers, add to MODULE_KEYS, define permissions.

### Disable impact

hidden_when_off: [N/A — no UI/endpoints]
data_status: N/A
risk_if_disabled_today: none — stub has no real functionality
risk_if_re_enabled_later: N/A

========================================

## Module: public_website (website key)

display_name_proposal: "Website"
description_proposal: "Public-facing school website pages and contact forms"

### API

api_module_dir: `apps/api/src/modules/website`
controllers:

- website-pages.controller.ts: gating=class, key='website', endpoints=~7
- contact-submissions.controller.ts: gating=class, key='website', endpoints=~3
- public-website.controller.ts: gating=none, endpoints=~2
- public-contact.controller.ts: gating=none, endpoints=~1

exported_services: [WebsitePagesService]
consumed_by_modules: [none found]

### Frontend

routes: [/website, /website/[id], /website/new, /website/contact-submissions]
nav_locations: [nav.website (all users)]
module_aware_files: [none explicitly checked]

### Worker

queues: [none]
crons: [none]
processors: [none]

### Data

primary_tables: [WebsitePage, ContactFormSubmission]
table_count: ~2

### Permissions

permission_count: 1
sample_permission_keys: ['website.manage']

### Notifications

notification_types: [none found]

### PDF

template_keys: [none found]

### Current gating state

api_enforcement: partial (2 controllers gated; 2 public controllers ungated — **public-website.controller.ts and public-contact.controller.ts have no @ModuleEnabled**)
frontend_enforcement: none (nav not gated; routes unconditionally render)
worker_enforcement: none
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- Public endpoints (public-website.controller.ts, public-contact.controller.ts) intentionally ungated — public users must access site regardless of module state. **This is correct design but document it.**
- Admin routes (website-pages.controller.ts) are properly gated. Consider adding @ModuleEnabled to contact-submissions.controller.ts for consistency (currently ungated).
- Frontend nav not gated — recommend conditional hiding based on tenantModule state.
- **Decision needed**: when website is disabled, should the public site still render? Recommendation: yes (public site is a discovered URL; gating should only hide admin UI, not break the live site).

### Disable impact

hidden_when_off: [/website admin panel hidden; but public pages and contact forms remain publicly accessible]
data_status: Data persists; public site remains live
risk_if_disabled_today: low — public site unaffected; admins lose edit access
risk_if_re_enabled_later: low — admin UI returns

========================================

## Module: communications_outbound (communications key)

display_name_proposal: "Communications Outbound"
description_proposal: "Outbound notification dispatch (SMS/email/WhatsApp/Resend/Twilio) — NOT inbox conversations"

### API

api_module_dir: `apps/api/src/modules/communications`
controllers:

- announcements.controller.ts: gating=class, key='communications', endpoints=~5
- notification-templates.controller.ts: gating=class, key='communications', endpoints=~5
- notifications.controller.ts (method-level): gating=method (@ModuleEnabled on /admin/failed only), key='communications', endpoints=~4 (1 gated, 3 ungated)
- unsubscribe.controller.ts: gating=none, endpoints=~2 (public endpoint)
- webhook.controller.ts: gating=none, endpoints=~1 (provider webhook)
- email-domain.controller.ts: gating=none, endpoints=~2 (unverified)
- communications-webhooks.controller.ts: gating=none, endpoints=~1 (unverified)
- whatsapp-template.controller.ts: gating=none, endpoints=~1 (unverified)

exported_services: [AnnouncementsService, NotificationsService, NotificationTemplatesService, etc.]
consumed_by_modules: [compliance (notifications), early-warning (notifications), reports (notifications), scheduling (notifications), attendance (notifications), gradebook (notifications), homework (notifications), leave (notifications), pastoral (notifications), wellbeing-notifications (notifications)]

### Frontend

routes: [/communications, /communications/announcements, /communications/inquiries, /communications/new, /communications/[id], /announcements (parent portal), /settings/communications]
nav_locations: [nav.communications (admin only), nav.announcements (parent portal)]
module_aware_files: (no explicit tenantModule checks found)

### Worker

queues: [dispatch-notifications, inbox-dispatch-channels, publish-announcement, announcement-approval-callback, retry-failed, stale-inquiry-detection, inquiry-notification, suppression-list-cleanup, ip-cleanup]
crons: [stale-inquiry-detection (inquiry module), suppression-list-cleanup, ip-cleanup (cadences unverified)]
processors:

- dispatch-notifications.processor.ts (OUTBOUND — SMS/email/WhatsApp)
- inbox-dispatch-channels.processor.ts (INBOX — conversations)
- publish-announcement.processor.ts (OUTBOUND — announcements)
- announcement-approval-callback.processor.ts (OUTBOUND)
- retry-failed.processor.ts (OUTBOUND)
- stale-inquiry-detection.processor.ts (inquiry module — not comms)
- inquiry-notification.processor.ts (inquiry module)
- suppression-list-cleanup.processor.ts
- ip-cleanup.processor.ts

### CRITICAL: outbound vs inbox split

**OUTBOUND (should gate on communications_outbound):**

- dispatch-notifications.processor.ts (Resend/Twilio/email/SMS/WhatsApp)
- publish-announcement.processor.ts
- announcement-approval-callback.processor.ts
- retry-failed.processor.ts
- announcements.controller.ts
- notification-templates.controller.ts
- notifications.controller.ts /admin/failed endpoint
- email-domain.controller.ts
- whatsapp-template.controller.ts

**INBOX (CORE — should NOT gate):**

- inbox-dispatch-channels.processor.ts (in-app message delivery)
- notifications.controller.ts list/unread/read endpoints
- Notification, Conversation, ConversationParticipant, Message, MessageRead tables for in-app messaging

**INQUIRY (own module):**

- stale-inquiry-detection
- inquiry-notification

### Data

primary_tables: [Notification (in-app inbox), NotificationTemplate, Announcement, Message, MessageAttachment, MessageRead, MessageFlag, MessageEdit, Conversation, ConversationParticipant, ContactFormSubmission, NotificationSuppressionList, NotificationWebhookEvent]
table_count: ~13

### Permissions

permission_count: 5
sample_permission_keys: ['communications.view', 'communications.manage', 'communications.send', 'configuration.communications.view', 'configuration.communications.manage']

### Notifications

notification_types: ['announcement.published']

### PDF

template_keys: [none found]

### Current gating state

api_enforcement: partial (announcements/templates gated; notifications.controller ungated for inbox, one method gated for admin view; unsubscribe/webhooks public)
frontend_enforcement: none (nav not gated; routes unconditionally render)
worker_enforcement: none — **CRITICAL: dispatch-notifications.processor.ts, publish-announcement.processor.ts, and others do NOT check tenantModule.is_enabled**
in_seed_module_keys: yes
default_enabled: yes

### Gaps to fix

- **PRIMARY: Split communications into separate toggles.** Proposed:
  1. Keep `communications` (or rename to `communications_inbox`) → gates in-app inbox/conversations only. MUST NOT gate:
     - notifications.controller GET/PATCH (list, read, unread-count, markAllRead)
     - Inbox processors: inbox-dispatch-channels.processor.ts
     - Message, Conversation, MessageRead tables
  2. Create NEW `communications_outbound` → gates outbound dispatch. MUST gate:
     - announcements.controller (admin side)
     - notification-templates.controller
     - notifications.controller /admin/failed endpoint
     - dispatch-notifications.processor.ts
     - publish-announcement.processor.ts
     - announcement-approval-callback.processor.ts
     - retry-failed.processor.ts
  3. Parent-facing routes (/announcements in parent portal) — determine whether to gate on communications or communications_outbound (proposal: gate on communications_outbound so parents always see inbox but not broadcasts when disabled)
- **SECONDARY: Add MODULE_KEYS entries** for new toggle(s) in tenant-fixture.builder.ts.
- **TERTIARY: Gating checks** in all outbound processors' onProcess().
- Frontend nav not gated — conditional rendering.
- Unsubscribe/webhook endpoints intentionally public — document this. Webhook handlers should silently no-op if outbound is disabled (preserve idempotency).

### Disable impact

hidden_when_off: [if communications_outbound disabled: announcements not sent, admin can't manage templates, retry queue dormant; if communications (inbox) disabled: in-app inbox hidden]
data_status: Data persists; undelivered notifications accumulate
risk_if_disabled_today: high — **if single communications toggle disabled, BOTH inbox AND outbound stop**, losing a core user feature (inbox conversations)
risk_if_re_enabled_later: medium — queued notifications may be stale; retry logic may conflict

---

**Final note on communications split:** The proposed split is critical for tenant autonomy. Disabling "outbound comms" (SMS/email broadcasts) must NOT disable the in-app inbox, which is a core communication tool. The current monolithic `communications` toggle is too broad and would require careful coordination during transition.
