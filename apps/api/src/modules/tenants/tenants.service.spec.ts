import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MODULE_KEYS, NOTIFICATION_TYPES, SEQUENCE_TYPES } from '@school/shared';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { AuthReadFacade } from '../auth/auth-read.facade';
import { TokenService } from '../auth/auth-token.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { RedisService } from '../redis/redis.service';

import { TenantsService } from './tenants.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-3333-4444-555555555555';
const TARGET_USER_ID = '22222222-3333-4444-5555-666666666666';
const MEMBERSHIP_ID = 'mmmmmmmm-1111-2222-3333-444444444444';

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockPipelineInstance = {
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisClient = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  pipeline: jest.fn().mockReturnValue(mockPipelineInstance),
  smembers: jest.fn().mockResolvedValue([]),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockTokenService = {
  signAccessToken: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockSecurityAuditService = {
  logMfaDisable: jest.fn().mockResolvedValue(undefined),
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
    findMany: jest.fn(),
    findFirst: jest.fn(),
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
    count: jest.fn(),
  },
  user: {
    count: jest.fn(),
    update: jest.fn(),
  },
  mfaRecoveryCode: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn(mockPrisma);
  }),
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('TenantsService', () => {
  let service: TenantsService;
  let rbacReadFacade: {
    findAllPermissions: jest.Mock;
    findMembershipUserIds: jest.Mock;
    findMembershipWithUser: jest.Mock;
    countAllActiveMemberships: jest.Mock;
    [key: string]: jest.Mock;
  };
  let authReadFacade: {
    countAllUsers: jest.Mock;
    findUserById: jest.Mock;
    [key: string]: jest.Mock;
  };

  const isModuleEnabledByDefault = (moduleKey: (typeof MODULE_KEYS)[number]) => moduleKey !== 'sen';

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset pipeline mock fresh for each test
    mockPipelineInstance.del.mockReturnThis();
    mockPipelineInstance.exec.mockResolvedValue([]);
    mockRedisClient.pipeline.mockReturnValue(mockPipelineInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        TenantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    rbacReadFacade = module.get(RbacReadFacade);
    authReadFacade = module.get(AuthReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createTenant ──────────────────────────────────────────────────────────

  describe('TenantsService — createTenant', () => {
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

      expect(mockPrisma.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Test School',
            slug: 'test-school',
          }),
        }),
      );

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

      expect(mockPrisma.tenantBranding.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'new-tenant-id',
            school_name_display: 'Test School',
          }),
        }),
      );

      expect(mockPrisma.tenantSetting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: 'new-tenant-id',
          }),
        }),
      );

      expect(mockPrisma.tenantModule.create).toHaveBeenCalledTimes(MODULE_KEYS.length);

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

      expect(mockPrisma.tenantNotificationSetting.create).toHaveBeenCalledTimes(
        NOTIFICATION_TYPES.length,
      );

      expect(mockPrisma.tenantSequence.create).toHaveBeenCalledTimes(SEQUENCE_TYPES.length);

      expect(result).toEqual(fullTenantWithIncludes);
    });

    it('should reject duplicate slug', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'existing-id',
        slug: 'test-school',
        name: 'Existing School',
      });

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

      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });

    it('should assign permissions to roles when permissions exist', async () => {
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(null) // slug uniqueness
        .mockResolvedValueOnce(fullTenantWithIncludes); // getTenant

      mockPrisma.tenant.create.mockResolvedValue(createdTenant);
      mockPrisma.tenantDomain.create.mockResolvedValue({});
      mockPrisma.tenantBranding.create.mockResolvedValue({});
      mockPrisma.tenantSetting.create.mockResolvedValue({});
      mockPrisma.tenantModule.create.mockResolvedValue({});
      mockPrisma.tenantNotificationSetting.create.mockResolvedValue({});
      mockPrisma.tenantSequence.create.mockResolvedValue({});
      mockPrisma.role.create.mockResolvedValue({ id: 'role-id' });
      mockPrisma.rolePermission.create.mockResolvedValue({});

      // Return real permissions so the mapping branch is hit
      rbacReadFacade.findAllPermissions.mockResolvedValue([
        { id: 'perm-1', permission_key: 'students.view' },
        { id: 'perm-2', permission_key: 'students.create' },
      ]);

      await service.createTenant(createDto);

      // Roles were created inside the transaction
      expect(mockPrisma.role.create).toHaveBeenCalled();
    });

    it('edge: should skip permission mapping for unknown permission keys', async () => {
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(null) // slug uniqueness
        .mockResolvedValueOnce(fullTenantWithIncludes); // getTenant

      mockPrisma.tenant.create.mockResolvedValue(createdTenant);
      mockPrisma.tenantDomain.create.mockResolvedValue({});
      mockPrisma.tenantBranding.create.mockResolvedValue({});
      mockPrisma.tenantSetting.create.mockResolvedValue({});
      mockPrisma.tenantModule.create.mockResolvedValue({});
      mockPrisma.tenantNotificationSetting.create.mockResolvedValue({});
      mockPrisma.tenantSequence.create.mockResolvedValue({});
      mockPrisma.role.create.mockResolvedValue({ id: 'role-id' });
      mockPrisma.rolePermission.create.mockResolvedValue({});

      // Return empty permissions so no permId is found
      rbacReadFacade.findAllPermissions.mockResolvedValue([]);

      await service.createTenant(createDto);

      // Roles created but no permission assignments
      expect(mockPrisma.role.create).toHaveBeenCalled();
      expect(mockPrisma.rolePermission.create).not.toHaveBeenCalled();
    });
  });

  // ─── listTenants ───────────────────────────────────────────────────────────

  describe('TenantsService — listTenants', () => {
    it('should return paginated tenants with defaults', async () => {
      const tenants = [{ id: TENANT_ID, name: 'School A', status: 'active' }];
      mockPrisma.tenant.findMany.mockResolvedValueOnce(tenants);
      mockPrisma.tenant.count.mockResolvedValueOnce(1);

      const result = await service.listTenants({ page: 1, pageSize: 20 });

      expect(result).toEqual({
        data: tenants,
        meta: { page: 1, pageSize: 20, total: 1 },
      });
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 20,
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({ page: 1, pageSize: 10 }, { status: 'suspended' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'suspended' }),
        }),
      );
    });

    it('should apply search filter when provided', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({ page: 1, pageSize: 10 }, { search: 'acme' });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'acme', mode: 'insensitive' } },
              { slug: { contains: 'acme', mode: 'insensitive' } },
            ],
          }),
        }),
      );
    });

    it('should apply both status and search filters together', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({ page: 1, pageSize: 10 }, { status: 'active', search: 'test' });

      const callArgs = mockPrisma.tenant.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('active');
      expect(callArgs.where.OR).toBeDefined();
    });

    it('should apply custom sort and order', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({
        page: 2,
        pageSize: 5,
        sort: 'name',
        order: 'asc',
      });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should default sort to created_at desc when not specified', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({ page: 1, pageSize: 10 });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('edge: should calculate correct skip for page 3', async () => {
      mockPrisma.tenant.findMany.mockResolvedValueOnce([]);
      mockPrisma.tenant.count.mockResolvedValueOnce(0);

      await service.listTenants({ page: 3, pageSize: 10 });

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20 }),
      );
    });
  });

  // ─── getTenant ─────────────────────────────────────────────────────────────

  describe('TenantsService — getTenant', () => {
    it('should return tenant with all includes', async () => {
      const tenant = {
        id: TENANT_ID,
        name: 'School',
        branding: {},
        settings: {},
        modules: [],
        domains: [],
        sequences: [],
        _count: { memberships: 5 },
      };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);

      const result = await service.getTenant(TENANT_ID);

      expect(result).toEqual(tenant);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          include: expect.objectContaining({
            branding: true,
            settings: true,
            modules: true,
            domains: true,
            sequences: true,
          }),
        }),
      );
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.getTenant(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should include TENANT_NOT_FOUND code in error response', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      try {
        await service.getTenant(TENANT_ID);
        fail('Expected NotFoundException');
      } catch (err) {
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'TENANT_NOT_FOUND',
        });
      }
    });
  });

  // ─── updateTenant ──────────────────────────────────────────────────────────

  describe('TenantsService — updateTenant', () => {
    it('should update tenant and invalidate domain caches', async () => {
      const existing = { id: TENANT_ID, name: 'Old Name', status: 'active' };
      const updated = { id: TENANT_ID, name: 'New Name', status: 'active' };

      mockPrisma.tenant.findUnique.mockResolvedValueOnce(existing);
      mockPrisma.tenant.update.mockResolvedValueOnce(updated);
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([{ domain: 'old.edupod.app' }]);

      const result = await service.updateTenant(TENANT_ID, { name: 'New Name' });

      expect(result).toEqual(updated);
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { name: 'New Name' },
      });
      // Domain cache invalidation should have occurred
      expect(mockPrisma.tenantDomain.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        select: { domain: true },
      });
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('tenant_domain:old.edupod.app');
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateTenant(TENANT_ID, { name: 'Updated' })).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });
  });

  // ─── suspendTenant ─────────────────────────────────────────────────────────

  describe('TenantsService — suspendTenant', () => {
    it('should suspend an active tenant', async () => {
      const tenant = { id: TENANT_ID, name: 'School', status: 'active' };
      const updated = { ...tenant, status: 'suspended' };

      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce(updated);
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      const result = await service.suspendTenant(TENANT_ID, USER_ID);

      expect(result).toEqual(updated);
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { status: 'suspended' },
      });
      expect(mockRedisClient.set).toHaveBeenCalledWith(`tenant:${TENANT_ID}:suspended`, 'true');
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.suspendTenant(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when tenant is already suspended', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'suspended',
      });

      try {
        await service.suspendTenant(TENANT_ID);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'ALREADY_SUSPENDED',
        });
      }
    });

    it('should throw BadRequestException when tenant is archived', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'archived',
      });

      try {
        await service.suspendTenant(TENANT_ID);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'ARCHIVED_TENANT',
        });
      }
    });

    it('should log security audit when actorUserId is provided', async () => {
      const tenant = { id: TENANT_ID, status: 'active' };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce({ ...tenant, status: 'suspended' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      await service.suspendTenant(TENANT_ID, USER_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'suspended',
        'active',
      );
    });

    it('should skip security audit when actorUserId is not provided', async () => {
      const tenant = { id: TENANT_ID, status: 'active' };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce({ ...tenant, status: 'suspended' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      await service.suspendTenant(TENANT_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).not.toHaveBeenCalled();
    });

    it('should invalidate all tenant sessions and domain caches', async () => {
      const tenant = { id: TENANT_ID, status: 'active' };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce({ ...tenant, status: 'suspended' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([
        { domain: 'school.edupod.app' },
        { domain: 'custom.school.com' },
      ]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([
        { id: MEMBERSHIP_ID, user_id: USER_ID },
      ]);
      mockRedisClient.smembers.mockResolvedValueOnce(['session-1', 'session-2']);

      await service.suspendTenant(TENANT_ID, USER_ID);

      // Sessions deleted
      expect(mockRedisClient.del).toHaveBeenCalledWith('session:session-1', 'session:session-2');
      expect(mockRedisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);

      // Permission caches deleted
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);

      // Domain caches invalidated
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('tenant_domain:school.edupod.app');
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('tenant_domain:custom.school.com');
    });

    it('edge: should handle user with no sessions gracefully', async () => {
      const tenant = { id: TENANT_ID, status: 'active' };
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce({ ...tenant, status: 'suspended' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([
        { id: MEMBERSHIP_ID, user_id: USER_ID },
      ]);
      mockRedisClient.smembers.mockResolvedValueOnce([]); // no sessions

      await service.suspendTenant(TENANT_ID);

      // Should NOT call del with session keys when there are none
      expect(mockRedisClient.del).not.toHaveBeenCalledWith(expect.stringContaining('session:'));
      // But should still clean up user_sessions set
      expect(mockRedisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
    });
  });

  // ─── reactivateTenant ──────────────────────────────────────────────────────

  describe('TenantsService — reactivateTenant', () => {
    it('should reactivate a suspended tenant', async () => {
      const tenant = { id: TENANT_ID, status: 'suspended' };
      const updated = { ...tenant, status: 'active' };

      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce(updated);
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);

      const result = await service.reactivateTenant(TENANT_ID, USER_ID);

      expect(result).toEqual(updated);
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { status: 'active' },
      });
      expect(mockRedisClient.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}:suspended`);
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.reactivateTenant(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when tenant is not suspended', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'active',
      });

      try {
        await service.reactivateTenant(TENANT_ID);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'NOT_SUSPENDED',
        });
      }
    });

    it('should throw BadRequestException when tenant is archived', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'archived',
      });

      await expect(service.reactivateTenant(TENANT_ID)).rejects.toThrow(BadRequestException);
    });

    it('should log security audit when actorUserId is provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);

      await service.reactivateTenant(TENANT_ID, USER_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'active',
        'suspended',
      );
    });

    it('should skip security audit when actorUserId is not provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);

      await service.reactivateTenant(TENANT_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).not.toHaveBeenCalled();
    });

    it('should invalidate domain caches after reactivation', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([{ domain: 'school.edupod.app' }]);

      await service.reactivateTenant(TENANT_ID);

      expect(mockPipelineInstance.del).toHaveBeenCalledWith('tenant_domain:school.edupod.app');
    });
  });

  // ─── archiveTenant ─────────────────────────────────────────────────────────

  describe('TenantsService — archiveTenant', () => {
    it('should archive an active tenant', async () => {
      const tenant = { id: TENANT_ID, status: 'active' };
      const updated = { ...tenant, status: 'archived' };

      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce(updated);
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      const result = await service.archiveTenant(TENANT_ID, USER_ID);

      expect(result).toEqual(updated);
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: TENANT_ID },
        data: { status: 'archived' },
      });
    });

    it('should archive a suspended tenant', async () => {
      const tenant = { id: TENANT_ID, status: 'suspended' };
      const updated = { ...tenant, status: 'archived' };

      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);
      mockPrisma.tenant.update.mockResolvedValueOnce(updated);
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      const result = await service.archiveTenant(TENANT_ID, USER_ID);

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.archiveTenant(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when tenant is already archived', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        status: 'archived',
      });

      try {
        await service.archiveTenant(TENANT_ID);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'ALREADY_ARCHIVED',
        });
      }
    });

    it('should clean up suspension flag when archiving', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'suspended' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      await service.archiveTenant(TENANT_ID);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}:suspended`);
    });

    it('should log security audit when actorUserId is provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      await service.archiveTenant(TENANT_ID, USER_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'archived',
        'active',
      );
    });

    it('should skip security audit when actorUserId is not provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([]);

      await service.archiveTenant(TENANT_ID);

      expect(mockSecurityAuditService.logTenantStatusChange).not.toHaveBeenCalled();
    });

    it('should invalidate all sessions and domain caches', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID, status: 'active' });
      mockPrisma.tenant.update.mockResolvedValueOnce({ id: TENANT_ID, status: 'archived' });
      mockPrisma.tenantDomain.findMany.mockResolvedValueOnce([{ domain: 'school.edupod.app' }]);
      rbacReadFacade.findMembershipUserIds.mockResolvedValueOnce([
        { id: MEMBERSHIP_ID, user_id: USER_ID },
      ]);
      mockRedisClient.smembers.mockResolvedValueOnce(['session-abc']);

      await service.archiveTenant(TENANT_ID, USER_ID);

      expect(mockRedisClient.del).toHaveBeenCalledWith('session:session-abc');
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('tenant_domain:school.edupod.app');
    });
  });

  // ─── getDashboard ──────────────────────────────────────────────────────────

  describe('TenantsService — getDashboard', () => {
    it('should return platform dashboard statistics', async () => {
      mockPrisma.tenant.count
        .mockResolvedValueOnce(10) // active
        .mockResolvedValueOnce(2) // suspended
        .mockResolvedValueOnce(1); // archived
      authReadFacade.countAllUsers.mockResolvedValueOnce(50);
      rbacReadFacade.countAllActiveMemberships.mockResolvedValueOnce(45);

      const result = await service.getDashboard();

      expect(result).toEqual({
        tenants: {
          active: 10,
          suspended: 2,
          archived: 1,
          total: 13,
        },
        users: {
          total: 50,
          active_memberships: 45,
        },
      });
    });

    it('should return zeros when no tenants or users exist', async () => {
      mockPrisma.tenant.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      authReadFacade.countAllUsers.mockResolvedValueOnce(0);
      rbacReadFacade.countAllActiveMemberships.mockResolvedValueOnce(0);

      const result = await service.getDashboard();

      expect(result.tenants.total).toBe(0);
      expect(result.users.total).toBe(0);
      expect(result.users.active_memberships).toBe(0);
    });
  });

  // ─── impersonate ───────────────────────────────────────────────────────────

  describe('TenantsService — impersonate', () => {
    const mockMembership = {
      id: MEMBERSHIP_ID,
      user: {
        id: TARGET_USER_ID,
        email: 'teacher@school.com',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    };

    it('should generate impersonation token for valid target', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        name: 'School',
        slug: 'school',
        status: 'active',
      });
      rbacReadFacade.findMembershipWithUser.mockResolvedValueOnce(mockMembership);
      mockTokenService.signAccessToken.mockReturnValueOnce('impersonation-jwt');

      const result = await service.impersonate(TENANT_ID, TARGET_USER_ID, USER_ID);

      expect(result).toMatchObject({
        access_token: 'impersonation-jwt',
        impersonating: true,
        impersonator_id: USER_ID,
        target_user: {
          id: TARGET_USER_ID,
          email: 'teacher@school.com',
          first_name: 'Jane',
          last_name: 'Doe',
        },
        target_tenant: {
          id: TENANT_ID,
          name: 'School',
          slug: 'school',
        },
      });

      expect(mockTokenService.signAccessToken).toHaveBeenCalledWith({
        sub: TARGET_USER_ID,
        email: 'teacher@school.com',
        tenant_id: TENANT_ID,
        membership_id: MEMBERSHIP_ID,
      });
    });

    it('should throw NotFoundException when target tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.impersonate(TENANT_ID, TARGET_USER_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when user has no membership at the tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: TENANT_ID,
        name: 'School',
        slug: 'school',
      });
      rbacReadFacade.findMembershipWithUser.mockResolvedValueOnce(null);

      try {
        await service.impersonate(TENANT_ID, TARGET_USER_ID, USER_ID);
        fail('Expected NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'MEMBERSHIP_NOT_FOUND',
        });
      }
    });
  });

  // ─── resetUserMfa ──────────────────────────────────────────────────────────

  describe('TenantsService — resetUserMfa', () => {
    it('should reset MFA for an existing user', async () => {
      authReadFacade.findUserById.mockResolvedValueOnce({
        id: TARGET_USER_ID,
        email: 'user@school.com',
        mfa_enabled: true,
      });

      const result = await service.resetUserMfa(TARGET_USER_ID, USER_ID);

      expect(result).toEqual({
        user_id: TARGET_USER_ID,
        mfa_reset: true,
      });

      // MFA disabled in transaction
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: TARGET_USER_ID },
        data: { mfa_enabled: false, mfa_secret: null },
      });

      // Recovery codes deleted
      expect(mockPrisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { user_id: TARGET_USER_ID },
      });

      // Security audit logged
      expect(mockSecurityAuditService.logMfaDisable).toHaveBeenCalledWith(
        TARGET_USER_ID,
        null,
        'admin_reset',
        USER_ID,
      );
    });

    it('should throw NotFoundException when user does not exist', async () => {
      authReadFacade.findUserById.mockResolvedValueOnce(null);

      try {
        await service.resetUserMfa(TARGET_USER_ID);
        fail('Expected NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'USER_NOT_FOUND',
        });
      }
    });

    it('should reset MFA without actorUserId', async () => {
      authReadFacade.findUserById.mockResolvedValueOnce({
        id: TARGET_USER_ID,
        email: 'user@school.com',
      });

      const result = await service.resetUserMfa(TARGET_USER_ID);

      expect(result.mfa_reset).toBe(true);
      expect(mockSecurityAuditService.logMfaDisable).toHaveBeenCalledWith(
        TARGET_USER_ID,
        null,
        'admin_reset',
        undefined,
      );
    });
  });

  // ─── listModules ───────────────────────────────────────────────────────────

  describe('TenantsService — listModules', () => {
    it('should return modules for an existing tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
      const modules = [
        { id: 'm1', tenant_id: TENANT_ID, module_key: 'finance', is_enabled: true },
        { id: 'm2', tenant_id: TENANT_ID, module_key: 'sen', is_enabled: false },
      ];
      mockPrisma.tenantModule.findMany.mockResolvedValueOnce(modules);

      const result = await service.listModules(TENANT_ID);

      expect(result).toEqual(modules);
      expect(mockPrisma.tenantModule.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { module_key: 'asc' },
      });
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.listModules(TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── toggleModule ──────────────────────────────────────────────────────────

  describe('TenantsService — toggleModule', () => {
    it('should enable a module for an existing tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
      const existingModule = {
        id: 'mod-1',
        tenant_id: TENANT_ID,
        module_key: 'sen',
        is_enabled: false,
      };
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce(existingModule);
      const updated = { ...existingModule, is_enabled: true };
      mockPrisma.tenantModule.update.mockResolvedValueOnce(updated);

      const result = await service.toggleModule(TENANT_ID, 'sen', true, USER_ID);

      expect(result).toEqual(updated);
      expect(mockPrisma.tenantModule.update).toHaveBeenCalledWith({
        where: { id: 'mod-1' },
        data: { is_enabled: true },
      });
      expect(mockSecurityAuditService.logModuleToggle).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'sen',
        true,
      );
    });

    it('should disable a module for an existing tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
      const existingModule = {
        id: 'mod-1',
        tenant_id: TENANT_ID,
        module_key: 'finance',
        is_enabled: true,
      };
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce(existingModule);
      const updated = { ...existingModule, is_enabled: false };
      mockPrisma.tenantModule.update.mockResolvedValueOnce(updated);

      const result = await service.toggleModule(TENANT_ID, 'finance', false, USER_ID);

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when tenant does not exist', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.toggleModule(TENANT_ID, 'finance', true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for invalid module key', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });

      try {
        await service.toggleModule(TENANT_ID, 'nonexistent_module', true);
        fail('Expected BadRequestException');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_MODULE_KEY',
        });
      }
    });

    it('should throw NotFoundException when module row does not exist for this tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce(null);

      try {
        await service.toggleModule(TENANT_ID, 'finance', true);
        fail('Expected NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'MODULE_NOT_FOUND',
        });
      }
    });

    it('should skip security audit when actorUserId is not provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
      mockPrisma.tenantModule.findFirst.mockResolvedValueOnce({
        id: 'mod-1',
        tenant_id: TENANT_ID,
        module_key: 'finance',
        is_enabled: true,
      });
      mockPrisma.tenantModule.update.mockResolvedValueOnce({
        id: 'mod-1',
        is_enabled: false,
      });

      await service.toggleModule(TENANT_ID, 'finance', false);

      expect(mockSecurityAuditService.logModuleToggle).not.toHaveBeenCalled();
    });
  });
});
