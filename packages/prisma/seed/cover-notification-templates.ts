/**
 * Default notification templates for the leave-and-cover system.
 *
 * All rows seeded with tenant_id = NULL (system defaults). Tenants can
 * override by inserting their own row with the same (channel, template_key,
 * locale) and tenant_id = their_id; dispatch prefers tenant rows when present.
 *
 * Channels: in_app + email seeded for all templates. SMS + WhatsApp are
 * opt-in per tenant_scheduling_settings; we seed them too so the dispatcher
 * has something to render if a tenant enables those channels.
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

// ─── Template body generator ────────────────────────────────────────────────

interface TemplateDef {
  key: string;
  en: { subject: string | null; body: string };
  ar: { subject: string | null; body: string };
}

const TEMPLATES: TemplateDef[] = [
  {
    key: 'absence.self_reported_confirmation',
    en: {
      subject: 'Absence reported',
      body: "Your absence from {{date_from}}{{#if date_to}} to {{date_to}}{{/if}} has been logged. {{#if nominated_substitute}}We've offered the cover to {{nominated_substitute}}.{{else}}We're finding cover now.{{/if}}",
    },
    ar: {
      subject: 'تم تسجيل الغياب',
      body: 'تم تسجيل غيابك من {{date_from}}{{#if date_to}} إلى {{date_to}}{{/if}}. {{#if nominated_substitute}}تم عرض التغطية على {{nominated_substitute}}.{{else}}جاري إيجاد بديل الآن.{{/if}}',
    },
  },
  {
    key: 'absence.admin_notice',
    en: {
      subject: '{{reporter_name}} is absent',
      body: '{{reporter_name}} reported an absence from {{date_from}}{{#if date_to}} to {{date_to}}{{/if}}. {{#if nominated_substitute}}{{nominated_substitute}} has been offered direct cover.{{/if}}',
    },
    ar: {
      subject: '{{reporter_name}} غائب',
      body: 'أبلغ {{reporter_name}} عن غياب من {{date_from}}{{#if date_to}} إلى {{date_to}}{{/if}}. {{#if nominated_substitute}}تم عرض التغطية المباشرة على {{nominated_substitute}}.{{/if}}',
    },
  },
  {
    key: 'absence.cancelled',
    en: {
      subject: 'Absence cancelled',
      body: "{{reporter_name}}'s absence has been cancelled. Any assigned cover has been released.",
    },
    ar: {
      subject: 'تم إلغاء الغياب',
      body: 'تم إلغاء غياب {{reporter_name}}. تم إلغاء أي تغطية مخصصة.',
    },
  },
  {
    key: 'substitution.offer_received',
    en: {
      subject: 'Cover request: {{reporter_name}}',
      body: "You've been offered cover for {{reporter_name}}'s {{#if subject_name}}{{subject_name}} — {{/if}}{{class_name}} on {{absence_date}}. Please respond soon.",
    },
    ar: {
      subject: 'طلب تغطية: {{reporter_name}}',
      body: 'تم عرض تغطية حصة {{reporter_name}} لـ {{#if subject_name}}{{subject_name}} — {{/if}}{{class_name}} في {{absence_date}}. يرجى الرد قريباً.',
    },
  },
  {
    key: 'substitution.offer_nominated',
    en: {
      subject: '{{reporter_name}} has asked you to cover',
      body: '{{reporter_name}} nominated you to cover their {{#if subject_name}}{{subject_name}} — {{/if}}{{class_name}} on {{absence_date}}. Please accept or decline.',
    },
    ar: {
      subject: '{{reporter_name}} طلب منك التغطية',
      body: 'رشحك {{reporter_name}} لتغطية حصة {{#if subject_name}}{{subject_name}} — {{/if}}{{class_name}} في {{absence_date}}. يرجى القبول أو الرفض.',
    },
  },
  {
    key: 'substitution.admin_offer_dispatched',
    en: {
      subject: 'Cover offers sent',
      body: "{{offers_count}} cover offer(s) dispatched for {{reporter_name}}'s absence.",
    },
    ar: {
      subject: 'تم إرسال عروض التغطية',
      body: 'تم إرسال {{offers_count}} عرض تغطية لغياب {{reporter_name}}.',
    },
  },
  {
    key: 'substitution.accepted',
    en: {
      subject: 'Cover confirmed: {{substitute_name}}',
      body: '{{substitute_name}} has accepted cover for {{reporter_name}} on {{absence_date}}.',
    },
    ar: {
      subject: 'تم تأكيد التغطية: {{substitute_name}}',
      body: 'قبل {{substitute_name}} تغطية حصة {{reporter_name}} في {{absence_date}}.',
    },
  },
  {
    key: 'substitution.declined',
    en: {
      subject: 'Cover offer declined',
      body: '{{decliner_name}} declined a cover offer. If no siblings accept, the cascade will advance automatically.',
    },
    ar: {
      subject: 'تم رفض عرض التغطية',
      body: 'رفض {{decliner_name}} عرض التغطية. إذا لم يقبل أحد، سيتم الانتقال تلقائياً للجولة التالية.',
    },
  },
  {
    key: 'substitution.cascade_exhausted',
    en: {
      subject: 'Manual cover needed',
      body: 'All automatic cover offers for {{reporter_name}} have been declined or expired. Please assign cover manually.',
    },
    ar: {
      subject: 'التغطية اليدوية مطلوبة',
      body: 'تم رفض أو انتهاء صلاحية جميع عروض التغطية التلقائية لغياب {{reporter_name}}. يرجى تعيين بديل يدوياً.',
    },
  },
  {
    key: 'substitution.offer_revoked',
    en: {
      subject: 'Cover offer no longer needed',
      body: 'Your cover offer is no longer needed ({{reason}}). No action required.',
    },
    ar: {
      subject: 'عرض التغطية لم يعد مطلوباً',
      body: 'عرض التغطية الخاص بك لم يعد مطلوباً ({{reason}}). لا يلزم أي إجراء.',
    },
  },
  {
    key: 'substitution.nominated_rejected',
    en: {
      subject: 'Nominated cover declined',
      body: '{{decliner_name}} declined the nominated cover. Please assign someone manually — the cascade did not auto-advance.',
    },
    ar: {
      subject: 'تم رفض التغطية المرشحة',
      body: 'رفض {{decliner_name}} التغطية المرشحة. يرجى تعيين بديل يدوياً — لم يتم الانتقال تلقائياً.',
    },
  },
  {
    key: 'leave.request_submitted',
    en: {
      subject: 'Leave request: {{requester_name}}',
      body: '{{requester_name}} has submitted a {{leave_label}} request from {{date_from}} to {{date_to}}. Please review.',
    },
    ar: {
      subject: 'طلب إجازة: {{requester_name}}',
      body: 'قدم {{requester_name}} طلب {{leave_label}} من {{date_from}} إلى {{date_to}}. يرجى المراجعة.',
    },
  },
  {
    key: 'leave.request_approved',
    en: {
      subject: 'Leave approved',
      body: 'Your leave request has been approved by {{reviewer_name}}.{{#if review_notes}} Notes: {{review_notes}}{{/if}}',
    },
    ar: {
      subject: 'تمت الموافقة على الإجازة',
      body: 'تمت الموافقة على طلب الإجازة من قبل {{reviewer_name}}.{{#if review_notes}} الملاحظات: {{review_notes}}{{/if}}',
    },
  },
  {
    key: 'leave.request_rejected',
    en: {
      subject: 'Leave request rejected',
      body: 'Your leave request was rejected by {{reviewer_name}}.{{#if review_notes}} Notes: {{review_notes}}{{/if}}',
    },
    ar: {
      subject: 'تم رفض طلب الإجازة',
      body: 'تم رفض طلب الإجازة من قبل {{reviewer_name}}.{{#if review_notes}} الملاحظات: {{review_notes}}{{/if}}',
    },
  },
];

const CHANNELS: Channel[] = ['in_app', 'email', 'sms', 'whatsapp'];

export const COVER_NOTIFICATION_TEMPLATE_SEEDS: NotificationTemplateSeed[] = TEMPLATES.flatMap(
  (tpl) => {
    const rows: NotificationTemplateSeed[] = [];
    for (const channel of CHANNELS) {
      // SMS + WhatsApp strip subject and use body only.
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
  },
);
