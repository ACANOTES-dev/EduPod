import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CoverTeacherService } from './cover-teacher.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const SUBJECT_ID = 'sub-1';
const YG_ID = 'yg-1';

const PERIOD_TEMPLATE = {
  start_time: new Date('1970-01-01T09:00:00Z'),
  end_time: new Date('1970-01-01T10:00:00Z'),
};

describe('CoverTeacherService', () => {
  let service: CoverTeacherService;
  let mockPrisma: {
    schedulePeriodTemplate: { findFirst: jest.Mock };
    schedule: { findMany: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    teacherCompetency: { findMany: jest.Mock };
    staffAvailability: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedulePeriodTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      schedule: { findMany: jest.fn().mockResolvedValue([]) },
      staffProfile: { findMany: jest.fn().mockResolvedValue([]) },
      teacherCompetency: { findMany: jest.fn().mockResolvedValue([]) },
      staffAvailability: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoverTeacherService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CoverTeacherService>(CoverTeacherService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findCoverTeacher ────────────────────────────────────────────────────────

  describe('findCoverTeacher', () => {
    it('should return empty data when period template does not exist', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(null);

      const result = await service.findCoverTeacher(TENANT_ID, AY_ID, 1, 1);

      expect(result.data).toHaveLength(0);
    });

    it('should return available teachers excluding busy ones', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      // staff-1 is busy at this time
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([{ teacher_staff_id: 'staff-1' }]) // busy teachers
        .mockResolvedValueOnce([]); // weekly schedules for period count
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Busy' } },
        { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Free' } },
      ]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

      const result = await service.findCoverTeacher(TENANT_ID, AY_ID, 1, 1);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-2');
      expect(result.data[0]!.name).toBe('Bob Free');
    });

    it('should rank competent teachers higher than non-competent ones', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([]) // no busy teachers
        .mockResolvedValueOnce([]); // no weekly schedules
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Non', last_name: 'Competent' } },
        { id: 'staff-2', user: { first_name: 'Is', last_name: 'Competent' } },
      ]);
      // staff-2 is competent for the subject
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-2', is_primary: false },
      ]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

      const result = await service.findCoverTeacher(
        TENANT_ID, AY_ID, 1, 1, SUBJECT_ID, YG_ID,
      );

      const competent = result.data.find((t) => t.staff_profile_id === 'staff-2');
      const nonCompetent = result.data.find((t) => t.staff_profile_id === 'staff-1');
      expect(competent?.is_competent).toBe(true);
      expect(nonCompetent?.is_competent).toBe(false);
      expect(competent!.rank_score).toBeGreaterThan(nonCompetent!.rank_score);
    });

    it('should rank primary competent teachers higher than secondary', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Secondary', last_name: 'Teacher' } },
        { id: 'staff-2', user: { first_name: 'Primary', last_name: 'Teacher' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', is_primary: false },
        { staff_profile_id: 'staff-2', is_primary: true },
      ]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

      const result = await service.findCoverTeacher(
        TENANT_ID, AY_ID, 1, 1, SUBJECT_ID, YG_ID,
      );

      const primary = result.data.find((t) => t.staff_profile_id === 'staff-2');
      const secondary = result.data.find((t) => t.staff_profile_id === 'staff-1');
      expect(primary?.is_primary).toBe(true);
      expect(secondary?.is_primary).toBe(false);
      expect(primary!.rank_score).toBeGreaterThan(secondary!.rank_score);
    });

    it('should penalise teachers with higher workload (fairness scoring)', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([]) // no busy teachers
        .mockResolvedValueOnce([
          // staff-1 has 20 periods, staff-2 has 5
          ...Array.from({ length: 20 }, () => ({ teacher_staff_id: 'staff-1' })),
          ...Array.from({ length: 5 }, () => ({ teacher_staff_id: 'staff-2' })),
        ]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Overloaded', last_name: 'Teacher' } },
        { id: 'staff-2', user: { first_name: 'Light', last_name: 'Teacher' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

      const result = await service.findCoverTeacher(TENANT_ID, AY_ID, 1, 1);

      const overloaded = result.data.find((t) => t.staff_profile_id === 'staff-1');
      const light = result.data.find((t) => t.staff_profile_id === 'staff-2');
      expect(overloaded?.current_period_count).toBe(20);
      expect(light?.current_period_count).toBe(5);
      expect(light!.rank_score).toBeGreaterThan(overloaded!.rank_score);
    });

    it('should mark teachers as unavailable based on availability records', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Available', last_name: 'Teacher' } },
        { id: 'staff-2', user: { first_name: 'Unavailable', last_name: 'Teacher' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      // staff-2 is only available in the afternoon (period is 9-10 AM)
      mockPrisma.staffAvailability.findMany.mockResolvedValue([
        {
          staff_profile_id: 'staff-2',
          available_from: new Date('1970-01-01T13:00:00Z'),
          available_to: new Date('1970-01-01T17:00:00Z'),
        },
      ]);

      const result = await service.findCoverTeacher(TENANT_ID, AY_ID, 1, 1);

      const available = result.data.find((t) => t.staff_profile_id === 'staff-1');
      const unavailable = result.data.find((t) => t.staff_profile_id === 'staff-2');
      expect(available?.is_available).toBe(true);
      expect(unavailable?.is_available).toBe(false);
      expect(available!.rank_score).toBeGreaterThan(unavailable!.rank_score);
    });

    it('should sort results by rank_score descending', async () => {
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(PERIOD_TEMPLATE);
      mockPrisma.schedule.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          ...Array.from({ length: 10 }, () => ({ teacher_staff_id: 'staff-1' })),
        ]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Low', last_name: 'Rank' } },
        { id: 'staff-2', user: { first_name: 'High', last_name: 'Rank' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

      const result = await service.findCoverTeacher(TENANT_ID, AY_ID, 1, 1);

      expect(result.data.length).toBeGreaterThanOrEqual(2);
      // Results should be sorted descending by rank_score
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i - 1]!.rank_score).toBeGreaterThanOrEqual(result.data[i]!.rank_score);
      }
    });
  });
});
