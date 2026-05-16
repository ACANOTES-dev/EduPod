import { BadRequestException } from '@nestjs/common';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { MaintenanceService } from './maintenance.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WINDOW_ID = '33333333-3333-4333-8333-333333333333';

function buildPrisma() {
  const tenant = {
    id: TENANT_ID,
    maintenance_message: null,
    maintenance_mode: false,
    name: 'Pilot School',
  };
  const windowRow = {
    created_by: USER_ID,
    ends_at: new Date('2030-01-01T11:00:00.000Z'),
    id: WINDOW_ID,
    message: 'Scheduled work',
    starts_at: new Date('2030-01-01T10:00:00.000Z'),
    tenant_id: TENANT_ID,
  };

  return {
    tenant: {
      findUnique: jest.fn().mockResolvedValue(tenant),
      update: jest.fn().mockResolvedValue({
        ...tenant,
        maintenance_message: 'Brief maintenance',
        maintenance_mode: true,
      }),
    },
    tenantMaintenanceWindow: {
      create: jest.fn().mockResolvedValue(windowRow),
      delete: jest.fn().mockResolvedValue(windowRow),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(windowRow),
    },
  };
}

function buildRedis() {
  return {
    del: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue('OK'),
  };
}

describe('MaintenanceService', () => {
  let platformAuditService: jest.Mocked<Pick<PlatformAuditService, 'log'>>;
  let prisma: ReturnType<typeof buildPrisma>;
  let redis: ReturnType<typeof buildRedis>;
  let service: MaintenanceService;

  beforeEach(() => {
    prisma = buildPrisma();
    redis = buildRedis();
    platformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new MaintenanceService(
      prisma as unknown as PrismaService,
      { getClient: () => redis } as unknown as RedisService,
      platformAuditService as unknown as PlatformAuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('enables tenant maintenance mode, caches the message, and writes audit', async () => {
    const result = await service.toggleMaintenanceMode(TENANT_ID, true, 'Brief maintenance', {
      actor_user_id: USER_ID,
    });

    expect(result.maintenance_mode).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { maintenance_message: 'Brief maintenance', maintenance_mode: true },
    });
    expect(redis.set).toHaveBeenCalledWith(
      `tenant:${TENANT_ID}:maintenance`,
      JSON.stringify({ message: 'Brief maintenance' }),
    );
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maintenance_mode_entered', target_tenant_id: TENANT_ID }),
    );
  });

  it('rejects scheduled windows that start in the past', async () => {
    await expect(
      service.createMaintenanceWindow(
        {
          ends_at: new Date('2020-01-01T11:00:00.000Z'),
          message: 'Old window',
          starts_at: new Date('2020-01-01T10:00:00.000Z'),
          tenant_id: TENANT_ID,
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates and cancels scheduled maintenance windows with audit', async () => {
    const dto = {
      ends_at: new Date('2030-01-01T11:00:00.000Z'),
      message: 'Scheduled work',
      starts_at: new Date('2030-01-01T10:00:00.000Z'),
      tenant_id: TENANT_ID,
    };

    await expect(
      service.createMaintenanceWindow(dto, USER_ID, { actor_user_id: USER_ID }),
    ).resolves.toEqual(expect.objectContaining({ id: WINDOW_ID }));
    expect(prisma.tenantMaintenanceWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenant_id: TENANT_ID }),
      }),
    );

    await expect(
      service.deleteMaintenanceWindow(WINDOW_ID, { actor_user_id: USER_ID }),
    ).resolves.toEqual({
      deleted: true,
    });
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'maintenance_window_cancelled' }),
    );
  });

  it('processes scheduled maintenance windows', async () => {
    prisma.tenantMaintenanceWindow.findMany
      .mockResolvedValueOnce([{ message: 'Window start', tenant_id: TENANT_ID }])
      .mockResolvedValueOnce([{ tenant_id: TENANT_ID }]);
    prisma.tenant.update
      .mockResolvedValueOnce({ id: TENANT_ID, maintenance_mode: true })
      .mockResolvedValueOnce({ id: TENANT_ID, maintenance_mode: false });

    const result = await service.processScheduledMaintenanceWindows(
      new Date('2030-01-01T10:30:00.000Z'),
    );

    expect(result).toEqual({ disabled: 1, enabled: 1, deleted_expired: 1 });
    expect(redis.set).toHaveBeenCalledWith(
      `tenant:${TENANT_ID}:maintenance`,
      JSON.stringify({ message: 'Window start' }),
    );
    expect(redis.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}:maintenance`);
  });
});
