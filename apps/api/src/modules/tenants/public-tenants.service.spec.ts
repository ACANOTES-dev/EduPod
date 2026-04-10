/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn(),
}));

import { runWithRlsContext as runWithRlsContextRaw } from '../../common/middleware/rls.middleware';

import { PrismaService } from '../prisma/prisma.service';

import { PublicTenantsService } from './public-tenants.service';

const runWithRlsContext = runWithRlsContextRaw as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

interface MockTenant {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  default_locale: string;
}

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

function buildTenant(overrides: Partial<MockTenant> = {}): MockTenant {
  return {
    id: TENANT_ID,
    slug: 'nhqs',
    name: 'Nurul Huda',
    status: 'active',
    default_locale: 'en',
    ...overrides,
  };
}

function buildBranding(overrides: Partial<MockBranding> = {}): MockBranding {
  return {
    school_name_display: 'Nurul Huda Quranic School',
    school_name_ar: 'مدرسة نور الهدى',
    logo_url: 'https://cdn.example/logo.png',
    primary_color: '#0ea5e9',
    support_email: 'admissions@nhqs.test',
    support_phone: '+971 50 000 0000',
    ...overrides,
  };
}

function buildMockPrisma(options: {
  tenant: MockTenant | null;
  branding: MockBranding | null;
  domain: MockDomain | null;
}) {
  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(options.tenant),
    },
    // These are invoked inside the runWithRlsContext callback via the `tx`
    // argument, which is returned as the mock prisma instance below.
    tenantBranding: {
      findUnique: jest.fn().mockResolvedValue(options.branding),
    },
    tenantDomain: {
      findFirst: jest.fn().mockResolvedValue(options.domain),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PublicTenantsService — findBySlug', () => {
  let service: PublicTenantsService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  async function createService(options: Parameters<typeof buildMockPrisma>[0]) {
    prisma = buildMockPrisma(options);

    // `runWithRlsContext` is mocked to immediately invoke the callback with
    // the same mock prisma so the step-2 branding/domain lookups reach our
    // spies.
    runWithRlsContext.mockImplementation(async (_prisma, _ctx, cb) => cb(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicTenantsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get<PublicTenantsService>(PublicTenantsService);
  }

  afterEach(() => jest.clearAllMocks());

  it('returns the public tenant config for an active tenant', async () => {
    await createService({
      tenant: buildTenant(),
      branding: buildBranding(),
      domain: { domain: 'nhqs.edupod.app' },
    });

    const result = await service.findBySlug('nhqs');

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'nhqs' } });
    expect(runWithRlsContext).toHaveBeenCalledWith(
      prisma,
      { tenant_id: TENANT_ID },
      expect.any(Function),
    );
    expect(prisma.tenantBranding.findUnique).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
    });
    expect(prisma.tenantDomain.findFirst).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, verification_status: 'verified' },
      orderBy: { created_at: 'asc' },
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
    await createService({
      tenant: buildTenant(),
      branding: buildBranding(),
      domain: { domain: 'nhqs.edupod.app' },
    });
    await service.findBySlug('  NHQS  ');
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({ where: { slug: 'nhqs' } });
  });

  it('falls back to tenant.name when branding.school_name_display is missing', async () => {
    await createService({
      tenant: buildTenant(),
      branding: buildBranding({
        school_name_display: null,
        school_name_ar: null,
        logo_url: null,
        primary_color: null,
        support_email: null,
        support_phone: null,
      }),
      domain: { domain: 'nhqs.edupod.app' },
    });
    const result = await service.findBySlug('nhqs');
    expect(result.display_name).toBe('Nurul Huda');
    expect(result.display_name_ar).toBeNull();
    expect(result.logo_url).toBeNull();
    expect(result.public_domain).toBe('nhqs.edupod.app');
  });

  it('returns null for public_domain when no verified domain exists', async () => {
    await createService({
      tenant: buildTenant(),
      branding: buildBranding(),
      domain: null,
    });
    const result = await service.findBySlug('nhqs');
    expect(result.public_domain).toBeNull();
  });

  it('handles a tenant with no branding record at all', async () => {
    await createService({
      tenant: buildTenant(),
      branding: null,
      domain: { domain: 'nhqs.edupod.app' },
    });
    const result = await service.findBySlug('nhqs');
    expect(result.display_name).toBe('Nurul Huda');
    expect(result.logo_url).toBeNull();
    expect(result.support_email).toBeNull();
  });

  it('throws TENANT_NOT_FOUND when no tenant matches the slug', async () => {
    await createService({ tenant: null, branding: null, domain: null });
    await expect(service.findBySlug('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(runWithRlsContext).not.toHaveBeenCalled();
  });

  it('throws TENANT_NOT_FOUND for a suspended tenant', async () => {
    await createService({
      tenant: buildTenant({ status: 'suspended' }),
      branding: null,
      domain: null,
    });
    await expect(service.findBySlug('nhqs')).rejects.toBeInstanceOf(NotFoundException);
    expect(runWithRlsContext).not.toHaveBeenCalled();
  });

  it('throws TENANT_NOT_FOUND for an archived tenant', async () => {
    await createService({
      tenant: buildTenant({ status: 'archived' }),
      branding: null,
      domain: null,
    });
    await expect(service.findBySlug('nhqs')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws TENANT_NOT_FOUND for an empty slug and does not hit Prisma', async () => {
    await createService({ tenant: null, branding: null, domain: null });
    await expect(service.findBySlug('   ')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });
});
