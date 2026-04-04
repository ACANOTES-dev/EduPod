import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, AcademicReadFacade, StudentReadFacade, ClassesReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourComparisonAnalyticsService } from './behaviour-comparison-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const PERMISSIONS = ['behaviour.view'];
const BASE_QUERY = { from: '2026-03-01', to: '2026-03-31', exposureNormalised: false };

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  behaviourIncident: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  yearGroup: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  student: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
  classEnrolment: {
    groupBy: jest.fn().mockResolvedValue([]),
  },
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

const makeMockScope = () => ({
  getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
  buildScopeFilter: jest.fn().mockReturnValue({}),
});

describe('BehaviourComparisonAnalyticsService', () => {
  let service: BehaviourComparisonAnalyticsService;
  let mockPrisma: MockPrisma;
  let mockAcademicFacade: { findAllYearGroups: jest.Mock };
  let mockStudentFacade: { countByYearGroup: jest.Mock };
  let mockClassesFacade: { findEnrolmentCountsByClasses: jest.Mock };

  beforeEach(async () => {
    mockPrisma = makeMockPrisma();

    mockAcademicFacade = {
      findAllYearGroups: mockPrisma.yearGroup.findMany,
    };
    mockStudentFacade = {
      countByYearGroup: jest.fn().mockResolvedValue(new Map()),
    };
    mockClassesFacade = {
      findEnrolmentCountsByClasses: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourComparisonAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourScopeService, useValue: makeMockScope() },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
      ],
    }).compile();

    service = module.get<BehaviourComparisonAnalyticsService>(BehaviourComparisonAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getRatio ──────────────────────────────────────────────────────────

  describe('BehaviourComparisonAnalyticsService -- getRatio', () => {
    it('should return empty entries when no incidents exist', async () => {
      const result = await service.getRatio(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toEqual([]);
      expect(result.data_quality).toBeDefined();
    });

    it('should compute positive/negative ratio per year group', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        {
          polarity: 'positive',
          participants: [
            { student: { year_group_id: 'yg-1', year_group: { id: 'yg-1', name: 'Year 1' } } },
          ],
        },
        {
          polarity: 'negative',
          participants: [
            { student: { year_group_id: 'yg-1', year_group: { id: 'yg-1', name: 'Year 1' } } },
          ],
        },
        {
          polarity: 'positive',
          participants: [
            { student: { year_group_id: 'yg-1', year_group: { id: 'yg-1', name: 'Year 1' } } },
          ],
        },
      ]);

      const result = await service.getRatio(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.positive).toBe(2);
      expect(result.entries[0]!.negative).toBe(1);
      expect(result.entries[0]!.ratio).toBeCloseTo(2 / 3);
    });

    it('should handle participants without year groups gracefully', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        {
          polarity: 'positive',
          participants: [{ student: { year_group_id: null, year_group: null } }],
        },
      ]);

      const result = await service.getRatio(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(0);
    });
  });

  // ─── getComparisons ────────────────────────────────────────────────────

  describe('BehaviourComparisonAnalyticsService -- getComparisons', () => {
    it('should return all year groups with rates', async () => {
      mockAcademicFacade.findAllYearGroups.mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
        { id: 'yg-2', name: 'Year 2' },
      ]);
      mockStudentFacade.countByYearGroup.mockResolvedValue(
        new Map([['yg-1', 30], ['yg-2', 25]]),
      );
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        {
          polarity: 'negative',
          participants: [
            { student: { year_group_id: 'yg-1', year_group: { id: 'yg-1', name: 'Year 1' } } },
          ],
        },
      ]);

      const result = await service.getComparisons(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(2);
      const yg1 = result.entries.find((e) => e.year_group_id === 'yg-1');
      expect(yg1?.student_count).toBe(30);
      expect(yg1?.negative_rate).toBeGreaterThan(0);
    });

    it('should return null rates when no students enrolled', async () => {
      mockAcademicFacade.findAllYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      mockStudentFacade.countByYearGroup.mockResolvedValue(new Map());
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);

      const result = await service.getComparisons(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries[0]!.incident_rate).toBeNull();
    });
  });

  // ─── getClassComparisons ───────────────────────────────────────────────

  describe('BehaviourComparisonAnalyticsService -- getClassComparisons', () => {
    it('should return class comparisons sorted by incident rate descending', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([
        {
          polarity: 'negative',
          participants: [
            {
              student: {
                class_enrolments: [
                  { class_id: 'cls-1', class_entity: { id: 'cls-1', name: 'Class A' } },
                ],
              },
            },
          ],
        },
        {
          polarity: 'negative',
          participants: [
            {
              student: {
                class_enrolments: [
                  { class_id: 'cls-1', class_entity: { id: 'cls-1', name: 'Class A' } },
                ],
              },
            },
          ],
        },
        {
          polarity: 'positive',
          participants: [
            {
              student: {
                class_enrolments: [
                  { class_id: 'cls-2', class_entity: { id: 'cls-2', name: 'Class B' } },
                ],
              },
            },
          ],
        },
      ]);
      mockClassesFacade.findEnrolmentCountsByClasses.mockResolvedValue(
        new Map([['cls-1', 10], ['cls-2', 10]]),
      );

      const result = await service.getClassComparisons(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(2);
      // cls-1 has 2 incidents / 10 students = 0.2, cls-2 has 1 / 10 = 0.1
      expect(result.entries[0]!.class_id).toBe('cls-1');
      expect(result.entries[0]!.incident_rate_per_student).toBe(0.2);
    });

    it('should return empty entries when no incidents match', async () => {
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.groupBy.mockResolvedValue([]);

      const result = await service.getClassComparisons(TENANT_ID, USER_ID, PERMISSIONS, BASE_QUERY);

      expect(result.entries).toHaveLength(0);
    });
  });
});
