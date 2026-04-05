import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import type { CreateSenProfileDto } from '@school/shared/sen';

import { AcademicReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SenProfileService } from './sen-profile.service';
import { SenScopeService } from './sen-scope.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROFILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const COORDINATOR_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('SenProfileService', () => {
  let service: SenProfileService;

  const senProfileMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  };

  const mockAcademicReadFacade = {
    findAllYearGroups: jest.fn().mockResolvedValue([]),
  };

  const mockPrisma = {
    senProfile: senProfileMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  const mockScopeService = {
    getUserScope: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SenProfileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SenScopeService, useValue: mockScopeService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
      ],
    }).compile();

    service = module.get<SenProfileService>(SenProfileService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Fixtures ─────────────────────────────────────────────────────────────────

  const createMockProfile = (overrides = {}) => ({
    id: PROFILE_ID,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    sen_coordinator_user_id: COORDINATOR_ID,
    sen_categories: ['learning', 'sensory'] as unknown as Prisma.JsonValue,
    primary_category: 'learning',
    support_level: 'school_support',
    diagnosis: 'Dyslexia',
    diagnosis_date: new Date('2024-01-15'),
    diagnosis_source: 'Educational Psychologist',
    assessment_notes: 'Assessment notes',
    is_active: true,
    flagged_date: new Date('2024-01-01'),
    unflagged_date: null,
    created_at: new Date(),
    updated_at: new Date(),
    student: {
      id: STUDENT_ID,
      first_name: 'John',
      last_name: 'Doe',
      year_group_id: 'year-group-1',
    },
    sen_coordinator: {
      id: COORDINATOR_ID,
      first_name: 'Jane',
      last_name: 'Smith',
    },
    support_plans: [],
    accommodations: [],
    involvements: [],
    ...overrides,
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a SEN profile successfully', async () => {
      const dto: CreateSenProfileDto = {
        student_id: STUDENT_ID,
        sen_coordinator_user_id: COORDINATOR_ID,
        sen_categories: ['learning', 'sensory'],
        primary_category: 'learning',
        support_level: 'school_support',
        diagnosis: 'Dyslexia',
        diagnosis_date: '2024-01-15',
        diagnosis_source: 'Educational Psychologist',
        assessment_notes: 'Assessment notes',
        is_active: true,
        flagged_date: '2024-01-01',
      };

      const mockProfile = createMockProfile();
      mockPrisma.senProfile.create.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(mockProfile);
    });

    it('should throw ConflictException for duplicate student', async () => {
      const dto: CreateSenProfileDto = {
        student_id: STUDENT_ID,
        sen_categories: ['learning'],
        primary_category: 'learning',
        support_level: 'school_support',
        is_active: true,
      };

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint violation', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn(() => {
          throw p2002;
        }),
      });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return empty result for scope "none"', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      const result = await service.findAll(TENANT_ID, USER_ID, [], {
        page: 1,
        pageSize: 20,
      });

      expect(result).toEqual({
        data: [],
        meta: { page: 1, pageSize: 20, total: 0 },
      });
      expect(mockPrisma.senProfile.findMany).not.toHaveBeenCalled();
    });

    it('should return all profiles for scope "all"', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfiles = [createMockProfile()];
      mockPrisma.senProfile.findMany.mockResolvedValue(mockProfiles);
      mockPrisma.senProfile.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by studentIds for scope "class"', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1', 'student-2'],
      });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.view'], {
        page: 1,
        pageSize: 20,
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-1', 'student-2'] },
          }),
        }),
      );
    });

    it('should apply category filter', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        primary_category: 'learning',
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            primary_category: 'learning',
          }),
        }),
      );
    });

    it('should apply support level filter', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        support_level: 'school_support_plus',
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            support_level: 'school_support_plus',
          }),
        }),
      );
    });

    it('should apply search filter', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        search: 'John',
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({ first_name: expect.any(Object) }),
                expect.objectContaining({ last_name: expect.any(Object) }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return profile with all relations', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findOne(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID);

      expect(result.id).toBe(PROFILE_ID);
      expect(result.student).toBeDefined();
    });

    it('should throw NotFoundException for scope "none"', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(service.findOne(TENANT_ID, USER_ID, [], PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when profile not found', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should redact sensitive fields without sen.view_sensitive', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findOne(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID);

      expect(result.diagnosis).toBeNull();
      expect(result.diagnosis_date).toBeNull();
      expect(result.diagnosis_source).toBeNull();
      expect(result.assessment_notes).toBeNull();
      expect(result.involvements).toEqual([]);
    });

    it('should show sensitive fields with sen.view_sensitive', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findOne(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.view_sensitive'],
        PROFILE_ID,
      );

      expect(result.diagnosis).toBe('Dyslexia');
      expect(result.assessment_notes).toBe('Assessment notes');
    });

    it('should filter by class scope studentIds', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['student-1'],
      });
      mockPrisma.senProfile.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.senProfile.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-1'] },
          }),
        }),
      );
    });
  });

  // ─── findByStudent ────────────────────────────────────────────────────────────

  describe('findByStudent', () => {
    it('should return profile by student ID', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result.student_id).toBe(STUDENT_ID);
    });

    it('should throw NotFoundException for scope "none"', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'none' });

      await expect(service.findByStudent(TENANT_ID, USER_ID, [], STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when student not in scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: ['other-student'],
      });

      await expect(
        service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when profile not found', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should redact sensitive fields without sen.view_sensitive', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result.diagnosis).toBeNull();
      expect(result.assessment_notes).toBeNull();
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update profile successfully', async () => {
      const dto = {
        support_level: 'school_support_plus' as const,
        assessment_notes: 'Updated notes',
      };

      const mockProfile = createMockProfile({ support_level: 'school_support_plus' });
      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      const result = (await service.update(TENANT_ID, PROFILE_ID, dto)) as Record<string, unknown>;

      expect(result.support_level).toBe('school_support_plus');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      const dto = { support_level: 'school_support_plus' as const };

      mockPrisma.senProfile.findFirst.mockResolvedValue(null);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await expect(service.update(TENANT_ID, PROFILE_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should allow clearing nullable fields', async () => {
      const dto = {
        diagnosis: null,
        diagnosis_date: null,
      };

      const mockProfile = createMockProfile({ diagnosis: null });
      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await service.update(TENANT_ID, PROFILE_ID, dto);

      expect(mockPrisma.senProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diagnosis: null,
            diagnosis_date: null,
          }),
        }),
      );
    });
  });

  // ─── getOverview ──────────────────────────────────────────────────────────────

  describe('getOverview', () => {
    it('should return dashboard overview', async () => {
      mockPrisma.senProfile.count.mockResolvedValue(10);
      mockPrisma.senProfile.groupBy
        .mockResolvedValueOnce([
          { primary_category: 'learning', _count: { id: 5 } },
          { primary_category: 'sensory', _count: { id: 3 } },
        ])
        .mockResolvedValueOnce([
          { support_level: 'school_support', _count: { id: 7 } },
          { support_level: 'school_support_plus', _count: { id: 3 } },
        ]);
      mockPrisma.senProfile.findMany.mockResolvedValue([
        { student: { year_group_id: 'yg-1' } },
        { student: { year_group_id: 'yg-1' } },
        { student: { year_group_id: 'yg-2' } },
      ]);
      mockAcademicReadFacade.findAllYearGroups.mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
        { id: 'yg-2', name: 'Year 2' },
      ]);

      const result = await service.getOverview(TENANT_ID);

      expect(result.totalSenStudents).toBe(10);
      expect(result.byCategory).toEqual({
        learning: 5,
        sensory: 3,
      });
      expect(result.bySupportLevel).toEqual({
        school_support: 7,
        school_support_plus: 3,
      });
      expect(result.byYearGroup).toHaveLength(2);
      expect(result.byYearGroup).toContainEqual({
        yearGroupId: 'yg-1',
        yearGroupName: 'Year 1',
        count: 2,
      });
    });

    it('should handle profiles without year groups', async () => {
      mockPrisma.senProfile.count.mockResolvedValue(5);
      mockPrisma.senProfile.groupBy
        .mockResolvedValueOnce([{ primary_category: 'learning', _count: { id: 5 } }])
        .mockResolvedValueOnce([{ support_level: 'school_support', _count: { id: 5 } }]);
      mockPrisma.senProfile.findMany.mockResolvedValue([
        { student: { year_group_id: null } },
        { student: { year_group_id: 'yg-1' } },
        { student: null },
      ]);
      mockAcademicReadFacade.findAllYearGroups.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);

      const result = await service.getOverview(TENANT_ID);

      expect(result.byYearGroup).toHaveLength(1);
      expect(result.byYearGroup[0]!.count).toBe(1);
    });

    it('should return "Unknown" for year groups not found in academic facade', async () => {
      mockPrisma.senProfile.count.mockResolvedValue(1);
      mockPrisma.senProfile.groupBy
        .mockResolvedValueOnce([{ primary_category: 'learning', _count: { id: 1 } }])
        .mockResolvedValueOnce([{ support_level: 'school_support', _count: { id: 1 } }]);
      mockPrisma.senProfile.findMany.mockResolvedValue([
        { student: { year_group_id: 'yg-unknown' } },
      ]);
      mockAcademicReadFacade.findAllYearGroups.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID);

      expect(result.byYearGroup).toHaveLength(1);
      expect(result.byYearGroup[0]!.yearGroupName).toBe('Unknown');
    });

    it('should skip fetching year group names when no year groups found', async () => {
      mockPrisma.senProfile.count.mockResolvedValue(1);
      mockPrisma.senProfile.groupBy
        .mockResolvedValueOnce([{ primary_category: 'learning', _count: { id: 1 } }])
        .mockResolvedValueOnce([{ support_level: 'school_support', _count: { id: 1 } }]);
      mockPrisma.senProfile.findMany.mockResolvedValue([{ student: { year_group_id: null } }]);

      const result = await service.getOverview(TENANT_ID);

      expect(result.byYearGroup).toHaveLength(0);
      expect(mockAcademicReadFacade.findAllYearGroups).not.toHaveBeenCalled();
    });
  });

  // ─── Additional branch coverage ─────────────────────────────────────────────

  describe('findAll — additional filters', () => {
    it('should filter by student_id', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        student_id: STUDENT_ID,
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should filter by sen_coordinator_user_id', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        sen_coordinator_user_id: COORDINATOR_ID,
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sen_coordinator_user_id: COORDINATOR_ID,
          }),
        }),
      );
    });

    it('should filter by is_active', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      mockPrisma.senProfile.findMany.mockResolvedValue([]);
      mockPrisma.senProfile.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, USER_ID, ['sen.admin'], {
        page: 1,
        pageSize: 20,
        is_active: false,
      });

      expect(mockPrisma.senProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: false,
          }),
        }),
      );
    });
  });

  describe('create — additional branches', () => {
    it('should rethrow non-P2002 errors', async () => {
      const dto: CreateSenProfileDto = {
        student_id: STUDENT_ID,
        sen_categories: ['learning'],
        primary_category: 'learning',
        support_level: 'school_support',
        is_active: true,
      };

      const genericError = new Error('Connection timeout');
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn(() => {
          throw genericError;
        }),
      });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow('Connection timeout');
    });

    it('should handle optional fields defaulting to null', async () => {
      const dto: CreateSenProfileDto = {
        student_id: STUDENT_ID,
        sen_categories: ['learning'],
        primary_category: 'learning',
        support_level: 'school_support',
        is_active: true,
      };

      const mockProfile = createMockProfile({
        sen_coordinator_user_id: null,
        diagnosis: null,
        diagnosis_date: null,
        diagnosis_source: null,
        assessment_notes: null,
        flagged_date: null,
        unflagged_date: null,
      });
      mockPrisma.senProfile.create.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      const result = await service.create(TENANT_ID, dto);

      expect(result).toBeDefined();
      expect(mockPrisma.senProfile.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sen_coordinator_user_id: null,
            diagnosis: null,
            diagnosis_date: null,
            diagnosis_source: null,
            assessment_notes: null,
            is_active: true,
            flagged_date: null,
            unflagged_date: null,
          }),
        }),
      );
    });
  });

  describe('findByStudent — class scope with student in scope', () => {
    it('should return profile when student is in class scope', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: [STUDENT_ID],
      });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findByStudent(TENANT_ID, USER_ID, ['sen.view'], STUDENT_ID);

      expect(result.student_id).toBe(STUDENT_ID);
    });

    it('should show sensitive fields with sen.view_sensitive permission', async () => {
      mockScopeService.getUserScope.mockResolvedValue({ scope: 'all' });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findByStudent(
        TENANT_ID,
        USER_ID,
        ['sen.view', 'sen.view_sensitive'],
        STUDENT_ID,
      );

      expect(result.diagnosis).toBe('Dyslexia');
      expect(result.assessment_notes).toBe('Assessment notes');
      expect(result.involvements).toEqual([]);
    });
  });

  describe('update — nullable field branches', () => {
    it('should handle setting unflagged_date to a date string', async () => {
      const dto = {
        unflagged_date: '2026-05-01',
      };

      const mockProfile = createMockProfile({ unflagged_date: new Date('2026-05-01') });
      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await service.update(TENANT_ID, PROFILE_ID, dto);

      expect(mockPrisma.senProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unflagged_date: new Date('2026-05-01'),
          }),
        }),
      );
    });

    it('should handle setting flagged_date to null', async () => {
      const dto = {
        flagged_date: null,
        unflagged_date: null,
        diagnosis_date: null,
      };

      const mockProfile = createMockProfile({
        flagged_date: null,
        unflagged_date: null,
        diagnosis_date: null,
      });
      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(mockProfile);

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await service.update(TENANT_ID, PROFILE_ID, dto);

      expect(mockPrisma.senProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            flagged_date: null,
            unflagged_date: null,
            diagnosis_date: null,
          }),
        }),
      );
    });

    it('should handle setting sen_categories', async () => {
      const dto = {
        sen_categories: ['sensory' as const, 'physical' as const],
      };

      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(createMockProfile());

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await service.update(TENANT_ID, PROFILE_ID, dto);

      expect(mockPrisma.senProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sen_categories: ['sensory', 'physical'],
          }),
        }),
      );
    });

    it('should handle setting diagnosis_source to null', async () => {
      const dto = {
        diagnosis_source: null,
      };

      mockPrisma.senProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });
      mockPrisma.senProfile.update.mockResolvedValue(createMockProfile());

      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
      createRlsClient.mockReturnValue({
        $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
      });

      await service.update(TENANT_ID, PROFILE_ID, dto);

      expect(mockPrisma.senProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            diagnosis_source: null,
          }),
        }),
      );
    });
  });

  describe('findOne — class scope with found profile', () => {
    it('should return and redact profile when class scope matches', async () => {
      mockScopeService.getUserScope.mockResolvedValue({
        scope: 'class',
        studentIds: [STUDENT_ID],
      });
      const mockProfile = createMockProfile();
      mockPrisma.senProfile.findFirst.mockResolvedValue(mockProfile);

      const result = await service.findOne(TENANT_ID, USER_ID, ['sen.view'], PROFILE_ID);

      expect(result.diagnosis).toBeNull();
      expect(result.assessment_notes).toBeNull();
    });
  });
});
