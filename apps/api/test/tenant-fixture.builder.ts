/* eslint-disable school/no-raw-sql-outside-rls -- test setup/teardown bypasses RLS */
/**
 * Per-test tenant fixture builder.
 *
 * Provisions a fresh, auth-ready tenant for a single test file so that tests
 * never race on shared tenant state. Replaces the "log in as al-noor" pattern
 * that forces Jest to run integration tests with --maxWorkers=2.
 *
 * By default the fixture is **auth-ready**: owner/admin/teacher/parent users
 * with proper bcrypt hashes, all system roles with permissions, all modules
 * enabled (minus SEN), tenant settings, sequences, notification settings.
 *
 * For pure direct-DB RLS tests that don't need HTTP auth, pass
 * `{ authReady: false }` to skip the user/role/module seed (~20× faster).
 */
import { randomUUID } from 'crypto';

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

import { SYSTEM_ROLES } from '../../../packages/prisma/seed/system-roles';
import { seedInboxDefaultsForTenant } from '../../../packages/prisma/src/inbox-defaults';

// ─── Seed constants (mirrored from packages/prisma/seed.ts) ──────────────────
// Duplicated inline rather than imported so the fixture has no dependency on
// seed.ts's private structure. If a new module/notification/sequence type is
// added to prod, bump it here too — the fixture tests will flag mismatches.

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
] as const;

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
] as const;

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
] as const;

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

// ─── User/role mapping ───────────────────────────────────────────────────────

export type FixtureUserKey = 'owner' | 'admin' | 'teacher' | 'parent';

const USER_ROLE_KEY_MAP: Record<FixtureUserKey, string> = {
  owner: 'school_principal',
  admin: 'admin',
  teacher: 'teacher',
  parent: 'parent',
};

export const FIXTURE_PASSWORD = 'Password123!';

// ─── Public types ────────────────────────────────────────────────────────────

export interface TenantFixtureOptions {
  /** Tenant name shown in UI. Default: auto-generated. */
  name?: string;
  /** Tenant slug. Default: auto-generated timestamp + uuid suffix. */
  slug?: string;
  /** Tenant domain. Default: `${slug}.test.edupod.app`. */
  domain?: string;
  /**
   * When true, provision users/modules/roles/permissions so HTTP login works.
   * Default: true. Pass false only for pure direct-DB RLS tests.
   */
  authReady?: boolean;
  /**
   * Which standard users to provision (all get FIXTURE_PASSWORD).
   * Default: ['owner', 'admin', 'teacher', 'parent'].
   * Narrow this to speed up per-test fixture creation.
   */
  users?: FixtureUserKey[];
  /**
   * Provision inbox_defaults (81-row policy matrix + safeguarding keywords).
   * Default: false. Inbox tests opt in by setting true.
   */
  includeInboxDefaults?: boolean;
}

export interface TenantFixture {
  // Base
  tenantId: string;
  domainName: string;
  academicYearId: string;
  classId: string;
  yearGroupId: string;
  roomId: string;
  householdId: string;
  studentId: string;

  // Owner — always present (even when authReady=false, the owner user exists
  // but with a mock password; use `password` + `ownerEmail` to log in when
  // authReady=true).
  ownerUserId: string;
  ownerEmail: string;
  /** @deprecated Use `ownerStaffProfileId`. Kept for backwards compatibility. */
  staffProfileId: string;
  ownerStaffProfileId: string;

  // Role-specific — present only when the user was included in `options.users`
  adminUserId?: string;
  adminEmail?: string;
  teacherUserId?: string;
  teacherEmail?: string;
  teacherStaffProfileId?: string;
  parentUserId?: string;
  parentEmail?: string;
  parentId?: string;

  /** The plain-text password for every user on this fixture. */
  password: string;
}

// ─── Module-scoped caches ────────────────────────────────────────────────────

let cachedPermissionMap: Map<string, string> | null = null;

async function getPermissionMap(prisma: PrismaClient): Promise<Map<string, string>> {
  if (cachedPermissionMap) return cachedPermissionMap;
  const perms = await prisma.permission.findMany();
  const map = new Map<string, string>();
  for (const p of perms) map.set(p.permission_key, p.id);
  cachedPermissionMap = map;
  return map;
}

let cachedPasswordHash: string | null = null;

async function getPasswordHash(): Promise<string> {
  if (!cachedPasswordHash) {
    cachedPasswordHash = await hash(FIXTURE_PASSWORD, 10);
  }
  return cachedPasswordHash;
}

// ─── Core builder ────────────────────────────────────────────────────────────

function getDefaultModuleEnabledState(moduleKey: string): boolean {
  return moduleKey !== 'sen';
}

export async function createTenantFixture(
  prisma: PrismaClient,
  options: TenantFixtureOptions = {},
): Promise<TenantFixture> {
  const authReady = options.authReady ?? true;
  const users = options.users ?? ['owner', 'admin', 'teacher', 'parent'];
  const includeInboxDefaults = options.includeInboxDefaults ?? false;

  const ts = Date.now();
  const suffix = randomUUID().substring(0, 8);
  const slug = options.slug ?? `fixture-${ts}-${suffix}`;
  const name = options.name ?? `Fixture School ${suffix}`;
  const domainName = options.domain ?? `${slug}.test.edupod.app`;

  // 1. Tenant + domain
  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      default_locale: 'en',
      timezone: 'Europe/Dublin',
      date_format: 'DD/MM/YYYY',
      currency_code: 'EUR',
      academic_year_start_month: 9,
    },
  });
  const tenantId = tenant.id;

  await prisma.tenantDomain.create({
    data: {
      tenant_id: tenantId,
      domain: domainName,
      domain_type: 'app',
      is_primary: true,
      verification_status: 'verified',
      ssl_status: 'active',
    },
  });

  // 2. Auth-ready: branding, settings, modules, sequences, notifications, roles, permissions
  let roleIdByKey = new Map<string, string>();
  if (authReady) {
    roleIdByKey = await provisionAuthReadyTenant(prisma, tenantId, name);
  }

  // 3. Owner user (always present — required for base fixture entities that
  //    reference a user id, e.g. attendance_sessions.submitted_by_user_id in
  //    downstream seeding).
  const passwordHash = authReady ? await getPasswordHash() : 'mock-hash';
  const ownerEmail = `owner-${suffix}@${domainName}`;
  const ownerUser = await prisma.user.create({
    data: {
      email: ownerEmail,
      password_hash: passwordHash,
      first_name: 'Fixture',
      last_name: 'Owner',
      global_status: 'active',
      email_verified_at: new Date(),
    },
  });
  const ownerUserId = ownerUser.id;

  const ownerMembership = await prisma.tenantMembership.create({
    data: {
      tenant_id: tenantId,
      user_id: ownerUserId,
      membership_status: 'active',
      joined_at: new Date(),
    },
  });

  if (authReady && users.includes('owner')) {
    const ownerRoleId = roleIdByKey.get(USER_ROLE_KEY_MAP.owner);
    if (ownerRoleId) {
      await prisma.membershipRole.create({
        data: {
          membership_id: ownerMembership.id,
          role_id: ownerRoleId,
          tenant_id: tenantId,
        },
      });
    }
  }

  const ownerStaff = await prisma.staffProfile.create({
    data: {
      tenant_id: tenantId,
      user_id: ownerUserId,
      staff_number: `ST-OWN-${suffix}`,
      employment_status: 'active',
      employment_type: 'full_time',
      job_title: 'Principal',
    },
  });

  // 4. Other users (admin, teacher, parent) — only when requested + auth-ready
  let adminUserId: string | undefined;
  let adminEmail: string | undefined;
  let teacherUserId: string | undefined;
  let teacherEmail: string | undefined;
  let teacherStaffProfileId: string | undefined;
  let parentUserId: string | undefined;
  let parentEmail: string | undefined;
  let parentId: string | undefined;

  if (authReady) {
    if (users.includes('admin')) {
      adminEmail = `admin-${suffix}@${domainName}`;
      const result = await createTenantUser(prisma, {
        tenantId,
        email: adminEmail,
        firstName: 'Fixture',
        lastName: 'Admin',
        passwordHash,
        roleId: roleIdByKey.get(USER_ROLE_KEY_MAP.admin),
      });
      adminUserId = result.userId;
    }

    if (users.includes('teacher')) {
      teacherEmail = `teacher-${suffix}@${domainName}`;
      const result = await createTenantUser(prisma, {
        tenantId,
        email: teacherEmail,
        firstName: 'Fixture',
        lastName: 'Teacher',
        passwordHash,
        roleId: roleIdByKey.get(USER_ROLE_KEY_MAP.teacher),
      });
      teacherUserId = result.userId;
      const teacherStaff = await prisma.staffProfile.create({
        data: {
          tenant_id: tenantId,
          user_id: teacherUserId,
          staff_number: `ST-TCH-${suffix}`,
          employment_status: 'active',
          employment_type: 'full_time',
          job_title: 'Teacher',
        },
      });
      teacherStaffProfileId = teacherStaff.id;
    }

    if (users.includes('parent')) {
      parentEmail = `parent-${suffix}@${domainName}`;
      const result = await createTenantUser(prisma, {
        tenantId,
        email: parentEmail,
        firstName: 'Fixture',
        lastName: 'Parent',
        passwordHash,
        roleId: roleIdByKey.get(USER_ROLE_KEY_MAP.parent),
      });
      parentUserId = result.userId;
      const parentRecord = await prisma.parent.create({
        data: {
          tenant_id: tenantId,
          user_id: parentUserId,
          first_name: 'Fixture',
          last_name: 'Parent',
          email: parentEmail,
          preferred_contact_channels: ['email'],
          is_primary_contact: true,
        },
      });
      parentId = parentRecord.id;
    }
  }

  // 5. Inbox defaults (opt-in)
  if (authReady && includeInboxDefaults) {
    await seedInboxDefaultsForTenant(prisma, tenantId);
  }

  // 6. Base entities (academic year, year group, class, room, household, student)
  const year = new Date().getFullYear();
  const ay = await prisma.academicYear.create({
    data: {
      tenant_id: tenantId,
      name: `AY ${year}-${year + 1}`,
      start_date: new Date(`${year}-09-01`),
      end_date: new Date(`${year + 1}-06-30`),
      status: 'active',
    },
  });
  const yg = await prisma.yearGroup.create({
    data: {
      tenant_id: tenantId,
      name: 'Fixture Year Group',
      display_order: 1,
    },
  });
  const cls = await prisma.class.create({
    data: {
      tenant_id: tenantId,
      academic_year_id: ay.id,
      year_group_id: yg.id,
      name: 'Fixture Class',
      max_capacity: 30,
      status: 'active',
    },
  });
  const room = await prisma.room.create({
    data: {
      tenant_id: tenantId,
      name: `Fixture Room ${suffix}`,
      room_type: 'classroom',
      capacity: 30,
      is_exclusive: false,
    },
  });
  const household = await prisma.household.create({
    data: {
      tenant_id: tenantId,
      household_name: 'Fixture Family',
      status: 'active',
    },
  });
  const student = await prisma.student.create({
    data: {
      tenant_id: tenantId,
      household_id: household.id,
      student_number: `STU-${suffix}`,
      first_name: 'Fixture',
      last_name: 'Student',
      date_of_birth: new Date('2015-01-01'),
      status: 'active',
      gender: 'other',
      national_id: `NID-FIX-${suffix}`,
      nationality: 'Irish',
    },
  });

  await prisma.classEnrolment.create({
    data: {
      tenant_id: tenantId,
      class_id: cls.id,
      student_id: student.id,
      start_date: new Date(`${year}-09-01`),
      status: 'active',
    },
  });

  return {
    tenantId,
    domainName,
    academicYearId: ay.id,
    classId: cls.id,
    yearGroupId: yg.id,
    roomId: room.id,
    householdId: household.id,
    studentId: student.id,
    ownerUserId,
    ownerEmail,
    staffProfileId: ownerStaff.id,
    ownerStaffProfileId: ownerStaff.id,
    adminUserId,
    adminEmail,
    teacherUserId,
    teacherEmail,
    teacherStaffProfileId,
    parentUserId,
    parentEmail,
    parentId,
    password: FIXTURE_PASSWORD,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function provisionAuthReadyTenant(
  prisma: PrismaClient,
  tenantId: string,
  name: string,
): Promise<Map<string, string>> {
  const permissionMap = await getPermissionMap(prisma);

  // Branding + settings
  await prisma.tenantBranding.create({
    data: { tenant_id: tenantId, school_name_display: name },
  });
  await prisma.tenantSetting.create({
    data: { tenant_id: tenantId, settings: DEFAULT_SETTINGS },
  });

  // Modules — createMany batch
  await prisma.tenantModule.createMany({
    data: MODULE_KEYS.map((mk) => ({
      tenant_id: tenantId,
      module_key: mk,
      is_enabled: getDefaultModuleEnabledState(mk),
    })),
    skipDuplicates: true,
  });

  // Notifications — createMany batch
  await prisma.tenantNotificationSetting.createMany({
    data: NOTIFICATION_TYPES.map((nt) => ({
      tenant_id: tenantId,
      notification_type: nt,
      is_enabled: true,
      channels: ['email'],
    })),
    skipDuplicates: true,
  });

  // Sequences — createMany batch
  await prisma.tenantSequence.createMany({
    data: SEQUENCE_TYPES.map((st) => ({
      tenant_id: tenantId,
      sequence_type: st,
      current_value: 0,
    })),
    skipDuplicates: true,
  });

  // Roles — provision ALL tenant-scoped system roles, not just the ones for
  // the requested `users`. Many service-layer flows assume a role exists even
  // when no test user carries it (e.g. POST /students auto-creates a parent
  // user and assigns the `parent` role, which blows up with "tenant has no
  // role with key 'parent'" if that role was skipped).
  const tenantRoleDefs = SYSTEM_ROLES.filter((r) => r.role_key !== 'platform_owner');

  const roleIdByKey = new Map<string, string>();
  const rolePermissionRows: Array<{ role_id: string; permission_id: string; tenant_id: string }> =
    [];

  for (const def of tenantRoleDefs) {
    const role = await prisma.role.create({
      data: {
        tenant_id: tenantId,
        role_key: def.role_key,
        display_name: def.display_name,
        is_system_role: true,
        role_tier: def.role_tier as never,
      },
    });
    roleIdByKey.set(def.role_key, role.id);
    for (const permKey of def.default_permissions) {
      const permId = permissionMap.get(permKey);
      if (permId) {
        rolePermissionRows.push({ role_id: role.id, permission_id: permId, tenant_id: tenantId });
      }
    }
  }

  if (rolePermissionRows.length > 0) {
    await prisma.rolePermission.createMany({
      data: rolePermissionRows,
      skipDuplicates: true,
    });
  }

  return roleIdByKey;
}

async function createTenantUser(
  prisma: PrismaClient,
  opts: {
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    roleId: string | undefined;
  },
): Promise<{ userId: string }> {
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      password_hash: opts.passwordHash,
      first_name: opts.firstName,
      last_name: opts.lastName,
      global_status: 'active',
      email_verified_at: new Date(),
    },
  });
  const membership = await prisma.tenantMembership.create({
    data: {
      tenant_id: opts.tenantId,
      user_id: user.id,
      membership_status: 'active',
      joined_at: new Date(),
    },
  });
  if (opts.roleId) {
    await prisma.membershipRole.create({
      data: {
        membership_id: membership.id,
        role_id: opts.roleId,
        tenant_id: opts.tenantId,
      },
    });
  }
  return { userId: user.id };
}

// ─── Teardown ────────────────────────────────────────────────────────────────

/**
 * Deletes a fixture's tenant (cascades to all tenant-scoped children) and the
 * platform-level user rows (users are not tenant-scoped, so they must be
 * deleted explicitly).
 *
 * Some tables (pastoral_events, pastoral_concern_versions, audit_logs,
 * behaviour_incident_events, etc.) have DB-level "append-only" triggers that
 * raise on DELETE. We temporarily flip `session_replication_role = replica`
 * so the cascade from DELETE FROM tenants can tear down child rows silently.
 *
 * Idempotent — safe to call multiple times / on a partially-created fixture.
 */
export async function deleteTenantFixture(
  prisma: PrismaClient,
  fixture: Pick<
    TenantFixture,
    'tenantId' | 'ownerUserId' | 'adminUserId' | 'teacherUserId' | 'parentUserId'
  >,
): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
    await prisma.$executeRawUnsafe(`DELETE FROM tenants WHERE id = $1::uuid`, fixture.tenantId);

    const userIds = [
      fixture.ownerUserId,
      fixture.adminUserId,
      fixture.teacherUserId,
      fixture.parentUserId,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    for (const userId of userIds) {
      await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id = $1::uuid`, userId);
    }
  } finally {
    // Always restore trigger mode even on error.
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }
}
