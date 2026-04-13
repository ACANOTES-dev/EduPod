import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

/**
 * Seeds platform-level notification templates for the admissions module.
 *
 * Runs once at worker startup and idempotently ensures English + Arabic
 * email templates exist for admissions notification keys. Tenants who want
 * to override the wording per school can write their own tenant-scoped row
 * -- `resolveTemplate` checks tenant-level first and only falls back to
 * these platform-level rows.
 *
 * ADM-028: adds `admissions_application_received` template with per-student status.
 * ADM-041: adds `admissions_application_withdrawn` template.
 */

interface TemplateSeed {
  template_key: string;
  channel: NotificationChannel;
  locale: string;
  subject_template: string | null;
  body_template: string;
}

const TEMPLATE_SEEDS: TemplateSeed[] = [
  // ─── Application Received (ADM-028) ────────────────────────────────────
  // Uses {{#each students}} to list per-student status for sibling batches.
  // Single-application submissions pass a one-element array.
  {
    template_key: 'admissions_application_received',
    channel: 'email',
    locale: 'en',
    subject_template: 'Application Received — {{school_name}}',
    body_template:
      '<p>Dear Parent,</p>' +
      '<p>Thank you for submitting your application to <strong>{{school_name}}</strong>. ' +
      'We have received the following:</p>' +
      '<ul>{{#each students}}<li><strong>{{this.name}}</strong> — {{this.status}}</li>{{/each}}</ul>' +
      '<p>You can track the progress of your application(s) by logging into your parent portal.</p>' +
      '<p>Thank you,<br/>{{school_name}}</p>',
  },
  {
    template_key: 'admissions_application_received',
    channel: 'email',
    locale: 'ar',
    subject_template:
      '\u062a\u0645 \u0627\u0633\u062a\u0644\u0627\u0645 \u0627\u0644\u0637\u0644\u0628 \u2014 {{school_name}}',
    body_template:
      '<p>\u0639\u0632\u064a\u0632\u064a \u0648\u0644\u064a \u0627\u0644\u0623\u0645\u0631\u060c</p>' +
      '<p>\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0642\u062f\u064a\u0645 \u0637\u0644\u0628\u0643\u0645 \u0625\u0644\u0649 <strong>{{school_name}}</strong>. ' +
      '\u0644\u0642\u062f \u0627\u0633\u062a\u0644\u0645\u0646\u0627 \u0645\u0627 \u064a\u0644\u064a:</p>' +
      '<ul>{{#each students}}<li><strong>{{this.name}}</strong> \u2014 {{this.status}}</li>{{/each}}</ul>' +
      '<p>\u064a\u0645\u0643\u0646\u0643\u0645 \u0645\u062a\u0627\u0628\u0639\u0629 \u062a\u0642\u062f\u0645 \u0637\u0644\u0628\u0643\u0645 \u0645\u0646 \u062e\u0644\u0627\u0644 \u0628\u0648\u0627\u0628\u0629 \u0648\u0644\u064a \u0627\u0644\u0623\u0645\u0631.</p>' +
      '<p>\u0634\u0643\u0631\u0627\u064b \u0644\u0643\u0645\u060c<br/>{{school_name}}</p>',
  },
  // ─── Application Withdrawn (ADM-041) ────────────────────────────────────
  {
    template_key: 'admissions_application_withdrawn',
    channel: 'email',
    locale: 'en',
    subject_template: 'Application Withdrawn \u2014 {{student_name}}',
    body_template:
      '<p>Dear Parent,</p>' +
      '<p>This is to confirm that the application for <strong>{{student_name}}</strong> ' +
      '(Application No. <strong>{{application_number}}</strong>) at <strong>{{school_name}}</strong> ' +
      'has been withdrawn.</p>' +
      '<p>If you did not initiate this withdrawal or believe it was made in error, ' +
      'please contact the school admissions office.</p>' +
      '<p>Thank you,<br/>{{school_name}}</p>',
  },
  {
    template_key: 'admissions_application_withdrawn',
    channel: 'email',
    locale: 'ar',
    subject_template: '\u0633\u062d\u0628 \u0627\u0644\u0637\u0644\u0628 \u2014 {{student_name}}',
    body_template:
      '<p>\u0639\u0632\u064a\u0632\u064a \u0648\u0644\u064a \u0627\u0644\u0623\u0645\u0631\u060c</p>' +
      '<p>\u0646\u0624\u0643\u062f \u0644\u0643\u0645 \u0623\u0646 \u0637\u0644\u0628 \u0627\u0644\u0642\u0628\u0648\u0644 \u0627\u0644\u062e\u0627\u0635 \u0628\u0640 <strong>{{student_name}}</strong> ' +
      '(\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: <strong>{{application_number}}</strong>) \u0641\u064a <strong>{{school_name}}</strong> ' +
      '\u0642\u062f \u062a\u0645 \u0633\u062d\u0628\u0647.</p>' +
      '<p>\u0625\u0630\u0627 \u0644\u0645 \u062a\u0642\u0645 \u0628\u0647\u0630\u0627 \u0627\u0644\u0633\u062d\u0628 \u0623\u0648 \u062a\u0639\u062a\u0642\u062f \u0623\u0646\u0647 \u062a\u0645 \u0628\u0627\u0644\u062e\u0637\u0623\u060c ' +
      '\u064a\u0631\u062c\u0649 \u0627\u0644\u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u0643\u062a\u0628 \u0627\u0644\u0642\u0628\u0648\u0644 \u0641\u064a \u0627\u0644\u0645\u062f\u0631\u0633\u0629.</p>' +
      '<p>\u0634\u0643\u0631\u0627\u064b \u0644\u0643\u0645\u060c<br/>{{school_name}}</p>',
  },
];

@Injectable()
export class AdmissionsTemplatesInit implements OnModuleInit {
  private readonly logger = new Logger(AdmissionsTemplatesInit.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async onModuleInit(): Promise<void> {
    let created = 0;
    await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${SYSTEM_USER_SENTINEL}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', ${SYSTEM_USER_SENTINEL}::text, true)`;

        for (const seed of TEMPLATE_SEEDS) {
          const existing = await tx.notificationTemplate.findFirst({
            where: {
              tenant_id: null,
              template_key: seed.template_key,
              channel: seed.channel,
              locale: seed.locale,
            },
            select: { id: true },
          });

          if (existing) continue;

          await tx.notificationTemplate.create({
            data: {
              tenant_id: null,
              template_key: seed.template_key,
              channel: seed.channel,
              locale: seed.locale,
              subject_template: seed.subject_template,
              body_template: seed.body_template,
              is_system: true,
            },
          });
          created += 1;
        }
      },
      { maxWait: 10_000, timeout: 30_000 },
    );

    if (created > 0) {
      this.logger.log(
        `Admissions notification templates ensured \u2014 created ${created} new platform-level row(s).`,
      );
    } else {
      this.logger.debug('Admissions notification templates already present \u2014 skipping seed.');
    }
  }
}
