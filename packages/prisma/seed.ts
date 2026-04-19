/* eslint-disable no-console -- seed script uses console for progress reporting */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Client } from 'pg';

import { COVER_NOTIFICATION_TEMPLATE_SEEDS } from './seed/cover-notification-templates';
import {
  DEV_TENANTS,
  DEV_PLATFORM_USER,
  DEV_USERS,
  hashPassword,
  DEV_PASSWORD,
} from './seed/dev-data';
import { GDPR_EXPORT_POLICY_SEEDS } from './seed/gdpr-export-policies';
import { LEAVE_TYPE_SEEDS } from './seed/leave-types';
import { PERMISSION_SEEDS } from './seed/permissions';
import { SYSTEM_ROLES } from './seed/system-roles';
import { seedInboxDefaultsForTenant } from './src/inbox-defaults';

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
  'admissions',
  'attendance',
  'gradebook',
  'finance',
  'payroll',
  'communications',
  'website',
  'analytics',
  'compliance',
  'parent_inquiries',
  'auto_scheduling',
  'staff_wellbeing',
  'sen',
  'behaviour',
  'pastoral',
  'ai_functions',
];

const NOTIFICATION_TYPES = [
  'invoice.issued',
  'payment.received',
  'payment.failed',
  'report_card.published',
  'attendance.exception',
  'admission.status_change',
  'announcement.published',
  'approval.requested',
  'approval.decided',
  'inquiry.new_message',
  'payroll.finalised',
  'payslip.generated',
];

const SEQUENCE_TYPES = [
  'receipt',
  'invoice',
  'application',
  'payslip',
  'student',
  'staff',
  'household',
  'payment',
  'refund',
  'pastoral_case',
  'sen_support_plan',
];

const DEFAULT_SETTINGS = {
  attendance: { allowTeacherAmendment: false, autoLockAfterDays: null, pendingAlertTimeHour: 14 },
  gradebook: { defaultMissingGradePolicy: 'exclude', requireGradeComment: false },
  admissions: { requireApprovalForAcceptance: true },
  finance: {
    requireApprovalForInvoiceIssue: false,
    defaultPaymentTermDays: 30,
    allowPartialPayment: true,
  },
  communications: { primaryOutboundChannel: 'email', requireApprovalForAnnouncements: true },
  payroll: {
    requireApprovalForNonPrincipal: true,
    defaultBonusMultiplier: 1.0,
    autoPopulateClassCounts: true,
  },
  general: {
    parentPortalEnabled: true,
    attendanceVisibleToParents: true,
    gradesVisibleToParents: true,
    inquiryStaleHours: 48,
  },
  scheduling: {
    teacherWeeklyMaxPeriods: null,
    autoSchedulerEnabled: true,
    requireApprovalForNonPrincipal: true,
    maxSolverDurationSeconds: 3600,
    preferenceWeights: { low: 1, medium: 2, high: 3 },
    globalSoftWeights: {
      evenSubjectSpread: 2,
      minimiseTeacherGaps: 1,
      roomConsistency: 1,
      workloadBalance: 1,
    },
    // SCHED-023: when true, the orchestration layer rejects a solver run
    // if any class_subject_requirements row's periods_per_week does not
    // match the year-group curriculum baseline (or if the override names a
    // subject that has no year-group curriculum at all). Default false —
    // schools that want freedom to author per-class subject overrides
    // without matching the year-group curriculum can leave this off;
    // schools that want the override to be a pure room/block hint (never
    // a period-count change) can flip it on.
    strict_class_subject_override: false,
  },
  approvals: { expiryDays: 7, reminderAfterHours: 48 },
  compliance: { auditLogRetentionMonths: 36 },
  sen: {
    module_enabled: false,
    default_review_cycle_weeks: 12,
    auto_flag_on_referral: true,
    sna_schedule_format: 'weekly',
    enable_parent_portal_access: true,
    plan_number_prefix: 'SSP',
  },
};

function getDefaultModuleEnabledState(moduleKey: string): boolean {
  return moduleKey !== 'sen';
}

function getDirectDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_MIGRATE_URL environment variable is required');
  }

  return connectionString;
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed script must not run in production. Set NODE_ENV != production.');
  }

  const connectionString = getDirectDatabaseUrl();

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
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  });
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

    // Step 3b: Seed GDPR export policies (platform-level, no tenant)
    console.log('Seed: Step 3b — GDPR export policies');
    for (const policy of GDPR_EXPORT_POLICY_SEEDS) {
      await prisma.gdprExportPolicy.upsert({
        where: { export_type: policy.export_type },
        update: {
          tokenisation: policy.tokenisation,
          lawful_basis: policy.lawful_basis,
          description: policy.description,
        },
        create: {
          export_type: policy.export_type,
          tokenisation: policy.tokenisation,
          lawful_basis: policy.lawful_basis,
          description: policy.description,
        },
      });
    }
    console.log(`  ${GDPR_EXPORT_POLICY_SEEDS.length} GDPR export policies seeded.`);

    // Step 3c: Seed default leave types (system defaults, tenant_id = null)
    console.log('Seed: Step 3c — Default leave types');
    for (const lt of LEAVE_TYPE_SEEDS) {
      // System rows are identified by (tenant_id IS NULL, code). No natural PK
      // so we look up by code within the system scope and upsert manually.
      const existing = await prisma.leaveType.findFirst({
        where: { tenant_id: null, code: lt.code },
      });
      if (existing) {
        await prisma.leaveType.update({
          where: { id: existing.id },
          data: {
            label: lt.label,
            requires_approval: lt.requires_approval,
            is_paid_default: lt.is_paid_default,
            max_days_per_request: lt.max_days_per_request,
            requires_evidence: lt.requires_evidence,
            display_order: lt.display_order,
          },
        });
      } else {
        await prisma.leaveType.create({
          data: {
            tenant_id: null,
            code: lt.code,
            label: lt.label,
            requires_approval: lt.requires_approval,
            is_paid_default: lt.is_paid_default,
            max_days_per_request: lt.max_days_per_request,
            requires_evidence: lt.requires_evidence,
            display_order: lt.display_order,
          },
        });
      }
    }
    console.log(`  ${LEAVE_TYPE_SEEDS.length} leave types seeded.`);

    // Step 3d: Seed leave-and-cover notification templates (system, tenant_id = null)
    console.log('Seed: Step 3d — Cover notification templates');
    for (const tpl of COVER_NOTIFICATION_TEMPLATE_SEEDS) {
      const existing = await prisma.notificationTemplate.findFirst({
        where: {
          tenant_id: null,
          channel: tpl.channel as never,
          template_key: tpl.template_key,
          locale: tpl.locale,
        },
      });
      if (existing) {
        await prisma.notificationTemplate.update({
          where: { id: existing.id },
          data: {
            subject_template: tpl.subject_template,
            body_template: tpl.body_template,
            is_system: true,
          },
        });
      } else {
        await prisma.notificationTemplate.create({
          data: {
            tenant_id: null,
            channel: tpl.channel as never,
            template_key: tpl.template_key,
            locale: tpl.locale,
            subject_template: tpl.subject_template,
            body_template: tpl.body_template,
            is_system: true,
          },
        });
      }
    }
    console.log(`  ${COVER_NOTIFICATION_TEMPLATE_SEEDS.length} notification templates seeded.`);

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
          where: {
            role_id_permission_id: { role_id: platformOwnerRole.id, permission_id: permId },
          },
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

      // Create module rows for every supported module. SEN remains disabled
      // until the tenant explicitly enables the rollout.
      for (const mk of MODULE_KEYS) {
        const existing = await prisma.tenantModule.findFirst({
          where: { tenant_id: tenant.id, module_key: mk },
        });
        if (!existing) {
          await prisma.tenantModule.create({
            data: {
              tenant_id: tenant.id,
              module_key: mk,
              is_enabled: getDefaultModuleEnabledState(mk),
            },
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
        const role =
          existingRole ??
          (await prisma.role.create({
            data: {
              tenant_id: tenant.id,
              role_key: roleDef.role_key,
              display_name: roleDef.display_name,
              is_system_role: true,
              role_tier: roleDef.role_tier as never,
            },
          }));

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

      // Seed inbox defaults (settings row, 81-row messaging policy matrix,
      // starter safeguarding keyword list) — idempotent.
      await seedInboxDefaultsForTenant(prisma, tenant.id);

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

      // Create Parent record for parent-role users (needed by parent_inquiries module)
      if (u.role_key === 'parent') {
        const existingParent = await prisma.parent.findFirst({
          where: { tenant_id: tenantId, user_id: user.id },
        });
        if (!existingParent) {
          await prisma.parent.create({
            data: {
              tenant_id: tenantId,
              user_id: user.id,
              first_name: u.first_name,
              last_name: u.last_name,
              email: u.email,
              phone: u.phone ?? null,
              preferred_contact_channels: ['email'],
              is_primary_contact: true,
            },
          });
        }
      }

      // Staff profile for teacher-role users — attendance/scheduling services
      // key scope checks off staff_profile.user_id, so a teacher user without a
      // linked profile can't save attendance records under attendance.take.
      if (u.role_key === 'teacher') {
        const existingProfile = await prisma.staffProfile.findFirst({
          where: { tenant_id: tenantId, user_id: user.id },
        });
        if (!existingProfile) {
          await prisma.staffProfile.create({
            data: {
              tenant_id: tenantId,
              user_id: user.id,
              employment_status: 'active',
              employment_type: 'full_time',
              job_title: 'Teacher',
            },
          });
        }
      }

      console.log(`  User "${u.email}" → ${u.role_key} @ ${u.tenant_slug}`);
    }

    // Step 6b: Seed Report Card redesign defaults per tenant
    // - Default `report_card_tenant_settings` row (idempotent)
    // - Default "Grades Only" templates for both English and Arabic locales
    // - Point settings.default_template_id at the English template
    console.log('Seed: Step 6b — Report Card redesign defaults');
    const defaultReportCardSettings = {
      matrix_display_mode: 'grade',
      show_top_rank_badge: false,
      default_personal_info_fields: [
        'full_name',
        'student_number',
        'date_of_birth',
        'class_name',
        'year_group',
        'homeroom_teacher',
      ],
      require_finalised_comments: true,
      allow_admin_force_generate: true,
      principal_signature_storage_key: null,
      principal_name: null,
      grade_threshold_set_id: null,
      default_template_id: null,
    };

    for (const [slug, tenantId] of tenantMap.entries()) {
      // Pick the platform user as the system creator for default templates.
      // This is the same well-known account used elsewhere in the seed; if it
      // does not exist yet, fall back to the first user in the tenant.
      const creator =
        (await prisma.user.findUnique({ where: { email: DEV_PLATFORM_USER.email } })) ??
        (await prisma.tenantMembership
          .findFirst({ where: { tenant_id: tenantId } })
          .then((m) => (m ? prisma.user.findUnique({ where: { id: m.user_id } }) : null)));

      if (!creator) {
        console.log(`  ⚠ No creator user available for tenant "${slug}"; skipping templates.`);
        continue;
      }

      // Seed the two bundled design families (editorial-academic and
      // modern-editorial) as four template rows per tenant. `branding_overrides_json.design_key`
      // pairs each row with the corresponding Handlebars bundle in
      // `apps/worker/src/report-card-templates/<key>/` — without this, the
      // renderer's fallback logic kicks in and every run silently uses
      // editorial-academic regardless of the tenant's stored template.
      const enTemplate = await prisma.reportCardTemplate.upsert({
        where: {
          idx_report_card_templates_unique: {
            tenant_id: tenantId,
            name: 'Editorial Academic',
            locale: 'en',
          },
        },
        update: {
          content_scope: 'grades_only',
          is_default: true,
          branding_overrides_json: { design_key: 'editorial-academic' },
        },
        create: {
          tenant_id: tenantId,
          name: 'Editorial Academic',
          is_default: true,
          locale: 'en',
          content_scope: 'grades_only',
          sections_json: {},
          branding_overrides_json: { design_key: 'editorial-academic' },
          created_by_user_id: creator.id,
        },
      });

      await prisma.reportCardTemplate.upsert({
        where: {
          idx_report_card_templates_unique: {
            tenant_id: tenantId,
            name: 'Editorial Academic',
            locale: 'ar',
          },
        },
        update: {
          content_scope: 'grades_only',
          branding_overrides_json: { design_key: 'editorial-academic' },
        },
        create: {
          tenant_id: tenantId,
          name: 'Editorial Academic',
          is_default: false,
          locale: 'ar',
          content_scope: 'grades_only',
          sections_json: {},
          branding_overrides_json: { design_key: 'editorial-academic' },
          created_by_user_id: creator.id,
        },
      });

      await prisma.reportCardTemplate.upsert({
        where: {
          idx_report_card_templates_unique: {
            tenant_id: tenantId,
            name: 'Modern Editorial',
            locale: 'en',
          },
        },
        update: {
          content_scope: 'grades_only',
          branding_overrides_json: { design_key: 'modern-editorial' },
        },
        create: {
          tenant_id: tenantId,
          name: 'Modern Editorial',
          is_default: false,
          locale: 'en',
          content_scope: 'grades_only',
          sections_json: {},
          branding_overrides_json: { design_key: 'modern-editorial' },
          created_by_user_id: creator.id,
        },
      });

      await prisma.reportCardTemplate.upsert({
        where: {
          idx_report_card_templates_unique: {
            tenant_id: tenantId,
            name: 'Modern Editorial',
            locale: 'ar',
          },
        },
        update: {
          content_scope: 'grades_only',
          branding_overrides_json: { design_key: 'modern-editorial' },
        },
        create: {
          tenant_id: tenantId,
          name: 'Modern Editorial',
          is_default: false,
          locale: 'ar',
          content_scope: 'grades_only',
          sections_json: {},
          branding_overrides_json: { design_key: 'modern-editorial' },
          created_by_user_id: creator.id,
        },
      });

      // Default tenant settings — point default_template_id at the English template
      await prisma.reportCardTenantSettings.upsert({
        where: { tenant_id: tenantId },
        update: {},
        create: {
          tenant_id: tenantId,
          settings_json: { ...defaultReportCardSettings, default_template_id: enTemplate.id },
        },
      });

      console.log(`  Tenant "${slug}" — report card defaults seeded.`);
    }

    // Step 7: Seed P4A rooms and schedules per tenant
    console.log('Seed: Step 7 — P4A rooms and schedules');
    for (const [slug, tenantId] of tenantMap.entries()) {
      // Create rooms
      const roomDefs = [
        {
          name: 'Room 101',
          room_type: 'classroom' as const,
          capacity: 30,
          is_exclusive: true,
          active: true,
        },
        {
          name: 'Room 102',
          room_type: 'classroom' as const,
          capacity: 30,
          is_exclusive: true,
          active: true,
        },
        {
          name: 'Science Lab',
          room_type: 'lab' as const,
          capacity: 25,
          is_exclusive: true,
          active: true,
        },
        {
          name: 'Gymnasium',
          room_type: 'gym' as const,
          capacity: 100,
          is_exclusive: false,
          active: true,
        },
        {
          name: 'Library',
          room_type: 'library' as const,
          capacity: 50,
          is_exclusive: false,
          active: true,
        },
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
      if (tenantMap.size > 0) {
        const tenantModuleKeys = Array.from(tenantMap.values()).map(
          (tenantId) => `tenant_modules:${tenantId}`,
        );
        await redisClient.del(...tenantModuleKeys);
      }
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

      // ─── Phase C: Behaviour Sanctions + Appeals ────────────────────────────

      // behaviour_sanction_parent — email en
      {
        template_key: 'behaviour_sanction_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Behaviour Notice: {{sanction_type}} for {{student_name}}',
        body_template:
          'Dear Parent/Guardian,\n\nThis is to inform you that a {{sanction_type}} has been issued for {{student_name}} ({{student_year_group}}).\n\n**Date:** {{sanction_date}}\n**Reason:** {{parent_description}}\n\n{{#if suspension_start_date}}**Suspension Period:** {{suspension_start_date}} to {{suspension_end_date}}\n**Return Conditions:** {{return_conditions}}\n{{/if}}\n\nIf you have any questions, please contact the school.\n\nRegards,\n{{school_name}}',
      },
      // behaviour_sanction_parent — email ar
      {
        template_key: 'behaviour_sanction_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'إشعار سلوكي: {{sanction_type}} لـ {{student_name}}',
        body_template:
          'عزيزي ولي الأمر،\n\nنود إعلامكم بأنه تم إصدار {{sanction_type}} بحق {{student_name}} ({{student_year_group}}).\n\n**التاريخ:** {{sanction_date}}\n**السبب:** {{parent_description}}\n\n{{#if suspension_start_date}}**فترة الإيقاف:** {{suspension_start_date}} إلى {{suspension_end_date}}\n**شروط العودة:** {{return_conditions}}\n{{/if}}\n\nللاستفسارات، يرجى التواصل مع المدرسة.\n\nمع التحية،\n{{school_name}}',
      },
      // behaviour_sanction_parent — in_app en
      {
        template_key: 'behaviour_sanction_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'A {{sanction_type}} has been issued for {{student_name}} on {{sanction_date}}',
      },
      // behaviour_sanction_parent — in_app ar
      {
        template_key: 'behaviour_sanction_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم إصدار {{sanction_type}} بحق {{student_name}} بتاريخ {{sanction_date}}',
      },

      // behaviour_appeal_outcome — email en
      {
        template_key: 'behaviour_appeal_outcome',
        channel: 'email',
        locale: 'en',
        subject_template: 'Appeal {{appeal_number}} Decision',
        body_template:
          'Dear Appellant,\n\nThe appeal {{appeal_number}} regarding {{student_name}} has been decided.\n\n**Decision:** {{appeal_decision}}\n**Reasoning:** {{appeal_reasoning}}\n\n{{#if resulting_amendments}}**Amendments Made:**\n{{resulting_amendments}}\n{{/if}}\n\nIf you have any questions, please contact the school.\n\nRegards,\n{{school_name}}',
      },
      // behaviour_appeal_outcome — email ar
      {
        template_key: 'behaviour_appeal_outcome',
        channel: 'email',
        locale: 'ar',
        subject_template: 'قرار الاستئناف {{appeal_number}}',
        body_template:
          'عزيزي مقدم الاستئناف،\n\nتم البت في الاستئناف {{appeal_number}} المتعلق بـ {{student_name}}.\n\n**القرار:** {{appeal_decision}}\n**الأسباب:** {{appeal_reasoning}}\n\n{{#if resulting_amendments}}**التعديلات:**\n{{resulting_amendments}}\n{{/if}}\n\nللاستفسارات، يرجى التواصل مع المدرسة.\n\nمع التحية،\n{{school_name}}',
      },
      // behaviour_appeal_outcome — in_app en
      {
        template_key: 'behaviour_appeal_outcome',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Appeal {{appeal_number}} decided: {{appeal_decision}}',
      },
      // behaviour_appeal_outcome — in_app ar
      {
        template_key: 'behaviour_appeal_outcome',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم البت في الاستئناف {{appeal_number}}: {{appeal_decision}}',
      },

      // behaviour_exclusion_notice_parent — email en
      {
        template_key: 'behaviour_exclusion_notice_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Important: Formal Exclusion Notice for {{student_name}}',
        body_template:
          'Dear Parent/Guardian,\n\nThis is a formal notice regarding the {{exclusion_type}} of {{student_name}} ({{student_year_group}}) from {{school_name}}.\n\n**Exclusion Type:** {{exclusion_type}}\n**Case Number:** {{exclusion_case_number}}\n**Reason:** {{parent_description}}\n\nYou have the right to make representations and to be accompanied by a friend or representative.\n\n{{#if hearing_date}}**Hearing Date:** {{hearing_date}}\n{{/if}}\n\nFor any queries, please contact {{principal_name}} at {{school_name}}.\n\nRegards,\n{{principal_name}}\n{{school_name}}',
      },
      // behaviour_exclusion_notice_parent — email ar
      {
        template_key: 'behaviour_exclusion_notice_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'مهم: إشعار فصل رسمي لـ {{student_name}}',
        body_template:
          'عزيزي ولي الأمر،\n\nهذا إشعار رسمي بخصوص {{exclusion_type}} للطالب {{student_name}} ({{student_year_group}}) من {{school_name}}.\n\n**نوع الفصل:** {{exclusion_type}}\n**رقم القضية:** {{exclusion_case_number}}\n**السبب:** {{parent_description}}\n\nلديكم الحق في تقديم ملاحظات والحضور برفقة صديق أو ممثل.\n\n{{#if hearing_date}}**تاريخ الجلسة:** {{hearing_date}}\n{{/if}}\n\nللاستفسارات، يرجى التواصل مع {{principal_name}} في {{school_name}}.\n\nمع التحية،\n{{principal_name}}\n{{school_name}}',
      },
      // behaviour_exclusion_notice_parent — in_app en
      {
        template_key: 'behaviour_exclusion_notice_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'Formal exclusion notice issued for {{student_name}} — case {{exclusion_case_number}}',
      },
      // behaviour_exclusion_notice_parent — in_app ar
      {
        template_key: 'behaviour_exclusion_notice_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template:
          'تم إصدار إشعار فصل رسمي لـ {{student_name}} — القضية {{exclusion_case_number}}',
      },

      // behaviour_exclusion_decision_parent — email en
      {
        template_key: 'behaviour_exclusion_decision_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Exclusion Decision: {{student_name}}',
        body_template:
          'Dear Parent/Guardian,\n\nFollowing the hearing regarding the exclusion of {{student_name}}, the decision has been reached.\n\n**Decision:** {{exclusion_decision}}\n**Case Number:** {{exclusion_case_number}}\n\n{{#if appeal_deadline}}You have the right to appeal this decision. The appeal deadline is {{appeal_deadline}}.\n{{/if}}\n\nFor any queries, please contact {{principal_name}} at {{school_name}}.\n\nRegards,\n{{principal_name}}\n{{school_name}}',
      },
      // behaviour_exclusion_decision_parent — email ar
      {
        template_key: 'behaviour_exclusion_decision_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'قرار الفصل: {{student_name}}',
        body_template:
          'عزيزي ولي الأمر،\n\nبعد جلسة الاستماع بخصوص فصل {{student_name}}، تم التوصل إلى القرار.\n\n**القرار:** {{exclusion_decision}}\n**رقم القضية:** {{exclusion_case_number}}\n\n{{#if appeal_deadline}}لديكم الحق في استئناف هذا القرار. الموعد النهائي للاستئناف هو {{appeal_deadline}}.\n{{/if}}\n\nللاستفسارات، يرجى التواصل مع {{principal_name}} في {{school_name}}.\n\nمع التحية،\n{{principal_name}}\n{{school_name}}',
      },
      // behaviour_exclusion_decision_parent — in_app en
      {
        template_key: 'behaviour_exclusion_decision_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Exclusion decision for {{student_name}}: {{exclusion_decision}}',
      },
      // behaviour_exclusion_decision_parent — in_app ar
      {
        template_key: 'behaviour_exclusion_decision_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'قرار الفصل لـ {{student_name}}: {{exclusion_decision}}',
      },

      // behaviour_correction_parent — email en
      {
        template_key: 'behaviour_correction_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Correction to Previous Behaviour Notice',
        body_template:
          'Dear Parent/Guardian,\n\nA previous behaviour notice regarding {{student_name}} has been corrected.\n\n**What Changed:** {{correction_what_changed}}\n**Original Notice Date:** {{original_notification_date}}\n**Reason for Correction:** {{change_reason}}\n\nWe apologise for any inconvenience.\n\nRegards,\n{{school_name}}',
      },
      // behaviour_correction_parent — email ar
      {
        template_key: 'behaviour_correction_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'تصحيح على إشعار سلوكي سابق',
        body_template:
          'عزيزي ولي الأمر،\n\nتم تصحيح إشعار سلوكي سابق يتعلق بـ {{student_name}}.\n\n**ما تم تغييره:** {{correction_what_changed}}\n**تاريخ الإشعار الأصلي:** {{original_notification_date}}\n**سبب التصحيح:** {{change_reason}}\n\nنعتذر عن أي إزعاج.\n\nمع التحية،\n{{school_name}}',
      },
      // behaviour_correction_parent — in_app en
      {
        template_key: 'behaviour_correction_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'Correction to previous behaviour notice for {{student_name}}: {{correction_what_changed}}',
      },
      // behaviour_correction_parent — in_app ar
      {
        template_key: 'behaviour_correction_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template:
          'تصحيح على إشعار سلوكي سابق لـ {{student_name}}: {{correction_what_changed}}',
      },

      // behaviour_reacknowledgement_request — email en
      {
        template_key: 'behaviour_reacknowledgement_request',
        channel: 'email',
        locale: 'en',
        subject_template: 'Please Re-Confirm: Updated Behaviour Notice for {{student_name}}',
        body_template:
          'Dear Parent/Guardian,\n\nAn important update has been made to a behaviour record for {{student_name}}.\n\n**What Changed:** {{correction_what_changed}}\n\nPlease log in to the parent portal to review and re-confirm this notice.\n\nRegards,\n{{school_name}}',
      },
      // behaviour_reacknowledgement_request — email ar
      {
        template_key: 'behaviour_reacknowledgement_request',
        channel: 'email',
        locale: 'ar',
        subject_template: 'يرجى إعادة التأكيد: إشعار سلوكي محدث لـ {{student_name}}',
        body_template:
          'عزيزي ولي الأمر،\n\nتم إجراء تحديث مهم على سجل سلوكي لـ {{student_name}}.\n\n**ما تم تغييره:** {{correction_what_changed}}\n\nيرجى تسجيل الدخول إلى بوابة أولياء الأمور لمراجعة وإعادة تأكيد هذا الإشعار.\n\nمع التحية،\n{{school_name}}',
      },
      // behaviour_reacknowledgement_request — in_app en
      {
        template_key: 'behaviour_reacknowledgement_request',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Please re-confirm updated behaviour notice for {{student_name}}',
      },
      // behaviour_reacknowledgement_request — in_app ar
      {
        template_key: 'behaviour_reacknowledgement_request',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'يرجى إعادة تأكيد الإشعار السلوكي المحدث لـ {{student_name}}',
      },

      // ─── Phase A/B: Behaviour Incidents + Awards ──────────────────────────

      // behaviour_positive_parent — email en
      {
        template_key: 'behaviour_positive_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Positive Behaviour: {{student_name}}',
        body_template:
          'Dear {{parent_name}},\n\nWe are pleased to inform you that {{student_name}} has demonstrated positive behaviour.\n\n**Category:** {{category_name}}\n**Date:** {{incident_date}}\n**Details:** {{parent_description}}\n\nThank you for your continued support.\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_positive_parent — email ar
      {
        template_key: 'behaviour_positive_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'سلوك إيجابي: {{student_name}}',
        body_template:
          'عزيزي {{parent_name}}،\n\nيسعدنا إعلامكم بأن {{student_name}} أظهر سلوكاً إيجابياً.\n\n**الفئة:** {{category_name}}\n**التاريخ:** {{incident_date}}\n**التفاصيل:** {{parent_description}}\n\nشكراً لدعمكم المستمر.\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_positive_parent — in_app en
      {
        template_key: 'behaviour_positive_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Positive behaviour recorded for {{student_name}}: {{category_name}}',
      },
      // behaviour_positive_parent — in_app ar
      {
        template_key: 'behaviour_positive_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم تسجيل سلوك إيجابي لـ {{student_name}}: {{category_name}}',
      },

      // behaviour_negative_parent — email en
      {
        template_key: 'behaviour_negative_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Behaviour Notice: {{student_name}}',
        body_template:
          'Dear {{parent_name}},\n\nWe would like to inform you of a behaviour incident involving {{student_name}}.\n\n**Category:** {{category_name}}\n**Date:** {{incident_date}}\n**Details:** {{parent_description}}\n\nIf you have any questions, please contact the school.\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_negative_parent — email ar
      {
        template_key: 'behaviour_negative_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'إشعار سلوكي: {{student_name}}',
        body_template:
          'عزيزي {{parent_name}}،\n\nنود إعلامكم بحادثة سلوكية تتعلق بـ {{student_name}}.\n\n**الفئة:** {{category_name}}\n**التاريخ:** {{incident_date}}\n**التفاصيل:** {{parent_description}}\n\nللاستفسارات، يرجى التواصل مع المدرسة.\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_negative_parent — in_app en
      {
        template_key: 'behaviour_negative_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Behaviour incident recorded for {{student_name}}: {{category_name}}',
      },
      // behaviour_negative_parent — in_app ar
      {
        template_key: 'behaviour_negative_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم تسجيل حادثة سلوكية لـ {{student_name}}: {{category_name}}',
      },

      // behaviour_award_parent — email en
      {
        template_key: 'behaviour_award_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Award Earned: {{student_name}}',
        body_template:
          'Dear {{parent_name}},\n\nCongratulations! {{student_name}} has earned an award.\n\n**Award:** {{award_name}}\n**Points Awarded:** {{points_awarded}}\n\nKeep up the great work!\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_award_parent — email ar
      {
        template_key: 'behaviour_award_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'جائزة مُستحقة: {{student_name}}',
        body_template:
          'عزيزي {{parent_name}}،\n\nتهانينا! حصل {{student_name}} على جائزة.\n\n**الجائزة:** {{award_name}}\n**النقاط الممنوحة:** {{points_awarded}}\n\nاستمروا في العمل الرائع!\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_award_parent — in_app en
      {
        template_key: 'behaviour_award_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          '{{student_name}} earned an award: {{award_name}} (+{{points_awarded}} points)',
      },
      // behaviour_award_parent — in_app ar
      {
        template_key: 'behaviour_award_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'حصل {{student_name}} على جائزة: {{award_name}} (+{{points_awarded}} نقطة)',
      },

      // behaviour_acknowledgement_request — email en
      {
        template_key: 'behaviour_acknowledgement_request',
        channel: 'email',
        locale: 'en',
        subject_template: 'Please Acknowledge: Behaviour Notice for {{student_name}}',
        body_template:
          'Dear {{parent_name}},\n\nA behaviour notice has been issued for {{student_name}} that requires your acknowledgement.\n\n**Category:** {{category_name}}\n**Date:** {{incident_date}}\n**Details:** {{parent_description}}\n\nPlease log in to the parent portal to review and acknowledge this notice.\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_acknowledgement_request — email ar
      {
        template_key: 'behaviour_acknowledgement_request',
        channel: 'email',
        locale: 'ar',
        subject_template: 'يرجى التأكيد: إشعار سلوكي لـ {{student_name}}',
        body_template:
          'عزيزي {{parent_name}}،\n\nتم إصدار إشعار سلوكي بخصوص {{student_name}} يتطلب تأكيدكم.\n\n**الفئة:** {{category_name}}\n**التاريخ:** {{incident_date}}\n**التفاصيل:** {{parent_description}}\n\nيرجى تسجيل الدخول إلى بوابة أولياء الأمور لمراجعة وتأكيد هذا الإشعار.\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_acknowledgement_request — in_app en
      {
        template_key: 'behaviour_acknowledgement_request',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Please acknowledge behaviour notice for {{student_name}}',
      },
      // behaviour_acknowledgement_request — in_app ar
      {
        template_key: 'behaviour_acknowledgement_request',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'يرجى تأكيد الإشعار السلوكي لـ {{student_name}}',
      },

      // ─── Behaviour Tasks ──────────────────────────────────────────────────

      // behaviour_task_reminder — in_app only en
      {
        template_key: 'behaviour_task_reminder',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Reminder: Task "{{task_title}}" is due on {{due_date}}',
      },
      // behaviour_task_reminder — in_app only ar
      {
        template_key: 'behaviour_task_reminder',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تذكير: المهمة "{{task_title}}" مستحقة بتاريخ {{due_date}}',
      },

      // behaviour_task_overdue — email en
      {
        template_key: 'behaviour_task_overdue',
        channel: 'email',
        locale: 'en',
        subject_template: 'Overdue Task: {{task_title}}',
        body_template:
          'Dear Colleague,\n\nThe following task is now overdue:\n\n**Task:** {{task_title}}\n**Due Date:** {{due_date}}\n\nPlease complete this task as soon as possible.\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_task_overdue — email ar
      {
        template_key: 'behaviour_task_overdue',
        channel: 'email',
        locale: 'ar',
        subject_template: 'مهمة متأخرة: {{task_title}}',
        body_template:
          'عزيزي الزميل،\n\nالمهمة التالية أصبحت متأخرة:\n\n**المهمة:** {{task_title}}\n**تاريخ الاستحقاق:** {{due_date}}\n\nيرجى إكمال هذه المهمة في أقرب وقت ممكن.\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_task_overdue — in_app en
      {
        template_key: 'behaviour_task_overdue',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Overdue: Task "{{task_title}}" was due on {{due_date}}',
      },
      // behaviour_task_overdue — in_app ar
      {
        template_key: 'behaviour_task_overdue',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'متأخرة: المهمة "{{task_title}}" كانت مستحقة بتاريخ {{due_date}}',
      },

      // ─── Behaviour Digest ─────────────────────────────────────────────────

      // behaviour_digest_parent — email en
      {
        template_key: 'behaviour_digest_parent',
        channel: 'email',
        locale: 'en',
        subject_template: 'Behaviour Digest for {{student_name}}',
        body_template:
          'Dear {{parent_name}},\n\nHere is a summary of recent behaviour incidents for {{student_name}}.\n\n**Total Incidents:** {{total_incidents}}\n\nPlease log in to the parent portal for full details.\n\nRegards,\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_digest_parent — email ar
      {
        template_key: 'behaviour_digest_parent',
        channel: 'email',
        locale: 'ar',
        subject_template: 'ملخص السلوك لـ {{student_name}}',
        body_template:
          'عزيزي {{parent_name}}،\n\nإليك ملخص بالحوادث السلوكية الأخيرة لـ {{student_name}}.\n\n**إجمالي الحوادث:** {{total_incidents}}\n\nيرجى تسجيل الدخول إلى بوابة أولياء الأمور للاطلاع على التفاصيل الكاملة.\n\nمع التحية،\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // behaviour_digest_parent — in_app en
      {
        template_key: 'behaviour_digest_parent',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'Behaviour digest: {{total_incidents}} incidents recorded for {{student_name}}',
      },
      // behaviour_digest_parent — in_app ar
      {
        template_key: 'behaviour_digest_parent',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'ملخص السلوك: {{total_incidents}} حوادث مسجلة لـ {{student_name}}',
      },

      // ─── Behaviour Documents ──────────────────────────────────────────────

      // behaviour_document_review — in_app only en
      {
        template_key: 'behaviour_document_review',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'Document ready for review: {{document_type}} for {{student_name}}',
      },
      // behaviour_document_review — in_app only ar
      {
        template_key: 'behaviour_document_review',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'المستند جاهز للمراجعة: {{document_type}} لـ {{student_name}}',
      },

      // ─── Safeguarding ─────────────────────────────────────────────────────

      // safeguarding_concern_reported — in_app only en
      {
        template_key: 'safeguarding_concern_reported',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template: 'New safeguarding concern reported: {{concern_number}}',
      },
      // safeguarding_concern_reported — in_app only ar
      {
        template_key: 'safeguarding_concern_reported',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم الإبلاغ عن قلق جديد بشأن الحماية: {{concern_number}}',
      },

      // safeguarding_critical_escalation — email en
      {
        template_key: 'safeguarding_critical_escalation',
        channel: 'email',
        locale: 'en',
        subject_template: 'URGENT: Safeguarding Escalation — {{concern_number}}',
        body_template:
          'URGENT SAFEGUARDING NOTICE\n\nA safeguarding concern has been escalated and requires your immediate attention.\n\n**Concern Number:** {{concern_number}}\n\nPlease log in to the safeguarding module immediately to review this case.\n\nThis is an automated notification. Do not reply to this email.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_critical_escalation — email ar
      {
        template_key: 'safeguarding_critical_escalation',
        channel: 'email',
        locale: 'ar',
        subject_template: 'عاجل: تصعيد حماية — {{concern_number}}',
        body_template:
          'إشعار حماية عاجل\n\nتم تصعيد قلق يتعلق بالحماية ويتطلب اهتمامكم الفوري.\n\n**رقم القلق:** {{concern_number}}\n\nيرجى تسجيل الدخول إلى وحدة الحماية فوراً لمراجعة هذه الحالة.\n\nهذا إشعار تلقائي. لا ترد على هذا البريد الإلكتروني.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_critical_escalation — in_app en
      {
        template_key: 'safeguarding_critical_escalation',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'URGENT: Safeguarding escalation requires immediate attention — {{concern_number}}',
      },
      // safeguarding_critical_escalation — in_app ar
      {
        template_key: 'safeguarding_critical_escalation',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'عاجل: تصعيد حماية يتطلب اهتماماً فورياً — {{concern_number}}',
      },

      // safeguarding_reporter_ack — in_app only en
      {
        template_key: 'safeguarding_reporter_ack',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'Your safeguarding concern {{concern_number}} has been received and is being reviewed',
      },
      // safeguarding_reporter_ack — in_app only ar
      {
        template_key: 'safeguarding_reporter_ack',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'تم استلام قلقكم بشأن الحماية {{concern_number}} وجاري مراجعته',
      },

      // safeguarding_sla_breach — email en
      {
        template_key: 'safeguarding_sla_breach',
        channel: 'email',
        locale: 'en',
        subject_template: 'SLA Breach: Safeguarding Concern {{concern_number}}',
        body_template:
          'ATTENTION REQUIRED\n\nThe safeguarding concern {{concern_number}} has breached its SLA.\n\n**SLA Due:** {{sla_due_time}}\n\nThis case requires immediate action. Please log in to the safeguarding module to review.\n\nThis is an automated notification. Do not reply to this email.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_sla_breach — email ar
      {
        template_key: 'safeguarding_sla_breach',
        channel: 'email',
        locale: 'ar',
        subject_template: 'تجاوز مستوى الخدمة: قلق الحماية {{concern_number}}',
        body_template:
          'يتطلب الانتباه\n\nقلق الحماية {{concern_number}} قد تجاوز مستوى الخدمة المتفق عليه.\n\n**موعد الاستحقاق:** {{sla_due_time}}\n\nهذه الحالة تتطلب إجراءً فورياً. يرجى تسجيل الدخول إلى وحدة الحماية للمراجعة.\n\nهذا إشعار تلقائي. لا ترد على هذا البريد الإلكتروني.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_sla_breach — in_app en
      {
        template_key: 'safeguarding_sla_breach',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'SLA breached for safeguarding concern {{concern_number}} — due {{sla_due_time}}',
      },
      // safeguarding_sla_breach — in_app ar
      {
        template_key: 'safeguarding_sla_breach',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template:
          'تم تجاوز مستوى الخدمة لقلق الحماية {{concern_number}} — المستحق {{sla_due_time}}',
      },

      // safeguarding_break_glass_review — email en
      {
        template_key: 'safeguarding_break_glass_review',
        channel: 'email',
        locale: 'en',
        subject_template: 'Break-Glass Access Review Required',
        body_template:
          'SECURITY REVIEW REQUIRED\n\nA break-glass access session has expired and requires review.\n\n**Concern Number:** {{concern_number}}\n\nPlease log in to review the access log and confirm the actions taken were appropriate.\n\nThis is an automated notification. Do not reply to this email.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_break_glass_review — email ar
      {
        template_key: 'safeguarding_break_glass_review',
        channel: 'email',
        locale: 'ar',
        subject_template: 'مراجعة وصول طارئ مطلوبة',
        body_template:
          'مراجعة أمنية مطلوبة\n\nانتهت جلسة الوصول الطارئ وتحتاج إلى مراجعة.\n\n**رقم القلق:** {{concern_number}}\n\nيرجى تسجيل الدخول لمراجعة سجل الوصول والتأكد من أن الإجراءات المتخذة كانت مناسبة.\n\nهذا إشعار تلقائي. لا ترد على هذا البريد الإلكتروني.\n\n{{school_name}}\n\n{{unsubscribe_link}}',
      },
      // safeguarding_break_glass_review — in_app en
      {
        template_key: 'safeguarding_break_glass_review',
        channel: 'in_app',
        locale: 'en',
        subject_template: null,
        body_template:
          'Break-glass access session expired for {{concern_number}} — review required',
      },
      // safeguarding_break_glass_review — in_app ar
      {
        template_key: 'safeguarding_break_glass_review',
        channel: 'in_app',
        locale: 'ar',
        subject_template: null,
        body_template: 'انتهت جلسة الوصول الطارئ لـ {{concern_number}} — مراجعة مطلوبة',
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
