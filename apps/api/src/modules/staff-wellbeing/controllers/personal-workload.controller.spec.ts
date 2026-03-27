import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type {
  JwtPayload,
  PersonalTimetableQuality,
  PersonalWorkloadSummary,
  TenantContext,
} from '@school/shared';

import { BLOCK_IMPERSONATION_KEY } from '../../../common/decorators/block-impersonation.decorator';
import { MODULE_ENABLED_KEY } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { BlockImpersonationGuard } from '../../../common/guards/block-impersonation.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';

import { PersonalWorkloadController } from './personal-workload.controller';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const STAFF_PROFILE_ID = '22222222-2222-2222-2222-222222222222';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'teacher@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const MOCK_SUMMARY: PersonalWorkloadSummary = {
  teaching_periods_per_week: 22,
  cover_duties_this_term: 5,
  school_average_covers: 4.2,
  timetable_quality_score: 78,
  timetable_quality_label: 'Moderate',
  trend: {
    previous_term_periods: 20,
    previous_term_covers: 3,
  },
  status: 'normal',
};

const MOCK_TIMETABLE_QUALITY: PersonalTimetableQuality = {
  free_period_distribution: [
    { weekday: 0, free_count: 2 },
    { weekday: 1, free_count: 1 },
    { weekday: 2, free_count: 3 },
    { weekday: 3, free_count: 1 },
    { weekday: 4, free_count: 2 },
  ],
  consecutive_periods: { max: 4, average: 2.5 },
  split_days_count: 1,
  room_changes: { average: 2.0, max: 4 },
  school_averages: {
    consecutive_max: 3.5,
    free_distribution_score: 72,
    split_days_pct: 0.15,
    room_changes_avg: 2.3,
  },
  composite_score: 78,
  composite_label: 'Moderate',
};

const MOCK_COVER_HISTORY = {
  data: [
    {
      date: '2026-03-15',
      period: 'Period 3',
      subject: 'Mathematics',
      original_teacher: 'Colleague' as const,
    },
  ],
  meta: { page: 1, pageSize: 20, total: 1 },
};

// ─── Mock Types ──────────────────────────────────────────────────────────────

interface MockComputeService {
  getPersonalWorkloadSummary: jest.Mock;
  getPersonalCoverHistory: jest.Mock;
  getPersonalTimetableQuality: jest.Mock;
}

interface MockCacheService {
  getCachedPersonal: jest.Mock;
  setCachedPersonal: jest.Mock;
}

interface MockPrismaService {
  staffProfile: { findUnique: jest.Mock };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('PersonalWorkloadController', () => {
  let controller: PersonalWorkloadController;
  let mockComputeService: MockComputeService;
  let mockCacheService: MockCacheService;
  let mockPrisma: MockPrismaService;

  beforeEach(async () => {
    mockComputeService = {
      getPersonalWorkloadSummary: jest.fn(),
      getPersonalCoverHistory: jest.fn(),
      getPersonalTimetableQuality: jest.fn(),
    };

    mockCacheService = {
      getCachedPersonal: jest.fn(),
      setCachedPersonal: jest.fn(),
    };

    mockPrisma = {
      staffProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: STAFF_PROFILE_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonalWorkloadController],
      providers: [
        { provide: WorkloadComputeService, useValue: mockComputeService },
        { provide: WorkloadCacheService, useValue: mockCacheService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(BlockImpersonationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PersonalWorkloadController>(
      PersonalWorkloadController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DECORATOR / GUARD METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  describe('class-level decorators', () => {
    it('should have @ModuleEnabled("staff_wellbeing") on the controller class', () => {
      const moduleKey = Reflect.getMetadata(
        MODULE_ENABLED_KEY,
        PersonalWorkloadController,
      );
      expect(moduleKey).toBe('staff_wellbeing');
    });

    it('should have AuthGuard and ModuleEnabledGuard on the class (no PermissionGuard)', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PersonalWorkloadController,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthGuard);
      expect(guards).toContain(ModuleEnabledGuard);
    });
  });

  describe('endpoint decorators', () => {
    it('should have @BlockImpersonation on the controller class', () => {
      const blocked = Reflect.getMetadata(
        BLOCK_IMPERSONATION_KEY,
        PersonalWorkloadController,
      );
      expect(blocked).toBe(true);
    });

    it('should include BlockImpersonationGuard in class-level guards', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PersonalWorkloadController,
      );
      expect(guards).toContain(BlockImpersonationGuard);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSummary', () => {
    it('should return cached data when cache hit', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(MOCK_SUMMARY);

      const result = await controller.getSummary(TENANT, USER);

      expect(result).toEqual(MOCK_SUMMARY);
      expect(mockCacheService.getCachedPersonal).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_PROFILE_ID,
        'summary',
      );
    });

    it('should compute and cache when cache miss', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(null);
      mockComputeService.getPersonalWorkloadSummary.mockResolvedValue(
        MOCK_SUMMARY,
      );

      const result = await controller.getSummary(TENANT, USER);

      expect(result).toEqual(MOCK_SUMMARY);
      expect(
        mockComputeService.getPersonalWorkloadSummary,
      ).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);
      expect(mockCacheService.setCachedPersonal).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_PROFILE_ID,
        'summary',
        MOCK_SUMMARY,
      );
    });

    it('should call service with correct staffProfileId', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(null);
      mockComputeService.getPersonalWorkloadSummary.mockResolvedValue(
        MOCK_SUMMARY,
      );

      await controller.getSummary(TENANT, USER);

      expect(mockPrisma.staffProfile.findUnique).toHaveBeenCalledWith({
        where: {
          idx_staff_profiles_tenant_user: {
            tenant_id: TENANT_ID,
            user_id: USER_ID,
          },
        },
        select: { id: true },
      });
      expect(
        mockComputeService.getPersonalWorkloadSummary,
      ).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);
    });

    it('should NOT call compute service when cache hits', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(MOCK_SUMMARY);

      await controller.getSummary(TENANT, USER);

      expect(
        mockComputeService.getPersonalWorkloadSummary,
      ).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user has no staff profile', async () => {
      mockPrisma.staffProfile.findUnique.mockResolvedValue(null);

      await expect(controller.getSummary(TENANT, USER)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COVER HISTORY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getCoverHistory', () => {
    it('should return paginated data with default page/pageSize', async () => {
      mockComputeService.getPersonalCoverHistory.mockResolvedValue(
        MOCK_COVER_HISTORY,
      );

      const result = await controller.getCoverHistory(TENANT, USER, {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual(MOCK_COVER_HISTORY);
      expect(
        mockComputeService.getPersonalCoverHistory,
      ).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID, 1, 20);
    });

    it('should pass custom page/pageSize to service', async () => {
      mockComputeService.getPersonalCoverHistory.mockResolvedValue({
        data: [],
        meta: { page: 3, pageSize: 50, total: 0 },
      });

      await controller.getCoverHistory(TENANT, USER, {
        page: 3,
        pageSize: 50,
      });

      expect(
        mockComputeService.getPersonalCoverHistory,
      ).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID, 3, 50);
    });

    it('should throw NotFoundException when user has no staff profile', async () => {
      mockPrisma.staffProfile.findUnique.mockResolvedValue(null);

      await expect(
        controller.getCoverHistory(TENANT, USER, { page: 1, pageSize: 20 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TIMETABLE QUALITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getTimetableQuality', () => {
    it('should return cached data when cache hit', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(
        MOCK_TIMETABLE_QUALITY,
      );

      const result = await controller.getTimetableQuality(TENANT, USER);

      expect(result).toEqual(MOCK_TIMETABLE_QUALITY);
      expect(mockCacheService.getCachedPersonal).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_PROFILE_ID,
        'timetable-quality',
      );
    });

    it('should compute and cache when cache miss', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(null);
      mockComputeService.getPersonalTimetableQuality.mockResolvedValue(
        MOCK_TIMETABLE_QUALITY,
      );

      const result = await controller.getTimetableQuality(TENANT, USER);

      expect(result).toEqual(MOCK_TIMETABLE_QUALITY);
      expect(
        mockComputeService.getPersonalTimetableQuality,
      ).toHaveBeenCalledWith(TENANT_ID, STAFF_PROFILE_ID);
      expect(mockCacheService.setCachedPersonal).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_PROFILE_ID,
        'timetable-quality',
        MOCK_TIMETABLE_QUALITY,
      );
    });

    it('should NOT call compute service when cache hits', async () => {
      mockCacheService.getCachedPersonal.mockResolvedValue(
        MOCK_TIMETABLE_QUALITY,
      );

      await controller.getTimetableQuality(TENANT, USER);

      expect(
        mockComputeService.getPersonalTimetableQuality,
      ).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user has no staff profile', async () => {
      mockPrisma.staffProfile.findUnique.mockResolvedValue(null);

      await expect(
        controller.getTimetableQuality(TENANT, USER),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
