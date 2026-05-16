import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { MaintenanceWindowService } from './maintenance-window.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WINDOW_ID = '22222222-2222-4222-8222-222222222222';

const baseRule = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'PostgreSQL status',
  metric: 'component_status',
  condition_config: { component: 'postgresql', operator: 'eq', threshold: 1 },
  severity: 'critical',
  cooldown_minutes: 15,
  is_enabled: true,
  is_security_critical: false,
  notify_emails: [],
  created_at: new Date('2026-05-16T09:00:00.000Z'),
  updated_at: new Date('2026-05-16T09:00:00.000Z'),
};

function buildMockPrisma() {
  return {
    platformMaintenanceWindow: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('MaintenanceWindowService', () => {
  let service: MaintenanceWindowService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAudit: { log: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        MaintenanceWindowService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(MaintenanceWindowService);
  });

  afterEach(() => jest.clearAllMocks());

  it('schedules and audits a maintenance window', async () => {
    mockPrisma.platformMaintenanceWindow.create.mockResolvedValueOnce({ id: WINDOW_ID });

    await service.create(
      {
        title: 'Database patching',
        starts_at: new Date('2026-05-16T10:00:00.000Z'),
        ends_at: new Date('2026-05-16T11:00:00.000Z'),
      },
      USER_ID,
      { actor_user_id: USER_ID },
    );

    expect(mockPrisma.platformMaintenanceWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ created_by_user_id: USER_ID, title: 'Database patching' }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maintenance_window_scheduled',
        target_resource_id: WINDOW_ID,
      }),
    );
  });

  it('lists future windows by default', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-05-16T10:00:00.000Z'));
    mockPrisma.platformMaintenanceWindow.findMany.mockResolvedValueOnce([]);

    await service.list({ include_past: false });

    expect(mockPrisma.platformMaintenanceWindow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ends_at: { gte: new Date('2026-05-16T10:00:00.000Z') } },
        orderBy: [{ cancelled_at: 'asc' }, { starts_at: 'asc' }],
      }),
    );

    jest.useRealTimers();
  });

  it('cancels and audits an active maintenance window', async () => {
    const existing = { id: WINDOW_ID, cancelled_at: null };
    const updated = { id: WINDOW_ID, cancelled_at: new Date('2026-05-16T10:30:00.000Z') };
    mockPrisma.platformMaintenanceWindow.findUnique.mockResolvedValueOnce(existing);
    mockPrisma.platformMaintenanceWindow.update.mockResolvedValueOnce(updated);

    await service.cancel(
      WINDOW_ID,
      { reason: 'Maintenance completed and alerts can resume.' },
      USER_ID,
      { actor_user_id: USER_ID },
    );

    expect(mockPrisma.platformMaintenanceWindow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: WINDOW_ID },
        data: expect.objectContaining({ cancelled_by_user_id: USER_ID }),
      }),
    );
    expect(mockAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'maintenance_window_cancelled',
        payload: { before: existing, after: updated, extra: expect.any(Object) },
      }),
    );
  });

  it('rejects cancellation of an already cancelled maintenance window', async () => {
    mockPrisma.platformMaintenanceWindow.findUnique.mockResolvedValueOnce({
      id: WINDOW_ID,
      cancelled_at: new Date('2026-05-16T09:00:00.000Z'),
    });

    await expect(
      service.cancel(
        WINDOW_ID,
        { reason: 'Duplicate cancellation attempt from the page.' },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects invalid windows', async () => {
    await expect(
      service.create(
        {
          title: 'Bad window',
          starts_at: new Date('2026-05-16T11:00:00.000Z'),
          ends_at: new Date('2026-05-16T10:00:00.000Z'),
        },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns the active window for non-security rules', async () => {
    mockPrisma.platformMaintenanceWindow.findFirst.mockResolvedValueOnce({ id: WINDOW_ID });

    const result = await service.findActiveWindowForRule(baseRule);

    expect(result).toEqual({ id: WINDOW_ID });
    expect(mockPrisma.platformMaintenanceWindow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cancelled_at: null }),
      }),
    );
  });

  it('does not suppress security-critical rules', async () => {
    const result = await service.findActiveWindowForRule({
      ...baseRule,
      is_security_critical: true,
    });

    expect(result).toBeNull();
    expect(mockPrisma.platformMaintenanceWindow.findFirst).not.toHaveBeenCalled();
  });
});
