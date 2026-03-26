import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourHistoryService } from './behaviour-history.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const INCIDENT_ID = '33333333-3333-3333-3333-333333333333';
const ACADEMIC_YEAR_ID = '44444444-4444-4444-4444-444444444444';
const AWARD_TYPE_ID = '55555555-5555-5555-5555-555555555555';
const AWARD_ID = '66666666-6666-6666-6666-666666666666';

const mockNotificationsQueue = { add: jest.fn().mockResolvedValue({}) };

/** Build a base award type with sensible defaults; override per test. */
function buildAwardType(overrides: Record<string, unknown> = {}) {
  return {
    id: AWARD_TYPE_ID,
    tenant_id: TENANT_ID,
    name: 'Gold Star',
    name_ar: null,
    icon: 'star',
    color: '#FFD700',
    points_threshold: 50,
    is_active: true,
    repeat_mode: 'unlimited',
    repeat_max_per_year: null,
    supersedes_lower_tiers: false,
    tier_group: null,
    tier_level: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('BehaviourAwardService', () => {
  let service: BehaviourAwardService;

  /** Mock transaction object passed directly to checkAndCreateAutoAwards. */
  let mockTx: {
    behaviourRecognitionAward: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
    behaviourAwardType: {
      findMany: jest.Mock;
    };
    behaviourIncidentParticipant: {
      aggregate: jest.Mock;
    };
    behaviourIncident: {
      findUnique: jest.Mock;
    };
    behaviourPublicationApproval: {
      create: jest.Mock;
    };
    tenantSetting: {
      findFirst: jest.Mock;
    };
    academicPeriod: {
      findUnique: jest.Mock;
    };
    studentParent: {
      findMany: jest.Mock;
    };
    behaviourGuardianRestriction: {
      findFirst: jest.Mock;
    };
    notification: {
      create: jest.Mock;
    };
  };

  /** Minimal PrismaService mock — the constructor requires it but tests call checkAndCreateAutoAwards with mockTx directly. */
  let mockPrisma: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockTx = {
      behaviourRecognitionAward: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      behaviourAwardType: {
        findMany: jest.fn(),
      },
      behaviourIncidentParticipant: {
        aggregate: jest.fn(),
      },
      behaviourIncident: {
        findUnique: jest.fn(),
      },
      behaviourPublicationApproval: {
        create: jest.fn(),
      },
      tenantSetting: {
        findFirst: jest.fn(),
      },
      academicPeriod: {
        findUnique: jest.fn(),
      },
      studentParent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourGuardianRestriction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      notification: {
        create: jest.fn(),
      },
    };

    mockPrisma = {
      $extends: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAwardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: {} },
        {
          provide: 'BullQueue_notifications',
          useValue: mockNotificationsQueue,
        },
      ],
    }).compile();

    service = module.get<BehaviourAwardService>(BehaviourAwardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Configure mockTx defaults shared across most happy-path tests. */
  function setupDefaults(
    awardTypeOverrides: Record<string, unknown> = {},
    points = 60,
  ) {
    const awardType = buildAwardType(awardTypeOverrides);

    // computeFreshStudentPoints -> aggregate returns points
    mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
      _sum: { points_awarded: points },
    });

    // Award types loader
    mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);

    // Dedup check — no existing award for this incident by default
    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);

    // Repeat max count — 0 by default
    mockTx.behaviourRecognitionAward.count.mockResolvedValue(0);

    // Create returns an award record
    mockTx.behaviourRecognitionAward.create.mockResolvedValue({
      id: AWARD_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      award_type_id: awardType.id,
      points_at_award: points,
      awarded_at: new Date(),
    });

    return awardType;
  }

  /** Invoke the method under test with standard args. */
  async function invokeCheck() {
    await service.checkAndCreateAutoAwards(
      mockTx as unknown as PrismaService,
      TENANT_ID,
      INCIDENT_ID,
      [STUDENT_ID],
      ACADEMIC_YEAR_ID,
      null,
    );
  }

  // ─── Tests ──────────────────────────────────────────────────────────────────

  it('should create award when student crosses threshold', async () => {
    setupDefaults({}, 60); // 60 points >= 50 threshold

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
        points_at_award: 60,
        triggered_by_incident_id: INCIDENT_ID,
      }),
    });
  });

  it('should not create duplicate award for same incident (dedup guard)', async () => {
    setupDefaults();

    // Dedup: findFirst returns an existing award for this incident + award type
    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue({
      id: 'existing-award-id',
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      award_type_id: AWARD_TYPE_ID,
      triggered_by_incident_id: INCIDENT_ID,
    });

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should not create award if repeat_mode = once_per_year and already awarded this year', async () => {
    setupDefaults({ repeat_mode: 'once_per_year' });

    // Dedup by incident returns null (different incident), so flow proceeds to eligibility
    mockTx.behaviourRecognitionAward.findFirst
      .mockResolvedValueOnce(null) // dedup check (triggered_by_incident_id)
      .mockResolvedValueOnce({
        // once_per_year check — already awarded this academic year
        id: 'existing-year-award',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should not create award if repeat_mode = once_ever and already awarded', async () => {
    setupDefaults({ repeat_mode: 'once_ever' });

    // Dedup by incident returns null, flow proceeds to eligibility
    mockTx.behaviourRecognitionAward.findFirst
      .mockResolvedValueOnce(null) // dedup check
      .mockResolvedValueOnce({
        // once_ever check — already awarded at some point
        id: 'existing-ever-award',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
      });

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should set superseded_by_id on lower-tier awards when supersedes_lower_tiers = true', async () => {
    const lowerAwardIds = [
      { id: 'lower-award-1' },
      { id: 'lower-award-2' },
    ];

    setupDefaults({
      supersedes_lower_tiers: true,
      tier_group: 'achievement',
      tier_level: 3,
    });

    // handleTierSupersession -> findMany returns lower-tier awards
    mockTx.behaviourRecognitionAward.findMany.mockResolvedValue(lowerAwardIds);
    mockTx.behaviourRecognitionAward.updateMany.mockResolvedValue({ count: 2 });

    await invokeCheck();

    // Award was created
    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);

    // Lower-tier awards were superseded
    expect(mockTx.behaviourRecognitionAward.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['lower-award-1', 'lower-award-2'] },
      },
      data: { superseded_by_id: AWARD_ID },
    });
  });

  it('should not exceed repeat_max_per_year', async () => {
    setupDefaults({ repeat_max_per_year: 2 });

    // Dedup check passes
    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);

    // Already at max (2 of 2)
    mockTx.behaviourRecognitionAward.count.mockResolvedValue(2);

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });
});
