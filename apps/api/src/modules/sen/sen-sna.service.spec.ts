import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade } from '../../common/tests/mock-facades';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { SenScopeService } from './sen-scope.service';
import { SenSnaService } from './sen-sna.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PROFILE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ASSIGNMENT_ID = '11111111-1111-1111-1111-111111111111';
const YEAR_GROUP_ID = '22222222-2222-2222-2222-222222222222';

describe('SenSnaService', () => {
  let service: SenSnaService;

  const senSnaAssignmentMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };

  const mockStaffProfileReadFacade = {
    findById: jest.fn(),
  };

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senSnaAssignment: senSnaAssignmentMock,
    senProfile: senProfileMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockSettingsService = {
    getModuleSettings: jest.fn(),
  };

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenSnaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SenScopeService, useValue: mockScopeService },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
      ],
    }).compile();

    service = module.get<SenSnaService>(SenSnaService);

    jest.clearAllMocks();

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });

    mockSettingsService.getModuleSettings.mockResolvedValue({
      sna_schedule_format: 'weekly',
    });
    mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
  });

  const createAssignmentRecord = (overrides: Record<string, unknown> = {}) => ({
    id: ASSIGNMENT_ID,
    tenant_id: TENANT_ID,
    sna_staff_profile_id: STAFF_ID,
    student_id: STUDENT_ID,
    sen_profile_id: PROFILE_ID,
    schedule: {
      monday: [{ start: '09:00', end: '11:00' }],
    },
    status: 'active',
    start_date: new Date('2026-04-01'),
    end_date: null,
    notes: 'Morning support',
    created_at: new Date('2026-04-01T09:00:00.000Z'),
    updated_at: new Date('2026-04-01T09:00:00.000Z'),
    staff_profile: {
      id: STAFF_ID,
      staff_number: 'SNA-001',
      job_title: 'Special Needs Assistant',
      user: {
        id: USER_ID,
        first_name: 'Mary',
        last_name: 'Murphy',
      },
    },
    student: {
      id: STUDENT_ID,
      first_name: 'Amina',
      last_name: 'Byrne',
      year_group: {
        id: YEAR_GROUP_ID,
        name: 'First Year',
      },
    },
    sen_profile: {
      id: PROFILE_ID,
      primary_category: 'learning',
      support_level: 'school_support',
      is_active: true,
    },
    ...overrides,
  });

  describe('create', () => {
    it('should create an assignment successfully', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });
      senSnaAssignmentMock.create.mockResolvedValue(createAssignmentRecord());

      const result = await service.create(TENANT_ID, {
        sna_staff_profile_id: STAFF_ID,
        student_id: STUDENT_ID,
        sen_profile_id: PROFILE_ID,
        schedule: {
          monday: [{ start: '09:00', end: '11:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
        },
        start_date: '2026-04-01',
      });

      expect(result.id).toBe(ASSIGNMENT_ID);
      expect(senSnaAssignmentMock.create).toHaveBeenCalled();
    });

    it('should reject when the SNA staff profile is missing', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue(null);
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            monday: [{ start: '09:00', end: '11:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
          },
          start_date: '2026-04-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject an inactive SEN profile', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: false,
      });

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            monday: [{ start: '09:00', end: '11:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
          },
          start_date: '2026-04-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a mismatched SEN profile', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID_2,
        is_active: true,
      });

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            monday: [{ start: '09:00', end: '11:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
          },
          start_date: '2026-04-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when the SEN profile does not exist', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            monday: [{ start: '09:00', end: '11:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
          },
          start_date: '2026-04-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should validate schedule format against tenant weekly settings', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });
      mockSettingsService.getModuleSettings.mockResolvedValue({
        sna_schedule_format: 'weekly',
      });

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            '2026-04-01': [{ start: '09:00', end: '11:00' }],
          },
          start_date: '2026-04-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept custom day keys when tenant schedule format is daily', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });
      mockSettingsService.getModuleSettings.mockResolvedValue({
        sna_schedule_format: 'daily',
      });
      senSnaAssignmentMock.create.mockResolvedValue(
        createAssignmentRecord({
          schedule: {
            '2026-04-01': [{ start: '09:00', end: '11:00' }],
          },
        }),
      );

      const result = await service.create(TENANT_ID, {
        sna_staff_profile_id: STAFF_ID,
        student_id: STUDENT_ID,
        sen_profile_id: PROFILE_ID,
        schedule: {
          '2026-04-01': [{ start: '09:00', end: '11:00' }],
        },
        start_date: '2026-04-01',
      });

      expect(result.schedule).toEqual({
        '2026-04-01': [{ start: '09:00', end: '11:00' }],
      });
    });
  });

  describe('findAll', () => {
    it('should filter by status, SNA, and student', async () => {
      senSnaAssignmentMock.findMany.mockResolvedValue([createAssignmentRecord()]);
      senSnaAssignmentMock.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, USER_ID, ['sen.view'], {
        page: 1,
        pageSize: 20,
        status: 'active',
        sna_staff_profile_id: STAFF_ID,
        student_id: STUDENT_ID,
      });

      expect(result.meta.total).toBe(1);
      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'active',
            sna_staff_profile_id: STAFF_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update schedule, notes, and status', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-04-01'),
        end_date: null,
      });
      senSnaAssignmentMock.update.mockResolvedValue(
        createAssignmentRecord({
          notes: 'Adjusted support',
          status: 'ended',
          end_date: new Date('2026-06-30'),
        }),
      );

      const result = await service.update(TENANT_ID, ASSIGNMENT_ID, {
        schedule: {
          monday: [{ start: '10:00', end: '12:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
        },
        notes: 'Adjusted support',
        status: 'ended',
        end_date: '2026-06-30',
      });

      expect(result.status).toBe('ended');
      expect(result.notes).toBe('Adjusted support');
      expect(senSnaAssignmentMock.update).toHaveBeenCalled();
    });
  });

  describe('endAssignment', () => {
    it('should set status to ended and persist end_date', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-04-01'),
      });
      senSnaAssignmentMock.update.mockResolvedValue(
        createAssignmentRecord({
          status: 'ended',
          end_date: new Date('2026-06-30'),
        }),
      );

      const result = await service.endAssignment(TENANT_ID, ASSIGNMENT_ID, {
        end_date: '2026-06-30',
      });

      expect(result.status).toBe('ended');
      expect(result.end_date).toEqual(new Date('2026-06-30'));
    });
  });

  describe('findBySna', () => {
    it('should return assignments for a specific SNA', async () => {
      senSnaAssignmentMock.findMany.mockResolvedValue([createAssignmentRecord()]);

      const result = await service.findBySna(TENANT_ID, USER_ID, ['sen.view'], STAFF_ID);

      expect(result).toHaveLength(1);
      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            sna_staff_profile_id: STAFF_ID,
          }),
        }),
      );
    });
  });

  describe('findByStudent', () => {
    it('should return assignments for a specific student', async () => {
      senSnaAssignmentMock.findMany.mockResolvedValue([createAssignmentRecord()]);

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result).toHaveLength(1);
      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should return empty when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result).toEqual([]);
    });

    it('should return empty when student not in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['other-student'],
      });

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('findAll — scope branches', () => {
    it('should return empty when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findAll(TENANT_ID, USER_ID, ['sen.view'], {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it('should apply class scope studentIds filter', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1', 'student-2'],
      });
      senSnaAssignmentMock.findMany.mockResolvedValue([]);
      senSnaAssignmentMock.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.view'], {
        page: 1,
        pageSize: 20,
      });

      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-1', 'student-2'] },
          }),
        }),
      );
    });

    it('should return empty when student_id not in class scope studentIds', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['other-student'],
      });

      const result = await service.findAll(TENANT_ID, USER_ID, ['sen.view'], {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
    });

    it('should apply sen_profile_id filter when provided', async () => {
      senSnaAssignmentMock.findMany.mockResolvedValue([]);
      senSnaAssignmentMock.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        sen_profile_id: PROFILE_ID,
      });

      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sen_profile_id: PROFILE_ID,
          }),
        }),
      );
    });

    it('should default to active status when not provided', async () => {
      senSnaAssignmentMock.findMany.mockResolvedValue([]);
      senSnaAssignmentMock.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
      });

      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'active',
          }),
        }),
      );
    });
  });

  describe('findBySna — scope branches', () => {
    it('should return empty when scope is none', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findBySna(TENANT_ID, USER_ID, ['sen.view'], STAFF_ID);

      expect(result).toEqual([]);
    });

    it('should apply class scope studentIds filter', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      senSnaAssignmentMock.findMany.mockResolvedValue([]);

      await service.findBySna(TENANT_ID, USER_ID, ['sen.view'], STAFF_ID);

      expect(senSnaAssignmentMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-1'] },
          }),
        }),
      );
    });
  });

  describe('create — date validation', () => {
    it('should reject when end_date is before start_date', async () => {
      mockStaffProfileReadFacade.findById.mockResolvedValue({ id: STAFF_ID });
      senProfileMock.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        is_active: true,
      });

      await expect(
        service.create(TENANT_ID, {
          sna_staff_profile_id: STAFF_ID,
          student_id: STUDENT_ID,
          sen_profile_id: PROFILE_ID,
          schedule: {
            monday: [{ start: '09:00', end: '11:00' }],
            tuesday: [],
            wednesday: [],
            thursday: [],
            friday: [],
          },
          start_date: '2026-06-01',
          end_date: '2026-03-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update — additional branches', () => {
    it('should throw when assignment not found', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, ASSIGNMENT_ID, { notes: 'test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use existing start_date when not provided in dto', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-04-01'),
        end_date: null,
      });
      senSnaAssignmentMock.update.mockResolvedValue(createAssignmentRecord({ notes: 'Updated' }));

      await service.update(TENANT_ID, ASSIGNMENT_ID, {
        notes: 'Updated',
      });

      expect(senSnaAssignmentMock.update).toHaveBeenCalled();
    });

    it('should use existing end_date when not provided in dto', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-04-01'),
        end_date: new Date('2026-12-31'),
      });
      senSnaAssignmentMock.update.mockResolvedValue(createAssignmentRecord());

      await service.update(TENANT_ID, ASSIGNMENT_ID, {
        notes: 'Test',
      });

      expect(senSnaAssignmentMock.update).toHaveBeenCalled();
    });

    it('should allow clearing end_date by passing null', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-04-01'),
        end_date: new Date('2026-12-31'),
      });
      senSnaAssignmentMock.update.mockResolvedValue(createAssignmentRecord({ end_date: null }));

      const result = await service.update(TENANT_ID, ASSIGNMENT_ID, {
        end_date: null,
      });

      expect(result.end_date).toBeNull();
    });
  });

  describe('endAssignment — additional branches', () => {
    it('should throw when assignment not found', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue(null);

      await expect(
        service.endAssignment(TENANT_ID, ASSIGNMENT_ID, { end_date: '2026-06-30' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject when end_date is before start_date', async () => {
      senSnaAssignmentMock.findFirst.mockResolvedValue({
        id: ASSIGNMENT_ID,
        start_date: new Date('2026-06-01'),
      });

      await expect(
        service.endAssignment(TENANT_ID, ASSIGNMENT_ID, { end_date: '2026-03-01' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
