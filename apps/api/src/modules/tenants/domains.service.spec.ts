import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { withRls } from '../../common/helpers/with-rls';
import { OnboardingService } from '../platform/onboarding.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { DomainsService } from './domains.service';

jest.mock('../../common/helpers/with-rls');

const TENANT_ID = 'tenant-uuid-1';
const DOMAIN_ID = 'domain-uuid-1';

const mockRedisClient = {
  del: jest.fn().mockResolvedValue(1),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
  },
  tenantDomain: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
};

const mockOnboardingService = {
  autoCompleteStep: jest.fn().mockResolvedValue(undefined),
};

const mockPlatformAuditService = {
  log: jest.fn().mockResolvedValue(undefined),
};

describe('DomainsService', () => {
  let service: DomainsService;
  const withRlsMock = jest.mocked(withRls);

  beforeEach(async () => {
    withRlsMock.mockImplementation(async (_prisma, _context, fn) =>
      fn({
        tenantDomain: mockPrisma.tenantDomain,
      } as Parameters<typeof fn>[0]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: PlatformAuditService, useValue: mockPlatformAuditService },
      ],
    }).compile();

    service = module.get<DomainsService>(DomainsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── ensureTenantExists shared guard ──

  it('should throw NotFoundException when tenant does not exist', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

    await expect(service.listDomains(TENANT_ID)).rejects.toThrow(NotFoundException);
  });

  // ── listDomains ──

  it('should return all domains for a tenant', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    const domains = [{ id: DOMAIN_ID, domain: 'example.com' }];
    mockPrisma.tenantDomain.findMany.mockResolvedValueOnce(domains);

    const result = await service.listDomains(TENANT_ID);
    expect(result).toEqual(domains);
    expect(mockPrisma.tenantDomain.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      orderBy: { created_at: 'asc' },
    });
  });

  // ── addDomain ──

  it('should create a new domain when it is unique', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    const created = { id: DOMAIN_ID, domain: 'new.example.com' };
    mockPrisma.tenantDomain.create.mockResolvedValueOnce(created);

    const result = await service.addDomain(TENANT_ID, {
      domain: 'new.example.com',
      domain_type: 'app',
      is_primary: false,
    });
    expect(result).toEqual(created);
    expect(mockOnboardingService.autoCompleteStep).toHaveBeenCalledWith(
      TENANT_ID,
      'domain_configured',
      { domain: 'new.example.com' },
    );
  });

  it('should throw ConflictException when domain is already taken', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        clientVersion: 'test',
        code: 'P2002',
      }),
    );

    await expect(
      service.addDomain(TENANT_ID, {
        domain: 'taken.com',
        domain_type: 'app',
        is_primary: false,
      }),
    ).rejects.toThrow(ConflictException);
  });

  // ── updateDomain ──

  it('should update a domain and invalidate cache', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'old.example.com',
    });
    const updated = { id: DOMAIN_ID, domain: 'old.example.com', is_primary: true };
    mockPrisma.tenantDomain.update.mockResolvedValueOnce(updated);

    const result = await service.updateDomain(TENANT_ID, DOMAIN_ID, { is_primary: true });
    expect(result).toEqual(updated);
    expect(mockRedisClient.del).toHaveBeenCalledWith('tenant_domain:old.example.com');
  });

  it('should auto-complete SSL verification when SSL status becomes active', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'school.example.com',
    });
    mockPrisma.tenantDomain.update.mockResolvedValueOnce({
      id: DOMAIN_ID,
      domain: 'school.example.com',
      ssl_status: 'active',
    });

    await service.updateDomain(TENANT_ID, DOMAIN_ID, { ssl_status: 'active' });

    expect(mockOnboardingService.autoCompleteStep).toHaveBeenCalledWith(TENANT_ID, 'ssl_verified', {
      domain: 'school.example.com',
    });
  });

  it('should throw NotFoundException when updating a non-existent domain', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce(null);

    await expect(service.updateDomain(TENANT_ID, DOMAIN_ID, { is_primary: true })).rejects.toThrow(
      NotFoundException,
    );
  });

  // ── removeDomain ──

  it('should remove a non-primary domain', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'secondary.example.com',
      is_primary: false,
    });
    mockPrisma.tenantDomain.delete.mockResolvedValueOnce({});

    const result = await service.removeDomain(TENANT_ID, DOMAIN_ID);
    expect(result).toEqual({ deleted: true });
    expect(mockRedisClient.del).toHaveBeenCalledWith('tenant_domain:secondary.example.com');
  });

  it('should throw BadRequestException when removing the last primary domain', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'primary.example.com',
      is_primary: true,
    });
    mockPrisma.tenantDomain.count.mockResolvedValueOnce(1);

    await expect(service.removeDomain(TENANT_ID, DOMAIN_ID)).rejects.toThrow(BadRequestException);
  });

  it('should allow removing a primary domain when another primary exists', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce({
      id: DOMAIN_ID,
      tenant_id: TENANT_ID,
      domain: 'primary2.example.com',
      is_primary: true,
    });
    mockPrisma.tenantDomain.count.mockResolvedValueOnce(2);
    mockPrisma.tenantDomain.delete.mockResolvedValueOnce({});

    const result = await service.removeDomain(TENANT_ID, DOMAIN_ID);
    expect(result).toEqual({ deleted: true });
  });

  it('should throw NotFoundException when removing a non-existent domain', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    mockPrisma.tenantDomain.findFirst.mockResolvedValueOnce(null);

    await expect(service.removeDomain(TENANT_ID, DOMAIN_ID)).rejects.toThrow(NotFoundException);
  });
});
