import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { seedInboxDefaultsForTenant } from '@school/prisma';
import {
  MODULE_KEYS,
  NOTIFICATION_TYPES,
  SEQUENCE_TYPES,
  SYSTEM_ROLE_PERMISSIONS,
  type RoleTier,
} from '@school/shared';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { TokenService } from '../auth/auth-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { RedisService } from '../redis/redis.service';

import type { CreateTenantDto } from './dto/create-tenant.dto';
import type { UpdateTenantDto } from './dto/update-tenant.dto';

/**
 * Tenant-scoped system role definitions.
 * Platform_owner is excluded — it is a global role (no tenant_id).
 */
const TENANT_SYSTEM_ROLES: Array<{
  role_key: string;
  display_name: string;
  role_tier: RoleTier;
}> = [
  { role_key: 'school_principal', display_name: 'School Principal', role_tier: 'admin' },
  { role_key: 'admin', display_name: 'Admin', role_tier: 'admin' },
  { role_key: 'teacher', display_name: 'Teacher', role_tier: 'staff' },
  { role_key: 'accounting', display_name: 'Accounting', role_tier: 'admin' },
  { role_key: 'front_office', display_name: 'Front Office', role_tier: 'admin' },
  { role_key: 'parent', display_name: 'Parent', role_tier: 'parent' },
  { role_key: 'school_vice_principal', display_name: 'School Vice-Principal', role_tier: 'admin' },
  { role_key: 'student', display_name: 'Student', role_tier: 'parent' },
];

const DEFAULT_SETTINGS = {
  attendance: {
    allowTeacherAmendment: false,
    autoLockAfterDays: null,
    pendingAlertTimeHour: 14,
  },
  gradebook: {
    defaultMissingGradePolicy: 'exclude',
    requireGradeComment: false,
  },
  admissions: {
    requireApprovalForAcceptance: true,
  },
  finance: {
    requireApprovalForInvoiceIssue: false,
    defaultPaymentTermDays: 30,
    allowPartialPayment: true,
  },
  communications: {
    primaryOutboundChannel: 'email',
    requireApprovalForAnnouncements: true,
  },
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
    maxSolverDurationSeconds: 120,
    preferenceWeights: { low: 1, medium: 2, high: 3 },
    globalSoftWeights: {
      evenSubjectSpread: 2,
      minimiseTeacherGaps: 1,
      roomConsistency: 1,
      workloadBalance: 1,
    },
  },
  approvals: {
    expiryDays: 7,
    reminderAfterHours: 48,
  },
  compliance: {
    auditLogRetentionMonths: 36,
  },
  sen: {
    module_enabled: false,
    default_review_cycle_weeks: 12,
    auto_flag_on_referral: true,
    sna_schedule_format: 'weekly',
    enable_parent_portal_access: true,
    plan_number_prefix: 'SSP',
  },
};

function getDefaultModuleEnabledState(moduleKey: (typeof MODULE_KEYS)[number]): boolean {
  return moduleKey !== 'sen';
}

interface PaginationParams {
  page: number;
  pageSize: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

interface ListTenantsFilter {
  status?: 'active' | 'suspended' | 'archived';
  search?: string;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokenService: TokenService,
    private readonly securityAuditService: SecurityAuditService,
    private readonly authReadFacade: AuthReadFacade,
    private readonly rbacReadFacade: RbacReadFacade,
  ) {}

  /**
   * Create a new tenant with all defaults (domain, branding, settings,
   * modules, notification settings, sequences, system roles + permissions).
   */
  async createTenant(data: CreateTenantDto) {
    // Check slug uniqueness
    const existing = await this.prisma.tenant.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      throw new ConflictException({
        code: 'SLUG_TAKEN',
        message: `Slug "${data.slug}" is already in use`,
      });
    }

    // Create tenant record
    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        default_locale: data.default_locale,
        timezone: data.timezone,
        date_format: data.date_format,
        currency_code: data.currency_code,
        academic_year_start_month: data.academic_year_start_month,
      },
    });

    // Create fallback domain
    const fallbackDomain = `${data.slug}.edupod.app`;
    await this.prisma.tenantDomain.create({
      data: {
        tenant_id: tenant.id,
        domain: fallbackDomain,
        domain_type: 'app',
        verification_status: 'verified',
        ssl_status: 'active',
        is_primary: true,
      },
    });

    // Create default branding
    await this.prisma.tenantBranding.create({
      data: {
        tenant_id: tenant.id,
        school_name_display: data.name,
      },
    });

    // Create default settings (via interactive transaction — cross-module write)
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantSetting.create({
        data: {
          tenant_id: tenant.id,
          settings: DEFAULT_SETTINGS,
        },
      });
    });

    // Create module rows for every supported module. SEN ships disabled by
    // default until the tenant explicitly enables the rollout.
    for (const moduleKey of MODULE_KEYS) {
      await this.prisma.tenantModule.create({
        data: {
          tenant_id: tenant.id,
          module_key: moduleKey,
          is_enabled: getDefaultModuleEnabledState(moduleKey),
        },
      });
    }

    // Create notification settings (all enabled, email channel) — cross-module write
    await this.prisma.$transaction(async (tx) => {
      for (const notificationType of NOTIFICATION_TYPES) {
        await tx.tenantNotificationSetting.create({
          data: {
            tenant_id: tenant.id,
            notification_type: notificationType,
            is_enabled: true,
            channels: ['email'],
          },
        });
      }
    });

    // Create sequences
    for (const sequenceType of SEQUENCE_TYPES) {
      await this.prisma.tenantSequence.create({
        data: {
          tenant_id: tenant.id,
          sequence_type: sequenceType,
          current_value: 0,
        },
      });
    }

    // Create tenant-scoped system roles + assign permissions
    const allPermissions = await this.rbacReadFacade.findAllPermissions();
    const permissionMap = new Map<string, string>();
    for (const p of allPermissions) {
      permissionMap.set(p.permission_key, p.id);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const roleDef of TENANT_SYSTEM_ROLES) {
        const role = await tx.role.create({
          data: {
            tenant_id: tenant.id,
            role_key: roleDef.role_key,
            display_name: roleDef.display_name,
            is_system_role: true,
            role_tier: roleDef.role_tier,
          },
        });

        const permKeys = SYSTEM_ROLE_PERMISSIONS[roleDef.role_key] ?? [];
        for (const permKey of permKeys) {
          const permId = permissionMap.get(permKey);
          if (permId) {
            await tx.rolePermission.create({
              data: {
                role_id: role.id,
                permission_id: permId,
                tenant_id: tenant.id,
              },
            });
          }
        }
      }
    });

    // Seed inbox defaults (tenant_settings_inbox row, 81-row messaging policy
    // matrix, starter safeguarding keyword list). Idempotent — safe to re-run.
    await seedInboxDefaultsForTenant(this.prisma, tenant.id);

    // Return tenant with related data
    return this.getTenant(tenant.id);
  }

  /**
   * List tenants with pagination and optional filters.
   */
  async listTenants(pagination: PaginationParams, filters?: ListTenantsFilter) {
    const { page, pageSize, sort, order } = pagination;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { slug: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Record<string, string> = {};
    const sortField = sort || 'created_at';
    orderBy[sortField] = order || 'desc';

    const [data, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          domains: true,
          branding: true,
          _count: {
            select: { memberships: true },
          },
        },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single tenant with all related configuration data.
   */
  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branding: true,
        settings: true,
        modules: true,
        domains: true,
        sequences: true,
        _count: {
          select: { memberships: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${id}" not found`,
      });
    }

    return tenant;
  }

  /**
   * Update a tenant. Slug is immutable.
   */
  async updateTenant(id: string, data: UpdateTenantDto) {
    // Verify tenant exists
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${id}" not found`,
      });
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data,
    });

    // Invalidate tenant domain caches so new settings take effect
    await this.invalidateTenantDomainCaches(id);

    return updated;
  }

  /**
   * Suspend a tenant. Invalidates all sessions and caches.
   */
  async suspendTenant(id: string, actorUserId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${id}" not found`,
      });
    }

    if (tenant.status === 'suspended') {
      throw new BadRequestException({
        code: 'ALREADY_SUSPENDED',
        message: 'Tenant is already suspended',
      });
    }

    if (tenant.status === 'archived') {
      throw new BadRequestException({
        code: 'ARCHIVED_TENANT',
        message: 'Cannot suspend an archived tenant',
      });
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: 'suspended' },
    });

    const client = this.redis.getClient();

    // Set Redis suspension flag
    await client.set(`tenant:${id}:suspended`, 'true');

    // Invalidate all sessions and caches for this tenant
    await this.invalidateAllTenantSessions(id);
    await this.invalidateTenantDomainCaches(id);

    if (actorUserId) {
      await this.securityAuditService.logTenantStatusChange(
        id,
        actorUserId,
        'suspended',
        tenant.status,
      );
    }

    return updated;
  }

  /**
   * Reactivate a suspended tenant.
   */
  async reactivateTenant(id: string, actorUserId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${id}" not found`,
      });
    }

    if (tenant.status !== 'suspended') {
      throw new BadRequestException({
        code: 'NOT_SUSPENDED',
        message: 'Only suspended tenants can be reactivated',
      });
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: 'active' },
    });

    const client = this.redis.getClient();
    await client.del(`tenant:${id}:suspended`);

    // Invalidate domain caches to pick up new status
    await this.invalidateTenantDomainCaches(id);

    if (actorUserId) {
      await this.securityAuditService.logTenantStatusChange(id, actorUserId, 'active', 'suspended');
    }

    return updated;
  }

  /**
   * Archive a tenant. Invalidates all sessions and caches.
   */
  async archiveTenant(id: string, actorUserId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${id}" not found`,
      });
    }

    if (tenant.status === 'archived') {
      throw new BadRequestException({
        code: 'ALREADY_ARCHIVED',
        message: 'Tenant is already archived',
      });
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status: 'archived' },
    });

    const client = this.redis.getClient();

    // Clean up suspension flag if it was suspended
    await client.del(`tenant:${id}:suspended`);

    // Invalidate all sessions and caches
    await this.invalidateAllTenantSessions(id);
    await this.invalidateTenantDomainCaches(id);

    if (actorUserId) {
      await this.securityAuditService.logTenantStatusChange(
        id,
        actorUserId,
        'archived',
        tenant.status,
      );
    }

    return updated;
  }

  /**
   * Get platform dashboard statistics.
   */
  async getDashboard() {
    const [activeTenants, suspendedTenants, archivedTenants, totalUsers, totalMemberships] =
      await Promise.all([
        this.prisma.tenant.count({ where: { status: 'active' } }),
        this.prisma.tenant.count({ where: { status: 'suspended' } }),
        this.prisma.tenant.count({ where: { status: 'archived' } }),
        this.authReadFacade.countAllUsers(),
        this.rbacReadFacade.countAllActiveMemberships(),
      ]);

    return {
      tenants: {
        active: activeTenants,
        suspended: suspendedTenants,
        archived: archivedTenants,
        total: activeTenants + suspendedTenants + archivedTenants,
      },
      users: {
        total: totalUsers,
        active_memberships: totalMemberships,
      },
    };
  }

  /**
   * Impersonate a user at a specific tenant. Returns a read-only JWT.
   */
  async impersonate(targetTenantId: string, targetUserId: string, platformUserId: string) {
    // Verify the target tenant exists and is active
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: targetTenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${targetTenantId}" not found`,
      });
    }

    // Find the target user's membership at this tenant
    const membership = await this.rbacReadFacade.findMembershipWithUser(
      targetTenantId,
      targetUserId,
    );

    if (!membership) {
      throw new NotFoundException({
        code: 'MEMBERSHIP_NOT_FOUND',
        message: 'User does not have an active membership at this tenant',
      });
    }

    // Generate a special impersonation JWT
    const accessToken = this.tokenService.signAccessToken({
      sub: targetUserId,
      email: membership.user.email,
      tenant_id: targetTenantId,
      membership_id: membership.id,
    });

    return {
      access_token: accessToken,
      impersonating: true,
      impersonator_id: platformUserId,
      target_user: {
        id: membership.user.id,
        email: membership.user.email,
        first_name: membership.user.first_name,
        last_name: membership.user.last_name,
      },
      target_tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }

  /**
   * Reset MFA for a user. Disables MFA and deletes recovery codes.
   */
  async resetUserMfa(userId: string, actorUserId?: string) {
    const user = await this.authReadFacade.findUserById('', userId);

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User with id "${userId}" not found`,
      });
    }

    // Disable MFA and clear secret + delete recovery codes (cross-module write via tx)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          mfa_enabled: false,
          mfa_secret: null,
        },
      });

      await tx.mfaRecoveryCode.deleteMany({
        where: { user_id: userId },
      });
    });

    await this.securityAuditService.logMfaDisable(userId, null, 'admin_reset', actorUserId);

    return {
      user_id: userId,
      mfa_reset: true,
    };
  }

  /**
   * List modules for a tenant.
   */
  async listModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }

    return this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
      orderBy: { module_key: 'asc' },
    });
  }

  /**
   * Toggle a module on or off for a tenant.
   */
  async toggleModule(
    tenantId: string,
    moduleKey: string,
    isEnabled: boolean,
    actorUserId?: string,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }

    // Validate module key
    if (!MODULE_KEYS.includes(moduleKey as (typeof MODULE_KEYS)[number])) {
      throw new BadRequestException({
        code: 'INVALID_MODULE_KEY',
        message: `"${moduleKey}" is not a valid module key`,
      });
    }

    const existing = await this.prisma.tenantModule.findFirst({
      where: { tenant_id: tenantId, module_key: moduleKey },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'MODULE_NOT_FOUND',
        message: `Module "${moduleKey}" not found for this tenant`,
      });
    }

    const result = await this.prisma.tenantModule.update({
      where: { id: existing.id },
      data: { is_enabled: isEnabled },
    });

    if (actorUserId) {
      await this.securityAuditService.logModuleToggle(tenantId, actorUserId, moduleKey, isEnabled);
    }

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Invalidate all cached domain → tenant mappings for a tenant.
   */
  private async invalidateTenantDomainCaches(tenantId: string) {
    const domains = await this.prisma.tenantDomain.findMany({
      where: { tenant_id: tenantId },
      select: { domain: true },
    });

    const client = this.redis.getClient();
    const pipeline = client.pipeline();
    for (const d of domains) {
      pipeline.del(`tenant_domain:${d.domain}`);
    }
    await pipeline.exec();
  }

  /**
   * Invalidate all sessions for all users who have memberships at this tenant.
   */
  private async invalidateAllTenantSessions(tenantId: string) {
    const memberships = await this.rbacReadFacade.findMembershipUserIds(tenantId);

    const client = this.redis.getClient();

    // Delete all user sessions
    for (const m of memberships) {
      const sessionIds = await client.smembers(`user_sessions:${m.user_id}`);
      if (sessionIds.length > 0) {
        const keys = sessionIds.map((sid) => `session:${sid}`);
        await client.del(...keys);
      }
      await client.del(`user_sessions:${m.user_id}`);
    }

    // Invalidate permission caches
    const pipeline = client.pipeline();
    for (const m of memberships) {
      pipeline.del(`permissions:${m.id}`);
    }
    await pipeline.exec();
  }
}
