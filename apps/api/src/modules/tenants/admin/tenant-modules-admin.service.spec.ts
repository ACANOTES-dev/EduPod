import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { MODULE_REGISTRY } from '@school/shared/modules';

import { withRls } from '../../../common/helpers/with-rls';
import { PrismaService } from '../../prisma/prisma.service';

import { TenantModulesAdminService } from './tenant-modules-admin.service';

jest.mock('../../../common/helpers/with-rls');

const TENANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const USER_ID = '11111111-2222-4333-8444-555555555555';

function buildPrisma() {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
    tenantModule: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  };
}

describe('TenantModulesAdminService', () => {
  let service: TenantModulesAdminService;
  let prisma: ReturnType<typeof buildPrisma>;
  const withRlsMock = jest.mocked(withRls);

  beforeEach(async () => {
    prisma = buildPrisma();
    withRlsMock.mockImplementation(async (_prisma, _context, fn) => {
      return fn({
        auditLog: prisma.auditLog,
        tenantModule: prisma.tenantModule,
      } as Parameters<typeof fn>[0]);
    });

    const module = await Test.createTestingModule({
      providers: [TenantModulesAdminService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TenantModulesAdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns the full registry with current enabled state and completeness', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    prisma.tenantModule.findMany.mockResolvedValueOnce([
      { id: 'm1', tenant_id: TENANT_ID, module_key: 'finance', is_enabled: true },
      { id: 'm2', tenant_id: TENANT_ID, module_key: 'sen', is_enabled: false },
    ]);
    prisma.auditLog.findMany.mockResolvedValueOnce([]);

    const result = await service.getModulesView(TENANT_ID);

    expect(withRlsMock).toHaveBeenCalledWith(
      prisma,
      { tenant_id: TENANT_ID },
      expect.any(Function),
    );
    expect(withRlsMock).toHaveBeenCalledTimes(2);
    expect(result.tenant_id).toBe(TENANT_ID);
    expect(result.modules).toHaveLength(MODULE_REGISTRY.length);
    expect(result.modules.find((entry) => entry.key === 'finance')?.is_enabled).toBe(true);
    expect(result.modules.find((entry) => entry.key === 'finance')?.has_row).toBe(true);
    expect(result.modules.find((entry) => entry.key === 'sen')?.is_enabled).toBe(false);
    expect(result.modules.find((entry) => entry.key === 'admissions')?.has_row).toBe(false);
    expect(result.completeness.complete).toBe(false);
    expect(result.completeness.missing).toContain('admissions');
  });

  it('attaches the latest audit toggle metadata per module', async () => {
    const latest = new Date('2026-05-17T10:00:00.000Z');
    const older = new Date('2026-05-16T10:00:00.000Z');
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    prisma.tenantModule.findMany.mockResolvedValueOnce([
      { id: 'm1', tenant_id: TENANT_ID, module_key: 'finance', is_enabled: false },
    ]);
    prisma.auditLog.findMany.mockResolvedValueOnce([
      {
        created_at: latest,
        metadata_json: { module_key: 'finance', is_enabled: false },
        actor: {
          email: 'ram@example.com',
          first_name: 'Ram',
          id: USER_ID,
          last_name: 'Duadu',
        },
      },
      {
        created_at: older,
        metadata_json: { module_key: 'finance', is_enabled: true },
        actor: null,
      },
    ]);

    const result = await service.getModulesView(TENANT_ID);
    const finance = result.modules.find((entry) => entry.key === 'finance');

    expect(finance?.last_toggled_at).toBe(latest.toISOString());
    expect(finance?.last_toggled_by).toEqual({ user_id: USER_ID, display_name: 'Ram Duadu' });
  });

  it('returns null last-toggled values when no audit entries exist', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce({ id: TENANT_ID });
    prisma.tenantModule.findMany.mockResolvedValueOnce([]);
    prisma.auditLog.findMany.mockResolvedValueOnce([]);

    const result = await service.getModulesView(TENANT_ID);
    const finance = result.modules.find((entry) => entry.key === 'finance');

    expect(finance?.last_toggled_at).toBeNull();
    expect(finance?.last_toggled_by).toBeNull();
  });

  it('throws NotFoundException when the tenant does not exist', async () => {
    prisma.tenant.findUnique.mockResolvedValueOnce(null);

    await expect(service.getModulesView(TENANT_ID)).rejects.toThrow(NotFoundException);
    expect(withRlsMock).not.toHaveBeenCalled();
  });
});
