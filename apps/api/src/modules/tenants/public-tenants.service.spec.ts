import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PublicTenantsService } from './public-tenants.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface MockBranding {
  school_name_display: string | null;
  school_name_ar: string | null;
  logo_url: string | null;
  primary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
}

interface MockDomain {
  domain: string;
}

interface MockTenant {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  default_locale: string;
  branding: MockBranding | null;
  domains: MockDomain[];
}

function buildTenant(overrides: Partial<MockTenant> = {}): MockTenant {
  return {
    id: TENANT_ID,
    slug: 'nhqs',
    name: 'Nurul Huda',
    status: 'active',
    default_locale: 'en',
    branding: {
      school_name_display: 'Nurul Huda Quranic School',
      school_name_ar: 'مدرسة نور الهدى',
      logo_url: 'https://cdn.example/logo.png',
      primary_color: '#0ea5e9',
      support_email: 'admissions@nhqs.test',
      support_phone: '+971 50 000 0000',
    },
    domains: [{ domain: 'nhqs.edupod.app' }],
    ...overrides,
  };
}

function buildMockPrisma(tenant: MockTenant | null) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PublicTenantsService — findBySlug', () => {
  let service: PublicTenantsService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  async function createService(tenant: MockTenant | null) {
    prisma = buildMockPrisma(tenant);
    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicTenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<PublicTenantsService>(PublicTenantsService);
  }

  afterEach(() => jest.clearAllMocks());

  it('returns the public tenant config for an active tenant', async () => {
    await createService(buildTenant());
    const result = await service.findBySlug('nhqs');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { slug: 'nhqs' },
      include: {
        branding: true,
        domains: {
          where: { verification_status: 'verified' },
          orderBy: { created_at: 'asc' },
          take: 1,
        },
      },
    });
    expect(result).toEqual({
      tenant_id: TENANT_ID,
      slug: 'nhqs',
      name: 'Nurul Huda',
      display_name: 'Nurul Huda Quranic School',
      display_name_ar: 'مدرسة نور الهدى',
      logo_url: 'https://cdn.example/logo.png',
      primary_color: '#0ea5e9',
      support_email: 'admissions@nhqs.test',
      support_phone: '+971 50 000 0000',
      default_locale: 'en',
      public_domain: 'nhqs.edupod.app',
    });
  });

  it('normalises the slug to lowercase before querying', async () => {
    await createService(buildTenant());
    await service.findBySlug('  NHQS  ');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'nhqs' } }),
    );
  });

  it('falls back to tenant.name when branding.school_name_display is missing', async () => {
    await createService(
      buildTenant({
        branding: {
          school_name_display: null,
          school_name_ar: null,
          logo_url: null,
          primary_color: null,
          support_email: null,
          support_phone: null,
        },
      }),
    );
    const result = await service.findBySlug('nhqs');
    expect(result.display_name).toBe('Nurul Huda');
    expect(result.display_name_ar).toBeNull();
    expect(result.logo_url).toBeNull();
    expect(result.public_domain).toBe('nhqs.edupod.app');
  });

  it('returns null for public_domain when no verified domain exists', async () => {
    await createService(buildTenant({ domains: [] }));
    const result = await service.findBySlug('nhqs');
    expect(result.public_domain).toBeNull();
  });

  it('handles a tenant with no branding record at all', async () => {
    await createService(buildTenant({ branding: null }));
    const result = await service.findBySlug('nhqs');
    expect(result.display_name).toBe('Nurul Huda');
    expect(result.logo_url).toBeNull();
    expect(result.support_email).toBeNull();
  });

  it('throws TENANT_NOT_FOUND when no tenant matches the slug', async () => {
    await createService(null);
    await expect(service.findBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws TENANT_NOT_FOUND for a suspended tenant', async () => {
    await createService(buildTenant({ status: 'suspended' }));
    await expect(service.findBySlug('nhqs')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws TENANT_NOT_FOUND for an archived tenant', async () => {
    await createService(buildTenant({ status: 'archived' }));
    await expect(service.findBySlug('nhqs')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws TENANT_NOT_FOUND for an empty slug', async () => {
    await createService(buildTenant());
    await expect(service.findBySlug('   ')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
