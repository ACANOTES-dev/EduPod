import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SchedulingReadFacade } from './scheduling-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';

describe('SchedulingReadFacade', () => {
  let facade: SchedulingReadFacade;
  let mockPrisma: {
    schedulePeriodTemplate: {
      findFirst: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    classSchedulingRequirement: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    curriculumRequirement: {
      findMany: jest.Mock;
    };
    teacherCompetency: {
      findMany: jest.Mock;
    };
    teacherSchedulingConfig: {
      findMany: jest.Mock;
    };
    substitutionRecord: {
      count: jest.Mock;
      findMany: jest.Mock;
    };
    breakGroup: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedulePeriodTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      classSchedulingRequirement: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      curriculumRequirement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherSchedulingConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      substitutionRecord: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      breakGroup: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SchedulingReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<SchedulingReadFacade>(SchedulingReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findPeriodTemplate ──────────────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodTemplate', () => {
    it('should find a period template by weekday and period order', async () => {
      const template = { start_time: new Date(), end_time: new Date() };
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(template);

      const result = await facade.findPeriodTemplate(TENANT_ID, AY_ID, 1, 1);

      expect(result).toEqual(template);
      expect(mockPrisma.schedulePeriodTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID, weekday: 1, period_order: 1 },
        }),
      );
    });

    it('should return null when no template found', async () => {
      const result = await facade.findPeriodTemplate(TENANT_ID, AY_ID, 5, 10);
      expect(result).toBeNull();
    });
  });

  // ─── countTeachingPeriods ────────────────────────────────────────────────

  describe('SchedulingReadFacade — countTeachingPeriods', () => {
    it('should count teaching period templates', async () => {
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(30);
      const result = await facade.countTeachingPeriods(TENANT_ID, AY_ID);
      expect(result).toBe(30);
    });
  });

  // ─── findPeriodTemplatesFiltered ─────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodTemplatesFiltered', () => {
    it('should apply custom where filter and default orderBy', async () => {
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      await facade.findPeriodTemplatesFiltered(TENANT_ID, { weekday: 1 });
      expect(mockPrisma.schedulePeriodTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, weekday: 1 },
          orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
        }),
      );
    });

    it('should use custom orderBy when provided', async () => {
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      await facade.findPeriodTemplatesFiltered(TENANT_ID, {}, [{ period_order: 'desc' }]);
      expect(mockPrisma.schedulePeriodTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ period_order: 'desc' }],
        }),
      );
    });
  });

  // ─── countPeriodTemplates ────────────────────────────────────────────────

  describe('SchedulingReadFacade — countPeriodTemplates', () => {
    it('should count with no extra filter when where omitted', async () => {
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(5);
      const result = await facade.countPeriodTemplates(TENANT_ID);
      expect(result).toBe(5);
      expect(mockPrisma.schedulePeriodTemplate.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should merge extra where filter', async () => {
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(3);
      const result = await facade.countPeriodTemplates(TENANT_ID, { weekday: 1 });
      expect(result).toBe(3);
      expect(mockPrisma.schedulePeriodTemplate.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, weekday: 1 },
      });
    });
  });

  // ─── findPeriodTemplateById ──────────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodTemplateById', () => {
    it('should return template when found', async () => {
      const template = { id: 'tpl-1' };
      mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(template);
      const result = await facade.findPeriodTemplateById(TENANT_ID, 'tpl-1');
      expect(result).toEqual(template);
    });

    it('should return null when not found', async () => {
      const result = await facade.findPeriodTemplateById(TENANT_ID, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── countClassRequirements ──────────────────────────────────────────────

  describe('SchedulingReadFacade — countClassRequirements', () => {
    it('should count without activeAcademicOnly filter', async () => {
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(10);
      const result = await facade.countClassRequirements(TENANT_ID, AY_ID);
      expect(result).toBe(10);
    });

    it('should apply activeAcademicOnly filter', async () => {
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(7);
      const result = await facade.countClassRequirements(TENANT_ID, AY_ID, {
        activeAcademicOnly: true,
      });
      expect(result).toBe(7);
      expect(mockPrisma.classSchedulingRequirement.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            class_entity: { status: 'active', subject: { subject_type: 'academic' } },
          }),
        }),
      );
    });
  });

  // ─── findClassRequirementsWithDetails ────────────────────────────────────

  describe('SchedulingReadFacade — findClassRequirementsWithDetails', () => {
    it('should find without activeAcademicOnly', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([]);
      await facade.findClassRequirementsWithDetails(TENANT_ID, AY_ID);
      expect(mockPrisma.classSchedulingRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should apply activeAcademicOnly filter', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([]);
      await facade.findClassRequirementsWithDetails(TENANT_ID, AY_ID, {
        activeAcademicOnly: true,
      });
      expect(mockPrisma.classSchedulingRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            class_entity: { status: 'active', subject: { subject_type: 'academic' } },
          }),
        }),
      );
    });
  });

  // ─── findCurriculumRequirements ──────────────────────────────────────────

  describe('SchedulingReadFacade — findCurriculumRequirements', () => {
    it('should find without yearGroupIds', async () => {
      await facade.findCurriculumRequirements(TENANT_ID, AY_ID);
      expect(mockPrisma.curriculumRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should filter by yearGroupIds when provided', async () => {
      await facade.findCurriculumRequirements(TENANT_ID, AY_ID, {
        yearGroupIds: ['yg-1', 'yg-2'],
      });
      expect(mockPrisma.curriculumRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year_group_id: { in: ['yg-1', 'yg-2'] },
          }),
        }),
      );
    });
  });

  // ─── findCurriculumYearGroupIds ──────────────────────────────────────────

  describe('SchedulingReadFacade — findCurriculumYearGroupIds', () => {
    it('should find without yearGroupIds filter', async () => {
      await facade.findCurriculumYearGroupIds(TENANT_ID, AY_ID);
      expect(mockPrisma.curriculumRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should filter by yearGroupIds when provided', async () => {
      await facade.findCurriculumYearGroupIds(TENANT_ID, AY_ID, ['yg-1']);
      expect(mockPrisma.curriculumRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year_group_id: { in: ['yg-1'] },
          }),
        }),
      );
    });
  });

  // ─── findTeacherCompetencies ─────────────────────────────────────────────

  describe('SchedulingReadFacade — findTeacherCompetencies', () => {
    it('should find without opts', async () => {
      await facade.findTeacherCompetencies(TENANT_ID, AY_ID);
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should filter by subjectId when provided', async () => {
      await facade.findTeacherCompetencies(TENANT_ID, AY_ID, { subjectId: 'sub-1' });
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subject_id: 'sub-1' }),
        }),
      );
    });

    it('should filter by yearGroupId when provided', async () => {
      await facade.findTeacherCompetencies(TENANT_ID, AY_ID, { yearGroupId: 'yg-1' });
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ year_group_id: 'yg-1' }),
        }),
      );
    });

    it('should filter by both subjectId and yearGroupId', async () => {
      await facade.findTeacherCompetencies(TENANT_ID, AY_ID, {
        subjectId: 'sub-1',
        yearGroupId: 'yg-1',
      });
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subject_id: 'sub-1', year_group_id: 'yg-1' }),
        }),
      );
    });
  });

  // ─── countRecentSubstitutionsByStaff ─────────────────────────────────────

  describe('SchedulingReadFacade — countRecentSubstitutionsByStaff', () => {
    it('should return a Map of staff to substitution count', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        { substitute_staff_id: 'staff-1' },
        { substitute_staff_id: 'staff-1' },
        { substitute_staff_id: 'staff-2' },
      ]);
      const sinceDate = new Date('2026-01-01');
      const result = await facade.countRecentSubstitutionsByStaff(TENANT_ID, sinceDate);
      expect(result.get('staff-1')).toBe(2);
      expect(result.get('staff-2')).toBe(1);
    });

    it('should return empty Map when no records', async () => {
      const result = await facade.countRecentSubstitutionsByStaff(TENANT_ID, new Date());
      expect(result.size).toBe(0);
    });
  });

  // ─── findClassRequirementsPaginated ──────────────────────────────────────

  describe('SchedulingReadFacade — findClassRequirementsPaginated', () => {
    it('should return paginated data with total', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([{ id: 'req-1' }]);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(1);
      // We need a count mock since findMany and count run in parallel
      const result = await facade.findClassRequirementsPaginated(TENANT_ID, AY_ID, {
        skip: 0,
        take: 20,
      });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  // ─── findBreakGroups ─────────────────────────────────────────────────────

  describe('SchedulingReadFacade — findBreakGroups', () => {
    it('should return break groups for an academic year', async () => {
      const groups = [{ id: 'bg-1', name: 'Break A', year_groups: [] }];
      mockPrisma.breakGroup.findMany.mockResolvedValue(groups);
      const result = await facade.findBreakGroups(TENANT_ID, AY_ID);
      expect(result).toEqual(groups);
    });
  });

  // ─── findPeriodTemplates ─────────────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodTemplates', () => {
    it('should return period templates ordered by weekday and period_order', async () => {
      await facade.findPeriodTemplates(TENANT_ID, AY_ID);
      expect(mockPrisma.schedulePeriodTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
        }),
      );
    });
  });

  // ─── findTeacherConfigs ──────────────────────────────────────────────────

  describe('SchedulingReadFacade — findTeacherConfigs', () => {
    it('should return teacher configs', async () => {
      const configs = [{ staff_profile_id: 'sp-1', max_periods_per_week: 25 }];
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue(configs);
      const result = await facade.findTeacherConfigs(TENANT_ID, AY_ID);
      expect(result).toEqual(configs);
    });
  });

  // ─── countSubstitutionRecords ────────────────────────────────────────────

  describe('SchedulingReadFacade — countSubstitutionRecords', () => {
    it('should return count of substitution records', async () => {
      mockPrisma.substitutionRecord.count.mockResolvedValue(15);
      const result = await facade.countSubstitutionRecords(TENANT_ID);
      expect(result).toBe(15);
    });
  });

  // ─── findPeriodGridYearGroupIds ──────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodGridYearGroupIds', () => {
    it('should return distinct year group IDs', async () => {
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        { year_group_id: 'yg-1' },
        { year_group_id: null },
      ]);
      const result = await facade.findPeriodGridYearGroupIds(TENANT_ID, AY_ID);
      expect(result).toHaveLength(2);
    });
  });

  // ─── findDistinctTeachingSlots ──────────────────────────────────────────

  describe('SchedulingReadFacade — findDistinctTeachingSlots', () => {
    it('should return distinct weekday + period_order pairs', async () => {
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        { weekday: 0, period_order: 1 },
        { weekday: 0, period_order: 2 },
      ]);
      const result = await facade.findDistinctTeachingSlots(TENANT_ID, AY_ID);
      expect(result).toHaveLength(2);
    });
  });

  // ─── findPeriodTemplatesForHash ─────────────────────────────────────────

  describe('SchedulingReadFacade — findPeriodTemplatesForHash', () => {
    it('should select only hash-relevant fields', async () => {
      await facade.findPeriodTemplatesForHash(TENANT_ID, AY_ID);
      expect(mockPrisma.schedulePeriodTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            weekday: true,
            period_order: true,
            start_time: true,
            end_time: true,
            schedule_period_type: true,
          }),
        }),
      );
    });
  });

  // ─── findClassRequirementById ────────────────────────────────────────────

  describe('SchedulingReadFacade — findClassRequirementById', () => {
    it('should return requirement when found', async () => {
      mockPrisma.classSchedulingRequirement.findFirst.mockResolvedValue({ id: 'req-1' });
      const result = await facade.findClassRequirementById(TENANT_ID, 'req-1');
      expect(result).toEqual({ id: 'req-1' });
    });

    it('should return null when not found', async () => {
      const result = await facade.findClassRequirementById(TENANT_ID, 'nonexistent');
      expect(result).toBeNull();
    });
  });
});
