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

import { ConflictException } from '@nestjs/common';
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
      expect((caughtError as ConflictException).getResponse()).toMatchObject({
        code: 'SLUG_TAKEN',
      });

      // Tenant record must NOT have been created
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });
  });
});
