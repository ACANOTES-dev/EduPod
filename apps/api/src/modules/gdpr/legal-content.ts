import { createHash } from 'crypto';

export interface PlatformDpaVersionSeed {
  version: string;
  content_html: string;
  content_hash: string;
  effective_date: Date;
}

export interface PlatformSubProcessorEntrySeed {
  name: string;
  purpose: string;
  data_categories: string;
  location: string;
  transfer_mechanism: string;
  display_order: number;
  is_planned?: boolean;
  notes?: string;
}

export interface PlatformSubProcessorVersionSeed {
  version: string;
  change_summary: string;
  published_at: Date;
  objection_deadline?: Date;
  entries: PlatformSubProcessorEntrySeed[];
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

const PLATFORM_DPA_HTML = `
<section>
  <h1>EduPod Data Processing Agreement</h1>
  <p>This Data Processing Agreement governs EduPod's processing of personal data on behalf of the school as controller.</p>
  <h2>1. Scope of processing</h2>
  <p>EduPod processes student, parent, staff, finance, attendance, safeguarding, timetable, assessment, communications, admissions, payroll, and operational metadata across the platform's modules solely to provide the contracted school operating system.</p>
  <h2>2. Controller instructions</h2>
  <p>EduPod acts only on documented instructions from the controller, except where Union or Irish law requires processing.</p>
  <h2>3. Confidentiality and security</h2>
  <p>EduPod applies role-based access control, encrypted transport, audit logging, tenant isolation through PostgreSQL row-level security, and a tokenisation gateway for supported AI processing flows.</p>
  <h2>4. Sub-processors</h2>
  <p>EduPod maintains a versioned sub-processor register, gives tenant administrators notice of material additions, and supports a 30-day objection period for newly added sub-processors.</p>
  <h2>5. International transfers</h2>
  <p>Where data is transferred outside the EEA, EduPod relies on applicable transfer mechanisms including Standard Contractual Clauses and Data Privacy Framework participation where relevant.</p>
  <h2>6. Assistance obligations</h2>
  <p>EduPod assists the controller with data subject access requests, rectification, erasure, restriction, portability, objection handling, DPIAs, and regulator engagement where processor assistance is required.</p>
  <h2>7. Personal data breaches</h2>
  <p>EduPod will notify the controller without undue delay and in any event within 24 hours of confirming a personal data breach affecting controller data.</p>
  <h2>8. Audits</h2>
  <p>EduPod will provide reasonable information necessary to demonstrate compliance and support controller audits subject to confidentiality, security, and proportionality controls.</p>
  <h2>9. Return and deletion</h2>
  <p>On termination, EduPod will return controller data or securely delete it in line with the controller's instructions and applicable retention obligations.</p>
  <h2>10. Term</h2>
  <p>This agreement applies for as long as EduPod processes controller personal data.</p>
</section>
`.trim();

export const PLATFORM_DPA_VERSIONS: PlatformDpaVersionSeed[] = [
  {
    version: '2026.03',
    content_html: PLATFORM_DPA_HTML,
    content_hash: sha256(PLATFORM_DPA_HTML),
    effective_date: new Date('2026-03-27'),
  },
];

export const PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS: PlatformSubProcessorVersionSeed[] = [
  {
    version: '2026.03',
    change_summary: 'Initial public sub-processor register reflecting tokenised AI processing and current infrastructure vendors.',
    published_at: new Date('2026-03-27T00:00:00.000Z'),
    objection_deadline: new Date('2026-04-26'),
    entries: [
      {
        name: 'Hetzner',
        purpose: 'VPS hosting',
        data_categories: 'All categories',
        location: 'Germany (EU)',
        transfer_mechanism: 'None needed',
        display_order: 1,
      },
      {
        name: 'Anthropic',
        purpose: 'AI processing',
        data_categories: 'Tokenised only — no identifiable student data',
        location: 'United States',
        transfer_mechanism: 'SCCs + DPF + DPIA',
        display_order: 2,
      },
      {
        name: 'Stripe',
        purpose: 'Payments',
        data_categories: 'Household IDs, amounts (no names)',
        location: 'United States / EU',
        transfer_mechanism: 'Stripe DPA',
        display_order: 3,
      },
      {
        name: 'Sentry',
        purpose: 'Error monitoring',
        data_categories: 'IP, error context (auth scrubbed)',
        location: 'United States',
        transfer_mechanism: 'SCCs + DPF',
        display_order: 4,
      },
      {
        name: 'Cloudflare',
        purpose: 'CDN, SSL, WAF',
        data_categories: 'Request metadata, IPs',
        location: 'Global',
        transfer_mechanism: 'Cloudflare DPA',
        display_order: 5,
      },
      {
        name: 'AWS S3',
        purpose: 'File storage',
        data_categories: 'Import files, payslips, exports',
        location: 'EU (eu-west-1)',
        transfer_mechanism: 'None needed',
        display_order: 6,
      },
      {
        name: 'Meilisearch',
        purpose: 'Search',
        data_categories: 'Names, emails, student numbers',
        location: 'Self-hosted',
        transfer_mechanism: 'None needed',
        display_order: 7,
      },
      {
        name: 'Resend',
        purpose: 'Email delivery',
        data_categories: 'Email, names, message content',
        location: 'United States',
        transfer_mechanism: 'SCCs + DPF',
        display_order: 8,
        is_planned: true,
      },
      {
        name: 'Twilio',
        purpose: 'WhatsApp',
        data_categories: 'Phone numbers, message content',
        location: 'United States',
        transfer_mechanism: 'SCCs + DPF',
        display_order: 9,
        is_planned: true,
      },
    ],
  },
];

export function buildPrivacyNoticeTemplate(options: {
  tenantName: string;
  supportEmail: string;
  locale: 'en' | 'ar';
}) {
  if (options.locale === 'ar') {
    return `
<section dir="rtl">
  <h1>إشعار الخصوصية الخاص بـ ${options.tenantName}</h1>
  <p>يوضح هذا الإشعار كيف تستخدم المدرسة منصة EduPod لمعالجة بيانات الطلاب وأولياء الأمور والموظفين والبيانات المالية والتشغيلية.</p>
  <h2>ما البيانات التي نعالجها</h2>
  <p>نقوم بمعالجة بيانات الهوية والاتصال والسجلات الأكاديمية والحضور والدفع والمراسلات وسجلات الرعاية والبيانات التشغيلية اللازمة لتشغيل المدرسة.</p>
  <h2>الأساس القانوني</h2>
  <p>تتم المعالجة على أساس تنفيذ الالتزامات التعليمية والإدارية، والالتزامات القانونية، والمصلحة المشروعة، والموافقة عندما يكون ذلك مناسباً.</p>
  <h2>المعالجة بالذكاء الاصطناعي</h2>
  <p>عندما تستخدم أدوات الذكاء الاصطناعي المدعومة، تطبق EduPod بوابة ترميز لإرسال بيانات مميزة برموز بدلاً من البيانات القابلة للتحديد حيثما كان ذلك مدعوماً.</p>
  <h2>الاحتفاظ والنقل الدولي</h2>
  <p>نحتفظ بالبيانات وفق متطلبات المدرسة والالتزامات القانونية ونستخدم آليات نقل مناسبة عندما توجد خدمات فرعية خارج المنطقة الاقتصادية الأوروبية.</p>
  <h2>حقوقك</h2>
  <p>يمكنك طلب الوصول أو التصحيح أو التقييد أو الاعتراض أو المحو وفقاً للقانون المعمول به من خلال التواصل مع ${options.supportEmail}.</p>
</section>
`.trim();
  }

  return `
<section>
  <h1>${options.tenantName} Privacy Notice</h1>
  <p>This notice explains how the school uses EduPod to process student, parent, staff, finance, and operational data.</p>
  <h2>What we process</h2>
  <p>We process identity, contact, academic, attendance, payment, communications, safeguarding, and operational records needed to run the school.</p>
  <h2>Lawful bases</h2>
  <p>Processing is carried out under educational and administrative necessity, legal obligation, legitimate interests, and consent where required.</p>
  <h2>AI processing</h2>
  <p>Where AI-supported features are used, EduPod applies a tokenisation gateway so supported AI providers receive tokenised data instead of directly identifiable student information.</p>
  <h2>Retention and transfers</h2>
  <p>Data is retained according to school requirements and legal obligations, and appropriate transfer safeguards are used where sub-processors operate outside the EEA.</p>
  <h2>Your rights</h2>
  <p>You can request access, rectification, restriction, objection, or erasure as allowed by law by contacting ${options.supportEmail}.</p>
</section>
`.trim();
}
