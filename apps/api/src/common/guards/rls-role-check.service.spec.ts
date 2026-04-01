import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../modules/prisma/prisma.service';

import { RlsRoleCheckService } from './rls-role-check.service';

const buildMockPrisma = () => ({
  $queryRaw: jest.fn(),
});

describe('RlsRoleCheckService', () => {
  let service: RlsRoleCheckService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [RlsRoleCheckService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(RlsRoleCheckService);

    // Suppress logger output in tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('should pass silently when role has no SUPERUSER or BYPASSRLS', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'edupod_app', rolsuper: false, rolbypassrls: false },
    ]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringContaining('verified: no SUPERUSER or BYPASSRLS'),
    );
  });

  it('should throw in production when role has SUPERUSER', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: false },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow('CRITICAL');
  });

  it('should throw in production when role has BYPASSRLS', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'bad_role', rolsuper: false, rolbypassrls: true },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow('BYPASSRLS');
  });

  it('should warn but not throw in development when role is unsafe', async () => {
    process.env.NODE_ENV = 'development';
    mockPrisma.$queryRaw.mockResolvedValue([
      { rolname: 'postgres', rolsuper: true, rolbypassrls: true },
    ]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(expect.stringContaining('CRITICAL'));
  });

  it('should throw in production when role cannot be determined', async () => {
    process.env.NODE_ENV = 'production';
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await expect(service.onModuleInit()).rejects.toThrow('Could not determine');
  });

  it('should warn but not throw in development when role cannot be determined', async () => {
    process.env.NODE_ENV = 'development';
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('Could not determine'),
    );
  });
});
