-- Migrate system notification templates from raw Handlebars strings to
-- t:-prefixed catalogue references. Tenant overrides are intentionally untouched.

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_admin_notice.email.subject' END,
    body_template = 't:absence_admin_notice.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.admin_notice'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_admin_notice.in_app.subject' END,
    body_template = 't:absence_admin_notice.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.admin_notice'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_admin_notice.sms.subject' END,
    body_template = 't:absence_admin_notice.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.admin_notice'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_admin_notice.whatsapp.subject' END,
    body_template = 't:absence_admin_notice.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.admin_notice'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_cancelled.email.subject' END,
    body_template = 't:absence_cancelled.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.cancelled'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_cancelled.in_app.subject' END,
    body_template = 't:absence_cancelled.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.cancelled'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_cancelled.sms.subject' END,
    body_template = 't:absence_cancelled.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.cancelled'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_cancelled.whatsapp.subject' END,
    body_template = 't:absence_cancelled.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.cancelled'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_self_reported_confirmation.email.subject' END,
    body_template = 't:absence_self_reported_confirmation.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.self_reported_confirmation'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_self_reported_confirmation.in_app.subject' END,
    body_template = 't:absence_self_reported_confirmation.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.self_reported_confirmation'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_self_reported_confirmation.sms.subject' END,
    body_template = 't:absence_self_reported_confirmation.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.self_reported_confirmation'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:absence_self_reported_confirmation.whatsapp.subject' END,
    body_template = 't:absence_self_reported_confirmation.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'absence.self_reported_confirmation'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:admissions_application_received.email.subject' END,
    body_template = 't:admissions_application_received.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'admissions_application_received'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:admissions_application_withdrawn.email.subject' END,
    body_template = 't:admissions_application_withdrawn.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'admissions_application_withdrawn'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:announcement_published.email.subject' END,
    body_template = 't:announcement_published.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'announcement.published'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:announcement_published.in_app.subject' END,
    body_template = 't:announcement_published.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'announcement.published'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:approval_decided.email.subject' END,
    body_template = 't:approval_decided.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'approval.decided'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:approval_decided.in_app.subject' END,
    body_template = 't:approval_decided.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'approval.decided'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:approval_requested.email.subject' END,
    body_template = 't:approval_requested.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'approval.requested'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:approval_requested.in_app.subject' END,
    body_template = 't:approval_requested.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'approval.requested'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:inbox_message_fallback.email.subject' END,
    body_template = 't:inbox_message_fallback.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'inbox_message_fallback'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:inbox_message_fallback.sms.subject' END,
    body_template = 't:inbox_message_fallback.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'inbox_message_fallback'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:inbox_message_fallback.whatsapp.subject' END,
    body_template = 't:inbox_message_fallback.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'inbox_message_fallback'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:inquiry_new_message.email.subject' END,
    body_template = 't:inquiry_new_message.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'inquiry.new_message'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:inquiry_new_message.in_app.subject' END,
    body_template = 't:inquiry_new_message.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'inquiry.new_message'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_approved.email.subject' END,
    body_template = 't:leave_request_approved.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_approved'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_approved.in_app.subject' END,
    body_template = 't:leave_request_approved.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_approved'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_approved.sms.subject' END,
    body_template = 't:leave_request_approved.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_approved'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_approved.whatsapp.subject' END,
    body_template = 't:leave_request_approved.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_approved'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_rejected.email.subject' END,
    body_template = 't:leave_request_rejected.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_rejected'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_rejected.in_app.subject' END,
    body_template = 't:leave_request_rejected.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_rejected'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_rejected.sms.subject' END,
    body_template = 't:leave_request_rejected.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_rejected'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_rejected.whatsapp.subject' END,
    body_template = 't:leave_request_rejected.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_rejected'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_submitted.email.subject' END,
    body_template = 't:leave_request_submitted.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_submitted'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_submitted.in_app.subject' END,
    body_template = 't:leave_request_submitted.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_submitted'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_submitted.sms.subject' END,
    body_template = 't:leave_request_submitted.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_submitted'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:leave_request_submitted.whatsapp.subject' END,
    body_template = 't:leave_request_submitted.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'leave.request_submitted'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_accepted.email.subject' END,
    body_template = 't:substitution_accepted.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.accepted'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_accepted.in_app.subject' END,
    body_template = 't:substitution_accepted.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.accepted'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_accepted.sms.subject' END,
    body_template = 't:substitution_accepted.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.accepted'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_accepted.whatsapp.subject' END,
    body_template = 't:substitution_accepted.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.accepted'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_admin_offer_dispatched.email.subject' END,
    body_template = 't:substitution_admin_offer_dispatched.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.admin_offer_dispatched'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_admin_offer_dispatched.in_app.subject' END,
    body_template = 't:substitution_admin_offer_dispatched.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.admin_offer_dispatched'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_admin_offer_dispatched.sms.subject' END,
    body_template = 't:substitution_admin_offer_dispatched.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.admin_offer_dispatched'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_admin_offer_dispatched.whatsapp.subject' END,
    body_template = 't:substitution_admin_offer_dispatched.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.admin_offer_dispatched'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_cascade_exhausted.email.subject' END,
    body_template = 't:substitution_cascade_exhausted.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.cascade_exhausted'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_cascade_exhausted.in_app.subject' END,
    body_template = 't:substitution_cascade_exhausted.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.cascade_exhausted'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_cascade_exhausted.sms.subject' END,
    body_template = 't:substitution_cascade_exhausted.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.cascade_exhausted'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_cascade_exhausted.whatsapp.subject' END,
    body_template = 't:substitution_cascade_exhausted.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.cascade_exhausted'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_declined.email.subject' END,
    body_template = 't:substitution_declined.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.declined'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_declined.in_app.subject' END,
    body_template = 't:substitution_declined.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.declined'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_declined.sms.subject' END,
    body_template = 't:substitution_declined.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.declined'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_declined.whatsapp.subject' END,
    body_template = 't:substitution_declined.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.declined'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_nominated_rejected.email.subject' END,
    body_template = 't:substitution_nominated_rejected.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.nominated_rejected'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_nominated_rejected.in_app.subject' END,
    body_template = 't:substitution_nominated_rejected.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.nominated_rejected'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_nominated_rejected.sms.subject' END,
    body_template = 't:substitution_nominated_rejected.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.nominated_rejected'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_nominated_rejected.whatsapp.subject' END,
    body_template = 't:substitution_nominated_rejected.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.nominated_rejected'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_nominated.email.subject' END,
    body_template = 't:substitution_offer_nominated.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_nominated'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_nominated.in_app.subject' END,
    body_template = 't:substitution_offer_nominated.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_nominated'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_nominated.sms.subject' END,
    body_template = 't:substitution_offer_nominated.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_nominated'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_nominated.whatsapp.subject' END,
    body_template = 't:substitution_offer_nominated.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_nominated'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_received.email.subject' END,
    body_template = 't:substitution_offer_received.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_received'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_received.in_app.subject' END,
    body_template = 't:substitution_offer_received.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_received'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_received.sms.subject' END,
    body_template = 't:substitution_offer_received.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_received'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_received.whatsapp.subject' END,
    body_template = 't:substitution_offer_received.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_received'
  AND channel = 'whatsapp';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_revoked.email.subject' END,
    body_template = 't:substitution_offer_revoked.email.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_revoked'
  AND channel = 'email';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_revoked.in_app.subject' END,
    body_template = 't:substitution_offer_revoked.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_revoked'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_revoked.sms.subject' END,
    body_template = 't:substitution_offer_revoked.sms.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_revoked'
  AND channel = 'sms';

UPDATE notification_templates
SET subject_template = CASE WHEN subject_template IS NULL THEN NULL ELSE 't:substitution_offer_revoked.whatsapp.subject' END,
    body_template = 't:substitution_offer_revoked.whatsapp.body'
WHERE tenant_id IS NULL
  AND template_key = 'substitution.offer_revoked'
  AND channel = 'whatsapp';

