import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

  const staffProfileMock = {
    findFirst: jest.fn(),
  };

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senSnaAssignment: senSnaAssignmentMock,
    staffProfile: staffProfileMock,
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
        SenSnaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: SenScopeService, useValue: mockScopeService },
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
      staffProfileMock.findFirst.mockResolvedValue(null);
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
      staffProfileMock.findFirst.mockResolvedValue({ id: STAFF_ID });
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
  });
});
