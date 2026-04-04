import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TeacherSchedulingConfigService } from './teacher-scheduling-config.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const AY_ID_TARGET = 'ay-2';
const STAFF_ID = 'staff-1';
const CONFIG_ID = 'config-1';

const mockTx = {
  teacherSchedulingConfig: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('TeacherSchedulingConfigService', () => {
  let service: TeacherSchedulingConfigService;
  let mockPrisma: {
    teacherSchedulingConfig: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    staffProfile: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      teacherSchedulingConfig: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffProfile: { findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: jest.fn().mockResolvedValue(null),
            findCurrentYearId: jest.fn().mockResolvedValue('year-1'),
            findYearById: jest.fn().mockResolvedValue(null),
            findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
            findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
            findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
            findYearGroupsWithActiveClasses: jest.fn().mockResolvedValue([]),
            findYearGroupsWithClassesAndCounts: jest.fn().mockResolvedValue([]),
            findAllYearGroups: jest.fn().mockResolvedValue([]),
            findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
            findSubjectById: jest.fn().mockResolvedValue(null),
            findYearGroupById: jest.fn().mockResolvedValue(null),
            findPeriodById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
        TeacherSchedulingConfigService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeacherSchedulingConfigService>(TeacherSchedulingConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return all configs for an academic year', async () => {
      const records = [{ id: CONFIG_ID, staff_profile_id: STAFF_ID, max_periods_per_week: 25 }];
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue(records);

      const result = await service.list(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.teacherSchedulingConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should return empty data when none exist', async () => {
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);

      const result = await service.list(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── upsert ──────────────────────────────────────────────────────────────────

  describe('upsert', () => {
    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: AY_ID,
      max_periods_per_week: 25,
      max_periods_per_day: 6,
      max_supervision_duties_per_week: 3,
    };

    it('should create a new config when none exists', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.teacherSchedulingConfig.findFirst.mockResolvedValue(null);
      mockTx.teacherSchedulingConfig.create.mockResolvedValue({ id: CONFIG_ID, ...dto });

      const result = await service.upsert(TENANT_ID, dto);

      expect(result).toEqual(expect.objectContaining({ id: CONFIG_ID }));
      expect(mockTx.teacherSchedulingConfig.create).toHaveBeenCalled();
    });

    it('should update an existing config', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.teacherSchedulingConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockTx.teacherSchedulingConfig.update.mockResolvedValue({
        id: CONFIG_ID,
        max_periods_per_week: 30,
      });

      const result = await service.upsert(TENANT_ID, { ...dto, max_periods_per_week: 30 });

      expect(result).toEqual(expect.objectContaining({ id: CONFIG_ID, max_periods_per_week: 30 }));
      expect(mockTx.teacherSchedulingConfig.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when staff does not exist', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a config', async () => {
      mockPrisma.teacherSchedulingConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockTx.teacherSchedulingConfig.delete.mockResolvedValue({ id: CONFIG_ID });

      const result = await service.delete(TENANT_ID, CONFIG_ID);

      expect(result.message).toBe('Teacher scheduling config deleted');
    });

    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.teacherSchedulingConfig.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── copyFromAcademicYear ────────────────────────────────────────────────────

  describe('copyFromAcademicYear', () => {
    it('should copy configs from source to target year', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce({ id: AY_ID_TARGET });
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        {
          id: CONFIG_ID,
          staff_profile_id: STAFF_ID,
          max_periods_per_week: 25,
          max_periods_per_day: 6,
          max_supervision_duties_per_week: 3,
        },
      ]);
      mockTx.teacherSchedulingConfig.create.mockResolvedValue({ id: 'new-config' });

      const result = await service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET);

      expect(result.data).toHaveLength(1);
      expect(result.meta.copied).toBe(1);
    });

    it('should throw NotFoundException when source year does not exist', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: AY_ID_TARGET });

      await expect(
        service.copyFromAcademicYear(TENANT_ID, 'nonexistent', AY_ID_TARGET),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when target year does not exist', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce(null);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when source has no data', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce({ id: AY_ID_TARGET });
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
