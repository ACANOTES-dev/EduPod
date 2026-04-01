import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningTriggerService } from './early-warning-trigger.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    earlyWarningConfig: {
      findFirst: jest.fn(),
    },
  };
}

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EarlyWarningTriggerService', () => {
  let service: EarlyWarningTriggerService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: ReturnType<typeof buildMockQueue>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = buildMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarlyWarningTriggerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('early-warning'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<EarlyWarningTriggerService>(EarlyWarningTriggerService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('triggerStudentRecompute', () => {
    it('should enqueue compute-student job when enabled and event matches', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: ['suspension', 'critical_incident', 'third_consecutive_absence'],
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).toHaveBeenCalledWith(
        EARLY_WARNING_COMPUTE_STUDENT_JOB,
        {
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          trigger_event: 'suspension',
        },
        expect.objectContaining({ attempts: 3 }),
      );
    });

    it('should be a no-op when early warning is disabled', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: false,
        high_severity_events_json: ['suspension'],
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should be a no-op when no config exists', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(null);

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should be a no-op when trigger event is not in high_severity_events', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: ['suspension'],
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'low_grade');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should handle null high_severity_events_json', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue({
        is_enabled: true,
        high_severity_events_json: null,
      });

      await service.triggerStudentRecompute(TENANT_ID, STUDENT_ID, 'suspension');

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
