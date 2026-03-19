import { Client } from 'pg';
import Redis from 'ioredis';

import { PrismaClient } from '@prisma/client';

import { PERMISSION_SEEDS } from './seed/permissions';
import { SYSTEM_ROLES } from './seed/system-roles';
import {
  DEV_TENANTS,
  DEV_PLATFORM_USER,
  DEV_USERS,
  hashPassword,
  DEV_PASSWORD,
} from './seed/dev-data';

/**
 * Seed script for the School Operating System.
 *
 * Execution order:
 *   1. Extensions (citext, btree_gist) via raw pg
 *   2. set_updated_at() trigger function via raw pg
 *   3. Global permissions via Prisma
 *   4. System roles (global, no tenant) via Prisma
 *   5. Dev tenants with all defaults via Prisma
 *   6. Dev users + memberships + role assignments via Prisma
 */

const MODULE_KEYS = [
  'admissions', 'attendance', 'gradebook', 'finance', 'payroll',
  'communications', 'website', 'analytics', 'compliance',
  'parent_inquiries', 'auto_scheduling',
];

const NOTIFICATION_TYPES = [
  'invoice.issued', 'payment.received', 'payment.failed',
  'report_card.published', 'attendance.exception', 'admission.status_change',
  'announcement.published', 'approval.requested', 'approval.decided',
  'inquiry.new_message', 'payroll.finalised', 'payslip.generated',
];

const SEQUENCE_TYPES = ['receipt', 'invoice', 'application', 'payslip'];

const DEFAULT_SETTINGS = {
  attendance: { allowTeacherAmendment: false, autoLockAfterDays: null, pendingAlertTimeHour: 14 },
  gradebook: { defaultMissingGradePolicy: 'exclude', requireGradeComment: false },
  admissions: { requireApprovalForAcceptance: true },
  finance: { requireApprovalForInvoiceIssue: false, defaultPaymentTermDays: 30, allowPartialPayment: true },
  communications: { primaryOutboundChannel: 'email', requireApprovalForAnnouncements: true },
  payroll: { requireApprovalForNonPrincipal: true, defaultBonusMultiplier: 1.0, autoPopulateClassCounts: true },
  general: { parentPortalEnabled: true, attendanceVisibleToParents: true, gradesVisibleToParents: true, inquiryStaleHours: 48 },
  scheduling: {
    teacherWeeklyMaxPeriods: null, autoSchedulerEnabled: true, requireApprovalForNonPrincipal: true,
    maxSolverDurationSeconds: 120,
    preferenceWeights: { low: 1, medium: 2, high: 3 },
    globalSoftWeights: { evenSubjectSpread: 2, minimiseTeacherGaps: 1, roomConsistency: 1, workloadBalance: 1 },
  },
  approvals: { expiryDays: 7, reminderAfterHours: 48 },
  compliance: { auditLogRetentionMonths: 36 },
};

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not run in production. Set NODE_ENV != production.');
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Step 1-2: Extensions and trigger function via raw pg
  const pgClient = new Client({ connectionString });
  await pgClient.connect();
  try {
    console.log('Seed: Step 1 — Extensions');
    await pgClient.query('CREATE EXTENSION IF NOT EXISTS citext;');
    await pgClient.query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
    console.log('  Extensions created.');

    console.log('Seed: Step 2 — set_updated_at() trigger function');
    await pgClient.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('  Trigger function created.');
  } finally {
    await pgClient.end();
  }

  // Steps 3-6: Prisma operations
  const prisma = new PrismaClient();
  try {
    // Step 3: Seed global permissions
    console.log('Seed: Step 3 — Global permissions');
    for (const perm of PERMISSION_SEEDS) {
      await prisma.permission.upsert({
        where: { permission_key: perm.permission_key },
        update: { description: perm.description, permission_tier: perm.permission_tier as never },
        create: {
          permission_key: perm.permission_key,
          description: perm.description,
          permission_tier: perm.permission_tier as never,
        },
      });
    }
    console.log(`  ${PERMISSION_SEEDS.length} permissions seeded.`);

    // Step 4: Seed global system roles (tenant_id = null)
    console.log('Seed: Step 4 — Global system roles');
    const permissionMap = new Map<string, string>();
    const allPerms = await prisma.permission.findMany();
    for (const p of allPerms) {
      permissionMap.set(p.permission_key, p.id);
    }

    // Create platform_owner as a global role (no tenant_id)
    const platformOwnerDef = SYSTEM_ROLES.find((r) => r.role_key === 'platform_owner')!;
    const platformOwnerRole = await prisma.role.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        role_key: platformOwnerDef.role_key,
        display_name: platformOwnerDef.display_name,
        is_system_role: true,
        role_tier: platformOwnerDef.role_tier as never,
        tenant_id: null,
      },
    });
    // Assign platform permissions
    for (const permKey of platformOwnerDef.default_permissions) {
      const permId = permissionMap.get(permKey);
      if (permId) {
        await prisma.rolePermission.upsert({
          where: { role_id_permission_id: { role_id: platformOwnerRole.id, permission_id: permId } },
          update: {},
          create: { role_id: platformOwnerRole.id, permission_id: permId, tenant_id: null },
        });
      }
    }
    console.log('  Platform owner role created.');

    // Step 5: Seed dev tenants
    console.log('Seed: Step 5 — Dev tenants');
    const passwordHash = await hashPassword(DEV_PASSWORD);
    const tenantMap = new Map<string, string>();

    for (const t of DEV_TENANTS) {
      const tenant = await prisma.tenant.upsert({
        where: { slug: t.slug },
        update: {},
        create: {
          name: t.name,
          slug: t.slug,
          default_locale: t.default_locale,
          timezone: t.timezone,
          date_format: t.date_format,
          currency_code: t.currency_code,
          academic_year_start_month: t.academic_year_start_month,
        },
      });
      tenantMap.set(t.slug, tenant.id);

      // Create fallback domain
      const existingDomain = await prisma.tenantDomain.findUnique({ where: { domain: t.domain } });
      if (!existingDomain) {
        await prisma.tenantDomain.create({
          data: {
            tenant_id: tenant.id,
            domain: t.domain,
            domain_type: 'app',
            verification_status: 'verified',
            ssl_status: 'active',
            is_primary: true,
          },
        });
      }

      // Create default branding
      await prisma.tenantBranding.upsert({
        where: { tenant_id: tenant.id },
        update: {},
        create: {
          tenant_id: tenant.id,
          school_name_display: t.name,
        },
      });

      // Create default settings
      await prisma.tenantSetting.upsert({
        where: { tenant_id: tenant.id },
        update: {},
        create: {
          tenant_id: tenant.id,
          settings: DEFAULT_SETTINGS,
        },
      });

      // Create modules (all enabled)
      for (const mk of MODULE_KEYS) {
        const existing = await prisma.tenantModule.findFirst({
          where: { tenant_id: tenant.id, module_key: mk },
        });
        if (!existing) {
          await prisma.tenantModule.create({
            data: { tenant_id: tenant.id, module_key: mk, is_enabled: true },
          });
        }
      }

      // Create notification settings (all enabled, email channel)
      for (const nt of NOTIFICATION_TYPES) {
        const existing = await prisma.tenantNotificationSetting.findFirst({
          where: { tenant_id: tenant.id, notification_type: nt },
        });
        if (!existing) {
          await prisma.tenantNotificationSetting.create({
            data: {
              tenant_id: tenant.id,
              notification_type: nt,
              is_enabled: true,
              channels: ['email'],
            },
          });
        }
      }

      // Create sequences
      for (const st of SEQUENCE_TYPES) {
        const existing = await prisma.tenantSequence.findFirst({
          where: { tenant_id: tenant.id, sequence_type: st },
        });
        if (!existing) {
          await prisma.tenantSequence.create({
            data: { tenant_id: tenant.id, sequence_type: st, current_value: 0 },
          });
        }
      }

      // Create tenant-scoped system roles + assign permissions
      const tenantRoles = SYSTEM_ROLES.filter((r) => r.role_key !== 'platform_owner');
      for (const roleDef of tenantRoles) {
        const existingRole = await prisma.role.findFirst({
          where: { tenant_id: tenant.id, role_key: roleDef.role_key },
        });
        const role = existingRole ?? await prisma.role.create({
          data: {
            tenant_id: tenant.id,
            role_key: roleDef.role_key,
            display_name: roleDef.display_name,
            is_system_role: true,
            role_tier: roleDef.role_tier as never,
          },
        });

        for (const permKey of roleDef.default_permissions) {
          const permId = permissionMap.get(permKey);
          if (permId) {
            const existing = await prisma.rolePermission.findUnique({
              where: { role_id_permission_id: { role_id: role.id, permission_id: permId } },
            });
            if (!existing) {
              await prisma.rolePermission.create({
                data: { role_id: role.id, permission_id: permId, tenant_id: tenant.id },
              });
            }
          }
        }
      }

      console.log(`  Tenant "${t.name}" seeded with all defaults.`);
    }

    // Step 6: Seed dev users + memberships
    console.log('Seed: Step 6 — Dev users and memberships');

    // Platform admin user
    const platformUser = await prisma.user.upsert({
      where: { email: DEV_PLATFORM_USER.email },
      update: {},
      create: {
        email: DEV_PLATFORM_USER.email,
        password_hash: passwordHash,
        first_name: DEV_PLATFORM_USER.first_name,
        last_name: DEV_PLATFORM_USER.last_name,
        preferred_locale: DEV_PLATFORM_USER.preferred_locale,
        global_status: 'active',
        email_verified_at: new Date(),
      },
    });
    console.log(`  Platform admin: ${platformUser.email}`);

    // Tenant users
    for (const u of DEV_USERS) {
      const tenantId = tenantMap.get(u.tenant_slug);
      if (!tenantId) continue;

      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          email: u.email,
          password_hash: passwordHash,
          first_name: u.first_name,
          last_name: u.last_name,
          phone: u.phone ?? null,
          preferred_locale: u.preferred_locale ?? null,
          global_status: 'active',
          email_verified_at: new Date(),
        },
      });

      // Create membership
      const membership = await prisma.tenantMembership.upsert({
        where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: user.id } },
        update: {},
        create: {
          tenant_id: tenantId,
          user_id: user.id,
          membership_status: 'active',
          joined_at: new Date(),
        },
      });

      // Assign role
      const role = await prisma.role.findFirst({
        where: { tenant_id: tenantId, role_key: u.role_key },
      });
      if (role) {
        const existing = await prisma.membershipRole.findUnique({
          where: { membership_id_role_id: { membership_id: membership.id, role_id: role.id } },
        });
        if (!existing) {
          await prisma.membershipRole.create({
            data: {
              membership_id: membership.id,
              role_id: role.id,
              tenant_id: tenantId,
            },
          });
        }
      }

      console.log(`  User "${u.email}" → ${u.role_key} @ ${u.tenant_slug}`);
    }

    // Step 7: Seed P4A rooms and schedules per tenant
    console.log('Seed: Step 7 — P4A rooms and schedules');
    for (const [slug, tenantId] of tenantMap.entries()) {
      // Create rooms
      const roomDefs = [
        { name: 'Room 101', room_type: 'classroom' as const, capacity: 30, is_exclusive: true, active: true },
        { name: 'Room 102', room_type: 'classroom' as const, capacity: 30, is_exclusive: true, active: true },
        { name: 'Science Lab', room_type: 'lab' as const, capacity: 25, is_exclusive: true, active: true },
        { name: 'Gymnasium', room_type: 'gym' as const, capacity: 100, is_exclusive: false, active: true },
        { name: 'Library', room_type: 'library' as const, capacity: 50, is_exclusive: false, active: true },
      ];

      for (const rd of roomDefs) {
        const existing = await prisma.room.findFirst({
          where: { tenant_id: tenantId, name: rd.name },
        });
        if (!existing) {
          await prisma.room.create({
            data: { tenant_id: tenantId, ...rd },
          });
        } else if (!existing.active) {
          await prisma.room.update({
            where: { id: existing.id },
            data: { active: true },
          });
        }
      }

      // Create schedule entries if classes and staff exist
      const classes = await prisma.class.findMany({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true, academic_year_id: true },
        take: 3,
      });
      const rooms = await prisma.room.findMany({
        where: { tenant_id: tenantId, active: true },
        select: { id: true },
        take: 3,
      });
      const staffProfiles = await prisma.staffProfile.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
        take: 2,
      });

      if (classes.length > 0 && rooms.length > 0) {
        const today = new Date();
        const yearStart = new Date(today.getFullYear(), 8, 1); // Sep 1

        for (let i = 0; i < Math.min(classes.length, 3); i++) {
          const cls = classes[i]!;
          const existingSchedule = await prisma.schedule.findFirst({
            where: { tenant_id: tenantId, class_id: cls.id, weekday: i },
          });
          if (!existingSchedule) {
            await prisma.schedule.create({
              data: {
                tenant_id: tenantId,
                class_id: cls.id,
                academic_year_id: cls.academic_year_id,
                room_id: rooms[i % rooms.length]?.id ?? null,
                teacher_staff_id: staffProfiles[i % Math.max(staffProfiles.length, 1)]?.id ?? null,
                weekday: i,
                start_time: new Date(`1970-01-01T${String(8 + i).padStart(2, '0')}:00:00.000Z`),
                end_time: new Date(`1970-01-01T${String(9 + i).padStart(2, '0')}:00:00.000Z`),
                effective_start_date: yearStart,
                source: 'manual',
              },
            });
          }
        }
      }

      console.log(`  P4A rooms and schedules seeded for "${slug}".`);
    }

    // Step 8: Populate platform owner Redis set
    console.log('Seed: Step 8 — Platform owner Redis set');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:5554';
    const redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });
    try {
      await redisClient.sadd('platform_owner_user_ids', platformUser.id);
      console.log(`  Platform owner ${platformUser.id} added to Redis set.`);
    } finally {
      await redisClient.quit();
    }

    // Step 9: Seed platform-level notification templates
    console.log('Seed: Step 9 — Platform-level notification templates');

    // Template definitions: [template_key, channel, locale, subject_template, body_template]
    type TemplateChannel = 'email' | 'in_app';
    type TemplateLocale = 'en' | 'ar';

    const platformTemplates: Array<{
      template_key: string;
      channel: TemplateChannel;
      locale: TemplateLocale;
      subject_template: string | null;
      body_template: string;
    }> = [
      // announcement.published — email en
      {
        template_key: 'announcement.published',
        channel: 'email',
        locale: 'en',
        subject_template: 'New Announcement: {{title}}',
        body_template:
          'Dear {{recipient_name}},\n\nA new announcement has been published:\n\n**{{title}}**\n\n{{body}}\n\nThis announcement is from {{school_name}}.\n\nRegards,\n{{school_name}} Team',
      },
      // announcement.published — email ar
      {
        template_key: 'announcement.published',
        channel: 'email',
        locale: 'ar',
        subject_template: 'إعلان جديد: {{title}}',
        body_template:
          'عزيزي {{recipient_name}}،\n\nتم نشر إعلان جديد:\n\n**{{title}}**\n\n{{body}}\n\nهذا الإعلان من {{school_name}}.\n\nمع التحية،\nفريق {{school_name}}',
      },
      // announcement.published — in_app en
      {
        template_key: 'announcement.published',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'New announcement: {{title}}',
      },
      // announcement.published — in_app ar
      {
        template_key: 'announcement.published',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'إعلان جديد: {{title}}',
      },

      // inquiry.new_message — email en
      {
        template_key: 'inquiry.new_message',
        channel: 'email',
        locale: 'en',
        subject_template: 'New message on your inquiry: {{subject}}',
        body_template:
          'Dear {{recipient_name}},\n\nYou have received a new message on your inquiry "{{subject}}":\n\n{{message}}\n\nPlease log in to the parent portal to respond.\n\nRegards,\n{{school_name}} Team',
      },
      // inquiry.new_message — email ar
      {
        template_key: 'inquiry.new_message',
        channel: 'email',
        locale: 'ar',
        subject_template: 'رسالة جديدة على استفسارك: {{subject}}',
        body_template:
          'عزيزي {{recipient_name}}،\n\nلديك رسالة جديدة على استفسارك "{{subject}}":\n\n{{message}}\n\nيرجى تسجيل الدخول إلى بوابة أولياء الأمور للرد.\n\nمع التحية،\nفريق {{school_name}}',
      },
      // inquiry.new_message — in_app en
      {
        template_key: 'inquiry.new_message',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'New message on inquiry: {{subject}}',
      },
      // inquiry.new_message — in_app ar
      {
        template_key: 'inquiry.new_message',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'رسالة جديدة على الاستفسار: {{subject}}',
      },

      // approval.requested — email en
      {
        template_key: 'approval.requested',
        channel: 'email',
        locale: 'en',
        subject_template: 'Approval Required: {{action_type}}',
        body_template:
          'Dear {{recipient_name}},\n\nYour approval is required for the following:\n\n**Action:** {{action_type}}\n**Requested by:** {{requester_name}}\n**Reason:** {{reason}}\n\nPlease log in to review and approve or reject this request.\n\nRegards,\n{{school_name}} Team',
      },
      // approval.requested — email ar
      {
        template_key: 'approval.requested',
        channel: 'email',
        locale: 'ar',
        subject_template: 'مطلوب موافقة: {{action_type}}',
        body_template:
          'عزيزي {{recipient_name}}،\n\nمطلوب موافقتك على ما يلي:\n\n**الإجراء:** {{action_type}}\n**طلب من:** {{requester_name}}\n**السبب:** {{reason}}\n\nيرجى تسجيل الدخول لمراجعة الطلب والموافقة عليه أو رفضه.\n\nمع التحية،\nفريق {{school_name}}',
      },
      // approval.requested — in_app en
      {
        template_key: 'approval.requested',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Approval requested: {{action_type}} by {{requester_name}}',
      },
      // approval.requested — in_app ar
      {
        template_key: 'approval.requested',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'طلب موافقة: {{action_type}} من {{requester_name}}',
      },

      // approval.decided — email en
      {
        template_key: 'approval.decided',
        channel: 'email',
        locale: 'en',
        subject_template: 'Your request has been {{decision}}: {{action_type}}',
        body_template:
          'Dear {{recipient_name}},\n\nYour request for "{{action_type}}" has been **{{decision}}**.\n\n**Decided by:** {{approver_name}}\n**Comment:** {{comment}}\n\nRegards,\n{{school_name}} Team',
      },
      // approval.decided — email ar
      {
        template_key: 'approval.decided',
        channel: 'email',
        locale: 'ar',
        subject_template: 'تم {{decision}} طلبك: {{action_type}}',
        body_template:
          'عزيزي {{recipient_name}}،\n\nتم **{{decision}}** طلبك بخصوص "{{action_type}}".\n\n**تم البت من قبل:** {{approver_name}}\n**التعليق:** {{comment}}\n\nمع التحية،\nفريق {{school_name}}',
      },
      // approval.decided — in_app en
      {
        template_key: 'approval.decided',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Your request "{{action_type}}" was {{decision}} by {{approver_name}}',
      },
      // approval.decided — in_app ar
      {
        template_key: 'approval.decided',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم {{decision}} طلبك "{{action_type}}" من قِبَل {{approver_name}}',
      },
    ];

    // Delete existing platform templates and recreate (idempotent)
    await prisma.notificationTemplate.deleteMany({ where: { tenant_id: null } });
    await prisma.notificationTemplate.createMany({
      data: platformTemplates.map((t) => ({
        tenant_id: null,
        channel: t.channel as never,
        template_key: t.template_key,
        locale: t.locale,
        subject_template: t.subject_template,
        body_template: t.body_template,
        is_system: true,
      })),
    });
    console.log(`  ${platformTemplates.length} platform notification templates seeded.`);

    console.log('\nSeed: Complete!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
