// otplib uses an ESM-only dependency (@scure/base) that cannot be transformed
// by ts-jest. Mock it at the module level so the transitive import chain from
// TenantsService → AuthService → otplib is intercepted before Jest tries to
// load the real ESM package.
jest.mock('otplib', () => ({
  generateSecret: jest.fn().mockReturnValue('TESTSECRET123'),
  generateURI: jest.fn().mockReturnValue('otpauth://totp/test'),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,test'),
}));

import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MODULE_KEYS, NOTIFICATION_TYPES, SEQUENCE_TYPES } from '@school/shared';

import { SecurityAuditService } from '../audit-log/security-audit.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { TenantsService } from './tenants.service';

const mockRedisClient = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  pipeline: jest.fn().mockReturnValue({
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  }),
  smembers: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockAuthService = {
  signAccessToken: jest.fn(),
};

const mockSecurityAuditService = {
  logMfaDisable: jest.fn(),
  logTenantStatusChange: jest.fn().mockResolvedValue(undefined),
  logModuleToggle: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  tenantDomain: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  tenantBranding: {
    create: jest.fn(),
  },
  tenantSetting: {
    create: jest.fn(),
  },
  tenantModule: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  tenantNotificationSetting: {
    create: jest.fn(),
  },
  tenantSequence: {
    create: jest.fn(),
  },
  role: {
    create: jest.fn(),
  },
  rolePermission: {
    create: jest.fn(),
  },
  permission: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  tenantMembership: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  user: {
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  mfaRecoveryCode: {
    deleteMany: jest.fn(),
  },
};

describe('TenantsService', () => {
  let service: TenantsService;

  const isModuleEnabledByDefault = (moduleKey: (typeof MODULE_KEYS)[number]) => moduleKey !== 'sen';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset pipeline mock fresh for each test
    mockRedisClient.pipeline.mockReturnValue({
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('createTenant', () => {
    const createDto: {
      name: string;
      slug: string;
      default_locale: 'en' | 'ar';
      timezone: string;
      date_format: string;
      currency_code: string;
      academic_year_start_month: number;
    } = {
      name: 'Test School',
      slug: 'test-school',
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'DD-MM-YYYY',
      currency_code: 'USD',
      academic_year_start_month: 9,
    };

    const createdTenant = {
      id: 'new-tenant-id',
      name: 'Test School',
      slug: 'test-school',
      status: 'active',
      default_locale: 'en',
      timezone: 'UTC',
      date_format: 'DD-MM-YYYY',
      currency_code: 'USD',
      academic_year_start_month: 9,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const fullTenantWithIncludes = {
      ...createdTenant,
      branding: {
        id: 'branding-1',
        tenant_id: 'new-tenant-id',
        school_name_display: 'Test School',
      },
      settings: { id: 'settings-1', tenant_id: 'new-tenant-id', settings: {} },
      modules: MODULE_KEYS.map((k) => ({
        id: `module-${k}`,
        tenant_id: 'new-tenant-id',
        module_key: k,
        is_enabled: isModuleEnabledByDefault(k),
      })),
      domains: [
        {
          id: 'domain-1',
          tenant_id: 'new-tenant-id',
          domain: 'test-school.edupod.app',
          is_primary: true,
        },
      ],
      sequences: SEQUENCE_TYPES.map((t) => ({
        id: `seq-${t}`,
        tenant_id: 'new-tenant-id',
        sequence_type: t,
        current_value: 0,
      })),
      _count: { memberships: 0 },
    };

    it('should create tenant with all defaults', async () => {
      // Slug uniqueness check returns null (no duplicate)
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(null) // slug uniqueness check
        .mockResolvedValueOnce(fullTenantWithIncludes); // getTenant call at the end

      mockPrisma.tenant.create.mockResolvedValue(createdTenant);
      mockPrisma.tenantDomain.create.mockResolvedValue({});
      mockPrisma.tenantBranding.create.mockResolvedValue({});
      mockPrisma.tenantSetting.create.mockResolvedValue({});
      mockPrisma.tenantModule.create.mockResolvedValue({});
      mockPrisma.tenantNotificationSetting.create.mockResolvedValue({});
      mockPrisma.tenantSequence.create.mockResolvedValue({});
      mockPrisma.role.create.mockResolvedValue({ id: 'role-id' });
      mockPrisma.rolePermission.create.mockResolvedValue({});
      mockPrisma.permission.findMany.mockResolvedValue([]);

      const result = await service.createTenant(createDto);

      // Tenant was created
      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test School',
            slug: 'test-school',
          }),
        }),
      );

      // Fallback domain created with slug
      expect(mockPrisma.tenantDomain.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'new-tenant-id',
            domain: 'test-school.edupod.app',
            is_primary: true,
            verification_status: 'verified',
          }),
        }),
      );

      // Branding created
      expect(mockPrisma.tenantBranding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'new-tenant-id',
            school_name_display: 'Test School',
          }),
        }),
      );

      // Settings created
      expect(mockPrisma.tenantSetting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'new-tenant-id',
          }),
        }),
      );

      // Modules created — one per MODULE_KEY
      expect(mockPrisma.tenantModule.create).toHaveBeenCalledTimes(MODULE_KEYS.length);

      // Each MODULE_KEY created with its default enabled state
      for (const moduleKey of MODULE_KEYS) {
        expect(mockPrisma.tenantModule.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              tenant_id: 'new-tenant-id',
              module_key: moduleKey,
              is_enabled: isModuleEnabledByDefault(moduleKey),
            }),
          }),
        );
      }

      // Notification settings created for every type
      expect(mockPrisma.tenantNotificationSetting.create).toHaveBeenCalledTimes(
        NOTIFICATION_TYPES.length,
      );

      // Sequences created for every type
      expect(mockPrisma.tenantSequence.create).toHaveBeenCalledTimes(SEQUENCE_TYPES.length);

      // Returns the full tenant from getTenant
      expect(result).toEqual(fullTenantWithIncludes);
    });

    it('should reject duplicate slug', async () => {
      // Slug check always returns an existing tenant (permanent mock)
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'existing-id',
        slug: 'test-school',
        name: 'Existing School',
      });

      // Should throw ConflictException with SLUG_TAKEN code
      let caughtError: unknown;
      try {
        await service.createTenant(createDto);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ConflictException);
      expect(caughtError).toMatchObject({ response: { code: expect.any(String) } });
      expect((caughtError as ConflictException).getResponse()).toMatchObject({
        code: 'SLUG_TAKEN',
      });

      // Tenant record must NOT have been created
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  // ─── listTenants tests ──────────────────────────────────────────────────────
  describe('listTenants', () => {
    const tenants = [
      {
        id: 'tenant-1',
        name: 'School 1',
        slug: 'school-1',
        status: 'active',
        created_at: new Date(),
      },
      {
        id: 'tenant-2',
        name: 'School 2',
        slug: 'school-2',
        status: 'suspended',
        created_at: new Date(),
      },
    ];

    beforeEach(() => {
      mockPrisma.tenant.findMany.mockResolvedValue(tenants);
      mockPrisma.tenant.count.mockResolvedValue(2);
    });

    it('should list tenants with pagination', async () => {
      const result = await service.listTenants({ page: 1, pageSize: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 10, total: 2 });
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: expect.objectContaining({ created_at: 'desc' }),
        }),
      );
    });

    it('should filter by status', async () => {
      await service.listTenants({ page: 1, pageSize: 10 }, { status: 'active' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });

    it('should filter by search term', async () => {
      await service.listTenants({ page: 1, pageSize: 10 }, { search: 'School' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.any(Object) }),
              expect.objectContaining({ slug: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });

    it('should apply custom sort and order', async () => {
      await service.listTenants({ page: 2, pageSize: 5, sort: 'name', order: 'asc' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: expect.objectContaining({ name: 'asc' }),
        }),
      );
    });

    it('should include domains, branding, and membership count', async () => {
      await service.listTenants({ page: 1, pageSize: 10 });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            domains: true,
            branding: true,
            _count: expect.objectContaining({
              select: { memberships: true },
            }),
          }),
        }),
      );
    });
  });

  // ─── getTenant tests ─────────────────────────────────────────────────────────
  describe('getTenant', () => {
    const tenantWithRelations = {
      id: 'tenant-1',
      name: 'Test School',
      slug: 'test-school',
      status: 'active',
      branding: { id: 'branding-1' },
      settings: { id: 'settings-1' },
      modules: [{ id: 'module-1', module_key: 'attendance' }],
      domains: [{ id: 'domain-1' }],
      sequences: [{ id: 'sequence-1' }],
      _count: { memberships: 5 },
    };

    it('should return tenant with all relations', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(tenantWithRelations);

      const result = await service.getTenant('tenant-1');

      expect(result).toEqual(tenantWithRelations);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          include: expect.objectContaining({
            branding: true,
            settings: true,
            modules: true,
            domains: true,
            sequences: true,
            _count: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getTenant('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateTenant tests ───────────────────────────────────────────────────────
  describe('updateTenant', () => {
    const updateData = {
      name: 'Updated School Name',
      timezone: 'Europe/London',
    };

    it('should update tenant successfully', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({
        id: 'tenant-1',
        ...updateData,
      });
      mockPrisma.tenantDomain.findMany.mockResolvedValue([{ domain: 'test.edupod.app' }]);

      const result = await service.updateTenant('tenant-1', updateData);

      expect(result.name).toBe('Updated School Name');
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tenant-1' },
          data: updateData,
        }),
      );
    });

    it('should invalidate domain caches after update', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', ...updateData });
      mockPrisma.tenantDomain.findMany.mockResolvedValue([
        { domain: 'domain1.edupod.app' },
        { domain: 'domain2.edupod.app' },
      ]);

      await service.updateTenant('tenant-1', updateData);

      expect(mockRedisClient.pipeline).toHaveBeenCalled();
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.updateTenant('non-existent', updateData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── suspendTenant tests ────────────────────────────────────────────────────
  describe('suspendTenant', () => {
    it('should suspend an active tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      const result = await service.suspendTenant('tenant-1', 'user-1');

      expect(result.status).toBe('suspended');
      expect(mockRedisClient.set).toHaveBeenCalledWith('tenant:tenant-1:suspended', 'true');
      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'suspended',
        'active',
      );
    });

    it('should throw BadRequestException when already suspended', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });

      await expect(service.suspendTenant('tenant-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when tenant is archived', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'archived' });

      await expect(service.suspendTenant('tenant-1')).rejects.toThrow(BadRequestException);
    });

    it('should invalidate all tenant sessions when suspending', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { id: 'membership-1', user_id: 'user-1' },
        { id: 'membership-2', user_id: 'user-2' },
      ]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      await service.suspendTenant('tenant-1');

      expect(mockRedisClient.pipeline).toHaveBeenCalled();
    });

    it('should not log audit when no actor provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      await service.suspendTenant('tenant-1');

      expect(mockSecurityAuditService.logTenantStatusChange).not.toHaveBeenCalled();
    });
  });

  // ─── reactivateTenant tests ─────────────────────────────────────────────────────
  describe('reactivateTenant', () => {
    it('should reactivate a suspended tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      const result = await service.reactivateTenant('tenant-1', 'user-1');

      expect(result.status).toBe('active');
      expect(mockRedisClient.del).toHaveBeenCalledWith('tenant:tenant-1:suspended');
      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'active',
        'suspended',
      );
    });

    it('should throw BadRequestException when tenant is not suspended', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });

      await expect(service.reactivateTenant('tenant-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.reactivateTenant('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── archiveTenant tests ──────────────────────────────────────────────────────
  describe('archiveTenant', () => {
    it('should archive an active tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'archived' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      const result = await service.archiveTenant('tenant-1', 'user-1');

      expect(result.status).toBe('archived');
      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'archived',
        'active',
      );
    });

    it('should archive a suspended tenant and clean up suspension flag', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'archived' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);

      await service.archiveTenant('tenant-1');

      expect(mockRedisClient.del).toHaveBeenCalledWith('tenant:tenant-1:suspended');
    });

    it('should throw BadRequestException when already archived', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'archived' });

      await expect(service.archiveTenant('tenant-1')).rejects.toThrow(BadRequestException);
    });

    it('should invalidate all sessions when archiving', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', status: 'active' });
      mockPrisma.tenant.update.mockResolvedValue({ id: 'tenant-1', status: 'archived' });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { id: 'membership-1', user_id: 'user-1' },
      ]);
      mockPrisma.tenantDomain.findMany.mockResolvedValue([]);
      mockRedisClient.smembers.mockResolvedValue(['session-1', 'session-2']);

      await service.archiveTenant('tenant-1');

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(mockRedisClient.pipeline).toHaveBeenCalled();
    });
  });

  // ─── getDashboard tests ───────────────────────────────────────────────────────
  describe('getDashboard', () => {
    it('should return dashboard statistics', async () => {
      mockPrisma.tenant.count
        .mockResolvedValueOnce(5) // active
        .mockResolvedValueOnce(2) // suspended
        .mockResolvedValueOnce(1); // archived
      mockPrisma.user.count.mockResolvedValue(100);
      mockPrisma.tenantMembership.count.mockResolvedValue(80);

      const result = await service.getDashboard();

      expect(result).toEqual({
        tenants: {
          active: 5,
          suspended: 2,
          archived: 1,
          total: 8,
        },
        users: {
          total: 100,
          active_memberships: 80,
        },
      });
    });

    it('should handle zero counts', async () => {
      mockPrisma.tenant.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      const result = await service.getDashboard();

      expect(result.tenants.total).toBe(0);
      expect(result.users.total).toBe(0);
    });
  });

  // ─── impersonate tests ────────────────────────────────────────────────────────
  describe('impersonate', () => {
    const membership = {
      id: 'membership-1',
      user_id: 'target-user-1',
      tenant_id: 'tenant-1',
      membership_status: 'active',
      user: {
        id: 'target-user-1',
        email: 'target@school.test',
        first_name: 'Target',
        last_name: 'User',
      },
    };

    it('should return impersonation token and details', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        name: 'Test School',
        slug: 'test-school',
      });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(membership);
      mockAuthService.signAccessToken.mockReturnValue('impersonation-jwt-token');

      const result = await service.impersonate('tenant-1', 'target-user-1', 'platform-user-1');

      expect(result.access_token).toBe('impersonation-jwt-token');
      expect(result.impersonating).toBe(true);
      expect(result.impersonator_id).toBe('platform-user-1');
      expect(result.target_user).toEqual({
        id: 'target-user-1',
        email: 'target@school.test',
        first_name: 'Target',
        last_name: 'User',
      });
      expect(result.target_tenant).toEqual({
        id: 'tenant-1',
        name: 'Test School',
        slug: 'test-school',
      });
      expect(mockAuthService.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'target-user-1',
          email: 'target@school.test',
          tenant_id: 'tenant-1',
          membership_id: 'membership-1',
        }),
      );
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.impersonate('tenant-1', 'user-1', 'platform-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when no active membership', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1', name: 'Test' });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      await expect(service.impersonate('tenant-1', 'user-1', 'platform-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── resetUserMfa tests ─────────────────────────────────────────────────────────
  describe('resetUserMfa', () => {
    it('should reset MFA for a user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@school.test',
        mfa_enabled: true,
      });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1', mfa_enabled: false });
      mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.resetUserMfa('user-1', 'actor-1');

      expect(result).toEqual({
        user_id: 'user-1',
        mfa_reset: true,
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: {
            mfa_enabled: false,
            mfa_secret: null,
          },
        }),
      );
      expect(mockPrisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: 'user-1' },
        }),
      );
      expect(mockSecurityAuditService.logMfaDisable).toHaveBeenCalledWith(
        'user-1',
        null,
        'admin_reset',
        'actor-1',
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetUserMfa('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should not pass actor when not provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });
      mockPrisma.mfaRecoveryCode.deleteMany.mockResolvedValue({ count: 0 });

      await service.resetUserMfa('user-1');

      expect(mockSecurityAuditService.logMfaDisable).toHaveBeenCalledWith(
        'user-1',
        null,
        'admin_reset',
        undefined,
      );
    });
  });

  // ─── listModules tests ────────────────────────────────────────────────────────────
  describe('listModules', () => {
    const modules = [
      { id: 'mod-1', module_key: 'attendance', is_enabled: true },
      { id: 'mod-2', module_key: 'gradebook', is_enabled: true },
      { id: 'mod-3', module_key: 'sen', is_enabled: false },
    ];

    it('should return all modules for a tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      mockPrisma.tenantModule.findMany.mockResolvedValue(modules);

      const result = await service.listModules('tenant-1');

      expect(result).toEqual(modules);
      expect(mockPrisma.tenantModule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: 'tenant-1' },
          orderBy: { module_key: 'asc' },
        }),
      );
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.listModules('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── toggleModule tests ───────────────────────────────────────────────────────────
  describe('toggleModule', () => {
    const existingModule = {
      id: 'mod-1',
      tenant_id: 'tenant-1',
      module_key: 'attendance',
      is_enabled: true,
    };

    beforeEach(() => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-1' });
      mockPrisma.tenantModule.findFirst.mockResolvedValue(existingModule);
    });

    it('should enable a module', async () => {
      mockPrisma.tenantModule.update.mockResolvedValue({ ...existingModule, is_enabled: true });

      const result = await service.toggleModule('tenant-1', 'attendance', true, 'user-1');

      expect(result.is_enabled).toBe(true);
      expect(mockPrisma.tenantModule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mod-1' },
          data: { is_enabled: true },
        }),
      );
      expect(mockSecurityAuditService.logModuleToggle).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'attendance',
        true,
      );
    });

    it('should disable a module', async () => {
      mockPrisma.tenantModule.update.mockResolvedValue({ ...existingModule, is_enabled: false });

      const result = await service.toggleModule('tenant-1', 'attendance', false, 'user-1');

      expect(result.is_enabled).toBe(false);
      expect(mockSecurityAuditService.logModuleToggle).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'attendance',
        false,
      );
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.toggleModule('non-existent', 'attendance', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for invalid module key', async () => {
      await expect(service.toggleModule('tenant-1', 'invalid-module', true)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when module not found for tenant', async () => {
      mockPrisma.tenantModule.findFirst.mockResolvedValue(null);

      await expect(service.toggleModule('tenant-1', 'attendance', true)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
