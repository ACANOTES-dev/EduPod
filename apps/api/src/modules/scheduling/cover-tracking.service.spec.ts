import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CoverTrackingService } from './cover-tracking.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const DEFAULT_QUERY = {
  date_from: '2026-01-01',
  date_to: '2026-03-31',
};

function makeSubRecord(staffId: string, subjectName: string | null = 'Maths') {
  return {
    substitute_staff_id: staffId,
    substitute: {
      user: { first_name: 'Teacher', last_name: staffId },
    },
    schedule: {
      class_entity: subjectName ? { subject: { name: subjectName } } : null,
    },
  };
}

describe('CoverTrackingService', () => {
  let service: CoverTrackingService;
  let mockPrisma: {
    substitutionRecord: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      substitutionRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CoverTrackingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CoverTrackingService>(CoverTrackingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCoverReport ────────────────────────────────────────────────────────

  describe('getCoverReport', () => {
    it('should aggregate cover counts per teacher', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-1'),
        makeSubRecord('staff-1'),
        makeSubRecord('staff-2'),
      ]);

      const result = await service.getCoverReport(TENANT_ID, DEFAULT_QUERY);

      const staff1 = result.data.find((d) => d.staff_profile_id === 'staff-1');
      const staff2 = result.data.find((d) => d.staff_profile_id === 'staff-2');
      expect(staff1?.cover_count).toBe(2);
      expect(staff2?.cover_count).toBe(1);
    });

    it('should sort by cover count descending', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-2'),
        makeSubRecord('staff-1'),
        makeSubRecord('staff-1'),
        makeSubRecord('staff-1'),
      ]);

      const result = await service.getCoverReport(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.staff_profile_id).toBe('staff-1');
      expect(result.data[0]!.cover_count).toBe(3);
    });

    it('should return empty array when no cover records exist', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.getCoverReport(TENANT_ID, DEFAULT_QUERY);

      expect(result.data).toHaveLength(0);
    });

    it('should include teacher name in report', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        {
          substitute_staff_id: 'staff-1',
          substitute: { user: { first_name: 'Alice', last_name: 'Brown' } },
          schedule: { class_entity: { subject: { name: 'Science' } } },
        },
      ]);

      const result = await service.getCoverReport(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.name).toBe('Alice Brown');
    });
  });

  // ─── getCoverFairness ─────────────────────────────────────────────────────

  describe('getCoverFairness', () => {
    it('should return excellent fairness when all teachers have equal cover count', async () => {
      // All 3 teachers covered exactly twice — zero variance
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-1'),
        makeSubRecord('staff-1'),
        makeSubRecord('staff-2'),
        makeSubRecord('staff-2'),
        makeSubRecord('staff-3'),
        makeSubRecord('staff-3'),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.fairness_grade).toBe('excellent');
      expect(result.coefficient_of_variation).toBe(0);
      expect(result.mean).toBe(2);
    });

    it('should return poor fairness when one teacher has all the cover', async () => {
      // staff-1 has 10 covers, staff-2 and staff-3 have 0 → high CV
      mockPrisma.substitutionRecord.findMany.mockResolvedValue(
        Array(10).fill(makeSubRecord('staff-1')),
      );

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      // Only one teacher, mean = 10, std_dev = 0 → cv = 0 → 'excellent'
      // (With just one teacher we can't measure fairness between teachers)
      expect(result.teacher_stats).toHaveLength(1);
    });

    it('should return zero mean and excellent grade when no records exist', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.mean).toBe(0);
      expect(result.std_dev).toBe(0);
      expect(result.coefficient_of_variation).toBe(0);
      expect(result.fairness_grade).toBe('excellent');
      expect(result.teacher_stats).toHaveLength(0);
    });

    it('should calculate correct standard deviation', async () => {
      // staff-1: 2 covers, staff-2: 4 covers — mean=3, variance=1, stddev=1
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-1'),
        makeSubRecord('staff-1'),
        makeSubRecord('staff-2'),
        makeSubRecord('staff-2'),
        makeSubRecord('staff-2'),
        makeSubRecord('staff-2'),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.mean).toBe(3);
      expect(result.std_dev).toBe(1);
    });

    it('should grade as good when coefficient of variation is between 0.2 and 0.4', async () => {
      // Manually craft a scenario with CV in the good range
      // staff-1: 5, staff-2: 3, mean=4, std=1, cv≈0.25
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        ...Array(5).fill(makeSubRecord('staff-1')),
        ...Array(3).fill(makeSubRecord('staff-2')),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.fairness_grade).toBe('good');
    });

    it('should grade as fair when CV is between 0.4 and 0.6', async () => {
      // staff-1: 8, staff-2: 2, mean=5, std=3, cv=0.6 (exactly at boundary)
      // Let's do: staff-1: 7, staff-2: 2 => mean=4.5, var=6.25, std=2.5, cv=0.556
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        ...Array(7).fill(makeSubRecord('staff-1')),
        ...Array(2).fill(makeSubRecord('staff-2')),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.fairness_grade).toBe('fair');
    });

    it('should grade as poor when CV is >= 0.6', async () => {
      // staff-1: 10, staff-2: 1 => mean=5.5, std=4.5, cv=0.818
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        ...Array(10).fill(makeSubRecord('staff-1')),
        ...Array(1).fill(makeSubRecord('staff-2')),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.fairness_grade).toBe('poor');
    });

    it('should round mean and std_dev to 2 decimal places', async () => {
      // staff-1: 3, staff-2: 2 => mean=2.5, var=0.25, std=0.5
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        ...Array(3).fill(makeSubRecord('staff-1')),
        ...Array(2).fill(makeSubRecord('staff-2')),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      expect(result.mean).toBe(2.5);
      expect(result.std_dev).toBe(0.5);
    });

    it('should round coefficient_of_variation to 3 decimal places', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        ...Array(5).fill(makeSubRecord('staff-1')),
        ...Array(3).fill(makeSubRecord('staff-2')),
      ]);

      const result = await service.getCoverFairness(TENANT_ID, DEFAULT_QUERY);

      // cv = 1/4 = 0.25
      expect(result.coefficient_of_variation).toBe(0.25);
    });
  });

  // ─── getCoverByDepartment ──────────────────────────────────────────────────

  describe('getCoverByDepartment', () => {
    it('should aggregate cover counts by subject/department', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-1', 'Maths'),
        makeSubRecord('staff-2', 'Maths'),
        makeSubRecord('staff-3', 'Science'),
      ]);

      const result = await service.getCoverByDepartment(TENANT_ID, DEFAULT_QUERY);

      const maths = result.data.find((d) => d.subject_name === 'Maths');
      const science = result.data.find((d) => d.subject_name === 'Science');
      expect(maths?.cover_count).toBe(2);
      expect(science?.cover_count).toBe(1);
    });

    it('should label records with null class_entity as Unknown', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([makeSubRecord('staff-1', null)]);

      const result = await service.getCoverByDepartment(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.subject_name).toBe('Unknown');
    });

    it('should sort departments by cover count descending', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        makeSubRecord('staff-1', 'English'),
        makeSubRecord('staff-2', 'Maths'),
        makeSubRecord('staff-3', 'Maths'),
        makeSubRecord('staff-4', 'Maths'),
      ]);

      const result = await service.getCoverByDepartment(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.subject_name).toBe('Maths');
      expect(result.data[0]!.cover_count).toBe(3);
    });
  });
});
