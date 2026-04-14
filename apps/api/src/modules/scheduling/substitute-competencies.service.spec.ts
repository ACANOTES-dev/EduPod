import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SubstituteCompetenciesService } from './substitute-competencies.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const STAFF_ID = 'staff-1';
const STAFF_PINNED = 'staff-pinned';
const STAFF_POOL = 'staff-pool';
const SUBJECT_ID = 'sub-1';
const YG_ID = 'yg-1';
const CLASS_ID = 'class-1';
const OTHER_CLASS_ID = 'class-2';
const COMP_ID = 'comp-1';

const mockTx = {
  substituteTeacherCompetency: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('SubstituteCompetenciesService', () => {
  let service: SubstituteCompetenciesService;
  let module: TestingModule;
  let mockPrisma: {
    substituteTeacherCompetency: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      substituteTeacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: AcademicReadFacade,
          useValue: {
            findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
            findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
            findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
          },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: CLASS_ID, year_group_id: YG_ID }),
          },
        },
        {
          provide: SchedulesReadFacade,
          useValue: {
            countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
          },
        },
        {
          provide: StaffAvailabilityReadFacade,
          useValue: {
            findByWeekday: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            findActiveStaff: jest.fn().mockResolvedValue([]),
          },
        },
        SubstituteCompetenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(SubstituteCompetenciesService);
    Object.values(mockTx.substituteTeacherCompetency).forEach((fn) => fn.mockReset());
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a pool row when class_id is null', async () => {
      mockTx.substituteTeacherCompetency.create.mockResolvedValue({ id: COMP_ID, class_id: null });

      const result = await service.create(TENANT_ID, {
        academic_year_id: AY_ID,
        staff_profile_id: STAFF_ID,
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        class_id: null,
      });

      expect(mockTx.substituteTeacherCompetency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenant_id: TENANT_ID, class_id: null }),
        }),
      );
      expect((result as { id: string }).id).toBe(COMP_ID);
    });

    it('creates a pin row when class_id is provided and matches year group', async () => {
      mockTx.substituteTeacherCompetency.create.mockResolvedValue({
        id: COMP_ID,
        class_id: CLASS_ID,
      });

      await service.create(TENANT_ID, {
        academic_year_id: AY_ID,
        staff_profile_id: STAFF_ID,
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        class_id: CLASS_ID,
      });

      expect(mockTx.substituteTeacherCompetency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ class_id: CLASS_ID }),
        }),
      );
    });

    it('throws ConflictException when a pool duplicate already exists', async () => {
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create(TENANT_ID, {
          academic_year_id: AY_ID,
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          class_id: null,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when pin class belongs to a different year group', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findById as jest.Mock).mockResolvedValueOnce({
        id: CLASS_ID,
        year_group_id: 'other-yg',
      });

      await expect(
        service.create(TENANT_ID, {
          academic_year_id: AY_ID,
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          class_id: CLASS_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('promotes a pool row to a pin by setting class_id', async () => {
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue({
        id: COMP_ID,
        tenant_id: TENANT_ID,
        academic_year_id: AY_ID,
        staff_profile_id: STAFF_ID,
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        class_id: null,
      });
      mockTx.substituteTeacherCompetency.update.mockResolvedValue({
        id: COMP_ID,
        class_id: CLASS_ID,
      });

      await service.update(TENANT_ID, COMP_ID, { class_id: CLASS_ID });

      expect(mockTx.substituteTeacherCompetency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMP_ID },
          data: { class_id: CLASS_ID },
        }),
      );
    });

    it('returns current row on no-op update (undefined class_id)', async () => {
      const existing = {
        id: COMP_ID,
        tenant_id: TENANT_ID,
        academic_year_id: AY_ID,
        staff_profile_id: STAFF_ID,
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        class_id: null,
      };
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue(existing);

      const result = await service.update(TENANT_ID, COMP_ID, {});
      expect(result).toEqual(existing);
      expect(mockTx.substituteTeacherCompetency.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown id', async () => {
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue(null);
      await expect(service.update(TENANT_ID, COMP_ID, { class_id: null })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an existing row', async () => {
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue({ id: COMP_ID });
      await service.delete(TENANT_ID, COMP_ID);
      expect(mockTx.substituteTeacherCompetency.delete).toHaveBeenCalledWith({
        where: { id: COMP_ID },
      });
    });

    it('throws NotFoundException when the row does not exist', async () => {
      mockPrisma.substituteTeacherCompetency.findFirst.mockResolvedValue(null);
      await expect(service.delete(TENANT_ID, COMP_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── suggest ───────────────────────────────────────────────────────────────

  describe('suggest', () => {
    it('ranks a pin above a pool entry for the same subject', async () => {
      mockPrisma.substituteTeacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: STAFF_PINNED, class_id: CLASS_ID },
        { staff_profile_id: STAFF_POOL, class_id: null },
      ]);
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: STAFF_PINNED, user: { first_name: 'Pia', last_name: 'Pin' } },
        { id: STAFF_POOL, user: { first_name: 'Polly', last_name: 'Pool' } },
      ]);

      const result = await service.suggest(TENANT_ID, AY_ID, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        date: '2026-04-14',
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]?.staff_profile_id).toBe(STAFF_PINNED);
      expect(result.data[0]?.is_pinned).toBe(true);
      expect(result.data[1]?.staff_profile_id).toBe(STAFF_POOL);
      expect(result.data[1]?.is_pinned).toBe(false);
    });

    it('uses workload as a tiebreaker when two pool candidates are equally qualified', async () => {
      mockPrisma.substituteTeacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'light', class_id: null },
        { staff_profile_id: 'heavy', class_id: null },
      ]);
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'light', user: { first_name: 'L', last_name: 'ight' } },
        { id: 'heavy', user: { first_name: 'H', last_name: 'eavy' } },
      ]);
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.countWeeklyPeriodsPerTeacher as jest.Mock).mockResolvedValue(
        new Map([
          ['light', 2],
          ['heavy', 25],
        ]),
      );

      const result = await service.suggest(TENANT_ID, AY_ID, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        date: '2026-04-14',
      });

      expect(result.data[0]?.staff_profile_id).toBe('light');
      expect(result.data[1]?.staff_profile_id).toBe('heavy');
    });

    it('returns an empty array when no competencies exist for the subject', async () => {
      mockPrisma.substituteTeacherCompetency.findMany.mockResolvedValue([]);
      const result = await service.suggest(TENANT_ID, AY_ID, {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        date: '2026-04-14',
      });
      expect(result.data).toEqual([]);
    });

    it('throws NotFoundException when the class_id does not exist', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findById as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.suggest(TENANT_ID, AY_ID, {
          class_id: OTHER_CLASS_ID,
          subject_id: SUBJECT_ID,
          date: '2026-04-14',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
