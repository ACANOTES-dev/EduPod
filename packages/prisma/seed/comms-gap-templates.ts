/**
 * Notification templates for the Communications Overhaul gap closure (Impl 12).
 *
 * Eight new template_keys: auth.password_reset, auth.password_changed,
 * trip.invitation, trip.payment_due, school.closure, staff.leave_decision,
 * health.incident, sen.eha_update.
 *
 * All seeded with tenant_id = NULL (system defaults). Tenants can override
 * per the existing template-resolution chain.
 */

export type Locale = 'en' | 'ar';
export type Channel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export interface NotificationTemplateSeed {
  channel: Channel;
  template_key: string;
  locale: Locale;
  subject_template: string | null;
  body_template: string;
}

interface TemplateDef {
  key: string;
  en: { subject: string | null; body: string };
  ar: { subject: string | null; body: string };
}

const TEMPLATES: TemplateDef[] = [
  // ─── Auth ─────────────────────────────────────────────────────────────────
  {
    key: 'auth.password_reset',
    en: {
      subject: 'Password reset request',
      body: 'We received a request to reset your password. Click the link below to set a new password (valid for {{expiry_minutes}} minutes):\n\n{{reset_url}}\n\nIf you did not request this, you can safely ignore this email — no changes have been made to your account.',
    },
    ar: {
      subject: 'طلب إعادة تعيين كلمة المرور',
      body: 'تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك. انقر على الرابط أدناه لتعيين كلمة مرور جديدة (صالح لمدة {{expiry_minutes}} دقيقة):\n\n{{reset_url}}\n\nإذا لم تطلب هذا، يمكنك تجاهل هذا البريد الإلكتروني — لم يتم إجراء أي تغييرات على حسابك.',
    },
  },
  {
    key: 'auth.password_changed',
    en: {
      subject: 'Your password was changed',
      body: 'This is a confirmation that your password was changed at {{changed_at}}. If you did not make this change, please contact your school administrator immediately.',
    },
    ar: {
      subject: 'تم تغيير كلمة المرور الخاصة بك',
      body: 'هذا تأكيد بأن كلمة المرور الخاصة بك قد تم تغييرها في {{changed_at}}. إذا لم تقم بهذا التغيير، يرجى الاتصال بمسؤول المدرسة فوراً.',
    },
  },

  // ─── Trips (templates seeded; wiring deferred) ─────────────────────────────
  {
    key: 'trip.invitation',
    en: {
      subject: 'Trip invitation: {{trip_name}}',
      body: '{{student_first_name}} is invited to {{trip_name}} on {{trip_date}}. Cost: {{trip_cost}} {{currency_code}}. Please confirm participation by {{rsvp_deadline}}.',
    },
    ar: {
      subject: 'دعوة لرحلة: {{trip_name}}',
      body: '{{student_first_name}} مدعو إلى {{trip_name}} في {{trip_date}}. التكلفة: {{trip_cost}} {{currency_code}}. يرجى تأكيد المشاركة قبل {{rsvp_deadline}}.',
    },
  },
  {
    key: 'trip.payment_due',
    en: {
      subject: 'Trip payment due: {{trip_name}}',
      body: "Payment of {{amount_due}} {{currency_code}} for {{student_first_name}}'s {{trip_name}} is due by {{due_date}}.",
    },
    ar: {
      subject: 'دفعة الرحلة مستحقة: {{trip_name}}',
      body: 'دفعة بقيمة {{amount_due}} {{currency_code}} لرحلة {{student_first_name}} ({{trip_name}}) مستحقة قبل {{due_date}}.',
    },
  },

  // ─── School closures ──────────────────────────────────────────────────────
  {
    key: 'school.closure',
    en: {
      subject: 'School closure: {{title}}',
      body: 'The school will be closed on {{closure_date}}. Reason: {{reason}}. Please plan accordingly.',
    },
    ar: {
      subject: 'إغلاق المدرسة: {{title}}',
      body: 'ستكون المدرسة مغلقة في {{closure_date}}. السبب: {{reason}}. يرجى التخطيط وفقاً لذلك.',
    },
  },

  // ─── Staff leave ──────────────────────────────────────────────────────────
  {
    key: 'staff.leave_decision',
    en: {
      subject: 'Leave request {{decision}}',
      body: 'Your leave request from {{date_from}} to {{date_to}} has been {{decision}}.{{#if review_notes}} Notes: {{review_notes}}{{/if}}',
    },
    ar: {
      subject: 'طلب الإجازة {{decision}}',
      body: 'تم {{decision}} طلب إجازتك من {{date_from}} إلى {{date_to}}.{{#if review_notes}} الملاحظات: {{review_notes}}{{/if}}',
    },
  },

  // ─── Health incidents (templates seeded; wiring deferred) ─────────────────
  {
    key: 'health.incident',
    en: {
      subject: 'Health update for {{student_first_name}}',
      body: 'A health incident was logged for {{student_first_name}} at {{incident_time}}: {{summary}}. Please contact the school for more information.',
    },
    ar: {
      subject: 'تحديث صحي لـ {{student_first_name}}',
      body: 'تم تسجيل حادث صحي لـ {{student_first_name}} في {{incident_time}}: {{summary}}. يرجى الاتصال بالمدرسة للحصول على مزيد من المعلومات.',
    },
  },

  // ─── SEN EHA updates ──────────────────────────────────────────────────────
  {
    key: 'sen.eha_update',
    en: {
      subject: 'SEN plan update for {{student_first_name}}',
      body: '{{student_first_name}}\'s SEN support plan status has been updated to "{{status}}" on {{updated_at}}. View the latest plan details by logging in.',
    },
    ar: {
      subject: 'تحديث خطة الاحتياجات الخاصة لـ {{student_first_name}}',
      body: 'تم تحديث حالة خطة دعم الاحتياجات الخاصة لـ {{student_first_name}} إلى "{{status}}" في {{updated_at}}. اعرض أحدث تفاصيل الخطة عن طريق تسجيل الدخول.',
    },
  },
];

const CHANNELS: Channel[] = ['in_app', 'email', 'sms', 'whatsapp'];

export const COMMS_GAP_TEMPLATE_SEEDS: NotificationTemplateSeed[] = TEMPLATES.flatMap((tpl) => {
  const rows: NotificationTemplateSeed[] = [];
  for (const channel of CHANNELS) {
    const subjectEn = channel === 'in_app' || channel === 'email' ? tpl.en.subject : null;
    const subjectAr = channel === 'in_app' || channel === 'email' ? tpl.ar.subject : null;
    rows.push({
      channel,
      template_key: tpl.key,
      locale: 'en',
      subject_template: subjectEn,
      body_template: tpl.en.body,
    });
    rows.push({
      channel,
      template_key: tpl.key,
      locale: 'ar',
      subject_template: subjectAr,
      body_template: tpl.ar.body,
    });
  }
  return rows;
});
