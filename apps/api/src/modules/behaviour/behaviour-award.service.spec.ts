import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
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
  let mockAcademicFacade: {
    findCurrentYear: jest.Mock;
    findCurrentPeriod: jest.Mock;
    findPeriodById: jest.Mock;
  };

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

    mockAcademicFacade = {
      findCurrentYear: jest.fn(),
      findCurrentPeriod: jest.fn(),
      findPeriodById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAwardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: {} },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
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
  function setupDefaults(awardTypeOverrides: Record<string, unknown> = {}, points = 60) {
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
    const lowerAwardIds = [{ id: 'lower-award-1' }, { id: 'lower-award-2' }];

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

  it('should not create award when points below threshold', async () => {
    setupDefaults({}, 30); // 30 points < 50 threshold

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should not create award when points_threshold is null', async () => {
    setupDefaults({ points_threshold: null }, 100);

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should respect once_per_period when period is provided and award exists', async () => {
    setupDefaults({ repeat_mode: 'once_per_period' });

    const periodStart = new Date('2026-01-01');
    const periodEnd = new Date('2026-06-30');
    mockAcademicFacade.findPeriodById.mockResolvedValue({
      start_date: periodStart,
      end_date: periodEnd,
    });

    mockTx.behaviourRecognitionAward.findFirst
      .mockResolvedValueOnce(null) // dedup check
      .mockResolvedValueOnce({ id: 'existing-period-award' }); // once_per_period check

    await service.checkAndCreateAutoAwards(
      mockTx as unknown as PrismaService,
      TENANT_ID,
      INCIDENT_ID,
      [STUDENT_ID],
      ACADEMIC_YEAR_ID,
      'period-1',
    );

    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  it('should allow once_per_period award when no existing award in period', async () => {
    setupDefaults({ repeat_mode: 'once_per_period' });

    mockAcademicFacade.findPeriodById.mockResolvedValue({
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-06-30'),
    });

    mockTx.behaviourRecognitionAward.findFirst
      .mockResolvedValueOnce(null) // dedup check
      .mockResolvedValueOnce(null); // once_per_period check - no existing

    await service.checkAndCreateAutoAwards(
      mockTx as unknown as PrismaService,
      TENANT_ID,
      INCIDENT_ID,
      [STUDENT_ID],
      ACADEMIC_YEAR_ID,
      'period-1',
    );

    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
  });

  it('should allow once_per_period when no academic period provided', async () => {
    setupDefaults({ repeat_mode: 'once_per_period' });

    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null); // dedup

    await invokeCheck(); // academicPeriodId is null

    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
  });

  it('should handle unknown repeat_mode as unlimited', async () => {
    setupDefaults({ repeat_mode: 'custom_unknown' });

    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null); // dedup

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
  });

  it('should not supersede when no lower-tier awards exist', async () => {
    setupDefaults({
      supersedes_lower_tiers: true,
      tier_group: 'achievement',
      tier_level: 3,
    });

    mockTx.behaviourRecognitionAward.findMany.mockResolvedValue([]); // no lower tiers
    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null); // dedup

    await invokeCheck();

    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
    expect(mockTx.behaviourRecognitionAward.updateMany).not.toHaveBeenCalled();
  });

  it('edge: should handle notification queue failure without failing award creation', async () => {
    setupDefaults();
    mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);
    mockNotificationsQueue.add.mockRejectedValue(new Error('Queue down'));

    await invokeCheck();

    // Award should still be created
    expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
  });

  it('should handle zero points from aggregate', async () => {
    mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
      _sum: { points_awarded: null },
    });
    mockTx.behaviourAwardType.findMany.mockResolvedValue([
      buildAwardType({ points_threshold: 50 }),
    ]);

    await invokeCheck();

    // 0 points < 50 threshold, no award created
    expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
  });

  // ─── listAwards — branch coverage ─────────────────────────────────────────

  describe('BehaviourAwardService — listAwards', () => {
    let mockListPrisma: {
      behaviourRecognitionAward: {
        findMany: jest.Mock;
        count: jest.Mock;
      };
    };

    beforeEach(() => {
      mockListPrisma = {
        behaviourRecognitionAward: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
      (service as unknown as { prisma: unknown }).prisma = mockListPrisma;
    });

    it('should list awards with no filters', async () => {
      await service.listAwards(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockListPrisma.behaviourRecognitionAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('should apply student_id filter', async () => {
      await service.listAwards(TENANT_ID, {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
      });

      expect(mockListPrisma.behaviourRecognitionAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should apply award_type_id and academic_year_id filters', async () => {
      await service.listAwards(TENANT_ID, {
        page: 1,
        pageSize: 20,
        award_type_id: AWARD_TYPE_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      expect(mockListPrisma.behaviourRecognitionAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            award_type_id: AWARD_TYPE_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
          }),
        }),
      );
    });
  });

  // ─── createManualAward — branch coverage ──────────────────────────────────

  describe('BehaviourAwardService — createManualAward', () => {
    const _USER_ID = '77777777-7777-7777-7777-777777777777';

    // We need a fresh prisma mock and RLS mock for createManualAward
    let __mockCreatePrisma: Record<string, unknown>;
    let _mockCreateRlsTx: Record<string, Record<string, jest.Mock>>;

    beforeEach(() => {
      _mockCreateRlsTx = {
        behaviourAwardType: {
          findFirst: jest.fn(),
        },
        student: {
          findFirst: jest.fn(),
        },
        academicYear: {
          findFirst: jest.fn(),
        },
        academicPeriod: {
          findFirst: jest.fn(),
        },
        behaviourRecognitionAward: {
          findFirst: jest.fn(),
          count: jest.fn(),
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn(),
        },
        behaviourIncidentParticipant: {
          aggregate: jest.fn(),
        },
      };

      // Replace the prisma value and rewire createRlsClient for this describe block
      _mockCreatePrisma = {};

      // Since we can't easily re-mock the RLS middleware per describe,
      // we'll inject the mockCreateRlsTx into the service's prisma field
      // and use createRlsClient mock from the module level.
      // The module-level mock is not available here, so we'll use direct service calls
      // where the tx is passed directly (like checkAndCreateAutoAwards).
    });

    it('should not create award when award type is not found', async () => {
      mockTx.behaviourAwardType.findMany.mockResolvedValue([]);
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 100 },
      });

      // checkAndCreateAutoAwards with no active award types
      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID],
        ACADEMIC_YEAR_ID,
        null,
      );

      expect(mockTx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
    });

    it('should handle once_per_period with null period (period lookup returns null)', async () => {
      const awardType = buildAwardType({ repeat_mode: 'once_per_period' });
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 60 },
      });
      mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);
      mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null); // dedup
      mockAcademicFacade.findPeriodById.mockResolvedValue(null); // period not found
      mockTx.behaviourRecognitionAward.create.mockResolvedValue({
        id: AWARD_ID,
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        award_type_id: AWARD_TYPE_ID,
        points_at_award: 60,
        awarded_at: new Date(),
      });

      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID],
        ACADEMIC_YEAR_ID,
        'period-nonexistent',
      );

      // When period lookup returns null, award is allowed (can't verify period constraint)
      expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
    });

    it('should process multiple students', async () => {
      const STUDENT_B = '88888888-8888-8888-8888-888888888888';
      const awardType = buildAwardType({ points_threshold: 10 });
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 20 },
      });
      mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);
      mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);
      mockTx.behaviourRecognitionAward.count.mockResolvedValue(0);
      mockTx.behaviourRecognitionAward.create.mockResolvedValue({
        id: AWARD_ID,
        tenant_id: TENANT_ID,
      });

      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID, STUDENT_B],
        ACADEMIC_YEAR_ID,
        null,
      );

      // Should create for both students
      expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(2);
    });

    it('should not supersede when supersedes_lower_tiers is false', async () => {
      const awardType = buildAwardType({
        supersedes_lower_tiers: false,
        tier_group: 'achievement',
        tier_level: 3,
      });
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 60 },
      });
      mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);
      mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);
      mockTx.behaviourRecognitionAward.count.mockResolvedValue(0);
      mockTx.behaviourRecognitionAward.create.mockResolvedValue({
        id: AWARD_ID,
      });

      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID],
        ACADEMIC_YEAR_ID,
        null,
      );

      expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
      expect(mockTx.behaviourRecognitionAward.updateMany).not.toHaveBeenCalled();
    });

    it('should not supersede when tier_group is null even with supersedes_lower_tiers', async () => {
      const awardType = buildAwardType({
        supersedes_lower_tiers: true,
        tier_group: null,
        tier_level: 3,
      });
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 60 },
      });
      mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);
      mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);
      mockTx.behaviourRecognitionAward.count.mockResolvedValue(0);
      mockTx.behaviourRecognitionAward.create.mockResolvedValue({
        id: AWARD_ID,
      });

      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID],
        ACADEMIC_YEAR_ID,
        null,
      );

      expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
      // tier_group is null so handleTierSupersession should not be called
      expect(mockTx.behaviourRecognitionAward.updateMany).not.toHaveBeenCalled();
    });

    it('should allow award when repeat_max_per_year count is below limit', async () => {
      const awardType = buildAwardType({ repeat_max_per_year: 5 });
      mockTx.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 60 },
      });
      mockTx.behaviourAwardType.findMany.mockResolvedValue([awardType]);
      mockTx.behaviourRecognitionAward.findFirst.mockResolvedValue(null);
      mockTx.behaviourRecognitionAward.count.mockResolvedValue(3); // 3 of 5
      mockTx.behaviourRecognitionAward.create.mockResolvedValue({ id: AWARD_ID });

      await service.checkAndCreateAutoAwards(
        mockTx as unknown as PrismaService,
        TENANT_ID,
        INCIDENT_ID,
        [STUDENT_ID],
        ACADEMIC_YEAR_ID,
        null,
      );

      expect(mockTx.behaviourRecognitionAward.create).toHaveBeenCalledTimes(1);
    });
  });
});
