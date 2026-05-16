import { Test, TestingModule } from '@nestjs/testing';

import { RedisPubSubService } from '../platform/redis-pubsub.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import { PlatformErrorLogMaintenanceService } from './platform-error-log-maintenance.service';
import { PlatformErrorLogService } from './platform-error-log.service';

const ACTOR_USER_ID = '11111111-1111-4111-8111-111111111111';

describe('PlatformErrorLogMaintenanceService', () => {
  let service: PlatformErrorLogMaintenanceService;
  let mockAuditService: { verifyChainIntegrity: jest.Mock };
  let mockErrorLogService: { purgeExpired: jest.Mock; resolveMaintenanceActor: jest.Mock };
  let mockRedisPubSubService: { publish: jest.Mock };

  beforeEach(async () => {
    mockAuditService = {
      verifyChainIntegrity: jest.fn().mockResolvedValue({ broken_at: null }),
    };
    mockErrorLogService = {
      purgeExpired: jest.fn().mockResolvedValue(3),
      resolveMaintenanceActor: jest.fn().mockResolvedValue(ACTOR_USER_ID),
    };
    mockRedisPubSubService = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformErrorLogMaintenanceService,
        { provide: PlatformAuditService, useValue: mockAuditService },
        { provide: PlatformErrorLogService, useValue: mockErrorLogService },
        { provide: RedisPubSubService, useValue: mockRedisPubSubService },
      ],
    }).compile();

    service = module.get<PlatformErrorLogMaintenanceService>(PlatformErrorLogMaintenanceService);
  });

  afterEach(() => jest.clearAllMocks());

  it('runs retention and hash-chain verification once per UTC day after 04:00', async () => {
    await service.runDueTasks(new Date('2026-05-16T04:01:00.000Z'));
    await service.runDueTasks(new Date('2026-05-16T05:01:00.000Z'));

    expect(mockErrorLogService.purgeExpired).toHaveBeenCalledTimes(1);
    expect(mockErrorLogService.purgeExpired).toHaveBeenCalledWith(
      ACTOR_USER_ID,
      new Date('2026-05-16T04:01:00.000Z'),
    );
    expect(mockAuditService.verifyChainIntegrity).toHaveBeenCalledTimes(1);
  });

  it('publishes a critical platform alert when the audit hash chain is broken', async () => {
    mockAuditService.verifyChainIntegrity.mockResolvedValueOnce({
      broken_at: '99999999-9999-4999-8999-999999999999',
    });

    await service.runDueTasks(new Date('2026-05-16T04:30:00.000Z'));

    expect(mockRedisPubSubService.publish).toHaveBeenCalledWith('platform:alerts', {
      type: 'audit_integrity_broken',
      severity: 'critical',
      broken_at: '99999999-9999-4999-8999-999999999999',
      checked_at: '2026-05-16T04:30:00.000Z',
    });
  });
});
