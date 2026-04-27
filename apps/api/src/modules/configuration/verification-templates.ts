/**
 * Sentinel verification messages used by the test-send endpoints.
 *
 * These are immutable per-deploy code constants, NOT `notification_template`
 * rows. Channel-specific, never edited by tenants, never variable-interpolated.
 * Putting them in the DB would be ceremony with no benefit.
 *
 * If the messaging changes, that change ships through code review +
 * deploy — which is the correct cadence for "is the integration working"
 * copy. The locale resolver upstream collapses every locale except `'ar'`
 * to English (matching the platform's English-fallback convention).
 */

export interface EmailVerificationTemplate {
  subject: string;
  /** HTML body. Plain prose only — no images, no tracking pixels, no variables. */
  html: string;
}

export interface SmsVerificationTemplate {
  body: string;
}

export const VERIFICATION_EMAIL_TEMPLATES: Record<'en' | 'ar', EmailVerificationTemplate> = {
  en: {
    subject: 'EduPod credential verification',
    html:
      '<p>If you can read this, your school&rsquo;s email integration is working.</p>' +
      '<p>&mdash; EduPod</p>',
  },
  ar: {
    subject: 'التحقق من بيانات الاعتماد - EduPod',
    html:
      '<p>إذا كنت تقرأ هذه الرسالة، فإن تكامل البريد الإلكتروني لمدرستك يعمل بشكل صحيح.</p>' +
      '<p>&mdash; EduPod</p>',
  },
};

export const VERIFICATION_SMS_TEMPLATES: Record<'en' | 'ar', SmsVerificationTemplate> = {
  en: {
    body: "EduPod SMS verification — your school's SMS is wired up correctly. Reply STOP to opt out.",
  },
  ar: {
    body: 'التحقق من الرسائل النصية - EduPod. إعداد الرسائل النصية لمدرستك صحيح. أرسل STOP لإلغاء الاشتراك.',
  },
};
