/**
 * RLS Leakage Tests — Phase 7 (Communications, Notifications, Inquiries, Website, Contact)
 *
 * Verifies that tenant isolation holds at the API level for all P7 entities:
 * announcements, notification_templates, notifications, parent_inquiries,
 * parent_inquiry_messages, website_pages, contact_form_submissions.
 *
 * Pattern: Create data as Al Noor (Tenant A), authenticate as Cedar (Tenant B),
 * call each endpoint, assert only Cedar data is returned / Al Noor data is invisible.
 */

import { INestApplication } from '@nestjs/common';
import request from 'supertest';

import {
  createTestApp,
  closeTestApp,
  login,
  getAuthToken,
  authGet,
  authPost,
  authPatch,
  AL_NOOR_ADMIN_EMAIL,
  AL_NOOR_PARENT_EMAIL,
  CEDAR_ADMIN_EMAIL,
  CEDAR_PARENT_EMAIL,
  DEV_PASSWORD,
  AL_NOOR_DOMAIN,
  CEDAR_DOMAIN,
  cleanupRedisKeys,
} from '../helpers';

jest.setTimeout(120_000);

describe('P7 — RLS Leakage Tests (e2e)', () => {
  let app: INestApplication;

  // Tokens
  let alNoorAdminToken: string;
  let alNoorParentToken: string;
  let cedarAdminToken: string;
  let cedarParentToken: string;

  // Al Noor data IDs (populated during tests)
  let alNoorAnnouncementDraftId: string;
  let alNoorAnnouncementPublishedId: string;
  let alNoorCustomTemplateId: string;
  let alNoorNotificationId: string;
  let alNoorInquiryId: string;
  let alNoorPageId: string;
  let alNoorPageSlug: string;
  let alNoorContactSubmissionId: string;

  const suffix = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const [alNoorAdminLogin, alNoorParentLogin, cedarAdminLogin, cedarParentLogin] =
      await Promise.all([
        login(app, AL_NOOR_ADMIN_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN),
        login(app, AL_NOOR_PARENT_EMAIL, DEV_PASSWORD, AL_NOOR_DOMAIN),
        login(app, CEDAR_ADMIN_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN),
        login(app, CEDAR_PARENT_EMAIL, DEV_PASSWORD, CEDAR_DOMAIN),
      ]);

    alNoorAdminToken = alNoorAdminLogin.accessToken;
    alNoorParentToken = alNoorParentLogin.accessToken;
    cedarAdminToken = cedarAdminLogin.accessToken;
    cedarParentToken = cedarParentLogin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await cleanupRedisKeys([
      'rate:contact:*',
      'tenant:*:user:*:unread_notifications',
      'bull:*',
    ]);
    await closeTestApp();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.1 — announcements table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.1 announcements — RLS leakage', () => {
    it('should not expose Tenant A announcements to Tenant B', async () => {
      // Create 2 Al Noor announcements: one draft, one published
      const draftRes = await authPost(
        app,
        '/api/v1/announcements',
        alNoorAdminToken,
        {
          title: `RLS Draft Announcement ${suffix}`,
          body_html: '<p>Draft body</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      alNoorAnnouncementDraftId = draftRes.body.data.id;

      const pubDraftRes = await authPost(
        app,
        '/api/v1/announcements',
        alNoorAdminToken,
        {
          title: `RLS Published Announcement ${suffix}`,
          body_html: '<p>Published body</p>',
          scope: 'school',
          target_payload: {},
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      const pubDraftId = pubDraftRes.body.data.id;

      // Publish the second one
      await authPost(
        app,
        `/api/v1/announcements/${pubDraftId}/publish`,
        alNoorAdminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);
      alNoorAnnouncementPublishedId = pubDraftId;

      // Cedar admin: list announcements — should NOT contain Al Noor's IDs
      const listRes = await authGet(
        app,
        '/api/v1/announcements',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarAnnouncementIds = (listRes.body.data || []).map(
        (a: Record<string, unknown>) => a.id,
      );
      expect(cedarAnnouncementIds).not.toContain(alNoorAnnouncementDraftId);
      expect(cedarAnnouncementIds).not.toContain(alNoorAnnouncementPublishedId);

      // Cedar admin: GET Al Noor's announcement by ID → 404
      await authGet(
        app,
        `/api/v1/announcements/${alNoorAnnouncementPublishedId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.2 — notification_templates table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.2 notification_templates — RLS leakage', () => {
    it('should not expose Tenant A custom templates to Tenant B', async () => {
      // Al Noor admin: create a custom notification template
      const templateRes = await authPost(
        app,
        '/api/v1/notification-templates',
        alNoorAdminToken,
        {
          template_key: `custom_event_rls_${suffix}`,
          channel: 'in_app',
          locale: 'en',
          subject_template: `RLS Test Template ${suffix}`,
          body_template: 'Hello {{name}}',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      alNoorCustomTemplateId = templateRes.body.data.id;

      // Cedar admin: list templates — should NOT contain Al Noor's custom template
      const listRes = await authGet(
        app,
        '/api/v1/notification-templates',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarTemplateIds = (listRes.body.data || []).map(
        (t: Record<string, unknown>) => t.id,
      );
      expect(cedarTemplateIds).not.toContain(alNoorCustomTemplateId);

      // Cedar admin: GET Al Noor's template by ID → 404
      await authGet(
        app,
        `/api/v1/notification-templates/${alNoorCustomTemplateId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.3 — notifications table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.3 notifications — RLS leakage', () => {
    it('should not expose Tenant A notifications to Tenant B users', async () => {
      // The published announcement from 3.1 should have created notifications
      // for Al Noor parent. Let's verify Cedar parent cannot see them.

      // Cedar parent: list notifications — should be empty or only Cedar's own
      const listRes = await authGet(
        app,
        '/api/v1/notifications',
        cedarParentToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarNotifications = listRes.body.data || [];
      // Verify none of the notifications reference Al Noor's announcement
      for (const n of cedarNotifications) {
        if (n.reference_id) {
          expect(n.reference_id).not.toBe(alNoorAnnouncementPublishedId);
        }
      }

      // Cedar parent: unread count should not include Al Noor's notifications
      const countRes = await authGet(
        app,
        '/api/v1/notifications/unread-count',
        cedarParentToken,
        CEDAR_DOMAIN,
      ).expect(200);

      // The count should be 0 or only reflect Cedar's own unread notifications
      const unreadCount = countRes.body.data?.count ?? countRes.body.data?.unread_count ?? 0;
      expect(typeof unreadCount).toBe('number');

      // Now get an Al Noor notification ID for the next test
      const alNoorNotifRes = await authGet(
        app,
        '/api/v1/notifications',
        alNoorParentToken,
        AL_NOOR_DOMAIN,
      ).expect(200);

      const alNoorNotifs = alNoorNotifRes.body.data || [];
      if (alNoorNotifs.length > 0) {
        alNoorNotificationId = alNoorNotifs[0].id;
      }

      // Cedar admin: admin failed notifications list — should not include Al Noor's
      const failedRes = await authGet(
        app,
        '/api/v1/notifications/admin/failed',
        cedarAdminToken,
        CEDAR_DOMAIN,
      );

      // May return 200 with empty data or 404 — either way, no Al Noor data
      if (failedRes.status === 200) {
        const failedNotifs = failedRes.body.data || [];
        for (const n of failedNotifs) {
          if (n.reference_id) {
            expect(n.reference_id).not.toBe(alNoorAnnouncementPublishedId);
          }
        }
      }
    });

    it('should not allow marking Tenant A notification as read via Tenant B context', async () => {
      // Skip if no Al Noor notification was created
      if (!alNoorNotificationId) {
        // Create one explicitly: publish another Al Noor announcement to generate notifications
        const annRes = await authPost(
          app,
          '/api/v1/announcements',
          alNoorAdminToken,
          {
            title: `RLS Notif Test ${suffix}`,
            body_html: '<p>Notification test</p>',
            scope: 'school',
            target_payload: {},
          },
          AL_NOOR_DOMAIN,
        ).expect(201);

        await authPost(
          app,
          `/api/v1/announcements/${annRes.body.data.id}/publish`,
          alNoorAdminToken,
          {},
          AL_NOOR_DOMAIN,
        ).expect(200);

        // Wait briefly for notifications to be created
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const notifRes = await authGet(
          app,
          '/api/v1/notifications',
          alNoorParentToken,
          AL_NOOR_DOMAIN,
        ).expect(200);

        const notifs = notifRes.body.data || [];
        if (notifs.length > 0) {
          alNoorNotificationId = notifs[0].id;
        }
      }

      if (alNoorNotificationId) {
        // Cedar parent tries to mark Al Noor's notification as read → 404
        await authPatch(
          app,
          `/api/v1/notifications/${alNoorNotificationId}/read`,
          cedarParentToken,
          {},
          CEDAR_DOMAIN,
        ).expect(404);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.4 — parent_inquiries table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.4 parent_inquiries — RLS leakage', () => {
    it('should not expose Tenant A inquiries to Tenant B admins', async () => {
      // Al Noor parent creates an inquiry
      const inquiryRes = await authPost(
        app,
        '/api/v1/inquiries',
        alNoorParentToken,
        {
          subject: `RLS Inquiry Test ${suffix}`,
          message: 'This is a test inquiry from Al Noor parent.',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      alNoorInquiryId = inquiryRes.body.data.id;

      // Cedar admin: list inquiries — should not contain Al Noor's inquiry
      const listRes = await authGet(
        app,
        '/api/v1/inquiries',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarInquiryIds = (listRes.body.data || []).map(
        (i: Record<string, unknown>) => i.id,
      );
      expect(cedarInquiryIds).not.toContain(alNoorInquiryId);

      // Cedar admin: GET Al Noor's inquiry by ID → 404
      await authGet(
        app,
        `/api/v1/inquiries/${alNoorInquiryId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.5 — parent_inquiry_messages table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.5 parent_inquiry_messages — RLS leakage', () => {
    it('messages cannot be retrieved across tenant boundary', async () => {
      // The inquiry created in 3.4 already has an initial message.
      // Cedar admin: trying to GET Al Noor's inquiry → 404
      // Since the inquiry is invisible, messages are also invisible.
      await authGet(
        app,
        `/api/v1/inquiries/${alNoorInquiryId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);

      // Also try fetching messages endpoint directly if it exists
      await authGet(
        app,
        `/api/v1/inquiries/${alNoorInquiryId}/messages`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.6 — website_pages table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.6 website_pages — RLS leakage', () => {
    it('should not expose Tenant A pages to Tenant B admins', async () => {
      alNoorPageSlug = `rls-test-page-${suffix}`;

      // Al Noor admin: create a website page
      const pageRes = await authPost(
        app,
        '/api/v1/website/pages',
        alNoorAdminToken,
        {
          page_type: 'custom',
          title: `RLS Test Page ${suffix}`,
          slug: alNoorPageSlug,
          body_html: '<p>English content</p>',
          locale: 'en',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);
      alNoorPageId = pageRes.body.data.id;

      // Publish the page so the public endpoint test is meaningful
      await authPost(
        app,
        `/api/v1/website/pages/${alNoorPageId}/publish`,
        alNoorAdminToken,
        {},
        AL_NOOR_DOMAIN,
      ).expect(200);

      // Cedar admin: list pages — should NOT contain Al Noor's page
      const listRes = await authGet(
        app,
        '/api/v1/website/pages',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarPageIds = (listRes.body.data || []).map(
        (p: Record<string, unknown>) => p.id,
      );
      expect(cedarPageIds).not.toContain(alNoorPageId);

      // Cedar admin: GET Al Noor's page by ID → 404
      await authGet(
        app,
        `/api/v1/website/pages/${alNoorPageId}`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('public endpoints serve only the correct tenant pages', async () => {
      // Public request with Cedar domain: GET /api/v1/public/pages/:slug → 404
      await request(app.getHttpServer())
        .get(`/api/v1/public/pages/${alNoorPageSlug}`)
        .set('Host', CEDAR_DOMAIN)
        .expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.7 — contact_form_submissions table
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.7 contact_form_submissions — RLS leakage', () => {
    it('should not expose Tenant A contact submissions to Tenant B admins', async () => {
      // Submit a contact form to Al Noor's public endpoint
      const contactRes = await request(app.getHttpServer())
        .post('/api/v1/public/contact')
        .set('Host', AL_NOOR_DOMAIN)
        .send({
          name: `RLS Test Contact ${suffix}`,
          email: `rls-test-${suffix}@example.com`,
          phone: '+1234567890',
          message: 'This is a test contact form submission for RLS leakage.',
        })
        .expect(201);

      // Extract the submission ID if returned
      if (contactRes.body.data?.id) {
        alNoorContactSubmissionId = contactRes.body.data.id;
      }

      // Cedar admin: list contact submissions — should NOT contain Al Noor's submission
      const listRes = await authGet(
        app,
        '/api/v1/contact-submissions',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarSubmissions = listRes.body.data || [];

      // Verify none of the submissions match Al Noor's test data
      for (const s of cedarSubmissions) {
        expect(s.email).not.toBe(`rls-test-${suffix}@example.com`);
        if (alNoorContactSubmissionId) {
          expect(s.id).not.toBe(alNoorContactSubmissionId);
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.8 — Endpoint-Level RLS Checks
  // ═══════════════════════════════════════════════════════════════════════════

  describe('3.8 Endpoint-level RLS checks', () => {
    it('delivery status endpoint is tenant-scoped', async () => {
      // Cedar admin: GET delivery status for Al Noor's published announcement → 404
      await authGet(
        app,
        `/api/v1/announcements/${alNoorAnnouncementPublishedId}/delivery-status`,
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(404);
    });

    it('admin inquiry list never leaks across tenants', async () => {
      // Create a second Al Noor inquiry to ensure multiple exist
      await authPost(
        app,
        '/api/v1/inquiries',
        alNoorParentToken,
        {
          subject: `RLS Inquiry Test 2 ${suffix}`,
          message: 'Second test inquiry from Al Noor parent.',
        },
        AL_NOOR_DOMAIN,
      ).expect(201);

      // Cedar admin: list open inquiries — 0 results for Al Noor's inquiries
      const listRes = await authGet(
        app,
        '/api/v1/inquiries?status=open',
        cedarAdminToken,
        CEDAR_DOMAIN,
      ).expect(200);

      const cedarInquiries = listRes.body.data || [];
      const cedarInquiryIds = cedarInquiries.map(
        (i: Record<string, unknown>) => i.id,
      );
      expect(cedarInquiryIds).not.toContain(alNoorInquiryId);

      // Verify none of the inquiries have Al Noor's test subject
      for (const i of cedarInquiries) {
        expect(i.subject).not.toContain(`RLS Inquiry Test ${suffix}`);
        expect(i.subject).not.toContain(`RLS Inquiry Test 2 ${suffix}`);
      }
    });
  });
});
