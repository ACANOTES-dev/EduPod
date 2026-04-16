/**
 * One-off provisioning script for the Scheduling stress-test environment.
 *
 * Creates two tenants on the target database (idempotent):
 *   - stress-a (primary stress-test tenant)
 *   - stress-b (secondary, for RLS-isolation scenario STRESS-079)
 *
 * Each tenant is provisioned with:
 *   - Domain (stress-a.edupod.app / stress-b.edupod.app, marked verified)
 *   - Branding, settings, module rows, notification settings, sequences
 *   - Tenant-scoped system roles + role permissions
 *   - Inbox defaults
 *   - Three users: admin, principal, teacher (teacher also gets a staff_profile)
 *
 * Defaults are Ireland-aligned: Europe/Dublin, EUR, DD/MM/YYYY, en locale,
 * academic year starts September.
 *
 * Run on production (bypasses the seed.ts NODE_ENV guard by only touching
 * stress-* tenants):
 *   cd /opt/edupod/app && npx tsx packages/prisma/scripts/create-stress-tenants.ts
 *
 * Idempotent — safe to re-run. Outputs credentials on success.
 */
/* eslint-disable no-console -- provisioning script uses console for progress */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { seedInboxDefaultsForTenant } from '../src/inbox-defaults';
import { SYSTEM_ROLES } from '../seed/system-roles';

// Use the migrate URL (edupod_admin role with BYPASSRLS) because we are
// provisioning cross-tenant rows that the regular edupod_app role can't
// insert due to RLS policies on tenant_domains, tenant_settings, etc.
const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const PASSWORD = 'StressTest2026!';
const BCRYPT_ROUNDS = 10;

// Module / notification / sequence keys mirror seed.ts. Kept inline so the
// script is self-contained and doesn't drift silently if seed.ts changes.
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
    // SCHED-023: default to "override wins" policy for class-subject
    // requirements; flip to true on a tenant to reject mismatched overrides
    // at scheduling-run preflight.
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

interface StressTenantDef {
  name: string;
  slug: string;
  domain: string;
}

const STRESS_TENANTS: StressTenantDef[] = [
  { name: 'Stress Test School A', slug: 'stress-a', domain: 'stress-a.edupod.app' },
  { name: 'Stress Test School B', slug: 'stress-b', domain: 'stress-b.edupod.app' },
  { name: 'Stress Test School C', slug: 'stress-c', domain: 'stress-c.edupod.app' },
  { name: 'Stress Test School D', slug: 'stress-d', domain: 'stress-d.edupod.app' },
];

interface UserSeed {
  email_prefix: string;
  first_name: string;
  last_name: string;
  role_key: 'admin' | 'school_principal' | 'teacher';
}

const USERS_PER_TENANT: UserSeed[] = [
  { email_prefix: 'admin', first_name: 'Stress', last_name: 'Admin', role_key: 'admin' },
  {
    email_prefix: 'principal',
    first_name: 'Stress',
    last_name: 'Principal',
    role_key: 'school_principal',
  },
  { email_prefix: 'teacher', first_name: 'Stress', last_name: 'Teacher', role_key: 'teacher' },
];

async function provisionTenant(
  def: StressTenantDef,
  permissionMap: Map<string, string>,
  passwordHash: string,
): Promise<void> {
  console.log(`\n=== ${def.slug} ===`);

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: def.slug },
    update: {},
    create: {
      name: def.name,
      slug: def.slug,
      default_locale: 'en',
      timezone: 'Europe/Dublin',
      date_format: 'DD/MM/YYYY',
      currency_code: 'EUR',
      academic_year_start_month: 9,
    },
  });
  console.log(`  tenant: ${tenant.id}`);

  // 2. Domain
  const existingDomain = await prisma.tenantDomain.findUnique({ where: { domain: def.domain } });
  if (!existingDomain) {
    await prisma.tenantDomain.create({
      data: {
        tenant_id: tenant.id,
        domain: def.domain,
        domain_type: 'app',
        is_primary: true,
        verification_status: 'verified',
        ssl_status: 'active',
      },
    });
  }

  // 3. Branding
  await prisma.tenantBranding.upsert({
    where: { tenant_id: tenant.id },
    update: {},
    create: { tenant_id: tenant.id, school_name_display: def.name },
  });

  // 4. Settings
  await prisma.tenantSetting.upsert({
    where: { tenant_id: tenant.id },
    update: {},
    create: { tenant_id: tenant.id, settings: DEFAULT_SETTINGS },
  });

  // 5. Modules
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

  // 6. Notification settings
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

  // 7. Sequences
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

  // 8. Tenant-scoped system roles + role permissions
  const tenantRoles = SYSTEM_ROLES.filter((r) => r.role_key !== 'platform_owner');
  const roleIdByKey = new Map<string, string>();
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
    roleIdByKey.set(roleDef.role_key, role.id);

    for (const permKey of roleDef.default_permissions) {
      const permId = permissionMap.get(permKey);
      if (!permId) continue;
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

  // 8b. Stress-tenant override: grant the admin role ALL permissions.
  // Real-tenant admins run on the canonical SYSTEM_ROLES subset, but the
  // stress tenants need their admin account to exercise every endpoint
  // (solver trigger, substitutions, reports, offers, personal-view APIs).
  // This is scoped to stress-* tenants only — SYSTEM_ROLES in seed.ts
  // remains the source of truth for production.
  const adminRoleId = roleIdByKey.get('admin');
  if (adminRoleId) {
    let granted = 0;
    for (const [permKey, permId] of permissionMap) {
      // Skip platform-level permissions — they belong to platform_owner.
      if (permKey.startsWith('platform.') || permKey.startsWith('tenants.')) continue;
      const existing = await prisma.rolePermission.findUnique({
        where: { role_id_permission_id: { role_id: adminRoleId, permission_id: permId } },
      });
      if (!existing) {
        await prisma.rolePermission.create({
          data: { role_id: adminRoleId, permission_id: permId, tenant_id: tenant.id },
        });
        granted++;
      }
    }
    if (granted > 0) console.log(`  admin role: granted ${granted} additional permissions`);
  }

  // 9. Inbox defaults (idempotent)
  await seedInboxDefaultsForTenant(prisma, tenant.id);

  // 10. Users + memberships + roles
  for (const u of USERS_PER_TENANT) {
    const email = `${u.email_prefix}@${def.slug}.test`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password_hash: passwordHash,
        first_name: u.first_name,
        last_name: u.last_name,
        preferred_locale: 'en',
        global_status: 'active',
        email_verified_at: new Date(),
      },
    });

    const membership = await prisma.tenantMembership.upsert({
      where: { idx_tenant_memberships_tenant_user: { tenant_id: tenant.id, user_id: user.id } },
      update: {},
      create: {
        tenant_id: tenant.id,
        user_id: user.id,
        membership_status: 'active',
        joined_at: new Date(),
      },
    });

    const roleId = roleIdByKey.get(u.role_key);
    if (roleId) {
      const existing = await prisma.membershipRole.findUnique({
        where: { membership_id_role_id: { membership_id: membership.id, role_id: roleId } },
      });
      if (!existing) {
        await prisma.membershipRole.create({
          data: { membership_id: membership.id, role_id: roleId, tenant_id: tenant.id },
        });
      }
    }

    // Teacher needs a staff_profile so the scheduler can see them
    if (u.role_key === 'teacher') {
      const existing = await prisma.staffProfile.findFirst({
        where: { tenant_id: tenant.id, user_id: user.id },
      });
      if (!existing) {
        await prisma.staffProfile.create({
          data: {
            tenant_id: tenant.id,
            user_id: user.id,
            staff_number: `T-${def.slug}-001`,
            employment_status: 'active',
            employment_type: 'full_time',
          },
        });
      }
    }

    console.log(`  user: ${email} (${u.role_key})`);
  }
}

async function main() {
  const permissions = await prisma.permission.findMany();
  const permissionMap = new Map(permissions.map((p) => [p.permission_key, p.id]));
  console.log(`Loaded ${permissionMap.size} permissions from DB`);

  const passwordHash = await hash(PASSWORD, BCRYPT_ROUNDS);

  for (const def of STRESS_TENANTS) {
    await provisionTenant(def, permissionMap, passwordHash);
  }

  console.log('\n=============== STRESS TEST CREDENTIALS ===============');
  console.log(`Password (all accounts): ${PASSWORD}`);
  console.log('');
  for (const t of STRESS_TENANTS) {
    console.log(`${t.name}`);
    console.log(`  URL: https://${t.domain}`);
    for (const u of USERS_PER_TENANT) {
      console.log(`  ${u.role_key.padEnd(18)}  ${u.email_prefix}@${t.slug}.test`);
    }
    console.log('');
  }
  console.log('========================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
